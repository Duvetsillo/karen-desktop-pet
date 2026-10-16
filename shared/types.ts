export const PET_STATES = [
  "IDLE",
  "LISTENING",
  "THINKING",
  "SPEAKING",
  "HAPPY",
  "CONFUSED",
  "ERROR",
  "SLEEPING",
  "DRAGGING",
] as const;
export type PetState = (typeof PET_STATES)[number];
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "action-required";
export interface Settings {
  scale: number;
  brightness: number;
  opacity: number;
  particles: boolean;
  accent: string;
  animations: boolean;
  cursorTracking: boolean;
  sleepAfter: number;
  activity: number;
  gatewayUrl: string;
  agentId: string;
  authSource: "local" | "stored";
  bubbles: boolean;
  voiceEnabled: boolean;
  ttsEngine: "system" | "local";
  inputDevice: string;
  outputDevice: string;
  volume: number;
  sensitivity: number;
  sttEnabled: boolean;
  voiceRoot: string;
  alwaysOnTop: boolean;
  autoStart: boolean;
  lowPower: boolean;
  nightMode: boolean;
}
export interface Diagnostic {
  time: number;
  level: "info" | "warn" | "error";
  area: string;
  message: string;
}
export interface ConnectionInfo {
  state: ConnectionState;
  message: string;
  version?: string;
  nextRetryMs?: number;
  scopes?: string[];
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}
export interface ImageAttachment {
  type: "image";
  mimeType: "image/jpeg" | "image/png";
  fileName: string;
  content: string;
}
export interface CaptureSource { id: string; name: string; }
export interface CaptureStatus {
  kind: "microphone" | "system" | "voice";
  phase: "idle" | "recording" | "transcribing" | "preparing" | "speaking";
  startedAt?: number;
}
export type DesktopEvent =
  | { type: "connection"; info: ConnectionInfo }
  | { type: "pet"; state: PetState; reason?: string }
  | { type: "chat"; message: ChatMessage; final: boolean; speak?: boolean }
  | { type: "diagnostic"; item: Diagnostic }
  | { type: "settings"; settings: Settings }
  | { type: "cursor"; x: number; y: number }
  | { type: "voice-cancel" }
  | { type: "voice-listen" }
  | { type: "voice-speak"; text: string }
  | { type: "capture"; status: CaptureStatus }
  | { type: "transcript"; text: string }
  | { type: "error"; message: string }
  | { type: "energy"; value: number }
  | { type: "wake" };
export interface Snapshot {
  settings: Settings;
  connection: ConnectionInfo;
  diagnostics: Diagnostic[];
  messages: ChatMessage[];
  hasCredential: boolean;
  native: boolean;
  runtime?: "desktop" | "server" | "preview";
  version: string;
  capture?: CaptureStatus;
}
export interface DesktopBridge {
  snapshot(): Promise<Snapshot>;
  settings(patch: Partial<Settings>): Promise<Settings>;
  credential(value: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(text: string, images?: ImageAttachment[]): Promise<void>;
  abort(): Promise<void>;
  openSettings(): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  contextMenu(): Promise<void>;
  hitTest(interactive: boolean): void;
  drag(action: "start" | "end"): void;
  synthesize(text: string): Promise<ArrayBuffer>;
  voiceHealth(): Promise<string>;
  transcribe(pcm: ArrayBuffer): Promise<string>;
  demo(state: PetState): Promise<void>;
  energy(value: number): void;
  listen(): Promise<void>;
  testVoice(): Promise<void>;
  chooseVoiceRoot(): Promise<string | null>;
  captureSources(): Promise<CaptureSource[]>;
  captureScreen(id: string): Promise<ImageAttachment>;
  systemAudio(action: "start" | "finish"): Promise<void>;
  captureStatus(status: CaptureStatus): void;
  event(callback: (event: DesktopEvent) => void): () => void;
}
