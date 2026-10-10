/**
 * 身份：全家共用一組密碼（只存 SHA-256(salt+密碼)），登入後發 30 天的簽章 token。
 * token = base64(payload) + "." + HMAC；payload 帶 sessionVer，執行 LOGOUT_EVERYONE 就全部失效。
 * 連錯 5 次鎖 10 分鐘。
 */
function login_(b) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('loginFail') || 0);
  if (fails >= 5) throw ue_('密碼錯太多次了，請 10 分鐘後再試');
  var salt = prop_('PW_SALT'), hash = prop_('PW_HASH');
  if (!salt || !hash) throw ue_('還沒設定家庭密碼（請管理者執行 APPLY_NEW_PASSWORD）');
  var who = String(b.who || '').trim().slice(0, 20);
  if (!who) throw ue_('請選你是誰');
  if (sha256_(salt + String(b.password || '')) !== hash) {
    cache.put('loginFail', String(fails + 1), 600);
    throw ue_('密碼不對');
  }
  cache.remove('loginFail');
  var payload = { w: who, e: Date.now() + CFG.TOKEN_DAYS * 864e5, v: Number(prop_('SESSION_VER') || 1) };
  return { token: signToken_(payload), who: who, days: CFG.TOKEN_DAYS };
}

function verifyToken_(token) {
  if (typeof token !== 'string' || token.length > 600 || token.indexOf('.') < 0) return null;
  var parts = token.split('.');
  if (parts.length !== 2) return null;
  if (hmac_(parts[0]) !== parts[1]) return null;
  var p;
  try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); } catch (e) { return null; }
  if (!p || typeof p.w !== 'string' || !p.w || p.e < Date.now()) return null;
  if (p.v !== Number(prop_('SESSION_VER') || 1)) return null;
  return p.w;
}

function signToken_(payload) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  return body + '.' + hmac_(body);
}
function hmac_(s) {
  var secret = prop_('SECRET');
  if (!secret) throw ue_('後端還沒初始化（請管理者執行 DANGER_setupTripNotebook）');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret));
}
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function randomHex_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
