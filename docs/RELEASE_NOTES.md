Karen Desktop Pet 1.3 adds a Perception panel: Windows WASAPI loopback recording,
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
