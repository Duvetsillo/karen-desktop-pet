"""Offline PCM16 speech recognition. Audio remains in stdin/stdout and memory."""
import base64
import json
import sys
from pathlib import Path

def main():
    import numpy as np
    from faster_whisper import WhisperModel
    request = json.loads(sys.stdin.readline())
    audio = np.frombuffer(base64.b64decode(request["audio"], validate=True), dtype=np.int16).astype(np.float32) / 32768
    if not 1600 <= len(audio) <= 960000:
        raise ValueError("Audio length out of bounds")
    folder = Path(sys.argv[1]) / "voice-models" / "faster-whisper-small"
    model = WhisperModel(str(folder), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
    segments, _ = model.transcribe(audio, language="es", beam_size=5, vad_filter=True, condition_on_previous_text=False)
    print(json.dumps({"text": " ".join(segment.text.strip() for segment in segments)}, ensure_ascii=True), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"error": "El reconocimiento local no pudo procesar el audio."}), flush=True)
