const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКИ JSONBIN ===
const JSONBIN_BIN_ID = '6ab45dceac6210605aeee08c';
const JSONBIN_API_KEY = '$2a$10$1ebBxDj5FRXFDtjsc1GVne44FSKBOaTV4GVhLTNs7fQe62sSPE3Om';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// Разрешаем CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
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
    if (!res.ok) {
      console.error('JSONbin load failed:', res.status);
      return { version: 0, tournaments: [], data: {}, playersDb: [] };
    }
    const json = await res.json();
    const record = json.record || {};
    return {
      version: typeof record.version === 'number' ? record.version : 0,
      tournaments: record.tournaments || [],
      data: record.data || {},
      playersDb: record.playersDb || []
    };
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
  return true;
}

// ============================================================
//  ЗАЩИТА ОТ ГОНКИ ЗАПИСЕЙ
//  Пока идёт запись — следующая ждёт (простая очередь)
// ============================================================
let writeQueue = Promise.resolve();
function queueWrite(fn) {
  const result = writeQueue.then(() => fn());
  // Чтобы очередь не сломалась при ошибке — обрабатываем её внутри
  writeQueue = result.catch(() => {});
  return result;
}

// ============================================================
//  GET /api/data — отдаём текущее состояние
// ============================================================
app.get('/api/data', async (req, res) => {
  try {
    const data = await loadData();
    res.json(data);
  } catch (e) {
    console.error('GET /api/data error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
//  POST /api/data — принимаем и сохраняем данные
//  ⚠️ Проверяем baseVersion, чтобы не перезаписать свежие данные старыми
// ============================================================
app.post('/api/data', async (req, res) => {
  try {
    const incoming = req.body || {};
    const baseVersion = typeof incoming.baseVersion === 'number' ? incoming.baseVersion : 0;

    // Всё, что связано с проверкой версии и записью — в очередь,
    // чтобы два одновременных запроса не прочитали одну и ту же версию
    const result = await queueWrite(async () => {
      const current = await loadData();

      // 🛡️ Если клиент прислал устаревшую baseVersion — отклоняем
      if (baseVersion < current.version) {
        console.warn(`[STALE] Клиент прислал baseVersion=${baseVersion}, на сервере version=${current.version}. Отклонено.`);
        return {
          status: 409,
          body: {
            error: 'st
