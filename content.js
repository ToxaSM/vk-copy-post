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

  // 1. Раскрываем кнопку "Показать полностью"
  let moreBtns = postArticle.querySelectorAll('[data-id="showMoreButton"], [data-testid="showmoretext-after"], .wall_post_more, .v-wall-post__more, [class*="PostTextMore"]');
  let wasExpanded = false;

  moreBtns.forEach(btn => {
    if (btn && btn.style.display !== 'none' && btn.offsetParent !== null) {
      btn.click();
      wasExpanded = true;
    }
  });

  if (wasExpanded) await new Promise(resolve => setTimeout(resolve, 800));

  // 2. Ищем ТОЛЬКО блок с текстом записи
  const textSelectors = [
    '[data-testid="showmoretext"]', 
    '[data-testid="showmoretext-in-expanded"]',
    '[id^="text-"]', 
    '[data-testid="post-text"]', 
    '.wall_post_text', 
    '.wk_text',
    '[class*="PostText__"]', 
    '[class*="postText"]', 
    '[class*="vkitPostText"]'
  ];
  
  let textEl = null;
  
  for (let selector of textSelectors) {
    let elements = postArticle.querySelectorAll(selector);
    for (let el of elements) {
      if (el && el.innerText.trim().length > 5) { textEl = el; break; }
    }
    if (textEl) break;
  }

  // Строгий умный поиск на случай форс-мажора
  if (!textEl) {
    let allBlocks = postArticle.querySelectorAll('div, span');
    let maxTextLen = 0;
    
    allBlocks.forEach(el => {
      if (el.querySelectorAll('div').length > 4) return;
      let attrs = ((el.className || '') + ' ' + (el.getAttribute('data-testid') || '')).toLowerCase();
      if (attrs.includes('header') || attrs.includes('author') || attrs.includes('action') || 
          attrs.includes('reaction') || attrs.includes('bottom') || attrs.includes('footer') || 
          attrs.includes('like') || attrs.includes('reply')) return;
      
      let textLen = el.innerText.trim().length;
      if (textLen > maxTextLen && textLen > 10) {
        maxTextLen = textLen;
        textEl = el;
      }
    });
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
          else if (child.tagName.toLowerCase() === 'img' && child.alt) result += child.alt; 
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

// --- ЛОГИКА ОПРЕДЕЛЕНИЯ ПОСТА ---
function isRealPost(article) {
  if (article.querySelector('.FCThumb__close, [class*="FCThumb"]')) return false; 
  if (article.querySelector('[data-ad-view], [data-ad-block-uid], .wall_marked_as_ads, .PostHeaderSubtitle--ad, [data-testid="post-ad-mark"]')) return false;
  return true; 
}

// --- СИСТЕМА ИНТЕГРАЦИИ В МЕНЮ "3 ТОЧКИ" ---
let currentArticle = null;

// Перехватываем клик по новым трем точкам
document.addEventListener('click', (e) => {
  let moreBtn = e.target.closest('[data-testid="post_context_menu_toggle"], [aria-label="Действия"], [aria-label="Больше"], [data-testid*="more"], .PostHeaderActionsButton');
  if (moreBtn) {
    // Поднимаемся к главному контейнеру поста (используем точный селектор из вашего HTML)
    let article = moreBtn.closest('[data-testid="post-content-container"], article, .post, ._post, [data-testid="post"], [class*="Post__container"]');
    if (article) {
      currentArticle = article;
    }
  }
}, true);

// Следим за появлением всплывающего контекстного меню на странице
const menuObserver = new MutationObserver((mutations) => {
  for (let mut of mutations) {
    for (let node of mut.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Проверяем, является ли добавленный элемент меню (ActionSheet, Popover или Dropdown)
        let isMenu = node.matches('[class*="ActionSheet"], [class*="Popover"], [class*="Dropdown"], [class*="Menu"]') || 
                     node.querySelector('[class*="ActionSheet"], [class*="Popover"], [class*="Dropdown"], [class*="Menu"]');
                            
        if (isMenu && currentArticle) {
          // Ищем любой пункт меню внутри, чтобы встроиться в этот же список
          let sampleItem = node.querySelector('[role="button"], [class*="Item"], [class*="Cell"], [class*="SimpleCell"]');
          if (sampleItem && sampleItem.parentElement) {
            injectMenuButton(sampleItem.parentElement, currentArticle, sampleItem);
          }
        }
      }
    }
  }
});
menuObserver.observe(document.body, { childList: true, subtree: true });

function injectMenuButton(listWrapper, article, sampleItem) {
  if (listWrapper.querySelector('.dno-copy-menu-btn')) return; // Кнопка уже есть

  let btn = document.createElement('div');
  // Наследуем все классы оригинального пункта меню для идеального дизайна ВК
  btn.className = sampleItem.className + ' dno-copy-menu-btn';
  btn.classList.remove('vkuiTappable--activated', 'vkuiTappable--focused'); // Убираем лишние состояния фокуса
  btn.style.cursor = 'pointer';

  // Копируем внутреннюю верстку ячеек ВК, но подставляем свой текст
  let hasInnerContent = sampleItem.querySelector('[class*="content"]') || sampleItem.querySelector('[class*="children"]');
  if (hasInnerContent) {
    let contentClass = sampleItem.querySelector('[class*="content"]')?.className || '';
    let childrenClass = sampleItem.querySelector('[class*="children"]')?.className || '';
    btn.innerHTML = `<div class="${contentClass}"><span class="${childrenClass}" style="color: #0077FF; font-weight: 500;">📋 Скопировать HTML</span></div>`;
  } else {
    btn.innerHTML = `<span style="color: #0077FF; font-weight: 500;">📋 Скопировать HTML</span>`;
    btn.style.padding = '12px 16px';
  }

  // Эффект наведения
  btn.onmouseover = () => { btn.style.backgroundColor = 'rgba(0, 119, 255, 0.08)'; };
  btn.onmouseout = () => { btn.style.backgroundColor = 'transparent'; };

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.click(); // Имитируем клик по экрану, чтобы закрыть меню
    await processPost(article);
  });

  listWrapper.appendChild(btn);
}

// Резервный слушатель для клика по иконке на панели Chrome
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "copy_first_post") {
    let articles = document.querySelectorAll('[data-testid="post-content-container"], article, .post, [data-testid="post"]');
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