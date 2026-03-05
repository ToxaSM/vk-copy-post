const checkbox = document.getElementById('showInlineBtn');
const statusText = document.getElementById('status');

// При открытии настроек - загружаем текущее состояние (по умолчанию включено)
chrome.storage.local.get({ showInlineBtn: true }, (items) => {
  checkbox.checked = items.showInlineBtn;
});

// При клике на галочку - сохраняем настройку
checkbox.addEventListener('change', () => {
  chrome.storage.local.set({ showInlineBtn: checkbox.checked }, () => {
    // Показываем уведомление об успехе
    statusText.style.opacity = '1';
    setTimeout(() => { statusText.style.opacity = '0'; }, 2000);
  });
});