const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '5mb' }));

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('Ошибка чтения data.json:', e);
    }
  }
  return { version: 0, tournaments: [], data: {}, playersDb: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/data', (req, res) => {
  const data = loadData();
  res.json(data);
});

app.post('/api/data', (req, res) => {
  const current = loadData();
  const incoming = req.body;

  if (incoming.baseVersion !== undefined && incoming.baseVersion !== current.version) {
    return res.json(current);
  }

  current.tournaments = incoming.tournaments || current.tournaments;
  current.data = incoming.data || current.data;
  current.playersDb = incoming.playersDb || current.playersDb;
  current.version = (current.version || 0) + 1;

  saveData(current);
  res.json({ version: current.version });
});

app.get('/', (req, res) => {
  res.send('ЛАГУНА CUP API работает.');
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
