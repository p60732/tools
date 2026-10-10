/* 本機模式回歸測試（沒有後端）：v0.1 的功能都要照常 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/trip/';
let pass = 0, fail = 0; const t = (n, c) => { if (c) pass++; else { fail++; console.log('✗', n); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem('tripnote.apiOverride')) localStorage.setItem('tripnote.apiOverride', JSON.stringify('off')); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE);
  await p.waitForSelector('#gateform', { state: 'visible' });
  t('本機模式不問密碼', await p.locator('#pw-field').isHidden());
  await p.selectOption('#who', '媽媽'); await p.click('#gate-btn'); await p.waitForTimeout(300);
  t('範例行程', (await p.textContent('#title')).includes('京阪'));
  t('範例提示', await p.locator('#sample-note').count() === 1);
  // 跳過一站
  await p.click('text=臨時改行程');
  await p.locator('#dayview .edit button:has-text("跳過")').first().click(); await p.waitForTimeout(200);
  t('跳過有效', await p.locator('#dayview .st.skipped').count() === 1);
  // 拖曳
  await p.evaluate(() => { const d = document.querySelectorAll('#dayview .drag')[1]; window.scrollTo({ top: d.getBoundingClientRect().top + scrollY - 140, behavior: 'instant' }); }); await p.waitForTimeout(150);
  const names = () => p.$$eval('#dayview .tl .nm b', a => a.map(x => x.textContent));
  const before = await names();
  const h1 = await p.locator('#dayview .drag').nth(1).boundingBox(), h3 = await p.locator('#dayview .drag').nth(3).boundingBox();
  await p.mouse.move(h1.x + 20, h1.y + 15); await p.mouse.down();
  for (let i = 1; i <= 15; i++) { await p.mouse.move(h1.x + 20, h1.y + 15 + (h3.y - h1.y + 40) * i / 15); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(300);
  const after = await names();
  t('拖曳改順序', before[1] !== after[1] && after.includes(before[1]));
  // 重新整理後還在
  await p.reload(); await p.waitForTimeout(400);
  const kept = await names();
  t('重新整理後順序還在', JSON.stringify(kept) === JSON.stringify(after));
  t('跳過還在', await p.locator('#dayview .st.skipped').count() === 1);
  // 還原
  await p.click('text=還原'); await p.waitForTimeout(200);
  t('還原', JSON.stringify(await names()) === JSON.stringify(before) && await p.locator('#dayview .st.skipped').count() === 0);
  // 加一站
  await p.click('text=臨時改行程'); await p.click('text=＋ 加一站');
  await p.fill('#ap-url', 'https://www.google.com/maps/place/Test+Cafe/@35.0,135.7,17z/data=!3d35.01!4d135.77');
  await p.fill('#ap-time', '20:00'); await p.click('#modalbody button[type=submit]'); await p.waitForTimeout(200);
  t('加一站', (await names()).includes('Test Cafe'));
  await p.reload(); await p.waitForTimeout(300);
  t('加的站重新整理後還在', (await names()).includes('Test Cafe'));
  // 航班新增
  await p.click('text=＋ 新增航班'); await p.fill('#fm-no', 'JL814'); await p.fill('#fm-date', '2026-12-22'); await p.fill('#fm-dep', '09:10'); await p.fill('#fm-arr', '10:20'); await p.fill('#fm-from', 'ITM'); await p.fill('#fm-to', 'HND');
  await p.click('#modalbody button[type=submit]'); await p.waitForTimeout(200);
  t('新增航班', await p.locator('#flights .pass').count() === 3);
  // 清單打勾＋新增
  await p.locator('#todos input[type=checkbox]').first().check(); await p.waitForTimeout(150);
  await p.fill('#add-1', '泳衣'); await p.locator('#todos form.add').nth(1).locator('button').click(); await p.waitForTimeout(150);
  await p.reload(); await p.waitForTimeout(300);
  t('打勾保存', await p.locator('#todos input[type=checkbox]').first().isChecked());
  t('新增清單項保存', (await p.textContent('#todos')).includes('泳衣'));
  // 預約狀態
  await p.click('#days button:nth-child(4)'); await p.waitForTimeout(150);
  await p.click('.chip.book'); await p.selectOption('#fm-s', 'done'); await p.click('#modalbody button[type=submit]'); await p.waitForTimeout(200);
  t('預約狀態', await p.locator('.day-dot').count() === 0);
  // 附件
  await p.locator('#dayview .att input[type=file]').first().setInputFiles(__dirname + '/qr.png'); await p.waitForTimeout(800);
  t('附件縮圖', await p.locator('#dayview .att-th img').count() >= 1);
  await p.reload(); await p.waitForTimeout(800);
  t('票券夾', await p.locator('#tickets .att-th img').count() >= 1);
  // 網路・電話、行李寄送
  t('範例有 2 張網路卡和 1 筆行李', await p.locator('#sims article').count() === 2 && await p.locator('#bags article').count() === 1);
  t('當地號碼可以直接撥', await p.locator('#sims a[href^="tel:+8190"]').count() === 1);
  await p.click('text=＋ 新增 eSIM／SIM 卡／當地門號');
  await p.selectOption('#fm-kind', 'sim'); await p.fill('#fm-who', '阿嬤'); await p.fill('#fm-number', '+82 10-1234-5678');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(200);
  t('新增網路卡', await p.locator('#sims article:has-text("阿嬤")').count() === 1);
  await p.locator('#sims article:has-text("阿嬤") .att input[type=file]').setInputFiles(__dirname + '/qr.png'); await p.waitForTimeout(800);
  t('eSIM QR 存圖', await p.locator('#sims article:has-text("阿嬤") .att-th img').count() === 1);
  await p.click('text=＋ 新增行李寄送');
  await p.fill('#fm-from', '金海機場行李櫃台'); await p.fill('#fm-to', '海雲台飯店');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(200);
  t('新增行李寄送', await p.locator('#bags article:has-text("海雲台飯店")').count() === 1);
  await p.reload(); await p.waitForTimeout(600);
  t('重新整理後網路和行李都在', await p.locator('#sims article').count() === 3 && await p.locator('#bags article').count() === 2 && await p.locator('#sims .att-th img').count() === 1);
  t('票券夾收到 eSIM', (await p.textContent('#tickets')).includes('網路 實體 SIM 卡 阿嬤'));
  // 匯入新行程
  const json = JSON.stringify({ title: '北海道冬天', days: [{ date: '2027-02-10', title: '札幌', stops: [{ t: '10:00', name: '大通公園', lat: 43.06, lng: 141.35, move: { type: 'car', text: '自駕' } }] }] });
  await p.fill('#tp-paste', '```json\n' + json + '\n```'); await p.click('text=檢查'); await p.click('text=換成這個行程'); await p.waitForTimeout(300);
  t('匯入切換', (await p.textContent('#title')) === '北海道冬天');
  t('旅程清單有兩趟', await p.locator('.trip-row').count() === 2);
  await p.locator('.trip-row:has-text("京阪") button:has-text("打開")').click(); await p.waitForTimeout(300);
  t('切回京阪且資料還在', (await p.textContent('#title')).includes('京阪') && await p.locator('#flights .pass').count() === 3);
  t('沒有錯誤', errs.length === 0); if (errs.length) console.log(errs);
  console.log(`本機模式測試：${pass} 通過，${fail} 失敗`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
