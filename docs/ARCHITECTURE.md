# NES Emulator Pro — Архитектура

Веб-эмулятор NES для интеграции в Tilda с поддержкой WebAssembly, Web Workers и мобильных функций.

---

## Содержание

1. [Обзор](#обзор)
2. [Стек технологий](#стек-технологий)
3. [Структура проекта](#структура-проекта)
4. [Компоненты системы](#компоненты-системы)
   - [WebAssembly эмулятор](#webassembly-эмулятор)
   - [Web Workers](#web-workers)
   - [AudioWorklet](#audioworklet)
   - [IndexedDB + сжатие](#indexeddb--сжатие)
5. [UI/UX архитектура](#uiux-архитектура)
6. [Мобильные функции](#мобильные-функции)
7. [Метаданные игр](#метаданные-игр)
8. [План реализации](#план-реализации)

---

## Обзор

`NES Emulator Pro` — это профессиональный эмулятор NES (Nintendo Entertainment System), работающий в браузере.

**Проект разработан для интеграции в Tilda и включает полный набор функций:**

- Запуск ROM-файлов NES
- WebAssembly-ускоренная эмуляция
- Оптимизированный рендеринг через Web Workers
- Качественный звук через AudioWorklet
- Локальное хранение данных в IndexedDB
- Продвинутые фильтры изображения (CRT, scanlines)
- Поддержка геймпадов и настраиваемое управление
- Мобильная адаптация (haptic feedback, pinch-to-zoom)

---

## Стек технологий

| Категория | Технология |
|-----------|------------|
| Эмуляция | FCEUX (WebAssembly) |
| Рендеринг | Canvas 2D + Web Workers |
| Аудио | Web Audio API + AudioWorklet |
| Хранение | IndexedDB + Compression Streams API |
| UI | Vanilla JavaScript, CSS Variables |
| PWA | Service Worker, Web App Manifest |
| Сборка | Emscripten (WASM компиляция) |

---

## Структура проекта

```
nes-emulator-roms/
├── index.html                    # HTML для интеграции в Tilda
├── nes-emulator-pro.html         # Текущий UI (Legacy)
├── docs/
│   └── ARCHITECTURE.md           # Этот документ
├── js/
│   ├── core/
│   │   ├── emulator.js           # Основной класс эмулятора
│   │   ├── memory.js             # Управление памятью
│   │   ├── cpu.js                # CPU эмуляция (6502)
│   │   └── ppu.js                # PPU эмуляция (2C02)
│   ├── workers/
│   │   ├── render.worker.js      # Web Worker для рендеринга
│   │   └── audio.worker.js       # Web Worker для аудио
│   ├── audio/
│   │   ├── audio-worklet.js      # AudioWorklet процессор
│   │   └── sound-chip.js         # 2A03 APU эмуляция
│   ├── storage/
│   │   ├── database.js           # IndexedDB менеджер
│   │   └── compressor.js         # Сжатие ROM (gzip)
│   ├── ui/
│   │   ├── settings-panel.js     # Панель настроек
│   │   ├── keyboard-manager.js   # Управление клавишами
│   │   ├── gamepad-manager.js    # Настройки геймпада
│   │   └── filters.js            # CRT/сканлайн фильтры
│   ├── metadata/
│   │   ├── games-db.js           # База метаданных игр
│   │   └── screenshots.js        # Скриншоты
│   └── mobile/
│       ├── haptic.js             # Haptic feedback (navigator.vibrate)
│       ├── touch-controls.js     # Адаптивные кнопки
│       └── gestures.js           # Pinch-to-zoom
├── wasm/
│   ├── fceux.js                  # FCEUX Emscripten обёртка
│   └── fceux.wasm                # Скомпилированное ядро
├── assets/
│   ├── icons/                    # Иконки игр
│   └── screenshots/              # Скриншоты игр
└── data/
    └── games.json                # Метаданные игр
```

---

## Компоненты системы

### WebAssembly эмулятор

Используется **FCEUX** — наиболее функциональный эмулятор NES с открытым исходным кодом.

```
┌─────────────────────────────────────────────────────────────┐
│                    Tilda Container                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   UI Layer                          │    │
│  │  - Меню игр                                         │    │
│  │  - Панель настроек                                  │    │
│  │  - Экран эмуляции (Canvas)                         │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │                                   │
│  ┌───────────────────────▼─────────────────────────────┐    │
│  │              JavaScript Bridge                       │    │
│  │  - input: keyboard, gamepad, touch                  │    │
│  │  - output: video buffer, audio samples              │    │
│  │  - state: pause, resume, save, load                 │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │                                   │
│  ┌───────────────────────▼─────────────────────────────┐    │
│  │              FCEUX WASM Core                         │    │
│  │  - CPU: 6502 (оригинальная логика)                  │    │
│  │  - PPU: 2C02 (видео рендеринг)                      │    │
│  │  - APU: 2A03 (звук)                                 │    │
│  │  - Mappers: NROM, MMC1, MMC3, CNROM, и др.          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### Интеграция FCEUX

1. **Компиляция**: FCEUX → Emscripten → WebAssembly
2. **Обмен данными**: SharedArrayBuffer (видео), AudioRingBuffer (аудио)
3. **Input**: JavaScript → WASM через FFI

#### SharedArrayBuffer схема

```javascript
// Видео буфер (256x240 пикселей, 4 байта на пиксель)
const VIDEO_BUFFER = new SharedArrayBuffer(256 * 240 * 4);

// Статус эмулятора
const STATE_BUFFER = new SharedArrayBuffer(8);
// [0]: running, [1]: paused, [2]: frameReady, [3-7]: reserved
```

---

### Web Workers

Два выделенных Worker'а для разгрузки главного потока:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Main Thread                               │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐               │
│  │   UI/UX    │   │   Input    │   │   State    │               │
│  │  (render)  │   │ (keyboard) │   │  (saves)   │               │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘               │
│        │                │                │                       │
│        │    ┌───────────┼───────────┐    │                       │
│        └────►  Emulator  ◄───────────┘    │                       │
│             │  (WASM)    │                │                       │
│             └─────┬──────┘                │                       │
└───────────────────┼───────────────────────┼───────────────────────┘
                    │                       │
        ┌───────────┴───────────┐           │
        │                       │           │
        ▼                       ▼           ▼
┌───────────────────┐   ┌───────────────┐   ┌─────────────┐
│   Render Worker   │   │ Audio Worker  │   │  IndexedDB  │
│                   │   │               │   │  (async)    │
│ - CRT filter      │   │ - Resampling  │   │             │
│ - Scanlines       │   │ - Low-pass    │   │ - ROM cache │
│ - Color correct   │   │ - Limiter     │   │ - Saves     │
│ - Scale/rotate    │   │               │   │ - Settings  │
└───────────────────┘   └───────────────┘   └─────────────┘
```

#### Render Worker

```javascript
// render.worker.js
onmessage = (e) => {
  const { frameData, filters } = e.data;
  
  // Применение CRT фильтра
  const filtered = applyCRTEffect(frameData, filters);
  
  // Применение сканлайнов
  const withScanlines = applyScanlines(filtered, filters.scanlineIntensity);
  
  postMessage({ imageData: withScanlines }, [withScanlines.data.buffer]);
};
```

#### Аудио буферизация

```
WASM APU ──(samples)──► Ring Buffer ──(48kHz)──► AudioWorklet ──► Speaker
                         (lock-free)       resample          processing
```

---

### AudioWorklet

Заменяет устаревший ScriptProcessor для низкой задержки.

```javascript
// audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const input = inputs[0];
    
    // Применение фильтров
    for (let channel = 0; channel < output.length; channel++) {
      output[channel] = input[channel].map(sample => {
        // Low-pass фильтр
        return this.lowPassFilter(sample);
      });
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
```

#### Аудио параметры

| Параметр | Значение | Описание |
|----------|----------|----------|
| Sample Rate | 48000 Hz | WASM выход |
| Output Rate | 44100 Hz | Браузерное устройство |
| Buffer Size | 256-1024 | Auto-настройка |
| Channels | 2 | Stereo |
| Filter | Low-pass 20kHz | Аутентичный звук |

---

### IndexedDB + сжатие

#### Схема базы данных

```javascript
const DB_NAME = 'nes-emulator-db';
const DB_VERSION = 1;

// Объекты хранилища
const STORES = {
  roms: '++id, name, crc32, timestamp',
  saves: '++id, romId, slot, timestamp',
  settings: 'key, value',
  screenshots: 'gameId, data'
};
```

#### Сжатие ROM

```javascript
// Используем Compression Streams API (gzip)
async function compressROM(romData) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(romData);
  writer.close();
  return new Response(cs.readable).arrayBuffer();
}

// Типичное сжатие: 40-60% экономия
// NES ROM: 40KB → ~16KB (gzip)
```

#### Операции

| Операция | Время | Описание |
|----------|-------|----------|
| Load ROM | 50-200ms | Декомпрессия + загрузка в WASM |
| Save State | 20-50ms | Сжатие + запись |
| Load State | 30-80ms | Чтение + декомпрессия |
| Cache Check | 5-10ms | CRC32 проверка |

---

## UI/UX архитектура

### Тематическая система

CSS Variables для динамической смены тем:

```css
:root {
  --bg: #0d1117;
  --bg-panel: #161b22;
  --text: #e6edf3;
  --accent: #3fb950;
}

[data-theme="light"] {
  --bg: #f6f8fa;
  --bg-panel: #ffffff;
  --text: #24292f;
  --accent: #1a7f37;
}
```

**Доступные темы:**
- Dark (по умолчанию)
- Light
- Purple
- Ocean
- Ambient
- Matrix

### Панель настроек

```
┌────────────────────────────────────────────────┐
│  ⚙️ Настройки                          [X]    │
├────────────────────────────────────────────────┤
│  ▸ Звук                                      │
│  │   ├─ Громкость: [████████░░] 80%         │
│  │   ├─ Басы: [██████░░░░] 60%              │
│  │   └─ Буфер: [Auto ▼]                     │
│  ├───────────────────────────────────────────│
│  ▸ Видео                                     │
│  │   ├─ Фильтр: [CRT Simulation ▼]          │
│  │   ├─ Сканлайны: [██████░░░░] 60%         │
│  │   ├─ Частота: [60 Hz ▼]                  │
│  │   └─ Масштаб: [2x ▼]                     │
│  ├───────────────────────────────────────────│
│  ▸ Управление                                │
│  │   ├─ Клавиатура: [Настроить]             │
│  │   ├─ Геймпад: [Настроить]                │
│  │   └─ Haptic: [✓ Включено]                │
│  └───────────────────────────────────────────│
│  ▸ Мобильные                                 │
│      ├─ Адаптивные кнопки: [✓]               │
│      ├─ Pinch-to-zoom: [✓]                   │
│      └─ Landscape lock: [✓]                  │
└────────────────────────────────────────────────┘
```

### Переназначение клавиш

```javascript
const DEFAULT_KEYBOARD_MAP = {
  'ArrowUp':    0x01,    // Up
  'ArrowDown':  0x02,    // Down
  'ArrowLeft':  0x04,    // Left
  'ArrowRight': 0x08,    // Right
  'KeyZ':       0x10,    // A (B button)
  'KeyX':       0x20,    // B (A button)
  'Enter':      0x40,    // Start
  'ShiftRight': 0x80,    // Select
};
```

---

## Мобильные функции

### Haptic Feedback

```javascript
// Вибрация при нажатии кнопок
function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  
  const patterns = {
    light: 10,
    medium: 20,
    heavy: 30,
    success: [0, 10, 50, 10],
    error: [0, 30, 50, 30]
  };
  
  navigator.vibrate(patterns[type] || 10);
}
```

### Адаптивные кнопки

- Размер кнопок зависит от диагонали экрана
- Позиционирование для больших пальцев (ergonomic zones)
- Автоматическое скрытие на десктопе

### Pinch-to-Zoom

```javascript
// Gesture handling
let initialDistance = 0;
let currentScale = 1;

element.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    initialDistance = getDistance(e.touches);
  }
});

element.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const delta = getDistance(e.touches) / initialDistance;
    currentScale = Math.min(Math.max(delta, 0.5), 3);
    canvas.style.transform = `scale(${currentScale})`;
  }
});
```

### Landscape Lock

```javascript
// Принудительный landscape на мобильных
function lockOrientation() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}
```

### Аналоговый D-pad

```javascript
// Виртуальный аналоговый стик для мобильных
class AnalogDpad {
  constructor(element) {
    this.touchId = null;
    this.center = { x: 0, y: 0 };
    this.value = { x: 0, y: 0 }; // -1 to 1
    
    element.addEventListener('touchstart', this.onStart.bind(this));
    element.addEventListener('touchmove', this.onMove.bind(this));
    element.addEventListener('touchend', this.onEnd.bind(this));
  }
  
  onMove(e) {
    // Расчёт вектора от центра касания
    // Отправка в эмулятор как аналоговый input
  }
}
```

---

## Метаданные игр

### Структура games.json

```json
{
  "games": [
    {
      "id": "super-mario-bros",
      "name": "Super Mario Bros",
      "nameRu": "Супер Марио Брос",
      "icon": "🍄",
      "screenshot": "screenshots/mario.png",
      "genre": "Platformer",
      "genreRu": "Платформер",
      "difficulty": 3,
      "difficultyLabel": "Medium",
      "description": "The classic platformer...",
      "descriptionRu": "Классический платформер...",
      "year": 1985,
      "players": 2,
      "mapper": "NROM",
      "crc32": "6c2050e7",
      "romSize": "40KB"
    }
  ],
  "genres": [
    { "id": "platformer", "name": "Platformer", "nameRu": "Платформер" },
    { "id": "action", "name": "Action", "nameRu": "Экшн" },
    { "id": "rpg", "name": "RPG", "nameRu": "РПГ" },
    { "id": "puzzle", "name": "Puzzle", "nameRu": "Головоломка" },
    { "id": "sports", "name": "Sports", "nameRu": "Спорт" },
    { "id": "shooter", "name": "Shooter", "nameRu": "Стрелялка" }
  ]
}
```

### Рейтинг сложности

| Уровень | Значение | Метка |
|---------|----------|-------|
| 1 | ★☆☆☆☆ | Very Easy |
| 2 | ★★☆☆☆ | Easy |
| 3 | ★★★☆☆ | Medium |
| 4 | ★★★★☆ | Hard |
| 5 | ★★★★★ | Very Hard |

---

## План реализации

### Фаза 1: Базовая интеграция (Высокий приоритет)

- [ ] Интеграция FCEUX WASM
- [ ] Базовый запуск ROM
- [ ] Видео вывод на Canvas
- [ ] Keyboard input

### Фаза 2: Аудио и рендеринг (Высокий приоритет)

- [ ] AudioWorklet интеграция
- [ ] Web Worker для рендеринга
- [ ] CRT фильтры
- [ ] Scanlines эффект

### Фаза 3: Хранение (Средний приоритет)

- [ ] IndexedDB менеджер
- [ ] Сжатие ROM (gzip)
- [ ] Система сохранений (save states)
- [ ] Кэширование загруженных ROM

### Фаза 4: Настройки (Средний приоритет)

- [ ] Панель настроек UI
- [ ] Переназначение клавиш
- [ ] Настройки геймпада
- [ ] 50/60 Hz переключение

### Фаза 5: Метаданные (Низкий приоритет)

- [ ] games.json база
- [ ] Скриншоты игр
- [ ] Фильтрация по жанрам
- [ ] Описания и рейтинги

### Фаза 6: Мобильные функции (Низкий приоритет)

- [ ] Haptic feedback
- [ ] Адаптивные кнопки
- [ ] Pinch-to-zoom жесты
- [ ] Landscape lock
- [ ] Аналоговый D-pad

---

## Интеграция в Tilda

### Через iframe

```html
<iframe 
  src="https://ваш-сайт.рф/nes-emulator/index.html"
  width="100%"
  height="600"
  frameborder="0"
  allow="fullscreen; gamepad"
></iframe>
```

### Через Zero-блок

Использовать HTML-блок с интеграцией:
- Кастомный CSS для темы Tilda
- JavaScript API для управления

### API методы

```javascript
// Глобальный объект
window.NESEmulator = {
  loadROM(url),           // Загрузка ROM по URL
  loadROM(file),          // Загрузка из File API
  play(),                 // Старт/продолжение
  pause(),                // Пауза
  reset(),                // Сброс
  setVolume(0-100),       // Громкость
  setFilter(type),        // Фильтр CRT/Scanlines
  saveState(slot),        // Сохранение
  loadState(slot),        // Загрузка
  setFullscreen(bool),    // Полноэкранный режим
  on(event, callback),    // События
};
```

---

## Ссылки

- [FCEUX](https://github.com/TASEmulators/fceux) — Эмулятор
- [Emscripten](https://emscripten.org/) — WASM компиляция
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Аудио
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — Хранение
- [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) — Геймпады

---

*Документ создан: 2026-03-05*
*Автор: Дуплей Максим Игоревич*
