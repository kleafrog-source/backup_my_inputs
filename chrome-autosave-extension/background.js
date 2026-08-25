// background.js - service worker для фоновых задач

// Обработка установки расширения
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Инициализация настроек по умолчанию
    chrome.storage.local.set({
      timer: 500,
      limit: 100,
      pages: '',
      selector: ''
    });
    
    console.log('AutoSave extension installed!');
  }
});

// Очистка старых данных при необходимости
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.historyData) {
    console.log('History data updated');
  }
});
