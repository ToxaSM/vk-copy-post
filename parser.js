/* Shared by the content script and DOM regression tests. No remote code. */
(function (root) {
  'use strict';
  const POST = '[data-post-id], [data-testid="post"], [data-testid="post-content-container"], [id^="post-"], .post, ._post, article';
  const TEXT = ['.wall_post_text', '[data-testid="post-text"]', '[data-testid="post_text"]', '[data-testid="post-content-text"]', '[data-testid="post_content_text"]', '[data-testid="showmoretext-in-expanded"]', '[data-testid="showmoretext"]', '[id^="wpt"]', '[id^="text-"]', '[class*="PostText__"]', '[class*="PostText_text"]', '[class*="postText"]', '[class*="vkitPostText"]'];
  const MORE = '[data-id="showMoreButton"], [data-testid="showmoretext-after"], .wall_post_more, .v-wall-post__more, [class*="PostTextMore"]';
  const EXCLUDE = '.replies, .reply, [data-testid*="comment"], [class*="PostComments"], [class*="PostHeader"], [class*="PostFooter"], [class*="PostActions"], .post_header, .copy_quote, [data-vk-copy-ui]';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function stripHashtags(text) {
    // Keep URL fragments, C#, HTML entities and punctuation surrounding a tag.
    return text.replace(/(^|[\s(\[«„“.,!?;:])#[\p{L}\p{N}_]+(?:@[\p{L}\p{N}_.]+)?/gu, '$1');
  }
  function safeUrl(value, base = 'https://vk.com') {
    if (!value) return null;
    try {
      let url = new URL(value, base);
      if (/^https?:$/.test(url.protocol) && /(^|\.)vk\.(com|ru)$/.test(url.hostname) && url.pathname === '/away.php') {
        const to = url.searchParams.get('to');
        if (to) url = new URL(to);
      }
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function findText(post) {
    for (const selector of TEXT) {
      for (const el of post.querySelectorAll(selector)) {
        if (!el.closest(EXCLUDE) && el.textContent.trim()) return el;
      }
    }
    return null; // Never substitute the author, counters or comments for the post text.
  }
  function textHtml(element, removeHashtags) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll(`${MORE}, ${EXCLUDE}, script, style, button, [hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"]`).forEach(el => el.remove());
    const clean = text => {
      text = text.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\uFE0F\u200D]/gu, '');
      return removeHashtags ? stripHashtags(text) : text;
    };
    function walk(node) {
      if (node.nodeType === 3) return escape(clean(node.textContent));
      if (node.nodeType !== 1) return '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'IMG') return escape(clean(node.getAttribute('alt') || ''));
      if (node.tagName === 'A') {
        const label = node.textContent;
        if (label.trim().startsWith('#')) return escape(clean(label));
        const content = Array.from(node.childNodes, walk).join('');
        const href = safeUrl(node.getAttribute('href'), element.ownerDocument.baseURI);
        return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${content}</a>` : content;
      }
      const content = Array.from(node.childNodes, walk).join('');
      return content + (/^(P|DIV|LI)$/.test(node.tagName) ? '\n' : '');
    }
    return walk(clone).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().replace(/\n/g, '<br>\n');
  }
  function highRes(value) {
    const valid = safeUrl(value);
    if (!valid) return null;
    const url = new URL(valid);
    const sizes = (url.searchParams.get('as') || '').split(',').filter(s => /^\d+x\d+$/.test(s));
    if (sizes.length) url.searchParams.set('cs', sizes.sort((a,b) => parseInt(b) - parseInt(a))[0]);
    return url.href;
  }
  function images(post) {
    const urls = new Set();
    const selector = 'a[href*="photo"], [data-photo-id], [data-testid="photo"], [data-testid="photo_image"], [class*="PhotoAttachment"], [class*="PhotoPrimaryAttachment"]';
    for (const attachment of post.querySelectorAll(selector)) {
      if (attachment.closest(EXCLUDE)) continue;
      const imgs = attachment.matches('img') ? [attachment] : attachment.querySelectorAll('img');
      for (const img of imgs) {
        const srcset = (img.getAttribute('srcset') || '').split(/,\s*(?=https?:)/).map(part => part.trim().split(/\s+/)).sort((a,b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0));
        const src = img.getAttribute('data-src') || srcset[0]?.[0] || img.currentSrc || img.getAttribute('src');
        if (src) { const url = highRes(src); if (url) urls.add(url); }
      }
      if (!imgs.length) for (const el of [attachment, ...attachment.querySelectorAll('[style]')]) {
        const bg = el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage;
        const match = bg.match(/url\(["']?(.*?)["']?\)/);
        if (match) { const url = highRes(match[1]); if (url) urls.add(url); }
      }
    }
    return [...urls];
  }
  function isPost(post) {
    if (post.closest('.reply, .replies, [data-testid*="comment"]')) return false;
    if (post.querySelector('[data-ad-view], [data-ad-block-uid], .wall_marked_as_ads, [data-testid="post-ad-mark"], [class*="FCThumb"]')) return false;
    return Boolean(findText(post) || images(post).length);
  }
  function posts(doc) {
    const candidates = [...doc.querySelectorAll(POST)].filter(isPost);
    // Keep header, text and sibling photo attachments in the same record.
    return candidates.filter(post => !candidates.some(other => other !== post && other.contains(post)));
  }
  function html(post, settings = {}) {
    const text = textHtml(findText(post), settings.removeHashtags);
    const photos = images(post);
    if (!text && !photos.length) throw new Error('Текст и фотографии поста не найдены. Сообщите о проблеме в настройках.');
    return `<style type="text/css">\na,p,.toggle .toggle-content p {font-size:18px;}\ntable,th,td {border:1px solid black;border-collapse:collapse;}\ntable.center {width:820px;margin-left:auto;margin-right:auto;}\nimg {width:600px;height:auto;max-width:90vw;display:block;margin:15px auto;}\n.style-anons {font-size:18px;}\n</style>\n<div class="news-content">\n${text ? `<p>${text}</p>\n` : ''}${photos.map(src => `<img src="${escape(src)}" alt="Фотография" />\n`).join('')}</div>`;
  }
  root.VKCopyParser = { POST, MORE, TEXT, escape, stripHashtags, safeUrl, findText, textHtml, highRes, images, isPost, posts, html };
})(globalThis);
