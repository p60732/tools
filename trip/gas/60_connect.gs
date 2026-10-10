/**
 * 連線：匯率（台灣銀行牌告 CSV）與 Google 地圖短網址展開
 */
function fx_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('fx');
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch('https://rate.bot.com.tw/xrt/flcsv/0/day', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw ue_('現在抓不到匯率，先用手機裡存的');
  var rates = parseBotCsv_(res.getContentText('UTF-8'));
  if (!rates.USD) throw ue_('匯率格式看不懂，先用手機裡存的');
  var out = { date: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'), src: '台灣銀行牌告（現金賣出）', rates: rates };
  cache.put('fx', JSON.stringify(out), 3 * 3600);
  prop_('FX_LAST', JSON.stringify(out));
  return out;
}
/** CSV 每列：幣別,本行買入,現金,即期,...,本行賣出,現金,即期,...；取「本行賣出」後面的現金價（沒有就用即期） */
function parseBotCsv_(text) {
  var out = {};
  String(text).split(/\r?\n/).forEach(function (line) {
    var c = line.split(',').map(function (s) { return s.trim(); });
    var code = c[0];
    if (!/^[A-Z]{3}$/.test(code)) return;
    var i = c.indexOf('本行賣出');
    if (i < 0) return;
    var cash = parseFloat(c[i + 1]), spot = parseFloat(c[i + 2]);
    var v = cash > 0 ? cash : spot > 0 ? spot : 0;
    if (v > 0) out[code] = v;
  });
  return out;
}

function resolveMap_(b) {
  var url = String(b.url || '');
  var host = (url.match(/^https:\/\/([^\/?#]+)/) || [])[1] || '';
  if (!/^(maps\.app\.goo\.gl|goo\.gl)$/.test(host)) throw ue_('只能展開 Google 地圖的短網址');
  for (var hop = 0; hop < 4; hop++) {
    var res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var h = res.getHeaders(), loc = h.Location || h.location;
    if (!loc) break;
    url = loc;
    var nh = (url.match(/^https:\/\/([^\/?#]+)/) || [])[1] || '';
    if (!/(^|\.)google\.[a-z.]+$|^goo\.gl$|^maps\.app\.goo\.gl$/.test(nh)) throw ue_('這個連結沒有導到 Google 地圖');
    if (/google\./.test(nh)) break;
  }
  return { url: url };
}
