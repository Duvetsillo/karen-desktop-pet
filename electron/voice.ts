import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { Settings } from "../shared/types.js";
export class NativeVoice {
  private controller?: AbortController;
  private child?: ChildProcess;
  constructor(
    private defaultRoot: string,
    private settings: () => Settings,
    private worker?: string,
    private serviceWorker?: string,
  ) {}
  private get root() { return this.settings().voiceRoot || this.defaultRoot; }
  cancel() {
    this.controller?.abort();
    this.child?.kill();
    this.controller = undefined;
    this.child = undefined;
  }
  private profile() {
    try {
      const value = JSON.parse(readFileSync(join(this.root, "voice-models", "active-voice.json"), "utf8")) as { id?: string; reference_sha256?: string };
      if (!value.id || !/^[a-z0-9-]{1,64}$/.test(value.id) || !value.reference_sha256 || !/^[a-f0-9]{64}$/.test(value.reference_sha256)) throw new Error();
      return { profileId: value.id, referenceSha256: value.reference_sha256 };
    } catch {
      throw new Error("Configura la voz original compartida en la carpeta de recursos de voz.");
    }
  }
  private token(create: boolean) {
    const file = join(this.root, "voice-models", ".expressive-token");
    if (create && !existsSync(file)) {
      try { writeFileSync(file, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const token = readFileSync(file, "utf8").trim();
    if (!/^[\w-]{32,256}$/.test(token)) throw new Error("Credencial de voz local inválida.");
    return token;
  }
  private async speechRequest(path: "/health" | "/speech", token: string, signal: AbortSignal, body?: object) {
    const response = await fetch(`http://127.0.0.1:18790${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(path === "/health" ? 2000 : 600000)]),
    });
    if (!response.ok)
      throw new Error(`El servicio de voz local respondió ${response.status}.`);
    return response;
  }
  private async sharedService(signal: AbortSignal, start: boolean) {
    const profile = this.profile();
    const token = this.token(start);
    const check = async () => {
      const response = await this.speechRequest("/health", token, signal);
      const value = await response.json() as { protocol?: number; profileId?: string; referenceSha256?: string };
      if (value.protocol !== 2 || value.profileId !== profile.profileId || value.referenceSha256 !== profile.referenceSha256)
        throw new Error("El servicio tiene otro perfil. No se cambiará la voz de Karen.");
    };
    try { await check(); return { token, profile }; }
    catch (error) {
      signal.throwIfAborted();
      // Only an unavailable transport can start a service; never replace a
      // reachable service that rejected credentials or the pinned identity.
      if (!start || !(error instanceof TypeError)) throw error;
    }
    const python = join(this.root, "expressive-runtime", "Scripts", "python.exe");
    const script = this.serviceWorker || join(this.root, "expressive_service.py");
    if (!existsSync(python) || !existsSync(script)) throw new Error("Falta instalar el motor de voz original y sus modelos locales.");
    const child = spawn(python, [script, this.root], { windowsHide: true, detached: true, stdio: "ignore", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    let launchError = false;
    child.on("error", () => { launchError = true; });
    child.unref();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      if (launchError) throw new Error("No se pudo iniciar el servicio de voz original.");
      try { await check(); return { token, profile }; }
      catch (error) { signal.throwIfAborted(); if (!(error instanceof TypeError)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("El servicio de voz original no pudo iniciar.");
  }
  async health() {
    const stt =
      existsSync(join(this.root, "voice-runtime", "Scripts", "python.exe")) &&
      existsSync(
        join(this.root, "voice-models", "faster-whisper-small", "model.bin"),
      );
    let local = "Servicio expresivo no disponible";
    try {
      const { profile } = await this.sharedService(new AbortController().signal, false);
      local = `Voz compartida ${profile.profileId}, autenticada y con referencia verificada`;
    } catch {
      try { local = `Perfil ${this.profile().profileId} configurado; el servicio se inicia al hablar`; } catch {}
    }
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
    if (this.settings().ttsEngine === "local") {
      const controller = new AbortController();
      this.controller = controller;
      try {
        const { token, profile } = await this.sharedService(controller.signal, true);
        const response = await this.speechRequest("/speech", token, controller.signal, { text, ...profile });
        if (response.headers.get("X-Karen-Voice-Id") !== profile.profileId || response.headers.get("X-Karen-Voice-Sha256") !== profile.referenceSha256)
          throw new Error("El audio recibido no pertenece a la voz fija de Karen.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 24_000_000 || Buffer.from(bytes).subarray(0, 4).toString() !== "RIFF") throw new Error("El servicio devolvió audio inválido.");
        return bytes;
      } finally { if (this.controller === controller) this.controller = undefined; }
    }
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
      this.worker ? [this.worker, this.root] : [join(this.root, "voice_worker.py")],
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
