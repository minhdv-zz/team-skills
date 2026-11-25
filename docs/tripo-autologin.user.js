// ==UserScript==
// @name         Team Tools: tự đăng nhập Tripo
// @namespace    https://minhdv-zz.github.io/team-skills/
// @version      2.9.10
// @updateURL    https://raw.githubusercontent.com/minhdv-zz/team-skills/main/docs/tripo-autologin.user.js
// @downloadURL  https://raw.githubusercontent.com/minhdv-zz/team-skills/main/docs/tripo-autologin.user.js
// @description  Bấm "Mở Tripo Studio" trong tab Tài khoản Tripo của Team Tools thì mở Tripo và tự điền email, mật khẩu, bấm Continue.
// @author       Team Tools
// @match        https://studio.tripo3d.ai/*
// @match        https://minhdv-zz.github.io/team-skills/*
// @run-at       document-start
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// ==/UserScript==
// Cách chạy: trang Team Tools gửi {e,p} qua sự kiện "team-tripo-login" (không đi qua URL). Script cất tạm trong bộ nhớ của
// tiện ích (GM_setValue, tối đa 3 phút), mở tab Tripo, tab đó đọc ra điền form rồi xóa ngay. Không có mật khẩu nào trong URL,
// lịch sử trình duyệt hay máy chủ. Có @updateURL: tiện ích tự kiểm tra bản mới trên GitHub của nhóm (bản cài từ 2.9.3 trở đi sẽ tự cập nhật).
(function () {
  'use strict';
  var host = location.hostname, KEY = 'tripoCred', EV = 'team-tripo-login', CKEY = 'tripoCredit', NKEY = 'tripoNames', LKEY = 'tripoLogoutAt', CEV = 'team-tripo-credit';
  var STUDIO = 'https://studio.tripo3d.ai/', TTL = 3 * 60 * 1000, FILL_WAIT = 8000, TOTAL = 120000, SETTLE_MS = 120, MAX_CLICKS = 3, RETRY_MS = 700, POLL_MS = 100;

  // ---------- Trên trang Team Tools ----------
  if (host === 'minhdv-zz.github.io') {
    var flag = function () { // ở document-start thẻ <html> có thể chưa tồn tại
      var r = document.documentElement;
      if (r) r.setAttribute('data-tripo-autologin', '2.9.10');   // trang Team Tools đọc số bản này để biết script có đủ mới không (bản cũ ghi '1')
      return !!r;
    };
    if (!flag()) { var iv = setInterval(function () { if (flag()) clearInterval(iv); }, 10); }
    try { // dọn thông tin cũ còn sót (ví dụ đóng tab Tripo giữa chừng)
      var old = JSON.parse(GM_getValue(KEY, '') || 'null');
      if (old && !(Date.now() - old.t < TTL)) GM_deleteValue(KEY);
    } catch (e) { GM_deleteValue(KEY); }
    // Số credit đọc được trên trang Tripo: chuyển sang trang Team Tools qua thuộc tính + sự kiện (trang tự lưu lên server).
    var pushCredit = function () {
      var raw = ''; try { raw = GM_getValue(CKEY, '') || ''; } catch (e) { return; }
      if (!raw) return;
      var v = null; try { v = JSON.parse(raw); } catch (e) { v = null; }
      if (!v || typeof v.e !== 'string' || !Number.isInteger(v.c) || !(Date.now() - v.t < 10 * 60 * 1000)) return;
      var put = function () {
        var r = document.documentElement; if (!r) return false;
        r.setAttribute('data-tripo-credit', JSON.stringify({ e: v.e, c: v.c, t: v.t }));
        document.dispatchEvent(new CustomEvent(CEV));
        return true;
      };
      if (!put()) { var iv2 = setInterval(function () { if (put()) clearInterval(iv2); }, 10); }
    };
    try { GM_addValueChangeListener(CKEY, function (n, o, nv, remote) { if (remote && nv) pushCredit(); }); } catch (e) { /* tiện ích cũ: bỏ qua */ }
    pushCredit();
    document.addEventListener(EV, function (ev) {
      var c; try { c = JSON.parse(String(ev.detail)); } catch (e) { return; }
      if (!c || typeof c.e !== 'string' || typeof c.p !== 'string' || !c.e || !c.p) return;
      GM_setValue(KEY, JSON.stringify({ e: c.e, p: c.p, t: Date.now() }));
      GM_openInTab(STUDIO, { active: true });
      setTimeout(function () { try { GM_deleteValue(KEY); } catch (e) { /* bỏ qua */ } }, TTL);   // không để lại quá 3 phút
      document.documentElement.setAttribute('data-tripo-ack', String(Date.now())); // báo trang là đã nhận
    }, true);
    return;
  }

  // ---------- Trên Tripo Studio ----------
  if (host !== 'studio.tripo3d.ai') return;

  // ---- Tự tắt hộp quảng cáo "Upgrade your plan" (gói trả phí, Black Friday...) ----
  // Tìm tiêu đề "Upgrade your plan", bấm nút X ở góc phải trên của hộp. Không thấy nút X thì gửi phím Esc, vẫn không được thì ẩn hộp đi.
  var planGuard = (function () {
    var tries = 0, lastAt = 0, seenAt = 0, TITLE_RE = /^upgrade your plan$/i;
    function vis(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
    function fire(el) {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (n) {
        try { el.dispatchEvent(new MouseEvent(n, { bubbles: true, cancelable: true, view: window })); } catch (e) { /* bỏ qua */ }
      });
    }
    function findTitle() {
      var els = document.querySelectorAll('h1,h2,h3,h4,div,span,p'), hit = null;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.children.length > 1) continue;
        if (!TITLE_RE.test((el.textContent || '').trim())) continue;
        if (vis(el) && (!hit || hit.contains(el))) hit = el;   // lấy phần tử sâu nhất (chính tiêu đề, không phải khối bọc ngoài)
      }
      return hit;
    }
    function findClose(title) {
      for (var a = title.parentElement, k = 0; a && k < 10; a = a.parentElement, k++) {
        var ar = a.getBoundingClientRect(); if (ar.width < 300) continue;
        var cs = a.querySelectorAll('button,[role=button],[aria-label],[class*=close],[class*=Close],svg,i,span,div'), best = null;
        for (var j = 0; j < cs.length; j++) {
          var c = cs[j], r = c.getBoundingClientRect();
          if (!(r.width >= 14 && r.width <= 60 && r.height >= 14 && r.height <= 60)) continue;
          if (!(r.left > ar.right - 100 && r.top >= ar.top - 6 && r.top < ar.top + 110)) continue;
          if ((c.textContent || '').trim().length > 2) continue;
          if (!best || r.left > best.getBoundingClientRect().left) best = c;
        }
        if (best) return best.closest('button,[role=button]') || best;
      }
      return null;
    }
    function hideModal(title) {
      for (var a = title.parentElement; a && a !== document.body; a = a.parentElement) {
        var st = getComputedStyle(a), r = a.getBoundingClientRect();
        if ((st.position === 'fixed' || st.position === 'absolute') && r.width > window.innerWidth * 0.5 && r.height > 200) { a.style.display = 'none'; try { document.body.style.overflow = ''; } catch (e) { /* bỏ qua */ } return true; }
      }
      return false;
    }
    function tick() {
      if (!document.body || document.body.textContent.indexOf('Upgrade your plan') < 0) { tries = 0; return; }   // kiểm tra rẻ trước, không đụng layout
      var now = Date.now(); if (now - lastAt < 400) return; lastAt = now;
      var t = findTitle(); if (!t) { tries = 0; return; }
      tries++;
      if (tries <= 2) { var x = findClose(t); if (x) { fire(x); return; } }
      if (tries <= 4) { ['keydown', 'keyup'].forEach(function (n) { try { document.dispatchEvent(new KeyboardEvent(n, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })); } catch (e) { /* bỏ qua */ } }); return; }
      if (hideModal(t)) tries = 0;
    }
    setInterval(tick, 300);
    return { tick: tick, open: function () { return !!document.body && document.body.textContent.indexOf('Upgrade your plan') >= 0 && !!findTitle(); } };
  })();
  // Trước khi đăng nhập / đăng xuất: nếu hộp gói còn mở thì đóng nó trước và chờ, không bấm gì khác (hộp che mất menu tài khoản).
  function blockerOpen() { if (planGuard.open()) { planGuard.tick(); return true; } return false; }
  function readCred() {
    var c = null;
    try { c = JSON.parse(GM_getValue(KEY, '') || 'null'); } catch (e) { c = null; }
    if (c && (typeof c.e !== 'string' || typeof c.p !== 'string' || !(Date.now() - c.t < TTL))) { GM_deleteValue(KEY); return null; }
    return c;
  }
  var cred = readCred();
  if (!cred) {   // có thể tab mở trước khi lưu xong: thử lại trong ~2 giây rồi bỏ
    var tries = 0, wait = setInterval(function () {
      cred = readCred();
      if (cred) { clearInterval(wait); begin(false); } else if (++tries >= 8) { clearInterval(wait); begin(true); }
    }, 250);
    return;
  }
  begin(false);

  // passive = true: không có thông tin đăng nhập (người dùng tự mở Tripo). Không đăng nhập gì cả, chỉ theo dõi credit nếu nhận ra tài khoản.
  function begin(passive) {

  if (passive) cred = { e: '', p: '' };
  var acctEmail = cred.e, lastGreet = 0;
  var started = Date.now(), fillAt = 0, settledAt = 0, clicks3 = 0, lastClickAt = 0, typed = { e: 0, p: 0 }, done = false, clicks = { use: 0, login: 0 }, lastClick = {};

  function txt(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function click(el) { // một số giao diện nghe pointer/mouse chứ không nghe click: bắn đủ chuỗi rồi click
    var t = el.closest('button,a,[role=button]') || el;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (n) {
      try { t.dispatchEvent(new MouseEvent(n, { bubbles: true, cancelable: true, view: window })); } catch (e) { /* bỏ qua */ }
    });
    t.click();
  }

  // Ô báo trạng thái ở góc trái trên cùng trang Tripo, đồng thời ghi vào Console. Giúp biết script đang dừng ở bước nào.
  var badge = null, lastMsg = '';
  function say(msg, keepMs) {
    if (msg === lastMsg && !keepMs) return;   // cùng một thông báo thì không ghi lại (tránh nhấp nháy và tránh kích hoạt vòng lặp)
    lastMsg = msg;
    try { console.log('[Team Tools +' + ((Date.now() - started) / 1000).toFixed(1) + 's] ' + msg); } catch (e) { /* bỏ qua */ }
    var root = document.documentElement; if (!root) return;
    if (!badge || !badge.isConnected) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;background:#1c1640;color:#fff;border:1px solid #7c5cff;border-radius:8px;padding:6px 10px;font:12px/1.4 system-ui,sans-serif;max-width:340px;pointer-events:none';
      root.appendChild(badge);
    }
    badge.textContent = 'Team Tools (+' + ((Date.now() - started) / 1000).toFixed(1) + 's): ' + msg;
    if (keepMs) setTimeout(function () { if (badge && badge.parentNode) badge.parentNode.removeChild(badge); }, keepMs);
  }
  function disabled(el) {
    var x = el.closest('button,[role=button]') || el;
    return !!x.disabled || x.getAttribute('aria-disabled') === 'true' || /(^|\s)(is-|ant-btn-)?disabled(\s|$)/i.test(x.className || '');
  }
  // Tìm phần tử hiển thị có chữ khớp hoàn toàn, lấy phần tử sâu nhất, chỉ trong phạm vi scope.
  function findText(re, scope) {
    var els = (scope || document).querySelectorAll('button,a,[role=button],div,span,p'), hit = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var t = txt(el);
      if (t.length > 30 || !re.test(t)) continue;
      if (hit && !hit.contains(el)) continue;
      hit = el;
    }
    return hit;
  }
  function findInput(type, re) {
    var els = document.querySelectorAll('input');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el) || el.disabled) continue;
      if (el.type === type || re.test(el.placeholder || '') || re.test(el.name || '') || re.test(el.id || '')) return el;
    }
    return null;
  }
  function nativeSet(input, v) { // cách dự phòng: setter gốc rồi bắn sự kiện (ô nhập của React)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Giả lập gõ thật: bấm vào ô, chọn hết, chèn chữ bằng lệnh của trình duyệt (sinh đúng chuỗi sự kiện như người gõ),
  // rồi rời ô để form kiểm tra. Không được thì dùng cách dự phòng.
  function setVal(input, v) {
    try {
      input.focus();
      input.select();
      if (document.execCommand('insertText', false, v) && input.value === v) { input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); return; }
    } catch (e) { /* dùng cách dự phòng */ }
    nativeSet(input, v);
    try { input.blur(); } catch (e) { /* bỏ qua */ }
  }
  function clickLimited(key, el) { // mỗi nút bấm tối đa 3 lần, cách nhau 2,5 giây
    var now = Date.now();
    if (clicks[key] >= 3 || (lastClick[key] && now - lastClick[key] < 1200)) return false;
    clicks[key]++; lastClick[key] = now; click(el); return true;
  }
  // Đọc số credit ở góc phải trên của Tripo (dạng "⚡ 45 [Upgrade]"): tìm nút Upgrade, rồi lấy khối nhỏ nhất bao quanh mà chữ chỉ gồm
  // "<số> Upgrade". Không khớp đúng dạng đó thì trả null (không đoán), để không bao giờ gửi một số không phải credit.
  function findUpgrade() {   // chỉ xét phần tử lá (không có con) và đọc textContent, không ép tính bố cục như innerText
    var els = document.querySelectorAll('button,a,[role=button],span,div,p'), hit = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length || el.textContent.length > 12 || !/^\s*upgrade\s*$/i.test(el.textContent)) continue;
      if (visible(el)) { hit = el; break; }
    }
    return hit;
  }
  function readCreditEn() {
    var up = findUpgrade();
    for (var n = up && up.parentElement, k = 0; n && k < 5; n = n.parentElement, k++) {
      var t = txt(n);
      if (t.length > 40) break;
      var m = /^[^\d\s]{0,3}\s*(\d[\d,]*)\s*[^\d]{0,30}?\s*upgrade$/.exec(t);   // cho phép nhãn khuyến mãi chen giữa (\"2840 Black Friday Upgrade\")
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    }
    // Trên Tripo thật số credit và nút Upgrade là hai khối đứng cạnh nhau: lấy khối liền trước nút Upgrade, chỉ nhận khi chữ của nó là một số.
    for (var q = up, j = 0; q && j < 4; q = q.parentElement, j++) {
      var pv = q.previousElementSibling;
      if (!pv) continue;
      var pm = /^[^\d\s]{0,3}\s*(\d[\d,]*)$/.exec(txt(pv));
      if (pm && visible(pv)) return parseInt(pm[1].replace(/,/g, ''), 10);
      break;   // khối liền trước không phải số thì thôi, không nhảy sang khối xa hơn
    }
    return null;
  }
  // Cách không phụ thuộc ngôn ngữ (trang /zh, hoặc trình duyệt tự dịch nút "Upgrade" thành "nâng cấp"/"升级"): ở thanh trên cùng, tìm ô chữ
  // chỉ gồm một số, mà ngay sau nó (cùng hàng) là một nút/khối có chữ cái (nút nâng cấp). Chuông thông báo (huy hiệu số) không có khối chữ theo sau
  // nên không bị lẫn. Có nhiều số khác nhau khớp thì trả null (không đoán).
  // Tên trong lời chào đầu trang ("Hi, tripo-referral-landing-page-024!", cả bản /zh hay bị dịch) KHÔNG trùng email, nên script tự nhớ
  // "tên trong lời chào -> email" mỗi lần chính nó đăng nhập (hoặc xác nhận được tài khoản). Sau này tab Tripo nào hiện đúng tên đã nhớ thì
  // biết chắc là tài khoản nào, không cần đăng nhập lại vẫn cập nhật credit. Tên lạ (chưa nhớ) thì không gửi gì.
  function readGreetName() {
    var hs = document.querySelectorAll('h1,h2');
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i]; if (!visible(h)) continue;
      var m = /^\s*(?:hi,?\s+|你好[，,]\s*|xin chào,?\s+)?([^\s!！,，]{3,80})[!！]/i.exec((h.innerText || h.textContent || '').trim());
      if (m) return m[1].toLowerCase();
    }
    return null;
  }
  function nameMap() { try { var m = JSON.parse(GM_getValue(NKEY, '') || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } }
  function rememberName(email) {
    var n = readGreetName(); if (!n || !email) return;
    var m = nameMap(); if (m[n] === email) return;
    m[n] = email; try { GM_setValue(NKEY, JSON.stringify(m)); } catch (e) { /* bỏ qua */ }
  }
  function readCreditLoose() {
    var els = document.querySelectorAll('span,div,p,b,strong,font'), vals = {}, n = 0, val = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i], t = el.textContent;
      if (t.length > 10 || !/^\s*\d[\d,]{0,8}\s*$/.test(t)) continue;
      if (el.children.length && el.firstElementChild.textContent.trim() !== t.trim()) continue;   // lấy phần tử sâu nhất chứa đúng số đó
      var r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && r.height < 60 && r.top >= 0 && r.top < 140)) continue;
      var ok = false;
      for (var q = el, k = 0; q && k < 3 && !ok; q = q.parentElement, k++) {
        for (var nx = q.nextElementSibling, j = 0; nx && j < 2 && !ok; nx = nx.nextElementSibling, j++) {
          var nt = (nx.textContent || '').trim(), nr = nx.getBoundingClientRect();
          if (nt.length >= 2 && nt.length <= 30 && /\p{L}/u.test(nt) && nr.width > 0 && Math.abs(nr.top - r.top) < 40) ok = true;
        }
      }
      if (!ok) continue;
      var v = parseInt(t.replace(/[,\s]/g, ''), 10);
      if (!vals[v]) { vals[v] = 1; n++; val = v; }
    }
    return n === 1 ? val : null;
  }
  function readCredit() { var v = readCreditEn(); return v !== null ? v : readCreditLoose(); }
  // Sau khi đăng nhập: đọc credit rồi theo dõi liên tục (mỗi 1,5 giây khi đã có số) để số luôn đúng với tài khoản đang dùng (tạo ảnh bị trừ thì số đổi theo).
  // Dừng ngay khi không còn thấy số (đăng xuất hoặc đổi giao diện), để không ghi nhầm số của tài khoản khác vào email này.
  // Chẩn đoán: liệt kê các ô chữ ngắn ở thanh trên cùng (nơi có số credit) để biết vì sao không đọc được.
  function creditDiag() {
    var out = [], els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length && out.length < 14; i++) {
      var el = els[i], r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.top < 110)) continue;
      if (el.children.length) continue;
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 24) continue;
      out.push(Math.round(r.left) + ':' + t);
    }
    return 'KHÔNG đọc được credit. Cửa sổ rộng ' + window.innerWidth + 'px. Chữ thấy ở thanh trên (x:chữ): ' + (out.join(' | ') || '(không có)');
  }
  function watchCredit(email) {
    var t0 = Date.now(), cand = null, candAt = 0, sent = null, goneAt = 0, last = 0, diagShown = false;
    var iv = setInterval(function () {
      var now = Date.now();
      if (now - t0 < 3000) return;   // chờ giao diện đổi sang tài khoản mới (tránh số cũ hoặc số tạm lúc vừa đăng nhập)
      if (sent !== null && now - last < 1500) return;   // đã có số thì kiểm tra thưa hơn cho nhẹ trang
      last = now;
      var v = readCredit();
      if (v === null) {
        if (sent === null && !diagShown && now - t0 > 8000) { diagShown = true; say(creditDiag(), 90000); }   // 8 giây mà vẫn không đọc được: hiện những gì script thấy ở thanh trên để sửa cho đúng
        if (sent === null) { if (now - t0 > 45000) clearInterval(iv); return; }   // chưa gửi lần nào: chờ tối đa 45 giây
        if (!goneAt) goneAt = now;
        if (now - goneAt > 1500) clearInterval(iv);   // đã gửi rồi mà số biến mất: coi như đã đăng xuất, dừng
        return;
      }
      goneAt = 0;
      if (v === sent) { cand = null; return; }
      if (v !== cand) { cand = v; candAt = now; return; }   // số mới: phải giữ nguyên thêm 0,7 giây (loại số tạm lúc đang tải)
      if (now - candAt < 1000) return;
      if (!passive) rememberName(email);   // số đã ổn định và chắc chắn là tài khoản này (vừa đăng nhập / đã xác nhận): nhớ tên trong lời chào
      try { GM_setValue(CKEY, JSON.stringify({ e: email, c: v, t: now })); sent = v; cand = null; say('credit còn ' + v + ', đã gửi cho Team Tools.', 4000); } catch (e) { /* bỏ qua */ }
    }, 400);
  }
  // ---- Đăng xuất khi trình duyệt đang ở tài khoản khác ----
  // Chưa có ảnh menu đăng xuất thật của Tripo nên dò theo cách chung: bấm lần lượt các ảnh đại diện ở góc phải trên, thấy mục có chữ
  // đăng xuất (nhiều ngôn ngữ) thì bấm, thấy hộp xác nhận thì bấm xác nhận. Mỗi bước đều báo ở ô góc trái để biết dừng ở đâu.
  var LOGOUT_RE = /^(log\s*out|sign\s*out|logout|đăng xuất|退出登录|退出|登出|注销)$/, CONFIRM_RE = /^(confirm|ok|yes|sure|log\s*out|sign\s*out|xác nhận|đồng ý|đăng xuất|确认|确定|是|退出登录|退出)$/;
  var lo = { on: false, t0: 0, openAt: 0, idx: 0, clickedAt: 0, cands: null, startUrl: '', backAt: 0 };
  function pageUrl() { return location.href.split('#')[0]; }
  function avatarCandidates() {
    var out = [], els = document.querySelectorAll('img,div,span,button,a'), upEl = findUpgrade();
    for (var i = 0; i < els.length; i++) {
      var el = els[i], r = el.getBoundingClientRect();
      if (!(r.width >= 20 && r.width <= 64 && r.height >= 20 && r.height <= 64 && r.top >= 0 && r.top < 100 && r.left > window.innerWidth * 0.55)) continue;
      var isImg = el.tagName === 'IMG', bg = !isImg && /url\(/.test(getComputedStyle(el).backgroundImage || '');
      if (!isImg && !bg) continue;
      if (upEl) { var ur = upEl.getBoundingClientRect(); if (Math.abs(r.top - ur.top) < 50 && r.left > ur.left - 150 && r.left < ur.right + 4) continue; }   // biểu tượng ngay trong khối credit / Upgrade: bấm vào sẽ mở hộp chọn gói, che mất menu tài khoản
      var wrap = el.closest('button,a,[role=button]') || el.parentElement;
      var hasText = !!((el.textContent || '').trim() || (wrap && (wrap.textContent || '').trim()));   // ảnh đi kèm chữ (huy hiệu "Lv.1") để xếp sau, thử cuối cùng
      var t = el.closest('button,a,[role=button]') || el;
      var ln = el.closest('a[href]'), nav = !!ln && !/^(#.*)?$/.test(ln.getAttribute('href') || '#');   // ảnh nằm trong liên kết sang trang khác (huy hiệu Lv...): bấm vào sẽ chuyển trang, xếp cuối
      if (out.indexOf(t) < 0) { t._txt = hasText || nav; out.push(t); }
    }
    var rounds = out.filter(function (e) { var br = getComputedStyle(e.querySelector('img') || e).borderRadius || '', w = e.getBoundingClientRect().width; return /%/.test(br) ? parseFloat(br) >= 40 : parseFloat(br) >= w / 2 - 2; });
    if (rounds.length) out = rounds;   // có ảnh tròn (ảnh đại diện) thì chỉ thử các ảnh tròn, khỏi bấm nhầm biểu tượng khác
    out.sort(function (a, b) {   // ảnh trơn trước (phải sang trái); ảnh có chữ đi kèm thì sau (trái sang phải, ảnh đại diện nằm trước huy hiệu)
      if (a._txt !== b._txt) return a._txt ? 1 : -1;
      var d = b.getBoundingClientRect().left - a.getBoundingClientRect().left; return a._txt ? -d : d;
    });
    return out;
  }
  // Có đang đăng nhập không? Không dựa riêng vào số credit (nếu không đọc được số thì trước đây script tưởng chưa đăng nhập và đứng chờ ở "đang tìm nút đăng nhập").
  var LOGIN_RE = /^(sign\s*up\s*\/?\s*)?log\s*in$/;
  function looksLoggedIn() {
    if (readCredit() !== null) return true;
    if (readGreetName() !== null && !findText(LOGIN_RE)) return true;   // lời chào chỉ tính khi không có nút đăng nhập (trang chưa đăng nhập cũng có thể có tiêu đề kiểu "Welcome!")
    return Date.now() - started > 1200 && !findText(LOGIN_RE) && avatarCandidates().length > 0;   // không có nút đăng nhập mà có ảnh đại diện ở góc phải trên
  }
  function logoutStep() {   // trả về 'doing' | 'gone' (đã đăng xuất) | 'fail'
    var now = Date.now();
    if (blockerOpen()) { lo.openAt = now; if (lo.on) lo.t0 += 0; return 'doing'; }   // hộp gói đang che: đóng xong mới tiếp tục (không tính vào 20 giây của đăng xuất)
    if (!lo.on) { lo.on = true; lo.t0 = now; lo.startUrl = pageUrl(); }
    if (!looksLoggedIn() && !findText(LOGOUT_RE)) { return 'gone'; }
    if (now - lo.t0 > 20000) return 'fail';
    if (pageUrl() !== lo.startUrl) {   // lỡ bấm trúng thứ chuyển sang trang khác (ví dụ trang Creator Growth): quay lại đúng 1 lần mỗi 2 giây, không bấm gì thêm
      if (now - lo.backAt > 2000) { lo.backAt = now; lo.openAt = now; say('lỡ vào trang khác, quay lại…'); try { history.back(); } catch (e) { /* bỏ qua */ } }
      return 'doing';
    }
    if (lo.clickedAt && now - lo.clickedAt > 500) {   // vừa bấm đăng xuất: nếu hiện hộp xác nhận thì bấm
      var cf = findText(CONFIRM_RE);
      if (cf && clickLimited('logoutok', cf)) { say('xác nhận đăng xuất…'); lo.clickedAt = now; return 'doing'; }
    }
    var item = findText(LOGOUT_RE);
    if (item) { if (clickLimited('logout', item)) { say('bấm "đăng xuất"…'); lo.clickedAt = now; } return 'doing'; }
    if (lo.clickedAt) return 'doing';   // đã bấm đăng xuất, chờ trang đổi
    if (now - lo.openAt > 1800) {   // chưa thấy mục đăng xuất sau 1,8 giây: thử ảnh đại diện kế tiếp (mỗi ảnh chỉ thử 1 lần, hết lượt thì dừng, không bấm đi bấm lại)
      if (!lo.cands || !lo.cands.length) { lo.cands = avatarCandidates(); lo.idx = 0; }
      if (lo.cands.length && lo.idx >= lo.cands.length) return 'fail';
      var c = lo.cands[lo.idx++];
      lo.openAt = now;
      if (c) {
        say('mở menu tài khoản để đăng xuất…');
        try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* bỏ qua */ }   // trang rộng hơn cửa sổ: kéo ngang cho ảnh đại diện lọt vào màn hình
        click(c);
      } else say('đang tìm ảnh đại diện để đăng xuất…');
    }
    return 'doing';
  }
  function finish(msg, keepMs) { done = true; cred = null; try { GM_deleteValue(KEY); } catch (e) { /* bỏ qua */ } if (msg) say(msg, keepMs); return true; }

  function pressContinue(pw) {   // chỉ nhận nút Continue nằm cùng khối với ô mật khẩu (tổ tiên gần nhất có chứa nút)
    var b = null;
    for (var n = pw.parentElement, k = 0; n && k < 8 && !b; n = n.parentElement, k++) b = findText(/^continue$/, n);
    if (!b || disabled(b)) return false;
    click(b); clicks3++; lastClickAt = Date.now();
    if (clicks3 === 1) { try { GM_deleteValue(KEY); } catch (e) { /* bỏ qua */ } }   // xóa khỏi bộ nhớ tiện ích ngay sau lần bấm đầu, bản trong trang giữ lại để bấm lại nếu cần
    say('đã bấm Continue (lần ' + clicks3 + ')…');
    return true;   // đã bấm; chưa kết thúc, còn theo dõi kết quả
  }

  function step() {
    if (done) return true;
    if (blockerOpen()) { say('đang đóng hộp quảng cáo gói trước…'); return false; }
    if (Date.now() - started > TOTAL) return finish('Không thấy form đăng nhập sau 2 phút. Bạn đăng nhập tay nhé.', 20000);
    var pw = findInput('password', /password/i), em = findInput('email', /e-?mail/i);
    if (pw && em && pw !== em) {
      if (!fillAt) { fillAt = Date.now(); say('đang điền email và mật khẩu…'); }
      // điền lại nếu trang xóa mất, nhưng tối đa 3 lần mỗi ô để không giành con trỏ của bạn nếu trang cứ đổi chữ
      if (em.value !== cred.e && typed.e < 3) { typed.e++; setVal(em, cred.e); if (em.value !== cred.e) say('ô email bị trang đổi chữ (' + em.value.length + '/' + cred.e.length + ' ký tự).'); }
      if (pw.value !== cred.p && typed.p < 3) { typed.p++; setVal(pw, cred.p); }
      var okE = em.value === cred.e, okP = pw.value === cred.p;
      if (!okE || !okP) {   // chỉ bấm Continue khi cả hai ô đã đúng chữ; trang cứ đổi chữ sau 3 lần gõ thì dừng, không gửi sai
        if ((!okE && typed.e >= 3) || (!okP && typed.p >= 3))
          return finish('Tripo không nhận đủ email hoặc mật khẩu (email ' + em.value.length + '/' + cred.e.length + ' ký tự). Bạn nhập tay nhé.', 30000);
        return false;
      }
      var now = Date.now();
      if (!settledAt) settledAt = now;
      if (clicks3 > 0) {   // đã bấm Continue: chờ Tripo xử lý; chỉ bấm lại khi Tripo báo lỗi định dạng email (do bấm quá sớm)
        if (now - lastClickAt < RETRY_MS) return false;
        var emailErr = (document.body.innerText || '').toLowerCase().indexOf('valid email') >= 0;
        if (emailErr && clicks3 < MAX_CLICKS) { pressContinue(pw); return false; }
        if (now - lastClickAt > 10000) return finish('đã bấm Continue nhưng form vẫn còn. Nếu chưa đăng nhập được, bạn bấm lại Continue nhé.', 30000);
        return false;
      }
      if (now - settledAt < SETTLE_MS) return false;   // chờ form kịp ghi nhận chữ vừa gõ rồi mới bấm
      if (!pressContinue(pw) && now - fillAt > FILL_WAIT) return finish('đã điền xong nhưng chưa bấm được Continue (có thể đang chờ ô xác minh). Bạn tự bấm Continue nhé.', 30000);   // để form đã điền, bạn tự bấm
      return false;
    }
    if (clicks3 > 0) { watchCredit(acctEmail); return finish('đã đăng nhập (form đã đóng).', 6000); }
    // Tripo đang đăng nhập sẵn:
    //  - đúng tài khoản cần (lời chào "Hi, <tên trước @>!" hoặc tên đã nhớ trỏ về email này): đọc credit, không đăng nhập lại;
    //  - tài khoản khác (hoặc không xác nhận được): ĐĂNG XUẤT rồi đăng nhập lại bằng tài khoản của nhóm. Đăng nhập lại luôn đúng ý muốn nên
    //    không xác nhận được cũng không sao. Để không lặp vô hạn, mỗi email chỉ tự đăng xuất 1 lần trong 3 phút.
    if (lo.on) {
      var rs = logoutStep();
      if (rs === 'fail') return finish('không tự đăng xuất được (script chưa tìm thấy nút đăng xuất của Tripo). Bạn đăng xuất Tripo bằng tay rồi bấm "Mở Tripo Studio" lại nhé.', 30000);
      if (rs === 'gone') { lo.on = false; lo.gone = true; say('đã đăng xuất, đăng nhập tài khoản ' + acctEmail + '…'); }
      else return false;
    }
    if (!lo.gone && Date.now() - lastGreet > 500) {
      lastGreet = Date.now();
      var low = (document.body && document.body.innerText || '').toLowerCase(), gname = readGreetName(), mapped = gname && nameMap()[gname];
      if (low.indexOf('hi, ' + acctEmail.split('@')[0].toLowerCase() + '!') >= 0 || (gname && gname === acctEmail.split('@')[0].toLowerCase()) || mapped === acctEmail) { watchCredit(acctEmail); return finish('đã đăng nhập sẵn tài khoản này.', 6000); }
      if (looksLoggedIn()) {
        // Chống lặp vô hạn: tính theo TỪNG TAB Tripo (sessionStorage), không dùng bộ nhớ chung nữa. Bản cũ nhớ chung 3 phút nên lần bấm Đăng nhập
        // thứ hai (dù lần đầu chưa đăng xuất được) bị chặn oan. Mỗi tab mới được thử đăng xuất tối đa 2 lần (reload sau đăng xuất vẫn báo đăng nhập sẵn thì dừng).
        var prev = null; try { prev = JSON.parse(sessionStorage.getItem(LKEY) || 'null'); } catch (e) { prev = null; }
        var cnt = prev && prev.e === acctEmail && Date.now() - prev.t < 3 * 60 * 1000 ? prev.n : 0;
        if (cnt >= 2) return finish('đã thử đăng xuất 2 lần mà Tripo vẫn báo đăng nhập sẵn, nên script dừng để khỏi lặp. Bạn đăng xuất Tripo bằng tay (ảnh đại diện góc phải trên → Logout) rồi bấm Đăng nhập lại nhé.', 30000);
        try { sessionStorage.setItem(LKEY, JSON.stringify({ e: acctEmail, t: Date.now(), n: cnt + 1 })); } catch (e) { /* bỏ qua */ }
        say('đang đăng nhập tài khoản khác' + (gname ? ' (' + gname + ')' : '') + ', đăng xuất để vào ' + acctEmail + '…');
        logoutStep();
        return false;
      }
    }
    if (Date.now() - started < 2000) { say('đang kiểm tra đã đăng nhập chưa…'); return false; }   // trang mới tải có thể chưa hiện trạng thái đăng nhập: chờ chút rồi mới bấm nút đăng nhập
    var up = findText(/^use password$/);
    if (up) { if (clickLimited('use', up)) say('bấm "Use Password"…'); return false; }
    if (!findInput('email', /e-?mail/i)) {   // chưa có form nào mới bấm nút đăng nhập ở đầu trang
      var lg = findText(/^(sign\s*up\s*\/?\s*)?log\s*in$/);
      if (lg) { if (clickLimited('login', lg)) say('bấm nút đăng nhập…'); }
      else say('đang tìm nút đăng nhập…');
    }
    return false;
  }

  if (passive) {   // chờ lời chào hiện ra, tra tên đã nhớ; có thì theo dõi credit, không thì thôi (tối đa 60 giây)
    var pt0 = Date.now(), piv = setInterval(function () {
      if (Date.now() - pt0 > 60000) { clearInterval(piv); return; }
      var n = readGreetName(), em = n && nameMap()[n];
      if (!em) return;
      clearInterval(piv); watchCredit(em);
    }, 700);
    return;
  }
  say('nhận được thông tin đăng nhập, đang tìm nút đăng nhập…');
  // Chạy lại ngay khi trang thay đổi (không đợi nhịp kiểm tra); nhịp 0,1 giây chỉ là dự phòng cho thay đổi không sinh sự kiện DOM.
  var queued = false, timer = null, obs = null;
  function stop() { if (timer) clearInterval(timer); if (obs) obs.disconnect(); }
  function tick() { queued = false; if (!done && step()) stop(); }
  function schedule() { if (!queued && !done) { queued = true; setTimeout(tick, 30); } }   // gộp nhiều thay đổi liên tiếp, tối đa ~30 lần/giây
  timer = setInterval(tick, POLL_MS);
  try {
    obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) { if (badge && badge.contains(muts[i].target)) continue; schedule(); return; }   // bỏ qua thay đổi do chính ô báo gây ra
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden', 'aria-disabled'] });
  } catch (e) { /* chỉ dùng nhịp dự phòng */ }
  schedule();
  }
})();
