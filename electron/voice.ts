import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Settings } from "../shared/types.js";
export class NativeVoice {
  private controller?: AbortController;
  private child?: ChildProcess;
  constructor(
    private root: string,
    private settings: () => Settings,
  ) {}
  cancel() {
    this.controller?.abort();
    this.child?.kill();
    this.controller = undefined;
    this.child = undefined;
  }
  private async speechRequest(path: "/health" | "/speech", text?: string) {
    const token = readFileSync(
      join(this.root, "voice-models", ".expressive-token"),
      "utf8",
    ).trim();
    this.controller = new AbortController();
    const signal = AbortSignal.any([
      this.controller.signal,
      AbortSignal.timeout(path === "/health" ? 4000 : 180000),
    ]);
    const response = await fetch(`http://127.0.0.1:18790${path}`, {
      method: text ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(text ? { "Content-Type": "application/json" } : {}),
      },
      body: text ? JSON.stringify({ text }) : undefined,
      signal,
    });
    if (!response.ok)
      throw new Error(`El servicio de voz local respondió ${response.status}.`);
    return response;
  }
  async health() {
    const stt =
      existsSync(join(this.root, "voice-runtime", "Scripts", "python.exe")) &&
      existsSync(
        join(this.root, "voice-models", "faster-whisper-small", "model.bin"),
      );
    let local = "Servicio expresivo no disponible";
    try {
      await this.speechRequest("/health");
      local = "Servicio expresivo disponible (18790, autenticado)";
    } catch {}
    return `${local}. STT local: ${stt ? "archivos encontrados; ejecutar una captura para verificar inferencia" : "configura KAREN_PROJECT_ROOT con los recursos de voz opcionales"}. TTS de Windows: disponible mediante System.Speech, se verifica al reproducir.`;
  }
  private run(
    command: string,
    args: string[],
    input: string,
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child;
      let output = "";
      let done = false;
      const end = (error?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (this.child === child) this.child = undefined;
        if (error) reject(new Error(error));
        else resolve(output.trim());
      };
      const timer = setTimeout(() => {
        child.kill();
        end("El motor de voz superó el tiempo de espera.");
      }, timeout);
      child.on("error", () => end("No se pudo iniciar el motor de voz local."));
      child.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
        if (output.length > 32_000_000) {
          child.kill();
          end("Respuesta de voz demasiado grande.");
        }
      });
      child.stderr?.resume();
      child.on("exit", (code) =>
        end(code === 0 ? undefined : "El motor de voz se detuvo."),
      );
      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    });
  }
  async synthesize(text: string): Promise<ArrayBuffer> {
    this.cancel();
    if (typeof text !== "string" || !text.trim() || text.length > 4096)
      throw new Error("Texto de voz inválido (máximo 4096 caracteres).");
    if (this.settings().ttsEngine === "local")
      return (await this.speechRequest("/speech", text)).arrayBuffer();
    const script = `$ErrorActionPreference='Stop'; [Console]::InputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $r=[Console]::In.ReadToEnd()|ConvertFrom-Json; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $v=$s.GetInstalledVoices()|Where-Object {$_.VoiceInfo.Culture.Name -like 'es-*'}|Select-Object -First 1; if($v){$s.SelectVoice($v.VoiceInfo.Name)}; $m=New-Object System.IO.MemoryStream; $s.SetOutputToWaveStream($m); $s.Speak([string]$r.text); $s.Dispose(); [Console]::Out.Write([Convert]::ToBase64String($m.ToArray())); $m.Dispose()`;
    const encoded = await this.run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      JSON.stringify({ text }),
      120000,
    );
    const data = Buffer.from(encoded, "base64");
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }
  async transcribe(pcm: ArrayBuffer): Promise<string> {
    this.cancel();
    if (
      !(pcm instanceof ArrayBuffer) ||
      pcm.byteLength < 3200 ||
      pcm.byteLength > 1_920_000
    )
      throw new Error("Audio inválido. Graba entre 0,1 y 60 segundos.");
    const result = await this.run(
      join(this.root, "voice-runtime", "Scripts", "python.exe"),
      [join(this.root, "voice_worker.py")],
      JSON.stringify({
        operation: "stt",
        engine: "faster-small",
        audio: Buffer.from(pcm).toString("base64"),
      }) + "\n",
      180000,
    );
    const value = JSON.parse(result.split("\n").at(-1) || "{}") as {
      text?: string;
      error?: string;
    };
    if (value.error || typeof value.text !== "string")
      throw new Error(
        "El reconocimiento local no pudo transcribir. Revisa los modelos de voz.",
      );
    return value.text.trim().slice(0, 16000);
  }
}
