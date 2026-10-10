/**
 * 記憶：試算表存取。只做存取與欄位對應，不做業務判斷。
 * - 找不到工作表就報錯，絕不自動建立（建立只在人工執行的 DANGER_setupTripNotebook）
 * - 每次開啟都檢查表頭
 * - 只「改那一列」或「新增一列」，不整張清空重寫
 */
var _ss = null;
function ss_() {
  if (_ss) return _ss;
  var id = cfg_('SHEET_ID');
  if (!id) throw ue_('後端還沒設定試算表（請管理者執行 DANGER_setupTripNotebook）');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}
function checkHead_(sh, head) {
  var h = sh.getRange(1, 1, 1, head.length).getValues()[0].map(String);
  if (h.join('|') !== head.join('|')) throw ue_('工作表「' + sh.getName() + '」的欄位不對，請不要直接重新初始化');
}
/** 讀整張表（資料量小：一年幾百列）。表頭和資料一次讀回來，省一趟。回傳 {sh, rows, next}，每列帶 row 號，寫回時只改那一列 */
function readAll_(coll) {
  var name = COLLS[coll];
  if (!name) throw ue_('不認得的資料類型');
  var sh = ss_().getSheetByName(name);
  if (!sh) throw ue_('找不到工作表「' + name + '」，請確認試算表，不要直接重新初始化');
  var n = Math.max(1, sh.getLastRow());
  var vals = sh.getRange(1, 1, n, HEAD.length).getValues();
  if (vals[0].map(String).join('|') !== HEAD.join('|')) throw ue_('工作表「' + name + '」的欄位不對，請不要直接重新初始化');
  vals.shift();
  return {
    sh: sh, next: n + 1, adds: [],
    rows: vals.map(function (r, i) {
      return { row: i + 2, tripId: String(r[0]), key: String(r[1]), data: String(r[2] || ''), rev: Number(r[3]) || 0, seq: Number(r[4]) || 0,
               by: String(r[5] || ''), at: r[6] instanceof Date ? r[6].getTime() : Number(r[6]) || 0, deleted: r[7] === true || String(r[7]).toUpperCase() === 'TRUE' };
    })
  };
}
function writeRow_(sh, row, rec) {
  sh.getRange(row, 1, 1, HEAD.length).setValues([[rec.tripId, rec.key, rec.data, rec.rev, rec.seq, rec.by, rec.at, rec.deleted]]);
}
/** 新增的列先排隊，最後 flushAdds_ 一次寫進去（一筆一筆 appendRow 一筆就要 0.2 秒） */
function queueAdd_(t, rec) {
  rec.row = t.next++; rec.pending = true;
  t.adds.push(rec); t.rows.push(rec);
  return rec;
}
function flushAdds_(t) {
  if (!t.adds.length) return;
  t.sh.getRange(t.adds[0].row, 1, t.adds.length, HEAD.length).setValues(t.adds.map(function (r) { return [r.tripId, r.key, r.data, r.rev, r.seq, r.by, r.at, r.deleted]; }));
  t.adds.forEach(function (r) { delete r.pending; });
  t.adds = [];
}
/** 操作紀錄：獨立試算表、只新增 */
function appendLogs_(entries) {
  if (!entries.length) return;
  var id = cfg_('LOG_SHEET_ID');
  if (!id) return;
  var sh = SpreadsheetApp.openById(id).getSheetByName(LOG_SHEET);
  if (!sh) throw ue_('找不到紀錄表「' + LOG_SHEET + '」，請不要直接重新初始化');
  checkHead_(sh, LOG_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, entries.length, LOG_HEAD.length).setValues(entries);
}
function recentLogs_(tripId, n) {
  var id = cfg_('LOG_SHEET_ID');
  if (!id) return [];
  var sh = SpreadsheetApp.openById(id).getSheetByName(LOG_SHEET);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - 199);
  var vals = sh.getRange(start, 1, last - start + 1, LOG_HEAD.length).getValues();
  return vals.filter(function (r) { return String(r[2]) === tripId && r[6]; }).slice(-n).reverse()
    .map(function (r) { return { at: r[0] instanceof Date ? r[0].getTime() : Number(r[0]), who: String(r[1]), text: String(r[6]) }; });
}
/** 每種資料最後一次變動的流水號 {stop: 123, ...}：沒變動的表 pull 時整張跳過 */
function collSeq_() { try { return JSON.parse(prop_('CSEQ') || '{}') || {}; } catch (e) { return {}; } }
