importScripts('diagnostics.js', 'updates.js');
VKCopyDiagnostics.start();
VKCopyUpdates.start();

chrome.action.onClicked.addListener(async tab => {
  try {
    if (!/^https?:\/\/([\w-]+\.)?vk\.(com|ru)\//.test(tab.url || '')) throw new Error('Откройте страницу VK');
    const result = await chrome.tabs.sendMessage(tab.id, { action: 'copy_first_post' });
    if (!result?.ok) throw new Error(result?.error || 'Не удалось скопировать пост');
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Скопировать первый пост' });
  } catch (error) {
    VKCopyDiagnostics.record({ source: 'background', code: 'connection_failed', stage: 'message' }).catch(() => {});
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#b42318' });
    await chrome.action.setTitle({ tabId: tab.id, title: `${error.message}. Перезагрузите вкладку VK. Настройки и сообщение о проблеме: правой кнопкой по иконке → Параметры.` });
  }
});
