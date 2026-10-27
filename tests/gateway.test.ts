import { afterEach, describe, it, expect } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import {
  generateKeyPairSync,
  createHash,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { buildDeviceAuthPayloadV3 } from "@openclaw/gateway-client";
import { OpenClawAdapter } from "../electron/gateway";
import { defaults } from "../shared/settings";
import type { DesktopEvent } from "../shared/types";

const resources: { adapter: OpenClawAdapter; server: WebSocketServer }[] = [];
afterEach(async () => {
  for (const r of resources.splice(0)) {
    r.adapter.disconnect();
    for (const ws of r.server.clients) ws.terminate();
    await new Promise<void>((resolve) => r.server.close(() => resolve()));
  }
});
async function until(check: () => boolean, timeout = 4000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("Tiempo de espera agotado");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function setup() {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address === "string" || !address) throw new Error("Sin puerto");
  const keys = generateKeyPairSync("ed25519");
  const raw = keys.publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  const identity = {
    deviceId: createHash("sha256").update(raw).digest("hex"),
    publicKeyPem: keys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    privateKeyPem: keys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
  };
  const events: DesktopEvent[] = [];
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  let signatureValid = false;
  let stored = false;
  let socket: WebSocket | undefined;
  let selectedModel: string | null = null;
  let failModelPatch = false;
  let failAbort = false;
  let delayNextSend = false;
  let delayedSend: { id: string; payload: unknown } | undefined;
  const adapter = new OpenClawAdapter(
    {
      settings: { ...defaults, gatewayUrl: `ws://127.0.0.1:${address.port}` },
      credential: () => ({ token: "test-only-bootstrap" }),
      hostDeps: () => ({
        loadOrCreateDeviceIdentity: () => identity,
        signDevicePayload: (key, payload) =>
          sign(null, Buffer.from(payload), key).toString("base64url"),
        publicKeyRawBase64UrlFromPem: () => raw.toString("base64url"),
        storeDeviceAuthToken: () => {
          stored = true;
        },
      }),
    },
    (event) => events.push(event),
    () => {},
  );
  resources.push({ adapter, server });
  server.on("connection", (ws) => {
    socket = ws;
    const nonce = "test-challenge-" + Math.random(),
      ts = Date.now();
    ws.send(
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce, ts },
      }),
    );
    ws.on("message", (data) => {
      const req = JSON.parse(data.toString());
      requests.push(req);
      let payload: unknown = {};
      if (req.method === "connect") {
        const p = req.params;
        const proof = buildDeviceAuthPayloadV3({
          deviceId: p.device.id,
          clientId: p.client.id,
          clientMode: p.client.mode,
          role: p.role,
          scopes: p.scopes,
          signedAtMs: p.device.signedAt,
          token: p.auth.token,
          nonce: p.device.nonce,
          platform: p.client.platform,
          deviceFamily: p.client.deviceFamily,
        });
        signatureValid =
          p.device.nonce === nonce &&
          p.device.signedAt === ts &&
          verify(
            null,
            Buffer.from(proof),
            createPublicKey(identity.publicKeyPem),
            Buffer.from(p.device.signature, "base64url"),
          );
        payload = {
          type: "hello-ok",
          protocol: 4,
          server: { version: "test-fixture", connId: "test" },
          features: {
            methods: ["chat.send", "chat.history", "chat.abort"],
            events: ["chat", "agent"],
          },
          snapshot: {
            presence: [],
            health: {},
            stateVersion: { presence: 1, health: 1 },
            uptimeMs: 1,
          },
          policy: {
            maxPayload: 26214400,
            maxBufferedBytes: 52428800,
            tickIntervalMs: 15000,
          },
          auth: {
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            deviceToken: "test-only-device",
          },
        };
      }
      if (req.method === "chat.history") payload = { messages: [] };
      if (req.method === 'models.list') payload = {models: [
        {id:'test-small', name:'Small', provider:'local', available:true},
        {id:'test-large', name:'Large', provider:'cloud', available:true},
        {id:'locked', name:'Locked', provider:'cloud', available:false},
      ]};
      if (req.method === 'sessions.list') {
        const [modelProvider, model] = (selectedModel ?? 'local/test-small').split('/');
        payload = {defaults: {modelProvider:'local', model:'test-small'}, sessions: [{key:'agent:main:main', model, modelProvider, modelOverrideSource: selectedModel ? 'user' : null}]};
      }
      if (req.method === 'sessions.patch') {
        if (failModelPatch) {
          ws.send(JSON.stringify({type:'res', id:req.id, ok:false, error:{code:'UNAVAILABLE', message:'Provider unavailable'}}));
          return;
        }
        selectedModel = req.params.model;
        payload = {ok:true};
      }
      if (req.method === 'chat.abort' && failAbort) {
        ws.send(JSON.stringify({type:'res', id:req.id, ok:false, error:{code:'UNAVAILABLE', message:'Abort unavailable'}}));
        return;
      }
      if (req.method === "chat.send") {
        payload = { runId: req.params.idempotencyKey, status: "started" };
        if (delayNextSend) {
          delayNextSend = false;
          delayedSend = { id: req.id, payload };
          return;
        }
      }
      ws.send(JSON.stringify({ type: "res", id: req.id, ok: true, payload }));
    });
  });
  await adapter.connect();
  await until(() => adapter.info.state === "connected");
  return {
    adapter,
    events,
    requests,
    get signatureValid() {
      return signatureValid;
    },
    get stored() {
      return stored;
    },
    event: (event: string, payload: unknown) =>
      socket?.send(JSON.stringify({ type: "event", event, payload })),
    close: () => socket?.close(),
    failModelPatch: () => { failModelPatch = true; },
    failAbort: () => { failAbort = true; },
    delayNextSend: () => { delayNextSend = true; },
    releaseSend: () => {
      if (!delayedSend) throw new Error('No hay envío pendiente');
      socket?.send(JSON.stringify({ type: 'res', id: delayedSend.id, ok: true, payload: delayedSend.payload }));
      delayedSend = undefined;
    },
  };
}
describe("adaptador contra servidor de contrato WebSocket", () => {
  it('descarta historial recibido después de cambiar la conexión', async () => {
    const t = await setup();
    const client = t.adapter.client!;
    let release!: (value: { messages: unknown[] }) => void;
    Object.defineProperty(client, 'request', {
      value: () => new Promise(resolve => { release = resolve; }),
      configurable: true,
    });
    const pending = t.adapter.history();
    t.adapter.disconnect(false);
    release({ messages: [{ id: 'historial-viejo', role: 'assistant', content: 'Respuesta privada anterior' }] });
    await pending;
    expect(t.adapter.messages.some(m => m.id === 'historial-viejo')).toBe(false);
    expect(t.events.some(e => e.type === 'chat' && e.message.id === 'historial-viejo')).toBe(false);
  });

  it('no aplica un cambio de modelo cuando la conexión cambia tras leer el catálogo', async () => {
    const t = await setup();
    const selection = await t.adapter.models();
    const before = t.requests.filter(r => r.method === 'sessions.patch').length;
    const models = t.adapter.models.bind(t.adapter);
    t.adapter.models = async () => {
      t.adapter.disconnect(false);
      return selection;
    };
    await expect(t.adapter.selectModel('cloud/test-large')).rejects.toThrow('conexión cambió');
    expect(t.requests.filter(r => r.method === 'sessions.patch')).toHaveLength(before);
    t.adapter.models = models;
  });

  it('una confirmación tardía del envío cancelado no reemplaza el runId nuevo', async () => {
    const t = await setup();
    t.delayNextSend();
    const old = t.adapter.send('Primera orden');
    await until(() => t.requests.some(r => r.method === 'chat.send'));
    await t.adapter.abort();
    await t.adapter.send('Segunda orden');
    t.releaseSend();
    await old;
    await expect(t.adapter.send('Tercera orden')).rejects.toThrow('en curso');
    const second = t.requests.filter(r => r.method === 'chat.send')[1].params.idempotencyKey;
    t.event('chat', { sessionKey: 'agent:main:main', runId: second, state: 'final', deltaText: 'Actual' });
    await until(() => t.events.some(e => e.type === 'chat' && e.message.id === second && e.final));
    await expect(t.adapter.send('Tercera orden')).resolves.toBeUndefined();
  });

  it('ignora eventos tardíos de una respuesta cancelada sin liberar la nueva', async () => {
    const t = await setup();
    await t.adapter.send('Primera orden');
    const first = t.requests.find(r => r.method === 'chat.send')!.params.idempotencyKey;
    await t.adapter.abort();
    await t.adapter.send('Segunda orden');
    const second = t.requests.filter(r => r.method === 'chat.send')[1].params.idempotencyKey;
    t.event('chat', { sessionKey: 'agent:main:main', runId: 'otro-cliente', state: 'final', deltaText: 'Otra respuesta' });
    await until(() => t.events.some(e => e.type === 'chat' && e.message.id === 'otro-cliente'));
    t.event('chat', { sessionKey: 'agent:main:main', runId: first, state: 'final', deltaText: 'Respuesta obsoleta' });
    await new Promise(resolve => setTimeout(resolve, 30));
    await expect(t.adapter.send('Tercera orden')).rejects.toThrow('en curso');
    expect(t.events.some(e => e.type === 'chat' && e.message.id === first && e.message.role === 'assistant')).toBe(false);
    t.event('chat', { sessionKey: 'agent:main:main', runId: second, state: 'final', deltaText: 'Respuesta actual' });
    await until(() => t.events.some(e => e.type === 'chat' && e.message.id === second && e.final));
    await expect(t.adapter.send('Tercera orden')).resolves.toBeUndefined();
  });

  it('libera la captura local aunque OpenClaw rechace cancelar la respuesta anterior', async () => {
    const t = await setup();
    await t.adapter.send('Primera orden');
    t.failAbort();
    await expect(t.adapter.abort()).rejects.toThrow();
    await expect(t.adapter.send('Nueva orden hablada')).resolves.toBeUndefined();
    expect(t.requests.filter(r => r.method === 'chat.send')).toHaveLength(2);
  });
  it('consulta catálogo autenticado y cambia solo el modelo de la sesión', async () => {
    const t = await setup();
    expect((await t.adapter.models()).effective).toBe('local/test-small');
    const chosen = await t.adapter.selectModel('cloud/test-large');
    expect(chosen.selected).toBe('cloud/test-large');
    expect(chosen.effective).toBe('cloud/test-large');
    expect(t.requests.find(r => r.method === 'sessions.patch')?.params).toEqual({key:'agent:main:main', model:'cloud/test-large'});
    expect((await t.adapter.selectModel(null)).selected).toBeNull();
    expect(t.requests.some(r => r.method.startsWith('config.'))).toBe(false);
    expect(t.events.some(e => e.type === 'models')).toBe(true);
  });
  it('rechaza modelos ajenos, no disponibles y cambios durante una respuesta', async () => {
    const t = await setup();
    await expect(t.adapter.selectModel('invented/model')).rejects.toThrow('catálogo');
    await expect(t.adapter.selectModel('cloud/locked')).rejects.toThrow('catálogo');
    await expect(t.adapter.selectModel({model:'cloud/test-large'})).rejects.toThrow('inválido');
    await t.adapter.send('Test');
    await expect(t.adapter.selectModel('cloud/test-large')).rejects.toThrow('termine');
    expect(t.requests.some(r => r.method === 'sessions.patch')).toBe(false);
  });
  it('mantiene el modelo confirmado cuando el Gateway rechaza el cambio', async () => {
    const t = await setup(); t.failModelPatch();
    await expect(t.adapter.selectModel('cloud/test-large')).rejects.toThrow('Provider unavailable');
    expect((await t.adapter.models()).effective).toBe('local/test-small');
    t.adapter.disconnect();
    await expect(t.adapter.models()).rejects.toThrow('Conecta');
  });
  it("envía capturas como adjuntos reales del protocolo", async () => {
    const t = await setup();
    await t.adapter.send("Describe esta imagen", [{ type: "image", mimeType: "image/png", fileName: "capture.png", content: "c3ludGhldGlj" }]);
    expect(t.requests.find(request => request.method === "chat.send")?.params.attachments).toEqual([{ type: "image", mimeType: "image/png", fileName: "karen-screen.png", content: "c3ludGhldGlj" }]);
  });
  it("firma el reto, autentica y conserva permisos de conversación", async () => {
    const t = await setup();
    expect(t.signatureValid).toBe(true);
    expect(t.stored).toBe(true);
    const connect = t.requests.find((r) => r.method === "connect")!;
    expect(connect.params.scopes).toEqual(["operator.read", "operator.write"]);
    expect(connect.params.caps).toEqual(["tool-events"]);
    expect(connect.params.minProtocol).toBe(4);
    expect(connect.params.maxProtocol).toBe(4);
  });
  it("envía a main, impide duplicados y recibe herramientas y respuesta", async () => {
    const t = await setup();
    await t.adapter.send("Hola Karen");
    await expect(t.adapter.send("Otra orden")).rejects.toThrow("en curso");
    const send = t.requests.find((r) => r.method === "chat.send")!;
    expect(send.params.sessionKey).toBe("agent:main:main");
    expect(send.params.message).toBe("Hola Karen");
    expect(send.params.idempotencyKey).toBeTypeOf("string");
    t.event("agent", {
      runId: send.params.idempotencyKey,
      seq: 1,
      ts: Date.now(),
      stream: "tool",
      data: { phase: "start", name: "read" },
    });
    t.event("chat", {
      sessionKey: "agent:main:main",
      runId: send.params.idempotencyKey,
      seq: 1,
      state: "delta",
      deltaText: "Respuesta de ",
    });
    t.event("chat", {
      sessionKey: "agent:main:main",
      runId: send.params.idempotencyKey,
      seq: 2,
      state: "delta",
      deltaText: "contrato",
    });
    t.event("chat", {
      sessionKey: "agent:main:main",
      runId: send.params.idempotencyKey,
      seq: 3,
      state: "final",
    });
    await until(() => t.events.some((e) => e.type === "chat" && e.final));
    expect(t.adapter.messages.at(-1)?.text).toBe("Respuesta de contrato");
    expect(
      t.adapter.messages.some(
        (message) => message.role === "user" && message.text === "Hola Karen",
      ),
    ).toBe(true);
    await t.adapter.send("Segunda orden");
    await t.adapter.abort();
    expect(t.requests.at(-1)?.method).toBe("chat.abort");
  });
  it("reporta una caída y reconecta con el cliente oficial", async () => {
    const t = await setup();
    t.close();
    await until(() => t.adapter.info.state === "reconnecting");
    await until(() => t.adapter.info.state === "connected", 4500);
    expect(t.requests.filter((r) => r.method === "connect").length).toBe(2);
  });
});
