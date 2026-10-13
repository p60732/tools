/* 全家同步端對端測試：兩個瀏覽器扮演媽媽和爸爸，後端是跑真正 gas/*.gs 的假後端 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/trip/';
const API = process.env.API || 'http://localhost:8790/';
let pass = 0, fail = 0; const t = (n, c) => { if (c) pass++; else { fail++; console.log('✗', n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function person(b, who, init) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([api, init]) => {
    if (!localStorage.getItem('tripnote.apiOverride')) {
      localStorage.setItem('tripnote.apiOverride', JSON.stringify(api));
      if (init) Object.entries(init).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }
  }, [API, init || null]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(BASE);
  await p.waitForSelector('#gateform', { state: 'visible' });
  return { ctx, p, who };
}
async function login(u, pw) {
  await u.p.fill('#pw', pw); await u.p.selectOption('#who', u.who); await u.p.click('#gate-btn'); await sleep(900);
}
const sync = u => u.p.evaluate(() => Sync.run());
const names = u => u.p.$$eval('#dayview .tl .nm b', a => a.map(x => x.textContent));

(async () => {
  const b = await chromium.launch();
  const mom = await person(b, '媽媽'), dad = await person(b, '爸爸');
  t('接後端要輸入密碼', await mom.p.locator('#pw-field').isVisible());
  await login(mom, 'wrong');
  t('錯密碼有提示', (await mom.p.textContent('#pwerr')).includes('密碼不對'));
  await login(mom, 'family123');
  t('媽媽登入成功', await mom.p.locator('#gate').isHidden());
  t('第一次登入看到範例', (await mom.p.textContent('#title')).includes('京阪'));
  t('範例標明只在這支手機', (await mom.p.textContent('.sync')).includes('範例行程只存在這支手機'));

  // 媽媽匯入新行程 → 上傳
  const trip = { title: '首爾親子四日', who: '爸媽小孩', lang: 'ko', days: [
    { date: '2027-03-01', title: '明洞', stops: [{ t: '10:00', name: '明洞商圈', lat: 37.56, lng: 126.98 }, { t: '12:00', name: '午餐 刀削麵', lat: 37.563, lng: 126.985, book: 'todo' }, { t: '15:00', name: 'N首爾塔', lat: 37.551, lng: 126.988 }] },
    { date: '2027-03-02', title: '景福宮', stops: [{ t: '09:00', name: '景福宮', lat: 37.579, lng: 126.977 }, { t: '13:00', name: '北村韓屋村', lat: 37.582, lng: 126.983 }] }],
    flights: [{ dir: '去程', no: 'KE692', date: '2027-03-01', dep: '07:30', arr: '11:00', from: 'TPE', to: 'ICN', tz: '+08:00' }] };
  await mom.p.fill('#tp-paste', '```json\n' + JSON.stringify(trip) + '\n```');
  await mom.p.click('text=檢查'); await mom.p.click('text=另存成新旅程'); await sleep(300);
  await sync(mom);
  t('媽媽的新旅程同步完成', (await mom.p.textContent('.sync')).includes('全家同步'));
  const dump = await (await fetch(API + '__admin/dump')).json();
  t('後端有資料', dump['景點'] === 5 && dump['旅程'] === 1 && dump['航班'] === 1);

  // 爸爸登入 → 自動打開這趟
  await login(dad, 'family123'); await sleep(500);
  t('爸爸自動打開首爾行程', (await dad.p.textContent('#title')) === '首爾親子四日');
  t('爸爸看到航班', (await dad.p.textContent('#flights')).includes('KE692'));

  // 媽媽跳過一站 → 爸爸看到
  await mom.p.click('text=臨時改行程');
  await mom.p.locator('#dayview .edit button:has-text("跳過")').nth(2).click(); await sleep(200);
  await sync(mom); await sync(dad);
  t('爸爸看到媽媽跳過 N首爾塔', await dad.p.locator('#dayview .st.skipped:has-text("N首爾塔")').count() === 1);
  t('爸爸看到誰改的', (await dad.p.textContent('.sync')).includes('媽媽'));

  // 爸爸離線新增航班 → 上線後同步
  await dad.ctx.setOffline(true); await sleep(100);
  await dad.p.click('text=＋ 新增航班'); await dad.p.fill('#fm-no', 'KE691'); await dad.p.fill('#fm-date', '2027-03-04'); await dad.p.fill('#fm-dep', '12:30'); await dad.p.fill('#fm-arr', '14:20'); await dad.p.fill('#fm-from', 'ICN'); await dad.p.fill('#fm-to', 'TPE');
  await dad.p.click('#modalbody button[type=submit]'); await sleep(300);
  t('離線時顯示待同步', (await dad.p.textContent('.sync')).includes('離線中') && (await dad.p.textContent('#net')).includes('待同步'));
  await dad.p.reload(); await sleep(600);
  t('離線重新整理後修改還在', (await dad.p.textContent('#flights')).includes('KE691'));
  await dad.ctx.setOffline(false); await sleep(100); await sync(dad); await sync(mom);
  t('上線後媽媽看到爸爸的航班', (await mom.p.textContent('#flights')).includes('KE691'));

  // 衝突：媽媽先改刀削麵預約；爸爸沒拉新資料就改同一站
  await mom.p.click('.st:has-text("刀削麵") .chip.book'); await mom.p.selectOption('#fm-s', 'done'); await mom.p.fill('#fm-ref', 'MOM-1'); await mom.p.click('#modalbody button[type=submit]'); await sleep(200);
  await sync(mom);
  await dad.p.evaluate(() => { Sync.pull = async () => ({}); });   // 先不讓爸爸拉
  await dad.p.click('.st:has-text("刀削麵") .chip.book'); await dad.p.selectOption('#fm-s', 'wait'); await dad.p.fill('#fm-ref', 'DAD-1'); await dad.p.click('#modalbody button[type=submit]'); await sleep(200);
  const run = dad.p.evaluate(() => Sync.run());
  await dad.p.waitForSelector('#modalbody:has-text("同時有人改了")', { timeout: 5000 }).catch(() => {});
  t('爸爸看到衝突提醒', (await dad.p.textContent('#modalbody')).includes('媽媽'));
  await dad.p.click('#modalbody button:has-text("用媽媽的")'); await run;
  t('選媽媽的版本後顯示已預約', (await dad.p.textContent('#dayview')).includes('MOM-1') && !(await dad.p.textContent('#dayview')).includes('DAD-1'));
  await dad.p.reload(); await sleep(600);
  // 再一次衝突，這次選「用我的」
  await mom.p.click('.st:has-text("刀削麵") .chip.book'); await mom.p.selectOption('#fm-s', 'fail'); await mom.p.click('#modalbody button[type=submit]'); await sleep(200); await sync(mom);
  await dad.p.evaluate(() => { Sync.pull = async () => ({}); });
  await dad.p.click('.st:has-text("刀削麵") .chip.book'); await dad.p.selectOption('#fm-s', 'done'); await dad.p.fill('#fm-ref', 'DAD-2'); await dad.p.click('#modalbody button[type=submit]'); await sleep(200);
  const run2 = dad.p.evaluate(() => Sync.run());
  await dad.p.waitForSelector('#modalbody:has-text("同時有人改了")', { timeout: 5000 }).catch(() => {});
  await dad.p.click('#modalbody button:has-text("用我的")'); await run2; await sleep(200);
  await sync(mom);
  t('選用我的 → 媽媽那邊變成爸爸的版本', (await mom.p.textContent('#dayview')).includes('DAD-2'));

  // 附件：媽媽加 QR → 爸爸看到
  await mom.p.locator('#flights .att input[type=file]').first().setInputFiles(__dirname + '/qr.png'); await sleep(800);
  await sync(mom); await sleep(200);
  t('附件上傳到雲端硬碟', !!(await mom.p.evaluate(() => DB.live('file')[0] && DB.live('file')[0].data.driveId)));
  await dad.p.reload(); await sleep(400); await sync(dad); await sleep(1200);
  t('爸爸下載到附件', await dad.p.locator('#tickets .att-th img').count() === 1);

  // 媽媽加 eSIM 和行李寄送 → 爸爸看到
  await mom.p.click('text=＋ 新增 eSIM／SIM 卡／當地門號');
  await mom.p.fill('#fm-who', '媽媽'); await mom.p.fill('#fm-number', '+82 10-9999-0000'); await mom.p.fill('#fm-plan', '4 天吃到飽');
  await mom.p.click('#modal button[type=submit]'); await sleep(200);
  await mom.p.click('text=＋ 新增行李寄送');
  await mom.p.fill('#fm-from', '仁川機場 T1'); await mom.p.fill('#fm-to', '明洞飯店');
  await mom.p.click('#modal button[type=submit]'); await sleep(200);
  await sync(mom); await sync(dad);
  t('爸爸看到媽媽的當地號碼', (await dad.p.textContent('#sims')).includes('+82 10-9999-0000'));
  t('爸爸看到行李寄送', (await dad.p.textContent('#bags')).includes('明洞飯店'));
  const dump2 = await (await fetch(API + '__admin/dump')).json();
  t('存在通訊表和行李表', dump2['通訊'] === 1 && dump2['行李'] === 1);
  await mom.p.click('text=＋ 新增優惠券・門票'); await mom.p.fill('#fm-title', '樂天免稅 9 折'); await mom.p.click('#modal button[type=submit]'); await sleep(200);
  await sync(mom); await sync(dad);
  t('爸爸看到優惠券', (await dad.p.textContent('#coupons')).includes('樂天免稅 9 折'));
  await mom.p.click('text=＋ 加到口袋名單'); await mom.p.fill('#fm-name', '明洞餃子'); await mom.p.fill('#fm-dish', '刀削麵'); await mom.p.click('#modal button[type=submit]'); await sleep(200);
  await sync(mom); await sync(dad);
  t('爸爸看到口袋名單', (await dad.p.textContent('#food-pocket')).includes('明洞餃子'));
  t('存在票券表', (await (await fetch(API + '__admin/dump')).json())['票券'] === 1);
  // 全部登出 → 要求重新登入
  await fetch(API + '__admin/logout');
  await sync(mom); await sleep(300);
  t('登出後要求重新輸入密碼', await mom.p.locator('#gate').isVisible() && await mom.p.locator('#pw-field').isVisible());
  await login(mom, 'family123');
  t('重新登入後回到同一趟', (await mom.p.textContent('#title')) === '首爾親子四日');

  // v0.1 舊資料搬移：手機上有 v0.1 匯入的行程
  const v01 = { 'tripnote.who': '阿嬤', 'tripnote.imported': { id: 'trip-old-1', title: '台南小旅行', days: [{ date: '2027-05-01', title: '台南', stops: [{ id: 'd1s1', t: '10:00', name: '赤崁樓', lat: 22.997, lng: 120.202 }] }] },
    'tripnote.trip-old-1.edits': { order: {}, skip: { d1s1: true }, swap: {}, added: {}, book: {} } };
  const grandma = await person(b, '阿嬤', v01);
  await login(grandma, 'family123'); await sleep(600);
  t('舊行程搬過來而且跳過狀態保留', (await grandma.p.textContent('#title')) === '台南小旅行' && await grandma.p.locator('#dayview .st.skipped').count() === 1);
  t('舊行程標明還沒上傳', (await grandma.p.textContent('.sync')).includes('還沒上傳'));
  await grandma.p.click('.trip-row:has-text("台南") button:has-text("上傳給全家")'); await sleep(300); await sync(grandma);
  await sync(dad); await sleep(200);
  t('爸爸 token 過期也會跳出登入', await dad.p.locator('#gate').isVisible());
  await login(dad, 'family123'); await sync(dad);
  t('爸爸的旅程清單看到台南', (await dad.p.textContent('#toolbox')).includes('台南小旅行'));

  // 媽媽用 AI 改好的版本「更新這一趟」→ 爸爸看到新行程，旅程數不變、航班還在
  await sync(mom);
  const before2 = await mom.p.locator('.trip-row').count();
  const upd = { title: '首爾（AI 新版）', days: [{ date: '2027-03-01', title: '弘大', stops: [{ t: '11:00', name: '弘大商圈', lat: 37.556, lng: 126.923 }] }] };
  await mom.p.fill('#tp-paste', JSON.stringify(upd)); await mom.p.click('text=檢查'); await mom.p.click('button:has-text("更新這一趟")'); await sleep(300);
  await sync(mom); await sync(dad);
  t('爸爸看到更新後的行程', (await dad.p.textContent('#dayview')).includes('弘大商圈') && (await dad.p.textContent('#title')) === '首爾親子四日');
  t('更新後航班還在、旅程沒變多', (await dad.p.textContent('#flights')).includes('KE692') && await mom.p.locator('.trip-row').count() === before2);
  // 爸爸在清單上刪掉台南（不是他目前打開的那趟）→ 媽媽清單也不見
  await sync(dad); await sync(mom);
  t('刪之前媽媽看得到台南', (await mom.p.textContent('#toolbox')).includes('台南小旅行'));
  await dad.p.click('.trip-row:has-text("台南") button:has-text("刪除")'); await dad.p.click('.trip-row:has-text("台南") button:has-text("確定刪除？")'); await sleep(300);
  await sync(dad); await sync(mom); await sleep(200);
  t('媽媽清單也刪掉台南', !(await mom.p.textContent('#toolbox')).includes('台南小旅行') && (await mom.p.textContent('#title')) === '首爾親子四日');
  // 舊旅程唯讀
  await mom.p.evaluate(() => { Trips.upsert(DB.tripId, { end: '2020-01-01' }); renderAll(false); });
  t('結束的旅程顯示唯讀', (await mom.p.textContent('#sample-note')).includes('唯讀'));
  const before = await names(mom);
  const skippedBefore = await mom.p.$$eval('#dayview .st.skipped', a => a.length);
  await mom.p.click('text=臨時改行程'); await mom.p.locator('#dayview .edit button:has-text("跳過")').first().click(); await sleep(200);
  t('唯讀時改不動', await mom.p.$$eval('#dayview .st.skipped', a => a.length) === skippedBefore);

  const errs = [...mom.p.errs, ...dad.p.errs, ...grandma.p.errs];
  t('沒有錯誤', errs.length === 0); if (errs.length) console.log(errs);
  console.log(`全家同步測試：${pass} 通過，${fail} 失敗`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
