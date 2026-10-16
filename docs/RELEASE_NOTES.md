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
