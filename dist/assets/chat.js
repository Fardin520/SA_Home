import { boundHistory, MAX_USER_LENGTH, MAX_REPLY_LENGTH } from './chat-shared.js';
import { isRecord, readJsonLines } from './json-lines.js';

const shapes = {
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2m16 0h2m-7-1v2m-6-2v2"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  send: '<path d="m22 2-7 20-4-9L2 9Z"/><path d="M22 2 11 13"/>',
  stop: '<rect width="16" height="16" x="4" y="4" rx="2"/>',
  trash: '<path d="M3 6h18m-2 0v14H5V6m4 0V3h6v3M10 10v6m4-6v6"/>',
  retry: '<path d="M3 11a9 9 0 1 1 2.8 6.5M3 3v8h8"/>',
};
const symbol = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;

// The panel and this module load only after the user opens the launcher.
export function createChat(launcher) {
  document.getElementById('chat-load-error')?.remove();
  const panel = document.createElement('section');
  panel.id = 'support-chat';
  panel.className = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'support-chat-title');
  panel.innerHTML = `<header class="chat-header"><span class="chat-botIcon">${symbol('bot', 23)}</span><div><h2 id="support-chat-title">Server Anywhere AI</h2><p role="status" id="chat-status">Connects when you send a message</p></div><button class="chat-iconButton" type="button" aria-label="Close chat window">${symbol('close', 20)}</button></header>
<div class="chat-toolbar"><label class="chat-language">Reply language<select aria-label="Reply language"><option value="auto">Auto</option><option value="bn">বাংলা</option><option value="en">English</option></select></label><button type="button" id="chat-clear">${symbol('trash', 13)}Clear conversation</button></div>
<div class="chat-conversation" role="log" aria-label="Conversation" aria-live="off"><div class="chat-welcome">${symbol('bot', 26)}<h3>How can I help?</h3><p>I’m an AI assistant. I search our published plans, FAQs and policies to help with your service questions. For accounts or live billing, contact <a href="mailto:support@serveranywhere.net">human support</a>.</p><p lang="bn">বাংলা বা English—দুই ভাষাতেই প্রশ্ন করুন।</p></div><div class="chat-suggestions"></div><p class="chat-notice" hidden></p><div id="chat-messages"></div><p class="chat-progress" hidden>Preparing your reply…</p></div>
<p class="sr-only" role="status" aria-live="polite" id="chat-announcement"></p><div class="chat-error" role="alert" hidden></div><button class="chat-retry" type="button" hidden>${symbol('retry', 14)}Retry last question</button>
<form class="chat-composer"><label class="sr-only" for="support-chat-input">Your hosting question</label><textarea id="support-chat-input" maxlength="1000" rows="2" placeholder="Ask a hosting question…" aria-describedby="support-chat-hint"></textarea><button class="chat-sendButton" type="submit" aria-label="Send message" disabled>${symbol('send')}</button><p id="support-chat-hint">0/1000 · Shift+Enter for a new line</p></form><p class="chat-disclaimer">AI can make mistakes. Avoid sharing secrets. Chat stays in memory until you clear it or reload.</p>`;
  launcher.before(panel);
  launcher.setAttribute('aria-controls', panel.id);
  const find = (selector) => panel.querySelector(selector);
  const input = find('textarea');
  const button = find('.chat-sendButton');
  const language = find('select');
  const clear = find('#chat-clear');
  const area = find('[role="log"]');
  const list = find('#chat-messages');
  const status = find('#chat-status');
  const alert = find('[role="alert"]');
  const notice = find('.chat-notice');
  const retry = find('.chat-retry');
  const progress = find('.chat-progress');
  const announcement = find('#chat-announcement');
  const suggestions = find('.chat-suggestions');
  let messages = [];
  let active;
  let followScroll = true;
  let lastQuestion = '';

  function scroll() { if (followScroll && !panel.hidden) area.scrollTop = area.scrollHeight; }
  area.addEventListener('scroll', () => { followScroll = area.scrollHeight - area.scrollTop - area.clientHeight < 80; });

  function bubble(message) {
    const node = document.createElement('div');
    node.className = `chat-message chat-${message.role === 'user' ? 'customer' : 'assistant'}`;
    const speaker = document.createElement('span');
    speaker.className = 'chat-speaker';
    speaker.textContent = message.role === 'user' ? 'You' : 'AI assistant';
    const text = document.createElement('p');
    const detail = document.createElement('small');
    const sources = document.createElement('nav');
    sources.className = 'chat-sources';
    sources.setAttribute('aria-label', 'Website sources');
    node.append(speaker, text, detail, sources);
    list.append(node);
    message.nodes = { text, detail, sources };
    update(message);
  }

  function update(message) {
    const { text, detail } = message.nodes;
    // Customer and model text are always textContent, never interpreted as HTML.
    text.textContent = message.content || (message.status === 'active' ? 'Preparing your reply…' : 'No reply received.');
    text.lang = /[\u0980-\u09ff]/u.test(message.content) ? 'bn' : 'en';
    detail.textContent = ({ stopped: 'Generation stopped. This reply may be incomplete.', error: message.content ? 'Reply interrupted.' : '', limited: 'Reply limit reached. Ask a follow-up for more detail.' })[message.status] || '';
    detail.hidden = !detail.textContent;
    message.nodes.sources.hidden = !message.sources?.length;
    scroll();
  }

  function addSources(message, sources) {
    if (!Array.isArray(sources) || sources.length > 3) throw new Error('We could not read the website sources. Please retry.');
    message.sources = sources.map((source) => {
      if (!isRecord(source) || !Number.isInteger(source.id) || source.id < 1 || source.id > 3 || typeof source.title !== 'string' || source.title.length > 500 || typeof source.url !== 'string' || !/^\/[a-z0-9-]+$/.test(source.url)) throw new Error('We could not read the website sources. Please retry.');
      return source;
    });
    message.nodes.sources.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'Website sources';
    message.nodes.sources.append(label);
    for (const source of message.sources) {
      const link = document.createElement('a');
      link.href = source.url;
      link.textContent = `[${source.id}] ${source.title}`;
      message.nodes.sources.append(link);
    }
    update(message);
  }

  function controls() {
    const busy = Boolean(active);
    input.disabled = language.disabled = busy;
    clear.disabled = busy || !messages.length;
    button.type = busy ? 'button' : 'submit';
    button.setAttribute('aria-label', busy ? 'Stop generation' : 'Send message');
    button.innerHTML = symbol(busy ? 'stop' : 'send');
    button.disabled = !busy && !input.value.trim();
    progress.hidden = !busy;
    suggestions.hidden = Boolean(messages.length);
    find('#support-chat-hint').textContent = `${input.value.length}/1000 · Shift+Enter for a new line`;
  }

  async function send(text, isRetry = false) {
    const content = text.trim();
    if (!content || content.length > MAX_USER_LENGTH || active) return;
    const controller = new AbortController();
    active = controller;
    lastQuestion = content;
    alert.hidden = retry.hidden = true;
    status.textContent = 'Connecting to AI…';
    announcement.textContent = 'AI is generating a reply.';
    input.value = '';
    followScroll = true;
    let previous = messages;
    const replaced = previous.at(-1)?.role === 'assistant' && (!previous.at(-1).content || isRetry);
    if (replaced) previous = previous.slice(0, -2);
    const full = [...previous, { role: 'user', content }];
    const history = boundHistory(full);
    const reply = { role: 'assistant', content: '', status: 'active', sources: [] };
    messages = [...history, reply];
    list.replaceChildren();
    messages.forEach(bubble);
    notice.textContent = history.length < full.length ? 'Older exchanges were removed to keep the conversation fast.' : replaced && !isRetry ? 'Your unanswered question was replaced by this message.' : '';
    notice.hidden = !notice.textContent;
    controls();
    scroll();
    let frame;
    let complete = false;
    let limited = false;
    const timeout = setTimeout(() => controller.abort('timeout'), 315000);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), language: language.value }), signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'The assistant is unavailable. Please try again shortly.');
      }
      if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('We could not read the reply. Please retry.');
      status.textContent = 'AI is responding…';
      for await (const event of readJsonLines(response.body)) {
        if (!isRecord(event)) throw new Error('The reply was interrupted. Please retry.');
        if (event.type === 'sources') addSources(reply, event.sources);
        else if (event.type === 'delta' && typeof event.text === 'string') {
          if (reply.content.length + event.text.length > MAX_REPLY_LENGTH) throw new Error('The reply exceeded its limit. Please retry.');
          reply.content += event.text;
          if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; update(reply); });
        } else if (event.type === 'done' && typeof event.limited === 'boolean') { complete = true; limited = event.limited; break; }
        else if (event.type === 'error' && typeof event.message === 'string') throw new Error(event.message);
        else throw new Error('The reply was interrupted. Please retry.');
      }
      if (!complete || !reply.content) { complete = false; throw new Error('The connection ended before the reply finished. Please retry.'); }
      status.textContent = 'AI connected · last request succeeded';
    } catch (failure) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') status.textContent = 'Generation stopped';
      else {
        alert.hidden = false;
        alert.textContent = controller.signal.reason === 'timeout' ? 'The assistant took too long. Please retry or ask a shorter question.' : failure instanceof Error && !['TypeError', 'SyntaxError'].includes(failure.name) ? failure.message : 'The connection was interrupted. Check your connection and try again.';
        status.textContent = 'AI unavailable · please retry';
      }
    } finally {
      clearTimeout(timeout);
      if (frame !== undefined) cancelAnimationFrame(frame);
      reply.status = complete ? limited ? 'limited' : 'complete' : controller.signal.aborted && controller.signal.reason !== 'timeout' ? 'stopped' : 'error';
      active = undefined;
      update(reply);
      controls();
      retry.hidden = complete;
      announcement.textContent = complete ? `AI assistant: ${reply.content}` : 'Generation stopped or interrupted.';
      if (!panel.hidden) input.focus();
    }
  }

  for (const question of ['What is VPS hosting?', 'How do I set up an SSL certificate?', 'আপনাদের হোস্টিংয়ের দাম কত?']) {
    const suggestion = document.createElement('button');
    suggestion.type = 'button';
    suggestion.textContent = question;
    suggestion.addEventListener('click', () => void send(question));
    suggestions.append(suggestion);
  }
  function close() {
    active?.abort();
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open AI support chat');
    launcher.focus();
  }
  find('.chat-iconButton').addEventListener('click', close);
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  input.addEventListener('input', controls);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(input.value); }
  });
  find('form').addEventListener('submit', (event) => { event.preventDefault(); void send(input.value); });
  button.addEventListener('click', () => { if (active) active.abort(); });
  retry.addEventListener('click', () => void send(lastQuestion, true));
  clear.addEventListener('click', () => {
    if (active) return;
    messages = [];
    list.replaceChildren();
    notice.hidden = alert.hidden = retry.hidden = true;
    status.textContent = 'Connects when you send a message';
    announcement.textContent = '';
    controls();
    input.focus();
  });
  window.addEventListener('pagehide', () => active?.abort());
  controls();
  return {
    isOpen: () => !panel.hidden,
    toggle() {
      if (!panel.hidden) return close();
      panel.hidden = false;
      launcher.setAttribute('aria-label', 'Close AI support chat');
      launcher.setAttribute('aria-expanded', 'true');
      input.focus();
      scroll();
    },
  };
}
