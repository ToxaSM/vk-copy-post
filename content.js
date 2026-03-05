// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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
  } catch (e) {}
  return urlStr;
}

// --- ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА ПОСТА ---
async function processPost(postArticle) {
  showToast("⚡ Раскрываем пост и собираем данные...", 2000, "#0077FF");

  let moreBtns = postArticle.querySelectorAll('[data-id="showMoreButton"], [data-testid="showmoretext-after"], .wall_post_more, .v-wall-post__more');
  let wasExpanded = false;

  moreBtns.forEach(btn => {
    if (btn && btn.style.display !== 'none' && btn.offsetParent !== null) {
      btn.click();
      wasExpanded = true;
    }
  });

  if (wasExpanded) await new Promise(resolve => setTimeout(resolve, 800));

  const textSelectors = ['.wk_text', '.PostText', '[class*="PostText"]', '.wall_post_text', '[class*="wall_post_text"]', 'div[data-testid="post-text"]', '[class*="vkitPostText"]', '.v-wall-post__text', '.pi_text'];
  let textEl = null;
  
  for (let selector of textSelectors) {
    let elements = postArticle.querySelectorAll(selector);
    for (let el of elements) {
      if (el && el.innerText.trim().length > 0) { textEl = el; break; }
    }
    if (textEl) break;
  }

  let cleanTextHtml = "Текст записи не найден.";

  if (textEl) {
    let clone = textEl.cloneNode(true);
    clone.querySelectorAll('.wall_post_more, .v-wall-post__more, [data-id="showMoreButton"], [data-testid="showmoretext-after"], [style*="display: none"]').forEach(b => b.remove());

    clone.querySelectorAll('a').forEach(a => {
      let href = a.getAttribute('href') || "";
      let text = a.innerText.trim();
      if (text.startsWith('#')) { a.replaceWith(document.createTextNode(text)); return; }
      if (href.includes('away.php?to=')) {
        try { let realUrl = new URLSearchParams(href.split('?')[1]).get('to'); if (realUrl) href = decodeURIComponent(realUrl); } catch (e) {}
      } else if (href.startsWith('/')) { href = 'https://vk.com' + href; }
      let cleanA = document.createElement('a');
      cleanA.href = href; cleanA.target = "_blank"; cleanA.innerText = text;
      a.replaceWith(cleanA);
    });

    let htmlContent = clone.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>/gi, "\n");
    let tempDiv = document.createElement('div'); tempDiv.innerHTML = htmlContent;

    function extractTextAndLinks(node) {
      let result = "";
      for (let child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) result += child.textContent;
        else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName.toLowerCase() === 'a') result += child.outerHTML;
          else result += extractTextAndLinks(child);
        }
      }
      return result;
    }

    let textRaw = extractTextAndLinks(tempDiv).replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, "").trim().replace(/\n{2,}/g, "\n\n");
    cleanTextHtml = textRaw.replace(/\n/g, "<br>\n");
  }

  let htmlResult = `<style type="text/css">
a,p, .toggle .toggle-content p {font-size: 18px;}
table, th, td { border: 1px solid black; border-collapse: collapse; }
table.center { width:820px; margin-left: auto; margin-right: auto; }
img { width: 600px; height: auto; max-width: 90vw; display: block; margin: 15px auto; }
.style-anons {font-size: 18px;}
</style>\n<div class="news-content">\n<p>${cleanTextHtml}</p>\n\n`;

  let imageUrls = new Set();
  postArticle.querySelectorAll('a[href*="photo-"], a[href*="z=photo"], a[data-photo-id]').forEach(link => {
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

  imageUrls.forEach(url => htmlResult += `<img src="${url}" alt="Фотография" />\n`);
  htmlResult += `</div>`;

  var textArea = document.createElement("textarea");
  textArea.value = htmlResult; document.body.appendChild(textArea); textArea.select();
  try { document.execCommand('copy'); showToast("✅ HTML код скопирован!", 3000, "#28a745"); } 
  catch (err) { alert("Не удалось скопировать код."); }
  document.body.removeChild(textArea);
}

// --- ЛОГИКА ДОБАВЛЕНИЯ КНОПОК ---
function isRealPost(article) {
  if (article.querySelector('.FCThumb__close, [class*="FCThumb"]')) return false; 
  if (article.querySelector('[data-ad-view], [data-ad-block-uid], .wall_marked_as_ads, .PostHeaderSubtitle--ad, [data-testid="post-ad-mark"]')) return false;

  let postTextNode = article.querySelector('.wall_post_text, .wk_text, [class*="PostText"], [data-testid="post-text"]');
  let tinyElements = article.querySelectorAll('span, div, a');
  
  for (let el of tinyElements) {
    let text = el.textContent || "";
    if (text.length > 40 || text.length < 5) continue;
    if (postTextNode && postTextNode.contains(el)) continue;

    let normalizedText = text.toLowerCase()
      .replace(/a/g, 'а').replace(/e/g, 'е').replace(/o/g, 'о')
      .replace(/p/g, 'р').replace(/c/g, 'с').replace(/x/g, 'х')
      .replace(/y/g, 'у').replace(/m/g, 'м');

    let cleanText = normalizedText.replace(/[^а-яё]/g, '');
    
    if (cleanText === 'реклама' || cleanText === 'рекламнаязапись' || cleanText === 'промо' ||
        cleanText === 'рекомендуемввидео' || cleanText === 'рекомендуемыесообщества' || cleanText === 'возможновызнакомы') {
      return false;
    }
  }
  return true; 
}

function injectCopyButtons() {
  document.querySelectorAll('article').forEach(article => {
    // 1. Если это не пост - удаляем нашу панель, если она там была
    if (!isRealPost(article)) {
      let existingWrapper = article.querySelector('.dno-copy-wrapper');
      if (existingWrapper) existingWrapper.remove();
      return;
    }

    // 2. Если кнопки еще нет - создаем её
    if (!article.querySelector('.dno-copy-btn')) {
      
      // СОЗДАЕМ СОБСТВЕННУЮ ПАНЕЛЬ (Она займет свое место и ничего не перекроет)
      let wrapper = document.createElement('div');
      wrapper.className = 'dno-copy-wrapper';
      wrapper.style.cssText = `
        display: flex; 
        justify-content: flex-end; 
        padding: 12px 16px 0px; 
        margin-bottom: -15px; /* Слегка подтягиваем контент ВК наверх, чтобы не было дыры */
        position: relative; 
        z-index: 10;
        margin-bottom: 2px;
        border-top: 2px solid rgba(0, 0, 0, 0.05);
      `;

      // САМА КНОПКА
      let btn = document.createElement('button');
      btn.className = 'dno-copy-btn';
      btn.innerHTML = '📋 Копировать HTML';
      
      btn.style.cssText = `
        background-color: rgba(0, 119, 255, 0.08); 
        color: #0077FF; 
        border: 1px solid rgba(0, 119, 255, 0.2); 
        border-radius: 6px; 
        padding: 5px 12px; 
        font-size: 12px; 
        font-weight: 500;
        font-family: sans-serif; 
        cursor: pointer; 
        transition: all 0.2s;
      `;
      
      // Эффекты при наведении
      btn.onmouseover = () => {
        btn.style.backgroundColor = '#0077FF';
        btn.style.color = 'white';
      };
      btn.onmouseout = () => {
        btn.style.backgroundColor = 'rgba(0, 119, 255, 0.08)';
        btn.style.color = '#0077FF';
      };

      // Логика клика
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation(); 
        let originalText = btn.innerHTML;
        
        btn.innerHTML = '⏳ Сбор...'; 
        btn.style.backgroundColor = '#6c757d'; btn.style.color = 'white';
        
        await processPost(article);
        
        btn.innerHTML = '✅ Готово!'; 
        btn.style.backgroundColor = '#28a745'; btn.style.color = 'white';
        
        setTimeout(() => { 
          btn.innerHTML = originalText; 
          btn.onmouseout(); // Возвращаем прозрачный стиль
        }, 2000);
      });

      wrapper.appendChild(btn);
      
      // ГЛАВНАЯ ФИШКА: Вставляем нашу панель в САМОЕ НАЧАЛО тега <article>
      // Теперь она не "висит в воздухе", а является физической частью верстки поста.
      article.insertBefore(wrapper, article.firstChild);
    }
  });
}

