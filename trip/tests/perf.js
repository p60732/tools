/* 效能估算：數每種情境呼叫了幾次慢的 Google 服務，換算成大概的毫秒（權重是 GAS 常見延遲的粗估） */
const { makeEnv, setup } = require('./gas-sim');
const W = { openById: 250, getSheetByName: 20, getLastRow: 60, getValues: 100, setValues: 120, appendRow: 150, propGet: 30, propGetAll: 40, propSet: 80 };
const g = setup(makeEnv({ quiet: true }));
const tok = g.call({ action: 'login', password: 'family123', who: '媽媽' }).data.token;
const measure = (name, fn) => {
  Object.keys(g.__calls).forEach(k => delete g.__calls[k]);
  const r = fn();
  const c = Object.assign({}, g.__calls), ms = Object.entries(c).reduce((s, [k, v]) => s + (W[k] || 0) * v, 0);
  console.log(name.padEnd(22), String(ms).padStart(6) + ' ms', JSON.stringify(c));
  return r;
};
const N = 120;   // 一趟 5 天的行程大約：景點 60 + 清單 40 + 航班住宿接送附件 20
const ops = Array.from({ length: N }, (_, i) => ({ coll: i === 0 ? 'trip' : ['stop', 'todo', 'flight', 'hotel'][i % 4], tripId: 't1', key: i === 0 ? 'meta' : 'k' + i, data: { name: '項目' + i }, baseRev: 0 }));
measure('登入', () => g.call({ action: 'login', password: 'family123', who: '媽媽' }));
measure('上傳整趟(120筆)', () => g.call({ action: 'push', token: tok, ops }));
const full = measure('第一次下載整趟', () => g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 }));
const seq = full.data.seq;
measure('沒變動的輪詢', () => g.call({ action: 'pull', token: tok, tripId: 't1', since: seq }));
measure('改一個景點', () => g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: 'k4', data: { name: '改' }, baseRev: 1 }] }));
measure('別人改後的輪詢', () => g.call({ action: 'pull', token: tok, tripId: 't1', since: seq }));
measure('只抓旅程清單', () => g.call({ action: 'pull', token: tok, tripId: '', since: 0 }));
