import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen,
  globalShortcut,
  session,
  powerMonitor,
  dialog,
} from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "./storage.js";
import { OpenClawAdapter } from "./gateway.js";
import { NativeVoice } from "./voice.js";
import { petBounds } from "../shared/pet-layout.js";
import { ScreenCapture } from "./capture.js";
import { LoopbackRecorder } from "./loopback.js";
import {
  PET_STATES,
  type DesktopEvent,
  type Diagnostic,
  type Settings,
  type Snapshot,
  type CaptureStatus,
  type WakeStatus,
} from "../shared/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const qa = process.argv.includes("--qa");
if (qa) app.setPath("userData", resolve(".qa-profile"));
let pet: BrowserWindow | undefined,
  panel: BrowserWindow | undefined,
  tray: Tray | undefined;
let storage: Storage, gateway: OpenClawAdapter, voice: NativeVoice;
let quitting = false,
  clickThrough = false,
  dragging = false,
  dragOffset = { x: 0, y: 0 };
let cursorTimer: ReturnType<typeof setInterval>,
  saveTimer: ReturnType<typeof setTimeout>;
const diagnostics: Diagnostic[] = [];
const screenCapture = new ScreenCapture();
let capture: CaptureStatus = { kind: "microphone", phase: "idle" };
let wakeStatus: WakeStatus = 'off';
let loopback: LoopbackRecorder;
let captureOwner: number | undefined;
let perceptionEpoch = 0;
function stopPerception() {
  perceptionEpoch++;
  loopback?.cancel();
  voice?.cancel();
  captureOwner = undefined;
  capture = { kind: capture.kind, phase: "idle" };
  emit({ type: "voice-cancel" });
  emit({ type: "capture", status: capture });
}
function hidePet() { stopPerception(); pet?.hide(); }
const boundsPath = () => join(app.getPath("userData"), "window.json");
function emit(event: DesktopEvent) {
  for (const w of [pet, panel])
    if (w && !w.isDestroyed()) w.webContents.send("desktop-event", event);
}
function log(level: Diagnostic["level"], area: string, message: string) {
  const auth = (() => {
    try {
      return storage?.credential();
    } catch {
      return {};
    }
  })();
  for (const secret of [auth.token, auth.password])
    if (secret) message = message.split(secret).join("[oculto]");
  message = message
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[oculto]")
    .replace(
      /(token|password|secret|privateKey)\s*[:=]\s*["']?[^\s,"']+/gi,
      "$1=[oculto]",
    );
  const item: Diagnostic = {
    time: Date.now(),
    level,
    area,
    message: message.slice(0, 1600),
  };
  diagnostics.push(item);
  if (diagnostics.length > 120) diagnostics.shift();
  emit({ type: "diagnostic", item });
}
function loadWindow(w: BrowserWindow, view: string) {
  return w.loadFile(join(here, "../../dist/index.html"), { query: { view } });
}
function prefs() {
  return {
    preload: join(here, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: true,
    spellcheck: false,
  };
}
function clampBounds(value: Electron.Rectangle): Electron.Rectangle {
  const display = screen.getDisplayMatching(value).workArea;
  const width = Math.min(value.width, display.width),
    height = Math.min(value.height, display.height);
  return {
    width,
    height,
    x: Math.round(
      Math.min(display.x + display.width - width, Math.max(display.x, value.x)),
    ),
    y: Math.round(
      Math.min(
        display.y + display.height - height,
        Math.max(display.y, value.y),
      ),
    ),
  };
}
function resizePet() {
  if (!pet) return;
  const old = pet.getBounds();
  const s = storage.settings.scale;
  pet.setBounds(petBounds(s, old, screen.getDisplayMatching(old).workArea));
}
function recover() {
  clickThrough = false;
  pet?.setIgnoreMouseEvents(false);
  pet?.show();
  if (pet) pet.setBounds(clampBounds(pet.getBounds()));
  emit({ type: "wake" });
}
function openSettings() {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }
  panel = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 820,
    minHeight: 620,
    title: "Karen · Ajustes",
    backgroundMaterial: "acrylic",
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    icon: join(here, "../../assets/karen.png"),
    webPreferences: prefs(),
  });
  protect(panel);
  void loadWindow(panel, "settings");
  panel.on("closed", () => {
    if (capture.kind === "system") stopPerception();
    panel = undefined;
  });
}
function contextMenu() {
  Menu.buildFromTemplate([
    { label: "Conversar y ajustar Karen", click: openSettings },
    { label: "Detener voz y captura", click: stopPerception },
    { label: "Despertar / recuperar control · Ctrl+Alt+K", click: recover },
    { type: "separator" },
    {
      label: "Ignorar todos los clics",
      type: "checkbox",
      checked: clickThrough,
      click: (item) => {
        clickThrough = item.checked;
        pet?.setIgnoreMouseEvents(clickThrough, { forward: true });
      },
    },
    {
      label: "Siempre visible",
      type: "checkbox",
      checked: storage.settings.alwaysOnTop,
      click: (item) => {
        updateSettings({ alwaysOnTop: item.checked });
      },
    },
    {
      label: "Bajo consumo",
      type: "checkbox",
      checked: storage.settings.lowPower,
      click: (item) => {
        updateSettings({ lowPower: item.checked });
      },
    },
    { label: "Ocultar en la bandeja", click: hidePet },
    { type: "separator" },
    {
      label: "Salir de Karen",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]).popup();
}
function protect(w: BrowserWindow) {
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("render-process-gone", (_e, details) =>
    log(
      "error",
      "Windows",
      `El renderizador se detuvo: ${details.reason}. Reinicia Karen desde su acceso directo.`,
    ),
  );
}
function updateSettings(patch: Partial<Settings>) {
  const before = storage.settings;
  const saved = storage.saveSettings(patch);
  if ((before.sttEnabled && !saved.sttEnabled) || before.voiceRoot !== saved.voiceRoot) stopPerception();
  pet?.setAlwaysOnTop(saved.alwaysOnTop, "floating");
  pet?.setOpacity(1);
  resizePet();
  if (before.autoStart !== saved.autoStart && !qa)
    app.setLoginItemSettings({
      openAtLogin: saved.autoStart,
      path: app.getPath("exe"),
    });
  emit({ type: "settings", settings: saved });
  if (
    before.gatewayUrl !== saved.gatewayUrl ||
    before.agentId !== saved.agentId ||
    before.authSource !== saved.authSource
  ) {
    voice.cancel();
    gateway.disconnect();
    void gateway.connect();
  }
  if (!saved.voiceEnabled) {
    voice.cancel();
    emit({ type: "voice-cancel" });
  }
  return saved;
}
function handle(name: string, callback: (...args: unknown[]) => unknown) {
  ipcMain.handle(name, (event, ...args: unknown[]) => {
    if (
      ![pet?.webContents.id, panel?.webContents.id].includes(event.sender.id) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error("Origen no autorizado.");
    return callback(...args);
  });
}
async function ready() {
  try {
    storage = new Storage(app.getPath("userData"));
  } catch {
    app.quit();
    throw new Error(
      "No se pudieron abrir los ajustes o el almacén seguro de Karen.",
    );
  }
  voice = new NativeVoice(
    process.env.KAREN_PROJECT_ROOT || join(app.getPath("userData"), "voice"),
    () => storage.settings,
    app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked/python/recognize.py") : join(here, "../../python/recognize.py"),
    app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked/python/shared_voice_service.py") : join(here, "../../python/shared_voice_service.py"),
  );
  loopback = new LoopbackRecorder(
    () => storage.settings.voiceRoot || process.env.KAREN_PROJECT_ROOT || join(app.getPath("userData"), "voice"),
    app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked/python/loopback.py") : join(here, "../../python/loopback.py"),
    value => emit({ type: "energy", value }),
  );
  gateway = new OpenClawAdapter(storage, emit, log);
  const area = screen.getPrimaryDisplay().workArea;
  let bounds = {
    x: area.x + area.width - 410,
    y: area.y + area.height - 480,
    width: 380,
    height: 440,
  };
  try {
    bounds = clampBounds({
      ...bounds,
      ...JSON.parse(readFileSync(boundsPath(), "utf8")),
    });
  } catch {}
  bounds = petBounds(storage.settings.scale, bounds, screen.getDisplayMatching(bounds).workArea);
  pet = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: storage.settings.alwaysOnTop,
    show: false,
    backgroundColor: "#00000000",
    title: "Karen Desktop Pet",
    webPreferences: prefs(),
  });
  pet.setMenuBarVisibility(false);
  protect(pet);
  pet.once("ready-to-show", () => pet?.showInactive());
  void loadWindow(pet, "pet");
  pet.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      hidePet();
    }
  });
  pet.on("moved", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (pet && !pet.isDestroyed())
        writeFileSync(boundsPath(), JSON.stringify(pet.getBounds()));
    }, 400);
  });
  const icon = nativeImage
    .createFromPath(join(here, "../../assets/karen.png"))
    .resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip("Karen · Ctrl+Alt+K para recuperar control");
  tray.on("click", recover);
  tray.on("double-click", openSettings);
  tray.on("right-click", contextMenu);
  if (!globalShortcut.register("CommandOrControl+Alt+K", recover))
    log(
      "warn",
      "Windows",
      "Ctrl+Alt+K está ocupado. Usa el icono de bandeja para recuperar a Karen.",
    );
  screen.on("display-removed", () => {
    if (pet) pet.setBounds(clampBounds(pet.getBounds()));
  });
  screen.on("display-metrics-changed", () => {
    if (pet) pet.setBounds(clampBounds(pet.getBounds()));
  });
  powerMonitor.on("suspend", () => {
    stopPerception();
    gateway.disconnect();
  });
  powerMonitor.on("lock-screen", stopPerception);
  powerMonitor.on("resume", () => {
    void gateway.connect();
    emit({ type: "wake" });
  });
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) =>
      callback(
        [pet?.webContents.id, panel?.webContents.id].includes(contents.id) &&
          (permission === "speaker-selection" || (permission === "media" &&
          "mediaTypes" in details &&
          Boolean(
            details.mediaTypes?.length &&
              details.mediaTypes?.every((type) => type === "audio"),
          ))),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      Boolean(contents && [pet?.webContents.id, panel?.webContents.id].includes(contents.id)) &&
      (permission === "speaker-selection" || (permission === "media" && details.mediaType === "audio")),
  );
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback(null as never));
  handle(
    "snapshot",
    (): Snapshot => ({
      settings: storage.settings,
      connection: gateway.info,
      diagnostics: [...diagnostics],
      messages: gateway.messages,
      hasCredential: storage.hasCredential(),
      native: true,
      version: app.getVersion(),
      capture,
      wakeStatus,
    }),
  );
  handle("settings", (patch) => {
    if (!patch || typeof patch !== "object")
      throw new Error("Ajustes inválidos.");
    return updateSettings(patch as Partial<Settings>);
  });
  handle("credential", (value) => {
    if (typeof value !== "string") throw new Error("Credencial inválida.");
    storage.setCredential(value);
  });
  handle("connect", () => gateway.connect());
  handle("disconnect", () => gateway.disconnect());
  handle("send", (value, images) => {
    if (typeof value !== "string") throw new Error("Mensaje inválido.");
    void voice.prepare().catch(() => {});
    return gateway.send(value, images as never);
  });
  handle("abort", () => {
    // Stop the current reply/capture without changing the user's wake preference.
    // Continuous listening has its own explicit pause control.
    stopPerception();
    return gateway.abort();
  });
  handle("listen", () => {
    if (!storage.settings.sttEnabled)
      throw new Error("Activa el reconocimiento local en Voz.");
    if (capture.kind === "system" && capture.phase !== "idle") throw new Error("Finaliza primero el audio del PC.");
    voice.cancel();
    pet?.webContents.send("desktop-event", { type: "voice-listen" });
  });
  handle("test-voice", () => {
    if (!storage.settings.voiceEnabled) throw new Error("Activa Leer las respuestas primero.");
    if (capture.kind === "system" && capture.phase !== "idle") throw new Error("Finaliza el audio del PC antes de reproducir la voz de Karen.");
    pet?.webContents.send("desktop-event", { type: "voice-speak", text: "Hola. Soy Karen. Ya puedo hablar contigo." });
  });
  handle("choose-voice-root", async () => {
    const result = await dialog.showOpenDialog({ title: "Carpeta de recursos de voz", properties: ["openDirectory"] });
    if (result.canceled) return null;
    const root = result.filePaths[0];
    const hasStt = existsSync(join(root, "voice-runtime/Scripts/python.exe")) && existsSync(join(root, "voice-models/faster-whisper-small/model.bin"));
    const hasVoice = existsSync(join(root, "expressive-runtime/Scripts/python.exe")) && existsSync(join(root, "voice-models/active-voice.json"));
    const hasFast = existsSync(join(root,'voice-runtime/Scripts/python.exe')) && existsSync(join(root,'voice-models/kokoro-v1.0.onnx')) && existsSync(join(root,'voice-models/voices-v1.0.bin'));
    if (!hasStt && !hasVoice && !hasFast) throw new Error("La carpeta necesita recursos de reconocimiento, Kokoro o un perfil de voz original compartida.");
    updateSettings({ voiceRoot: root });
    return root;
  });
  handle("capture-sources", () => screenCapture.sources());
  handle("capture-screen", id => {
    if (typeof id !== "string") throw new Error("Selecciona una fuente.");
    return screenCapture.snapshot(id);
  });
  ipcMain.handle("system-audio", async (event, action) => {
    if (![pet?.webContents.id, panel?.webContents.id].includes(event.sender.id) || event.senderFrame !== event.sender.mainFrame) throw new Error("Origen no autorizado.");
    if (!storage.settings.sttEnabled) throw new Error("Activa reconocimiento local y configura su carpeta en Voz.");
    if (action === "finish") { if (captureOwner === event.sender.id) loopback.finish(); return; }
    if (action !== "start") throw new Error("Acción inválida.");
    if (capture.phase !== "idle" && capture.kind !== "voice") throw new Error("Finaliza primero la captura actual.");
    stopPerception();
    const epoch = ++perceptionEpoch;
    captureOwner = event.sender.id;
    const status = (phase: CaptureStatus["phase"]) => {
      capture = { kind: "system", phase, startedAt: phase === "idle" ? undefined : Date.now() };
      emit({ type: "capture", status: capture });
      if (phase === "recording" || phase === "transcribing") emit({ type: "pet", state: phase === "recording" ? "LISTENING" : "THINKING", reason: phase === "recording" ? "Escuchando audio del PC" : "Transcribiendo localmente" });
    };
    const fail = (message: string) => { if (epoch === perceptionEpoch) { status("idle"); emit({ type: "error", message }); } };
    await loopback.start(pcm => {
      if (epoch !== perceptionEpoch) return;
      status("transcribing");
      void voice.transcribe(pcm).then(text => {
        if (epoch !== perceptionEpoch) return;
        if (text) emit({ type: "transcript", text });
        emit({ type: "pet", state: text ? "HAPPY" : "CONFUSED", reason: text ? "Audio del PC listo para revisar" : "No se detectó voz" });
      }).catch(() => fail("No se pudo transcribir el audio del PC.")).finally(() => { if (epoch === perceptionEpoch) status("idle"); });
    }, fail);
    if (epoch === perceptionEpoch) status("recording");
  });
  ipcMain.on("capture-status", (event, status: CaptureStatus) => {
    if (![pet?.webContents.id, panel?.webContents.id].includes(event.sender.id) || event.senderFrame !== event.sender.mainFrame || !status || !["microphone", "system", "voice"].includes(status.kind) || !["idle", "recording", "transcribing", "preparing", "speaking"].includes(status.phase)) return;
    if (capture.kind === "system" && capture.phase !== "idle" && captureOwner !== event.sender.id) return;
    const unchanged = capture.kind === status.kind && capture.phase === status.phase;
    capture = { kind: status.kind, phase: status.phase, startedAt: status.phase === "idle" ? undefined : unchanged ? capture.startedAt ?? Date.now() : Date.now() };
    emit({ type: "capture", status: capture });
  });
  ipcMain.on('wake-status', (event, status: WakeStatus) => {
    if (event.sender.id !== pet?.webContents.id || event.senderFrame !== event.sender.mainFrame ||
        !['off','listening','processing','paused','error'].includes(status)) return;
    wakeStatus = status;
    // The renderer already suspends Pixi when hidden. Keep only wake timers alive.
    pet.webContents.setBackgroundThrottling(status === 'off' || status === 'error');
    emit({type:'wake-status',status});
  });
  handle("open-settings", openSettings);
  handle("hide", hidePet);
  handle("show", recover);
  handle("context-menu", contextMenu);
  handle("synthesize", (text) => voice.synthesize(text as string));
  handle("prepare-voice", () => voice.prepare());
  handle("cancel-synthesis", () => voice.cancelSynthesis());
  handle("transcribe", (pcm) => voice.transcribe(pcm as ArrayBuffer));
  handle('cancel-transcription', () => voice.cancelTranscription());
  handle("voice-health", () => voice.health());
  handle("demo", (state) => {
    if (!PET_STATES.includes(state as never))
      throw new Error("Estado inválido.");
    emit({
      type: "pet",
      state: state as (typeof PET_STATES)[number],
      reason: "Demostración visual local",
    });
  });
  ipcMain.on("hit-test", (event, interactive) => {
    if (event.sender.id === pet?.webContents.id && !clickThrough && !dragging)
      pet?.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on("energy", (event, value) => {
    if (event.sender.id === pet?.webContents.id && typeof value === "number")
      panel?.webContents.send("desktop-event", {
        type: "energy",
        value: Math.max(0, Math.min(1, value)),
      });
  });
  ipcMain.on("drag", (event, action) => {
    if (event.sender.id !== pet?.webContents.id || !pet) return;
    if (action === "start") {
      const p = screen.getCursorScreenPoint(),
        b = pet.getBounds();
      dragOffset = { x: p.x - b.x, y: p.y - b.y };
      dragging = true;
      pet.setIgnoreMouseEvents(false);
    } else {
      dragging = false;
      pet.setBounds(clampBounds(pet.getBounds()));
    }
  });
  cursorTimer = setInterval(() => {
    if (!pet || pet.isDestroyed() || !pet.isVisible()) return;
    const p = screen.getCursorScreenPoint(),
      b = pet.getBounds();
    if (dragging) pet.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
    else if (storage.settings.cursorTracking)
      pet.webContents.send("desktop-event", {
        type: "cursor",
        x: (p.x - b.x) / b.width,
        y: (p.y - b.y) / b.height,
      });
  }, 32);
  log(
    "info",
    "Windows",
    `Electron ${process.versions.electron}; transparencia, bandeja y atajo inicializados.`,
  );
  if (!qa) void gateway.connect();
  if (process.argv.includes("--settings") || qa) openSettings();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    recover();
    openSettings();
  });
  app
    .whenReady()
    .then(ready)
    .catch(() => app.quit());
  app.on("window-all-closed", () => {});
  app.on("before-quit", () => {
    quitting = true;
    voice?.dispose();
    loopback?.cancel();
    gateway?.disconnect(false);
    clearInterval(cursorTimer);
    clearTimeout(saveTimer);
    globalShortcut.unregisterAll();
    tray?.destroy();
  });
}
