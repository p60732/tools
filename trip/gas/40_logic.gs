/**
 * 邏輯：同步規則
 * - 每筆資料有 rev（版本）與 seq（全域流水號）
 * - pull：給我 seq 之後變動的資料
 * - push：每筆修改帶 baseRev；跟目前 rev 不同 = 別人先改了 → 回傳衝突與對方版本，由使用者決定（force=true 才覆蓋）
 * - 整段「讀 → 比對 → 寫」上鎖，避免兩人同時存檔互相蓋掉
 */
var ID_RE = /^[A-Za-z0-9_.:\-]{1,60}$/;

function pull_(b) {
  var since = Number(b.since) || 0;
  var tripId = b.tripId ? String(b.tripId) : '';
  if (tripId && !ID_RE.test(tripId)) throw ue_('旅程代號不對');
  var docs = [];
  Object.keys(COLLS).forEach(function (coll) {
    if (coll !== 'trip' && !tripId) return;
    readAll_(coll).rows.forEach(function (r) {
      if (r.seq <= since) return;
      if (coll !== 'trip' && r.tripId !== tripId) return;
      docs.push(toDoc_(coll, r));
    });
  });
  return { seq: Number(prop_('SEQ') || 0), docs: docs, log: tripId ? recentLogs_(tripId, 15) : [] };
}

function toDoc_(coll, r) {
  var data = null;
  try { data = r.data ? JSON.parse(r.data) : null; } catch (e) { data = null; }
  return { coll: coll, tripId: r.tripId, key: r.key, data: data, rev: r.rev, seq: r.seq, by: r.by, at: r.at, deleted: r.deleted };
}

function validateOp_(op) {
  if (!op || typeof op !== 'object') throw ue_('修改的格式不對');
  if (!Object.prototype.hasOwnProperty.call(COLLS, op.coll)) throw ue_('不認得的資料類型');
  if (typeof op.tripId !== 'string' || !ID_RE.test(op.tripId)) throw ue_('旅程代號不對');
  if (typeof op.key !== 'string' || !ID_RE.test(op.key)) throw ue_('資料代號不對');
  var allowed = ['coll', 'tripId', 'key', 'data', 'baseRev', 'force', 'deleted', 'msg'];
  Object.keys(op).forEach(function (k) { if (allowed.indexOf(k) < 0) throw ue_('不接受的參數'); });
  if (op.data != null && (typeof op.data !== 'object' || Array.isArray(op.data))) throw ue_('資料格式不對');
  var json = JSON.stringify(op.data == null ? null : op.data);
  if (json.length > CFG.MAX_DOC) throw ue_('單筆資料太大了');
  if (op.msg != null && String(op.msg).length > 120) throw ue_('紀錄文字太長');
  if (op.baseRev != null && !(Number(op.baseRev) >= 0)) throw ue_('版本號不對');
  return json;
}

function push_(b, who) {
  var ops = b.ops;
  if (!Array.isArray(ops) || !ops.length) throw ue_('沒有要存的修改');
  if (ops.length > CFG.MAX_OPS) throw ue_('一次送太多修改了');
  var jsons = ops.map(validateOp_);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw ue_('現在有家人正在存檔，請幾秒後再試');
  try {
    var tables = {}, logs = [], results = [], now = Date.now();
    ops.forEach(function (op, i) {
      var t = tables[op.coll] || (tables[op.coll] = readAll_(op.coll));
      var cur = null;
      for (var j = 0; j < t.rows.length; j++) if (t.rows[j].tripId === op.tripId && t.rows[j].key === op.key) { cur = t.rows[j]; break; }
      var base = Number(op.baseRev) || 0;
      if (cur && !op.force && cur.rev !== base) {
        results.push({ i: i, status: 'conflict', server: toDoc_(op.coll, cur) });
        return;
      }
      if (!cur && base > 0 && !op.force) {   // 本來有、現在被別人整筆刪掉（理論上不會發生，保守處理）
        results.push({ i: i, status: 'conflict', server: null });
        return;
      }
      var rec = { tripId: op.tripId, key: op.key, data: jsons[i], rev: (cur ? cur.rev : 0) + 1, seq: nextSeq_(), by: who, at: now, deleted: !!op.deleted };
      if (cur) { writeRow_(t.sh, cur.row, rec); rec.row = cur.row; t.rows[t.rows.indexOf(cur)] = Object.assign({}, cur, rec); }
      else { rec.row = appendRow_(t.sh, rec); t.rows.push(rec); }
      if (op.coll === 'file' && op.deleted && op.data && op.data.driveId) trashFile_(op.data.driveId);
      results.push({ i: i, status: 'ok', rev: rec.rev, seq: rec.seq });
      logs.push([new Date(now), who, op.tripId, op.coll, op.key, op.deleted ? 'delete' : (cur ? 'update' : 'create'), op.msg ? String(op.msg).slice(0, 120) : '']);
    });
    appendLogs_(logs);
    return { results: results, seq: Number(prop_('SEQ') || 0) };
  } finally {
    lock.releaseLock();
  }
}
