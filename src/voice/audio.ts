import { bridge } from "../native";
import { useStore, signals, report } from "../state/store";
import { speechPhrases } from "./replies";
import type { CaptureStatus } from "../../shared/types";

export interface TtsEngine {
  synthesize(text: string, signal: AbortSignal): Promise<ArrayBuffer>;
}
export interface SttEngine {
  transcribe(pcm16: ArrayBuffer, signal: AbortSignal): Promise<string>;
}
export interface WakeWordDetector {
  start(onWake: () => void): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}
// An externally supplied detector owns its model and microphone permission.
// No detector is enabled or imitated by the desktop pet.
export class AudioDirector {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private frame = 0;
  private audio?: HTMLAudioElement;
  private speechController?: AbortController;
  private finishPlayback?: () => void;
  private url?: string;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private generation = 0;
  private limit?: ReturnType<typeof setTimeout>;
  private detector?: WakeWordDetector;
  private recording = false;
  private processing = false;
  private stopRecording = false;
  private speechSeen = false;
  private silenceAt = 0;
  private active = false;
  private kind: "microphone" | "system" | "voice" = "microphone";
  private status(phase: CaptureStatus["phase"]) {
    if (phase === "idle" && !this.active) return;
    this.active = phase !== "idle";
    const status = { kind: this.kind, phase, startedAt: phase === "idle" ? undefined : Date.now() };
    useStore.getState().event({ type: "capture", status });
    bridge.captureStatus(status);
  }
  constructor(
    private tts: TtsEngine = {
      synthesize: async (text) => bridge.synthesize(text),
    },
    private stt: SttEngine = {
      transcribe: async (pcm) => bridge.transcribe(pcm),
    },
  ) {}
  async attachWakeWordDetector(detector: WakeWordDetector) {
    this.detector?.stop();
    this.detector = detector;
    await detector.start(() => {
      if (!this.audio && !this.recording && !this.processing) {
        useStore.getState().transition("HAPPY", "Palabra clave detectada");
        void this.toggleListening();
      }
    });
  }
  private meter() {
    if (!this.analyser) return;
    const data = new Float32Array(this.analyser.fftSize);
    let last = 0;
    const tick = (now: number) => {
      if (!this.analyser) return;
      if (now - last > 32) {
        last = now;
        this.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const x of data) sum += x * x;
        const raw = Math.sqrt(sum / data.length);
        signals.energy = Math.min(
          1,
          raw * 7 * useStore.getState().settings.sensitivity,
        );
        bridge.energy(signals.energy);
        if (this.recording) {
          if (raw > (this.kind === "system" ? 0.004 : 0.008)) {
            this.speechSeen = true;
            this.silenceAt = now;
          } else if (this.kind === "microphone" && this.speechSeen && now - this.silenceAt > 1800)
            this.recorder?.stop();
        }
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  private cleanup(finish = true) {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.limit);
    this.analyser = undefined;
    signals.energy = 0;
    bridge.energy(0);
    this.audio?.pause();
    this.finishPlayback?.();
    this.finishPlayback = undefined;
    this.audio = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    if (finish) this.status("idle");
  }
  cancel() {
    this.generation++;
    this.speechController?.abort();
    this.speechController = undefined;
    this.stopRecording = true;
    this.processing = false;
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.recorder = undefined;
    this.recording = false;
    this.cleanup();
    this.detector?.resume();
    useStore.getState().transition("IDLE");
  }
  async speak(text: string) {
    this.cancel();
    const generation = this.generation;
    const settings = useStore.getState().settings;
    if (!settings.voiceEnabled) return;
    const phrases = speechPhrases(text);
    if (!phrases.length) return;
    this.kind = "voice";
    this.processing = true;
    const controller = new AbortController();
    this.speechController = controller;
    this.detector?.pause();
    try {
      for (const phrase of phrases) {
        if (generation !== this.generation) return;
        useStore.getState().transition("THINKING", "Preparando voz original");
        this.status("preparing");
        const bytes = await this.tts.synthesize(
          phrase,
          controller.signal,
        );
        if (generation !== this.generation) return;
        this.context = new AudioContext();
        const outputContext = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
        if (settings.outputDevice) {
          if (!outputContext.setSinkId) throw new Error("Este motor no permite elegir la salida de audio.");
          await outputContext.setSinkId(settings.outputDevice);
        }
        if (generation !== this.generation) return;
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        this.url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        this.audio = new Audio(this.url);
        this.audio.volume = settings.volume;
        const output = this.audio as HTMLAudioElement & {
          setSinkId?: (id: string) => Promise<void>;
        };
        if (settings.outputDevice && output.setSinkId)
          await output.setSinkId(settings.outputDevice);
        if (generation !== this.generation) return;
        const source = this.context.createMediaElementSource(this.audio);
        source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
        const playback = new Promise<void>((resolve, reject) => {
          this.finishPlayback = resolve;
          this.audio!.onended = () => { this.finishPlayback = undefined; resolve(); };
          this.audio!.onerror = () => { this.finishPlayback = undefined; reject(new Error("No se pudo reproducir la voz. Revisa el dispositivo de salida.")); };
        });
        // The error handler can reject while play() itself is still pending.
        void playback.catch(() => {});
        await this.context.resume();
        if (generation !== this.generation) return;
        await this.audio.play();
        if (generation !== this.generation) return;
        useStore.getState().transition("SPEAKING");
        this.status("speaking");
        this.meter();
        await playback;
        if (generation !== this.generation) return;
        // Keep ownership between phrases so another reply cannot overtake us.
        this.cleanup(false);
      }
      if (generation === this.generation) {
        this.processing = false;
        this.cleanup();
        this.detector?.resume();
        useStore.getState().transition("HAPPY", "Voz completada");
      }
    } catch (e) {
      if (generation === this.generation) {
        this.processing = false;
        this.cleanup();
        this.detector?.resume();
        report(e);
        useStore.getState().transition("ERROR", "Motor de voz no disponible");
      }
    } finally {
      if (this.speechController === controller) this.speechController = undefined;
    }
  }
  async toggleListening() {
    if (this.recording) {
      if (this.recorder?.state === "recording") this.recorder.stop();
      return;
    }
    this.cancel();
    this.kind = "microphone";
    const generation = this.generation;
    this.stopRecording = false;
    if (!useStore.getState().settings.sttEnabled) {
      report(new Error("Activa el reconocimiento local en Voz."));
      return;
    }
    this.detector?.pause();
    try {
      const settings = useStore.getState().settings;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: settings.inputDevice
            ? { exact: settings.inputDevice }
            : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (!stream.getAudioTracks().length) { stream.getTracks().forEach(track => track.stop()); throw new Error("Windows no entregó audio del sistema."); }
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.context.createMediaStreamSource(stream).connect(this.analyser);
      const chunks: Blob[] = [];
      this.speechSeen = false;
      this.silenceAt = performance.now();
      this.recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()));
      const recorder = this.recorder;
      this.recording = true;
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        void this.finishCapture(generation, new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
      this.recorder.start();
      useStore.getState().transition("LISTENING");
      this.status("recording");
      stream.getAudioTracks().forEach(track => { track.onended = () => { if (recorder.state === "recording") recorder.stop(); }; });
      this.meter();
      this.limit = setTimeout(() => {
        if (this.recorder?.state === "recording") this.recorder.stop();
      }, 60000);
    } catch (e) {
      if (generation !== this.generation) return;
      this.cleanup();
      this.detector?.resume();
      report(e);
      useStore.getState().transition("ERROR");
    }
  }
  private async finishCapture(generation: number, blob: Blob) {
    if (this.stopRecording || generation !== this.generation) return;
    this.recording = false;
    this.cleanup();
    if (blob.size < 100) { useStore.getState().transition("CONFUSED", "No se detectó audio con voz"); this.detector?.resume(); return; }
    this.processing = true;
    this.status("transcribing");
    useStore.getState().transition("THINKING", "Transcribiendo en este equipo");
    try {
      const decoder = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      } finally {
        await decoder.close();
      }
      const offline = new OfflineAudioContext(
        1,
        Math.ceil(decoded.duration * 16000),
        16000,
      );
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      const floats = rendered.getChannelData(0);
      const pcm = new Int16Array(floats.length);
      for (let i = 0; i < floats.length; i++)
        pcm[i] = Math.max(-1, Math.min(1, floats[i])) * 32767;
      const text = await this.stt.transcribe(
        pcm.buffer,
        new AbortController().signal,
      );
      if (generation !== this.generation) return;
      if (!text) {
        useStore.getState().transition("CONFUSED", "No se detectó voz");
        return;
      }
      await bridge.send(text);
    } catch (e) {
      if (generation === this.generation) {
        report(e);
        useStore.getState().transition("ERROR");
      }
    } finally {
      this.processing = false;
      if (generation === this.generation) this.status("idle");
      this.detector?.resume();
    }
  }
  dispose() {
    this.cancel();
    this.detector?.stop();
  }
}
