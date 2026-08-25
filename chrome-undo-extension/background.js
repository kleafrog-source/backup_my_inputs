// background.js - Service Worker для обработки сообщений

// Обработка сообщений от content script и popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'enterSelectMode') {
    // Пересылаем сообщение в content script активной вкладки
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'enterSelectMode' });
      }
    });
  }
  
  if (message.action === 'getSelector') {
    // Возвращаем селектор из настроек
    chrome.storage.sync.get({ targetSelector: '' }, (result) => {
      sendResponse({ selector: result.targetSelector });
    });
    return true; // Асинхронный ответ
  }

  return false;
});

// При установке расширения
chrome.runtime.onInstalled.addListener(() => {
  console.log('Undo Anything extension installed');
});
