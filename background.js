chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractAndCopyVKPostData,
  });
});

async function extractAndCopyVKPostData() {
  // 1. ПРОВЕРКА АДРЕСА (работает для vk.com и vk.ru)
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

  showToast("⚡ Раскрываем пост и собираем данные...", 2000, "#0077FF");

  // --- ОБНОВЛЕННЫЙ БЛОК: РАСКРЫТИЕ ТЕКСТА ТОЛЬКО ВНУТРИ ПОСТОВ ---
  const moreBtnsSelectors = [
    '[data-id="showMoreButton"]', 
    '[data-testid="showmoretext-after"] span',
    '[data-testid="showmoretext-after"]',
    '.wall_post_more', 
    '.v-wall-post__more', 
    '.PostTextMore', 
    '.pi_text_more'
  ];
  
  let wasExpanded = false;

  for (let selector of moreBtnsSelectors) {
    let btns = document.querySelectorAll(selector);
    for (let btn of btns) {
      // ПРОВЕРКА: Находится ли кнопка внутри поста?
      let isInsidePost = btn.closest('.post, .wall_item, div[data-testid="post"], [class*="vkitPost__root"], div[class*="Post--"], ._post');
      
      // Кликаем только если кнопка видима И находится внутри поста
      if (isInsidePost && btn.style.display !== 'none' && btn.offsetParent !== null) {
        btn.click();
        wasExpanded = true;
      }
    }
  }

  if (wasExpanded) {
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  // ------------------------------------

  // Вспомогательная функция для получения максимального качества картинки
  function getHighResUrl(urlStr) {
    try {
      let url = new URL(urlStr);
      let asParam = url.searchParams.get('as');
      
      if (asParam) {
        let sizes = asParam.split(',');
        let maxSize = sizes.reduce((max, current) => {
          let width = parseInt(current.split('x')[0], 10) || 0;
          let maxWidth = parseInt(max.split('x')[0], 10) || 0;
          return width > maxWidth ? current : max;
        }, "0x0");
        
        if (maxSize !== "0x0") {
          url.searchParams.set('cs', maxSize);
          return url.toString();
        }
      }
    } catch (e) {
      console.error("Ошибка при обработке URL картинки:", e);
    }
    return urlStr; 
  }

  // 2. ИЗВЛЕЧЕНИЕ ТЕКСТА
  const textSelectors = ['.wk_text', '.PostText', '[class*="PostText"]', '.wall_post_text', '[class*="wall_post_text"]', 'div[data-testid="post-text"]', '[class*="vkitPostText"]', '.v-wall-post__text', '.pi_text'];

  let textEl = null;
  for (let selector of textSelectors) {
    let elements = document.querySelectorAll(selector);
    for (let el of elements) {
      if (el && el.innerText.trim().length > 0) { 
        // Дополнительная проверка: берем текст тоже только из постов
        if (el.closest('.post, .wall_item, div[data-testid="post"], [class*="vkitPost__root"], div[class*="Post--"], ._post')) {
          textEl = el; 
          break; 
        }
      }
    }
    if (textEl) break;
  }

  let cleanTextHtml = "Текст записи не найден.";

  if (textEl) {
    let clone = textEl.cloneNode(true);

    let moreBtns = clone.querySelectorAll('.wall_post_more, .v-wall-post__more, [data-id="showMoreButton"], [data-testid="showmoretext-after"], [style*="display: none"]');
    moreBtns.forEach(btn => btn.remove());

    let links = clone.querySelectorAll('a');
    links.forEach(a => {
        let href = a.getAttribute('href') || "";
        let text = a.innerText.trim();

        if (text.startsWith('#')) {
            let textNode = document.createTextNode(text);
            a.replaceWith(textNode);
            return;
        }

        if (href.includes('away.php?to=')) {
            try {
                let urlParams = new URLSearchParams(href.split('?')[1]);
                let realUrl = urlParams.get('to');
                if (realUrl) href = decodeURIComponent(realUrl);
            } catch (e) {}
        } else if (href.startsWith('/')) {
            href = 'https://vk.com' + href;
        }

        let cleanA = document.createElement('a');
        cleanA.href = href;
        cleanA.target = "_blank";
        cleanA.rel = "noopener noreferrer";
        cleanA.innerText = text;
        
        a.replaceWith(cleanA);
    });

    let htmlContent = clone.innerHTML;
    htmlContent = htmlContent.replace(/<br\s*\/?>/gi, "\n");
    htmlContent = htmlContent.replace(/<\/p>|<\/div>/gi, "\n");

    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    function extractTextAndLinks(node) {
        let result = "";
        for (let child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.tagName.toLowerCase() === 'a') {
                    result += child.outerHTML;
                } else {
                    result += extractTextAndLinks(child);
                }
            }
        }
        return result;
    }

    let textRaw = extractTextAndLinks(tempDiv);

    textRaw = textRaw.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "");
    textRaw = textRaw.trim().replace(/\n{2,}/g, "\n\n");

    cleanTextHtml = textRaw.replace(/\n/g, "<br>\n");
  }

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

  let postContainer = textEl ? textEl.closest('.post, .wall_item, div[data-testid="post"], [class*="vkitPost__root"], div[class*="Post--"], ._post') : document;
  if (!postContainer) postContainer = document;

  // 3. ИЗВЛЕЧЕНИЕ ФОТОГРАФИЙ
  let imageUrls = new Set();
  let photoLinks = postContainer.querySelectorAll('a[href*="photo-"], a[href*="z=photo"], a[data-photo-id]');

  photoLinks.forEach(link => {
    let img = link.querySelector('img');
    if (img) {
      let src = img.src || img.getAttribute('data-src');
      if (src && src.startsWith('http')) imageUrls.add(getHighResUrl(src));
    } else {
      let elements = link.querySelectorAll('*');
      [link, ...elements].forEach(node => {
        let bg = window.getComputedStyle(node).backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url')) {
          let match = bg.match(/url\(["']?(.*?)["']?\)/);
          if (match && match[1] && match[1].startsWith('http')) imageUrls.add(getHighResUrl(match[1]));
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