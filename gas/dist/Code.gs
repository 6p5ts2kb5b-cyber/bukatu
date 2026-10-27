/**
 * 部活アプリ「桜・浅羽野・住吉」 GAS版（サーバー側）
 *
 * このファイルは、スプレッドシートの読み書きと、ログインした人の確認をします。
 * 画面は Index.html（と Vendor.html・App1.html… を読み込み）で作っています。
 *
 * ・最初に1回だけ setup を実行してください（シートの見出し・最初のデータ・設定を自動で作ります）。
 * ・設定（スプレッドシートのIDなど）は「スクリプト プロパティ」に入ります。コードには書きません。
 */

var APP_VERSION = '段階1（2026-10-27）';

// ───── データの置き場所（シート）の決まり ─────
//  json: true   … 中身の多いもの。1つのマス（data）にまとめて入れ、主な項目は見やすさのため別の列にも出す
//  cols         … 列（[名前, 種類]）。種類 s=文字 n=数 b=はい/いいえ
//  ss           … main＝メインのスプレッドシート、ops＝大会運営のスプレッドシート
var SCHEMA = {
  activities: { sheet: '予定', ss: 'main', json: true, cols: [['date', 's']] },
  notices: { sheet: '送付書', ss: 'main', json: true, cols: [['date', 's'], ['subject', 's'], ['to', 's']] },
  lineups: { sheet: 'メンバー表', ss: 'main', json: true, cols: [['date', 's'], ['title', 's'], ['opponent', 's']] },
  players: { sheet: '選手', ss: 'main', cols: [['name', 's'], ['kana', 's'], ['teamId', 's'], ['grade', 'n'], ['number', 's'], ['active', 'b']] },
  teams: { sheet: '学校', ss: 'main', cols: [['name', 's'], ['shortName', 's'], ['order', 'n'], ['active', 'b']] },
  staff: {
    sheet: 'スタッフ', ss: 'main', idName: 'email',
    cols: [['name', 's'], ['canCoach', 'b'], ['canUmpire', 'b'], ['canPlateUmpire', 'b'], ['canBaseUmpire', 'b'], ['phone', 's'], ['note', 's'], ['active', 'b']]
  },
  directory: { sheet: '名簿', ss: 'main', cols: [['kind', 's'], ['name', 's'], ['number', 's'], ['extra', 's']] },
  packingItems: { sheet: '持ち物', ss: 'main', cols: [['name', 's'], ['order', 'n'], ['active', 'b']] },
  opsTournaments: { sheet: '大会運営', ss: 'ops', json: true, cols: [['name', 's'], ['rule', 's'], ['date', 's']] },
  opsStaff: { sheet: '大会運営名簿', ss: 'ops', idName: 'email', cols: [['name', 's'], ['active', 'b']] }
};

var INITIAL_TEAMS = [
  { id: 'sakura', name: '桜中学校', shortName: '桜中', order: 1, active: true },
  { id: 'asabano', name: '浅羽野中学校', shortName: '浅羽野中', order: 2, active: true },
  { id: 'sumiyoshi', name: '住吉中学校', shortName: '住吉中', order: 3, active: true }
];
var INITIAL_ITEMS = ['軽食', 'お弁当', '水筒', '着替え', '筆記用具', 'メモ帳', '野球note', '半袖', '短パン', 'ユニフォーム', 'グローブ', 'スパイク', '帽子', '防寒着', '雨具'];
var INITIAL_VENUES = [
  { id: 'preset-asabano', kind: 'venue', name: '坂戸市立浅羽野中学校', number: '坂戸市浅羽753-1', extra: '東武東上線・越生線 坂戸駅 徒歩約13分' },
  { id: 'preset-sakura', kind: 'venue', name: '坂戸市立桜中学校', number: '坂戸市泉町3-25-8', extra: '東武東上線 北坂戸駅 徒歩約13分' },
  { id: 'preset-sumiyoshi', kind: 'venue', name: '坂戸市立住吉中学校', number: '坂戸市塚越114-1', extra: '東武東上線 若葉駅からバス「塚越」バス停下車 徒歩10分' }
];

