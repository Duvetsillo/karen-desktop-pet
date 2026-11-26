import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import type { Settings } from '../shared/types.js';
import { INTRO_IDS, IntroTimeline, selectIntro, type IntroId, type IntroPayload } from '../shared/startup-intros.js';
import { GreetingLibrary, ResourceCache, greetingVoiceVersion } from './greeting-library.js';
import { IntroGuard } from './intro-guard.js';

export class StartupIntroManager {
  private window?: BrowserWindow;
  private guard?: IntroGuard;
  private cache?: ResourceCache;
  private payload?: IntroPayload;
  private watchdog?: ReturnType<typeof setTimeout>;
  private previous?: IntroId;
  private epoch = 0;
  private busy = false;
  private restorePet = false;
  private started = false;
  constructor(private options: {
    pet: BrowserWindow; settings: () => Settings; directory: string;
    prefs: () => Electron.WebPreferences;
    load: (window: BrowserWindow, view: string) => Promise<unknown>;
    protect: (window: BrowserWindow) => void;
    blocked: () => boolean;
    log: (message: string) => void;
  }) {
    const own = (event: Electron.IpcMainInvokeEvent) => {
      if (event.sender.id !== this.window?.webContents.id || event.senderFrame !== event.sender.mainFrame)
        throw new Error('Origen de introducción no autorizado.');
    };
    ipcMain.handle('intro-payload', event => { own(event); return this.payload; });
    ipcMain.handle('intro-ready', event => {
      own(event);
      if (this.started || !this.payload || this.options.blocked()) { if (this.options.blocked()) this.cancel(); return false; }
      this.started = true;
      this.options.pet.hide();
      this.window!.showInactive(); // Never take foreground focus, including in preview.
      return true;
    });
    ipcMain.handle('intro-finished', event => { own(event); this.cancel(); });
  }
  get active() { return this.busy; }
  async play(id?: IntroId, startup = false): Promise<boolean> {
    if (id !== undefined && !INTRO_IDS.includes(id)) throw new Error('Introducción desconocida.');
    if (this.busy || this.options.blocked()) return false;
    const settings = { ...this.options.settings() };
    if ((startup && !settings.introEnabled) || settings.mode !== 'normal') return false;
    this.busy = true; this.restorePet = startup || this.options.pet.isVisible();
    const epoch = ++this.epoch;
    try {
      this.guard = new IntroGuard();
      if (!await this.guard.start(reason => { if (reason) this.options.log(reason); this.cancel(); }, settings.introEscape) || epoch !== this.epoch) {
        if (epoch === this.epoch) this.cancel(); return false;
      }
      const bounds = this.options.pet.getBounds();
      const home = screen.getDisplayMatching(bounds);
      const display = screen.getAllDisplays().find(d => String(d.id) === settings.introMonitor) ?? home;
      // The flight lands on the home monitor, even when the cinematic uses another display.
      const target = { ...bounds, x: bounds.x - display.bounds.x, y: bounds.y - display.bounds.y };
      const selected = id ?? selectIntro(settings, new Date().getHours(), this.previous);
      this.previous = selected;
      this.cache = new ResourceCache();
      let greeting: Pick<IntroPayload, 'greeting' | 'audio'> = {};
      if (settings.introVoice) {
        try {
          const version = greetingVoiceVersion(settings, settings.voiceRoot || process.env.KAREN_PROJECT_ROOT || join(this.options.directory, 'voice'));
          greeting = new GreetingLibrary(join(this.options.directory, 'startup-greetings'), this.cache, version).choose(selected, new Date().getHours());
        } catch { /* Missing voice identity keeps the cinematic silent. */ }
      }
      this.payload = { id: selected, settings, target, ...greeting };
      this.guard.expectOverlay();
      const w = this.window = new BrowserWindow({
        ...display.bounds, frame: false, transparent: true, backgroundColor: '#00000000',
        resizable: false, movable: false, hasShadow: false, skipTaskbar: true,
        fullscreenable: false, focusable: false, alwaysOnTop: true, show: false,
        title: 'Karen · Introducción', webPreferences: { ...this.options.prefs(), autoplayPolicy: 'no-user-gesture-required' },
      });
      this.options.protect(w);
      w.setIgnoreMouseEvents(true);
      w.setMenuBarVisibility(false);
      w.on('closed', () => { if (this.window === w) this.cancel(); });
      w.webContents.on('render-process-gone', () => this.cancel());
      w.on('unresponsive', () => this.cancel());
      this.watchdog = setTimeout(() => this.cancel(), 8000 + new IntroTimeline(selected, false, greeting.greeting?.duration).duration * 1000);
      await this.options.load(w, 'intro');
      return epoch === this.epoch;
    } catch {
      this.options.log('No se pudo reproducir la introducción; se muestra la mascota habitual.');
      if (epoch === this.epoch) this.cancel();
      return false;
    }
  }
  cancel() {
    ++this.epoch;
    clearTimeout(this.watchdog); this.watchdog = undefined;
    this.guard?.stop(); this.guard = undefined;
    const w = this.window; this.window = undefined;
    if (w && !w.isDestroyed()) w.destroy();
    this.cache?.clear(); this.cache = undefined; this.payload = undefined;
    if (this.restorePet && !this.options.pet.isDestroyed()) this.options.pet.showInactive();
    this.restorePet = false; this.started = false; this.busy = false;
  }
  dispose() {
    this.restorePet = false; this.cancel();
    for (const channel of ['intro-payload', 'intro-ready', 'intro-finished']) ipcMain.removeHandler(channel);
  }
}
