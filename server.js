const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКИ JSONBIN ===
const JSONBIN_BIN_ID = '6ab45dceac6210605aeee08c';
const JSONBIN_API_KEY = '$2a$10$DDtWUAe7Bub0eZy.GdxkUeAFK1EjZSW7v7.o8oPwh8y4wDZhdj.RS.';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '5mb' }));

// Загрузка данных из JSONbin
async function loadData() {
  try {
    const res = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': JSONBIN_API_KEY }
    });
    const json = await res.json();
    return json.record || { version: 0, tournaments: [], data: {}, playersDb: [] };
  } catch (e) {
    console.error('Ошибка загрузки из JSONbin:', e);
    return { version: 0, tournaments: [], data: {}, playersDb: [] };
  }
}

// Сохранение данных в JSONbin
async function saveData(data) {
  try {
    await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY
      },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error('Ошибка сохранения в JSONbin:', e);
  }
}

app.get('/api/data', async (req, res) => {
  const data = await loadData();
  res.json(data);
});

app.post('/api/data', async (req, res) => {
  const current = await loadData();
  const incoming = req.body;
  if (incoming.baseVersion !== undefined && incoming.baseVersion !== current.version) {
    return res.json(current);
  }
  current.tournaments = incoming.tournaments || current.tournaments;
  current.data = incoming.data || current.data;
  current.playersDb = incoming.playersDb || current.playersDb;
  current.version = (current.version || 0) + 1;
  await saveData(current);
  res.json({ version: current.version });
});

app.get('/', (req, res) => res.send('ЛАГУНА CUP API работает.'));

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
