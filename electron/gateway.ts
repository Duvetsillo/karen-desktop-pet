import { GatewayClient } from "@openclaw/gateway-client";
import type { GatewayClientHostDeps } from "@openclaw/gateway-client";
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ConnectionInfo,
  DesktopEvent,
  Settings,
} from "../shared/types.js";
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
  private knownRuns = new Set<string>();
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
      clientVersion: "1.0.0",
      platform: "win32",
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
          this.finishRun();
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
            if (mapped.final) this.finishRun();
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
  async send(text: string) {
    text = text.trim();
    if (!text || text.length > 16000)
      throw new Error("Escribe un mensaje de hasta 16.000 caracteres.");
    if (this.info.state !== "connected" || !this.client)
      throw new Error("Conecta OpenClaw antes de enviar.");
    if (this.pending)
      throw new Error(
        "Hay una respuesta en curso. Puedes detenerla antes de enviar otra orden.",
      );
    this.pending = true;
    this.accepted = false;
    const id = randomUUID();
    this.runId = id;
    this.knownRuns.add(id);
    const message: ChatMessage = { id, role: "user", text };
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
        { sessionKey: this.sessionKey, message: text, idempotencyKey: id },
      );
      this.accepted = true;
      this.runId = result.runId || id;
      this.knownRuns.add(this.runId);
    } catch {
      this.finishRun();
      this.emit({ type: "pet", state: "ERROR" });
      throw new Error(
        "No se confirmó el envío. Revisa el historial antes de repetir la orden.",
      );
    }
  }
  async abort() {
    this.emit({ type: "voice-cancel" });
    if (this.client && this.info.state === "connected" && this.pending) {
      await this.client.request("chat.abort", {
        sessionKey: this.sessionKey,
        ...(this.accepted && this.runId ? { runId: this.runId } : {}),
      });
    }
    this.finishRun();
    this.emit({ type: "pet", state: "IDLE" });
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
