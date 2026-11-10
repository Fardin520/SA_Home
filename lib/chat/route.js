import { readJsonLines, isRecord } from "./json-lines.js";
import { ChatError, getChatConfig, getVerifiedBusinessContext, readChatRequest, systemPrompt } from "./server.js";
import { resolveLanguage } from "./retrieval.js";
import { MAX_REPLY_LENGTH } from "./shared.js";
let activeRequests = 0;
const headers = { "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" };
function errorResponse(status, message) {
    return Response.json({ error: message }, { status, headers });
}
export async function POST(request) {
    const origin = request.headers.get("origin");
    try {
        if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && new URL(origin).host !== request.headers.get("host"))) {
            return errorResponse(403, "Please open the assistant from this website.");
        }
    }
    catch {
        return errorResponse(403, "Please open the assistant from this website.");
    }
    let config;
    let chatRequest;
    try {
        config = getChatConfig();
        chatRequest = await readChatRequest(request);
    }
    catch (error) {
        return error instanceof ChatError ? errorResponse(error.status, error.message) : errorResponse(400, "We could not read your message. Please try again.");
    }
    if (activeRequests >= config.maxConcurrent)
        return errorResponse(429, "The assistant is busy. Please try again shortly.");
    activeRequests++;
    const abort = new AbortController();
    let timedOut = false;
    let released = false;
    const onDisconnect = () => abort.abort();
    request.signal.addEventListener("abort", onDisconnect, { once: true });
    if (request.signal.aborted)
        abort.abort();
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, config.timeout);
    function release() {
        if (released)
            return;
        released = true;
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onDisconnect);
        activeRequests--;
    }
    let upstream;
    const language = resolveLanguage(chatRequest.messages, chatRequest.language);
    let knowledge;
    try {
        knowledge = getVerifiedBusinessContext(chatRequest.messages, language);
        upstream = await fetch(config.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: "system", content: systemPrompt(knowledge.context, language) }, ...chatRequest.messages],
                stream: true,
                keep_alive: "5m",
                options: config.options,
            }),
            signal: abort.signal,
            cache: "no-store",
            redirect: "error",
        });
        if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel();
            throw new ChatError(503, upstream.status === 404 ? "The assistant's model is unavailable. Please contact support or try again later." : "The AI service is unavailable. Please try again later or contact support.");
        }
    }
    catch (error) {
        release();
        return errorResponse(error instanceof ChatError ? error.status : timedOut ? 504 : 503, error instanceof ChatError ? error.message : timedOut ? "The assistant took too long. Please try a shorter question." : "We cannot reach the AI assistant right now. Please try again later or email support@serveranywhere.net.");
    }
    const encoder = new TextEncoder();
    const iterator = readJsonLines(upstream.body);
    let replyLength = 0;
    let finished = false;
    let sentSources = false;
    const body = new ReadableStream({
        async pull(controller) {
            const emit = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            try {
                if (!sentSources) {
                    sentSources = true;
                    emit({ type: "sources", sources: knowledge.sources });
                    return;
                }
                while (!finished) {
                    const { value, done } = await iterator.next();
                    if (done)
                        throw new Error("Incomplete stream");
                    if (!isRecord(value) || value.error || typeof value.done !== "boolean" || !isRecord(value.message) || value.message.role !== "assistant" || typeof value.message.content !== "string")
                        throw new Error("Invalid upstream response");
                    const text = value.message.content.slice(0, MAX_REPLY_LENGTH - replyLength);
                    replyLength += text.length;
                    if (text)
                        emit({ type: "delta", text });
                    if (value.done || replyLength >= MAX_REPLY_LENGTH) {
                        if (!replyLength)
                            throw new Error("Empty response");
                        emit({ type: "done", limited: replyLength >= MAX_REPLY_LENGTH || value.done_reason === "length" });
                        finished = true;
                        abort.abort();
                        await iterator.return(undefined).catch(() => { });
                        release();
                        controller.close();
                        return;
                    }
                    if (text)
                        return;
                }
            }
            catch {
                if (!finished) {
                    finished = true;
                    abort.abort();
                    await iterator.return(undefined).catch(() => { });
                    release();
                    emit({ type: "error", message: timedOut ? "The assistant took too long. You can retry or ask a shorter question." : "The reply was interrupted. Please retry, or contact support if this continues." });
                    controller.close();
                }
            }
        },
        async cancel() {
            finished = true;
            abort.abort();
            await iterator.return(undefined).catch(() => { });
            release();
        },
    });
    return new Response(body, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
}
