const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
  const data = {};
  const chrome = {
    storage: {local: {get: async () => data, set: async value => Object.assign(data, value)}},
    runtime: {getManifest: () => ({version:'3.1.1'})}
  };
  const context = vm.createContext({chrome});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../diagnostics.js'), 'utf8'), context);
  return {d:context.VKCopyDiagnostics, data};
}
test('diagnostics whitelist drops message text, URLs, exceptions and unknown fields', async () => {
  const {d} = setup();
  await d.record({source:'content', code:'copy_failed', stage:'clipboard', text:'SECRET', url:'https://vk.ru/im', stack:'PRIVATE', error:'sensitive', images:2});
  const report = await d.report();
  assert.match(report, /copy_failed/);
  assert.match(report, /clipboard/);
  assert.doesNotMatch(report, /SECRET|vk.ru|PRIVATE|sensitive/);
  assert.equal(JSON.parse(report).events[0].images, 2);
});
test('diagnostics are bounded, serialised and prune old entries', async () => {
  const {d, data} = setup();
  data.diagnosticLogs = [{time:'2020-01-01T00:00:00.000Z', source:'content', code:'copy_failed'}];
  await Promise.all(Array.from({length:60}, () => d.record({source:'content', code:'copy_ok'})));
  assert.equal(data.diagnosticLogs.length, 50);
  const report = JSON.parse(await d.report());
  assert.equal(report.events.length, 20);
  assert.ok(report.events.every(event => event.code === 'copy_ok'));
});
