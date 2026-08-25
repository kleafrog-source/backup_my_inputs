// popup.js - Логика окна настроек

document.addEventListener('DOMContentLoaded', async () => {
  const enabledCheckbox = document.getElementById('enabled');
  const autoSaveIntervalInput = document.getElementById('autoSaveInterval');
  const maxHistorySizeInput = document.getElementById('maxHistorySize');
  const allowedPagesInput = document.getElementById('allowedPages');
  const targetSelectorInput = document.getElementById('targetSelector');
  const selectModeBtn = document.getElementById('selectModeBtn');
  const saveBtn = document.getElementById('saveBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const statusDiv = document.getElementById('status');

  // Загрузка настроек
  async function loadSettings() {
    const result = await chrome.storage.sync.get({
      enabled: true,
      autoSaveInterval: 1000,
      maxHistorySize: 100000,
      allowedPages: '',
      targetSelector: ''
    });

    enabledCheckbox.checked = result.enabled;
    autoSaveIntervalInput.value = result.autoSaveInterval;
    maxHistorySizeInput.value = result.maxHistorySize;
    allowedPagesInput.value = result.allowedPages;
    targetSelectorInput.value = result.targetSelector;
  }

  // Сохранение настроек
  async function saveSettings() {
    const settings = {
      enabled: enabledCheckbox.checked,
      autoSaveInterval: parseInt(autoSaveIntervalInput.value) || 1000,
      maxHistorySize: parseInt(maxHistorySizeInput.value) || 100000,
      allowedPages: allowedPagesInput.value.trim(),
      targetSelector: targetSelectorInput.value.trim()
    };

    await chrome.storage.sync.set(settings);
    
    // Уведомляем content script об изменении настроек
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings });
      } catch (e) {
        // Content script может быть не загружен
      }
    }

    showStatus('Настройки сохранены!', false);
  }

  // Показать статус
  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    statusDiv.className = isError ? 'status error' : 'status';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Режим выбора элемента
  selectModeBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'enterSelectMode' });
        showStatus('Режим выбора активирован! Кликните на поле ввода.', false);
        window.close(); // Закрыть popup
      } catch (e) {
        showStatus('Ошибка: обновите страницу и попробуйте снова', true);
      }
    }
  });

  // Очистка истории
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Вы уверены, что хотите очистить всю историю?')) {
      await chrome.storage.local.clear();
      showStatus('История очищена!', false);
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'historyCleared' });
        } catch (e) {}
      }
    }
  });

  // Сохранение настроек
  saveBtn.addEventListener('click', saveSettings);

  // Загрузка настроек при открытии
  await loadSettings();
});
