// ==UserScript==
// @name         Team Tools: tự đăng nhập Tripo
// @namespace    https://minhdv-zz.github.io/team-skills/
// @version      1.0.1
// @description  Bấm "Mở Tripo Studio" trong tab Tài khoản Tripo của Team Tools thì tự điền email, mật khẩu và bấm Continue.
// @author       Team Tools
// @match        https://studio.tripo3d.ai/*
// @match        https://minhdv-zz.github.io/team-skills/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/minhdv-zz/team-skills/main/docs/tripo-autologin.user.js
// @updateURL    https://raw.githubusercontent.com/minhdv-zz/team-skills/main/docs/tripo-autologin.user.js
// ==/UserScript==
(function () {
  'use strict';
  var host = location.hostname;

  // Trên trang Team Tools: chỉ báo cho trang biết script đã được cài (trang sẽ mới gắn email/mật khẩu vào link).
  if (host === 'minhdv-zz.github.io') {
    // Ở document-start thẻ <html> có thể chưa tồn tại, nên thử lại cho tới khi có.
    var flag = function () {
      var r = document.documentElement;
      if (r) r.setAttribute('data-tripo-autologin', '1');
      return !!r;
    };
    if (!flag()) { var iv = setInterval(function () { if (flag()) clearInterval(iv); }, 10); }
    return;
  }
  if (host !== 'studio.tripo3d.ai') return;

  // Link từ Team Tools có dạng https://studio.tripo3d.ai/#tsl=<base64 của {"e":email,"p":mật khẩu}>.
  // Phần sau dấu # không bao giờ được gửi lên server. Đọc xong xóa ngay khỏi thanh địa chỉ.
  var m = /[#&]tsl=([^&]+)/.exec(location.hash);
  if (!m) return;
  var cred = null;
  try { cred = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch (e) { cred = null; }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* bỏ qua */ }
  if (!cred || typeof cred.e !== 'string' || typeof cred.p !== 'string') return;

  var started = Date.now(), submitted = false, lastClick = {};

  function txt(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function click(el) { (el.closest('button,a,[role=button]') || el).click(); }

  // Tìm phần tử hiển thị có chữ khớp hoàn toàn, lấy phần tử sâu nhất.
  function findText(re) {
    var els = document.querySelectorAll('button,a,[role=button],div,span,p'), hit = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var t = txt(el);
      if (t.length > 30 || !re.test(t)) continue;
      if (hit && !hit.contains(el)) continue;   // giữ phần tử sâu nhất trong cùng một nhánh
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
  function setVal(input, v) { // ô nhập của React phải đặt giá trị qua setter gốc rồi bắn sự kiện
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function clickOnce(key, el) { // không bấm lại cùng một nút quá dày
    var now = Date.now();
    if (lastClick[key] && now - lastClick[key] < 2500) return;
    lastClick[key] = now; click(el);
  }

  function step() {
    if (submitted || Date.now() - started > 60000) return true;
    var pw = findInput('password', /password/i), em = findInput('email', /e-?mail/i);
    if (pw && em && pw !== em) {
      setVal(em, cred.e); setVal(pw, cred.p);
      submitted = true;   // chỉ gửi đúng một lần, tránh thử sai mật khẩu liên tục làm khóa tài khoản
      setTimeout(function () {
        var b = findText(/^continue$/);
        if (b) click(b); else if (pw.form && pw.form.requestSubmit) pw.form.requestSubmit();
        cred = null;
      }, 400);
      return true;
    }
    var up = findText(/^use password$/);
    if (up) { clickOnce('use', up); return false; }
    var lg = findText(/^sign up\s*\/\s*log in$/);
    if (lg) clickOnce('login', lg);
    return false;
  }

  var timer = setInterval(function () { if (step()) { clearInterval(timer); cred = submitted ? cred : null; } }, 500);
})();
