"""No models or credentials required: protect immutable profile selection."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from voice_profile import load_profile
from shared_voice_service import speech_chunks
from design_voice import activate


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.models = self.root / 'voice-models'
        folder = self.models / 'test-voice'
        folder.mkdir(parents=True)
        self.reference = folder / 'reference.wav'
        self.reference.write_bytes(b'synthetic-reference')
        digest = hashlib.sha256(self.reference.read_bytes()).hexdigest()
        self.profile = {'schema': 1, 'id': 'test-voice', 'reference': 'reference.wav',
                        'reference_text': 'Hola.', 'reference_sha256': digest, 'runtime_model': 'base'}
        (folder / 'profile.json').write_text(json.dumps(self.profile))
        (self.models / 'base').mkdir()
        (self.models / 'base/config.json').write_text('{}')
        self.active = self.models / 'active-voice.json'
        self.active.write_text(json.dumps({'id': 'test-voice', 'profile': 'test-voice/profile.json', 'reference_sha256': digest}))

    def tearDown(self):
        self.temp.cleanup()

    def test_loads_same_identity(self):
        self.assertEqual(load_profile(self.root).id, 'test-voice')

    def test_detects_reference_tampering(self):
        self.reference.write_bytes(b'replaced-voice')
        with self.assertRaisesRegex(ValueError, 'referencia fija'):
            load_profile(self.root)

    def test_refuses_profile_outside_models(self):
        self.active.write_text(json.dumps({'profile': '../outside.json'}))
        with self.assertRaisesRegex(ValueError, 'fuera'):
            load_profile(self.root)

    def test_chunks_preserve_all_words(self):
        text = ' '.join(['Una frase clara para Karen.'] * 40)
        chunks = speech_chunks(text)
        self.assertEqual(' '.join(chunks), text)
        self.assertTrue(all(len(chunk) <= 200 for chunk in chunks))

    def new_voice(self, model='base'):
        folder = self.models / 'adult-voice'
        folder.mkdir()
        reference = folder / 'reference.wav'
        reference.write_bytes(b'another-original-synthetic-reference')
        profile = {**self.profile, 'id': 'adult-voice', 'runtime_model': model,
                   'reference_sha256': hashlib.sha256(reference.read_bytes()).hexdigest()}
        (folder / 'profile.json').write_text(json.dumps(profile))
        return folder

    def test_switch_requires_explicit_flag_and_preserves_previous_identity(self):
        folder = self.new_voice()
        previous = self.active.read_bytes()
        with self.assertRaisesRegex(ValueError, 'otra identidad'):
            activate(self.root, folder)
        self.assertEqual(self.active.read_bytes(), previous)
        activate(self.root, folder, replace_active=True)
        self.assertEqual(load_profile(self.root).id, 'adult-voice')
        self.assertEqual(next(self.models.glob('active-voice-before-*.json')).read_bytes(), previous)

    def test_invalid_replacement_restores_previous_pointer(self):
        folder = self.new_voice(model='missing-model')
        previous = self.active.read_bytes()
        with self.assertRaisesRegex(ValueError, 'Modelo Base'):
            activate(self.root, folder, replace_active=True)
        self.assertEqual(self.active.read_bytes(), previous)


if __name__ == '__main__':
    unittest.main()
