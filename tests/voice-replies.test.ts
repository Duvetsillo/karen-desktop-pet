import { describe, expect, it, vi } from "vitest";
import { speechPhrases, VoiceReplies } from "../src/voice/replies";
import type { CaptureStatus } from "../shared/types";

const reply = (id: string) => ({ id, role: "assistant" as const, text: `Respuesta ${id}.` });
describe("respuestas habladas", () => {
  it("conserva una respuesta que llega antes de terminar la transcripción", () => {
    let capture: CaptureStatus = { kind: "microphone", phase: "transcribing" };
    const speak = vi.fn(async () => {});
    const queue = new VoiceReplies(speak, () => ({ enabled: true, capture }));
    queue.enqueue(reply("uno"));
    expect(speak).not.toHaveBeenCalled();
    capture = { kind: "microphone", phase: "idle" };
    queue.resume();
    expect(speak).toHaveBeenCalledExactlyOnceWith("Respuesta uno.");
  });
  it("espera el final de la reproducción y descarta finales duplicados", async () => {
    let finish!: () => void;
    const speak = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = new VoiceReplies(speak, () => ({ enabled: true, capture: { kind: "voice", phase: "idle" } }));
    queue.enqueue(reply("uno"));
    queue.enqueue(reply("uno"));
    queue.enqueue(reply("dos"));
    expect(speak).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    expect(speak.mock.calls.map(call => call[0])).toEqual(["Respuesta uno.", "Respuesta dos."]);
  });
  it("cancelar elimina pendientes sin permitir que una petición vieja controle la nueva", async () => {
    let finish!: () => void;
    const speak = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = new VoiceReplies(speak, () => ({ enabled: true, capture: { kind: "voice", phase: "idle" } }));
    queue.enqueue(reply("uno"));
    queue.enqueue(reply("dos"));
    queue.clear();
    queue.enqueue(reply("tres"));
    finish();
    await Promise.resolve();
    expect(speak.mock.calls.map(call => call[0])).toEqual(["Respuesta uno.", "Respuesta tres."]);
  });
  it("no marca como leído un mensaje cuando la voz está desactivada", () => {
    let enabled = false;
    const speak = vi.fn(async () => {});
    const queue = new VoiceReplies(speak, () => ({ enabled, capture: { kind: "voice", phase: "idle" } }));
    queue.enqueue(reply("uno"));
    enabled = true;
    queue.enqueue(reply("uno"));
    expect(speak).toHaveBeenCalledTimes(1);
  });
  it("lee respuestas normales de una vez y divide solo al superar el límite del motor", () => {
    const text = "Esta es una respuesta que ya puede empezar a sonar. ".repeat(12);
    const phrases = speechPhrases(text);
    expect(phrases).toHaveLength(1);
    expect(phrases.join(" ")).toBe(text.trim());
    expect(speechPhrases("**Hola Karen**. [Documentación](https://example.com).\n```sh\nsecreto de ejemplo\n```\nGracias.").join(" ")).toBe("Hola Karen. Documentación. Gracias.");
    const long = `${"Frase completa. ".repeat(300)}final.`;
    const longPhrases = speechPhrases(long);
    expect(longPhrases.length).toBeGreaterThan(1);
    expect(longPhrases.every(phrase => phrase.length <= 4096)).toBe(true);
    expect(longPhrases.join(" ")).toBe(long);
    expect(speechPhrases("x".repeat(5000)).every(phrase => phrase.length <= 4096)).toBe(true);
  });
});
