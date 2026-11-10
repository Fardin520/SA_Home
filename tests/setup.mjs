import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Spawn Node directly so teardown also works on Windows without orphan shell children.
export default async function setup() {
  const origin = 'http://127.0.0.1:3100';
  try {
    await fetch(origin, { signal: AbortSignal.timeout(500) });
    throw new Error('Port 3100 is already in use. Stop that preview before running tests.');
  } catch (error) { if (error.message.startsWith('Port 3100')) throw error; }
  const server = spawn(process.execPath, ['server.mjs', '--port', '3100'], { stdio: 'ignore', windowsHide: true });
  const stop = () => { if (server.exitCode === null) server.kill(); };
  process.once('exit', stop);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error('Test server stopped before startup.');
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* Wait for startup. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Test server did not start.');
  } catch (error) { stop(); process.removeListener('exit', stop); throw error; }
  return async () => {
    process.removeListener('exit', stop);
    const exited = once(server, 'exit');
    stop();
    if (server.exitCode === null) await exited;
  };
}
