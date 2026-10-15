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
      if (req.method === "chat.send")
        payload = { runId: req.params.idempotencyKey, status: "started" };
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
  };
}
describe("adaptador contra servidor de contrato WebSocket", () => {
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
