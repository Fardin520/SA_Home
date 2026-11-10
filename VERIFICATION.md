# Local verification — November 10, 2026

Completed project: `E:\Projects\serveranywhere2`.

- The dependency-free build generated the home page and all 16 service/policy pages, plus a 404 page, local assets and precompressed text files.
- JavaScript syntax and generated asset-path checks passed.
- All **43 browser/retrieval/HTTP checks passed from the destination folder**. The complete run finished in 21 seconds; this is test-suite duration, not a performance benchmark.
- Isolated API integration checks passed for progressive streaming, split UTF-8, exact retrieved facts and Bangla instructions, malformed/incomplete/empty responses, timeouts, missing or unreachable models, reply bounds, concurrent requests, cancellation and slot recovery.
- The installed real `gemma3:4b` model returned: “The monthly price for the SA-BD-VPS-12-30B plan is ৳450 [1]. It includes 2 GB of DDR4 RAM [1].” The source pointed to `/ddr4-vps`.
- A real Bangla follow-up retained the plan context and returned: “SA-BD-VPS-12-30B প্ল্যানের র‍্যাম হলো 2 GB [1].” The source again pointed to `/ddr4-vps`.
- Those two live calls were made through the rebuilt Node chat endpoint, using the local CPU configuration. Model quality and speed are not guaranteed by transport fixtures.
- Initial JavaScript is 5,818 bytes before compression and 2,133 bytes gzipped. The chat code and CSS are deferred until the launcher opens; model inference starts only on submission.
- Screenshots were inspected for the desktop/mobile home page, DDR4 VPS page and mobile chat. Preview files are in `previews/`.

Reproduce automated checks with `npm.cmd test`. Run the optional real-model check with `node scripts/verify-live.mjs` while Ollama is running. The runtime and build need no installed npm packages; browser checks use the three installed development packages.

No electrical power measurement or production load test was performed. Existing order/client-area placeholders remain as in the source project; live billing/account integration is outside this rebuild.
