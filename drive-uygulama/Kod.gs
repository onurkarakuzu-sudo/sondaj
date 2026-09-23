// ============================================================
// SONDAJ TAKİP — Google Drive tabanlı uygulama (sürüm 3)
// Uygulama bu betikten açılır; bütün veriler Drive'daki "Sondaj Takip" klasöründe durur.
// Tek gerçek kaynak Drive'daki veri dosyasıdır; cihazlar yalnızca ekrandaki kopyayı tutar.
// ============================================================

var SAHIP = 'onurkarakuzu@gmail.com';
var KLASOR_ADI = 'Sondaj Takip', VERI_ADI = 'sondaj_veri_v3.json', YEDEK_KLASOR = 'Yedekler', CIKTI_KLASOR = 'Çıktılar';
var AKTAR_ANAHTARI = '__AKTAR__'; // yalnızca ilk veri aktarımı için

function P() { return PropertiesService.getScriptProperties(); }
function sha(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function sahipMi() {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (x) {}
  return String(e).toLowerCase() === SAHIP;
}
function sahipKontrol() { if (!sahipMi()) throw new Error('Bu uygulamaya yalnızca ' + SAHIP + ' erişebilir.'); }

// --- Arayüz ---
function doGet() {
  if (!sahipMi()) {
    return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:40px;text-align:center"><h3>Erişim yok</h3><p>Bu uygulamaya yalnızca sahibinin Google hesabıyla girilebilir.</p></div>').setTitle('Sondaj Takip');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Sondaj Takip')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

// --- Drive dosyaları ---
function klasor() {
  var id = P().getProperty('folderId');
  if (id) { try { var f0 = DriveApp.getFolderById(id); if (!f0.isTrashed()) return f0; } catch (e) {} }
  var it = DriveApp.getFoldersByName(KLASOR_ADI);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(KLASOR_ADI);
  P().setProperty('folderId', f.getId());
  return f;
}
function altKlasor(ad) { var fo = klasor(), it = fo.getFoldersByName(ad); return it.hasNext() ? it.next() : fo.createFolder(ad); }
function veriDosyasi() {
  var id = P().getProperty('fileId3');
  if (id) { try { var f0 = DriveApp.getFileById(id); if (!f0.isTrashed()) return f0; } catch (e) {} }
  var fo = klasor(), it = fo.getFilesByName(VERI_ADI);
  var f = it.hasNext() ? it.next() : fo.createFile(VERI_ADI, JSON.stringify({ ver: 0, kv: {} }), 'application/json');
  P().setProperty('fileId3', f.getId());
  return f;
}
function oku() { var d = JSON.parse(veriDosyasi().getBlob().getDataAsString('UTF-8')); if (!d || !d.kv) d = { ver: 0, kv: {} }; return d; }
function yaz(d) { veriDosyasi().setContent(JSON.stringify(d)); P().setProperty('ver3', String(d.ver)); }
function farklar(d, since) { var c = {}; for (var k in d.kv) { var e = d.kv[k]; if (e.n > since) c[k] = e.v; } return c; }

// --- Uygulamanın çağırdığı fonksiyonlar ---
function yukle() {
  sahipKontrol();
  var d = oku(), kv = {};
  for (var k in d.kv) if (d.kv[k].v !== null) kv[k] = d.kv[k].v;
  return { ver: d.ver, kv: kv, sifreVar: !!P().getProperty('pinHash') };
}
function degisiklikler(since) {
  sahipKontrol();
  var ver = Number(P().getProperty('ver3') || 0);
  if (since >= ver && ver > 0) return { ver: ver, ch: {} };
  var d = oku();
  return { ver: d.ver, ch: farklar(d, since) };
}
// ch: {anahtar: değer | null(sil)} — sunucu saatine göre en son yazan kazanır
function kaydet(ch, since, topluSilmeOnayi) {
  sahipKontrol();
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var d = oku(), sil = 0;
    for (var k0 in ch) if (ch[k0] === null && d.kv[k0] && d.kv[k0].v !== null) sil++;
    if (sil > 50 && !topluSilmeOnayi) return { ok: false, err: 'toplu', sayi: sil };
    var nv = d.ver + 1, t = Date.now(), n = 0;
    for (var k in ch) {
      var v = ch[k] === null ? null : String(ch[k]), cur = d.kv[k];
      if (cur && cur.v === v) continue;
      d.kv[k] = { v: v, t: t, n: nv }; n++;
    }
    if (n) { d.ver = nv; yaz(d); }
    gunlukYedek(d);
    return { ok: true, ver: d.ver, ch: farklar(d, since), yazilan: n };
  } finally { lock.releaseLock(); }
}

// --- Şifre (uygulama kilidi) ---
function sifreKontrol(pw) {
  sahipKontrol();
  var h = P().getProperty('pinHash');
  if (pw === 'SONKA1500') { P().deleteProperty('pinHash'); return { ok: true, sifirlandi: true }; }
  if (!h) { if (String(pw || '').length < 3) return { ok: false, err: 'Şifre en az 3 karakter olmalı' }; P().setProperty('pinHash', sha('pin|' + pw)); return { ok: true, yeni: true }; }
  return { ok: sha('pin|' + pw) === h };
}
function sifreDegistir(eski, yeni) {
  sahipKontrol();
  var h = P().getProperty('pinHash');
  if (h && sha('pin|' + eski) !== h && eski !== 'SONKA1500') return { ok: false, err: 'Mevcut şifre yanlış' };
  if (String(yeni || '').length < 3) return { ok: false, err: 'Şifre en az 3 karakter olmalı' };
  P().setProperty('pinHash', sha('pin|' + yeni));
  return { ok: true };
}

// --- Yedekler ve çıktılar ---
function durumaCevir(d) {
  var st = { version: 4, jobs: [], checks: {}, tahsilat: {}, rehber: {}, trash: [] };
  for (var k in d.kv) {
    var e = d.kv[k]; if (e.v === null) continue;
    var p = k.charAt(0), key = k.slice(2);
    if (p === 'j') st.jobs.push(JSON.parse(e.v));
    else if (p === 'c') st.checks[key] = true;
    else if (p === 't') st.tahsilat[key] = JSON.parse(e.v);
    else if (p === 'r') st.rehber[key] = JSON.parse(e.v);
    else if (p === 'x') st.trash.push(JSON.parse(e.v));
  }
  return st;
}
function gunlukYedek(d) {
  var bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');
  if (P().getProperty('lastBackup3') === bugun || !d.ver) return;
  var st = durumaCevir(d); st.backup = bugun;
  altKlasor(YEDEK_KLASOR).createFile('yedek_' + bugun + '.json', JSON.stringify(st), 'application/json');
  P().setProperty('lastBackup3', bugun);
}
function yedekAlSimdi() {
  sahipKontrol();
  var zaman = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd_HH-mm');
  var f = altKlasor(YEDEK_KLASOR).createFile('elle_yedek_' + zaman + '.json', JSON.stringify(durumaCevir(oku())), 'application/json');
  return { ad: f.getName(), url: f.getUrl() };
}
function yedekListe() {
  sahipKontrol();
  var it = altKlasor(YEDEK_KLASOR).getFiles(), ad = [];
  while (it.hasNext()) { var n = it.next().getName(); if (/^(elle_)?yedek_[\d_-]+\.json$/.test(n)) ad.push(n); }
  return ad.sort(function (a, b) { return a.replace('elle_', '') < b.replace('elle_', '') ? 1 : -1; });
}
function yedekGetir(ad) {
  sahipKontrol();
  if (!/^(elle_)?yedek_[\d_-]+\.json$/.test(ad)) throw new Error('Geçersiz yedek adı');
  var it = altKlasor(YEDEK_KLASOR).getFilesByName(ad);
  if (!it.hasNext()) throw new Error('Yedek bulunamadı');
  return JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
}
function csvKaydet(metin, ad) {
  sahipKontrol();
  var f = altKlasor(CIKTI_KLASOR).createFile(Utilities.newBlob('\uFEFF' + metin, 'text/csv', ad));
  return { ad: f.getName(), url: f.getUrl() };
}
function kmlKaydet(metin, ad) {
  sahipKontrol();
  var f = altKlasor('KML').createFile(Utilities.newBlob(metin, 'application/vnd.google-earth.kml+xml', ad));
  return { ad: f.getName(), url: f.getUrl() };
}

// --- TKGM parsel sorgusu (il her zaman Afyonkarahisar) ---
var TK_BASES = ['https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api', 'https://cbsservis.tkgm.gov.tr/megsiswebapi.v3/api'];
function tkGet(path) {
  var last = '';
  for (var i = 0; i < TK_BASES.length; i++) {
    try {
      var r = UrlFetchApp.fetch(TK_BASES[i] + path, { muteHttpExceptions: true, headers: { 'Accept': 'application/json', 'Referer': 'https://parselsorgu.tkgm.gov.tr/' } });
      if (r.getResponseCode() === 200) return JSON.parse(r.getContentText());
      last = 'HTTP ' + r.getResponseCode();
    } catch (e) { last = String(e); }
  }
  throw new Error('TKGM yanıt vermedi (' + last + ')');
}
function norm(s) {
  var m = { 'ı': 'I', 'i': 'I', 'İ': 'I', 'ş': 'S', 'Ş': 'S', 'ğ': 'G', 'Ğ': 'G', 'ü': 'U', 'Ü': 'U', 'ö': 'O', 'Ö': 'O', 'ç': 'C', 'Ç': 'C' };
  return String(s || '').replace(/[ıiİşŞğĞüÜöÖçÇ]/g, function (c) { return m[c]; }).toUpperCase().replace(/MAHALLES[I]?|MAH\.?/g, '').replace(/[^A-Z0-9]/g, '');
}
function items(d) {
  var a = d && d.features ? d.features.map(function (f) { return f.properties || {}; }) : (Array.isArray(d) ? d : []);
  return a.map(function (p) { return { id: p.id || p.ID || p.Id, ad: p.text || p.ad || p.adi || p.name || p.Ad || '' }; });
}
function listCached(path) {
  var c = CacheService.getScriptCache(), key = 'tk' + path, hit = c.get(key);
  if (hit) return JSON.parse(hit);
  var list = items(tkGet(path));
  try { c.put(key, JSON.stringify(list), 21600); } catch (e) {}
  return list;
}
function pick(list, name) {
  var n = norm(name); if (!n) return null;
  var ex = list.filter(function (x) { return norm(x.ad) === n; });
  if (ex.length) return ex[0];
  var pa = list.filter(function (x) { var a = norm(x.ad); return a.indexOf(n) >= 0 || n.indexOf(a) >= 0; });
  return pa.length === 1 ? pa[0] : null;
}
function tkgm(p) {
  sahipKontrol();
  var il = pick(listCached('/idariYapi/ilListe'), 'AFYONKARAHISAR');
  if (!il) return { ok: false, err: 'Afyonkarahisar ili TKGM listesinde bulunamadı' };
  var ilceler = listCached('/idariYapi/ilceListe/' + il.id), ilce = pick(ilceler, p.ilce);
  if (!ilce) return { ok: false, err: 'İlçe bulunamadı: ' + p.ilce, secenekler: ilceler.map(function (x) { return x.ad; }) };
  var mahs = listCached('/idariYapi/mahalleListe/' + ilce.id), mh = pick(mahs, p.mahalle);
  if (!mh) return { ok: false, err: 'Mahalle bulunamadı: ' + p.mahalle, secenekler: mahs.map(function (x) { return x.ad; }) };
  var d = tkGet('/parsel/' + mh.id + '/' + encodeURIComponent(String(p.ada || '').trim()) + '/' + encodeURIComponent(String(p.parsel || '').trim()));
  var f = d && d.features ? d.features[0] : d;
  if (!f || !f.geometry) return { ok: false, err: 'Parsel bulunamadı: ' + p.ada + '/' + p.parsel };
  return { ok: true, il: il.ad, ilce: ilce.ad, mahalle: mh.ad, feature: { type: 'Feature', geometry: f.geometry, properties: f.properties || {} } };
}

// --- Tek seferlik veri aktarımı (eski uygulamadan). Veri dosyası boşken ve doğru anahtarla çalışır. ---
function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  var p; try { p = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, err: 'bad' }); }
  if (p.op !== 'aktar' || p.anahtar !== AKTAR_ANAHTARI) return out({ ok: false, err: 'yetkisiz' });
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var d = oku();
    if (d.ver > 0) return out({ ok: false, err: 'Veri zaten aktarılmış (sürüm ' + d.ver + ')' });
    var st = p.veri || {}, t = Date.now(), kv = {};
    (st.jobs || []).forEach(function (j) { kv['j:' + j.id] = { v: JSON.stringify(j), t: t, n: 1 }; });
    var c = st.checks || {}; Object.keys(c).forEach(function (k) { if (c[k]) kv['c:' + k] = { v: '1', t: t, n: 1 }; });
    var th = st.tahsilat || {}; Object.keys(th).forEach(function (k) { var v = th[k]; if (v && (v.amount || v.note || v.date)) kv['t:' + k] = { v: JSON.stringify(v), t: t, n: 1 }; });
    var r = st.rehber || {}; Object.keys(r).forEach(function (k) { kv['r:' + k] = { v: JSON.stringify(r[k]), t: t, n: 1 }; });
    (st.trash || []).forEach(function (x) { kv['x:' + x.id] = { v: JSON.stringify(x), t: t, n: 1 }; });
    d = { ver: 1, kv: kv }; yaz(d); gunlukYedek(d);
    return out({ ok: true, isler: (st.jobs || []).length, anahtar: Object.keys(kv).length });
  } finally { lock.releaseLock(); }
}

// --- Düzenleyiciden elle çalıştırılan test ---
function testTkgm() { Logger.log(JSON.stringify(tkgm({ ilce: 'SANDIKLI', mahalle: 'ECE', ada: '1510', parsel: '42' })).slice(0, 1500)); }
