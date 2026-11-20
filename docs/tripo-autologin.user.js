// ==UserScript==
// @name         Team Tools: tự đăng nhập Tripo
// @namespace    https://minhdv-zz.github.io/team-skills/
// @version      2.4.1
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
// ==/UserScript==
// Cách chạy: trang Team Tools gửi {e,p} qua sự kiện "team-tripo-login" (không đi qua URL). Script cất tạm trong bộ nhớ của
// tiện ích (GM_setValue, tối đa 3 phút), mở tab Tripo, tab đó đọc ra điền form rồi xóa ngay. Không có mật khẩu nào trong URL,
// lịch sử trình duyệt hay máy chủ. Không bật tự cập nhật (@updateURL) để nội dung script chỉ đổi khi chính bạn cài lại.
(function () {
  'use strict';
  var host = location.hostname, KEY = 'tripoCred', EV = 'team-tripo-login';
  var STUDIO = 'https://studio.tripo3d.ai/', TTL = 3 * 60 * 1000, FILL_WAIT = 8000, TOTAL = 120000, SETTLE_MS = 200, MAX_CLICKS = 3, RETRY_MS = 1000, POLL_MS = 100;

  // ---------- Trên trang Team Tools ----------
  if (host === 'minhdv-zz.github.io') {
    var flag = function () { // ở document-start thẻ <html> có thể chưa tồn tại
      var r = document.documentElement;
      if (r) r.setAttribute('data-tripo-autologin', '1');
      return !!r;
    };
    if (!flag()) { var iv = setInterval(function () { if (flag()) clearInterval(iv); }, 10); }
    try { // dọn thông tin cũ còn sót (ví dụ đóng tab Tripo giữa chừng)
      var old = JSON.parse(GM_getValue(KEY, '') || 'null');
      if (old && !(Date.now() - old.t < TTL)) GM_deleteValue(KEY);
    } catch (e) { GM_deleteValue(KEY); }
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
      if (cred) { clearInterval(wait); begin(); } else if (++tries >= 8) clearInterval(wait);
    }, 250);
    return;
  }
  begin();

  function begin() {

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
  var badge = null;
  function say(msg, keepMs) {
    try { console.log('[Team Tools] ' + msg); } catch (e) { /* bỏ qua */ }
    var root = document.documentElement; if (!root) return;
    if (!badge || !badge.isConnected) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;background:#1c1640;color:#fff;border:1px solid #7c5cff;border-radius:8px;padding:6px 10px;font:12px/1.4 system-ui,sans-serif;max-width:340px;pointer-events:none';
      root.appendChild(badge);
    }
    badge.textContent = 'Team Tools: ' + msg;
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
    if (clicks[key] >= 3 || (lastClick[key] && now - lastClick[key] < 1200)) return;
    clicks[key]++; lastClick[key] = now; click(el);
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
    if (clicks3 > 0) return finish('đã đăng nhập (form đã đóng).', 6000);   // sau khi bấm mà form biến mất là đăng nhập xong
    var up = findText(/^use password$/);
    if (up) { say('bấm "Use Password"…'); clickLimited('use', up); return false; }
    if (!findInput('email', /e-?mail/i)) {   // chưa có form nào mới bấm nút đăng nhập ở đầu trang
      var lg = findText(/^(sign\s*up\s*\/?\s*)?log\s*in$/);
      if (lg) { say('bấm nút đăng nhập…'); clickLimited('login', lg); }
      else say('đang tìm nút đăng nhập…');
    }
    return false;
  }

  say('nhận được thông tin đăng nhập, đang tìm nút đăng nhập…');
  var timer = setInterval(function () { if (step()) clearInterval(timer); }, POLL_MS);
  }
})();
