(() => {
  'use strict';
  if (globalThis.vkCopyPostLoaded) return;
  globalThis.vkCopyPostLoaded = true;
  const parser = globalThis.VKCopyParser;
  let busy = false;
  const isMessagingPage = () => /^\/im(?:\/|$)/.test(location.pathname);
  function log(code, stage, details = {}) {
    chrome.runtime.sendMessage({ action: 'record_diagnostic', event: { code, stage, ...details } }).catch(() => {});
  }
  let showCopyButton = false;
  // Subscribe before reading storage so changes apply to every open VK tab.
  let buttonPreferenceChanged = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.showCopyButton) return;
    buttonPreferenceChanged = true;
    showCopyButton = changes.showCopyButton.newValue !== false;
    integrate();
  });
  chrome.storage.sync.get({ showCopyButton: true }).then(settings => {
    if (!buttonPreferenceChanged) showCopyButton = settings.showCopyButton !== false;
    integrate();
  }).catch(() => { log('settings_failed', 'settings'); });
  function toast(message, kind = 'success') {
    document.getElementById('vk-copy-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'vk-copy-toast';
    el.dataset.vkCopyUi = 'true';
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.dataset.kind = kind;
    const colors = {success:'#16803c',error:'#b42318',progress:'#0077ff'};
    const icons = {success:'✅',error:'❌',progress:'⏳'};
    el.textContent = `${icons[kind]} ${message}`;
    el.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);box-sizing:border-box;width:max-content;max-width:min(560px,calc(100vw - 32px));padding:16px 24px;border-radius:10px;background:${colors[kind]};color:white;z-index:2147483647;font:15px/1.5 sans-serif;text-align:center;box-shadow:0 4px 20px #0003;`;
    document.body.append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3000);
  }
  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Old Chrome / unfocused tab */ }
    const area = document.createElement('textarea');
    const active = document.activeElement;
    area.value = value;
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area);
    area.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Буфер обмена недоступен. Откройте вкладку VK и повторите копирование.');
    } finally { area.remove(); active?.focus({ preventScroll: true }); }
  }
  async function processPost(post) {
    if (isMessagingPage()) throw new Error('Копирование постов недоступно в мессенджере VK.');
    if (busy) throw new Error('Копирование уже выполняется.');
    busy = true;
    let stage = 'expand';
    log('copy_started', stage);
    try {
      if (!post?.isConnected) throw new Error('Пост больше не на странице. Откройте его заново.');
      toast('Собираем текст и фотографии…', 'progress');
      let expanded = false;
      for (const button of post.querySelectorAll(parser.MORE)) {
        if (button.getClientRects().length) { button.click(); expanded = true; }
      }
      if (expanded) await new Promise(resolve => setTimeout(resolve, 800));
      stage = 'settings';
      const settings = await chrome.storage.sync.get({ removeHashtags: false });
      stage = 'convert';
      const html = parser.html(post, settings);
      stage = 'clipboard';
      await copyText(html);
      log('copy_ok', stage);
      toast('HTML-код скопирован!');
      return { ok: true };
    } catch (error) { log('copy_failed', stage); toast(error.message, 'error'); throw error; }
    finally { busy = false; }
  }
  function makeButton(post) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vk-copy-button';
    button.dataset.vkCopyUi = 'true';
    button.dataset.vkCopyButton = 'true';
    button.textContent = '📋';
    button.title = 'Скопировать HTML';
    button.setAttribute('aria-label', 'Скопировать HTML');
    button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:32px;height:32px;border:0;border-radius:6px;background:transparent;padding:4px;margin:0;cursor:pointer;font:20px/1 sans-serif;vertical-align:middle;';
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      processPost(post).catch(() => {});
    });
    return button;
  }
  function findShare(post) {
    const controls = post.querySelectorAll('[aria-label*="Поделиться"], [aria-label*="Репост"], .like_share, [data-testid="post_share"], [class*="vkuiIcon--share_outline"]');
    for (const candidate of controls) {
      if (candidate.closest('.reply, .replies, [data-testid*="comment"], [data-vk-copy-ui]')) continue;
      const control = candidate.matches('svg') ? candidate.closest('button, [role="button"], a') : candidate;
      if (control && post.contains(control)) return control;
    }
    return null;
  }
  function integrate() {
    if (!showCopyButton || isMessagingPage()) {
      document.querySelectorAll('[data-vk-copy-button]').forEach(button => button.remove());
      return;
    }
    const retained = new Set();
    for (const post of parser.posts(document)) {
      const share = findShare(post);
      if (!share) continue;
      let button = share.nextElementSibling;
      if (!button?.matches('[data-vk-copy-button]') || button.vkCopyPost !== post) {
        button = makeButton(post);
        button.vkCopyPost = post;
        share.after(button);
        log('button_added', 'locate');
      }
      retained.add(button);
    }
    document.querySelectorAll('[data-vk-copy-button]').forEach(button => {
      if (!retained.has(button)) button.remove();
    });
  }
  let scheduled = false;
  const observer = new MutationObserver(mutations => {
    if (scheduled || mutations.every(m => m.target.nodeType === 1 && m.target.closest('[data-vk-copy-ui]'))) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; integrate(); }, 150);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-post-id', 'data-testid', 'class', 'style', 'hidden', 'aria-hidden', 'aria-label'] });
  window.addEventListener('popstate', integrate);
  window.addEventListener('hashchange', integrate);
  integrate();
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request.action !== 'copy_first_post') return;
    if (isMessagingPage()) { respond({ ok: false, error: 'Копирование постов недоступно в мессенджере VK.' }); return; }
    const post = parser.posts(document).find(el => el.getClientRects().length);
    if (!post) {
      log('no_posts', 'locate', { posts: 0 });
      const error = 'Посты не найдены. Откройте запись VK. Сообщить о проблеме можно в настройках расширения.';
      toast(error, 'error'); respond({ ok: false, error }); return;
    }
    processPost(post).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  });
})();
