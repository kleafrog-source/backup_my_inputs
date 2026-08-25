// popup.js - логика окна настроек

document.addEventListener('DOMContentLoaded', loadSettings);

document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('clearBtn').addEventListener('click', clearData);
document.getElementById('pickBtn').addEventListener('click', startPicker);

async function loadSettings() {
  const result = await chrome.storage.local.get(['timer', 'limit', 'pages', 'selector']);
  
  document.getElementById('timer').value = result.timer || 500;
  document.getElementById('limit').value = result.limit || 100;
  document.getElementById('pages').value = result.pages || '';
  document.getElementById('selector').value = result.selector || '';
}

async function saveSettings() {
  const timer = parseInt(document.getElementById('timer').value) || 500;
  const limit = parseInt(document.getElementById('limit').value) || 100;
  const pages = document.getElementById('pages').value.trim();
  const selector = document.getElementById('selector').value.trim();

  await chrome.storage.local.set({
    timer: Math.max(100, Math.min(10000, timer)),
    limit: Math.max(10, Math.min(500, limit)),
    pages: pages,
    selector: selector
  });

  showStatus('✅ Настройки сохранены!');
  
  // Уведомляем content script об изменении настроек
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'settingsUpdated'}).catch(() => {});
  }
}

async function clearData() {
  if (confirm('Вы уверены? Это удалит все сохранённые данные для всех страниц.')) {
    await chrome.storage.local.remove(['historyData']);
    showStatus('🗑️ Все данные очищены!');
  }
}

async function startPicker() {
  showStatus('🎯 Режим выбора активирован. Кликните на поле ввода...');
  
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab) return;

  try {
    // Отправляем сообщение content script для запуска режима выбора
    const response = await chrome.tabs.sendMessage(tab.id, {action: 'startPicker'});
    if (response && response.selector) {
      document.getElementById('selector').value = response.selector;
      showStatus(`✅ Выбрано: ${response.selector}`);
    }
  } catch (error) {
    showStatus('❌ Ошибка: обновите страницу и попробуйте снова');
    console.error('Picker error:', error);
  }
}

function showStatus(message) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}
