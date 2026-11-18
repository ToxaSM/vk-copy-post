/* Local, bounded diagnostics. Never store page content, URLs or raw exceptions. */
(() => {
  const SOURCES = new Set(['content', 'background', 'updates']);
  const CODES = new Set(['copy_started', 'copy_ok', 'copy_failed', 'no_posts', 'connection_failed', 'settings_failed', 'update_failed', 'notification_failed', 'menu_trigger', 'menu_added', 'menu_not_found', 'button_added']);
  const STAGES = new Set(['locate', 'expand', 'settings', 'convert', 'clipboard', 'message', 'network', 'notification']);
  let queue = Promise.resolve();
  async function read() {
    const { diagnosticLogs = [] } = await chrome.storage.local.get('diagnosticLogs');
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return Array.isArray(diagnosticLogs) ? diagnosticLogs.filter(entry => entry && Date.parse(entry.time) >= cutoff).slice(-50) : [];
  }
  function record(event) {
    if (!event || !SOURCES.has(event.source) || !CODES.has(event.code)) return Promise.resolve();
    const entry = { time: new Date().toISOString(), version: chrome.runtime.getManifest().version, source: event.source, code: event.code };
    if (STAGES.has(event.stage)) entry.stage = event.stage;
    for (const key of ['posts', 'images']) {
      if (Number.isInteger(event[key]) && event[key] >= 0) entry[key] = Math.min(event[key], 10000);
    }
    queue = queue.catch(() => {}).then(async () => {
      const logs = await read();
      await chrome.storage.local.set({ diagnosticLogs: [...logs, entry].slice(-50) });
    });
    return queue;
  }
  async function report() {
    await queue.catch(() => {});
    const logs = await read();
    return JSON.stringify({ extensionVersion: chrome.runtime.getManifest().version, events: logs.slice(-20) }, null, 2);
  }
  function start() {
    chrome.runtime.onMessage.addListener((request, sender, respond) => {
      if (request.action === 'record_diagnostic') {
        if (sender.id !== chrome.runtime.id || !/^https?:\/\/([\w-]+\.)?vk\.(com|ru)\//.test(sender.url || '')) return;
        // Content scripts may only submit their own finite, sanitised event schema.
        record({ ...request.event, source: 'content' }).then(() => respond({ ok: true }), () => respond({ ok: false }));
        return true;
      }
      if (request.action === 'get_diagnostics' && sender.url === chrome.runtime.getURL('options.html')) {
        report().then(text => respond({ ok: true, text }), () => respond({ ok: false }));
        return true;
      }
    });
  }
  globalThis.VKCopyDiagnostics = { record, report, start };
})();
