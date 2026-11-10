let chat;
let loadingChat;
let navigation;
let displayedPath = location.pathname;
let selectedService = 0;
let billing = 'month';
const launcher = document.getElementById('chat-launcher');

async function toggleChat() {
  if (chat) return chat.toggle();
  if (loadingChat) return;
  launcher.disabled = true;
  launcher.setAttribute('aria-busy', 'true');
  loadingChat = (async () => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/assets/chat.css';
    const styled = new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; });
    document.head.append(style);
    const [module] = await Promise.all([import('./chat.js'), styled]);
    chat = module.createChat(launcher);
    chat.toggle();
  })();
  try { await loadingChat; }
  catch {
    launcher.title = 'Could not load AI support. Check your connection and try again.';
    let error = document.getElementById('chat-load-error');
    if (!error) { error = document.createElement('p'); error.id = 'chat-load-error'; error.className = 'chat-load-error'; error.setAttribute('role', 'alert'); launcher.before(error); }
    error.textContent = 'Could not load chat. Try again, or email support@serveranywhere.net.';
  } finally {
    launcher.disabled = false;
    launcher.removeAttribute('aria-busy');
    loadingChat = null;
  }
}
launcher.addEventListener('click', toggleChat);

function showPlans(index = selectedService, period = billing) {
  const panel = document.getElementById('hosting-panel');
  const template = document.getElementById(`plans-${index}-${period}`) || document.getElementById(`plans-${index}-month`);
  if (!panel || !template) return;
  selectedService = index;
  billing = period;
  panel.replaceChildren(template.content.cloneNode(true));
  panel.setAttribute('aria-labelledby', `service-tab-${index}`);
  document.querySelectorAll('[data-service]').forEach((tab) => {
    const active = Number(tab.dataset.service) === index;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function closeMenus() {
  document.querySelectorAll('.site-header details[open]').forEach((menu) => { menu.open = false; });
}

async function navigate(url, push = true) {
  navigation?.abort();
  const controller = new AbortController();
  navigation = controller;
  const timer = setTimeout(() => controller.abort('timeout'), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page unavailable');
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    const main = next.getElementById('main-content');
    if (!main) throw new Error('Page unavailable');
    controller.signal.throwIfAborted();
    document.getElementById('main-content').replaceWith(main);
    document.title = next.title;
    for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'link[rel="canonical"]']) {
      const value = next.querySelector(selector);
      document.querySelector(selector)?.remove();
      if (value) document.head.append(value);
    }
    if (push) history.pushState(null, '', url);
    displayedPath = url.pathname;
    selectedService = 0;
    billing = 'month';
    closeMenus();
    document.querySelectorAll('.site-header a[href]').forEach((link) => {
      const current = link.getAttribute('href') === url.pathname;
      link.classList.toggle('active', current);
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
    if (!chat?.isOpen()) { main.tabIndex = -1; main.focus({ preventScroll: true }); }
  } catch {
    // Native navigation is the fallback if a progressive page request fails.
    if (!controller.signal.aborted || controller.signal.reason === 'timeout') location.assign(url.href);
  } finally {
    clearTimeout(timer);
    if (navigation === controller) navigation = null;
  }
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const tab = event.target.closest('[data-service]');
  if (tab) return showPlans(Number(tab.dataset.service));
  const period = event.target.closest('[data-billing]');
  if (period) return showPlans(selectedService, period.dataset.billing);
  if (!event.target.closest('.site-header')) closeMenus();
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
  event.preventDefault();
  void navigate(url);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenus();
  if (!(event.target instanceof Element) || !event.target.matches('[data-service]')) return;
  const index = Number(event.target.dataset.service);
  const next = ({ ArrowRight: (index + 1) % 4, ArrowLeft: (index + 3) % 4, Home: 0, End: 3 })[event.key];
  if (next === undefined) return;
  event.preventDefault();
  showPlans(next);
  document.getElementById(`service-tab-${next}`).focus();
});
window.addEventListener('popstate', () => {
  if (location.pathname !== displayedPath) void navigate(new URL(location.href), false);
});
