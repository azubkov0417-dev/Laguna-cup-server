const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// 🔑 Путь к файлу с данными. Если SpaceWeb даёт постоянную папку — укажите её через DATA_FILE.
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const BACKUP_FILE = DATA_FILE + '.backup';

// ============ ЧТЕНИЕ / ЗАПИСЬ ============

function defaultState() {
  return { version: 0, tournaments: [], data: {}, playersDb: [] };
}

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        version: typeof parsed.version === 'number' ? parsed.version : 0,
        tournaments: parsed.tournaments || [],
        data: parsed.data || {},
        playersDb: parsed.playersDb || []
      };
    }
  } catch (e) {
    console.error('[loadState] Ошибка чтения ' + DATA_FILE + ':', e.message);
    // Пробуем бэкап
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const raw = fs.readFileSync(BACKUP_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        console.log('[loadState] Восстановлено из бэкапа.');
        return {
          version: typeof parsed.version === 'number' ? parsed.version : 0,
          tournaments: parsed.tournaments || [],
          data: parsed.data || {},
          playersDb: parsed.playersDb || []
        };
      }
    } catch (e2) { console.error('[loadState] Бэкап тоже не читается:', e2.message); }
  }
  // Файла нет или он битый — создаём дефолт
  const init = defaultState();
  saveState(init);
  return init;
}

function saveState(state) {
  try {
    const json = JSON.stringify(state);
    // 1. Сохраняем предыдущую версию в backup
    try {
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
      }
    } catch(e) {}
    // 2. Пишем в временный файл
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, json);
    // 3. Атомарно заменяем
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('[saveState] Ошибка записи:', e.message);
    throw e;
  }
}

function readIndexHtml() {
  try {
    return fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  } catch (e) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>HTML не найден</h1><p>Проверьте, что файл public/index.html есть в репозитории.</p></body></html>';
  }
}

// ============ HTTP СЕРВЕР ============

const server = http.createServer(function(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/data
  if (req.method === 'GET' && req.url.indexOf('/api/data') === 0) {
    try {
      const state = loadState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /api/data
  if (req.method === 'POST' && req.url.indexOf('/api/data') === 0) {
    let body = '';
    let tooBig = false;
    req.on('data', function(c) {
      body += c;
      if (body.length > 10 * 1024 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on('end', function() {
      if (tooBig) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload too large' }));
        return;
      }
      try {
        const incoming = JSON.parse(body || '{}');
        const baseVersion = typeof incoming.baseVersion === 'number' ? incoming.baseVersion : 0;
        const current = loadState();

        // 🛡️ Проверка устаревших данных
        if (baseVersion < current.version) {
          console.warn('[STALE] baseVersion=' + baseVersion + ', server version=' + current.version + '. Отклонено.');
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'stale',
            currentVersion: current.version,
            data: current
          }));
          return;
        }

        // Сохраняем новую версию
        const newState = {
          version: current.version + 1,
          tournaments: incoming.tournaments || [],
          data: incoming.data || {},
          playersDb: incoming.playersDb || []
        };
        saveState(newState);
        console.log('[OK] Сохранено. Новая версия: ' + newState.version + ' (была ' + current.version + ')');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: newState.version }));
      } catch (e) {
        console.error('[POST /api/data] Ошибка:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET всё остальное → отдаём HTML
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readIndexHtml());
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, function() {
  console.log('Сервер запущен на порту ' + PORT);
  console.log('Файл данных: ' + DATA_FILE);
  const st = loadState();
  console.log('Текущая версия данных: ' + st.version);
  console.log('Турниров: ' + st.tournaments.length + ', игроков в базе: ' + st.playersDb.length);
});
