import pageData from "../../data/pages.json" with { type: "json" };
// This small catalogue uses lexical RAG: no embedding model or external database.
const MAX_CONTEXT_BYTES = 1800;
const MAX_CHUNK_BYTES = 1000;
const encoder = new TextEncoder();
const aliases = [
    [/ভি\s*পি\s*এস|ভিপিএস|\bvps\b/iu, ["vps"]],
    [/হোস্টিং|হোস্ট|\bhosting\b/iu, ["hosting"]],
    [/শেয়ার্ড|শেয়ার্ড|শেয়ার|\bshared\b/iu, ["shared", "hosting"]],
    [/ডেডিকেটেড|ডেডিকেট|\bdedicated\b/iu, ["dedicated"]],
    [/সার্ভার|\bservers?\b/iu, ["server"]],
    [/আরডিপি|আর\s*ডি\s*পি|\brdp\b/iu, ["rdp"]],
    [/বিডিআইএক্স|বিডিআইক্স|বিডিআইএক্স|বিডিক্স|\bbdix\b/iu, ["bdix"]],
    [/ডিডিআর৪|ডিডিআর4|\bddr4\b/iu, ["ddr4"]],
    [/সিঙ্গাপুর|\bsingapore\b|\bsg\b/iu, ["sg"]],
    [/রিসেলার|\breseller\b/iu, ["reseller"]],
    [/রাইজেন|রাইজন|\bryzen\b/iu, ["ryzen"]],
    [/মেমরি|মেমোরি|\bmemory\b/iu, ["memory"]],
    [/র‍্যাম|র‌্যাম|র্যাম|রেম|\bram\b/iu, ["ram", "memory"]],
    [/সিপিইউ|প্রসেসর|\bcpu\b|\bprocessor\b/iu, ["cpu"]],
    [/দাম|মূল্য|খরচ|চার্জ|\bprices?\b|\bcost\b|\bcheapest\b|\b(?:dam|daam|mullo|khoroch|koto)\b/iu, ["price"]],
    [/প্ল্যান|প্যাকেজ|\bplans?\b|\bpackages?\b/iu, ["plan"]],
    [/মাসিক|প্রতি মাস|মাসে|\bmonthly\b|\bmonth\b|\bmasik\b/iu, ["month"]],
    [/বার্ষিক|বছরে|বাৎসরিক|\byearly\b|\bannual\b|\byear\b|\bbatshorik\b/iu, ["year"]],
    [/রিফান্ড|ফেরত|মূল্যফেরত|\brefund/iu, ["refund"]],
    [/গোপনীয়|গোপনীয়|প্রাইভেসি|\bprivacy\b/iu, ["privacy"]],
    [/ব্যাকআপ|ব্যাক আপ|\bbackups?\b/iu, ["backup"]],
    [/এসএসএল|সার্টিফিকেট|\bssl\b|\bcertificate/iu, ["ssl", "certificate"]],
    [/ডোমেইন|ডোমেন|\bdomains?\b/iu, ["domain"]],
    [/ডিএনএস|\bdns\b/iu, ["dns"]],
    [/সিপ্যানেল|সি প্যানেল|\bcpanel\b/iu, ["cpanel"]],
    [/ব্যান্ডউইথ|ব্যান্ডউইডথ|\bbandwidth\b/iu, ["bandwidth"]],
    [/স্টোরেজ|ডিস্ক|\bstorage\b|\bdisk\b/iu, ["storage"]],
    [/পেমেন্ট|বিলিং|\bbilling\b|\bpayment/iu, ["payment"]],
    [/বাতিল|ক্যানসেল|\bcancell?/iu, ["cancellation"]],
    [/গেমিং|গেম|\bgaming\b|\bgames?\b/iu, ["gaming"]],
    [/ওয়েব ডিজাইন|ওয়েব ডিজাইন|\bweb design\b|ওয়েবসাইট বান|ওয়েবসাইট বান/iu, ["design"]],
    [/স্ট্যান্ডার্ড|\bstandard\b/iu, ["standard"]],
];
const stop = new Set("a an the is are do does can i we you your our my me it this that what which how much tell about please have of for in on and or to with from be as at by us will would should has any available service services details information plan price month year কি কী কত আমি আমার আপনার আপনাদের আমাদের আমাকে আছে হবে চাই করে করতে একটি এবং জন্য সম্পর্কে বলুন জানান দয়া দয়া করে বিস্তারিত".split(" "));
function normalize(text) {
    return text.normalize("NFKC").toLowerCase().replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
}
function mentionsPlan(text, name) {
    const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(normalize(text));
}
function tokenize(text) {
    return normalize(text).match(/[\p{L}\p{M}\p{N}]+(?:[-.][\p{L}\p{M}\p{N}]+)*/gu)?.filter((term) => !stop.has(term)) ?? [];
}
function expand(text) {
    return [...new Set([...tokenize(text), ...aliases.flatMap(([pattern, terms]) => pattern.test(text) ? terms : [])])];
}
function splitText(text, maxBytes = MAX_CHUNK_BYTES) {
    const chunks = [];
    let current = "";
    // Preserve words and punctuation; never cut inside a UTF-16 surrogate pair.
    for (const word of text.trim().split(/\s+/u)) {
        if (encoder.encode(`${current} ${word}`).length > maxBytes && current) {
            chunks.push(current);
            current = "";
        }
        if (encoder.encode(word).length > maxBytes) {
            for (const character of word) {
                if (encoder.encode(current + character).length > maxBytes) {
                    chunks.push(current);
                    current = "";
                }
                current += character;
            }
        }
        else
            current += `${current ? " " : ""}${word}`;
    }
    if (current)
        chunks.push(current);
    return chunks;
}
function buildCorpus() {
    const chunks = [];
    for (const page of pageData) {
        const add = (kind, title, content, extra = {}) => {
            for (const text of splitText(content))
                chunks.push({ id: `${page.slug}-${chunks.length}`, slug: page.slug, kind, title: (title || page.title).slice(0, 180), content: text, ...extra });
        };
        add("overview", page.title, [page.title, page.description, page.warning, ...page.notices].filter(Boolean).join("\n"));
        for (const plan of page.plans) {
            add("plan", `${page.title} — ${plan.name}`, `Service: ${page.title}. Plan: ${plan.name}. Published price: ${plan.currency || "৳"}${plan.price}/${plan.period}. Specifications: ${plan.features.join("; ")}.${page.warning ? ` Important: ${page.warning}` : ""}`, { price: plan.price, period: plan.period });
        }
        for (const faq of page.faqs)
            add("faq", `${page.title} — ${faq.question}`, `Question: ${faq.question}\nAnswer: ${faq.answer}`);
        for (const feature of page.features)
            add("feature", `${page.title} — ${feature.title}`, `${feature.title}: ${feature.description}`);
        for (const table of page.tables) {
            for (const row of table.rows)
                add("table", `${page.title} — ${table.title}: ${row[0]}`, `${row[0]}: ${row.slice(1).map((cell, index) => `${table.headers[index + 1]} = ${cell}`).join("; ")}`);
        }
        for (const section of page.textSections) {
            // Keep policy subsections together where possible, including short inline headings.
            let heading = section.title;
            let paragraphs = [];
            const flush = () => { if (paragraphs.length)
                add("policy", `${page.title} — ${heading}`, `${heading}\n${paragraphs.join("\n")}`); paragraphs = []; };
            for (const paragraph of section.paragraphs) {
                if (/^[০-৯\d]{1,2}[.।\s]/u.test(paragraph) && paragraph.length < 100) {
                    flush();
                    heading = paragraph;
                }
                else
                    paragraphs.push(paragraph);
            }
            flush();
        }
    }
    return chunks;
}
let cached;
function index() {
    if (cached)
        return cached;
    const frequency = new Map();
    const chunks = buildCorpus().map((chunk) => {
        const terms = new Map();
        const words = [...tokenize(chunk.content), ...expand(chunk.title), ...expand(chunk.title)];
        for (const word of words)
            terms.set(word, (terms.get(word) ?? 0) + 1);
        for (const word of terms.keys())
            frequency.set(word, (frequency.get(word) ?? 0) + 1);
        return { ...chunk, terms, length: words.length };
    });
    cached = { chunks, frequency, averageLength: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length };
    return cached;
}
function serviceSlugs(text) {
    const terms = new Set(expand(text));
    const pages = pageData.filter((page) => page.plans.length);
    const named = pages.filter((page) => page.plans.some((plan) => mentionsPlan(text, plan.name))).map((page) => page.slug);
    if (named.length)
        return named;
    const slugs = pages.map((page) => page.slug);
    if (terms.has("design"))
        return ["web-design"];
    if (terms.has("dedicated"))
        return ["dedicated-servers"];
    if (terms.has("vps") || terms.has("rdp")) {
        const family = terms.has("vps") ? "vps" : "rdp";
        if (terms.has("ddr4"))
            return [`ddr4-${family}`];
        if (terms.has("ryzen"))
            return [`amd-ryzen-${family}`];
        if (family === "vps" && terms.has("memory"))
            return ["m-bdix-vps"];
        if (family === "vps" && terms.has("cpu"))
            return ["c-bdix-vps"];
        if (/\bint\b|international|ইন্টারন্যাশনাল|আন্তর্জাতিক/iu.test(text))
            return ["int-vps-rdp"];
        if (family === "rdp" && terms.has("cpu"))
            return ["cpu-optimized-rdp"];
        return slugs.filter((slug) => slug.includes(family));
    }
    if (terms.has("reseller"))
        return ["reseller-hosting"];
    if (terms.has("sg"))
        return ["sg-web-hosting"];
    if (terms.has("hosting"))
        return ["web-hosting"];
    return [];
}
export function resolveLanguage(messages, preference = "auto") {
    if (preference !== "auto")
        return preference;
    for (const message of [...messages].reverse().filter((message) => message.role === "user")) {
        if (/\b(?:in|speak|reply|answer)\s+english\b|ইংরেজিতে/iu.test(message.content))
            return "en";
        if (/[\u0980-\u09ff]|\b(?:bangla|bengali|banglay|banglai|banglate)\b/iu.test(message.content) || (message.content.match(/\b(?:apnader|amar|koto|dam|daam|chai|ache)\b/giu)?.length ?? 0) >= 2)
            return "bn";
        if (tokenize(message.content).length > 2)
            return "en";
    }
    return "en";
}
export function retrieveBusinessContext(messages, language) {
    const users = messages.filter((message) => message.role === "user");
    const latest = users.at(-1)?.content ?? "";
    const previous = [...users.slice(0, -1)].reverse().find((message) => serviceSlugs(message.content).length);
    const currentSlugs = serviceSlugs(latest);
    const scope = currentSlugs.length ? currentSlugs : previous ? serviceSlugs(previous.content) : [];
    const terms = expand(latest);
    const queryTerms = new Map(terms.map((term) => [term, 1]));
    if (previous && (!currentSlugs.length || latest.trim().split(/\s+/u).length <= 4)) {
        for (const term of expand(previous.content))
            if (!queryTerms.has(term))
                queryTerms.set(term, 0.35);
    }
    const policy = terms.includes("refund") || terms.includes("cancellation") || terms.includes("payment") || terms.includes("privacy");
    const price = terms.includes("price") || terms.includes("plan");
    const meaningful = [...queryTerms.keys()].filter((term) => !["price", "plan", "month", "year"].includes(term));
    if (!meaningful.length)
        return { context: null, sources: [] };
    const corpus = index();
    const currentNamedPlan = corpus.chunks.some((chunk) => chunk.kind === "plan" && (!scope.length || scope.includes(chunk.slug)) && mentionsPlan(latest, chunk.title.split(" — ").at(-1)));
    const namedQuery = currentNamedPlan ? latest : `${latest} ${previous?.content ?? ""}`;
    const selectedPlan = corpus.chunks.some((chunk) => chunk.kind === "plan" && (!scope.length || scope.includes(chunk.slug)) && mentionsPlan(namedQuery, chunk.title.split(" — ").at(-1)));
    const scored = corpus.chunks.flatMap((chunk) => {
        if (policy ? chunk.slug !== (terms.includes("privacy") ? "privacy-policy" : "terms") : scope.length && !scope.includes(chunk.slug))
            return [];
        if (price && terms.includes("year") && chunk.kind === "plan" && chunk.period !== "year")
            return [];
        if (price && terms.includes("month") && chunk.kind === "plan" && chunk.period !== "month")
            return [];
        if (selectedPlan && chunk.kind === "plan" && !mentionsPlan(namedQuery, chunk.title.split(" — ").at(-1)))
            return [];
        let score = 0;
        for (const [term, weight] of queryTerms) {
            const tf = chunk.terms.get(term) ?? 0;
            if (!tf)
                continue;
            const df = corpus.frequency.get(term) ?? 0;
            const idf = Math.log(1 + (corpus.chunks.length - df + 0.5) / (df + 0.5));
            score += weight * idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * chunk.length / corpus.averageLength));
        }
        if (!score || !meaningful.some((term) => chunk.terms.has(term)))
            return [];
        if (price && chunk.kind === "plan")
            score += 8;
        if (policy && scope.length) {
            const titleTerms = expand(chunk.title);
            if (scope.includes("dedicated-servers") && titleTerms.includes("vps"))
                return [];
            if (scope.some((slug) => slug.includes("vps")) && titleTerms.includes("dedicated"))
                return [];
            if (scope.some((slug) => slug.includes("vps")) && titleTerms.includes("vps"))
                score += 7;
            if (scope.includes("dedicated-servers") && titleTerms.includes("dedicated"))
                score += 7;
        }
        // Match a selected plan before applying generic cheapest-plan ordering.
        const planName = chunk.kind === "plan" ? chunk.title.split(" — ").at(-1) : "";
        const named = Boolean(planName && mentionsPlan(namedQuery, planName));
        if (named)
            score += 30;
        if (language === "bn" && /[\u0980-\u09ff]/u.test(chunk.content))
            score += 1;
        return [{ chunk, score, named }];
    });
    scored.sort((a, b) => {
        if (price && a.chunk.kind === "plan" && b.chunk.kind === "plan" && !a.named && !b.named) {
            // Compare prices only within the same billing period.
            if (a.chunk.period === b.chunk.period && (scope.length || /cheapest|lowest|সস্তা|সবচেয়ে কম|সবচেয়ে কম/iu.test(latest)))
                return a.chunk.price - b.chunk.price || b.score - a.score;
        }
        return b.score - a.score;
    });
    const sources = [];
    const passages = [];
    for (const { chunk } of scored) {
        if (sources.length >= 3)
            break;
        const number = sources.length + 1;
        const passage = `[${number}] ${chunk.title}\n${chunk.content}`;
        if (encoder.encode([...passages, passage].join("\n\n")).length > MAX_CONTEXT_BYTES)
            continue;
        sources.push({ id: number, title: chunk.title, url: `/${chunk.slug}` });
        passages.push(passage);
    }
    return { context: passages.length ? passages.join("\n\n") : null, sources };
}
