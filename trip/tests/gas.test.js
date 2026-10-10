/* 後端規則測試：直接跑 gas/*.gs */
const { makeEnv, setup } = require('./gas-sim');
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('✗', name); } };

const g = setup(makeEnv({ quiet: true }));
// 守門
t('未知 action 拒絕', g.call({ action: 'hack' }).error === '未知的操作');
t('白名單外參數拒絕', g.call({ action: 'login', password: 'x', who: 'a', role: 'admin' }).error === '不接受的參數');
t('壞 JSON 拒絕', g.call('{bad').error === '格式不對');
t('沒登入不能讀', g.call({ action: 'pull', tripId: 't1', since: 0 }).code === 'auth');
t('doGet 不像正常回應', JSON.parse(g.doGet().content).success === false && JSON.parse(g.doGet().content).health === true);
t('超長欄位拒絕', /太長/.test(g.call({ action: 'login', password: 'x'.repeat(600), who: 'a' }).error));
// 登入
t('錯密碼', g.call({ action: 'login', password: 'nope', who: '媽媽' }).error === '密碼不對');
const ok = g.call({ action: 'login', password: 'family123', who: '媽媽' });
t('對密碼拿到 token', ok.success && ok.data.token);
const tok = ok.data.token;
t('竄改 token 失效', g.call({ action: 'pull', token: tok.slice(0, -2) + 'xx', tripId: 't1', since: 0 }).code === 'auth');
const fake = Buffer.from(JSON.stringify({ w: '駭客', e: Date.now() + 1e9, v: 1 })).toString('base64') + '.' + tok.split('.')[1];
t('自己做 payload 失效', g.call({ action: 'pull', token: fake, tripId: 't1', since: 0 }).code === 'auth');
t('密碼沒存明碼', !g.__props.NEW_PASSWORD && g.__props.PW_HASH && !Object.values(g.__props).includes('family123'));
// 讀寫
const p0 = g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 });
t('空的 pull', p0.success && p0.data.docs.length === 0);
const w1 = g.call({ action: 'push', token: tok, ops: [
  { coll: 'trip', tripId: 't1', key: 'meta', data: { title: '京都' }, baseRev: 0, msg: '新增旅程' },
  { coll: 'stop', tripId: 't1', key: 's1', data: { name: '清水寺', day: 0, pos: 1 }, baseRev: 0 }] });
