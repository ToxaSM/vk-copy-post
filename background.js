chrome.action.onClicked.addListener((tab) => {
  // Отправляем сигнал в content.js текущей вкладки
  chrome.tabs.sendMessage(tab.id, { action: "copy_first_post" }).catch((err) => {
    console.error("Ошибка: обновите страницу ВКонтакте", err);
  });
});