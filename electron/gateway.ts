import { GatewayClient } from "@openclaw/gateway-client";
import type { GatewayClientHostDeps } from "@openclaw/gateway-client";
import { randomUUID } from "node:crypto";
import { APP_VERSION } from "../shared/version.js";
import type {
  ChatMessage,
  ConnectionInfo,
  DesktopEvent,
  Settings,
  ImageAttachment,
  ModelOption,
  ModelSelection,
} from "../shared/types.js";
import { validateImages } from "../shared/attachments.js";
import {
  extractText,
  routeGatewayEvent,
  nextChatText,
} from "../shared/protocol.js";

export interface GatewayStorage {
  settings: Settings;
  credential(): { token?: string; password?: string };
  hostDeps(): GatewayClientHostDeps;
}
export class OpenClawAdapter {
  client?: GatewayClient;
  info: ConnectionInfo = { state: "disconnected", message: "Sin conexión" };
  messages: ChatMessage[] = [];
  private epoch = 0;
  private stopped = true;
  private runId?: string;
  private watchdog?: ReturnType<typeof setTimeout>;
  private accepted = false;
  private pending = false;
  private modelChanging = false;
  private knownRuns = new Set<string>();
  private retiredRuns = new Set<string>();
  private rawText = new Map<string, string>();
  constructor(
    private storage: GatewayStorage,
    private emit: (event: DesktopEvent) => void,
    private log: (
      level: "info" | "warn" | "error",
      area: string,
      message: string,
    ) => void,
  ) {}
  get sessionKey() {
    return `agent:${this.storage.settings.agentId}:main`;
  }
  private status(info: ConnectionInfo) {
    this.info = info;
    this.emit({ type: "connection", info });
  }
  /** Official protocol v4: catalog read + session-only model override. */
  async models(): Promise<ModelSelection> {
    if (this.info.state !== 'connected' || !this.client)
      throw new Error('Conecta OpenClaw para consultar los modelos.');
    const client = this.client, epoch = this.epoch, sessionKey = this.sessionKey;
    const [catalog, sessions] = await Promise.all([
      client.request<{ models: { id: string; name: string; provider: string; available?: boolean }[] }>('models.list', {agentId: this.storage.settings.agentId, view: 'configured'}),
      client.request<{ sessions: {key: string; model?: string; modelProvider?: string; modelOverrideSource?: string; modelOverride?: string; providerOverride?: string; hasActiveRun?: boolean}[]; defaults?: { model?: string; modelProvider?: string } }>('sessions.list', {search: sessionKey, limit: 50}),
    ]);
    if (epoch !== this.epoch || client !== this.client || this.info.state !== 'connected')
      throw new Error('La conexión cambió. Actualiza los modelos.');
    if (!Array.isArray(catalog.models) || !Array.isArray(sessions.sessions))
      throw new Error('El Gateway no devolvió un catálogo compatible.');
    const canonical = (provider?: string, id?: string) => id ? (provider && !id.startsWith(provider + '/') ? `${provider}/${id}` : id) : null;
    const models: ModelOption[] = catalog.models
      .filter(m => typeof m.id === 'string' && typeof m.provider === 'string' && typeof m.name === 'string')
      .map(m => ({id: canonical(m.provider, m.id)!, name: m.name, provider: m.provider, available: m.available !== false}));
    const row = sessions.sessions.find(s => s.key === sessionKey);
    const effective = canonical(row?.modelProvider, row?.model) ?? canonical(sessions.defaults?.modelProvider, sessions.defaults?.model);
    const selected = row?.modelOverrideSource === 'user' || row?.modelOverride || row?.providerOverride ? effective : null;
    const selection = {sessionKey, effective, selected, models, busy: row?.hasActiveRun === true};
    this.emit({type: 'models', selection});
    return selection;
  }
  async selectModel(model: unknown): Promise<ModelSelection> {
    if (model !== null && (typeof model !== 'string' || model.length > 512))
      throw new Error('Modelo inválido.');
    if (this.pending || this.modelChanging)
      throw new Error('Espera a que termine la respuesta o el cambio actual.');
    this.modelChanging = true;
    try {
      const selection = await this.models();
      if (selection.busy) throw new Error('La sesión tiene una tarea activa. Espera a que termine.');
      if (model !== null && !selection.models.some(m => m.id === model && m.available))
        throw new Error('Elige un modelo disponible del catálogo de OpenClaw.');
      await this.client!.request('sessions.patch', {key: selection.sessionKey, model});
      this.log('info', 'OpenClaw', 'Modelo de la sesión actualizado; configuración global conservada.');
      return await this.models();
    } finally { this.modelChanging = false; }
  }
  async connect() {
    this.disconnect(false);
    this.stopped = false;
    const epoch = ++this.epoch;
    this.status({ state: "connecting", message: "Conectando con OpenClaw…" });
    let auth: { token?: string; password?: string };
    try {
      auth = this.storage.credential();
    } catch (e) {
      this.status({
        state: "action-required",
        message:
          "No se pudo leer la autenticación local. Revisa OpenClaw en Ajustes.",
      });
      this.log(
        "error",
        "OpenClaw",
        e instanceof Error ? e.message : "Credencial no disponible",
      );
      return;
    }
    const current = () => epoch === this.epoch && !this.stopped;
    this.client = new GatewayClient({
      url: this.storage.settings.gatewayUrl,
      ...auth,
      hostDeps: this.storage.hostDeps(),
      clientName: "webchat",
      clientDisplayName: "Karen Desktop Pet",
      clientVersion: APP_VERSION,
      platform: process.platform,
      mode: "ui",
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      caps: ["tool-events"],
      minProtocol: 4,
      maxProtocol: 4,
      requestTimeoutMs: 30000,
      connectChallengeTimeoutMs: 10000,
      notifyOnStartupRetry: true,
      onHelloOk: (hello) => {
        if (!current()) return;
        this.status({
          state: "connected",
          message: "Conectada a OpenClaw",
          version: hello.server.version,
          scopes: hello.auth.scopes,
        });
        this.log(
          "info",
          "OpenClaw",
          `Conexión autenticada. Gateway ${hello.server.version}; protocolo ${hello.protocol}.`,
        );
        this.emit({
          type: "pet",
          state: "HAPPY",
          reason: "Conexión autenticada",
        });
        void this.history();
      },
      onEvent: (event) => {
        if (!current()) return;
        const payload = event.payload as
          | { sessionKey?: string; state?: string }
          | undefined;
        const run = (event.payload as { runId?: string } | undefined)?.runId;
        if (run && this.retiredRuns.has(run)) return;
        if (
          event.event === "chat" &&
          payload?.sessionKey === this.sessionKey &&
          run
        ) {
          this.knownRuns.add(run);
          if (this.knownRuns.size > 100)
            this.knownRuns.delete(this.knownRuns.values().next().value!);
        }
        if (
          event.event === "chat" &&
          payload?.sessionKey === this.sessionKey &&
          ["final", "error", "aborted"].includes(payload.state || "")
        )
          if (run && run === this.runId) this.finishRun();
        const previous = run ? this.rawText.get(run) || "" : "";
        if (
          event.event === "chat" &&
          payload?.sessionKey === this.sessionKey &&
          run
        ) {
          this.rawText.set(run, nextChatText(event.payload, previous));
          if (this.rawText.size > 50)
            this.rawText.delete(this.rawText.keys().next().value!);
        }
        const events = routeGatewayEvent(
          event.event,
          event.payload,
          this.sessionKey,
          this.knownRuns,
          previous,
        );
        for (const mapped of events) {
          if (mapped.type === "chat") {
            this.upsert(mapped.message);
            if (mapped.final && run && run === this.runId) this.finishRun();
          }
          this.emit(mapped);
        }
      },
      onConnectError: (err) => {
        if (!current()) return;
        const e = err as Error & {
          code?: string;
          details?: { code?: string; requestId?: string };
        };
        const code = e.details?.code || e.code || "CONNECTION_FAILED";
        const request = e.details?.requestId;
        this.log(
          "error",
          "OpenClaw",
          `${code}${request ? ` · solicitud de vinculación ${request}` : ""}: ${e.message}`,
        );
      },
      onReconnectPaused: (info) => {
        if (!current()) return;
        this.status({
          state: "action-required",
          message: `OpenClaw requiere atención: ${info.detailCode || "autenticación o vinculación"}. Consulta Diagnóstico.`,
        });
      },
      onClose: () => {
        if (!current() || this.info.state === "action-required") return;
        this.finishRun();
        this.emit({ type: "voice-cancel" });
        this.status({
          state: "reconnecting",
          message:
            "Gateway no disponible. Reintentando automáticamente (1–30 s).",
        });
        this.emit({
          type: "pet",
          state: "CONFUSED",
          reason: "Conexión interrumpida",
        });
      },
      onGap: () => {
        if (current()) {
          this.log(
            "warn",
            "OpenClaw",
            "Se detectó un salto de eventos; recuperando historial.",
          );
          void this.history();
        }
      },
    });
    this.client.start();
  }
  private upsert(message: ChatMessage) {
    const i = this.messages.findIndex((m) => m.id === message.id);
    if (i >= 0) this.messages[i] = message;
    else this.messages.push(message);
    this.messages = this.messages.slice(-100);
  }
  async history() {
    try {
      const data = await this.client?.request<{ messages?: unknown[] }>(
        "chat.history",
        { sessionKey: this.sessionKey, limit: 40 },
      );
      for (const [i, item] of (data?.messages ?? []).entries()) {
        const m = item as { role?: string; id?: string; content?: unknown };
        if (!["user", "assistant"].includes(m.role ?? "")) continue;
        const text = extractText(m);
        if (!text) continue;
        const message: ChatMessage = {
          id: m.id || `history-${i}`,
          role: m.role as "user" | "assistant",
          text,
        };
        this.upsert(message);
        this.emit({ type: "chat", message, final: false });
      }
    } catch {
      this.log(
        "warn",
        "OpenClaw",
        "No se pudo recuperar el historial de esta sesión.",
      );
    }
  }
  async send(text: string, attachments?: ImageAttachment[]) {
    const images = validateImages(attachments);
    text = text.trim();
    if (!text || text.length > 16000)
      throw new Error("Escribe un mensaje de hasta 16.000 caracteres.");
    if (this.info.state !== "connected" || !this.client)
      throw new Error("Conecta OpenClaw antes de enviar.");
    if (this.pending || this.modelChanging)
      throw new Error(
        "Hay una respuesta en curso. Puedes detenerla antes de enviar otra orden.",
      );
    this.pending = true;
    this.accepted = false;
    const id = randomUUID();
    this.runId = id;
    this.knownRuns.add(id);
    const message: ChatMessage = { id: `user:${id}`, role: "user", text };
    this.upsert(message);
    this.emit({ type: "chat", message, final: false });
    this.emit({ type: "pet", state: "THINKING" });
    this.watchdog = setTimeout(() => {
      this.log(
        "warn",
        "OpenClaw",
        "La respuesta sigue pendiente. Puedes detenerla desde Conversación.",
      );
    }, 120000);
    try {
      const result = await this.client.request<{ runId?: string }>(
        "chat.send",
        { sessionKey: this.sessionKey, message: text, idempotencyKey: id, ...(images.length ? { attachments: images } : {}) },
      );
      if (this.runId !== id) {
        if (result.runId) this.retireRun(result.runId);
        return;
      }
      this.accepted = true;
      this.runId = result.runId || id;
      this.knownRuns.add(this.runId);
    } catch {
      if (this.runId !== id) return;
      this.finishRun();
      this.emit({ type: "pet", state: "ERROR" });
      throw new Error(
        "No se confirmó el envío. Revisa el historial antes de repetir la orden.",
      );
    }
  }
  async abort() {
    this.emit({ type: "voice-cancel" });
    const run = this.runId;
    if (run) this.retireRun(run);
    try {
      if (this.client && this.info.state === "connected" && this.pending) {
        await this.client.request("chat.abort", {
          sessionKey: this.sessionKey,
          ...(this.accepted && this.runId ? { runId: this.runId } : {}),
        });
      }
    } finally {
      if (this.runId === run) {
        this.finishRun();
        this.emit({ type: "pet", state: "IDLE" });
      }
    }
  }
  private retireRun(run: string) {
    this.retiredRuns.add(run);
    if (this.retiredRuns.size > 100)
      this.retiredRuns.delete(this.retiredRuns.values().next().value!);
  }
  private finishRun() {
    clearTimeout(this.watchdog);
    this.pending = false;
    this.accepted = false;
    this.runId = undefined;
  }
  disconnect(report = true) {
    this.stopped = true;
    this.epoch++;
    this.client?.stop();
    this.client = undefined;
    this.finishRun();
    if (report)
      this.status({
        state: "disconnected",
        message: "Desconectada por el usuario",
      });
  }
}
