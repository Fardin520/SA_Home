export const MAX_USER_LENGTH = 1000;
export const MAX_REPLY_LENGTH = 4000;
export const MAX_HISTORY_MESSAGES = 7;
export const MAX_HISTORY_BYTES = 4000;
export const MAX_BODY_BYTES = 24_000;
export function historyBytes(messages) {
    return messages.reduce((total, message) => total + new TextEncoder().encode(message.content).length, 0);
}
// Drop whole exchanges so the visible history and model context stay aligned.
export function boundHistory(messages) {
    const result = [...messages];
    while (result.length > 1 && (result.length > MAX_HISTORY_MESSAGES || historyBytes(result) > MAX_HISTORY_BYTES)) {
        result.splice(0, 2);
    }
    return result;
}
