chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractAndCopyVKPostData,
  });
});

function extractAndCopyVKPostData() {
  // 1. ПРОВЕРКА АДРЕСА ПРЯМО НА СТРАНИЦЕ (работает 100%)
  if (!window.location.hostname.includes("vk.com") && !window.location.hostname.includes("vk.ru")) {
    alert("Ошибка: Откройте страницу ВКонтакте");
    return;
  }

  function showToast(message, duration = 3000, color = "#28a745") {
    let existing = document.getElementById('vk-html-toast');
    if (existing) existing.remove();
    let toast = document.createElement('div');
    toast.id = 'vk-html-toast';
    toast.innerText = message;
    toast.style.cssText = `position:fixed; bottom:30px; right:30px; background:${color}; color:white; padding:15px 25px; border-radius:8px; z-index:9999999; font-family:sans-serif; font-size:16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: opacity 0.3s ease-in-out;`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, duration - 300);
    setTimeout(() => { toast.remove(); }, duration);
  }

  showToast("⚡ Собираем текст и фото...", 2000, "#0077FF");

  // 2. ИЗВЛЕЧЕНИЕ ТЕКСТА
  const textSelectors = ['.wk_text', '.PostText', '[class*="PostText"]', '.wall_post_text', '[class*="wall_post_text"]', 'div[data-testid="post-text"]', '[class*="vkitPostText"]', '.v-wall-post__text', '.pi_text'];

  let textEl = null;
  for (let selector of textSelectors) {
    let elements = document.querySelectorAll(selector);
    for (let el of elements) {
      if (el && el.innerText.trim().length > 0) { textEl = el; break; }
    }
    if (textEl) break;
  }

  let textRaw = textEl ? textEl.innerHTML : "Текст записи не найден.";

  textRaw = textRaw.replace(/<br\s*\/?>/gi, "\n");
  textRaw = textRaw.replace(/<\/p>|<\/div>/gi, "\n");
  textRaw = textRaw.replace(/<[^>]+>/g, "");
  textRaw = textRaw.replace(/Показать полностью\s*/gi, "");
  textRaw = textRaw.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "");
  textRaw = textRaw.trim().replace(/\n{2,}/g, "\n\n");

  let cleanTextHtml = textRaw.replace(/\n/g, "<br>\n");

  let htmlResult = `<style type="text/css">
a,p, .toggle .toggle-content p {font-size: 18px;}
table, th, td {
    border: 1px solid black;
    border-collapse: collapse;
}
table.center {
    width:820px;
    margin-left: auto;
    margin-right: auto;
}

img {
  width: 600px; 
  height: auto;
  max-width: 90vw;
  display: block;
  margin: 15px auto;
}

.style-anons {font-size: 18px;}
</style>

<div class="news-content">

<p>${cleanTextHtml}</p>\n\n`;

  let postContainer = textEl ? textEl.closest('.post, .wall_item, div[data-testid="post"], [class*="vkitPost__root"], div[class*="Post--"]') : document;
  if (!postContainer) postContainer = document;

  // 3. ИЗВЛЕЧЕНИЕ ФОТОГРАФИЙ
  let imageUrls = new Set();
  let photoLinks = postContainer.querySelectorAll('a[href*="photo-"], a[href*="z=photo"], a[data-photo-id]');

  photoLinks.forEach(link => {
    let img = link.querySelector('img');
    if (img) {
      let src = img.src || img.getAttribute('data-src');
      if (src && src.startsWith('http')) imageUrls.add(src);
    } else {
      let elements = link.querySelectorAll('*');
      [link, ...elements].forEach(node => {
        let bg = window.getComputedStyle(node).backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url')) {
          let match = bg.match(/url\(["']?(.*?)["']?\)/);
          if (match && match[1] && match[1].startsWith('http')) imageUrls.add(match[1]);
        }
      });
    }
  });

  if (imageUrls.size > 0) {
    imageUrls.forEach(url => {
      htmlResult += `<img src="${url}" alt="Фотография" />\n`;
    });
  }

  htmlResult += `</div>`;

  // 4. КОПИРОВАНИЕ В БУФЕР
  fallbackCopyTextToClipboard(htmlResult);

  function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showToast("✅ HTML код скопирован!", 3000, "#28a745");
    } catch (err) {
      alert("Не удалось скопировать код. Попробуйте еще раз.");
    }
    document.body.removeChild(textArea);
  }
}