import { create } from "zustand";
import type {
  ChatMessage,
  ConnectionInfo,
  DesktopEvent,
  Diagnostic,
  PetState,
  Settings,
  CaptureStatus,
  WakeStatus,
  ModelSelection,
} from "../../shared/types";
import { defaults } from "../../shared/settings";
import { PetMachine } from "./machine";
import { expressionForReply } from "../../shared/expression";
export const machine = new PetMachine();
export const signals: {
  energy: number;
  cursor: { x: number; y: number };
  fps: number;
  hitTest?: (x: number, y: number) => boolean;
} = { energy: 0, cursor: { x: 0.5, y: 0.5 }, fps: 0 };
interface Store {
  models?: ModelSelection;
  settings: Settings;
  connection: ConnectionInfo;
  state: PetState;
  reason: string;
  expression: PetState;
  diagnostics: Diagnostic[];
  messages: ChatMessage[];
  native: boolean;
  runtime: "desktop" | "server" | "preview";
  hasCredential: boolean;
  ready: boolean;
  error: string;
  tab: string;
  capture: CaptureStatus;
  transcript: string;
  wakeStatus: WakeStatus;
  transition: (state: PetState, reason?: string) => void;
  event: (event: DesktopEvent) => void;
}
export const useStore = create<Store>((set, get) => ({
  settings: defaults,
  connection: { state: "disconnected", message: "Esperando conexión" },
  state: "IDLE",
  reason: "",
  expression: "HAPPY",
  diagnostics: [],
  messages: [],
  native: false,
  runtime: "preview",
  hasCredential: false,
  ready: false,
  error: "",
  tab: "Conversación",
  capture: { kind: "microphone", phase: "idle" },
  transcript: "",
  wakeStatus: 'off',
  transition: (state, reason = "") => {
    machine.transition(state);
    set({ state, reason });
  },
  event: (event) => {
    if (event.type === 'models') set({models:event.selection});
    else if (event.type === 'wake-status') set({wakeStatus:event.status});
    else if (event.type === "settings") set({ settings: event.settings });
    else if (event.type === "capture") set({ capture: event.status });
    else if (event.type === "transcript") set({ transcript: event.text, tab: "Percepción" });
    else if (event.type === "error") set({ error: event.message });
    else if (event.type === "connection") set({ connection: event.info });
    else if (event.type === "pet") {
      const capture = get().capture;
      // Gateway completion/tool events cannot replace the real playback state.
      if (capture.kind !== "voice" || capture.phase === "idle") get().transition(event.state, event.reason);
    }
    else if (event.type === "wake") get().transition("HAPPY", "Despertando");
    else if (event.type === "diagnostic")
      set((s) => ({ diagnostics: [...s.diagnostics.slice(-119), event.item] }));
    else if (event.type === "cursor")
      signals.cursor = { x: event.x, y: event.y };
    else if (event.type === "energy") signals.energy = event.value;
    else if (event.type === "chat")
      set((s) => {
        const messages = [...s.messages];
        const i = messages.findIndex((m) => m.id === event.message.id);
        if (i >= 0) messages[i] = event.message;
        else messages.push(event.message);
        return { messages: messages.slice(-100), ...(event.final && event.message.role === 'assistant' && event.message.text ? { expression: expressionForReply(event.message.text) } : {}) };
      });
  },
}));
export function report(error: unknown) {
  useStore.setState({
    error:
      error instanceof Error
        ? error.message
        : "No se pudo completar la operación.",
  });
}
