import type { DesktopBridge, Snapshot } from "../shared/types";
import { defaults } from "../shared/settings";
declare global {
  interface Window {
    karen?: DesktopBridge;
  }
}
const unavailable = async () => {
  throw new Error("Esta función necesita la aplicación de Windows.");
};
const preview: DesktopBridge = {
  snapshot: async (): Promise<Snapshot> => ({
    settings: defaults,
    connection: {
      state: "disconnected",
      message: "Vista de navegador · sin conexión nativa",
    },
    diagnostics: [],
    messages: [],
    hasCredential: false,
    native: false,
    version: "1.0.0",
  }),
  settings: async (patch) => ({ ...defaults, ...patch }),
  credential: unavailable,
  connect: unavailable,
  disconnect: unavailable,
  send: unavailable,
  abort: unavailable,
  openSettings: async () => {
    location.search = "?view=settings";
  },
  hide: unavailable,
  show: unavailable,
  contextMenu: unavailable,
  hitTest: () => {},
  drag: () => {},
  synthesize: unavailable,
  transcribe: unavailable,
  voiceHealth: async () => "Diagnóstico disponible en Windows.",
  event: () => () => {},
  demo: async () => {},
  energy: () => {},
  listen: unavailable,
};
export const bridge = window.karen ?? preview;