// ═════════ 最初に1回だけ実行する ═════════
function setup() {
  var props = PropertiesService.getScriptProperties();
  var owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var setOwner = (props.getProperty('OWNER_EMAIL') || '').toLowerCase();
  if (setOwner && owner !== setOwner) throw new Error('setup は持ち主（' + setOwner + '）だけが実行できます');

  // メインのスプレッドシート：このスクリプトを開いたスプレッドシート（なければ新しく作る）
  var mainId = props.getProperty('SHEET_ID');
  if (!mainId) {
    var active = null;
    try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
    if (!active) active = SpreadsheetApp.create('部活アプリ（データ）');
    mainId = active.getId();
    props.setProperty('SHEET_ID', mainId);
  }
  // 大会運営のスプレッドシート：大会運営だけの人に共有するので、別にする
  var opsId = props.getProperty('OPS_SHEET_ID');
  if (!opsId) {
    opsId = SpreadsheetApp.create('部活アプリ（大会運営）').getId();
    props.setProperty('OPS_SHEET_ID', opsId);
  }
  if (!props.getProperty('OWNER_EMAIL') && owner) props.setProperty('OWNER_EMAIL', owner);
  owner = props.getProperty('OWNER_EMAIL') || owner;

  // シートと見出しを作る
  Object.keys(SCHEMA).forEach(function (col) { sheetOf_(col); });
  // 最初から使う「シート1」が空なら消す
  [mainId, opsId].forEach(function (id) {
    var ss = SpreadsheetApp.openById(id);
    var first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
    if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
  });

  var now = Date.now();
  // 学校3校・持ち物15品目・会場3校（まだ何も無いときだけ）
  if (readCol_('teams').length === 0) INITIAL_TEAMS.forEach(function (t) { putDoc_('teams', t.id, t, owner, now); });
  if (readCol_('packingItems').length === 0) {
    INITIAL_ITEMS.forEach(function (name, i) {
      var id = 'item' + ('0' + (i + 1)).slice(-2);
      putDoc_('packingItems', id, { name: name, order: i + 1, active: true }, owner, now);
    });
  }
  if (!readCol_('directory').some(function (d) { return d.kind === 'venue'; })) {
    INITIAL_VENUES.forEach(function (v) { putDoc_('directory', v.id, v, owner, now); });
  }
  // 持ち主をスタッフ名簿の最初の人に
  if (owner && !findRow_('staff', owner)) {
    putDoc_('staff', owner, {
      name: Session.getEffectiveUser().getEmail(), canCoach: true, canUmpire: true, canPlateUmpire: true,
      canBaseUmpire: true, phone: '', note: '持ち主', active: true
    }, owner, now);
  }
  clearCache_();
  Logger.log('準備ができました。メイン：' + mainId + '　大会運営：' + opsId + '　持ち主：' + owner);
  return '準備ができました';
}

// ═════════ 画面を開いたとき ═════════
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.params = JSON.stringify((e && e.parameter) || {}).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('桜・浅羽野・住吉')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// HTMLの中に別のファイル（App1.html など）を差し込む。
// App1・App2 は画面のプログラムの文字だけなので、HTMLとして調べずにそのまま入れる
function include(name) {
  return HtmlService.createTemplateFromFile(name).getRawContent();
}

// ═════════ 画面から呼ぶもの ═════════

// 開いたときに1回：だれか確かめて、使うデータをまとめて返す
function boot() {
  var email = myEmail_();
  var url = ScriptApp.getService().getUrl();
  if (!email) return { state: 'nologin', url: url };
  var role = roleOf_(email, true);
  if (role.state === 'staff') {
    var data = {};
    Object.keys(SCHEMA).forEach(function (col) { data[col] = readColCached_(col); });
    return { state: 'staff', me: role.me, data: data, url: url, owner: ownerEmail_(), version: APP_VERSION, now: Date.now() };
  }
  if (role.state === 'ops') {
    return { state: 'ops', name: role.name, email: email, data: { opsTournaments: readColCached_('opsTournaments') }, url: url, version: APP_VERSION, now: Date.now() };
  }
  return { state: 'denied', email: email, message: role.message || '', url: url };
}

