const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
test('report opens a reviewable GitHub form containing the local diagnostics', async () => {
  const root = path.join(__dirname, '..');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'options.html'), 'utf8'), {url:'chrome-extension://test/options.html', runScripts:'outside-only'});
  let opened;
  const diagnosticText = JSON.stringify({extensionVersion:'3.1.1', events:[{source:'content', code:'copy_failed', stage:'clipboard'}]}, null, 2);
  dom.window.chrome = {
    storage:{sync:{get:async defaults => defaults},local:{get:async () => ({})},onChanged:{addListener:() => {}}},
    runtime:{getManifest:() => ({version:'3.1.1'}),sendMessage:async () => ({ok:true,text:diagnosticText})},
    tabs:{create:async ({url}) => {opened=url;}}
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(root, 'options.js'), 'utf8'));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(dom.window.document.getElementById('diagnostics').textContent, /copy_failed/);
    dom.window.document.getElementById('report').click();
    await new Promise(resolve => setImmediate(resolve));
    const url = new URL(opened);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, '/ToxaSM/vk-copy-post/issues/new');
    assert.match(url.searchParams.get('body'), /copy_failed/);
    assert.match(url.searchParams.get('body'), /clipboard/);
    assert.ok(opened.length < 8000);
  } finally {dom.window.close();}
});
test('manual update checks show emoji and a colour state for each result', async () => {
  const root = path.join(__dirname, '..');
  for (const [status, kind, emoji] of [['current','success','✅'],['available','info','🆕'],['no-releases','warning','📦'],['error','error','❌']]) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'options.html'), 'utf8'), {url:'chrome-extension://test/options.html', runScripts:'outside-only'});
    let finishCheck;
    dom.window.chrome = {
      storage:{sync:{get:async defaults => defaults},local:{get:async () => ({})},onChanged:{addListener:() => {}}},
      runtime:{getManifest:() => ({version:'3.1.2'}),sendMessage:async request => request.action === 'get_diagnostics' ? {ok:true,text:'{}'} : new Promise(resolve => {finishCheck=resolve;})},
      tabs:{create:async () => {}}
    };
    try {
      dom.window.eval(fs.readFileSync(path.join(root, 'options.js'), 'utf8'));
      await new Promise(resolve => setImmediate(resolve));
      const doc = dom.window.document;
      doc.getElementById('checkUpdates').click();
      assert.match(doc.getElementById('updateStatus').textContent, /🔎/);
      finishCheck({ok:true,result:{status,version:'3.2.0'}});
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(doc.getElementById('updateStatus').dataset.kind, kind);
      assert.ok(doc.getElementById('updateStatus').textContent.includes(emoji));
      assert.equal(doc.getElementById('checkUpdates').disabled, false);
    } finally {dom.window.close();}
  }
});
