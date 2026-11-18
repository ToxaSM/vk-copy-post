const toggle = document.getElementById('removeHashtags');
const status = document.getElementById('status');
const buttonToggle = document.getElementById('showCopyButton');
buttonToggle.disabled = true;
chrome.storage.sync.get({ showCopyButton: true }).then(settings => {
  buttonToggle.checked = settings.showCopyButton !== false;
  buttonToggle.disabled = false;
}).catch(() => { status.textContent = 'Не удалось загрузить настройку кнопки. Откройте страницу заново.'; });
buttonToggle.addEventListener('change', async () => {
  buttonToggle.disabled = true;
  try {
    await chrome.storage.sync.set({ showCopyButton: buttonToggle.checked });
    status.textContent = buttonToggle.checked ? 'Кнопки на страницах VK включены.' : 'Кнопки на страницах VK скрыты.';
  } catch {
    buttonToggle.checked = !buttonToggle.checked;
    status.textContent = 'Не удалось сохранить настройку кнопки.';
  } finally { buttonToggle.disabled = false; }
});
toggle.disabled = true;
chrome.storage.sync.get({ removeHashtags: false }).then(settings => {
  toggle.checked = settings.removeHashtags;
  toggle.disabled = false;
}).catch(() => { status.textContent = 'Не удалось загрузить настройки. Откройте страницу заново.'; });
toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  try {
    await chrome.storage.sync.set({ removeHashtags: toggle.checked });
    status.textContent = 'Настройки сохранены';
  } catch {
    toggle.checked = !toggle.checked;
    status.textContent = 'Не удалось сохранить настройки. Попробуйте ещё раз.';
  } finally { toggle.disabled = false; }
});
document.getElementById('version').textContent = `Версия ${chrome.runtime.getManifest().version}`;
async function loadDiagnostics() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get_diagnostics' });
    if (!response?.ok) throw new Error('Diagnostics unavailable');
    document.getElementById('diagnostics').textContent = response.text;
    return response.text;
  } catch {
    const text = 'Диагностика недоступна. Перезагрузите расширение и повторите проблему.';
    document.getElementById('diagnostics').textContent = text;
    return text;
  }
}
loadDiagnostics();
document.getElementById('refreshDiagnostics').addEventListener('click', loadDiagnostics);
document.getElementById('report').addEventListener('click', async () => {
  let diagnostics = await loadDiagnostics();
  // Keep the prefilled issue URL compact enough for browsers and GitHub.
  try { diagnostics = JSON.stringify(JSON.parse(diagnostics)); } catch { /* Human-readable fallback. */ }
  const url = new URL('https://github.com/ToxaSM/vk-copy-post/issues/new');
  url.searchParams.set('title', 'VK Copy Post не работает');
  url.searchParams.set('body', `Версия расширения: ${chrome.runtime.getManifest().version}\n\nЧто не работает:\n\nШаги для повторения:\n1. \n\nОжидаемый результат:\n\nФактический результат:\n\nСсылка на публичный пост (по желанию):\n\nВерсия Chrome:\n\nДиагностика (проверьте перед отправкой):\n\`\`\`json\n${diagnostics}\n\`\`\`\n`);
  chrome.tabs.create({ url: url.href }).catch(() => { status.textContent = 'Не удалось открыть GitHub. Перейдите в репозиторий → Issues.'; });
});

const notifyToggle = document.getElementById('notifyUpdates');
const updateStatus = document.getElementById('updateStatus');
function updateNotice(message, kind = 'info') {
  updateStatus.dataset.kind = kind;
  updateStatus.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  updateStatus.textContent = message;
}
const checkButton = document.getElementById('checkUpdates');
notifyToggle.disabled = true;
chrome.storage.sync.get({ notifyUpdates: true }).then(settings => {
  notifyToggle.checked = settings.notifyUpdates;
  notifyToggle.disabled = false;
}).catch(() => { updateNotice('❌ Не удалось загрузить настройки обновлений.', 'error'); });
notifyToggle.addEventListener('change', async () => {
  notifyToggle.disabled = true;
  try {
    await chrome.storage.sync.set({ notifyUpdates: notifyToggle.checked });
    updateNotice(notifyToggle.checked ? '🔔 Уведомления включены.' : '🔕 Автоматическая проверка и уведомления выключены.');
  } catch {
    notifyToggle.checked = !notifyToggle.checked;
    updateNotice('❌ Не удалось сохранить настройку.', 'error');
  } finally { notifyToggle.disabled = false; }
});
function showUpdate(state = {}) {
  const messages = {
    available: `🆕 Доступна новая версия ${state.version}.`,
    current: '✅ У вас установлена актуальная версия.',
    'no-releases': '📦 Опубликованных релизов пока нет.',
    error: '❌ Не удалось проверить обновления. Проверьте подключение и попробуйте позже.'
  };
  const kinds = { available: 'info', current: 'success', 'no-releases': 'warning', error: 'error' };
  updateNotice(messages[state.status] || 'ℹ️ Обновления ещё не проверялись.', kinds[state.status] || 'info');
  if (state.checkedAt) updateStatus.textContent += ` Проверка: ${new Date(state.checkedAt).toLocaleString('ru-RU')}.`;
  const link = document.getElementById('releaseLink');
  if (typeof state.url === 'string' && state.url.startsWith('https://github.com/ToxaSM/vk-copy-post/releases/tag/')) {
    link.href = state.url;
    link.textContent = `Открыть релиз ${state.version} на GitHub`;
  } else {
    link.href = 'https://github.com/ToxaSM/vk-copy-post/releases';
    link.textContent = 'Открыть релизы на GitHub';
  }
}
chrome.storage.local.get('updateState').then(data => showUpdate(data.updateState)).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.updateState) showUpdate(changes.updateState.newValue);
});
checkButton.addEventListener('click', async () => {
  checkButton.disabled = true;
  updateNotice('🔎 Проверяем GitHub…');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'check_updates' });
    if (!response?.ok) throw new Error('Check failed');
    showUpdate(response.result);
  } catch { updateNotice('❌ Не удалось проверить обновления. Откройте настройки заново и повторите.', 'error'); }
  finally { checkButton.disabled = false; }
});
