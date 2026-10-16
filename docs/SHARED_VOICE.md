# One original Karen voice

Karen Local, OpenClaw WhatsApp notes and the desktop pet can use one fixed,
original reference. Qwen VoiceDesign creates the identity once; Qwen Base
0.6B uses its speaker embedding for subsequent utterances. No human reference
is required. Every client uses the same authenticated loopback service.

The service checks the profile ID and reference SHA256 on both requests and
responses. It refuses a different identity instead of falling back to another
voice. Sampling settings are fixed in the profile. Different sentences have
different prosody; WhatsApp's Opus compression also changes the waveform.
"Same voice" means the same fixed identity, not identical bytes for every text.

## Resources belong to each operator

No model, reference audio, active profile or credential is bundled or published.
Each operator downloads the models and creates their own identity on their
own hardware. The service uses CUDA; the validated Windows path targets an
NVIDIA GPU with 6 GB VRAM. Available memory depends on other applications.
An unavailable GPU produces an error, never a different voice.

On Windows, install Python 3.11 and a compatible NVIDIA driver, then:

```powershell
.\scripts\setup-shared-voice.ps1 -VoiceDirectory D:\KarenVoice
& D:\KarenVoice\expressive-runtime\Scripts\python.exe .\python\design_voice.py --root D:\KarenVoice
# Listen to voice-models/karen-original-v1/reference.wav, then activate it:
& D:\KarenVoice\expressive-runtime\Scripts\python.exe .\python\design_voice.py --root D:\KarenVoice --activate
```

Generation can take several minutes and runs once. Existing profiles are never
silently regenerated. Preserve `voice-models/karen-original-v1/` and
`voice-models/active-voice.json` to retain the identity after reinstalling. The
local `.expressive-token` is a private, per-installation credential; never commit
or share it. Model weights are Apache-2.0 under their published model cards.

The default design asks for a mature adult voice in a medium-low register.
For an intentional revision, use a new `--profile` ID. Activation of a different
identity requires `--activate --replace-active --profile NEW-ID`; it preserves
the previous reference and a copy of its active pointer. Invalid activation
restores the old pointer. Reuse the new profile across all clients together.

In the pet, choose the same resource directory in Voice settings, select
"Voz original compartida de Karen", enable reading replies, and test playback.
The service starts on demand in a hidden process. Health checks do not start
inference. After two idle minutes it releases model GPU memory; a bounded RAM
cache can reuse recent audio. Text and audio are not written to logs or disk.
The pet's default remains Windows TTS until its operator chooses shared voice.

## Karen Local and WhatsApp

Python desktop clients can import `shared_voice_client.synthesize(root, text,
cancelled_event)` from this repository's `python/` directory. An active profile
is read from the resource root. All clients should use that same root.

For OpenClaw, use its documented `tts-local-cli` provider. FFmpeg must be
installed in the resource root or on PATH. This public adapter generates an
Ogg/Opus voice note without sending it:

```powershell
python .\python\voice_note.py --root D:\KarenVoice --text "Hola, soy Karen." --output .\karen.opus
```

Configure `tts.providers.tts-local-cli.command` with your Python executable and
`args` with your absolute `voice_note.py` path, `--root`, your resource directory,
`--output`, `{{OutputPath}}`. Omit the `{{Text}}` argument: OpenClaw then supplies
UTF-8 through stdin, keeping utterances out of process arguments.
Set `outputFormat` to `opus`.
Keep the desired existing `tts.auto` mode; `inbound` responds with audio after
inbound voice notes. This is not a live WhatsApp call.

To prevent a different provider from substituting its default voice, use a
persona with `provider: "tts-local-cli"`, `fallbackPolicy: "fail"`, and a single
`providers` binding `{ "tts-local-cli": {} }`. Select it through `tts.persona`
and account for any local `/tts persona` preference. Leave model overrides
disabled. Consult the installed OpenClaw schema before changing configuration;
no Gateway restart is required for these settings in the verified version.

The Python service can run on a CUDA Linux server; its client chooses
`expressive-runtime/bin/python` there. Install the equivalent pinned Python
dependencies and FFmpeg yourself. It binds only to loopback, not the LAN or
public internet. Browser/headless pet mode continues to support text and
animations; it does not expose desktop voice RPCs. A remote shared deployment
requires your own authenticated transport and remains outside this setup.

## Verification and limits

Run `npm test`, `python -m unittest discover -s tests -p test_voice_profile.py`,
and `npm run build`. Tests cover reference replacement, path traversal,
identity mismatch, authentication rejection and cancellation. These checks do
not prove model quality; real synthesis, decoding and transcription are also
required. `tts.convert` with `channel: "whatsapp"` can verify OpenClaw note
generation without sending a message.

Reference-code continuation on the tested Turing GPU produced invalid audio.
The supported runtime uses the fixed speaker embedding, FP32, eager attention
and GPU codec. Do not switch conditioning or precision without repeating real
audio verification. There is no streaming playback yet; the client waits for
the generated utterance, and latency depends on text length and hardware.

Primary references: [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS),
[OpenClaw personas](https://docs.openclaw.ai/tools/tts/personas), and
[OpenClaw TTS fields](https://docs.openclaw.ai/tools/tts/field-reference).
