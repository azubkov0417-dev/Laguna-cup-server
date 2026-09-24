const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКИ JSONBIN ===
const JSONBIN_BIN_ID = '6ab45dceac6210605aeee08c';
const JSONBIN_API_KEY = '$2a$10$DDtWUAe7Bub0eZy.GdxkUeAFK1EjZSW7v7.o8oPwh8y4wDZhdj.RS.';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// Разрешаем CORS (чтобы приложение с Netlify могло обращаться к серверу)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '5mb' }));

// ============================================================
//  ЗАГРУЗКА ДАННЫХ ИЗ JSONBIN
// ============================================================
async function loadData() {
  try {
    const res = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    const json = await res.json();
    return json.record || { version: 0, tournaments: [], data: {}, playersDb: [] };
  } catch (e) {
    console.error('Ошибка загрузки из JSONbin:', e.message);
    return { version: 0, tournaments: [], data: {}, playersDb: [] };
  }
}

// ============================================================
//  СОХРАНЕНИЕ ДАННЫХ В JSONBIN
// ============================================================
async function saveData(data) {
  const res = await fetch(JSONBIN_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_API_KEY
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('JSONbin save failed: ' + res.status + ' ' + text);
  }
}

// ============================================================
//  GET /api/data — отдаём текущее состояние
// ============================================================
app.get('/api/data', async (req, res) => {
  const data = await loadData();
  res.json(data);
});

// ============================================================
//  POST /api/data — принимаем и сохраняем данные
//  (без проверки версии: приложение шлёт всё состояние целиком)
// ============================================================
app.post('/api/data', async (req, res) => {
  try {
    const incoming = req.body || {};
    const newData = {
      version: ((incoming.baseVersion || 0) + 1),
      tournaments: incoming.tournaments || [],
      data: incoming.data || {},
      playersDb: incoming.playersDb || []
    };
    await saveData(newData);
    res.json({ version: newData.version });
  } catch (e) {
    console.error('Ошибка сохранения:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
//  Корневой маршрут — проверка работоспособности
// ============================================================
app.get('/', (req, res) => {
  res.send('ЛАГУНА CUP API работает. Используйте /api/data.');
});

// ============================================================
//  Запуск сервера
// ============================================================
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
