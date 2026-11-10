# Server Anywhere — plain HTML, CSS and JavaScript

This is the complete local HTML rebuild of `E:\Projects\serveranywhere`, including the home page, 16 service/policy pages and the bilingual AI support chatbot. The existing layout, local fonts, purple palette, pricing cards, responsive navigation, hover effects and reduced-motion support are retained. The home and service banners use new realistic server images.

## Run

Requires Node.js 22 or newer. There are **no production npm dependencies** and no framework runtime.

```powershell
cd E:\Projects\serveranywhere2
npm.cmd start
```

Open **http://127.0.0.1:3000**. The included `dist/` is already built. `npm.cmd run build` regenerates it after source changes; the build uses only Node's built-in modules. `npm.cmd run dev` rebuilds once and starts Node's server watcher. Rebuild after editing HTML templates, CSS, browser JavaScript or page data; refresh the browser to see those edits.

To choose another port: `node server.mjs --port 3005`. Set `HOST=0.0.0.0` in the environment only when network access is intended. The default listener is local.

Do not open the HTML with `file://`: use the server for root-relative assets, clean URLs and the chat API. Static hosts can serve `dist/` with clean URL mapping to `slug.html`; the AI endpoint still needs the Node server or a same-origin proxy to it.

## Chatbot

Open the installed Ollama application, confirm `ollama list` includes `gemma3:4b`, then open **AI support**. If Ollama is not running, use `ollama serve` in another terminal. The default is local CPU inference at `http://127.0.0.1:11434`; no paid AI service is required. If the model is missing, install it with `ollama pull gemma3:4b`.

The original cached BM25 search over the website catalogue is retained. English, Bangla and common Banglish questions retrieve bounded plan/FAQ/policy passages. Replies stream with source links. Language selection, follow-up context, Stop, Retry, Clear, Escape and Shift+Enter work as before. Conversations stay in browser memory across internal navigation, and disappear on reload. Neither the server nor browser writes chat history to disk.

No inference call, status polling, chat module or chat stylesheet runs on page load. Opening the panel loads its code; inference starts only when a question is sent. Replies update a text node at most once per animation frame instead of rebuilding the conversation per token. The browser never connects directly to Ollama.

Optional settings go in `.env.local` or `.env`; start with `.env.example` and restart the server. Existing process environment variables take precedence. Settings include `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_NUM_CTX`, `OLLAMA_NUM_PREDICT`, `OLLAMA_NUM_GPU` and `OLLAMA_MAX_CONCURRENT`. Defaults retain a 2048-token context, 256 output tokens, CPU inference and one concurrent AI request. Stop, disconnect and timeout abort inference. Remote inference must use HTTPS; production mode also requires `OLLAMA_API_TOKEN`. Authentication must be enforced by that remote gateway.

This assistant uses published content, not live stock, billing or customer accounts. Order/client-area/support placeholders remain disabled as in the original. Human support email and telephone links work. Model output can be incorrect; source links let readers inspect the published facts.

## Where to edit

| File | Purpose |
| --- | --- |
| `scripts/templates.mjs` | Shared header/footer and HTML page templates |
| `data/pages.json` | All service plans, FAQ, tables and policy content; chatbot knowledge |
| `data/hosting-plans.json` | Home page plan selection |
| `data/site.js` | Navigation and service tabs |
| `assets/styles.css` | Original design converted to ordinary CSS |
| `assets/enhancements.css` | New imagery layout and small entrance animation |
| `assets/app.js` | Pricing tabs, menus, progressive navigation and lazy chat loading |
| `assets/chat.js`, `assets/chat.css` | Chat interface and streaming behavior |
| `lib/chat/` | Validated AI requests, search, streaming and model configuration |
| `server.mjs` | Static files and same-origin chat API |
| `dist/` | Generated HTML and production assets; rebuild after edits |

Set `SITE_URL` to the deployment origin before building to generate canonical URLs, a populated sitemap and absolute social-image URLs. Leave it unset locally. Do not edit generated `dist/` files as the source of truth.

## Efficiency and reliability

The site uses no React, Next.js, Tailwind, bundler, icon library, animation library or database at runtime. Shared templates remove duplicated source markup; the build writes real HTML pages. Icons are inline SVG, fonts are local, and server images use responsive WebP. The initial browser JavaScript is about **2.1 KB gzipped**. Text is compressed once at build time, with ETag validation on requests. Native HTML handles navigation, service billing and FAQs even with JavaScript disabled.

The server catches request failures, bounds request sizes/history/replies, rejects cross-site chat requests, validates model configuration and enforces an inference concurrency cap. The browser renders all customer/model text with `textContent`, rejects unsafe citations, handles malformed/disconnected streams and releases the UI for Retry. Rapid navigation cancels stale requests and falls back to native page loading on failure. Browser test setup spawns Node directly and cleans it up on Windows.

These checks cover common failures; no software can guarantee it will never crash. Actual power consumption depends on hardware and model use and has not been benchmarked. For public hosting, use an HTTPS reverse proxy, deployment-specific rate limiting and normal process supervision. The included concurrency guard is per process.

## Verification

Running the website and the build does not require `npm install`. Only browser tests need development packages:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run check
npm.cmd run test:api
npm.cmd run test:e2e
```

The browser suite uses installed Google Chrome and port 3100; the API fixture uses 3101. The suite covers all service pages at mobile/tablet/desktop sizes, billing and FAQ without JavaScript, keyboard controls, navigation/history, lazy loading, safe rendering, error recovery, bounded history, Bangla/English retrieval, source links, static HTTP responses and exposed-source protection. Transport fixtures exercise failure handling without loading the real model.

For the optional real-model test, start Ollama and run `node scripts/verify-live.mjs` (port 3102). This sends an English pricing question and a Bangla follow-up to the real installed model. Generation time varies with hardware and model loading.

New artwork was made with the built-in imagegen tool; saved asset paths and prompts are recorded in [ASSETS.md](ASSETS.md). Font and Lucide icon licenses are included in `assets/`.
