import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Isolated upstream fixtures test the real production API, without using Ollama.
let scenario = "stream";
let lastPayload;
let upstreamCancelled = false;
const fixture = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  lastPayload = JSON.parse(body);
  assert.equal(request.url, "/api/chat");
  if (scenario === "missing") { response.writeHead(404).end("private upstream details"); return; }
  response.writeHead(200, { "Content-Type": "application/x-ndjson" });
  const record = (text, done = false, extra = {}) => JSON.stringify({ message: { role: "assistant", content: text }, done, ...extra }) + "\n";
  if (scenario === "invalid") { response.end("invalid JSON\n"); return; }
  if (scenario === "incomplete") { response.end(record("Partial fixture")); return; }
  if (scenario === "empty") { response.end(record("", true)); return; }
  if (scenario === "limit") { response.end(record("x".repeat(5000))); return; }
  if (scenario === "timeout" || scenario === "cancel") {
    response.on("close", () => { upstreamCancelled = true; });
    response.write(record("Waiting fixture"));
    return;
  }
  const first = Buffer.from(record("বাংলা ✓ "));
  // Intentionally split within a multibyte UTF-8 character and across JSON lines.
  response.write(first.subarray(0, first.indexOf(Buffer.from("বাংলা")) + 1));
  setTimeout(() => response.write(first.subarray(first.indexOf(Buffer.from("বাংলা")) + 1)), 25);
  setTimeout(() => response.end(record("second fixture", true, { total_duration: 12345 })), 300);
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const fixturePort = fixture.address().port;
const appPort = 3101;
const origin = `http://127.0.0.1:${appPort}`;
const server = spawn(process.execPath, ["server.mjs", "--port", String(appPort)], {
  cwd: process.cwd(),
  env: { ...process.env, OLLAMA_BASE_URL: `http://127.0.0.1:${fixturePort}`, OLLAMA_MODEL: "gemma3:4b", OLLAMA_TIMEOUT_MS: "1000", OLLAMA_MAX_CONCURRENT: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let logs = "";
server.stdout.on("data", (data) => { logs = (logs + data).slice(-4000); });
server.stderr.on("data", (data) => { logs = (logs + data).slice(-4000); });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const post = (signal, messages = [{ role: "user", content: "Transport fixture question" }], language = "auto") => fetch(`${origin}/api/chat`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ messages, language }), signal,
});
const events = (text) => text.trim().split("\n").map((line) => JSON.parse(line));
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for local server. */ }
    if (server.exitCode !== null) throw new Error(logs);
    await wait(250);
  }
  assert.ok(ready, "Production server did not start");
  const response = await post();
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let first = "";
  while (!first.includes('"type":"delta"') || !first.endsWith("\n")) {
    const item = await reader.read();
    assert.equal(item.done, false);
    first += decoder.decode(item.value, { stream: true });
  }
  assert.match(first, /বাংলা ✓/u);
  assert.doesNotMatch(first, /second fixture|total_duration/);
  let rest = "";
  while (true) { const item = await reader.read(); if (item.done) { rest += decoder.decode(); break; } rest += decoder.decode(item.value, { stream: true }); }
  assert.match(rest, /second fixture/);
  assert.equal(events(rest).at(-1).type, "done");
  assert.equal(lastPayload.model, "gemma3:4b");
  assert.equal(lastPayload.stream, true);
  assert.equal(lastPayload.messages[0].role, "system");
  assert.match(lastPayload.messages[0].content, /Never invent company prices/);
  assert.deepEqual(lastPayload.options, { temperature: 0.3, num_ctx: 2048, num_predict: 256, num_gpu: 0 });
  console.log("PASS: progressive forwarding, split UTF-8, server prompt and CPU settings");

  const grounded = events(await (await post(undefined, [{ role: "user", content: "ডিডিআর৪ ভিপিএসের মাসিক দাম কত?" }], "bn")).text());
  assert.equal(grounded[0].type, "sources");
  assert.equal(grounded[0].sources[0].url, "/ddr4-vps");
  assert.match(lastPayload.messages[0].content, /বাংলায় উত্তর দিন/u);
  assert.match(lastPayload.messages[0].content, /৳450\/month/u);
  assert.match(lastPayload.messages[0].content, /SA-BD-VPS-12-30B/);
  assert.doesNotMatch(lastPayload.messages[0].content, /SG Web Hosting/);
  console.log("PASS: real retrieval, published plan context, source events and Bangla instructions reach the inference request");

  for (const mode of ["invalid", "incomplete", "empty", "timeout"]) {
    scenario = mode;
    const result = await post();
    const output = events(await result.text());
    assert.equal(output.at(-1).type, "error", mode);
    assert.doesNotMatch(JSON.stringify(output), /private upstream details|stack|127\.0\.0\.1/);
  }
  console.log("PASS: invalid, incomplete, empty and timed-out streams");
  scenario = "missing";
  const missing = await post();
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /model is unavailable/);
  scenario = "limit";
  const limited = events(await (await post()).text());
  assert.equal(limited.find((event) => event.type === "delta").text.length, 4000);
  assert.equal(limited.at(-1).limited, true);
  console.log("PASS: missing model and maximum output limit");

  scenario = "cancel";
  upstreamCancelled = false;
  const controller = new AbortController();
  const pending = await post(controller.signal);
  const pendingReader = pending.body.getReader();
  await pendingReader.read();
  assert.equal((await post()).status, 429);
  controller.abort();
  await pendingReader.cancel().catch(() => {});
  for (let attempt = 0; attempt < 40 && !upstreamCancelled; attempt++) await wait(25);
  assert.ok(upstreamCancelled, "Browser cancellation must close the inference connection");
  scenario = "stream";
  let retried;
  for (let attempt = 0; attempt < 40; attempt++) { retried = await post(); if (retried.status !== 429) break; await retried.text(); await wait(25); }
  assert.equal(retried.status, 200);
  await retried.text();
  console.log("PASS: concurrency guard, cancellation propagation and slot recovery");

  fixture.close();
  fixture.closeAllConnections();
  const unavailable = await post();
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /cannot reach/);
  console.log("PASS: unreachable inference server");
} finally {
  server.kill();
  fixture.close();
  fixture.closeAllConnections();
  await once(server, "exit").catch(() => {});
}
