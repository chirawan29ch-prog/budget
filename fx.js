/* เอฟเฟกต์: ถังงบประมาณสีทอง (หน้าแรก) + ปุ่มบันทึกแบบน้ำทองไหลเติม */
(function () {
  if (window.__fxLoaded) return; window.__fxLoaded = true;
  var origDonut = window.donutHtml;
  if (typeof origDonut !== 'function') return;
  var st = document.createElement('style');
  st.textContent = [
    /* ถังน้ำ */
    '.tankw{position:relative;container-type:inline-size;width:min(470px,100%);max-width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}',
    '.dh2>*,.dring{min-width:0}',
    '.tankw svg{width:100%;height:100%;display:block;overflow:visible}',
    '.tankw .wat{transform:translateY(var(--y0));transition:transform 2.4s cubic-bezier(.25,.7,.25,1)}',
    '.tankw.go .wat{transform:translateY(var(--y1))}',
    '.tankw .wv1{animation:twv 4.2s linear infinite}.tankw .wv2{animation:twv 6.4s linear infinite reverse}',
    '@keyframes twv{from{transform:translateX(0)}to{transform:translateX(-120px)}}',
    '.tankw .tc b{font:800 clamp(34px,13.6cqw,64px)/1 Prompt,Sarabun,sans-serif;color:#fff;text-shadow:0 2px 10px rgba(5,20,70,.55)}',
    '.tankw .tc small{font-size:clamp(13px,3.7cqw,17px);color:#EAF1FF;margin-top:4px;text-shadow:0 1px 6px rgba(5,20,70,.6)}',
    '.tankw .tc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;text-align:center}',
    '.tankw .bub{animation:tbub 5s ease-in infinite;opacity:0}',
    '@keyframes tbub{0%{transform:translateY(0);opacity:0}15%{opacity:.7}100%{transform:translateY(-120px);opacity:0}}',
    /* ปุ่มน้ำไหล */
    'button.wfx{position:relative;overflow:hidden;isolation:isolate;border:0!important;outline:0!important}',
    'button.wfx .wfl{position:absolute;left:-1px;right:-1px;bottom:-12px;top:0;z-index:-1;transform:translateY(102%);pointer-events:none}',
    'button.wfx.run .wfl{transform:translateY(-6px);transition:transform var(--dur,2.2s) cubic-bezier(.42,.12,.38,1)}',
    'button.wfx .wfl i{position:absolute;left:0;right:-200px;top:-9px;height:12px;background-repeat:repeat-x;background-size:60px 12px;animation:wfx 1.5s linear infinite}',
    'button.wfx .wfl i.a{background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'12\' viewBox=\'0 0 60 12\'%3E%3Cpath d=\'M0 6 Q15 -1 30 6 T60 6 V12 H0Z\' fill=\'%23F5B83B\'/%3E%3C/svg%3E")}',
    'button.wfx .wfl i.b{top:-12px;opacity:.55;background-size:72px 12px;animation-duration:2.3s;animation-direction:reverse;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'72\' height=\'12\' viewBox=\'0 0 72 12\'%3E%3Cpath d=\'M0 6 Q18 -2 36 6 T72 6 V12 H0Z\' fill=\'%23FFE29A\'/%3E%3C/svg%3E")}',
    'button.wfx .wfl u{position:absolute;inset:2px 0 0;background:linear-gradient(180deg,#F5B83B,#E39A12);text-decoration:none}',
    '@keyframes wfx{from{transform:translateX(0)}to{transform:translateX(-60px)}}',
    'button.wfx .wtx{position:relative;text-shadow:0 1px 3px rgba(60,30,0,.5);display:inline-flex;align-items:center;gap:8px}',
    'button.wfx .wdots i{font-style:normal;display:inline-block;animation:lgDot 1.2s infinite}button.wfx .wdots i:nth-child(2){animation-delay:.2s}button.wfx .wdots i:nth-child(3){animation-delay:.4s}',
    'button.wfx.ok .wfl u,button.wfx.ok .wfl i.a{filter:hue-rotate(-60deg) saturate(1.2)}',
    '@keyframes lgDot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}',
    /* หน้าเข้าสู่ระบบแบบเดิม (ฝนเงิน) */
    /* แถบควบคุมพรีวิว */
    '@media (prefers-reduced-motion:reduce){.tankw .wv1,.tankw .wv2,.tankw .bub,button.wfx .wfl i{animation:none}}'
  ].join('\n');
  document.head.appendChild(st);

  /* ---------- ถังน้ำ ---------- */
  var tid = 0;
  function wavePath(w, amp, per, y) {
    var d = 'M0 ' + y, x; for (x = 0; x < w; x += per) d += ' q' + per / 4 + ' ' + (-amp) + ' ' + per / 2 + ' 0 t' + per / 2 + ' 0';
    return d + ' V400 H0Z';
  }
  function tankHtml(a, size, center) {
    var id = 'tk' + (++tid), gold = true;
    var pct = a.budget ? Math.max(0, Math.min(1, a.left / a.budget)) : 0;
    var X = 40, Y = 14, W = 220, H = 272, R = 30;
    var y1 = Y + H * (1 - pct), c1 = gold ? ['#FFD36B', '#E9A21B'] : ['#6FD0FF', '#2C7BFF'], c2 = gold ? ['#FFE9A8', '#F5BC45'] : ['#A6E6FF', '#5AA8FF'];
    var ticks = [0.25, 0.5, 0.75].map(function (t) {
      var yy = Y + H * (1 - t); return '<line x1="' + (X + W - 16) + '" x2="' + (X + W) + '" y1="' + yy + '" y2="' + yy + '" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round"/><text x="' + (X + W + 8) + '" y="' + (yy + 4) + '" font-size="11" fill="rgba(255,255,255,.75)">' + Math.round(t * 100) + '</text>';
    }).join('');
    var bub = [0, 1, 2, 3, 4].map(function (i) { return '<circle class="bub" cx="' + (X + 34 + i * 38) + '" cy="' + (Y + H - 20) + '" r="' + (3 + (i % 3)) + '" fill="#fff" style="animation-delay:' + (i * 0.9) + 's"/>'; }).join('');
    return '<div class="tankw" data-lvl="' + y1 + '"><svg viewBox="0 0 330 300" role="img" aria-label="' + esc(t('ds_donut')) + '">' +
      '<defs><clipPath id="' + id + 'c"><rect x="' + X + '" y="' + Y + '" width="' + W + '" height="' + H + '" rx="' + R + '"/></clipPath>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1[0] + '"/><stop offset="1" stop-color="' + c1[1] + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c2[0] + '"/><stop offset="1" stop-color="' + c2[1] + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs>' +
      '<rect x="' + X + '" y="' + Y + '" width="' + W + '" height="' + H + '" rx="' + R + '" fill="rgba(8,22,70,.35)"/>' +
      '<g clip-path="url(#' + id + 'c)"><g class="wat" style="--y0:' + (H + 30) + 'px;--y1:' + (y1 - Y) + 'px">' +
      '<g class="wv2" opacity=".6"><path d="' + wavePath(X + W + 240, 7, 120, Y - 4).replace('M0 ' + (Y - 4), 'M' + (X - 120) + ' ' + (Y - 4)) + '" fill="url(#' + id + 'b)"/></g>' +
      '<g class="wv1"><path d="' + wavePath(X + W + 240, 6, 120, Y).replace('M0 ' + Y, 'M' + (X - 120) + ' ' + Y) + '" fill="url(#' + id + 'a)"/></g>' +
      bub + '</g></g>' +
      '<rect x="' + (X + 8) + '" y="' + (Y + 10) + '" width="' + (W - 16) + '" height="' + (H - 20) + '" rx="' + (R - 6) + '" fill="url(#' + id + 'g)"/>' +
      '<rect x="' + X + '" y="' + Y + '" width="' + W + '" height="' + H + '" rx="' + R + '" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/>' +
      ticks + '</svg><div class="tc">' + center + '</div></div>';
  }
  window.donutHtml = function (s, size, stroke, center) {
    if (size >= 200 && window.S && S.view === 'home') return tankHtml(s, size, center);
    return origDonut.apply(this, arguments);
  };
  function arm() {
    [].forEach.call(document.querySelectorAll('.tankw:not(.go)'), function (el) {
      /* y1 เป็นค่าในแกน svg; ตั้ง CSS var ให้ตรงตำแหน่งระดับน้ำ (translateY ใน px ของ viewBox ผ่าน SVG transform) */
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('go'); }); });
    });
  }


  new MutationObserver(arm).observe(document.body, { childList: true, subtree: true });

  /* ---------- ปุ่มบันทึกแบบน้ำทองไหล ---------- */
  var SAVE_RE = /บันทึก|ส่งคำขอ|ส่งตรวจ|ส่งเรื่อง|ยืนยัน|^ส่ง/;
  function waterBtn(btn) {
    var html0 = btn.innerHTML, w0 = btn.offsetWidth, h0 = btn.offsetHeight, dur = 1.8;
    btn.style.width = (w0 + 2) + 'px'; btn.style.minHeight = (h0 + 2) + 'px'; btn.style.setProperty('--dur', dur + 's');
    btn.classList.add('wfx'); btn.style.pointerEvents = 'none'; btn.style.cursor = 'progress';
    btn.innerHTML = '<span class="wfl"><u></u><i class="b"></i><i class="a"></i></span><span class="wtx">กำลังบันทึก<span class="wdots"><i>.</i><i>.</i><i>.</i></span></span>';
    requestAnimationFrame(function () { requestAnimationFrame(function () { btn.classList.add('run'); }); });
    return function done(ok) {
      if (!document.body.contains(btn)) return;
      var restore = function () { btn.classList.remove('wfx', 'run', 'ok'); btn.style.width = ''; btn.style.minHeight = ''; btn.style.pointerEvents = ''; btn.style.cursor = ''; btn.innerHTML = html0; };
      if (!ok) return restore();
      btn.classList.add('ok');
      btn.querySelector('.wtx').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>บันทึกแล้ว';
      setTimeout(restore, 1100);
    };
  }
  /* กดแล้วเริ่มแอนิเมชันทันที รอให้เบราว์เซอร์วาดก่อน (80 มิลลิวินาที) แล้วจึงทำงานจริง ไม่หน่วงเวลาเพิ่ม */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('form button.primary');
    if (!b || b.dataset.fxgo || b.classList.contains('wfx') || b.disabled || document.getElementById('lf')) return;
    var form = b.form; if (!form || !SAVE_RE.test((b.textContent || '').trim())) return;
    if (form.checkValidity && !form.checkValidity()) return;
    e.preventDefault(); e.stopPropagation();
    var done = waterBtn(b);
    setTimeout(function () {
      b.dataset.fxgo = '1'; var errBefore = (form.querySelector('.err') || {}).textContent || '';
      try { b.click(); } catch (x) {}
      setTimeout(function () {
        if (!document.body.contains(b)) return;
        var err = form.querySelector('.err'); done(!(err && err.textContent.trim()));
        delete b.dataset.fxgo;
      }, 60);
    }, 80);
  }, true);
  arm();
})();
