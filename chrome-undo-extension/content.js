// content.js - Основной скрипт для отслеживания ввода и автосохранения

let settings = {
  enabled: true,
  autoSaveInterval: 1000,
  maxHistorySize: 100000,
  allowedPages: '',
  targetSelector: ''
};

let trackedElements = new Map(); // Хранение истории для каждого элемента
let autoSaveTimers = new Map(); // Таймеры автосохранения
let isSelectMode = false; // Режим выбора элемента

// Загрузка настроек
async function loadSettings() {
  const result = await chrome.storage.sync.get({
    enabled: true,
    autoSaveInterval: 1000,
    maxHistorySize: 100000,
    allowedPages: '',
    targetSelector: ''
  });
  settings = result;
  
  // Проверка разрешённых страниц
  if (settings.allowedPages && settings.allowedPages.trim()) {
    const currentPage = window.location.hostname + window.location.pathname;
    const allowedList = settings.allowedPages.split(',').map(s => s.trim());
    const isAllowed = allowedList.some(allowed => currentPage.includes(allowed));
    
    if (!isAllowed) {
      console.log('Undo Anything: страница не в списке разрешённых');
      return false;
    }
  }
  
  return settings.enabled;
}

// Получение уникального ключа для элемента
function getElementKey(element) {
  const url = window.location.href;
  const id = element.id || '';
  const className = element.className || '';
  const name = element.name || '';
  const tagName = element.tagName;
  
  // Генерируем уникальный ключ на основе URL и характеристик элемента
  return `${url}|${tagName}|${id}|${className}|${name}`;
}

// Сохранение состояния элемента
function saveState(element) {
  if (!settings.enabled) return;
  
  const key = getElementKey(element);
  const currentValue = element.value;
  
  if (!trackedElements.has(key)) {
    trackedElements.set(key, {
      history: [''],
      currentIndex: 0
    });
  }
  
  const state = trackedElements.get(key);
  
  // Если значение не изменилось, не сохраняем
  if (state.history[state.currentIndex] === currentValue) {
    return;
  }
  
  // Удаляем будущую историю если мы не в конце
  if (state.currentIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.currentIndex + 1);
  }
  
  // Добавляем новое состояние
  state.history.push(currentValue);
  state.currentIndex = state.history.length - 1;
  
  // Ограничиваем размер истории
  while (state.history.length > 100 || 
         state.history.reduce((acc, val) => acc + val.length, 0) > settings.maxHistorySize) {
    state.history.shift();
    state.currentIndex--;
  }
  
  // Сохраняем в chrome.storage.local для персистентности
  saveToStorage(key, state);
}

// Сохранение в хранилище
async function saveToStorage(key, state) {
  try {
    const data = {};
    data[`undo_history_${key}`] = state;
    await chrome.storage.local.set(data);
  } catch (e) {
    console.error('Ошибка сохранения в хранилище:', e);
  }
}

// Загрузка из хранилища
async function loadFromStorage(key) {
  try {
    const result = await chrome.storage.local.get(`undo_history_${key}`);
    return result[`undo_history_${key}`];
  } catch (e) {
    console.error('Ошибка загрузки из хранилища:', e);
    return null;
  }
}

// Обработка Ctrl+Z (отмена)
function handleUndo(element, event) {
  if (!settings.enabled) return;
  
  const key = getElementKey(element);
  const state = trackedElements.get(key);
  
  if (!state || state.currentIndex <= 0) {
    return; // Нечего отменять
  }
  
  event.preventDefault();
  event.stopPropagation();
  
  state.currentIndex--;
  element.value = state.history[state.currentIndex];
  
  //Dispatch событие input для реактивности
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

// Обработка Ctrl+Y или Ctrl+Shift+Z (повтор)
function handleRedo(element, event) {
  if (!settings.enabled) return;
  
  const key = getElementKey(element);
  const state = trackedElements.get(key);
  
  if (!state || state.currentIndex >= state.history.length - 1) {
    return; // Нечего возвращать
  }
  
  event.preventDefault();
  event.stopPropagation();
  
  state.currentIndex++;
  element.value = state.history[state.currentIndex];
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

// Настройка отслеживания для элемента
function setupTracking(element) {
  const key = getElementKey(element);
  
  // Пропускаем если уже настроен
  if (element.dataset.undoTracked === 'true') {
    return;
  }
  
  element.dataset.undoTracked = 'true';
  
  // Загружаем сохранённую историю
  loadFromStorage(key).then(state => {
    if (state) {
      trackedElements.set(key, state);
      // Восстанавливаем последнее значение
      if (state.history && state.history.length > 0) {
        // Не восстанавливаем автоматически, чтобы не мешать пользователю
        // Но сохраняем текущее значение как точку восстановления
        saveState(element);
      }
    }
  });
  
  // Отслеживание ввода с автосохранением по таймеру
  let debounceTimer = null;
  
  element.addEventListener('input', () => {
    // Очищаем предыдущий таймер
    if (autoSaveTimers.has(key)) {
      clearTimeout(autoSaveTimers.get(key));
    }
    
    // Устанавливаем новый таймер автосохранения
    autoSaveTimers.set(key, setTimeout(() => {
      saveState(element);
    }, settings.autoSaveInterval));
  });
  
  // Сохранение при потере фокуса
  element.addEventListener('blur', () => {
    if (autoSaveTimers.has(key)) {
      clearTimeout(autoSaveTimers.get(key));
    }
    saveState(element);
  });
  
  // Обработка Ctrl+Z / Ctrl+Y
  element.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
      handleUndo(element, event);
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z') {
      handleRedo(element, event);
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
      handleRedo(element, event);
    }
  });
  
  // Контекстное меню для быстрого доступа
  element.addEventListener('contextmenu', (event) => {
    // Можно добавить кастомное меню с историей
  });
}

