/* ===================================================================
   sync.js — เชื่อมหน้าจอกับ Google Sheets (ผ่าน Apps Script)
   โหลดหลัง app.js : แทนที่การเข้าสู่ระบบ/เก็บข้อมูล/ออกเลขที่ ของตัวอย่างด้วยของจริง
   ตั้งค่าที่อยู่เว็บแอปใน config.js (BUDGET_CONFIG.API_URL)
   =================================================================== */
(function () {
  'use strict';
  var CFG = window.BUDGET_CONFIG || {};
  var TOKEN = null, ME = null, FY = 2570, COUNTERS = {}, VER = {}, SNAP = {}, ATT = new Map(), RES = {}, SRV_TAX = {}, TAX_OPEN = 0, SRV_OLD = {};
  var SAVING = false, WANT = false, SAVE_T = 0, POLL_T = 0, LASTPIN = '', ONLINE = true, BUSY_FILES = {};
  var SESS = 'budget_sess';

  /* ---------------------------------------------------------- เครือข่าย */
  function ready() { return CFG.API_URL && CFG.API_URL.indexOf('http') === 0; }
  function body(method, args) { return JSON.stringify({ token: TOKEN, method: method, args: args || {} }); }
  function netBar(on, text) {
    var el = document.getElementById('netbar');
    if (!el) { el = document.createElement('div'); el.id = 'netbar'; el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#B3261E;color:#fff;text-align:center;padding:6px 10px;font-size:15px'; document.body.appendChild(el); }
    el.hidden = !on; if (text) el.textContent = text; ONLINE = !on;
  }
  function handle(j) {
    if (!j || typeof j !== 'object') { var e0 = new Error('ตอบกลับไม่ถูกต้อง'); e0.code = 'BAD'; throw e0; }
    if (!j.ok) { var e = new Error(j.error || 'ผิดพลาด'); e.code = j.error; if (j.error === 'SESSION') { onSession(); } throw e; }
    netBar(false); return j.data;
  }
  var PENDING = 0;
  function pill() {
    var el = document.getElementById('savepill');
    if (!el) { el = document.createElement('div'); el.id = 'savepill'; el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9998;background:#1b2b4b;color:#fff;border-radius:999px;padding:6px 14px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.92'; el.textContent = 'กำลังบันทึก…'; document.body.appendChild(el); }
    el.hidden = PENDING <= 0;
  }
  function call(method, args) {
    if (method !== 'loginList' && method !== 'ping' && method !== 'login') { PENDING++; pill(); }
    var done = function () { if (method !== 'loginList' && method !== 'ping' && method !== 'login') { PENDING--; pill(); } };
    return call0(method, args).then(function (x) { done(); return x; }, function (e) { done(); throw e; });
  }
  function call0(method, args) {
    return fetch(CFG.API_URL, { method: 'POST', body: body(method, args), redirect: 'follow' })
      .then(function (r) { return r.json(); }, function (e) { netBar(true, 'เชื่อมต่อระบบไม่ได้ กำลังลองใหม่…'); throw e; })
      .then(handle);
  }
  function callSync(method, args) {            // ใช้เฉพาะตอนต้องได้เลขที่กลับมาทันที (ออกเลขที่ รหัสคำขอ DATABASE)
    var x = new XMLHttpRequest();
    try { x.open('POST', CFG.API_URL, false); x.send(body(method, args)); }
    catch (e) { netBar(true, 'เชื่อมต่อระบบไม่ได้'); throw new Error('เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง'); }
    var j; try { j = JSON.parse(x.responseText); } catch (e) { throw new Error('ระบบตอบกลับไม่ถูกต้อง ลองใหม่อีกครั้ง'); }
    return handle(j);
  }
  function say(text, ms) { var el = document.getElementById('toast'); el.textContent = text; el.hidden = false; clearTimeout(say.h); say.h = setTimeout(function () { el.hidden = true; }, ms || 5000); }
  function failMsg(e) { return (e && e.message) ? e.message : 'ผิดพลาด'; }

  /* ---------------------------------------------------------- ผู้ใช้ */
  var TITLE = /^(ว่าที่ร้อยตรีหญิง|ว่าที่ร้อยตรี|นางสาว|นาง|นาย)/;
  function mkUser(p, i) {
    var all = p.roles || [], admin = all.indexOf('admin') >= 0, roles = all.filter(function (r) { return r !== 'admin'; });
    if (!roles.length) roles = ['teacher'];
    var role = roles.indexOf('director') >= 0 ? 'director' : roles[0];
    var u = { id: p.id, name: p.name, pos: p.pos || 'ครู', dept: p.dept || '', role: role, admin: admin, code: 'T' + ('00' + (i + 1)).slice(-3),
      short: role === 'director' ? 'ผอ.' + p.name.replace(TITLE, '').split(' ')[0] : p.name.replace(TITLE, 'ครู'), pin: p.must ? null : 'set', disabled: p.status === 'ปิดใช้งาน' };
    if (roles.length > 1) u.roles = roles.slice();
    if (role !== 'teacher' && role !== 'director') u.fdept = p.dept || '';
    if (p.must) u.tempPin = roles.length === 1 && roles[0] === 'teacher' ? '2570' : '••••';
    return u;
  }
  function setUsers(list) {
    var old = {}; Object.keys(USERS).forEach(function (k) { old[k] = USERS[k]; delete USERS[k]; });
    list.forEach(function (p, i) { var u = mkUser(p, i); if (old[u.id] && old[u.id].lastLogin) u.lastLogin = old[u.id].lastLogin; USERS[u.id] = u; });
    try { fillWho(); } catch (e) {}
  }

  /* ---------------------------------------------------------- เริ่มระบบ */
  document.addEventListener('focusin', function (e) { if (e.target && e.target.id === 'lp' && !TOKEN) call('ping').catch(function () {}); });
  /* ตราโรงเรียน: จำรูปที่ดึงจาก Drive ไว้ในเครื่อง ครั้งถัดไปขึ้นทันที ไม่ต้องรอเรียกเซิร์ฟเวอร์ */
  function logoCacheLoad() {
    try { var lc = JSON.parse(localStorage.getItem('budget_logo') || 'null'); if (lc && lc.id && /^data:image\//.test(lc.url || '')) { RES[lc.id] = lc.url; ATT.set(lc.url, 'att:' + lc.id); if (!SITE.logo) SITE.logo = lc.url; } } catch (e) {}
  }
  function logoCacheSave() {
    try {
      var u = SITE.logo, id = u && ATT.get(u);
      if (id && id.slice(0, 4) === 'att:') localStorage.setItem('budget_logo', JSON.stringify({ id: id.slice(4), url: u }));
      else if (!u) localStorage.removeItem('budget_logo');
    } catch (e) {}
  }
  logoCacheLoad();
  function boot() {
    if (!ready()) { say('ยังไม่ได้ตั้งค่าที่อยู่เว็บแอปในไฟล์ config.js', 60000); return; }
    var saved = null; try { saved = sessionStorage.getItem(SESS); } catch (e) {}
    var showLogin = function () {
      call('loginList').then(function (list) { setUsers(list || []); S.view = 'login'; render(); },
        function (e) { say('เปิดรายชื่อไม่ได้: ' + failMsg(e), 20000); });
    };
    if (saved) { TOKEN = saved; call('loadAll').then(function (d) { ME = d.me; ingest(d); signIn(USERS[ME.id], true); startPoll(); }, function () { TOKEN = null; try { sessionStorage.removeItem(SESS); } catch (e) {} showLogin(); }); }
    else showLogin();
  }

  /* ---------------------------------------------------------- เข้าสู่ระบบ */
  var _vLogin = vLogin;
  vLogin = function () {
    if (S.chpin && S.u) return window.vChPin();
    S.chpin = false;
    _vLogin();
    var d = document.querySelector('.lgdemo'); if (d) d.remove();
    var f = document.getElementById('lf'); if (f) f.onsubmit = doLogin;
    var forgot = document.querySelector('.lgrow'); if (forgot) forgot.style.display = '';
  };

  /* เงินร่วง: ธนบัตร 5 ใบ ตกต่อเนื่องจากนอกปุ่มลงนอกปุ่ม โยกซ้ายขวาและพลิกอย่างนุ่ม ตำแหน่งสุ่มใหม่ทุกรอบ */
  var NOTE = '<svg viewBox="0 0 32 20" width="1.7em" height="1.06em" style="display:block;filter:drop-shadow(0 1.5px 2px rgba(0,70,40,.35))"><defs><linearGradient id="nt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BF0B8"/><stop offset="1" stop-color="#3DBB78"/></linearGradient></defs><rect x="1" y="1" width="30" height="18" rx="3.5" fill="url(#nt)" stroke="rgba(255,255,255,.75)" stroke-width="1.2"/><rect x="4" y="4" width="24" height="12" rx="2" fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".8" stroke-dasharray="1.6 1.4"/><circle cx="16" cy="10" r="5" fill="rgba(255,255,255,.4)"/><text x="16" y="12.8" text-anchor="middle" font-size="7.5" font-weight="700" fill="#1F8F57" font-family="Prompt,Sarabun,sans-serif">฿</text></svg>';
  var COIN = '<svg viewBox="0 0 20 20" width="1.1em" height="1.1em" style="display:block;filter:drop-shadow(0 1.5px 2px rgba(120,70,0,.35))"><defs><linearGradient id="cn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A0"/><stop offset="1" stop-color="#F2AE2B"/></linearGradient></defs><circle cx="10" cy="10" r="9" fill="url(#cn)" stroke="rgba(255,255,255,.8)" stroke-width="1.2"/><circle cx="10" cy="10" r="6.2" fill="none" stroke="rgba(190,120,10,.45)" stroke-width=".9"/><text x="10" y="13.2" text-anchor="middle" font-size="8.5" font-weight="700" fill="#B87408" font-family="Prompt,Sarabun,sans-serif">฿</text></svg>';
  function startRain(el) {
    if (!el) return;
    var n = 5, dur = 3.6, rnd = function (a, b) { return a + Math.random() * (b - a); };
    for (var k = 0; k < n; k++) (function (k) {
      var i = document.createElement('i'), b = document.createElement('b'); b.innerHTML = (k % 3 === 2) ? COIN : NOTE; i.appendChild(b);
      function roll() {
        i.style.left = (4 + (k + Math.random() * .6) * (88 / n)).toFixed(1) + '%';
        i.style.fontSize = rnd(24, 28).toFixed(0) + 'px';
        i.style.setProperty('--s', rnd(6, 12).toFixed(1) + 'px'); i.style.setProperty('--r', rnd(12, 22).toFixed(0) + 'deg');
        b.style.animationDuration = rnd(1.3, 1.9).toFixed(2) + 's';
      }
      roll(); i.style.animationDelay = (-(k * dur / n)).toFixed(2) + 's'; b.style.animationDelay = (-rnd(0, 1.5)).toFixed(2) + 's';
      i.addEventListener('animationiteration', function (e) { if (e.target === i) roll(); });
      el.appendChild(i);
    })(k);
  }
  function doLogin(e) {
    e.preventDefault();
    var id = $('lu').value, pw = $('lp').value, err = function (text) { $('lErr').textContent = text; badPin('lp'); };
    if (!id) { $('lErr').innerHTML = T('e_pick'); $('lu').focus(); return; }
    if (pw.length < 4) return err('กรอก PIN 4 หลัก');
    var btn = document.querySelector('#lf .lgbtn'), btn0 = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lgrain" aria-hidden="true"></span><span class="lgtxt">กำลังเข้าสู่ระบบ<span class="lgdots"><i>.</i><i>.</i><i>.</i></span></span>'; startRain(btn.querySelector('.lgrain')); }
    call('login', { id: id, pin: pw, light: 1 }).then(function (d) {
      TOKEN = d.token; ME = d.user; LASTPIN = pw; try { sessionStorage.setItem(SESS, TOKEN); } catch (e2) {}
      afterLogin(false, d.data, true);
    }, function (e2) { if (btn) { btn.disabled = false; btn.textContent = btn0; } err(failMsg(e2)); });
  }

  (function () {
    var st = document.createElement('style');
    st.textContent = '#lf .lgbtn{position:relative;overflow:hidden}' +
      '.lgrain{position:absolute;inset:0;pointer-events:none}' +
      '.lgrain i{position:absolute;top:-30px;font-style:normal;line-height:1;will-change:transform;animation:lgFallY 3.6s linear infinite}' +
      '.lgrain i b{display:block;font-weight:400;line-height:1;animation:lgSway 1.5s ease-in-out infinite}' +
      '@keyframes lgFallY{from{transform:translateY(0)}to{transform:translateY(116px)}}' +
      '@keyframes lgSway{0%,100%{transform:translateX(calc(var(--s)*-1)) rotate(calc(var(--r)*-1)) scaleX(1)}50%{transform:translateX(var(--s)) rotate(var(--r)) scaleX(.7)}}' +
      '.lgtxt{position:relative;text-shadow:0 1px 3px rgba(10,30,90,.55)}' +
      '.lgdots i{font-style:normal;display:inline-block;animation:lgDot 1.2s infinite}.lgdots i:nth-child(2){animation-delay:.2s}.lgdots i:nth-child(3){animation-delay:.4s}' +
      '@keyframes lgDot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}' +
      '@media (prefers-reduced-motion:reduce){.lgrain i,.lgrain i b,.lgdots i{animation:none}.lgrain{display:none}}';
    document.head.appendChild(st);
  })();
  var _vSetPin = vSetPin;
  vSetPin = function (id) {
    _vSetPin(id);
    $('sf').onsubmit = function (e) {
      e.preventDefault(); var a = $('p1').value, b = $('p2').value, ek = '';
      if (!/^\d{4}$/.test(a)) ek = 'e_sp_len'; else if (a === '2570' || a === '1234' || a === LASTPIN) ek = 'e_sp_same'; else if (weakPin(a)) ek = 'e_sp_weak'; else if (a !== b) ek = 'e_sp_match';
      if (ek) { $('sErr').innerHTML = T(ek); badPin(ek === 'e_sp_match' ? 'p2' : 'p1'); if (ek !== 'e_sp_match') { badPin('p2'); $('p1').focus(); } return; }
      call('changePin', { oldPin: LASTPIN, newPin: a }).then(function () { LASTPIN = ''; S.setPin = null; ME.must = false; afterLogin(true); say('ตั้ง PIN ใหม่เรียบร้อย'); },
        function (e2) { $('sErr').textContent = failMsg(e2); badPin('p1'); badPin('p2'); });
    };
    var c = $('spCancel'); if (c) c.onclick = function () { doLogout(true); };
  };
  var LOADING = false;
  function paintLoading(err) {
    var v = document.getElementById('view'); if (!v) return;
    v.innerHTML = '<div style="max-width:520px;margin:12vh auto;text-align:center;padding:0 16px"><div class="ldspin" style="width:34px;height:34px;margin:0 auto 14px;border:4px solid #cfd8ea;border-top-color:#2a5bd7;border-radius:50%;animation:ldspin .8s linear infinite"></div>' +
      (err ? '<p style="color:#B3261E;margin:0 0 10px">' + err + '</p><button class="btn" id="ldRetry">ลองใหม่</button>' : '<p style="font-size:1.1em;margin:0">กำลังเตรียมข้อมูลของคุณ…</p>') + '</div>';
    var b = document.getElementById('ldRetry'); if (b) b.onclick = function () { loadFull(); };
  }
  function loadFull() {
    LOADING = true; window.SYNC_LOADING = true; paintLoading();
    call('loadAll').then(function (d) {
      ME = d.me; ingest(d); if (!USERS[ME.id]) setUsers(d.users || []);
      LOADING = false; window.SYNC_LOADING = false; startPoll(); signIn(USERS[ME.id], true); prefetchId();
    }, function (e) { if (e && e.code === 'SESSION') return; paintLoading('โหลดข้อมูลไม่ได้: ' + failMsg(e)); });
  }
  function afterLogin(quiet, pre, light) {
    var go = function (d) { ME = d.me; ingest(d); startPoll(); signIn(USERS[ME.id], quiet); prefetchId(); };
    if (pre) return go(pre);
    if (light && ME && !ME.must) {                 /* เข้าหน้าแรกทันที แล้วโหลดข้อมูลตามหลัง */
      if (!USERS[ME.id]) USERS[ME.id] = mkUser(ME, 0);
      LOADING = true; window.SYNC_LOADING = true; signIn(USERS[ME.id], quiet); return loadFull();
    }
    call('loadAll').then(go, function (e) { say('โหลดข้อมูลไม่ได้: ' + failMsg(e), 20000); });
  }
  function onSession() { if (!TOKEN) return; TOKEN = null; stopPoll(); try { sessionStorage.removeItem(SESS); } catch (e) {} wipe(); S.u = null; S.view = 'login'; call('loginList').then(function (l) { setUsers(l); render(); say('หมดเวลาใช้งาน กรุณาเข้าสู่ระบบใหม่'); }, function () { render(); }); }
  function wipe() { REQS.length = 0; VER = {}; SNAP = {}; TAXB.rows = []; TAXB.open = 0; SRV_TAX = {}; OLDLOANS = []; SRV_OLD = {}; window.LEGACY = {}; }
  function doLogout(silent) {
    var t = TOKEN; TOKEN = null; stopPoll(); try { sessionStorage.removeItem(SESS); } catch (e) {}
    if (t) { try { fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ token: t, method: 'logout', args: {} }) }); } catch (e) {} }
    wipe(); S.setPin = null; S.lgPick = null; S.u = null; S.open = null; S.doc = null; S.draft = null; S.view = 'login'; S.hmq = null; S.after = null; endEdit();
    call('loginList').then(function (l) { setUsers(l); render(); if (!silent) toast('t_logout'); }, function () { render(); });
    window.scrollTo(0, 0);
  }
  logout = function () { doLogout(false); };

  /* ---------------------------------------------------------- รับข้อมูลจากชีท */
  function ser(r) {
    return JSON.stringify(r, function (k, v) {
      if (k === '_v') return undefined;
      if (typeof v === 'string' && v.length > 3000 && v.slice(0, 5) === 'data:') return ATT.get(v) || ('@@PENDING' + v.length);
      return v;
    });
  }
  function ingestReq(r) { VER[r.id] = r._v || 0; delete r._v; SNAP[r.id] = ser(r); return r; }
  function ingest(d) {
    FY = d.fy; COUNTERS = d.counters || {}; if (d.vendors) VENDORS = d.vendors; if (d.planItems && window.buildPlanItems) buildPlanItems(d.planItems);
    setUsers(d.users || []);
    REQS.length = 0; var seenId = {}; (d.requests || []).forEach(function (r) { var o = ingestReq(r), k = String(o.id); if (seenId[k] != null) REQS[seenId[k]] = o; else { seenId[k] = REQS.length; REQS.push(o); } });   // แถวซ้ำในชีท: เอาแถวล่างสุด
    TAX_OPEN = d.tax ? d.tax.open : 0; setTax(d.tax); setOld(d.oldLoans);
    var st = d.settings || {};
    (st.supplyList || []).forEach(function (p) { if (p[1]) PG_SUPPLY[p[0]] = p[1]; });
    SUPPLY_X.length = 0; (st.supplyExtra || []).forEach(function (n) { if (n && SUPPLY_X.indexOf(n) < 0) SUPPLY_X.push(n); });
    SUPPLY_LIST.length = SUPPLY_BASE; SUPPLY_X.forEach(function (n) { if (SUPPLY_LIST.indexOf(n) < 0) SUPPLY_LIST.push(n); });
    buildLegacy(d.legacy || []);
    if (d.site && d.site.words) Object.keys(d.site.words).forEach(function (k) { if (typeof d.site.words[k] === 'string') L[k] = d.site.words[k]; });
    WORDSIG = wordsSig();
    if (d.site && d.site.site && typeof d.site.site === 'object') {
      var ss = d.site.site; ['logo', 'loginBg', 'email', 'phone', 'address'].forEach(function (k) { if (typeof ss[k] === 'string') SITE[k] = ss[k]; });
      if (Array.isArray(ss.slides) && ss.slides.length) SITE.slides = ss.slides.filter(function (x) { return typeof x === 'string'; }).slice(0, 6);
      if (Array.isArray(ss.navdocs) && ss.navdocs.length === 4) SITE.navdocs = ss.navdocs.map(function (x) { return x && typeof x === 'object' ? x : {}; });
      if (Array.isArray(ss.forms)) SITE.forms = ss.forms.filter(function (f) { return f && typeof f.title === 'string'; });
      if (Array.isArray(ss.news)) SITE.news = ss.news.filter(function (n) { return n && typeof n.title === 'string'; });
      resolveAtts(SITE).then(function (did) { logoCacheSave(); if (did) _render(); }, function () {});
    }
    SITESIG = siteSig();
  }
  function setTax(t) {
    if (!t) return; TAXB.open = t.open || 0; TAX_OPEN = TAXB.open;
    TAXB.rows = (t.rows || []).map(function (x) { x.srv = 1; return x; }); SRV_TAX = {}; TAXB.rows.forEach(function (x) { SRV_TAX[x.id] = 1; });
  }
  function setOld(a) {
    if (!Array.isArray(a)) return;
    OLDLOANS = a.map(function (x) { x.srv = 1; return x; }); SRV_OLD = {}; OLDLOANS.forEach(function (x) { SRV_OLD[x.id] = x.st + '|' + (x.closed || ''); });
  }
  function norm(s) { return String(s || '').replace(/[.\s]/g, ''); }
  function buildLegacy(rows) {
    var map = {}, un = [];
    rows.forEach(function (x) {
      var pj = PROJECTS.filter(function (p) { return norm(p.code) === norm(x.code); })[0], a = null;
      if (pj) { var c = ACTS.filter(function (z) { return z.project === pj.id; }); a = c.filter(function (z) { return z.fund === x.fund; })[0] || c.filter(function (z) { return String(z.fund).indexOf(x.fund) >= 0 || String(x.fund).indexOf(z.fund) >= 0; })[0] || null; }
      if (!a) { un.push(x); return; }
      var m = map[a.id] || (map[a.id] = { cut: 0, hold: 0 }); if (x.used != null) m.cut += x.used; else m.hold += x.amt;
    });
    window.LEGACY = map; window.LEGACY_ROWS = rows; window.LEGACY_UNMATCHED = un;
  }

  /* ---------------------------------------------------------- ไฟล์แนบขนาดใหญ่ -> Drive */
  function walk(o, fn) { if (!o || typeof o !== 'object') return; Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string') fn(o, k, v); else walk(v, fn); }); }
  function pending(r) { var l = []; walk(r, function (o, k, v) { if (v.length > 3000 && v.slice(0, 5) === 'data:' && !ATT.has(v) && l.indexOf(v) < 0) l.push(v); }); return l; }
  function putAtt(url, reqId) {
    var m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url); if (!m) return Promise.reject(new Error('ไฟล์แนบรูปแบบไม่รองรับ'));
    var b64 = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
    return call('attPut', { b64: b64, mime: m[1] || 'application/octet-stream', reqId: reqId }).then(function (d) { ATT.set(url, 'att:' + d.id); RES[d.id] = url; });
  }
  function resolveAtts(r) {
    var need = []; walk(r, function (o, k, v) { if (v.slice(0, 4) === 'att:') need.push([o, k, v.slice(4)]); });
    if (!need.length) return Promise.resolve(false);
    return Promise.all(need.map(function (n) {
      if (RES[n[2]]) { n[0][n[1]] = RES[n[2]]; return null; }
      return call('attGet', { id: n[2] }).then(function (d) { RES[n[2]] = d.url; ATT.set(d.url, 'att:' + n[2]); n[0][n[1]] = d.url; });
    })).then(function () { return true; });
  }

  /* ---------------------------------------------------------- บันทึกคำขอ (ส่งเฉพาะที่เปลี่ยน) */
  var _render = render;
  render = function () { _render.apply(this, arguments); if (LOADING && S.u) paintLoading(); schedSave(); schedWords(); };
  function schedSave() { if (!TOKEN) return; clearTimeout(SAVE_T); SAVE_T = setTimeout(saveAll, 350); }
  function dirtyList() { return REQS.filter(function (r) { return SNAP[r.id] !== ser(r); }); }
  function saveAll() {
    if (!TOKEN) return; if (SAVING) { WANT = true; return; }
    var list = dirtyList(); if (!list.length) { return; }
    SAVING = true;
    var next = function (i) {
      if (i >= list.length) { SAVING = false; if (WANT) { WANT = false; schedSave(); } return Promise.resolve(); }
      return saveOne(list[i]).then(function () { return next(i + 1); }, function (e) {
        SAVING = false; say('บันทึกไม่สำเร็จ: ' + failMsg(e) + ' (ระบบจะลองใหม่)', 8000); clearTimeout(SAVE_T); SAVE_T = setTimeout(saveAll, 10000);
      });
    };
    next(0);
  }
  function saveOne(r) {
    var ps = pending(r), up = Promise.resolve();
    ps.forEach(function (u) { up = up.then(function () { return putAtt(u, r.id); }); });
    return up.then(function () {
      var js = ser(r); var copy = JSON.parse(js);
      return call('saveRequest', { req: copy, baseVersion: VER[r.id] || 0 }).then(function (d) {
        if (d.conflict) { takeServer(r, d); return; }
        VER[r.id] = d.version; SNAP[r.id] = js;
      });
    });
  }
  function takeServer(r, d) {               // มีคนอื่นแก้เรื่องนี้ไปก่อน: ใช้ฉบับในชีท แล้วแจ้งผู้ใช้
    var nr = d.req || {}; nr._v = d.version; var i = REQS.indexOf(r); ingestReq(nr); if (i >= 0) REQS[i] = nr; else REQS.push(nr);
    say('เรื่อง ' + r.id + ' มีผู้อื่นแก้ไขไปก่อน ระบบโหลดฉบับล่าสุดให้แล้ว กรุณาตรวจและทำรายการใหม่ถ้าจำเป็น', 12000);
    _render();
  }
  function flush() {                           // ใช้ก่อนปิดหน้า/ก่อนขั้นสำคัญ
    var list = dirtyList(); if (!list.length) return Promise.resolve();
    return new Promise(function (ok) { var t = setInterval(function () { if (!SAVING && !dirtyList().length) { clearInterval(t); ok(); } else if (!SAVING) saveAll(); }, 400); setTimeout(function () { clearInterval(t); ok(); }, 20000); });
  }
  window.addEventListener('beforeunload', function (e) { if (TOKEN && dirtyList().length) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------------------------------------------------- ดึงข้อมูลใหม่ทุก 30 วินาที */
  function startPoll() { stopPoll(); POLL_T = setInterval(poll, 30000); }
  function stopPoll() { clearInterval(POLL_T); }
  function poll() {
    if (!TOKEN || SAVING || document.hidden) return;
    var known = {}; Object.keys(VER).forEach(function (k) { known[k] = VER[k]; });
    call('sync', { known: known }).then(function (d) {
      var changed = false, ids = {};
      (d.ids || []).forEach(function (i) { ids[i] = 1; });
      (d.changed || []).forEach(function (nr) {
        var cur = REQS.filter(function (x) { return x.id === nr.id; })[0];
        if (cur && SNAP[cur.id] !== ser(cur)) return;                    // ฝั่งนี้มีแก้ที่ยังไม่ส่ง ปล่อยให้ชนตอนบันทึก
        ingestReq(nr); if (cur) REQS[REQS.indexOf(cur)] = nr; else REQS.push(nr); changed = true;
      });
      COUNTERS = d.counters || COUNTERS;
      if (d.oldLoans && OLD_CLEAN()) { var osig = JSON.stringify(d.oldLoans); if (osig !== poll.oldSig) { poll.oldSig = osig; setOld(d.oldLoans); changed = true; } }
      if (d.tax && !(S.view === null && S.tab === 'tax' && document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName))) { var sig = JSON.stringify(d.tax); if (sig !== poll.taxSig) { poll.taxSig = sig; if (TAX_LOCAL_CLEAN()) { setTax(d.tax); changed = true; } } }
      if (changed && !editingNow()) _render();
    }, function () {});
  }
  function editingNow() { var a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('view') && $('view').contains(a) && a.value !== ''; }
  function OLD_CLEAN() { return OLDLOANS.every(function (x) { return x.srv === 1 && !x.dirty; }); }
  function TAX_LOCAL_CLEAN() { return TAXB.rows.every(function (x) { return x.srv && !x.dirty; }); }

  /* ---------------------------------------------------------- เปิดดูคำขอ: ดึงไฟล์แนบจาก Drive */
  var _openReq = openReq;
  openReq = function (id) {
    _openReq(id);
    var r = REQS.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    resolveAtts(r).then(function (did) { if (did && S.open === id) _render(); }, function () { say('ดึงไฟล์แนบไม่สำเร็จ', 4000); });
  };

  /* ---------------------------------------------------------- เลขที่ (ออกที่เซิร์ฟเวอร์ ไม่ซ้ำ) */
  var IDPOOL = [], IDBUSY = false;
  function prefetchId() {
    if (!TOKEN || IDBUSY || IDPOOL.length >= 1) return; IDBUSY = true;
    call('newReqId', {}).then(function (d) { IDPOOL.push(String(d)); IDBUSY = false; }, function () { IDBUSY = false; });
  }
  window.newReqId = function () {
    if (IDPOOL.length) { var v = IDPOOL.shift(); setTimeout(prefetchId, 0); return v; }
    var d = callSync('newReqId', {}); setTimeout(prefetchId, 0); return String(d);
  };
  seedNos = function () {};
  nextNoN = function (kind, yy) { return (COUNTERS[(kind === 'loan' ? 'สัญญายืมเงิน' : 'ใบสำคัญจ่าย') + '|' + FY] || 0) + 1; };
  var _claim0 = claimNo;
  claimNo = function (r, kind) {
    var v = noOf(r, kind); if (v) return v;
    var key = (kind === 'loan' ? 'สัญญายืมเงิน' : 'ใบสำคัญจ่าย') + '|' + FY;
    v = _claim0(r, kind);                                   /* เลขชั่วคราวทันที ไม่รอเซิร์ฟเวอร์ */
    COUNTERS[key] = Math.max(COUNTERS[key] || 0, parseInt(v, 10) || 0);
    var put = function (x) { if (kind === 'loan') r.loanNo = x; else r.vchNo = x; };
    call('claimNumber', { kind: kind === 'loan' ? 'loan' : 'vch', ref: r.id }).then(function (d) {
      if (d.no !== v) { put(d.no); say('เลขที่ที่ได้รับจริงคือ ' + d.no, 6000); _render(); }
      COUNTERS[key] = Math.max(COUNTERS[key] || 0, parseInt(d.no, 10) || 0); schedSave();
    }, function (e) { put(''); say('ขอเลขที่ไม่สำเร็จ: ' + failMsg(e) + ' กรุณากดขอใหม่', 10000); _render(); });
    return v;
  };

  /* ---------------------------------------------------------- เลขที่ของงานพัสดุ (ซ/จ/อื่นๆ · ใบสั่งซื้อ · ใบสั่งจ้าง) ออกที่เซิร์ฟเวอร์ ไม่ซ้ำ */
  supYear = function () { return FY; };
  supNextN = function (kind) { return (COUNTERS[SUPK[kind][1] + '|' + FY] || 0) + 1; };
  var _claimSup0 = claimSup, supNum = function (v) { return parseInt(String(v).replace(/^\D+/, ''), 10) || 0; };
  claimSup = function (r, which) {
    var s0 = sup(r); if (s0[which]) return s0[which];
    var k = which === 'po' ? supPoKind(r) : supKind(r), key = SUPK[k][1] + '|' + FY;
    var v = _claimSup0(r, which);                          /* เลขชั่วคราวทันที ไม่รอเซิร์ฟเวอร์ */
    COUNTERS[key] = Math.max(COUNTERS[key] || 0, supNum(v));
    call('claimNumber', { kind: k, ref: r.id + ':' + which }).then(function (d) {
      if (d.no !== v) { sup(r)[which] = d.no; say('เลขที่ที่ได้รับจริงคือ ' + d.no, 6000); _render(); }
      COUNTERS[key] = Math.max(COUNTERS[key] || 0, supNum(d.no)); schedSave();
    }, function (e) { sup(r)[which] = ''; say('ขอเลขที่ไม่สำเร็จ: ' + failMsg(e) + ' กรุณากดขอใหม่', 10000); _render(); });
    return v;
  };
  /* พัสดุพิมพ์เลขเองตามกระดาษ (เช่น ซ12/2570) → ให้ตัวนับฝั่งเซิร์ฟเวอร์เดินต่อจากเลขนั้น */
  document.addEventListener('change', function (e) {
    var el = e.target, f = el && el.dataset && el.dataset.sp; if (f !== 'no' && f !== 'po') return;
    var r = S.open && req(S.open); if (!r) return;
    var k = f === 'po' ? supPoKind(r) : supKind(r), m = /^(\D*)(\d+)\/(\d{4})$/.exec(String(el.value).replace(/\s/g, '')), key = SUPK[k][1] + '|' + FY;
    if (!m || m[1] !== SUPK[k][0] || +m[3] !== FY || +m[2] <= (COUNTERS[key] || 0)) return;
    COUNTERS[key] = +m[2];
    call('bumpCounter', { kind: k, n: +m[2] }).catch(function () { say('ตั้งตัวนับเลขไม่สำเร็จ', 8000); });
  });

  window.legDone = function (r) {   /* เลขสัญญายืมเดิม: ให้ตัวนับฝั่งเซิร์ฟเวอร์เดินต่อจากเลขในกระดาษ */
    var m = /^(\d+)\/(\d+)$/.exec((r.loan && r.loan.no) || ''); if (!m) return;
    try { call('bumpCounter', { kind: 'loan', n: +m[1] }).catch(function () { say('ตั้งตัวนับเลขสัญญาไม่สำเร็จ', 8000); }); COUNTERS['สัญญายืมเงิน|' + FY] = Math.max(COUNTERS['สัญญายืมเงิน|' + FY] || 0, +m[1]); } catch (e) { say('ตั้งตัวนับเลขสัญญายืมไม่สำเร็จ: ' + failMsg(e), 8000); }
  };

  /* ---------------------------------------------------------- DATABASE ของแผน + ไฟล์ลง Drive */
  var TH_M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function dbRowOf(r, at) {
    var a = act(r.act), pj = proj(a.project), d = new Date(at), grp = (PLAN_SHORT[pj.plan] || '').replace(/\s*\(.*\)\s*$/, '');
    var ac = actOf(r);
    return { b: r.docNo || '', c: pgSubject(r), d: String(pj.code).replace(/\./g, ''), e: grp, f: pj.name, g: r.amount, h: a.fund, i: r.lane === 'no' ? 'ไม่ตรงตามแผน' : 'ตรงตามแผน', j: 0, k: '-',
      l: 'กิจกรรมที่ ' + ac.no + ' ' + ac.name, m: '', n: d.getDate() + ' ' + TH_M[d.getMonth()] + ' พ.ศ. ' + (d.getFullYear() + 543) };
  }
  var _complete = complete;
  complete = function (r, by, at, lk, lv) {
    if (r.legacy) { _complete(r, by, at, lk, lv); return; }   /* ข้อมูลเดิม: ไม่สร้างแถว DATABASE / ไฟล์ใหม่ */
    var s = cur(r), isPlan = s && s.k === 'plan_check' && r.type === 'use' && !r.recur, isCut = s && s.k === 'cut' && r.dbNo;
    var dbRow = isPlan ? dbRowOf(r, at) : null, used = isCut ? (r.cutAmount || r.actual || r.amount) : 0;
    if (isPlan && r.dbNo) call('dbUpdateRow', { dbNo: r.dbNo, row: dbRow }).catch(function (e) { say('อัปเดตแถว DATABASE ไม่สำเร็จ: ' + failMsg(e), 8000); });
    if (isPlan && !r.dbNo) { r.dbPend = at; }
    if (isCut) call('dbSetUsed', { dbNo: r.dbNo, used: used }).catch(function (e) { say('บันทึกยอดใช้จริงลง DATABASE ไม่สำเร็จ: ' + failMsg(e), 8000); });
    _complete(r, by, at, lk, lv);
    if (isPlan && !r.dbNo) addDb(r);
    if (isPlan && r.dbNo) setTimeout(function () { makeFiles(r); }, 50);
  };
  var DBBUSY = {};
  function addDb(r) {                         /* เพิ่มแถว DATABASE เบื้องหลัง (เซิร์ฟเวอร์กันซ้ำด้วยรหัสคำขอ จึงลองซ้ำได้) */
    if (!r.dbPend || r.dbNo || DBBUSY[r.id] || !TOKEN) return; DBBUSY[r.id] = 1;
    call('dbAddRow', { reqId: r.id, row: dbRowOf(r, r.dbPend) }).then(function (d) {
      delete DBBUSY[r.id]; r.dbNo = d.dbNo; r.pgNo = String(d.dbNo).split('/')[0]; delete r.dbPend; schedSave(); _render(); makeFiles(r);
    }, function (e) { delete DBBUSY[r.id]; say('เพิ่มแถว DATABASE ไม่สำเร็จ ระบบจะลองใหม่: ' + failMsg(e), 8000); });
  }
  function toB64(blob) { return new Promise(function (ok, bad) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.onerror = bad; f.readAsDataURL(blob); }); }
  function makeFiles(r) {                     // ทำ PDF + Word ของ ผง.01 แล้วเก็บลง Drive ใส่คอลัมน์ P, Q
    if (!r.dbNo || (r.pgFiles && r.pgFiles.pdf && r.pgFiles.word) || BUSY_FILES[r.id]) return; BUSY_FILES[r.id] = 1;
    var base = fileSafe(ofModel('pg01', r.id).name);
    var m1 = ofModel('pg01', r.id), m2 = ofModel('pg01', r.id), lh = measureLh(m2); if (lh && m2.st === 'ngp') m2.ln = lh; else if (lh) m2.lh = lh - 0.02;
    r.pgFiles = r.pgFiles || {};
    ofPdf(m1).then(function (b) { return toB64(b); }).then(function (b64) { return call('saveFile', { name: base + '.pdf', mime: 'application/pdf', b64: b64, reqId: r.id }); })
      .then(function (f) { r.pgFiles.pdf = f.url; return ofDocx(m2); }).then(function (b) { return toB64(b); })
      .then(function (b64) { return call('saveFile', { name: base + '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b64: b64, reqId: r.id }); })
      .then(function (f) { r.pgFiles.word = f.url; return call('dbSetFiles', { dbNo: r.dbNo, pdf: r.pgFiles.pdf, word: r.pgFiles.word }); })
      .then(function () { delete BUSY_FILES[r.id]; schedSave(); }, function (e) { delete BUSY_FILES[r.id]; say('บันทึกไฟล์ลง Drive ไม่สำเร็จ ระบบจะลองใหม่: ' + failMsg(e), 8000); });
  }
  function retryFiles() { if (!ME || !(USERS[ME.id].roles || [USERS[ME.id].role]).concat(USERS[ME.id].admin ? ['plan'] : []).some(function (x) { return x === 'plan'; })) return; REQS.forEach(function (r) { if (r.dbNo && !(r.pgFiles && r.pgFiles.pdf && r.pgFiles.word)) makeFiles(r); }); }
  setInterval(function () { if (TOKEN) { retryFiles(); REQS.forEach(addDb); } }, 120000);
  /* จำที่อยู่/เบอร์โทร/เลขภาษีของผู้รับเงินลงชีท ระบบ_ผู้รับเงิน (ครั้งหน้าไม่ต้องกรอกซ้ำ) */
  document.addEventListener('change', function (e) {
    var f = { aAddr: 'payAddr', aTel: 'payTel', aTax: 'payTax' }[e.target.id]; if (!f || !TOKEN) return;
    var r = S.open && req(S.open); if (!r) return; var pe = payeeOf(r); if (!pe) return;
    var key = Object.keys(VENDORS).filter(function (k) { return k.replace(/\s+/g, '') === pe.replace(/\s+/g, ''); })[0] || pe, v = VENDORS[key] = VENDORS[key] || {};
    v[f] = e.target.value.trim();
    call('vendorSave', { name: key, payAddr: v.payAddr, payTel: v.payTel, payTax: v.payTax }).catch(function () {});
  });
  window.SYNC = { onDoc: function () {}, flush: flush, poll: function () { return poll(); }, dirty: function () { return dirtyList().length; } };

  /* ---------------------------------------------------------- เล่มคุมภาษี */
  var _saveTax = saveTax;
  saveTax = function () {
    var curIds = {}; TAXB.rows.forEach(function (x) { curIds[x.id] = 1; });
    Object.keys(SRV_TAX).forEach(function (id) { if (!curIds[id]) { delete SRV_TAX[id]; call('taxDelete', { id: id }).catch(function (e) { say('ลบรายการภาษีไม่สำเร็จ: ' + failMsg(e), 8000); }); } });
    TAXB.rows.filter(function (x) { return !x.srv; }).forEach(function (x) {
      x.srv = 2; call('taxAdd', { d: x.d, k: x.k, who: x.who, amt: x.amt, form: x.form, fund: x.fund, cat: x.cat }).then(function (res) { x.id = res.id; x.no = res.no; x.srv = 1; SRV_TAX[x.id] = 1; if (S.tab === 'tax') vTax(); },
        function (e) { TAXB.rows = TAXB.rows.filter(function (y) { return y !== x; }); say('บันทึกรายการภาษีไม่สำเร็จ: ' + failMsg(e), 9000); if (S.tab === 'tax') vTax(); });
    });
    TAXB.rows.filter(function (x) { return x.srv === 1 && x.dirty && x.k === 'in'; }).forEach(function (x) { x.dirty = 0; call('taxTag', { id: x.id, form: x.form, fund: x.fund, cat: x.cat }).catch(function (e) { say('บันทึกการติ๊กภาษีไม่สำเร็จ: ' + failMsg(e), 8000); }); });
    if (TAXB.open !== TAX_OPEN) { TAX_OPEN = TAXB.open; call('taxOpen', { open: TAXB.open }).catch(function (e) { say('บันทึกยอดยกมาไม่สำเร็จ: ' + failMsg(e), 8000); }); }
  };

  /* ---------------------------------------------------------- สัญญายืมเงินที่ทำก่อนใช้ระบบ (การเงินคีย์เอง) */
  saveOldLoans = function () {
    var cur = {}; OLDLOANS.forEach(function (x) { cur[x.id] = 1; });
    Object.keys(SRV_OLD).forEach(function (id) { if (!cur[id]) { delete SRV_OLD[id]; call('loanOldDelete', { id: id }).catch(function (e) { say('ลบสัญญายืมเงินไม่สำเร็จ: ' + failMsg(e), 8000); }); } });
    OLDLOANS.forEach(function (x) {
      if (!x.srv) {
        x.srv = 2; var m = /^(\d+)\/(\d+)$/.exec(x.no); if (m && +m[2] === FY % 100) COUNTERS['สัญญายืมเงิน|' + FY] = Math.max(COUNTERS['สัญญายืมเงิน|' + FY] || 0, +m[1]);
        call('loanOldAdd', { no: x.no, title: x.title, who: x.who, fund: x.fund, paid: x.paid, d: x.d, st: x.st, closed: x.closed }).then(function (res) { x.id = res.id; x.due = res.due || x.due; x.srv = 1; x.dirty = 0; SRV_OLD[x.id] = x.st + '|' + (x.closed || ''); if (S.tab === 'loans') vLoans(); },
          function (e) { OLDLOANS = OLDLOANS.filter(function (y) { return y !== x; }); say('บันทึกสัญญายืมเงินไม่สำเร็จ: ' + failMsg(e), 9000); if (S.tab === 'loans') vLoans(); });
      } else if (x.srv === 1 && x.dirty) {
        x.dirty = 0; call('loanOldClose', { id: x.id, st: x.st, closed: x.closed }).then(function () { SRV_OLD[x.id] = x.st + '|' + (x.closed || ''); }, function (e) { say('บันทึกสถานะสัญญาไม่สำเร็จ: ' + failMsg(e), 9000); });
      }
    });
  };

  /* ---------------------------------------------------------- เจ้าหน้าที่พัสดุที่เพิ่มเอง */
  saveSup = function () { call('settingSave', { key: 'เจ้าหน้าที่พัสดุเพิ่มเติม', value: JSON.stringify(SUPPLY_X) }).catch(function (e) { say('บันทึกรายชื่อเจ้าหน้าที่พัสดุไม่สำเร็จ: ' + failMsg(e), 8000); }); };

  /* ---------------------------------------------------------- ข้อความที่แอดมินแก้ (บันทึกลงชีท) */
  var WORDSIG = '';
  function wordsObj() { var o = {}; Object.keys(DEF).forEach(function (k) { if (L[k] !== DEF[k]) o[k] = L[k]; }); return o; }
  function wordsSig() { return JSON.stringify(wordsObj()); }
  var WORDS_T = 0;
  function schedWords() { if (!TOKEN || !ME || !USERS[ME.id] || !USERS[ME.id].admin) return; clearTimeout(WORDS_T); WORDS_T = setTimeout(function () { var s = wordsSig(); if (s === WORDSIG) return; call('siteSave', { words: wordsObj() }).then(function () { WORDSIG = s; }, function (e) { say('บันทึกข้อความไม่สำเร็จ: ' + failMsg(e), 6000); }); }, 1500); }
  var SITESIG = '', SITE_T = 0;
  function siteSig() { return JSON.stringify(SITE, function (k, v) { return typeof v === 'string' && v.length > 3000 && v.slice(0, 5) === 'data:' ? (ATT.get(v) || '@@P') : v; }); }
  saveSite = function () { clearTimeout(SITE_T); SITE_T = setTimeout(pushSite, 1200); return true; };
  function pushSite() {
    if (!TOKEN || !ME || !USERS[ME.id] || !USERS[ME.id].admin) return;
    var ps = pending(SITE), up = Promise.resolve(); ps.forEach(function (u) { up = up.then(function () { return putAtt(u, 'site'); }); });
    up.then(function () {
      var sg = siteSig(); if (sg === SITESIG) return;
      var o = JSON.parse(sg); delete o.hero;
      return call('siteSave', { words: wordsObj(), site: o }).then(function () { SITESIG = sg; WORDSIG = wordsSig(); say('บันทึกการตั้งค่าหน้าเว็บแล้ว', 2500); });
    }).catch(function (e) { say('บันทึกการตั้งค่าหน้าเว็บไม่สำเร็จ: ' + failMsg(e), 8000); });
  }


  /* ---------------------------------------------------------- เปลี่ยน PIN (ไม่บังคับ ใครอยากเปลี่ยนก็กดเอง) */
  DEF.cp_old = 'PIN ปัจจุบัน'; L.cp_old = DEF.cp_old; DEF.cp_new = 'PIN ใหม่ 4 หลัก'; L.cp_new = DEF.cp_new;
  window.vChPin = function () {
    lgShell('<div class="eyebrow">' + esc(S.u.name) + '</div><h2>เปลี่ยน PIN</h2><p class="sub">ไม่บังคับ จะเปลี่ยนหรือไม่เปลี่ยนก็ได้ ตั้งเป็นเลข 4 หลักอะไรก็ได้</p>' +
      '<form id="cf" novalidate>' + pinBox('c0', 'cp_old') + pinBox('c1', 'cp_new') + pinBox('c2', 'sp_again') + '<div class="err" id="cErr"></div>' +
      '<button class="lgbtn">บันทึก PIN ใหม่</button></form><div class="lgrow"><button type="button" class="link" id="cCancel">ยกเลิก</button></div>');
    var clr = function () { $('cErr').textContent = ''; };
    bindPin('c0', function () { clr(); if ($('c0').value.length === 4) $('c1').focus(); });
    bindPin('c1', function () { clr(); if ($('c1').value.length === 4) $('c2').focus(); });
    bindPin('c2', clr);
    var done = function (msg) { S.chpin = false; S.view = 'home'; render(); window.scrollTo(0, 0); if (msg) say(msg); };
    $('cCancel').onclick = function () { done(); };
    $('c0').focus();
    $('cf').onsubmit = function (e) {
      e.preventDefault(); var o = $('c0').value, a = $('c1').value, b = $('c2').value;
      if (!/^\d{4}$/.test(o)) { $('cErr').textContent = 'กรอก PIN ปัจจุบัน 4 หลัก'; badPin('c0'); return; }
      if (!/^\d{4}$/.test(a)) { $('cErr').textContent = 'PIN ใหม่ต้องเป็นตัวเลข 4 หลัก'; badPin('c1'); return; }
      if (a !== b) { $('cErr').textContent = 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน'; badPin('c2'); return; }
      call('changePin', { oldPin: o, newPin: a }).then(function () { LASTPIN = a; done('เปลี่ยน PIN เรียบร้อย'); },
        function (e2) { $('cErr').textContent = failMsg(e2); badPin('c0'); });
    };
  };
  document.addEventListener('click', function (e) {
    var x = e.target.closest && e.target.closest('[data-chpin]');
    if (x && S.u) { S.chpin = true; S.view = 'login'; render(); window.scrollTo(0, 0); }
  });

  /* ---------------------------------------------------------- จัดการผู้ใช้ (แอดมิน) */
  var _vUsers = vUsers;
  vUsers = function () {
    _vUsers();
    var q2 = function (sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn); };
    var pinNote = function (name, pin) { var n = document.createElement('div'); n.className = 'note'; n.style.cssText = 'margin:10px 0;font-size:18px'; n.innerHTML = 'PIN เริ่มต้นของ <b>' + esc(name) + '</b> คือ <b class="num" style="font-size:24px">' + esc(pin) + '</b> แจ้งเจ้าตัวเท่านั้น (แสดงครั้งเดียว) ผู้ใช้เปลี่ยนเองได้ภายหลังจากปุ่ม เปลี่ยน PIN'; $('view').insertBefore(n, $('view').children[1] || null); };
    var rolesOf = function (role, admin) { var r = role === 'teacher' || role === 'director' ? [role] : [role, 'teacher']; if (admin) r.push('admin'); return r; };
    q2('[data-ureset]', function (b) { b.onclick = function () { var u = USERS[b.dataset.ureset]; call('usersResetPin', { id: u.id }).then(function (d) { u.pin = null; u.tempPin = d.pin; vUsers(); pinNote(u.name, d.pin); }, function (e) { say(failMsg(e), 6000); }); }; });
    q2('[data-uoff]', function (b) { b.onclick = function () { var u = USERS[b.dataset.uoff]; if (u.id === S.u.id) return toast('us_self'); call('usersUpsert', { user: { id: u.id, name: u.name, pos: u.pos, dept: u.dept, roles: rolesOf(u.role, u.admin), status: u.disabled ? 'ใช้งาน' : 'ปิดใช้งาน' } }).then(function () { u.disabled = !u.disabled; vUsers(); toast(u.disabled ? 't_us_off' : 't_us_on'); }, function (e) { say(failMsg(e), 6000); }); }; });
    q2('[data-udel]', function (b) { var old = b.onclick; b.onclick = function () { var k = b.dataset.udel; if (k === S.u.id) return toast('us_self'); if (userInUse(k)) return toast('us_cant_del'); if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = t('us_del_confirm'); setTimeout(function () { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = T('us_del'); } }, 4000); return; } var u = USERS[k]; call('usersUpsert', { user: { id: u.id, name: u.name, pos: u.pos, dept: u.dept, roles: rolesOf(u.role, u.admin), status: 'ลบแล้ว' } }).then(function () { delete USERS[k]; vUsers(); toast('t_us_del'); }, function (e) { say(failMsg(e), 6000); }); }; });
    var f = $('uf'); if (f) f.onsubmit = function (e) {
      e.preventDefault(); var name = $('uName').value.trim(); if (!name) { $('uErr').innerHTML = T('us_e_name'); $('uName').focus(); return; }
      var role = $('uRole').value, admin = $('uAdmin').checked, isNew = S.uedit === 'new', id = isNew ? 'u' + Date.now().toString(36) : S.uedit;
      if (!isNew && id === S.u.id) admin = USERS[id].admin;
      call('usersUpsert', { user: { id: id, name: name, pos: $('uPos').value.trim(), dept: $('uDept').value.trim(), roles: rolesOf(role, admin), status: 'ใช้งาน' } }).then(function (d) {
        return call('loadAll').then(function (all) { setUsers(all.users); S.uedit = null; vUsers(); if (d && d.pin) pinNote(name, d.pin); else toast('t_us_saved'); });
      }, function (e) { $('uErr').textContent = failMsg(e); });
    };
  };

  /* ---------------------------------------------------------- หน้า "รายการยกมา" (DATABASE เดิมที่ยังรอตัดยอด) */
  DEF.menu_carryin = 'รายการยกมา'; L.menu_carryin = 'รายการยกมา'; TABKEY.carryin = 'menu_carryin';
  TABS.plan = TABS.plan.concat(['carryin']);
  function carryForm() {
    var lab = 'display:flex;flex-direction:column;font-size:13px;gap:3px;white-space:nowrap', g = {}, opts = '';
    PROJECTS.forEach(function (pj) { g[pj.id] = ACTS.filter(function (a) { return a.project === pj.id; }); });
    PROJECTS.forEach(function (pj) { if (g[pj.id].length) opts += '<optgroup label="' + esc(pj.code + ' ' + pj.name) + '">' + g[pj.id].map(function (a) { return '<option value="' + a.id + '">' + esc(a.fund) + '</option>'; }).join('') + '</optgroup>'; });
    return '<section class="card" style="margin-top:16px"><h3 style="margin:0 0 4px">เพิ่มรายการเดิมที่ทำก่อนใช้ระบบ</h3><div class="muted small" style="margin-bottom:10px">ใช้คีย์เรื่องที่แผนออกชุดไว้ในโปรแกรมเดิมแล้ว (รอตัดยอดหรือตัดแล้ว) ยอดจะนับรวมในงบคงเหลือของกิจกรรมทันที และลงเป็นแถวใหม่ใน DATABASE เลขที่เว้นว่างได้ ระบบออกเลขถัดไปให้ ถ้าใส่เลขเอง เลขที่ระบบออกต่อไปจะนับต่อจากเลขนั้น</div>' +
      '<div id="cfErr" class="err small" style="margin-bottom:6px"></div><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">' +
      '<label style="' + lab + '">เลขที่ (DATABASE)<input id="cfNo" placeholder="ว่าง = เลขถัดไป" style="width:130px"></label>' +
      '<label style="' + lab + '">เลข ผง. 01- (ตามเลขบันทึกขอใช้งบ)<input id="cfB" placeholder="เช่น 1123" style="width:150px"></label>' +
      '<label style="' + lab + '">งาน<select id="cfC"><option>ขออนุมัติจัดซื้อ</option><option>ขออนุมัติจัดจ้าง</option><option>ขออนุมัติจัดจ้างวิทยากร</option><option>ขออนุมัติค่าเดินทางไปราชการ</option></select></label>' +
      '<label style="' + lab + ';flex:1 1 280px;min-width:0">โครงการ · งบ<select id="cfAct">' + opts + '</select></label>' +
      '<label style="' + lab + ';flex:1 1 240px;min-width:0">กิจกรรม<select id="cfAc"></select></label>' +
      '<label style="' + lab + '">วันที่ออกชุด<input id="cfD" type="date" value="' + new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) + '"></label>' +
      '<label style="' + lab + '">รวมเป็นเงิน<input id="cfAmt" type="number" min="0.01" step="0.01" style="width:130px"></label>' +
      '<label style="' + lab + '">เงินที่ใช้จริง (ตัดงบ)<input id="cfUsed" type="number" min="0" step="0.01" placeholder="ว่าง = รอตัดยอด" style="width:150px"></label>' +
      '<button type="button" class="primary" id="cfAdd">เพิ่มรายการ</button></div></section>';
  }
  function carryWire() {
    if (!$('cfAdd')) return;
    var fill = function () { var a = ACTS.filter(function (x) { return x.id === $('cfAct').value; })[0], pj = a && proj(a.project); $('cfAc').innerHTML = pj ? pj.acts.map(function (x) { return '<option value="' + x.no + '">กิจกรรมที่ ' + x.no + ' ' + esc(x.name) + '</option>'; }).join('') : ''; };
    fill(); $('cfAct').onchange = fill;
    $('cfAdd').onclick = function () {
      var err = function (m) { $('cfErr').textContent = m; }, a = ACTS.filter(function (x) { return x.id === $('cfAct').value; })[0]; if (!a) return err('เลือกโครงการและงบ');
      var pj = proj(a.project), amt = Math.round(Number($('cfAmt').value) * 100) / 100, usedS = $('cfUsed').value.trim(), used = usedS === '' ? null : Math.round(Number(usedS) * 100) / 100, d = $('cfD').value, no = $('cfNo').value.trim().replace(/\s/g, '');
      if (!(amt > 0)) return err('ใส่จำนวนเงินรวม'); if (used != null && !(used >= 0)) return err('เงินที่ใช้จริงไม่ถูกต้อง'); if (!d) return err('เลือกวันที่ออกชุด');
      var ac = pj.acts.filter(function (x) { return String(x.no) === $('cfAc').value; })[0] || pj.acts[0], dt = new Date(d + 'T00:00:00'), grp = (PLAN_SHORT[pj.plan] || '').replace(/\s*\(.*\)\s*$/, '');
      var row = { b: $('cfB').value.trim().replace(/^(\d{1,3}(,\d{3})+)$/, function (m) { return m.replace(/,/g, ''); }), c: $('cfC').value, d: String(pj.code).replace(/\./g, ''), e: grp, f: pj.name, g: amt, h: a.fund, i: 'ตรงตามแผน', j: 0, k: '-', l: 'กิจกรรมที่ ' + ac.no + ' ' + ac.name, m: '', n: dt.getDate() + ' ' + TH_M[dt.getMonth()] + ' พ.ศ. ' + (dt.getFullYear() + 543), o: used };
      $('cfAdd').disabled = true; err('');
      call('dbLegacyAdd', { no: no, row: row }).then(function (res) {
        (window.LEGACY_ROWS = window.LEGACY_ROWS || []).push({ keyed: 1, no: res.no, work: row.c, code: row.d, dept: row.e, proj: row.f, amt: amt, fund: row.h, lane: row.i, act: row.l, date: row.n, used: used });
        buildLegacy(window.LEGACY_ROWS); vCarryin(); say('เพิ่มรายการ ' + res.no + ' แล้ว ' + (used == null ? 'รอตัดยอด' : 'ตัดแล้ว'));
      }, function (e) { $('cfAdd').disabled = false; err(failMsg(e)); });
    };
  }
  window.vCarryin = function () {
    var rows = (window.LEGACY_ROWS || []), pend = rows.filter(function (x) { return x.used == null; }), un = window.LEGACY_UNMATCHED || [];
    var canCut = S.u && (S.u.role === 'plan' || S.u.admin);
    $('view').innerHTML = '<h2>รายการยกมาจากโปรแกรมเดิมของแผน</h2><p class="muted" style="margin:4px 0 14px">รายการใน DATABASE ที่นำเข้าจากโปรแกรมเดิม ยอดที่ตัดแล้วและที่รอตัดนับรวมในงบคงเหลือของแต่ละกิจกรรมให้แล้ว เมื่อเงินที่ใช้จริงออกมา ให้ใส่ยอดตัดงบที่นี่ (ลงคอลัมน์ O ของ DATABASE)</p>' +
      '<div class="stats" style="margin:0 0 14px"><div><small>รายการที่นำเข้า</small><b class="num">' + rows.length + '</b></div><div><small>รอตัดยอด</small><b class="num" style="color:var(--wait)">' + pend.length + '</b></div><div><small>จับคู่กับกิจกรรมไม่ได้</small><b class="num" style="color:' + (un.length ? 'var(--bad)' : 'var(--ok)') + '">' + un.length + '</b></div></div>' +
      '<div class="table"><table class="lntab" style="min-width:760px"><thead><tr><th>เลขที่</th><th>งาน</th><th>โครงการ</th><th>งบ</th><th class="n">รวมเป็นเงิน</th><th class="n">เงินที่ใช้จริง</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.slice().sort(function (a, b) { return (a.used == null ? 0 : 1) - (b.used == null ? 0 : 1); }).map(function (x) {
        return '<tr><td class="num">' + esc(x.no) + (x.keyed ? ' <span class="chip c-mute" style="font-size:11px">คีย์เอง</span>' : '') + '</td><td>' + esc(x.work) + '</td><td class="small">' + esc(x.code) + ' ' + esc(x.proj) + '</td><td class="small">' + esc(x.fund) + '</td><td class="n">' + baht(x.amt) + '</td>' +
          '<td class="n">' + (x.used != null ? baht(x.used) : (canCut ? '<input type="number" min="0" step="0.01" style="width:120px" data-cin="' + esc(x.no) + '" value="' + x.amt + '">' : '<span class="muted">รอตัดยอด</span>')) + '</td>' +
          '<td style="white-space:nowrap">' + (x.used == null && canCut ? '<button type="button" class="sm primary" data-cok="' + esc(x.no) + '">ตัดยอด</button> ' : '') + (x.keyed && canCut ? '<button type="button" class="sm" data-cdel="' + esc(x.no) + '">ลบ</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">ยังไม่มีรายการที่นำเข้า (นำเข้าได้จากเมนูในชีท: ระบบงบประมาณ > นำเข้า DATABASE ล่าสุด หรือคีย์เพิ่มในช่องด้านล่าง)</td></tr>') + '</tbody></table></div>' + (canCut ? carryForm() : '') +
      (un.length ? '<div class="note" style="margin-top:12px"><b>จับคู่กับกิจกรรมในระบบไม่ได้ ' + un.length + ' รายการ</b> (ยอดยังอยู่ใน DATABASE แต่ยังไม่นับในงบคงเหลือของหน้านี้): ' + un.map(function (x) { return esc(x.no); }).join(', ') + '</div>' : '');
    [].forEach.call(document.querySelectorAll('[data-cok]'), function (b) {
      b.onclick = function () { var no = b.dataset.cok, v = Number(document.querySelector('[data-cin="' + no + '"]').value); if (!(v >= 0)) return say('ใส่จำนวนเงินให้ถูกต้อง');
        b.disabled = true; call('dbSetUsed', { dbNo: no, used: v }).then(function () { rows.forEach(function (x) { if (x.no === no) x.used = v; }); buildLegacy(rows); vCarryin(); say('ตัดยอดแล้ว'); }, function (e) { b.disabled = false; say(failMsg(e), 7000); }); };
    });
    [].forEach.call(document.querySelectorAll('[data-cdel]'), function (b) { b.onclick = function () {
      if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'แน่ใจลบ?'; b.className = 'sm danger'; return; }
      b.disabled = true; call('dbLegacyDelete', { no: b.dataset.cdel }).then(function () { window.LEGACY_ROWS = (window.LEGACY_ROWS || []).filter(function (x) { return x.no !== b.dataset.cdel; }); buildLegacy(window.LEGACY_ROWS); vCarryin(); say('ลบรายการแล้ว'); }, function (e) { b.disabled = false; say(failMsg(e), 7000); }); }; });
    carryWire();
  };

  boot();
})();
