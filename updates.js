/* Check metadata only. Extension code is always updated manually by the user. */
(() => {
  'use strict';
  const API = 'https://api.github.com/repos/ToxaSM/vk-copy-post/releases/latest';
  const RELEASES = 'https://github.com/ToxaSM/vk-copy-post/releases';
  const ALARM = 'vk-copy-check-updates';
  const NOTIFICATION = 'vk-copy-new-version';
  const DAY = 24 * 60 * 60 * 1000;
  let pending;
  function versionParts(value) {
    if (typeof value !== 'string' || !/^v?\d+(?:\.\d+){0,3}$/.test(value)) return null;
    const parts = value.replace(/^v/, '').split('.').map(Number);
    return parts.every(n => Number.isInteger(n) && n >= 0 && n <= 65535) ? parts : null;
  }
  function compare(a, b) {
    const left = versionParts(a), right = versionParts(b);
    if (!left || !right) throw new Error('Некорректный номер версии');
    for (let i = 0; i < 4; i++) {
      const difference = (left[i] || 0) - (right[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }
  async function checkOnce(manual) {
    const { notifyUpdates = true } = await chrome.storage.sync.get({ notifyUpdates: true });
    const state = await chrome.storage.local.get({ updateState: {}, notifiedVersion: '0', lastUpdateAttempt: 0 });
    if (!manual && (!notifyUpdates || Date.now() - state.lastUpdateAttempt < DAY)) return state.updateState;
    await chrome.storage.local.set({ lastUpdateAttempt: Date.now() });
    let updateState;
    try {
      const response = await fetch(API, {
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000)
      });
      if (response.status === 404) {
        updateState = { checkedAt: Date.now(), status: 'no-releases' };
      } else {
        if (!response.ok) throw new Error(`GitHub ответил кодом ${response.status}`);
        const release = await response.json();
        if (release.draft || release.prerelease || !versionParts(release.tag_name)) throw new Error('GitHub вернул неподходящий релиз');
        const version = release.tag_name.replace(/^v/, '');
        const available = compare(version, chrome.runtime.getManifest().version) > 0;
        updateState = {
          checkedAt: Date.now(), status: available ? 'available' : 'current', version,
          url: `${RELEASES}/tag/${encodeURIComponent(release.tag_name)}`
        };
      }
    } catch {
      globalThis.VKCopyDiagnostics?.record({ source: 'updates', code: 'update_failed', stage: 'network' }).catch(() => {});
      updateState = { ...state.updateState, checkedAt: Date.now(), status: 'error' };
    }
    await chrome.storage.local.set({ updateState });
    if (updateState.status === 'available' && notifyUpdates && compare(updateState.version, state.notifiedVersion) > 0) {
      // Re-read the preference: the user may disable notifications while fetch is pending.
      const preference = await chrome.storage.sync.get({ notifyUpdates: true });
      if (preference.notifyUpdates) {
        try {
          await chrome.notifications.create(NOTIFICATION, {
            type: 'basic', iconUrl: chrome.runtime.getURL('icon.png'),
            title: `🆕 VK Copy Post: новая версия ${updateState.version}`,
            message: 'Скачайте ZIP с GitHub, замените файлы расширения и перезагрузите его в chrome://extensions.',
            buttons: [{ title: 'Открыть релиз' }, { title: 'Как обновить' }]
          });
          await chrome.storage.local.set({ notifiedVersion: updateState.version });
        } catch {
          globalThis.VKCopyDiagnostics?.record({ source: 'updates', code: 'notification_failed', stage: 'notification' }).catch(() => {});
        }
      }
    }
    return updateState;
  }
  function check(manual = false) {
    if (pending) return pending;
    pending = checkOnce(manual).finally(() => { pending = null; });
    return pending;
  }
  async function ensureAlarm() {
    const { notifyUpdates } = await chrome.storage.sync.get({ notifyUpdates: true });
    if (!notifyUpdates) { await chrome.alarms.clear(ALARM); return; }
    if (!await chrome.alarms.get(ALARM)) {
      await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
    }
  }
  async function openRelease() {
    const { updateState = {} } = await chrome.storage.local.get('updateState');
    // Only allow this repository, even if extension storage was edited manually.
    const prefix = `${RELEASES}/tag/`;
    const url = typeof updateState.url === 'string' && updateState.url.startsWith(prefix) ? updateState.url : RELEASES;
    await chrome.tabs.create({ url });
    await chrome.notifications.clear(NOTIFICATION);
  }
  function start() {
    const backgroundCheck = () => { ensureAlarm().then(() => check()).catch(console.error); };
    chrome.runtime.onInstalled.addListener(backgroundCheck);
    chrome.runtime.onStartup.addListener(backgroundCheck);
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM) check().catch(console.error);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.notifyUpdates) return;
      ensureAlarm().then(async () => {
        if (changes.notifyUpdates.newValue === false) await chrome.notifications.clear(NOTIFICATION);
        else await check();
      }).catch(console.error);
    });
    chrome.notifications.onClicked.addListener(id => {
      if (id === NOTIFICATION) openRelease().catch(console.error);
    });
    chrome.notifications.onButtonClicked.addListener((id, index) => {
      if (id !== NOTIFICATION) return;
      if (index === 0) openRelease().catch(console.error);
      else chrome.runtime.openOptionsPage().catch(console.error);
    });
    chrome.runtime.onMessage.addListener((request, sender, respond) => {
      // The options page can check manually; VK content scripts cannot trigger requests.
      if (request.action !== 'check_updates' || sender.url !== chrome.runtime.getURL('options.html')) return;
      check(true).then(result => respond({ ok: true, result }), () => respond({ ok: false }));
      return true;
    });
    // Restore alarms after a service-worker restart without postponing an existing alarm.
    ensureAlarm().catch(console.error);
  }
  globalThis.VKCopyUpdates = { compare, check, ensureAlarm, start };
})();
