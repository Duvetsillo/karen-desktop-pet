Karen Desktop Pet 1.6.1 adds six contextual expressions: laughter, anger,
sadness, surprise, pride and curiosity. The character changes eyes, brows,
mouth, fins, arms, tint and movement while preserving real audio lip motion.
Reply text selects a brief expression; technical states still reflect actual
listening, thinking, speaking and errors. Reduced-motion preferences remove
large movements while retaining readable facial expressions. The shared Karen
personality now permits situational humor, disagreement and expressive language
without claiming literal human feelings or attributing private emotions to the
user. No voice model, reference audio or credentials change.

Karen Desktop Pet 1.5.3 adds an explicit fast CPU voice using optional local
Kokoro resources. It uses another fixed timbre and does not replace the original
shared voice or change WhatsApp. A persistent worker avoids reloading between
phrases; delivery presets and real audio animation remain available.

Karen Desktop Pet 1.5.2 reduces the first audio wait with a shorter opening
phrase, one phrase of synthesis ahead of playback, and authenticated preparation
of the original voice while listening to a command or waiting for its reply.
Preparation retains the model for up to ten idle minutes and is skipped when
speech is muted or low-power mode is enabled. No voice identity is replaced.

The voice status and reply bubble now share a vertical layout instead of
overlapping absolute positions. Replies remain visible throughout preparation
and playback. Native tests cover the layout at 50%, 100% and 200% size.

Karen Desktop Pet 1.5.1 fixes Stop silently disabling addressed-name activation.
Stopping a response or capture preserves the user's listening preference.
An idle indicator now shows paused listening, offers an activation button and
keeps microphone errors visible with a retry control. Say only "Karen";
recognition also accepts the spelling "Caren". No slash is pronounced.

Karen Desktop Pet 1.5.0 adds offline addressed-name activation for Karen/Caren,
with explicit continuous-listening controls and a visible microphone indicator.
It preserves a command after the name and opens a ten-second command window
after the name alone. Listening closes during playback, manual recording and
PC-audio capture. Recognition uses one warm CPU worker with bounded input and
idle shutdown; launch errors now identify missing resources and safe error codes.
Native voice processes explicitly start in the configured resource directory.

Six delivery styles preserve the original pinned identity: original, serene,
warm, serious, bright and gentle irony. These use restrained FFmpeg prosody
adjustments, not unsupported Qwen Base emotion instructions. Existing WhatsApp
notes retain neutral processing. The shared Python modules also support the
original Karen application's explicit personality and activation preferences.
No voice reference, credential or model is bundled or regenerated.

Karen Desktop Pet 1.4.2 adds quick voice controls on the pet. Toggle spoken
replies or replay the last completed reply without another Gateway/model request.
The microphone reflects recording state and is disabled until recognition is
configured. The toolbar remains available during capture/playback, and its hidden
state no longer intercepts clicks through transparent areas.
Capture and voice show elapsed time; a long local synthesis has a clear waiting
message. The compact layout stays readable at 50% size. A resize also redraws
the pet once when Windows has paused its background animation, preserving the
character without keeping a hidden render loop active.

Karen Desktop Pet 1.4.1 fixes automatic spoken replies that arrive before
transcription finishes or while an earlier reply is playing. Final replies wait
in a bounded queue and are read once. Stopping capture or disabling voice clears
the queue. Aborted and failed Gateway turns are not read as new replies.
Replies play in short phrases instead of waiting for the entire synthesis.
An explicit preparing-audio status remains visible while the original model
generates a phrase. This is sequential phrase playback, not streaming inference;
the local CUDA engine can still take tens of seconds or longer under load.
The mouth, antennae, glow and gentle body movement follow real audio energy,
with reduced-motion support. Late Gateway completion events no longer replace
the speaking animation. Voice diagnostics refresh when the resource folder
changes, report authentication errors and distinguish an idle service from
missing resources. No voice identity, model or credentials are changed.

Karen Desktop Pet 1.4 adds an optional shared original voice. The native pet,
Python desktop client and OpenClaw's local CLI TTS provider can use one fixed
reference and authenticated service. Profile IDs and reference hashes are
verified; failures do not silently substitute another voice. The native client
starts the service on demand and diagnostics report the selected profile.
See docs/SHARED_VOICE.md for operator-owned setup, CUDA requirements and limits.
No models, private voice references or credentials are included.
Startup with a saved custom accent also waits for Pixi initialization before
destroying its previous renderer, keeping the pet and settings visible.

Karen Desktop Pet 1.3 added a Perception panel: Windows WASAPI loopback recording,
offline speech transcription and reviewed screen/window snapshots sent through
OpenClaw's real image attachment protocol. System audio transcripts are reviewed
before sending. The included recognizer handles spoken words, not music or
general environmental sound understanding.

Voice settings now include a real playback test, a resource-folder picker and
microphone controls. Configure your own optional Python 3.11, faster-whisper
small model and PyAudioWPatch with scripts/setup-voice.ps1. No models or private
resources are bundled. Windows TTS uses installed system voices.

Capture has visible status and a stop control, a 60-second recording limit, and
stops on hide, lock, suspend or application exit. Screen images are previewed
before explicit submission; there is no automatic screen monitoring. OpenClaw
and its provider may retain submitted content. A vision-capable model is required.

Windows retains the native transparent pet and system voice. Node 24 and Docker
self-hosting support text and animations.

Credentials, personal profiles, recordings and models are not included. Bring
your own OpenClaw configuration. Server mode supports text and animations; TTS,
STT and Windows desktop controls are not available on a headless server.
Each operator supplies and pays for their own infrastructure and model providers.
There is no maintainer-hosted API or shared account included with the application.

The Windows installer is not Authenticode-signed. Verify SHA256SUMS.txt and use
only releases from this repository. A real OpenClaw deployment still requires
your own Gateway authentication and device pairing when required.
