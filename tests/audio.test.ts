import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/native", () => ({ bridge: { captureStatus: vi.fn(), energy: vi.fn() } }));
import { bridge } from "../src/native";
import { AudioDirector } from "../src/voice/audio";
import { signals, useStore } from "../src/state/store";
import { defaults } from "../shared/settings";

class TestAudio {
  static instances: TestAudio[] = [];
  onended?: () => void;
  onerror?: () => void;
  volume = 1;
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor() { TestAudio.instances.push(this); }
}
class TestContext {
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createAnalyser() { return { fftSize: 512, connect: vi.fn(), getFloatTimeDomainData: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn() }; }
}
beforeEach(() => {
  TestAudio.instances = [];
  vi.stubGlobal("AudioContext", TestContext);
  vi.stubGlobal("Audio", TestAudio);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  useStore.setState({ settings: { ...defaults, voiceEnabled: true }, capture: { kind: "microphone", phase: "idle" }, error: "" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("ciclo real de reproducción", () => {
  it("muestra preparación, mantiene SPEAKING frente al Gateway y espera al audio antes de continuar", async () => {
    const synthesize = vi.fn(async () => new ArrayBuffer(12));
    const director = new AudioDirector({ synthesize });
    const first = "Esta primera frase debe reproducirse antes de generar la siguiente.";
    const second = "La segunda frase también conserva su identidad original.";
    const completed = director.speak(`${first} ${second}`);
    expect(useStore.getState().capture.phase).toBe("preparing");
    await vi.waitFor(() => expect(useStore.getState().capture.phase).toBe("speaking"));
    expect(synthesize).toHaveBeenCalledExactlyOnceWith(first, expect.any(AbortSignal));
    useStore.getState().event({ type: "pet", state: "HAPPY", reason: "Respuesta completada" });
    expect(useStore.getState().state).toBe("SPEAKING");
    TestAudio.instances[0].onended?.();
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(TestAudio.instances[1]?.play).toHaveBeenCalled());
    TestAudio.instances[1].onended?.();
    await completed;
    expect(useStore.getState().capture.phase).toBe("idle");
    expect(useStore.getState().state).toBe("HAPPY");
    expect(signals.energy).toBe(0);
    director.dispose();
  });
  it("cancelar durante la generación impide reproducir audio tardío", async () => {
    let finish!: (audio: ArrayBuffer) => void;
    const synthesize = vi.fn((_text: string, _signal: AbortSignal) => new Promise<ArrayBuffer>(resolve => { finish = resolve; }));
    const director = new AudioDirector({ synthesize });
    const pending = director.speak("Hola, soy Karen.");
    const signal = synthesize.mock.calls[0]?.[1] as AbortSignal | undefined;
    director.cancel();
    finish(new ArrayBuffer(12));
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(TestAudio.instances).toHaveLength(0);
    expect(useStore.getState().capture.phase).toBe("idle");
    expect(bridge.captureStatus).toHaveBeenCalledWith({ kind: "voice", phase: "idle", startedAt: undefined });
  });
  it("cancelar durante la reproducción resuelve la cola y cierra el audio", async () => {
    const director = new AudioDirector({ synthesize: async () => new ArrayBuffer(12) });
    const pending = director.speak("Hola, soy Karen.");
    await vi.waitFor(() => expect(useStore.getState().capture.phase).toBe("speaking"));
    director.cancel();
    await pending;
    expect(TestAudio.instances[0].pause).toHaveBeenCalled();
    expect(useStore.getState().capture.phase).toBe("idle");
  });
});
