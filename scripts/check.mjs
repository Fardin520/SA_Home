import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = JSON.parse(await readFile(join(root, 'data/pages.json'), 'utf8'));
let checked = 0;
async function syntax(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await syntax(path);
    else if (/\.m?js$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      checked++;
    }
  }
}
await syntax(root);
for (const filename of ['index', '404', ...pages.map((page) => page.slug)]) {
  const html = await readFile(join(root, 'dist', `${filename}.html`), 'utf8');
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${filename}: one page heading`);
  assert(!/(?:src|href)="[^"]*(?:_next|webpack|react|tailwind)/i.test(html), `${filename}: no framework payload`);
  for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    await access(resolve(root, 'dist', '.' + path));
  }
}
console.log(`PASS: ${checked} JavaScript files parse; ${pages.length + 2} HTML files have valid local assets and no framework payload.`);