// Поиск и настройка элементов для отслеживания
function findAndTrackElements() {
  if (!settings.enabled) return;
  
  let elements = [];
  
  if (settings.targetSelector && settings.targetSelector.trim()) {
    // Если указан конкретный селектор
    try {
      elements = document.querySelectorAll(settings.targetSelector);
    } catch (e) {
      console.error('Неверный селектор:', settings.targetSelector);
    }
  } else {
    // Все textarea и input[type="text"], input[type="email"], etc.
    elements = document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="url"], [contenteditable="true"], [contenteditable=""]');
  }
  
  elements.forEach(element => {
    setupTracking(element);
  });
}

// Режим выбора элемента
function enterSelectMode() {
  isSelectMode = true;
  
  // Добавляем оверлей для визуальной индикации
  const overlay = document.createElement('div');
  overlay.id = 'undo-select-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(76, 175, 80, 0.3);
    z-index: 999999;
    cursor: crosshair;
  `;
  document.body.appendChild(overlay);
  
  // Показываем подсказку
  const hint = document.createElement('div');
  hint.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4CAF50;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    z-index: 1000000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  `;
  hint.textContent = '🎯 Кликните на поле ввода для выбора';
  document.body.appendChild(hint);
  
  // Обработчик клика
  overlay.addEventListener('click', (event) => {
    event.stopPropagation();
    
    // Находим ближайший input/textarea
    let target = event.target;
    
    // Ищем вверх по дереву если кликнули не напрямую на элемент
    while (target && target !== document.body) {
      if (target.tagName === 'TEXTAREA' || 
          target.tagName === 'INPUT' || 
          target.isContentEditable) {
        break;
      }
      target = target.parentElement;
    }
    
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
      // Генерируем селектор
      let selector = '';
      
      if (target.id) {
        selector = `#${target.id}`;
      } else if (target.className && typeof target.className === 'string' && target.className.trim()) {
        const classes = target.className.trim().split(/\s+/);
        selector = '.' + classes.join('.');
      } else {
        // Генерируем CSS путь
        selector = generateCSSPath(target);
      }
      
      // Сохраняем селектор в настройки
      chrome.storage.sync.set({ targetSelector: selector });
      
      // Обновляем локальные настройки
      settings.targetSelector = selector;
      
      // Удаляем оверлей
      overlay.remove();
      hint.remove();
      isSelectMode = false;
      
      // Перенастраиваем элементы
      findAndTrackElements();
      
      // Открываем popup с сообщением
      console.log('Выбранный селектор:', selector);
      
      // Показываем временное уведомление
      showNotification(`✅ Выбрано: ${selector}`);
    }
  });
  
  // Клик правой кнопкой для отмены
  overlay.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    overlay.remove();
    hint.remove();
    isSelectMode = false;
  });
}

// Генерация CSS пути
function generateCSSPath(element) {
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase();
    
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = current;
      let index = 0;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && 
            sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      
      if (index > 1) {
        selector += `:nth-of-type(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentNode;
  }
  
  return path.join(' > ');
}

// Показ уведомления
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 1000000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Обработка сообщений от popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
    findAndTrackElements();
  }
  
  if (message.action === 'enterSelectMode') {
    enterSelectMode();
  }
  
  if (message.action === 'historyCleared') {
    trackedElements.clear();
    chrome.storage.local.clear();
  }
  
  sendResponse({ success: true });
  return false;
});

// Инициализация
async function init() {
  const isEnabled = await loadSettings();
  
  if (isEnabled) {
    // Ждём загрузки DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', findAndTrackElements);
    } else {
      findAndTrackElements();
    }
    
    // Также отслеживаем динамически добавленные элементы
    const observer = new MutationObserver(() => {
      findAndTrackElements();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Запуск
init();