// 保存：[{col, id, doc}]（doc が null なら消す）。この行だけを書きます
function write(ops) {
  var email = myEmail_();
  var role = roleOf_(email, false);
  if (role.state !== 'staff' && role.state !== 'ops') throw new Error('このアカウントでは保存できません');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var warnings = [];
  try {
    var now = Date.now();
    (ops || []).forEach(function (op) {
      var def = SCHEMA[op.col];
      if (!def) throw new Error('知らない種類のデータです：' + op.col);
      if (role.state === 'ops' && op.col !== 'opsTournaments') throw new Error('大会運営だけの人は、このデータを保存できません');
      var id = String(op.id || '');
      if (!id) throw new Error('IDがありません');
      if (op.doc) putDoc_(op.col, id, op.doc, email, now);
      else deleteDoc_(op.col, id);
      // スタッフ・大会運営の名簿を変えたら、スプレッドシートの共有も合わせる
      if (op.col === 'staff' || op.col === 'opsStaff') {
        var w = syncShare_(op.col, id, op.doc);
        if (w) warnings.push(w);
      }
    });
    clearCache_();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, warnings: warnings, now: Date.now() };
}

// ほかの人の変更を読み直す（画面を開いたまま戻ってきたとき）
function reload() {
  return boot();
}

// ═════════ だれか確かめる ═════════
function myEmail_() {
  return (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}
function ownerEmail_() {
  return (PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '').toLowerCase();
}

// staff＝スタッフ名簿の人／ops＝大会運営名簿の人／denied＝どちらでもない
function roleOf_(email, fresh) {
  if (!email) return { state: 'denied' };
  var uc = CacheService.getUserCache();
  if (!fresh) {
    var hit = uc.get('role');
    if (hit) { var r = JSON.parse(hit); if (r.email === email) return r; }
  }
  var res = { state: 'denied', email: email };
  var main = null;
  try { main = ssOf_('main'); } catch (e) { main = null; }
  if (main) {
    var row = findRow_('staff', email);
    if (row && row.doc.active !== false) {
      res = { state: 'staff', email: email, me: staffOut_(email, row.doc) };
    } else if (!row && email === ownerEmail_()) {
      // 持ち主がまだ名簿に無ければ、自動で載せる
      var me = { name: email, canCoach: true, canUmpire: true, canPlateUmpire: true, canBaseUmpire: true, phone: '', note: '持ち主', active: true };
      putDoc_('staff', email, me, email, Date.now());
      clearCache_();
      res = { state: 'staff', email: email, me: staffOut_(email, me) };
    }
  }
  if (res.state === 'denied') {
    try {
      var o = findRow_('opsStaff', email);
      if (o && o.doc.active !== false) res = { state: 'ops', email: email, name: String(o.doc.name || email) };
    } catch (e2) { /* 大会運営のシートも開けない＝どちらにも入っていない */ }
  }
  uc.put('role', JSON.stringify(res), 300);
  return res;
}
function staffOut_(email, d) {
  return {
    email: email, name: String(d.name || email), canCoach: d.canCoach === true, canUmpire: d.canUmpire === true,
    canPlateUmpire: d.canPlateUmpire === true, canBaseUmpire: d.canBaseUmpire === true,
    phone: String(d.phone || ''), note: String(d.note || ''), active: d.active !== false
  };
}

// ═════════ スプレッドシートの共有を名簿に合わせる ═════════
function syncShare_(col, email, doc) {
  email = String(email).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '';
  if (email === ownerEmail_()) return '';
  var on = !!(doc && doc.active !== false);
  var props = PropertiesService.getScriptProperties();
  // スタッフ：メインと大会運営の両方。大会運営名簿：大会運営だけ
  var targets = col === 'staff' ? ['SHEET_ID', 'OPS_SHEET_ID'] : ['OPS_SHEET_ID'];
  // 大会運営名簿から外しても、スタッフなら大会運営のシートは外さない（逆も同じ）
  var stillStaff = col === 'opsStaff' && !on && (function () { var r = findRow_('staff', email); return r && r.doc.active !== false; })();
  var stillOps = col === 'staff' && !on && (function () { try { var r = findRow_('opsStaff', email); return r && r.doc.active !== false; } catch (e) { return false; } })();
  try {
    targets.forEach(function (key) {
      var id = props.getProperty(key);
      if (!id) return;
      var file = SpreadsheetApp.openById(id);
      if (on) {
        file.addEditor(email);
      } else {
        if (key === 'OPS_SHEET_ID' && (stillStaff || stillOps)) return;
        try { file.removeEditor(email); } catch (e) { /* もともと共有していない */ }
      }
    });
  } catch (e) {
    return on
      ? '名簿には入りましたが、スプレッドシートの共有ができませんでした（' + email + ' がGoogleアカウントか確かめてください）。'
      : '名簿からは外しましたが、スプレッドシートの共有を外せませんでした。スプレッドシートの「共有」から外してください。';
  }
  return '';
}

// ═════════ シートの読み書き ═════════
function ssOf_(which) {
  var key = which === 'ops' ? 'OPS_SHEET_ID' : 'SHEET_ID';
  var id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) throw new Error('まだ setup を実行していません（' + key + ' がありません）');
  return SpreadsheetApp.openById(id);
}

