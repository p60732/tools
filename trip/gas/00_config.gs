/**
 * 旅遊小筆記 後端設定（唯一來源）
 * - 執行 DANGER_setupTripNotebook 之後，把「執行紀錄」印出來的 ID 貼到下面（也會自動存進 Script Properties）。
 * - 試算表 ID 寫死在這裡，開啟時還會檢查表頭，避免開到別的檔案。
 * - 這裡不放密碼；家庭密碼只存雜湊值在 Script Properties。
 */
var CFG = {
  SHEET_ID: '',          // 旅遊小筆記-正式
  LOG_SHEET_ID: '',      // 旅遊小筆記-紀錄
  DRIVE_FOLDER_ID: '',   // 旅遊小筆記/附件
  BACKUP_FOLDER_ID: '',  // 旅遊小筆記/備份
  TOKEN_DAYS: 30,        // 登入後幾天內不用再輸入密碼
  MAX_FIELD: 500,        // 一般欄位長度上限
  MAX_DOC: 45000,        // 單筆資料 JSON 長度上限（試算表一格上限 50,000 字）
  MAX_OPS: 200,          // 一次最多送幾筆修改
  MAX_FILE_BYTES: 15 * 1024 * 1024
};

/** 每種資料一張工作表（資料地圖 docs/資料地圖.md） */
var COLLS = { trip: '旅程', stop: '景點', flight: '航班', transfer: '接送', hotel: '住宿', todo: '清單', file: '附件', sim: '通訊', bag: '行李', coupon: '票券', food: '美食' };
var HEAD = ['tripId', 'key', 'data', 'rev', 'seq', 'updatedBy', 'updatedAt', 'deleted'];
var LOG_SHEET = '紀錄';
var LOG_HEAD = ['time', 'who', 'tripId', 'coll', 'key', 'action', 'summary'];

function cfg_(k) {
  return CFG[k] || PropertiesService.getScriptProperties().getProperty(k) || '';
}
/** 指令碼屬性：一次請求只整包讀一次（每讀一次約 30ms）；寫入直接寫並更新暫存。上鎖後要先 propsFresh_() 拿最新值 */
var _props = null;
function propsFresh_() { _props = PropertiesService.getScriptProperties().getProperties(); return _props; }
function prop_(k, v) {
  if (v === undefined) { var all = _props || propsFresh_(); return Object.prototype.hasOwnProperty.call(all, k) ? all[k] : null; }
  var p = PropertiesService.getScriptProperties();
  if (_props) { if (v === null) delete _props[k]; else _props[k] = String(v); }
  if (v === null) p.deleteProperty(k); else p.setProperty(k, String(v));
}
function propsSet_(obj) {   // 一次寫多個屬性
  PropertiesService.getScriptProperties().setProperties(obj);
  if (_props) Object.keys(obj).forEach(function (k) { _props[k] = String(obj[k]); });
}
/** 給使用者看的錯誤（訊息會原樣顯示，不含任何 ID） */
function ue_(msg) { var e = new Error(msg); e.userFacing = true; return e; }
