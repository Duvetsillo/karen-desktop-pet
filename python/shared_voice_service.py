"""Authenticated loopback TTS. Utterances, keys and audio stay out of logs."""
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import gc
import io
import json
from pathlib import Path
import re
import secrets
import threading
import time

from voice_profile import load_profile


def speech_chunks(text, limit=200):
    result, current = [], ''
    for word in text.split():
        if len(current) + len(word) + 1 > limit and current:
            result.append(current)
            current = ''
        current = (current + ' ' + word).strip()
        if len(current) >= limit // 2 and re.search(r'[.!?]$', word):
            result.append(current)
            current = ''
    if current:
        result.append(current)
    return result


class VoiceEngine:
    def __init__(self, root):
        self.root = Path(root)
        self.lock = threading.Lock()
        self.model = self.prompt = self.signature = None
        self.last_used = time.monotonic()
        self.cache = OrderedDict()
        self.phase = 'cold'

    def synthesize(self, text, expected_id, expected_hash):
        import numpy as np
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
        with self.lock:
            profile = load_profile(self.root)
            if (expected_id, expected_hash) != (profile.id, profile.reference_sha256):
                raise ValueError('El cliente no seleccionó la misma identidad de voz')
            signature = (profile.id, profile.reference_sha256, str(profile.model))
            key = (signature, text)
            self.last_used = time.monotonic()
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key], profile
            if signature != self.signature:
                self.model = self.prompt = None
                self.cache.clear()
                gc.collect()
                torch.cuda.empty_cache()
            if self.model is None:
                self.phase = 'loading'
                if not torch.cuda.is_available():
                    raise RuntimeError('Esta configuración de voz necesita CUDA')
                torch.set_num_threads(4)
                self.model = Qwen3TTSModel.from_pretrained(
                    str(profile.model), device_map='cpu', dtype=torch.float32,
                    attn_implementation='eager', local_files_only=True,
                )
                # The validated Turing path uses FP32 and explicit attention.
                self.model.model.talker.to('cuda:0')
                self.model.model.speaker_encoder.to('cuda:0')
                self.model.device = torch.device('cuda:0')
                codec = self.model.model.speech_tokenizer
                codec.model.to('cuda:0')
                codec.device = torch.device('cuda:0')
                self.prompt = self.model.create_voice_clone_prompt(
                    ref_audio=str(profile.reference), ref_text=profile.reference_text,
                    # Speaker conditioning preserves the fixed identity while
                    # avoiding unstable reference-code continuation on Turing.
                    x_vector_only_mode=True,
                )
                self.signature = signature
            self.phase = 'generating'
            chunks = []
            options = {k: v for k, v in profile.generation.items() if k in {
                'temperature', 'top_p', 'subtalker_temperature', 'subtalker_top_p'}}
            with torch.inference_mode():
                for chunk in speech_chunks(text):
                    torch.manual_seed(int(profile.generation.get('seed', 42)))
                    waves, rate = self.model.generate_voice_clone(
                        text=chunk, language=profile.language, voice_clone_prompt=self.prompt,
                        max_new_tokens=min(512, max(96, len(chunk) * 2)), **options,
                    )
                    wave = np.asarray(waves[0], dtype=np.float32)
                    if not np.isfinite(wave).all() or not wave.size or np.sqrt(np.mean(wave ** 2)) < .003:
                        raise RuntimeError('El motor devolvió audio inválido')
                    chunks.append(wave)
            output = io.BytesIO()
            sf.write(output, np.concatenate(chunks), rate, format='WAV', subtype='PCM_16')
            audio = output.getvalue()
            self.cache[key] = audio
            while len(self.cache) > 8 or sum(map(len, self.cache.values())) > 12_000_000:
                self.cache.popitem(last=False)
            self.last_used = time.monotonic()
            self.phase = 'ready'
            return audio, profile

    def cleanup(self):
        while True:
            time.sleep(15)
            if time.monotonic() - self.last_used > 120 and self.lock.acquire(blocking=False):
                try:
                    if self.model is not None:
                        self.model = self.prompt = None
                        self.phase = 'cold'
                        gc.collect()
                        import torch
                        torch.cuda.empty_cache()
                finally:
                    self.lock.release()


def serve(root):
    root = Path(root).resolve()
    token = (root / 'voice-models/.expressive-token').read_text(encoding='ascii').strip()
    if len(token) < 32:
        raise RuntimeError('Credencial de voz local inválida')
    engine = VoiceEngine(root)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def authorized(self):
            return not self.headers.get('Origin') and secrets.compare_digest(
                self.headers.get('Authorization', '').encode('utf-8'), ('Bearer ' + token).encode('ascii'))

        def reply(self, status, data):
            content = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            if not self.authorized():
                self.reply(403, {'error': 'Autenticación de voz requerida'})
                return
            if self.path != '/health':
                self.reply(404, {'error': 'Ruta desconocida'})
                return
            try:
                profile = load_profile(root)
                self.reply(200, {'engine': 'qwen3-stable-spanish', 'protocol': 2,
                                'modelLoaded': engine.model is not None, 'phase': engine.phase, **profile.public()})
            except Exception:
                self.reply(503, {'error': 'Configura y verifica el perfil fijo de voz'})

        def do_POST(self):
            if not self.authorized():
                self.reply(403, {'error': 'Autenticación de voz requerida'})
                return
            if self.path != '/speech':
                self.reply(404, {'error': 'Ruta desconocida'})
                return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length <= 65536:
                    raise ValueError()
                request = json.loads(self.rfile.read(length))
                text = request['text']
                if not isinstance(text, str) or not text.strip() or len(text) > 4096:
                    raise ValueError()
                profile = load_profile(root)
                if (request.get('profileId'), request.get('referenceSha256')) != (profile.id, profile.reference_sha256):
                    self.reply(409, {'error': 'La identidad de voz del cliente no coincide'})
                    return
            except (ValueError, KeyError, TypeError, OSError):
                self.reply(400, {'error': 'Petición o perfil de voz inválido'})
                return
            try:
                audio, profile = engine.synthesize(text.strip(), profile.id, profile.reference_sha256)
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(audio)))
                self.send_header('X-Karen-Voice-Id', profile.id)
                self.send_header('X-Karen-Voice-Sha256', profile.reference_sha256)
                self.end_headers()
                self.wfile.write(audio)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                engine.phase = 'error'
                self.reply(503, {'error': 'La voz fija no pudo generar audio; no se cambió de voz'})

    server = ThreadingHTTPServer(('127.0.0.1', 18790), Handler)
    server.daemon_threads = True
    threading.Thread(target=engine.cleanup, daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    import sys
    serve(sys.argv[1])