t('新增成功', w1.success && w1.data.results.every(r => r.status === 'ok' && r.rev === 1));
const p1 = g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 });
t('pull 拿到 2 筆', p1.data.docs.length === 2 && p1.data.docs.find(d => d.key === 's1').by === '媽媽');
t('紀錄寫入', p1.data.log.length === 1 && p1.data.log[0].text === '新增旅程');
const since = p1.data.seq;
// 另一人
const tok2 = g.call({ action: 'login', password: 'family123', who: '爸爸' }).data.token;
const w2 = g.call({ action: 'push', token: tok2, ops: [{ coll: 'stop', tripId: 't1', key: 's1', data: { name: '清水寺', day: 0, pos: 2 }, baseRev: 1, msg: '移動' }] });
t('爸爸用正確版本改成功', w2.data.results[0].status === 'ok' && w2.data.results[0].rev === 2);
const w3 = g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: 's1', data: { name: '清水寺', day: 0, pos: 3 }, baseRev: 1 }] });
t('媽媽用舊版本 → 衝突', w3.data.results[0].status === 'conflict' && w3.data.results[0].server.by === '爸爸' && w3.data.results[0].server.data.pos === 2);
const w4 = g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: 's1', data: { name: '清水寺', day: 0, pos: 3 }, baseRev: 1, force: true }] });
t('選擇用我的 → 覆蓋', w4.data.results[0].status === 'ok' && w4.data.results[0].rev === 3);
const p2 = g.call({ action: 'pull', token: tok2, tripId: 't1', since });
t('增量 pull 只拿變動的', p2.data.docs.length === 1 && p2.data.docs[0].rev === 3);
t('別趟旅程不混進來', g.call({ action: 'pull', token: tok, tripId: 't2', since: 0 }).data.docs.filter(d => d.coll !== 'trip').length === 0);
t('旅程清單跨旅程可見', g.call({ action: 'pull', token: tok, tripId: 't2', since: 0 }).data.docs.some(d => d.coll === 'trip' && d.tripId === 't1'));
// op 驗證
t('壞的資料類型', /不認得/.test(g.call({ action: 'push', token: tok, ops: [{ coll: 'user', tripId: 't1', key: 'a', data: {} }] }).error));
t('壞的 key', /代號/.test(g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: '=HYPERLINK("x")', data: {} }] }).error));
t('op 多餘欄位', /不接受/.test(g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: 'a', data: {}, by: '別人' }] }).error));
t('太大資料', /太大/.test(g.call({ action: 'push', token: tok, ops: [{ coll: 'stop', tripId: 't1', key: 'a', data: { x: 'y'.repeat(46000) } }] }).error));
// 資料保護
const ss = g.__sheets[g.__props.SHEET_ID];
const saved = ss.sheets.find(s => s.name === '景點'); saved.name = '景點舊';
t('找不到工作表就報錯，不自動建立', /找不到工作表/.test(g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 }).error) && !ss.sheets.find(s => s.name === '景點'));
saved.name = '景點'; const h = saved.rows[0][2]; saved.rows[0][2] = 'oops'; g._ss = null;
t('表頭不對就報錯', /欄位不對/.test(g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 }).error));
saved.rows[0][2] = h;
t('已有資料拒絕重新初始化', (() => { try { g.fresh(); g.DANGER_setupTripNotebook(); return false; } catch (e) { return /拒絕/.test(e.message); } })());
// 檔案
const up = g.call({ action: 'upload', token: tok, tripId: 't1', fileId: 'f1', name: 'qr.png', type: 'image/png', b64: Buffer.from('PNGDATA').toString('base64') });
t('上傳成功', up.success && up.data.driveId);
const gf = g.call({ action: 'getFile', token: tok2, driveId: up.data.driveId });
t('別人下載得到', gf.success && Buffer.from(gf.data.b64, 'base64').toString() === 'PNGDATA');
t('不接受執行檔', /圖片或 PDF/.test(g.call({ action: 'upload', token: tok, tripId: 't1', fileId: 'f2', name: 'a.exe', type: 'application/x-msdownload', b64: 'AA==' }).error));
t('不能讀附件資料夾以外的檔案', /找不到/.test(g.call({ action: 'getFile', token: tok, driveId: g.__props.SHEET_ID }).error));
g.call({ action: 'push', token: tok, ops: [{ coll: 'file', tripId: 't1', key: 'f1', data: { driveId: up.data.driveId }, baseRev: 0 }] });
g.call({ action: 'push', token: tok, ops: [{ coll: 'file', tripId: 't1', key: 'f1', data: { driveId: up.data.driveId }, baseRev: 1, deleted: true }] });
t('刪附件會丟垃圾桶', g.__drive[up.data.driveId].trashed === true);
// 連線
const fx = g.call({ action: 'fx', token: tok });
t('匯率解析', fx.success && fx.data.rates.USD === 32.15 && fx.data.rates.KRW === 0.02594 && fx.data.rates.JPY === 0.205);
t('短網址展開', g.call({ action: 'resolveMap', token: tok, url: 'https://maps.app.goo.gl/abc' }).data.url.includes('!3d35.01'));
t('不展開別的網址', /只能展開/.test(g.call({ action: 'resolveMap', token: tok, url: 'https://evil.com/x' }).error));
// 登出全部
g.fresh(); g.LOGOUT_EVERYONE();
t('全部登出後舊 token 失效', g.call({ action: 'pull', token: tok, tripId: 't1', since: 0 }).code === 'auth');
// 節流
for (let i = 0; i < 5; i++) g.call({ action: 'login', password: 'bad', who: 'x' });
t('連錯 5 次鎖住（對的也進不去）', /太多次/.test(g.call({ action: 'login', password: 'family123', who: 'x' }).error));
// 備份
g.dailyBackup();
t('每日備份產生副本', Object.values(g.__drive).filter(d => / \d{4}-\d{2}-\d{2}$/.test(d.name)).length === 2);
// 錯誤不外洩
t('錯誤訊息不含試算表 ID', !JSON.stringify(g.call({ action: 'pull', token: 'x.y', tripId: 't1', since: 0 })).includes(g.__props.SHEET_ID));

