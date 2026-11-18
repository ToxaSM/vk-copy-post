const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../parser.js'), 'utf8');
function fixture(html) {
  const dom = new JSDOM(html, { url: 'https://vk.ru/wall-43029899_4841', runScripts: 'outside-only' });
  dom.window.eval(source);
  return { dom, p: dom.window.VKCopyParser, doc: dom.window.document };
}
test('legacy post: short text, paragraphs, safe links and escaped literal HTML', () => {
  const {p,doc} = fixture('<div class="post" id="post-1_2"><div class="wall_post_text">Да<br>&lt;script&gt; &amp; <a href="/club1">Школа</a><p>Абзац</p></div></div>');
  const html = p.html(p.posts(doc)[0]);
  assert.match(html, /Да<br>/);
  assert.match(html, /&lt;script&gt; &amp;/);
  assert.match(html, /href="https:\/\/vk.ru\/club1"/);
  assert.doesNotMatch(html, /<script>/);
});
test('nested modern containers preserve sibling photos and produce one post', () => {
  const {p,doc} = fixture('<article data-post-id="-1_2"><header class="PostHeader">Автор</header><div data-testid="post-content-container"><div data-testid="post_text">Пост</div></div><a href="/photo1_2"><img src="https://example.com/image.jpg"></a><div data-testid="comment"><div class="wall_post_text">Комментарий</div><a href="/photo1_3"><img src="https://example.com/comment.jpg"></a></div></article>');
  const posts = p.posts(doc);
  assert.equal(posts.length, 1);
  const html = p.html(posts[0]);
  assert.match(html, /image.jpg/);
  assert.doesNotMatch(html, /Автор|Комментарий|comment.jpg/);
});
test('hashtags toggle supports Cyrillic, community suffixes and keeps URL fragments', () => {
  const {p,doc} = fixture('<article><div data-testid="post-text">Новость #Школа_1@school (#Тест), <a href="/feed?q=tag">#Москва</a><br><a href="https://example.com/page#section">Ссылка</a> C# https://example.com/#anchor</div></article>');
  const post = p.posts(doc)[0];
  assert.match(p.html(post), /#Школа_1@school/);
  const html = p.html(post, { removeHashtags: true });
  assert.doesNotMatch(html, /#Школа|#Тест|#Москва/);
  assert.match(html, /page#section/);
  assert.match(html, /C# https:\/\/example.com\/#anchor/);
});
test('away.php is decoded once and dangerous protocols are dropped', () => {
  const {p,doc} = fixture('<article><div class="wall_post_text"><a href="/away.php?to=https%3A%2F%2Fexample.com%2F%3Fq%3D%2520%26x%3D1">Ссылка</a><a href="javascript:alert(1)">Опасная</a></div></article>');
  const html = p.html(p.posts(doc)[0]);
  assert.match(html, /href="https:\/\/example.com\/\?q=%20&amp;x=1"/);
  assert.doesNotMatch(html, /javascript:|onclick/);
  assert.match(html, /Опасная/);
});
test('photo-only posts: positive owner id, lazy images, srcset and duplicates', () => {
  const {p,doc} = fixture('<article><a href="/photo123_1"><img srcset="https://example.com/s.jpg 100w,https://example.com/l.jpg 800w"></a><a href="/photo123_1"><img data-src="https://example.com/l.jpg"></a></article>');
  const posts = p.posts(doc);
  assert.equal(posts.length, 1);
  const html = p.html(posts[0]);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /l.jpg/);
  assert.doesNotMatch(html, /Текст записи не найден/);
});
test('unknown markup fails instead of copying author, counters or comments', () => {
  const {p,doc} = fixture('<article><header>Очень длинное имя автора</header><div>100 комментариев</div></article>');
  assert.equal(p.posts(doc).length, 0);
  assert.throws(() => p.html(doc.querySelector('article')), /не найдены/);
});
test('ads and comments are not considered posts', () => {
  const {p,doc} = fixture('<article><i data-ad-view="1"></i><div class="wall_post_text">Реклама</div></article><div data-testid="comment"><article><div class="wall_post_text">Комментарий</div></article></div><article><div class="wall_post_text">Новость</div></article>');
  assert.equal(p.posts(doc).length, 1);
  assert.match(p.html(p.posts(doc)[0]), /Новость/);
});
test('high resolution photo and safe attribute escaping', () => {
  const {p} = fixture('');
  const url = new URL(p.highRes('https://example.com/a?as=100x200,800x600,400x400&x=1'));
  assert.equal(url.searchParams.get('cs'), '800x600');
  assert.equal(p.highRes('javascript:alert(1)'), null);
});
test('hidden content and show more controls are omitted, emojis removed', () => {
  const {p,doc} = fixture('<article><div class="wall_post_text">Текст 😀<img alt="❤️"><span hidden>Скрыто</span><a class="wall_post_more">Показать полностью</a></div></article>');
  const html = p.html(p.posts(doc)[0]);
  assert.match(html, /Текст/);
  assert.doesNotMatch(html, /Скрыто|Показать полностью|😀|❤️/);
});
