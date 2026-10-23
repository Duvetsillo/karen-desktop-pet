import {describe,expect,it} from 'vitest';
import {FastVoice} from '../electron/fast-voice';
import {NativeVoice} from '../electron/voice';
import {defaults} from '../shared/settings';
import {validateSettings} from '../shared/settings';
describe('voz rápida explícita',()=>{
  it('conserva la selección y el estilo sin sustituir la voz original',()=>{
    expect(validateSettings({ttsEngine:'fast',voiceStyle:'serene'})).toMatchObject({ttsEngine:'fast',voiceStyle:'serene'});
    expect(validateSettings({ttsEngine:'local'}).ttsEngine).toBe('local');
  });
  it('rechaza recursos ausentes con un error útil',async()=>{
    const worker=new FastVoice('nonexistent-worker.py');
    await expect(worker.synthesize('nonexistent-resources','Hola','serene')).rejects.toThrow('Kokoro');
    worker.close();
  });
});

describe('voz neural femenina en línea',()=>{
  it('conserva la selección explícita',()=>{
    expect(validateSettings({ttsEngine:'edge'}).ttsEngine).toBe('edge');
  });
  it('muestra un error útil si faltan los recursos de voz',async()=>{
    const voice=new NativeVoice('nonexistent-voice-root',()=>({...defaults,ttsEngine:'edge'}));
    await expect(voice.synthesize('Hola')).rejects.toThrow('Edge TTS');
    voice.dispose();
  });
});
