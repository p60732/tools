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
  // 吃什麼：行程裡的餐自動整理、備案、口袋名單
  await p.click('#food-days button:has-text("全部")');
  const fl = await p.textContent('#food-list');
  t('吃什麼列出行程裡的餐', fl.includes('鴨川旁湯豆腐') && fl.includes('稻荷壽司老店') && fl.includes('錦市場吃點心') && !fl.includes('八坂神社'));
  t('名稱去掉「晚餐」前綴、有餐別標籤', (await p.textContent('#food-list article:has-text("鴨川旁湯豆腐") .m-top')).includes('晚餐') && !(await p.textContent('#food-list article:has-text("鴨川旁湯豆腐") b')).startsWith('晚餐'));
  t('有備案可以展開', await p.locator('#food-list article:has-text("錦市場") details summary:has-text("備案 1 家")').count() === 1);
  await p.click('#food-days button:has-text("12/21")');
  t('切到某一天只看那天', !(await p.textContent('#food-list')).includes('錦市場吃點心') && (await p.textContent('#food-list')).includes('Day 2'));
  await p.click('text=＋ 加到口袋名單');
  await p.fill('#fm-link', 'https://www.google.com/maps/place/Ippudo+Kyoto/@35.0037,135.7650,17z');
  t('貼地圖連結自動帶出店名', (await p.inputValue('#fm-name')) === 'Ippudo Kyoto');
  await p.fill('#fm-dish', '白丸拉麵'); await p.selectOption('#fm-day', '2026-12-21');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(200);
  t('口袋名單出現、也出現在那天', (await p.textContent('#food-pocket')).includes('Ippudo Kyoto') && (await p.textContent('#food-list')).includes('Ippudo Kyoto'));
  t('口袋名單有導航', (await p.locator('#food-pocket article:has-text("Ippudo") a:has-text("導航")').getAttribute('href')).includes('35.0037'));
  // 跳過一餐，吃什麼也跟著拿掉
  await p.click('#plan .day:has-text("12/21")'); await p.click('text=臨時改行程');
  await p.locator('#dayview .st:has-text("稻荷壽司") button:has-text("跳過")').click(); await p.waitForTimeout(200);
  t('跳過的餐不再出現', !(await p.textContent('#food-list')).includes('稻荷壽司老店'));
  await p.locator('#dayview .st:has-text("稻荷壽司") button:has-text("恢復")').click().catch(() => {}); await p.click('text=完成').catch(() => {});
  // 優惠券・門票：新增、存圖、標成已使用
  t('範例有一張優惠券', await p.locator('#coupons article').count() === 1);
  await p.click('text=＋ 填資料新增');
  await p.selectOption('#fm-kind', 'ticket'); await p.fill('#fm-title', 'ARTE MUSEUM 門票'); await p.fill('#fm-code', 'AM-777');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(200);
  const tk = p.locator('#coupons article:has-text("ARTE MUSEUM 門票")');
  t('新增門票', await tk.count() === 1);
  await tk.locator('.att input[type=file]').setInputFiles(__dirname + '/qr.png'); await p.waitForTimeout(800);
  await tk.locator('button:has-text("標成已使用")').click(); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(600);
  t('重新整理後門票、截圖、已使用都在', await p.locator('#coupons article.used:has-text("ARTE MUSEUM 門票") .att-th img').count() === 1);
  t('票券夾也收到', (await p.textContent('#tickets')).includes('券 ARTE MUSEUM 門票'));
  // 直接存圖：一次兩張 → 兩張票券，之後補資料，票券夾分組名稱跟著改
  await p.locator('#cp-quick').setInputFiles([__dirname + '/qr.png', __dirname + '/qr.png']); await p.waitForTimeout(1200);
  const quickCards = p.locator('#coupons article:has-text("先存了圖")');
  t('直接存圖產生兩張待補資料的票券', await quickCards.count() === 2 && await p.locator('#coupons article:has-text("先存了圖") .att-th img').count() === 2);
  await quickCards.first().locator('button:has-text("先存了圖")').click();
  await p.fill('#fm-title', '海雲台膠囊列車'); await p.fill('#fm-until', '2026-12-31'); await p.click('#modal button[type=submit]'); await p.waitForTimeout(300);
  t('補完資料提示消失', await p.locator('#coupons article:has-text("海雲台膠囊列車")').count() === 1 && await p.locator('#coupons article:has-text("海雲台膠囊列車"):has-text("先存了圖")').count() === 0 && await p.locator('#coupons article:has-text("海雲台膠囊列車") .att-th img').count() === 1);
  t('票券夾的名稱也更新', (await p.textContent('#tickets')).includes('券 海雲台膠囊列車'));
  // 同一張卡片多張圖：可以左右切換
  const gcard = p.locator('#coupons article:has-text("海雲台膠囊列車")');
  await gcard.locator('.att input[type=file]').setInputFiles([__dirname + '/qr.png', __dirname + '/qr.png']); await p.waitForTimeout(1200);
  await gcard.locator('.att-th').first().click(); await p.waitForTimeout(400);
  t('看圖時顯示 1 / 3', (await p.textContent('#modal .gal-bar')).includes('1 / 3') && await p.locator('#modal .gal .slide img').count() === 3);
  await p.click('#modal button[aria-label="下一張"]'); await p.waitForTimeout(600);
  t('按下一張變 2 / 3', (await p.textContent('#modal .gal-bar')).includes('2 / 3'));
  await p.locator('#modal .gal').evaluate(g => g.scrollTo({left: g.clientWidth * 2})); await p.waitForTimeout(500);
  t('滑到最後一張變 3 / 3', (await p.textContent('#modal .gal-bar')).includes('3 / 3'));
  await p.click('#modal button:has-text("關閉")');
  // 匯入新行程
  const json = JSON.stringify({ title: '北海道冬天', days: [{ date: '2027-02-10', title: '札幌', stops: [{ t: '10:00', name: '大通公園', lat: 43.06, lng: 141.35, move: { type: 'car', text: '自駕' } }] }] });
  await p.fill('#tp-paste', '```json\n' + json + '\n```'); await p.click('text=檢查'); await p.click('text=另存成新旅程'); await p.waitForTimeout(300);
  t('匯入切換', (await p.textContent('#title')) === '北海道冬天');
  t('旅程清單有兩趟', await p.locator('.trip-row').count() === 2);
  // 修改這趟：提示詞會附上目前的行程（含跳過的點）
  await p.click('#plan .seg button:has-text("修改這趟"), .seg button:has-text("修改這趟")').catch(() => {});
  t('有自己的旅程時預設修改這趟', await p.locator('#tp-ask').isVisible());
  await p.fill('#tp-ask', '想加 ARTE MUSEUM'); await p.waitForTimeout(100);
  const prm = await p.inputValue('#tp-out');
  t('提示詞附上目前行程和要求', prm.includes('大通公園') && prm.includes('想加 ARTE MUSEUM') && prm.includes('"days"') && prm.includes('已經預約'));
  // 編輯這趟：改名、出發日往後移 2 天
  await p.click('.trip-row.on button:has-text("編輯")');
  await p.fill('#fm-title', '北海道冬天（改）'); await p.fill('#fm-start', '2027-02-12');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(300);
  t('改名成功', (await p.textContent('#title')) === '北海道冬天（改）' && (await p.textContent('#toolbox')).includes('北海道冬天（改）'));
  t('日期跟著移動', await p.evaluate(() => TRIP.days[0].date) === '2027-02-12');
  // AI 改好的版本「更新這一趟」：行程換掉，自己加的網路卡保留，不會多一趟
  await p.click('text=＋ 新增 eSIM／SIM 卡／當地門號'); await p.fill('#fm-who', '爸爸'); await p.click('#modal button[type=submit]'); await p.waitForTimeout(200);
  const json2 = JSON.stringify({ title: 'AI 取的新名字', days: [{ date: '2027-02-12', title: '小樽', stops: [{ t: '09:00', name: '小樽運河', lat: 43.2, lng: 141.0 }, { t: '12:00', name: '三角市場', lat: 43.19, lng: 140.99 }] }] });
  await p.fill('#tp-paste', json2); await p.click('text=檢查');
  t('有更新這一趟的選項', await p.locator('button:has-text("更新這一趟")').isVisible());
  await p.click('button:has-text("更新這一趟")'); await p.waitForTimeout(300);
  t('名稱保留、行程換新', (await p.textContent('#title')) === '北海道冬天（改）' && (await p.textContent('#dayview')).includes('小樽運河') && !(await p.textContent('#dayview')).includes('大通公園'));
  t('自己加的網路卡還在', await p.locator('#sims article:has-text("爸爸")').count() === 1);
  t('沒有多一趟', await p.locator('.trip-row').count() === 2);
  await p.reload(); await p.waitForTimeout(500);
  t('重新整理後還是新行程', (await p.textContent('#dayview')).includes('三角市場'));
  t('旅程清單看得出內容', (await p.textContent('.trip-row.on')).includes('網路 1'));
  await p.click('button:has-text("復原 AI 更新前")'); await p.waitForTimeout(300);
  t('復原成更新前', (await p.textContent('#dayview')).includes('大通公園') && !(await p.textContent('#dayview')).includes('小樽運河') && await p.locator('#sims article:has-text("爸爸")').count() === 1);
  // 在範例上也能選「更新哪一趟」；同名另存要再按一次確認
  await p.locator('.trip-row:has-text("京阪") button:has-text("打開")').click(); await p.waitForTimeout(300);
  await p.fill('#tp-paste', json2); await p.click('text=檢查');
  t('範例上也能更新別趟', await p.locator('#tp-target').isVisible() && (await p.textContent('#tp-target')).includes('北海道冬天（改）'));
  await p.click('button:has-text("更新這一趟")'); await p.waitForTimeout(300);
  t('更新後切到那一趟', (await p.textContent('#title')) === '北海道冬天（改）' && (await p.textContent('#dayview')).includes('小樽運河'));
  await p.fill('#tp-paste', JSON.stringify({ title: '北海道冬天（改）', days: [{ date: '2027-03-01', title: 'x', stops: [{ t: '09:00', name: '測試點', lat: 43, lng: 141 }] }] })); await p.click('text=檢查');
  await p.click('text=另存成新旅程'); await p.waitForTimeout(200);
  t('同名另存會先提醒', (await p.textContent('#toolbox')).includes('確定要多一趟') && await p.locator('.trip-row').count() === 2);
  // 清單上直接刪別趟（不是目前這趟），按兩次才刪
  await p.click('text=確定要多一趟'); await p.waitForTimeout(300);
  t('確認後多一趟', await p.locator('.trip-row').count() === 3);
  const other = p.locator('.trip-row:not(.on):has-text("北海道冬天（改）") button:has-text("刪除")');
  await other.click(); t('第一次只是確認', await p.locator('.trip-row').count() === 3 && (await p.textContent('#toolbox')).includes('確定刪除？'));
  await p.click('.trip-row button:has-text("確定刪除？")'); await p.waitForTimeout(300);
  t('刪掉別趟、目前這趟不受影響', await p.locator('.trip-row').count() === 2 && (await p.textContent('#title')) === '北海道冬天（改）');
  t('範例沒有刪除鈕', await p.locator('.trip-row:has-text("京阪") button:has-text("刪除")').count() === 0);
  // 刪除這趟
  await p.click('.trip-row.on button:has-text("編輯")');
  await p.click('#modal button:has-text("刪除")'); await p.click('#modal button:has-text("確定刪除")'); await p.waitForTimeout(300);
  t('刪除後回到範例、清單少一趟', (await p.textContent('#title')).includes('京阪') && await p.locator('.trip-row').count() === 1);
  // 再匯入一趟給後面測試用
  await p.fill('#tp-paste', '```json\n' + json + '\n```'); await p.click('text=檢查'); await p.click('text=另存成新旅程'); await p.waitForTimeout(300);
  await p.locator('.trip-row:has-text("京阪") button:has-text("打開")').click(); await p.waitForTimeout(300);
  t('切回京阪且資料還在', (await p.textContent('#title')).includes('京阪') && await p.locator('#flights .pass').count() === 3);
  // 長行程內容不會被截斷；AI 回答分兩段也能讀；被截斷會說明
  await p.click('.seg button:has-text("我已經有行程")');
  const long = '第1天 景點描述'.repeat(4000);
  await p.fill('#tp-paste-src', long);
  t('長行程內容整份保留', (await p.inputValue('#tp-paste-src')).length === long.length && (await p.inputValue('#tp-out')).length > 0);
  const full = JSON.stringify({ title: '分段測試', days: [{ date: '2027-04-01', title: 'A', stops: [{ t: '09:00', name: '甲地', lat: 35, lng: 139 }] }] });
  const cut = Math.floor(full.length / 2);
  await p.fill('#tp-paste', '```json\n' + full.slice(0, cut) + '```json\n' + full.slice(cut) + '\n```'); await p.click('text=檢查');
  t('兩段接起來讀得到', (await p.textContent('#toolbox')).includes('讀到「分段測試」'));
  await p.fill('#tp-paste', '```json\n' + full.slice(0, cut)); await p.click('text=檢查');
  t('被截斷時提示叫 AI 繼續', (await p.textContent('#toolbox')).includes('被截斷'));
  t('沒有錯誤', errs.length === 0); if (errs.length) console.log(errs);
  console.log(`本機模式測試：${pass} 通過，${fail} 失敗`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
