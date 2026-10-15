import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ desktopCapturer: { getSources: vi.fn() } }));
import { desktopCapturer } from "electron";
import { DisplayAudioGrant, ScreenCapture } from "../electron/capture";
import { validateImages } from "../shared/attachments";

describe("permisos de audio del sistema", () => {
  it("exige autorización de la misma ventana, de un solo uso y sin caducar", () => {
    const gate = new DisplayAudioGrant();
    expect(gate.take(1, 10)).toBe(false);
    gate.arm(1, 10);
    expect(gate.take(2, 11)).toBe(false);
    expect(gate.take(1, 12)).toBe(false);
    gate.arm(1, 10);
    expect(gate.take(1, 20)).toBe(true);
    expect(gate.take(1, 21)).toBe(false);
    gate.arm(1, 10);
    expect(gate.take(1, 10011)).toBe(false);
  });
});
describe("capturas elegidas", () => {
  it("no captura una fuente que no se eligió de la lista", async () => {
    const capture = new ScreenCapture();
    await expect(capture.snapshot("window:secret:0")).rejects.toThrow("elegir");
    vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([{ id: "window:qa:0", name: "QA" }] as never);
    expect(await capture.sources()).toEqual([{ id: "window:qa:0", name: "QA" }]);
    expect(desktopCapturer.getSources).toHaveBeenLastCalledWith(expect.objectContaining({ thumbnailSize: { width: 0, height: 0 } }));
    await expect(capture.snapshot("window:secret:0")).rejects.toThrow();
    vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([{ id: "window:qa:0", thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from("synthetic-jpeg") } }] as never);
    expect(await capture.snapshot("window:qa:0")).toMatchObject({ type: "image", mimeType: "image/jpeg" });
  });
  it("acota adjuntos y elimina nombres de archivo externos", () => {
    expect(validateImages([{ type: "image", mimeType: "image/png", fileName: "../../private.png", content: "c3ludGhldGlj" }])[0].fileName).toBe("karen-screen.png");
    expect(() => validateImages([{ type: "image", mimeType: "text/plain", content: "abc" }])).toThrow();
    expect(() => validateImages([{ type: "image", mimeType: "image/png", content: "!not-base64!" }])).toThrow();
    expect(() => validateImages([{}, {}])).toThrow();
    expect(() => validateImages([{ type: "image", mimeType: "image/png", content: "a".repeat(4_000_001) }])).toThrow();
  });
});
