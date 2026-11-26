const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const child = spawn(path.resolve('dist-native/KarenMusicBridge.exe'), [], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
let buffer = '', received = false, context = false;
const timeout = setTimeout(() => { child.kill(); throw new Error('GSMTC no respondió.'); }, 10000);
child.on('error', error => { clearTimeout(timeout); throw error; });
child.stderr.resume();
child.stdout.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const row = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (row.type === 'sessions') {
      received = true;
      // Never persist real titles, artwork, artists or session identifiers.
      console.log(JSON.stringify({ nativeSessions: row.sessions.length, eventSnapshot: true }));
      child.stdin.write(JSON.stringify({ id: 'probe', action: 'context' }) + '\n');
    } else if (row.type === 'result' && row.id === 'probe') {
      context = true;
      console.log(JSON.stringify({ contextRead: true, safeDesktop: row.safeDesktop, callsClear: row.callsClear }));
      child.stdin.end();
    } else if (row.type === 'error') { clearTimeout(timeout); child.kill(); throw new Error(row.error); }
  }
});
child.on('exit', code => { clearTimeout(timeout); assert.equal(code, 0); assert(received && context); });
