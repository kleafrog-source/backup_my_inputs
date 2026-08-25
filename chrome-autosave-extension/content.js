// content.js - скрипт, работающий на веб-страницах

let settings = {
  timer: 500,
  limit: 100,
  pages: '',
  selector: ''
};

let isPickerMode = false;
let saveInterval = null;
let trackedElements = [];
let historyData = {}; // { url: { elementSelector: [historyArray] } }

// Загрузка настроек при старте
chrome.storage.local.get(['timer', 'limit', 'pages', 'selector']).then((result) => {
  if (result.timer) settings.timer = result.timer;
  if (result.limit) settings.limit = result.limit;
  if (result.pages !== undefined) settings.pages = result.pages;
  if (result.selector) settings.selector = result.selector;
  
  init();
}).catch(console.error);

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'settingsUpdated') {
    chrome.storage.local.get(['timer', 'limit', 'pages', 'selector']).then((result) => {
      if (result.timer) settings.timer = result.timer;
      if (result.limit) settings.limit = result.limit;
      if (result.pages !== undefined) settings.pages = result.pages;
      if (result.selector) settings.selector = result.selector;
      
      restartTracking();
    });
  }
  
  if (request.action === 'startPicker') {
    startPickerMode().then((selector) => {
      sendResponse({selector});
    }).catch((err) => {
      sendResponse({error: err.message});
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getHistory') {
    sendResponse({history: historyData});
  }
  
  if (request.action === 'restoreText') {
    restoreText(request.selector, request.index);
    sendResponse({success: true});
  }
});

function init() {
  if (!isPageAllowed()) {
    console.log('AutoSave: страница не в списке разрешённых');
    return;
  }
  
  loadHistory();
  setupTracking();
}

function isPageAllowed() {
  if (!settings.pages || settings.pages.trim() === '') {
    return true; // Все страницы разрешены
  }
  
  const currentUrl = window.location.href;
  const patterns = settings.pages.split('\n').map(p => p.trim()).filter(p => p);
  
  for (const pattern of patterns) {
    if (matchPattern(currentUrl, pattern)) {
      return true;
    }
  }
  
  return false;
}

function matchPattern(url, pattern) {
  // Преобразуем wildcard паттерн в RegExp
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(url);
}

function loadHistory() {
  chrome.storage.local.get(['historyData']).then((result) => {
    historyData = result.historyData || {};
  }).catch(console.error);
}

function saveHistory() {
  // Ограничиваем размер истории согласно лимиту
  trimHistoryIfNeeded();
  
  chrome.storage.local.set({historyData}).catch(console.error);
}

function trimHistoryIfNeeded() {
  const maxBytes = settings.limit * 1024 * 1024; // Конвертируем МБ в байты
  const currentUrl = window.location.href;
  
  if (!historyData[currentUrl]) return;
  
  let totalSize = 0;
  
  // Считаем общий размер
  for (const url in historyData) {
    for (const selector in historyData[url]) {
      totalSize += JSON.stringify(historyData[url][selector]).length;
    }
  }
  
  // Если превышен лимит, удаляем старые записи
  while (totalSize > maxBytes) {
    let oldestTime = Infinity;
    let oldestUrl = null;
    let oldestSelector = null;
    
    for (const url in historyData) {
      for (const selector in historyData[url]) {
        if (historyData[url][selector].length > 0) {
          const firstEntry = historyData[url][selector][0];
          if (firstEntry && firstEntry.timestamp < oldestTime) {
            oldestTime = firstEntry.timestamp;
            oldestUrl = url;
            oldestSelector = selector;
          }
        }
      }
    }
    
    if (oldestUrl && oldestSelector) {
      historyData[oldestUrl][oldestSelector].shift();
      if (historyData[oldestUrl][oldestSelector].length === 0) {
        delete historyData[oldestUrl][oldestSelector];
      }
      if (Object.keys(historyData[oldestUrl]).length === 0) {
        delete historyData[oldestUrl];
      }
      
      // Пересчитываем размер
      totalSize = 0;
      for (const url in historyData) {
        for (const selector in historyData[url]) {
          totalSize += JSON.stringify(historyData[url][selector]).length;
        }
      }
    } else {
      break;
    }
  }
}

