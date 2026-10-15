import { desktopCapturer } from "electron";
import type { CaptureSource, ImageAttachment } from "../shared/types.js";


export class ScreenCapture {
  private choices = new Map<string, number>();
  async sources(): Promise<CaptureSource[]> {
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    this.choices.clear();
    return sources.map(source => {
      this.choices.set(source.id, Date.now());
      return { id: source.id, name: source.name };
    });
  }
  async snapshot(id: string): Promise<ImageAttachment> {
    const selectedAt = this.choices.get(id);
    if (!selectedAt || Date.now() - selectedAt > 120000) throw new Error("Vuelve a elegir una pantalla o ventana.");
    const sources = await desktopCapturer.getSources({ types: [id.startsWith("screen:") ? "screen" : "window"], thumbnailSize: { width: 1600, height: 900 }, fetchWindowIcons: false });
    const source = sources.find(source => source.id === id);
    if (!source || source.thumbnail.isEmpty()) throw new Error("La ventana no está disponible. Puede estar minimizada o protegida.");
    return { type: "image", mimeType: "image/jpeg", fileName: "karen-screen.jpg", content: source.thumbnail.toJPEG(80).toString("base64") };
  }
}
