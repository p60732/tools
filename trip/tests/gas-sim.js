/* 用 Node 模擬 Google Apps Script 環境，直接跑 trip/gas/*.gs 的真正程式碼（給測試與本機假後端用） */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function makeEnv(opts = {}) {
  let idn = 0; const nid = p => p + (++idn).toString().padStart(4, '0') + 'xxxxxxxxxxxx';
  const props = {}, cache = new Map(), sheetsById = {}, drive = {};
  const calls = {}; const C = k => { calls[k] = (calls[k] || 0) + 1; };   // 數一下慢的 Google 服務呼叫（效能測試用）
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { C('getValues'); const out = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] ?? '')); } return out; }
    setValues(v) { C('setValues'); v.forEach((row, i) => { const R = this.sh.rows[this.r - 1 + i] || (this.sh.rows[this.r - 1 + i] = []); row.forEach((x, j) => R[this.c - 1 + j] = x); }); return this; }
    setFontWeight() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    getName() { return this.name; } setName(n) { this.name = n; return this; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { C('getLastRow'); let n = this.rows.length; while (n > 0 && !(this.rows[n - 1] || []).some(x => x !== '' && x != null)) n--; return n; }
    appendRow(v) { C('appendRow'); this.rows[this.getLastRow()] = v.slice(); }
    setFrozenRows() { return this; }
  }
  class SS {
    constructor(name) { this.id = nid('ss'); this.name = name; this.sheets = [new Sheet('工作表1')]; sheetsById[this.id] = this; drive[this.id] = { kind: 'file', id: this.id, name, parents: [], trashed: false, created: Date.now(), ss: this }; }
    getId() { return this.id; } getSheets() { return this.sheets; }
    getSheetByName(n) { C('getSheetByName'); return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  }
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const fileObj = rec => ({
    getId: () => rec.id, getName: () => rec.name, isTrashed: () => rec.trashed, setTrashed: v => { rec.trashed = v; },
    setDescription: () => {}, getDateCreated: () => new Date(rec.created),
    getParents: () => iter(rec.parents.map(id => folderObj(drive[id]))),
    moveTo: f => { rec.parents = [f.getId()]; },
    makeCopy: (name, f) => { const c = { ...rec, id: nid('cp'), name, parents: [f.getId()], created: Date.now() }; drive[c.id] = c; return fileObj(c); },
    getBlob: () => blob(rec.bytes, rec.type, rec.name)
  });
  const folderObj = rec => ({
    getId: () => rec.id, getName: () => rec.name,
    getParents: () => iter(rec.parents.map(id => folderObj(drive[id]))),
    createFolder: name => { const f = { kind: 'folder', id: nid('fd'), name, parents: [rec.id] }; drive[f.id] = f; return folderObj(f); },
    getFoldersByName: name => iter(Object.values(drive).filter(d => d.kind === 'folder' && d.name === name && d.parents.includes(rec.id)).map(folderObj)),
    createFile: b => { const f = { kind: 'file', id: nid('fi'), name: b.getName(), type: b.getContentType(), bytes: b.getBytes(), parents: [rec.id], trashed: false, created: Date.now() }; drive[f.id] = f; return fileObj(f); },
    getFiles: () => iter(Object.values(drive).filter(d => d.kind === 'file' && d.parents.includes(rec.id)).map(fileObj))
  });
  const toBuf = x => Buffer.isBuffer(x) ? x : Array.isArray(x) ? Buffer.from(x.map(b => b & 255)) : Buffer.from(String(x), 'utf8');
  const signed = buf => Array.from(buf).map(b => b > 127 ? b - 256 : b);
  const blob = (bytes, type, name) => ({ getBytes: () => signed(toBuf(bytes)), getDataAsString: () => toBuf(bytes).toString('utf8'), getContentType: () => type, getName: () => name });
  const env = {
    console: opts.quiet ? { log() {}, error() {} } : console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => { C('propGet'); return props[k] ?? null; }, getProperties: () => { C('propGetAll'); return Object.assign({}, props); }, setProperty: (k, v) => { C('propSet'); props[k] = String(v); }, setProperties: o => { C('propSet'); Object.keys(o).forEach(k => { props[k] = String(o[k]); }); }, deleteProperty: k => { C('propSet'); delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: id => { C('openById'); if (!sheetsById[id]) throw new Error('not found'); return sheetsById[id]; }, create: n => new SS(n) },
    DriveApp: {
      createFolder: name => { const f = { kind: 'folder', id: nid('fd'), name, parents: [] }; drive[f.id] = f; return folderObj(f); },
      getFolderById: id => { if (!drive[id] || drive[id].kind !== 'folder') throw new Error('nf'); return folderObj(drive[id]); },
      getFileById: id => { if (!drive[id] || drive[id].kind !== 'file') throw new Error('nf'); return fileObj(drive[id]); }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return s; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
      computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', k).update(String(v), 'utf8').digest()),
      base64EncodeWebSafe: x => toBuf(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => signed(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      base64Encode: x => toBuf(x).toString('base64'),
      base64Decode: s => signed(Buffer.from(String(s), 'base64')),
      newBlob: (b, t, n) => blob(b, t, n),
      getUuid: () => crypto.randomUUID(),
      formatDate: d => d.toISOString().slice(0, 10)
    },
    UrlFetchApp: { fetch: opts.fetch || ((url) => {
      if (/rate\.bot/.test(url)) return { getResponseCode: () => 200, getContentText: () => '幣別,匯率,現金,即期\nUSD,本行買入,31.48,31.805,0,0,本行賣出,32.15,31.955\nJPY,本行買入,0.1922,0.199,0,0,本行賣出,0.205,0.204\nKRW,本行買入,0.02204,0,0,0,本行賣出,0.02594,0\n', getHeaders: () => ({}) };
      if (/maps\.app\.goo\.gl/.test(url)) return { getResponseCode: () => 302, getHeaders: () => ({ Location: 'https://www.google.com/maps/place/Test+Cafe/@35.0,135.7,17z/data=!3d35.01!4d135.77' }) };
      return { getResponseCode: () => 404, getHeaders: () => ({}), getContentText: () => '' };
    }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, inTimezone() { return this; }, create() {} }) },
    Date, JSON, Math, Object, Array, String, Number, Error, RegExp, Buffer
  };
  vm.createContext(env);
  const dir = process.env.GAS_DIR || path.join(__dirname, '..', 'gas');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), env, { filename: f }));
  env.__calls = calls;
  env.__props = props; env.__drive = drive; env.__sheets = sheetsById; env.__cache = cache;
  env.fresh = () => { env._props = null; env._ss = null; };   // 真的 GAS 每次請求都是全新的全域變數
  env.call = (body) => { env.fresh(); return env.callRaw(body); };
  env.callRaw = (body) => JSON.parse(env.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).content);
  return env;
}

function setup(env, password = 'family123') {
  env.DANGER_setupTripNotebook();
  env.__props.NEW_PASSWORD = password;
  env.fresh(); env.APPLY_NEW_PASSWORD(); env.fresh();
  return env;
}
module.exports = { makeEnv, setup };
