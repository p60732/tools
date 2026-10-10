/**
 * 管理者在 Apps Script 編輯器手動執行的函式（網頁 doPost 叫不到這些）。
 * 名字刻意取得很嚇人，避免手滑。
 */

/** 第一次安裝：建立試算表、紀錄表、雲端硬碟資料夾，產生簽章金鑰。已經有資料就拒絕。 */
function DANGER_setupTripNotebook() {
  var existing = cfg_('SHEET_ID');
  if (existing) {
    var sh = SpreadsheetApp.openById(existing).getSheetByName(COLLS.trip);
    if (sh && sh.getLastRow() > 1) throw new Error('已經有資料了，拒絕重新初始化');
  }
  var root = DriveApp.createFolder('旅遊小筆記');
  var attach = root.createFolder('附件');
  var backup = root.createFolder('備份');

  var ss = SpreadsheetApp.create('旅遊小筆記-正式');
  Object.keys(COLLS).forEach(function (k, i) {
    var sh = i === 0 ? ss.getSheets()[0].setName(COLLS[k]) : ss.insertSheet(COLLS[k]);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var log = SpreadsheetApp.create('旅遊小筆記-紀錄');
  var lsh = log.getSheets()[0].setName(LOG_SHEET);
  lsh.getRange(1, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold');
  lsh.setFrozenRows(1);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  DriveApp.getFileById(log.getId()).moveTo(root);

  prop_('SHEET_ID', ss.getId());
  prop_('LOG_SHEET_ID', log.getId());
  prop_('DRIVE_FOLDER_ID', attach.getId());
  prop_('BACKUP_FOLDER_ID', backup.getId());
  if (!prop_('SECRET')) prop_('SECRET', randomHex_(64));
  if (!prop_('SESSION_VER')) prop_('SESSION_VER', 1);
  if (!prop_('SEQ')) prop_('SEQ', 0);
  console.log('完成！請把下面四行貼到 00_config.gs 的 CFG 裡：');
  console.log("SHEET_ID: '" + ss.getId() + "',");
  console.log("LOG_SHEET_ID: '" + log.getId() + "',");
  console.log("DRIVE_FOLDER_ID: '" + attach.getId() + "',");
  console.log("BACKUP_FOLDER_ID: '" + backup.getId() + "',");
  console.log('下一步：到「專案設定 → 指令碼屬性」新增 NEW_PASSWORD（家庭密碼），再執行 APPLY_NEW_PASSWORD。');
}

/** 設定／更換家庭密碼：先在「指令碼屬性」新增 NEW_PASSWORD，執行後只留雜湊值，明碼會被刪掉，所有人要重新登入 */
function APPLY_NEW_PASSWORD() {
  var pw = prop_('NEW_PASSWORD');
  if (!pw) throw new Error('請先到「專案設定 → 指令碼屬性」新增 NEW_PASSWORD');
  if (pw.length < 6) throw new Error('密碼至少 6 個字');
  var salt = randomHex_(32);
  prop_('PW_SALT', salt);
  prop_('PW_HASH', sha256_(salt + pw));
  prop_('NEW_PASSWORD', null);
  LOGOUT_EVERYONE();
  console.log('家庭密碼已更新，NEW_PASSWORD 已刪除；所有人需要重新登入。');
}

/** 讓所有手機登出（手機遺失或密碼外洩時用） */
function LOGOUT_EVERYONE() {
  prop_('SESSION_VER', Number(prop_('SESSION_VER') || 1) + 1);
  console.log('已讓所有人登出');
}

/** 每日備份：正式表與紀錄表各複製一份到「備份」資料夾，30 天前的丟垃圾桶（不硬刪） */
function dailyBackup() {
  var folder = DriveApp.getFolderById(cfg_('BACKUP_FOLDER_ID'));
  var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  [cfg_('SHEET_ID'), cfg_('LOG_SHEET_ID')].forEach(function (id) {
    if (!id) return;
    var src = DriveApp.getFileById(id);
    src.makeCopy(src.getName() + ' ' + stamp, folder);
  });
  var limit = Date.now() - 30 * 864e5, it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getDateCreated().getTime() < limit) f.setTrashed(true); }
}

/** 安裝每日備份排程（午夜到凌晨 1 點）。裝完請到「觸發條件」頁面確認真的有一筆 */
function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(0).inTimezone('Asia/Taipei').create();
  console.log('目前 dailyBackup 排程數：' + ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'dailyBackup'; }).length);
}
