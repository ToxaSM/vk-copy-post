const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../updates.js'), 'utf8');
function setup({ version = '3.1.0', tag = 'v3.2.0', status = 200, enabled = true, fail = false } = {}) {
  const local = {}, sync = { notifyUpdates: enabled }, notifications = [], tabs = [], events = {};
  let requests = 0, alarm, openedOptions = 0;
  const event = name => ({ addListener: fn => { events[name] = fn; } });
  const area = data => ({
    get: async keys => typeof keys === 'string' ? { [keys]: data[keys] } : { ...keys, ...data },
    set: async values => { Object.assign(data, values); }
  });
  const chrome = {
    storage: {local: area(local), sync: area(sync), onChanged: event('storage')},
    runtime: {
      getManifest: () => ({version}), getURL: name => `chrome-extension://test/${name}`,
      onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message'),
      openOptionsPage: async () => { openedOptions++; }
    },
    alarms: {get: async () => alarm, create: async (name, config) => {alarm = {name, ...config};}, clear: async () => {alarm = undefined;}, onAlarm: event('alarm')},
    notifications: {create: async (id, options) => {notifications.push({id, ...options});}, clear: async () => {}, onClicked: event('click'), onButtonClicked: event('button')},
    tabs: {create: async options => {tabs.push(options);}}
  };
  const context = vm.createContext({chrome, console, URL, AbortSignal, fetch: async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.github.com/repos/ToxaSM/vk-copy-post/releases/latest');
    assert.equal(options.credentials, 'omit');
    if (fail) throw new Error('Offline');
    return { status, ok: status === 200, json: async () => ({tag_name: tag, draft: false, prerelease: false, html_url: 'https://attacker.example/'}) };
  }});
  vm.runInContext(source, context);
  return {u:context.VKCopyUpdates, local, sync, notifications, events, tabs, requests: () => requests, alarm: () => alarm, openedOptions: () => openedOptions};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('versions compare numerically and tolerate omitted zero components', () => {
  const {u} = setup();
  assert.equal(u.compare('v3.10.0', '3.9.9'), 1);
  assert.equal(u.compare('3.1', '3.1.0.0'), 0);
  assert.equal(u.compare('3.0', '3.1'), -1);
  assert.throws(() => u.compare('3.2.0-beta', '3.1'));
  assert.throws(() => u.compare('99999.1', '3.1'));
});
test('new release notifies once per version and URL comes from the fixed repository', async () => {
  const s = setup();
  const state = await s.u.check(true);
  assert.equal(state.status, 'available');
  assert.equal(state.url, 'https://github.com/ToxaSM/vk-copy-post/releases/tag/v3.2.0');
  assert.equal(s.notifications.length, 1);
  await s.u.check(true);
  assert.equal(s.notifications.length, 1);
  assert.equal(s.local.notifiedVersion, '3.2.0');
});
test('automatic requests are throttled and simultaneous checks share one request', async () => {
  const s = setup();
  await Promise.all([s.u.check(), s.u.check()]);
  await s.u.check();
  assert.equal(s.requests(), 1);
});
test('current or older release never notifies', async () => {
  for (const tag of ['v3.1.0', 'v3.0.0']) {
    const s = setup({tag});
    assert.equal((await s.u.check(true)).status, 'current');
    assert.equal(s.notifications.length, 0);
  }
});
test('404 means no published releases; network failures and rate limits are recoverable', async () => {
  const s = setup({status:404});
  assert.equal((await s.u.check(true)).status, 'no-releases');
  for (const config of [{status:403}, {status:500}, {fail:true}, {tag:'v3.2.0-beta'}]) {
    const failure = setup(config);
    assert.equal((await failure.u.check(true)).status, 'error');
    assert.equal(failure.notifications.length, 0);
  }
});
test('disabled checks perform no background request but allow manual checks without notification', async () => {
  const s = setup({enabled:false});
  await s.u.check();
  assert.equal(s.requests(), 0);
  assert.equal((await s.u.check(true)).status, 'available');
  assert.equal(s.notifications.length, 0);
  await s.u.ensureAlarm();
  assert.equal(s.alarm(), undefined);
});
test('alarm persists across worker starts and click actions open the correct destination', async () => {
  const s = setup();
  await s.u.ensureAlarm();
  const alarm = s.alarm();
  await s.u.ensureAlarm();
  assert.equal(s.alarm(), alarm);
  assert.equal(alarm.periodInMinutes, 1440);
  await s.u.check(true);
  s.u.start();
  s.events.click('vk-copy-new-version');
  await tick();
  assert.equal(s.tabs[0].url, 'https://github.com/ToxaSM/vk-copy-post/releases/tag/v3.2.0');
  s.events.button('vk-copy-new-version', 1);
  await tick();
  assert.equal(s.openedOptions(), 1);
});
test('only extension options page can request manual checks', async () => {
  const s = setup();
  s.u.start();
  assert.equal(s.events.message({action:'check_updates'}, {url:'https://vk.ru/feed'}, () => {}), undefined);
  assert.equal(s.requests(), 0);
  const response = await new Promise(resolve => s.events.message({action:'check_updates'}, {url:'chrome-extension://test/options.html'}, resolve));
  assert.equal(response.ok, true);
  assert.equal(response.result.status, 'available');
});