// 效能改寫的正確性：批次新增、同批改兩次、沒變動快速回應、只跳過真的沒變的表
{
  const { makeEnv, setup } = require('./gas-sim');
  const h = setup(makeEnv({ quiet: true }));
  const tk = h.call({ action: 'login', password: 'family123', who: '媽媽' }).data.token;
  const r = h.call({ action: 'push', token: tk, ops: [
    { coll: 'stop', tripId: 'p1', key: 'a', data: { n: 1 }, baseRev: 0 },
    { coll: 'stop', tripId: 'p1', key: 'b', data: { n: 2 }, baseRev: 0 },
    { coll: 'stop', tripId: 'p1', key: 'a', data: { n: 3 }, baseRev: 1 },
    { coll: 'todo', tripId: 'p1', key: 'c', data: { n: 4 }, baseRev: 0 }] });
  t('批次寫入都成功', r.success && r.data.results.every(x => x.status === 'ok') && r.data.seq === 4);
  const all = h.call({ action: 'pull', token: tk, tripId: 'p1', since: 0 }).data.docs;
  t('同批改兩次只留一列且是新的', all.filter(d => d.key === 'a').length === 1 && all.find(d => d.key === 'a').data.n === 3 && all.find(d => d.key === 'a').rev === 2);
  t('批次新增的列都在', all.length === 3);
  h.fresh(); h.__calls && Object.keys(h.__calls).forEach(k => delete h.__calls[k]);
  const idle = h.call({ action: 'pull', token: tk, tripId: 'p1', since: 4 });
  t('沒變動的輪詢不開試算表', idle.success && idle.data.docs.length === 0 && !h.__calls.openById && !h.__calls.getValues);
  h.call({ action: 'push', token: tk, ops: [{ coll: 'todo', tripId: 'p1', key: 'c', data: { n: 5 }, baseRev: 1 }] });
  const inc = h.call({ action: 'pull', token: tk, tripId: 'p1', since: 4 }).data.docs;
  t('只拿到有變動的那筆', inc.length === 1 && inc[0].key === 'c' && inc[0].data.n === 5);
  const seqProp = Number(h.__props.SEQ);
  t('流水號一次寫回', seqProp === 5 && JSON.parse(h.__props.CSEQ).todo === 5 && JSON.parse(h.__props.CSEQ).stop === 3);
}
// 補工作表：只新增缺的，已有資料的表不動
{
  const { makeEnv, setup } = require('./gas-sim');
  const h = setup(makeEnv({ quiet: true }));
  const tk = h.call({ action: 'login', password: 'family123', who: '媽媽' }).data.token;
  h.call({ action: 'push', token: tk, ops: [{ coll: 'stop', tripId: 'q1', key: 'a', data: { n: 1 }, baseRev: 0 }] });
  const ss = h.__sheets[h.__props.SHEET_ID];
  ss.sheets = ss.sheets.filter(x => x.name !== '通訊' && x.name !== '行李');
  t('缺表時讀取會報錯（不自動建）', /找不到工作表/.test(h.call({ action: 'pull', token: tk, tripId: 'q1', since: 0 }).error) && !ss.sheets.find(x => x.name === '通訊'));
  const before = JSON.stringify(ss.sheets.find(x => x.name === '景點').rows);
  h.fresh(); h.ADD_MISSING_SHEETS();
  t('補上通訊和行李表', ss.sheets.some(x => x.name === '通訊') && ss.sheets.some(x => x.name === '行李'));
  t('已有的表沒被動到', JSON.stringify(ss.sheets.find(x => x.name === '景點').rows) === before);
  const r = h.call({ action: 'push', token: tk, ops: [{ coll: 'sim', tripId: 'q1', key: 'sim1', data: { kind: 'esim', who: '媽媽' }, baseRev: 0 }, { coll: 'bag', tripId: 'q1', key: 'bag1', data: { to: '飯店' }, baseRev: 0 }] });
  t('新的資料類型可以存', r.success && r.data.results.every(x => x.status === 'ok'));
  t('新的資料類型可以讀', h.call({ action: 'pull', token: tk, tripId: 'q1', since: 0 }).data.docs.filter(d => d.coll === 'sim' || d.coll === 'bag').length === 2);
}
console.log(`後端測試：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
