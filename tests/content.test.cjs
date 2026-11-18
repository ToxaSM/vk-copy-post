const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const postHtml = '<article><div class="wall_post_text">Новость #тег</div><div><div role="button" aria-label="0 Поделиться"><svg class="vkuiIcon--share_outline_24"></svg></div><span>Дата</span></div></article>';
async function setup(html = postHtml, showCopyButton = true) {
  const dom = new JSDOM(html, {url:'https://vk.ru/feed', runScripts:'outside-only', pretendToBeVisual:true});
  let listener, copied, storageChanged;
  dom.window.chrome = {
    storage:{sync:{get:async defaults => ({...defaults, removeHashtags:true, showCopyButton})},onChanged:{addListener:fn => {storageChanged=fn;}}},
    runtime:{sendMessage:async () => ({ok:true}),onMessage:{addListener:fn => {listener=fn;}}}
  };
  dom.window.HTMLElement.prototype.getClientRects = () => [1];
  Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async value => {copied=value;}}});
  dom.window.eval(read('parser.js'));
  dom.window.eval(read('content.js'));
  await Promise.resolve();
  return {dom, getCopied:()=>copied, setButtons:value=>storageChanged({showCopyButton:{newValue:value}},'sync'), message:()=>new Promise(resolve=>listener({action:'copy_first_post'},{},resolve))};
}
const waitDom = () => new Promise(resolve=>setTimeout(resolve,350));
test('emoji button is immediately after the actual SPA share element',async()=>{
  const s=await setup(read('tests/fixtures/vk-spa-menu.html'));
  try {
    const doc=s.dom.window.document;
    const share=doc.querySelector('[aria-label="0 Поделиться"]');
    const button=share.nextElementSibling;
    assert.equal(button.textContent,'📋');
    assert.equal(button.title,'Скопировать HTML');
    assert.equal(button.getAttribute('aria-label'),'Скопировать HTML');
    assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,1);
    assert.equal(doc.querySelector('[class*="SpaPostContextMenu"] [data-vk-copy-button]'),null);
    button.click(); await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(s.getCopied(),/Проверочный текст поста/);
    const toast=doc.getElementById('vk-copy-toast');
    assert.equal(toast.style.backgroundColor,'rgb(22, 128, 60)');
    assert.equal(toast.style.top,'24px'); assert.equal(toast.style.left,'50%');
  } finally {s.dom.window.close();}
});
test('toolbar copy and hashtag setting still work',async()=>{
  const s=await setup();try {
    assert.equal((await s.message()).ok,true);
    assert.match(s.getCopied(),/Новость/);assert.doesNotMatch(s.getCopied(),/#тег/);
  }finally{s.dom.window.close();}
});
test('clipboard failure reports red error and removes temporary textarea',async()=>{
  const s=await setup();try {
    s.dom.window.navigator.clipboard.writeText=async()=>{throw new Error('Denied');};
    s.dom.window.document.execCommand=()=>false;
    assert.equal((await s.message()).ok,false);
    assert.equal(s.dom.window.document.querySelector('textarea'),null);
    const toast=s.dom.window.document.getElementById('vk-copy-toast');
    assert.equal(toast.style.backgroundColor,'rgb(180, 35, 24)');assert.match(toast.textContent,/❌/);
  }finally{s.dom.window.close();}
});
test('visibility preference applies immediately and toolbar remains available',async()=>{
  const s=await setup(undefined,false);try {
    const doc=s.dom.window.document;
    assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,0);
    assert.equal((await s.message()).ok,true);
    s.setButtons(true);assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,1);
    s.setButtons(false);assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,0);
    doc.body.append(doc.createElement('span'));await waitDom();
    assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,0);
  }finally{s.dom.window.close();}
});
test('new and rerendered posts receive exactly one button after share',async()=>{
  const s=await setup();try {
    const doc=s.dom.window.document;
    s.dom.window.eval(read('content.js'));
    const holder=doc.createElement('div');holder.innerHTML=postHtml;doc.body.append(holder);
    await waitDom();assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,2);
    const share=doc.querySelector('[aria-label="0 Поделиться"]');
    const replacement=share.cloneNode(true);share.replaceWith(replacement);
    await waitDom();assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,2);
    assert.equal(replacement.nextElementSibling.dataset.vkCopyButton,'true');
  }finally{s.dom.window.close();}
});
test('messenger route removes buttons and rejects copying, then feed restores them',async()=>{
  const s=await setup();try {
    const doc=s.dom.window.document;
    for(const route of ['/im','/im?sel=123','/im/convo/123']){
      s.dom.window.history.pushState({},'',route);s.dom.window.dispatchEvent(new s.dom.window.PopStateEvent('popstate'));
      assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,0);
      assert.equal((await s.message()).ok,false);
    }
    s.dom.window.history.pushState({},'','/feed');s.dom.window.dispatchEvent(new s.dom.window.PopStateEvent('popstate'));
    assert.equal(doc.querySelectorAll('[data-vk-copy-button]').length,1);
  }finally{s.dom.window.close();}
});
test('comments and unrecognised elements do not receive buttons',async()=>{
  const s=await setup('<div data-testid="comment">'+postHtml+'</div><div role="button" aria-label="0 Поделиться"></div>');
  try{assert.equal(s.dom.window.document.querySelectorAll('[data-vk-copy-button]').length,0);assert.equal((await s.message()).ok,false);}
  finally{s.dom.window.close();}
});