// --- СИСТЕМА НАСТРОЕК (ПОКАЗЫВАТЬ ИЛИ НЕТ) ---
let isButtonEnabled = true;

// 1. Проверяем настройки при загрузке страницы
chrome.storage.local.get({ showInlineBtn: true }, (items) => {
  isButtonEnabled = items.showInlineBtn;
  if (isButtonEnabled) injectCopyButtons();
});

// 2. Слушаем изменения настроек в реальном времени
chrome.storage.onChanged.addListener((changes) => {
  if (changes.showInlineBtn !== undefined) {
    isButtonEnabled = changes.showInlineBtn.newValue;
    if (isButtonEnabled) {
      injectCopyButtons();
    } else {
      // Если пользователь выключил кнопку - моментально удаляем их со страницы
      document.querySelectorAll('.dno-copy-btn').forEach(btn => btn.remove());
    }
  }
});

// 3. Наблюдатель за скроллом
const observer = new MutationObserver(() => {
  if (isButtonEnabled) injectCopyButtons();
});
observer.observe(document.body, { childList: true, subtree: true });

// --- СЛУШАТЕЛЬ КЛИКА ПО ИКОНКЕ РАСШИРЕНИЯ (Работает всегда) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "copy_first_post") {
    let articles = document.querySelectorAll('article');
    let firstPost = null;
    
    for (let article of articles) {
      if (isRealPost(article)) {
        firstPost = article;
        break;
      }
    }

    if (firstPost) processPost(firstPost);
    else showToast("❌ Посты на странице не найдены!", 3000, "#dc3545");
  }
});