function headersOf_(col) {
  var def = SCHEMA[col];
  var h = [def.idName || 'id'];
  def.cols.forEach(function (c) { h.push(c[0]); });
  if (def.json) h.push('data');
  h.push('updatedAt', 'updatedBy');
  return h;
}

function sheetOf_(col) {
  var def = SCHEMA[col];
  var ss = ssOf_(def.ss);
  var sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    var h = headersOf_(col);
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#123f31').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // 文字の列は「書式なしテキスト」に（090-… や 背番号 01 が数に変わらないように）
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    def.cols.forEach(function (c, i) {
      if (c[1] === 's') sh.getRange(2, i + 2, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    if (def.json) {
      var dc = def.cols.length + 2;
      sh.getRange(2, dc, sh.getMaxRows() - 1, 1).setNumberFormat('@');
      sh.setColumnWidth(dc, 260);
    }
  }
  return sh;
}

function toRow_(col, id, doc, by, now) {
  var def = SCHEMA[col];
  var row = [String(id)];
  def.cols.forEach(function (c) {
    var v = doc[c[0]];
    if (c[1] === 'b') row.push(v === true);
    else if (c[1] === 'n') row.push(typeof v === 'number' ? v : (v === undefined || v === null || v === '' ? '' : Number(v)));
    else row.push(v === undefined || v === null ? '' : String(v));
  });
  if (def.json) {
    var copy = {};
    Object.keys(doc).forEach(function (k) { if (k !== 'id') copy[k] = doc[k]; });
    var json = JSON.stringify(copy);
    // 1つのマスに入るのは5万文字まで
    if (json.length > 49000) throw new Error('データが大きすぎて保存できません（' + SCHEMA[col].sheet + '）');
    row.push(json);
  }
  var up = doc.updatedAt && doc.updatedAt.__ts ? doc.updatedAt.__ts : now;
  row.push(new Date(up), by || '');
  return row;
}

function fromRow_(col, row) {
  var def = SCHEMA[col];
  var id = String(row[0]);
  var doc = null;
  if (def.json) {
    try { doc = JSON.parse(row[def.cols.length + 1] || '{}'); } catch (e) { doc = null; }
  }
  if (!doc) {
    doc = {};
    def.cols.forEach(function (c, i) {
      var v = row[i + 1];
      if (c[1] === 'b') doc[c[0]] = v === true || v === 'TRUE' || v === 'true';
      else if (c[1] === 'n') { if (v !== '' && v !== null) doc[c[0]] = Number(v); }
      else doc[c[0]] = v === null || v === undefined ? '' : (v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v));
    });
  } else {
    // シートで直接直した主な列は、そちらを使う
    def.cols.forEach(function (c, i) {
      var v = row[i + 1];
      if (c[1] === 's' && typeof v === 'string' && v !== '' && doc[c[0]] !== v && doc[c[0]] !== undefined) doc[c[0]] = v;
    });
  }
  var up = row[row.length - 2];
  if (up instanceof Date) doc.updatedAt = { __ts: up.getTime() };
  doc[def.idName || 'id'] = id;
  if (def.idName) doc.id = id;
  return doc;
}

function readCol_(col) {
  var sh = sheetOf_(col);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = headersOf_(col).length;
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  var out = [];
  values.forEach(function (r) { if (r[0] !== '' && r[0] !== null) out.push(fromRow_(col, r)); });
  return out;
}

function findRow_(col, id) {
  var sh = sheetOf_(col);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).matchCase(true).findNext();
  if (!hit) return null;
  var r = hit.getRow();
  var row = sh.getRange(r, 1, 1, headersOf_(col).length).getValues()[0];
  return { sheet: sh, row: r, doc: fromRow_(col, row) };
}

