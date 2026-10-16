"""A pinned-identity client; cancellation never interrupts another client."""
import json
import os
from pathlib import Path
import queue
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request

from voice_profile import load_profile
from voice_style import validate_style

START_LOCK = threading.Lock()
URL = 'http://127.0.0.1:18790'


def session(root):
    path = Path(root) / 'voice-models/.expressive-token'
    try:
        with path.open('x', encoding='ascii') as output:
            output.write(secrets.token_urlsafe(32))
    except FileExistsError:
        pass
    token = path.read_text(encoding='ascii').strip()
    if len(token) < 32:
        raise RuntimeError('Credencial de voz local inválida')
    return urllib.request.build_opener(urllib.request.ProxyHandler({})), token


def request(opener, token, path, payload=None, timeout=3):
    req = urllib.request.Request(URL + path, data=json.dumps(payload).encode() if payload else None,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    return opener.open(req, timeout=timeout)


def ensure_service(root, opener, token, profile):
    with START_LOCK:
        def health():
            with request(opener, token, '/health') as response:
                value = json.load(response)
            if value.get('protocol') != 2 or value.get('profileId') != profile.id or value.get('referenceSha256') != profile.reference_sha256:
                raise RuntimeError('El servicio tiene otra identidad de voz; no se usará como sustituto')
        try:
            health()
            return
        except urllib.error.HTTPError as error:
            raise RuntimeError('El servicio de voz rechazó autenticación o perfil') from error
        except urllib.error.URLError:
            pass
        python = Path(root) / ('expressive-runtime/Scripts/python.exe' if os.name == 'nt' else 'expressive-runtime/bin/python')
        if not python.is_file():
            raise RuntimeError('Instala expressive-runtime con tus propios modelos de voz')
        subprocess.Popen([str(python), str(Path(__file__).with_name('shared_voice_service.py')), str(root)],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
                         creationflags=0x08000000 if os.name == 'nt' else 0, cwd=str(Path(root)))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                health()
                return
            except urllib.error.URLError:
                time.sleep(.2)
        raise RuntimeError('El servicio de voz fija no pudo iniciar')


def synthesize(root, text, cancelled, style='neutral'):
    validate_style(style)
    if cancelled.is_set():
        return b''
    if not isinstance(text, str) or not text.strip() or len(text) > 4096:
        raise ValueError('Texto de voz inválido')
    profile = load_profile(root)
    results = queue.Queue(maxsize=1)

    def worker():
        try:
            opener, token = session(root)
            ensure_service(root, opener, token, profile)
            if cancelled.is_set():
                results.put((b'', None))
                return
            with request(opener, token, '/speech', {'text': text, 'style': style, **profile.public()}, timeout=600) as response:
                if response.headers.get('X-Karen-Voice-Id') != profile.id or response.headers.get('X-Karen-Voice-Sha256') != profile.reference_sha256:
                    raise RuntimeError('El audio recibido pertenece a otro perfil de voz')
                if style != 'neutral' and response.headers.get('X-Karen-Voice-Style') != style:
                    raise RuntimeError('Actualiza el servicio compartido para usar estilos de voz')
                audio = response.read(24_000_001)
                if len(audio) > 24_000_000 or not audio.startswith(b'RIFF'):
                    raise RuntimeError('Audio de voz inválido')
                results.put((audio, None))
        except Exception as error:
            results.put((None, error))

    threading.Thread(target=worker, daemon=True).start()
    while not cancelled.is_set():
        try:
            audio, error = results.get(timeout=.05)
            if error:
                raise error
            return audio if not cancelled.is_set() else b''
        except queue.Empty:
            continue
    return b''
