"""Offline PCM16 speech recognition. Audio remains in stdin/stdout and memory."""
import base64
import json
import sys
from pathlib import Path

model = None

def recognize(request):
    global model
    import numpy as np
    from faster_whisper import WhisperModel
    audio = np.frombuffer(base64.b64decode(request["audio"], validate=True), dtype=np.int16).astype(np.float32) / 32768
    if not 1600 <= len(audio) <= 960000:
        raise ValueError("Audio length out of bounds")
    folder = Path(sys.argv[1]) / "voice-models" / "faster-whisper-small"
    if model is None:
        model = WhisperModel(str(folder), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)
    segments, _ = model.transcribe(audio, language="es", beam_size=5, vad_filter=True,
        initial_prompt="Karen, Caren. Conversación en español.", condition_on_previous_text=False)
    return {"text": " ".join(segment.text.strip() for segment in segments)}

if __name__ == "__main__":
    for line in sys.stdin:
        try:
            result = recognize(json.loads(line))
        except Exception:
            result = {"error": "El reconocimiento local no pudo procesar el audio."}
        print(json.dumps(result, ensure_ascii=True), flush=True)
        if '--persistent' not in sys.argv:
            break
