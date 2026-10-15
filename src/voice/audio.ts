import { bridge } from "../native";
import { useStore, signals, report } from "../state/store";

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
  private url?: string;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private generation = 0;
  private limit?: ReturnType<typeof setTimeout>;
  private detector?: WakeWordDetector;
  private recording = false;
  private processing = false;
  private stopRecording = false;
  private speechSeen = false;
  private silenceAt = 0;
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
          if (raw > 0.018) {
            this.speechSeen = true;
            this.silenceAt = now;
          } else if (this.speechSeen && now - this.silenceAt > 1800)
            this.recorder?.stop();
        }
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  private cleanup() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.limit);
    this.analyser = undefined;
    signals.energy = 0;
    bridge.energy(0);
    this.audio?.pause();
    this.audio = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
  }
  cancel() {
    this.generation++;
    this.stopRecording = true;
    this.processing = false;
    if (this.recorder?.state === "recording") this.recorder.stop();
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
    this.detector?.pause();
    useStore.getState().transition("THINKING", "Preparando voz");
    try {
      const bytes = await this.tts.synthesize(
        text.slice(0, 4096),
        new AbortController().signal,
      );
      if (generation !== this.generation) return;
      this.context = new AudioContext();
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
      const source = this.context.createMediaElementSource(this.audio);
      source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.audio.onended = () => {
        this.cleanup();
        this.detector?.resume();
        useStore.getState().transition("HAPPY", "Voz completada");
      };
      this.audio.onerror = () => {
        this.cleanup();
        this.detector?.resume();
        report(
          new Error(
            "No se pudo reproducir la voz. Revisa el dispositivo de salida.",
          ),
        );
        useStore.getState().transition("ERROR");
      };
      await this.context.resume();
      await this.audio.play();
      useStore.getState().transition("SPEAKING");
      this.meter();
    } catch (e) {
      if (generation === this.generation) {
        this.cleanup();
        this.detector?.resume();
        report(e);
        useStore.getState().transition("ERROR", "Motor de voz no disponible");
      }
    }
  }
  async toggleListening() {
    if (this.recording) {
      if (this.recorder?.state === "recording") this.recorder.stop();
      return;
    }
    this.cancel();
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
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.context.createMediaStreamSource(stream).connect(this.analyser);
      this.chunks = [];
      this.speechSeen = false;
      this.silenceAt = performance.now();
      this.recorder = new MediaRecorder(stream);
      this.recording = true;
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        void this.finishCapture(generation);
      };
      this.recorder.start();
      useStore.getState().transition("LISTENING");
      this.meter();
      this.limit = setTimeout(() => {
        if (this.recorder?.state === "recording") this.recorder.stop();
      }, 60000);
    } catch (e) {
      this.cleanup();
      this.detector?.resume();
      report(e);
      useStore.getState().transition("ERROR");
    }
  }
  private async finishCapture(generation: number) {
    const blob = new Blob(this.chunks, {
      type: this.recorder?.mimeType || "audio/webm",
    });
    this.recording = false;
    this.cleanup();
    if (this.stopRecording || generation !== this.generation) return;
    this.processing = true;
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
      this.detector?.resume();
    }
  }
  dispose() {
    this.cancel();
    this.detector?.stop();
  }
}
