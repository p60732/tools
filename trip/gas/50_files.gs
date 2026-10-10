/**
 * 檔案：附件存 Google 雲端硬碟「旅遊小筆記/附件/<旅程代號>/」，試算表只存檔案 ID。
 * 只接受圖片與 PDF；讀檔時檢查檔案確實在附件資料夾底下，不能拿來讀雲端硬碟裡別的檔案。
 */
var FILE_TYPES = /^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf)$/;

function upload_(b, who) {
  if (typeof b.tripId !== 'string' || !ID_RE.test(b.tripId)) throw ue_('旅程代號不對');
  if (typeof b.fileId !== 'string' || !ID_RE.test(b.fileId)) throw ue_('檔案代號不對');
  var type = String(b.type || '');
  if (!FILE_TYPES.test(type)) throw ue_('只能放圖片或 PDF');
  if (typeof b.b64 !== 'string' || b.b64.length > CFG.MAX_FILE_BYTES * 1.4) throw ue_('檔案太大了（上限 15MB）');
  var name = String(b.name || '附件').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
  var bytes = Utilities.base64Decode(b.b64);
  if (bytes.length > CFG.MAX_FILE_BYTES) throw ue_('檔案太大了（上限 15MB）');
  var root = DriveApp.getFolderById(cfg_('DRIVE_FOLDER_ID'));
  var it = root.getFoldersByName(b.tripId);
  var folder = it.hasNext() ? it.next() : root.createFolder(b.tripId);
  var f = folder.createFile(Utilities.newBlob(bytes, type, b.fileId + '_' + name));
  f.setDescription('旅遊小筆記附件・' + who);
  return { driveId: f.getId() };
}

function inAttachFolder_(file) {
  var rootId = cfg_('DRIVE_FOLDER_ID');
  var ps = file.getParents();
  while (ps.hasNext()) {
    var p = ps.next();
    if (p.getId() === rootId) return true;
    var pp = p.getParents();
    while (pp.hasNext()) if (pp.next().getId() === rootId) return true;
  }
  return false;
}

function getFile_(b) {
  if (typeof b.driveId !== 'string' || !/^[A-Za-z0-9_\-]{10,100}$/.test(b.driveId)) throw ue_('檔案代號不對');
  var f;
  try { f = DriveApp.getFileById(b.driveId); } catch (e) { throw ue_('找不到這個附件'); }
  if (!inAttachFolder_(f) || f.isTrashed()) throw ue_('找不到這個附件');
  var blob = f.getBlob();
  return { b64: Utilities.base64Encode(blob.getBytes()), type: blob.getContentType(), name: f.getName() };
}

function trashFile_(driveId) {
  try { var f = DriveApp.getFileById(driveId); if (inAttachFolder_(f)) f.setTrashed(true); } catch (e) { /* 已經不在就算了 */ }
}
