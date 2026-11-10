import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readJsonLines } from '../assets/json-lines.js';

// Optional real-model smoke check. Ollama and gemma3:4b must already be installed.
const origin = 'http://127.0.0.1:3102';
const server = spawn(process.execPath, ['server.mjs', '--port', '3102'], { stdio: 'ignore', windowsHide: true });
const history = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Live-check server could not start. Check port 3102.');
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'Live-check server did not start.');
  for (const [question, language] of [
    ['What is the monthly price and RAM for SA-BD-VPS-12-30B?', 'en'],
    ['বাংলায় বলুন, এই প্ল্যানের র‍্যাম কত?', 'bn'],
  ]) {
    history.push({ role: 'user', content: question });
    const start = performance.now();
    const response = await fetch(`${origin}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ messages: history, language }), signal: AbortSignal.timeout(130000),
    });
    assert.equal(response.status, 200, `AI request failed: ${await (response.ok ? Promise.resolve('') : response.text())}`);
    let text = '';
    let done = false;
    let firstDelta;
    let sources = [];
    for await (const event of readJsonLines(response.body)) {
      if (event.type === 'delta') { firstDelta ??= performance.now() - start; text += event.text; }
      if (event.type === 'sources') sources = event.sources;
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'done') done = true;
    }
    assert(done && text, 'The model must finish a nonempty reply.');
    assert(sources.some((source) => source.url === '/ddr4-vps'), 'The answer must cite the matching service.');
    if (language === 'en') assert.match(text, /450/);
    else assert.match(text, /[\u0980-\u09ff]/u);
    history.push({ role: 'assistant', content: text });
    console.log(`PASS: real ${language} reply, DDR4 source, first text ${(firstDelta / 1000).toFixed(1)}s, completed ${((performance.now() - start) / 1000).toFixed(1)}s\n${text}\n`);
  }
} finally {
  const exited = once(server, 'exit');
  if (server.exitCode === null) { server.kill(); await exited; }
}
