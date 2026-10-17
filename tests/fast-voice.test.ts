import {describe,expect,it} from 'vitest';
import {FastVoice} from '../electron/fast-voice';
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
