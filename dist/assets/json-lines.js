// Both hops use NDJSON. Decode bytes incrementally before separating records.
export async function* readJsonLines(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            let newline;
            while ((newline = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (line.length > 32_768)
                    throw new Error("Stream record too large");
                if (line)
                    yield JSON.parse(line);
            }
            if (buffer.length > 32_768)
                throw new Error("Stream record too large");
            if (done) {
                if (buffer.trim())
                    yield JSON.parse(buffer);
                return;
            }
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
