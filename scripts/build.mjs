import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, constants } from 'node:zlib';
import { header, footer, home, servicePage, icon } from './templates.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const filename of ['.env.local', '.env']) {
  try { process.loadEnvFile(join(root, filename)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const out = join(root, 'dist');
const pages = JSON.parse(await readFile(join(root, 'data/pages.json'), 'utf8'));
const plans = JSON.parse(await readFile(join(root, 'data/hosting-plans.json'), 'utf8'));
await mkdir(out, { recursive: true });
await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
await writeFile(join(out, 'assets/styles.css'), (await readFile(join(root, 'assets/styles.css'), 'utf8')) + '\n' + (await readFile(join(root, 'assets/enhancements.css'), 'utf8')));
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const origin = process.env.SITE_URL?.replace(/\/$/, '');
if (origin && !/^https?:\/\/[^\s]+$/.test(origin)) throw new Error('SITE_URL must be an absolute HTTP(S) website URL.');

function document(content, page) {
  const title = page ? `${page.title} | Server Anywhere` : 'Server Anywhere — Hosting without limits';
  const description = page?.description || 'Fast, secure BDIX web hosting, VPS, RDP and dedicated servers in Bangladesh. Hosting without limits.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="theme-color" content="#7151d9">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:image" content="${origin || ''}/assets/images/hosting-hero-1600.webp"><meta name="twitter:card" content="summary_large_image">
${origin ? `<link rel="canonical" href="${escape(origin + (page ? '/' + page.slug : '/'))}">` : ''}
<link rel="icon" href="/assets/favicon.png"><link rel="preload" href="/assets/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css"><script type="module" src="/assets/app.js"></script></head>
<body id="top"><a href="#main-content" class="skip-link">Skip to content</a>${header(page?.slug)}${content}${footer()}
<div class="chat-widget" id="chat-widget"><button type="button" class="chat-launcher" id="chat-launcher" aria-label="Open AI support chat" aria-expanded="false">${icon('message-circle', 23)}<span>AI support</span></button></div>
<noscript><p class="noscript-note">Enable JavaScript for the hosting tabs and AI chat. All service pages, billing options and FAQs work without it.</p></noscript></body></html>`;
}

await writeFile(join(out, 'index.html'), document(home(plans)));
for (const page of pages) await writeFile(join(out, `${page.slug}.html`), document(servicePage(page), page));
await writeFile(join(out, '404.html'), document('<main id="main-content" class="not-found site-container"><span class="eyebrow">404 · PAGE NOT FOUND</span><h1>Let’s get you back online.</h1><p>This page could not be found.</p><a class="button" href="/">Back to home</a></main>'));
await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
await writeFile(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${origin ? ['', ...pages.map((page) => page.slug)].map((slug) => `<url><loc>${escape(origin + '/' + slug)}</loc></url>`).join('') : ''}</urlset>`);

// Compress text once at build time: the server does no compression work per request.
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(html|css|js|txt|xml)$/.test(entry.name)) {
      await writeFile(`${path}.gz`, gzipSync(await readFile(path), { level: constants.Z_BEST_COMPRESSION }));
    }
  }
}
await compress(out);
console.log(`Built ${pages.length + 1} HTML pages in ${out}. No framework, bundler or runtime packages.`);
