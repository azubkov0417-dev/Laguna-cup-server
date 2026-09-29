const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JSONBIN_BIN_ID = '6ab45dceac6210605aeee08c';
const JSONBIN_API_KEY = '$2a$10$1ebBxDj5FRXFDtjsc1GVne44FSKBOaTV4GVhLTNs7fQe62sSPE3Om';

function httpsReq(method, url, headers, body) {
  return new Promise(function(resolve, reject) {
    const u = new URL(url);
    const opts = { method: method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} };
    const req = https.request(opts, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loadData() {
  try {
    const r = await httpsReq('GET', 'https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID + '/latest', { 'X-Master-Key': JSONBIN_API_KEY });
    if (r.status !== 200) {
      console.error('[load] JSONbin status ' + r.status);
      return { version: 0, tournaments: [], data: {}, playersDb: [] };
    }
    const json = JSON.parse(r.body);
    const rec = json.record || {};
    return {
      version: typeof rec.version === 'number' ? rec.version : 0,
      tournaments: rec.tournaments || [],
      data: rec.data || {},
      playersDb: rec.playersDb || []
    };
  } catch (e) {
    console.error('[load] error: ' + e.message);
    return { version: 0, tournaments: [], data: {}, playersDb: [] };
  }
}

async function saveData(d) {
  const r = await httpsReq('PUT', 'https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID, {
    'Content-Type': 'application/json',
    'X-Master-Key': JSONBIN_API_KEY
  }, JSON.stringify(d));
  if (r.status >= 300) throw new Error('save failed: ' + r.status + ' ' + r.body);
}

let queue = Promise.resolve();
function enqueue(fn) {
  const r = queue.then(fn);
  queue = r.catch(function(){});
  return r;
}

function readIndexHtml() {
  try { return fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'); }
  catch (e) { return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>HTML не найден</h1></body></html>'; }
}

const server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url.indexOf('/api/data') === 0) {
    loadData().then(function(data) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }).catch(function(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  if (req.method === 'POST' && req.url.indexOf('/api/data') === 0) {
    let body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      let inc;
      try { inc = JSON.parse(body || '{}'); }
      catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'bad json' })); return; }

      const bv = typeof inc.baseVersion === 'number' ? inc.baseVersion : 0;

      enqueue(async function() {
        const cur = await loadData();
        if (bv < cur.version) {
          console.warn('[STALE] baseVersion=' + bv + ', current=' + cur.version);
          return { status: 409, body: { error: 'stale', currentVersion: cur.version, data: cur } };
        }
        const nd = {
          version: cur.version + 1,
          tournaments: inc.tournaments || [],
          data: inc.data || {},
          playersDb: inc.playersDb || []
        };
        await saveData(nd);
        console.log('[OK] version=' + nd.version + ' (была ' + cur.version + ')');
        return { status: 200, body: { version: nd.version } };
      }).then(function(out) {
        res.writeHead(out.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body));
      }).catch(function(e) {
        console.error('[POST] error: ' + e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      });
    });
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readIndexHtml());
    return;
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, function() {
  console.log('Сервер запущен на порту ' + PORT);
  console.log('JSONbin bin: ' + JSONBIN_BIN_ID);
});