function putDoc_(col, id, doc, by, now) {
  var row = toRow_(col, id, doc, by, now);
  var hit = findRow_(col, id);
  var sh = hit ? hit.sheet : sheetOf_(col);
  var r = hit ? hit.row : sh.getLastRow() + 1;
  var range = sh.getRange(r, 1, 1, row.length);
  // 文字は文字のまま（090-… や 01 が数に変わらないように）
  range.setNumberFormats([formatsOf_(col)]);
  range.setValues([row]);
}
function formatsOf_(col) {
  var def = SCHEMA[col];
  var f = ['@'];
  def.cols.forEach(function (c) { f.push(c[1] === 's' ? '@' : c[1] === 'n' ? '0.###' : 'General'); });
  if (def.json) f.push('@');
  f.push('yyyy/MM/dd HH:mm:ss', '@');
  return f;
}

function deleteDoc_(col, id) {
  var hit = findRow_(col, id);
  if (hit) hit.sheet.deleteRow(hit.row);
}

// ═════════ 速さのための一時置き場（CacheService） ═════════
// 一覧を少しの間（5分）覚えておき、2回目以降を速くします。保存したら消します。
function readColCached_(col) {
  var c = CacheService.getScriptCache();
  var gen = c.get('gen') || '0';
  var key = 'col:' + col + ':' + gen;
  var meta = c.get(key);
  if (meta) {
    var n = Number(meta);
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + ':' + i);
    var parts = c.getAll(keys);
    if (keys.every(function (k) { return parts[k] !== undefined && parts[k] !== null; })) {
      try { return JSON.parse(keys.map(function (k) { return parts[k]; }).join('')); } catch (e) { /* 読み直す */ }
    }
  }
  var list = readCol_(col);
  try {
    var s = JSON.stringify(list);
    var size = 90000;
    var chunks = {};
    var count = Math.ceil(s.length / size) || 1;
    for (var j = 0; j < count; j++) chunks[key + ':' + j] = s.slice(j * size, (j + 1) * size);
    if (count <= 50) {
      c.putAll(chunks, 300);
      c.put(key, String(count), 300);
    }
  } catch (e2) { /* 覚えられなくても動く */ }
  return list;
}
function clearCache_() {
  var c = CacheService.getScriptCache();
  c.put('gen', String(Date.now()) + '-' + Math.floor(Math.random() * 1e9), 21600);
}

// ═════════ 確かめ用（エディタで実行すると、いまの設定を表示） ═════════
function checkSettings() {
  var p = PropertiesService.getScriptProperties().getProperties();
  Logger.log('SHEET_ID: ' + (p.SHEET_ID || '（まだ）'));
  Logger.log('OPS_SHEET_ID: ' + (p.OPS_SHEET_ID || '（まだ）'));
  Logger.log('OWNER_EMAIL: ' + (p.OWNER_EMAIL || '（まだ）'));
  Logger.log('アプリのURL: ' + (ScriptApp.getService().getUrl() || '（まだデプロイしていません）'));
}