function setupTracking() {
  clearInterval(saveInterval);
  trackedElements = [];
  
  const elements = settings.selector 
    ? document.querySelectorAll(settings.selector)
    : document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], textarea, [contenteditable="true"], [contenteditable]');
  
  elements.forEach((element, index) => {
    const selector = getUniqueSelector(element);
    trackedElements.push({element, selector});
    
    // Инициализируем историю для этого элемента
    const currentUrl = window.location.href;
    if (!historyData[currentUrl]) {
      historyData[currentUrl] = {};
    }
    if (!historyData[currentUrl][selector]) {
      historyData[currentUrl][selector] = [];
    }
    
    // Сохраняем текущее значение при загрузке
    saveValue(element, selector, false);
    
    // Отслеживаем изменения
    element.addEventListener('input', () => {
      saveValue(element, selector, true);
    });
    
    // Отслеживаем Ctrl+Z для восстановления
    element.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo(element, selector);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo(element, selector);
      }
    });
  });
  
  // Автосохранение по таймеру
  saveInterval = setInterval(() => {
    trackedElements.forEach(({element, selector}) => {
      saveValue(element, selector, false);
    });
    saveHistory();
  }, settings.timer);
}

function restartTracking() {
  if (!isPageAllowed()) return;
  setupTracking();
}

function getUniqueSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  if (element.className && typeof element.className === 'string' && element.className.trim()) {
    const classes = element.className.trim().split(/\s+/).join('.');
    return `.${classes}`;
  }
  if (element.name) {
    return `[name="${element.name}"]`;
  }
  
  // Fallback: используем путь через тег и индекс
  let path = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.nodeName === current.nodeName) nth++;
      }
      if (nth > 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    current = current.parentNode;
  }
  return path.join(' > ');
}

function getValue(element) {
  if (element.contentEditable === 'true') {
    return element.innerHTML;
  }
  return element.value || '';
}

function setValue(element, value) {
  if (element.contentEditable === 'true') {
    element.innerHTML = value;
  } else {
    element.value = value;
  }
  
  // Trigger input event for frameworks that listen to it
  element.dispatchEvent(new Event('input', {bubbles: true}));
}

function saveValue(element, selector, addToHistory) {
  const value = getValue(element);
  const currentUrl = window.location.href;
  
  if (!historyData[currentUrl]) {
    historyData[currentUrl] = {};
  }
  if (!historyData[currentUrl][selector]) {
    historyData[currentUrl][selector] = [];
  }
  
  const history = historyData[currentUrl][selector];
  const lastEntry = history[history.length - 1];
  
  // Не сохраняем дубликаты
  if (lastEntry && lastEntry.value === value) {
    return;
  }
  
  if (addToHistory) {
    history.push({
      value: value,
      timestamp: Date.now()
    });
    
    // Ограничиваем количество записей (например, 1000 на элемент)
    if (history.length > 1000) {
      history.shift();
    }
    
    saveHistory();
  }
}

function undo(element, selector) {
  const currentUrl = window.location.href;
  if (!historyData[currentUrl] || !historyData[currentUrl][selector]) return;
  
  const history = historyData[currentUrl][selector];
  if (history.length <= 1) return;
  
  // Удаляем текущее значение и переходим к предыдущему
  history.pop();
  const previousValue = history[history.length - 1]?.value || '';
  
  setValue(element, previousValue);
  saveHistory();
}

function redo(element, selector) {
  // Для простоты реализации redo требует более сложной структуры
  // В данной версии поддерживается только undo
  console.log('Redo не поддерживается в этой версии');
}

async function startPickerMode() {
  return new Promise((resolve) => {
    isPickerMode = true;
    
    // Создаём overlay для визуального индикатора
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999999;
      cursor: crosshair;
    `;
    overlay.textContent = 'Кликните на поле ввода для выбора';
    overlay.style.color = 'white';
    overlay.style.fontSize = '24px';
    overlay.style.textAlign = 'center';
    overlay.style.paddingTop = '100px';
    overlay.style.fontWeight = 'bold';
    overlay.style.textShadow = '2px 2px 4px black';
    
    document.body.appendChild(overlay);
    
    const clickHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const target = e.target;
      let selector = '';
      
      // Проверяем, является ли элемент полем ввода
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        selector = getUniqueSelector(target);
      } else {
        // Ищем ближайший input/textarea
        const input = target.closest('input, textarea, [contenteditable]');
        if (input) {
          selector = getUniqueSelector(input);
        }
      }
      
      // Удаляем overlay
      document.body.removeChild(overlay);
      document.removeEventListener('click', clickHandler, true);
      isPickerMode = false;
      
      resolve(selector || '');
    };
    
    document.addEventListener('click', clickHandler, true);
  });
}

function restoreText(selector, index) {
  const currentUrl = window.location.href;
  if (!historyData[currentUrl] || !historyData[currentUrl][selector]) return;
  
  const history = historyData[currentUrl][selector];
  if (index >= 0 && index < history.length) {
    const element = document.querySelector(selector);
    if (element) {
      setValue(element, history[index].value);
    }
  }
}

// Очистка при уходе со страницы
window.addEventListener('beforeunload', () => {
  saveHistory();
});
