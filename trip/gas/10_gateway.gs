/**
 * 守門＋調度：所有前端請求都從這裡進來
 * 1. action 白名單  2. 參數白名單  3. 驗 token  4. 驗長度  5. 才呼叫邏輯
 * doGet 只回健康檢查，而且故意長得不像正常回應（success:false），前端看到就當連線失敗。
 */
var ROUTES = {
  login:      { auth: false, params: ['password', 'who'] },
  pull:       { auth: true,  params: ['tripId', 'since'] },
  push:       { auth: true,  params: ['ops'], big: true },
  upload:     { auth: true,  params: ['tripId', 'fileId', 'name', 'type', 'b64'], big: true },
  getFile:    { auth: true,  params: ['driveId'] },
  fx:         { auth: true,  params: [] },
  resolveMap: { auth: true,  params: ['url'] }
};
var HANDLERS = {
  login: function (b) { return login_(b); },
  pull: function (b, who) { return pull_(b, who); },
  push: function (b, who) { return push_(b, who); },
  upload: function (b, who) { return upload_(b, who); },
  getFile: function (b) { return getFile_(b); },
  fx: function () { return fx_(); },
  resolveMap: function (b) { return resolveMap_(b); }
};

function doGet() {
  return json_({ success: false, health: true, data: null, error: '這是健康檢查頁' });
}

function doPost(e) {
  var out;
  try {
    var body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return json_(fail_('格式不對')); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json_(fail_('格式不對'));
    var route = Object.prototype.hasOwnProperty.call(ROUTES, body.action) ? ROUTES[body.action] : null;
    if (!route) return json_(fail_('未知的操作'));
    var extra = Object.keys(body).filter(function (k) { return k !== 'action' && k !== 'token' && route.params.indexOf(k) < 0; });
    if (extra.length) return json_(fail_('不接受的參數'));
    var who = null;
    if (route.auth) {
      who = verifyToken_(body.token);
      if (!who) return json_(fail_('登入已過期，請重新輸入家庭密碼', 'auth'));
    }
    if (!route.big) checkLengths_(body, route.params);
    out = { success: true, data: HANDLERS[body.action](body, who), error: null };
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    out = fail_(err && err.userFacing ? err.message : '伺服器出了點問題，請稍後再試');
  }
  return json_(out);
}

function checkLengths_(body, params) {
  params.forEach(function (k) {
    var v = body[k];
    if (v == null) return;
    if (typeof v === 'object') throw ue_('不接受的參數');
    if (String(v).length > CFG.MAX_FIELD) throw ue_('「' + k + '」太長了');
  });
}
function fail_(msg, code) { return { success: false, data: null, error: msg, code: code || null }; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
