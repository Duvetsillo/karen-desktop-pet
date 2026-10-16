const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('qa', { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.resolve('.'), '--qa'], env });
  const report = { source: 'synthetic native events; Windows System.Speech playback', rendererErrors: [] };
  try {
    const panel = app.windows().find(page => page.url().includes('view=settings')) ||
      await app.waitForEvent('window', { predicate: page => page.url().includes('view=settings') });
    await panel.waitForSelector('h1');
    for (const page of app.windows()) page.on('pageerror', error => report.rendererErrors.push(error.message));
    const pet = app.windows().find(page => page.url().includes('view=pet'));
    assert(pet);
    await panel.evaluate(() => window.karen.settings({ voiceEnabled: true, ttsEngine: 'system', outputDevice: '', volume: .4 }));
    await panel.evaluate(() => {
      window.__voicePhases = [];
      window.__maxVoiceEnergy = 0;
      window.__stopReplyProbe = window.karen.event(event => {
        if (event.type === 'capture') window.__voicePhases.push(event.status.phase);
        if (event.type === 'energy') window.__maxVoiceEnergy = Math.max(window.__maxVoiceEnergy, event.value);
      });
    });
    const emit = async events => app.evaluate(({ BrowserWindow }, events) => {
      for (const event of events) for (const window of BrowserWindow.getAllWindows()) window.webContents.send('desktop-event', event);
    }, events);
    await emit([
      { type: 'capture', status: { kind: 'microphone', phase: 'transcribing' } },
      { type: 'chat', final: true, message: { id: 'qa-final-during-stt', role: 'assistant', text: 'Hola. Esta respuesta espera a que termine la transcripción.' } },
    ]);
    assert.equal((await panel.evaluate(() => window.karen.snapshot())).capture.phase, 'idle');
    await emit([{ type: 'capture', status: { kind: 'microphone', phase: 'idle' } }]);
    await expect.poll(async () => (await panel.evaluate(() => window.karen.snapshot())).capture.phase, { timeout: 30000 }).toBe('speaking');
    await emit([{ type: 'pet', state: 'HAPPY', reason: 'Late Gateway completion' }]);
    await expect(pet.locator('.pet-caption')).toContainText('Hablando');
    await emit([{ type: 'chat', final: true, message: { id: 'qa-next-final', role: 'assistant', text: 'La siguiente respuesta también se reproduce, con una boca expresiva y suave.' } }]);
    await expect.poll(() => panel.evaluate(() => window.__voicePhases.filter(phase => phase === 'speaking').length), { timeout: 30000 }).toBe(2);
    await expect.poll(() => panel.evaluate(() => window.__maxVoiceEnergy), { timeout: 10000 }).toBeGreaterThan(.01);
    await pet.screenshot({ path: 'qa/reply-speaking.png', omitBackground: true });
    await expect.poll(async () => (await panel.evaluate(() => window.karen.snapshot())).capture.phase, { timeout: 30000 }).toBe('idle');
    report.phases = await panel.evaluate(() => window.__voicePhases);
    report.mouthEnergy = await panel.evaluate(() => window.__maxVoiceEnergy);
    report.deferredFinalPlayed = true;
    report.nextReplyPlayed = true;
    report.gatewayCannotOverrideSpeech = true;
    assert.deepEqual(report.rendererErrors, []);
    await panel.evaluate(() => window.__stopReplyProbe());
    fs.writeFileSync('qa/voice-replies-native.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await app.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
