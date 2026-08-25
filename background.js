// Состояние расширения
let isEnabled = true;
let saveInterval = 500;
let memoryLimit = 50000;
let allowedUrls = [];
let targetSelector = '';
let isPickerMode = false;

// Хранилище истории: { [url]: { [fieldId]: { history: [], currentIndex: -1 } } }
let fieldHistory = {};

// Загрузка настроек при старте
chrome.storage.local.get([
  'isEnabled',
  'saveInterval',
  'memoryLimit',
  'allowedUrls',
  'targetSelector',
  'fieldHistory'
], (result) => {
  if (result.isEnabled !== undefined) isEnabled = result.isEnabled;
  if (result.saveInterval) saveInterval = result.saveInterval;
  if (result.memoryLimit) memoryLimit = result.memoryLimit;
  if (result.allowedUrls) allowedUrls = result.allowedUrls;
  if (result.targetSelector) targetSelector = result.targetSelector;
  if (result.fieldHistory) fieldHistory = result.fieldHistory;
  
  // Отправка настроек в content script
  broadcastSettings();
});

// Прослушивание изменений настроек из popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSettings') {
    isEnabled = request.settings.isEnabled;
    saveInterval = request.settings.saveInterval;
    memoryLimit = request.settings.memoryLimit;
    allowedUrls = request.settings.allowedUrls;
    targetSelector = request.settings.targetSelector;
    
    chrome.storage.local.set({
      isEnabled,
      saveInterval,
      memoryLimit,
      allowedUrls,
      targetSelector
    });
    
    broadcastSettings();
    sendResponse({ success: true });
  }
  
  if (request.action === 'clearHistory') {
    fieldHistory = {};
    chrome.storage.local.set({ fieldHistory: {} });
    broadcastSettings();
    sendResponse({ success: true });
  }
  
  if (request.action === 'getHistory') {
    sendResponse({ history: fieldHistory });
  }
  
  if (request.action === 'startPicker') {
    isPickerMode = true;
    broadcastSettings();
    sendResponse({ success: true });
  }
  
  if (request.action === 'fieldSelected') {
    isPickerMode = false;
    targetSelector = request.selector;
    
    // Сохраняем селектор
    chrome.storage.local.set({ targetSelector });
    broadcastSettings();
    
    // Открываем popup для отображения результата
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showSelectorResult',
          selector: targetSelector
        });
      }
    });
    
    sendResponse({ success: true });
  }
  
  if (request.action === 'saveFieldHistory') {
    const { url, fieldId, historyData } = request;
    if (!fieldHistory[url]) fieldHistory[url] = {};
    fieldHistory[url][fieldId] = historyData;
    
    // Ограничиваем размер истории
    if (historyData.history.length * historyData.history[0]?.length > memoryLimit) {
      // Удаляем старые записи если превышен лимит
      while (historyData.history.length > 100) {
        historyData.history.shift();
      }
    }
    
    chrome.storage.local.set({ fieldHistory });
    sendResponse({ success: true });
  }
  
  return true;
});

// Рассылка настроек всем вкладкам
function broadcastSettings() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'settingsUpdated',
          settings: {
            isEnabled,
            saveInterval,
            memoryLimit,
            allowedUrls,
            targetSelector,
            isPickerMode
          }
        }).catch(() => {}); // Игнорируем ошибки для вкладок где нет content script
      }
    });
  });
}

// Проверка URL на соответствие разрешенным
function isUrlAllowed(url) {
  if (allowedUrls.length === 0) return true;
  
  return allowedUrls.some(pattern => {
    // Поддержка wildcard
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    }
    return url.includes(pattern);
  });
}

// Периодическая очистка старой истории
setInterval(() => {
  const now = Date.now();
  let changed = false;
  
  Object.keys(fieldHistory).forEach(url => {
    Object.keys(fieldHistory[url]).forEach(fieldId => {
      const fieldData = fieldHistory[url][fieldId];
      if (fieldData.lastSaved && now - fieldData.lastSaved > 3600000) { // 1 час
        // Можно добавить логику очистки очень старой истории
      }
    });
  });
  
  if (changed) {
    chrome.storage.local.set({ fieldHistory });
  }
}, 60000); // Каждую минуту
