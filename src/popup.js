/*! Rozumiu check-up popups v2.0.0 */
/* Content lives in the CMS collection "Popups" and is rendered site-wide as hidden data
 * ([data-popup-item] with [data-popup-field] children). This script picks the popup for
 * the current page and builds the dialog from that data.
 * Rules (approved 17.09.2026):
 *  - shows after 10 s on a matching page, Ukrainian locale only, never on check-up pages;
 *  - at most one popup per 7 days per browser, shared by all popups;
 *  - 30 days of silence after the button is clicked or any check-up page is opened;
 *  - closes with the cross, a click outside the card, or Escape.
 * ?popup-test on a page shows its popup after 1 s and ignores/keeps the stored timers. */
(function () {
  'use strict';

  var KEY_LAST = 'rozumiu-popup-last';
  var KEY_QUIET = 'rozumiu-popup-quiet-until';
  var DAY = 864e5;
  var REPEAT_DAYS = 7;
  var QUIET_DAYS = 30;
  var DELAY_MS = 10000;

  function readNum(k) { try { return parseInt(localStorage.getItem(k), 10) || 0; } catch (e) { return 0; } }
  function writeNum(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }

  function normPath(p) {
    p = (p || '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
    return p || '/';
  }

  function isEnglish() {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return lang.indexOf('en') === 0 || /^\/en(\/|$)/.test(location.pathname);
  }

  function isCheckupPage(p) {
    return /^\/checkup(\/|$)/.test(p) || !!document.querySelector('[data-quiz="root"]');
  }

  function pageMatches(p, list) {
    var patterns = String(list || '').split(/[\n,;]+/);
    for (var i = 0; i < patterns.length; i++) {
      var raw = patterns[i].trim();
      if (!raw) continue;
      raw = raw.replace(/^https?:\/\/[^/]+/i, '');
      if (raw.charAt(0) !== '/') raw = '/' + raw;
      if (raw.slice(-1) === '*') {
        var prefix = normPath(raw.slice(0, -1));
        if (prefix === '/') return true;
        if (p === prefix || p.indexOf(prefix + '/') === 0) {
          if (p !== prefix || raw.slice(-2) !== '/*') return true;
        }
      } else if (normPath(raw) === p) {
        return true;
      }
    }
    return false;
  }

  function field(item, name) {
    var el = item.querySelector('[data-popup-field="' + name + '"]');
    if (!el) return '';
    if (name === 'image') {
      var img = el.tagName === 'IMG' ? el : el.querySelector('img');
      return img ? (img.getAttribute('src') || '') : '';
    }
    if (el.classList.contains('w-dyn-bind-empty')) return '';
    return (el.textContent || '').trim();
  }

  var CSS = '' +
    '.rzp{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;opacity:0;transition:opacity .2s ease;font-family:inherit}' +
    '.rzp.is-open{opacity:1}' +
    '.rzp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}' +
    '.rzp-card{position:relative;margin:auto;width:min(580px,100%);background:#fff;border-radius:20px;overflow:hidden;text-align:center;color:#000;box-sizing:border-box}' +
    '.rzp-head{height:232px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#eeeefa}' +
    '.rzp[data-color="yellow"] .rzp-head{background:#fff3d8}' +
    '.rzp-head img{display:block;width:320px;height:244px;max-width:none;object-fit:contain}' +
    '.rzp-body{display:flex;flex-direction:column;align-items:center;gap:32px;padding:32px 60px 60px}' +
    '.rzp-copy{display:flex;flex-direction:column;gap:12px}' +
    '.rzp-title{margin:0;font-family:inherit;font-weight:700;font-size:32px;line-height:38px;color:#000;letter-spacing:0;text-transform:none}' +
    '.rzp-title span{display:block;color:#3130d3}' +
    '.rzp-text{margin:0;font-size:16px;line-height:24px;font-weight:400;color:#000;text-wrap:pretty}' +
    '.rzp-btn{display:inline-block;box-sizing:border-box;padding:14px 56px;border-radius:30px;background:#3130d3;color:#fff;font-weight:500;font-size:16px;line-height:22px;text-decoration:none;transition:opacity .2s ease}' +
    '.rzp-btn:hover{opacity:.9}' +
    '.rzp[data-color="yellow"] .rzp-btn{background:#fec23e;color:#000}' +
    '.rzp-close{position:absolute;top:16px;right:16px;width:64px;height:64px;border:0;border-radius:1000px;background:#fff;color:#878e98;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:1}' +
    '.rzp-close svg{width:24px;height:24px}' +
    '.rzp-card:focus{outline:none}' +
    '.rzp-btn:focus-visible,.rzp-close:focus-visible{outline:2px solid #3130d3;outline-offset:3px}' +
    '@media (max-width:767px){' +
      '.rzp-card{width:min(358px,calc(100vw - 32px))}' +
      '.rzp-head{height:184px}' +
      '.rzp-head img{width:240px;height:183px}' +
      '.rzp-body{gap:24px;padding:24px 16px 16px}' +
      '.rzp-title{font-size:26px;line-height:32px}' +
      '.rzp-btn{display:block;width:100%;padding:14px 24px}' +
      '.rzp-close{width:48px;height:48px;top:12px;right:12px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.rzp,.rzp-btn{transition:none}}';

  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(data, test) {
    if (document.querySelector('.rzp')) return;
    if (!document.getElementById('rzp-style')) {
      var st = document.createElement('style');
      st.id = 'rzp-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var yellow = /yellow|sun|жовт/i.test(data.color);
    var root = document.createElement('div');
    root.className = 'rzp';
    root.setAttribute('data-color', yellow ? 'yellow' : 'blue');
    root.innerHTML =
      '<div class="rzp-overlay" data-popup="overlay"></div>' +
      '<div class="rzp-card" role="dialog" aria-modal="true" aria-labelledby="rzp-title" tabindex="-1">' +
        '<button class="rzp-close" type="button" aria-label="Закрити" data-popup="close">' + CLOSE_SVG + '</button>' +
        (data.image ? '<div class="rzp-head"><img src="' + esc(data.image) + '" alt=""></div>' : '') +
        '<div class="rzp-body">' +
          '<div class="rzp-copy">' +
            '<h2 class="rzp-title" id="rzp-title">' + esc(data.title) + (data.accent ? '<span>' + esc(data.accent) + '</span>' : '') + '</h2>' +
            (data.text ? '<p class="rzp-text">' + esc(data.text) + '</p>' : '') +
          '</div>' +
          (data.button && data.link ? '<a class="rzp-btn" data-popup="cta" href="' + esc(data.link) + '">' + esc(data.button) + '</a>' : '') +
        '</div>' +
      '</div>';

    var prevFocus = document.activeElement;
    var prevOverflow = document.documentElement.style.overflow;
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';
    if (!test) writeNum(KEY_LAST, Date.now());
    requestAnimationFrame(function () { root.classList.add('is-open'); });

    var card = root.querySelector('.rzp-card');
    var closeBtn = root.querySelector('.rzp-close');
    var cta = root.querySelector('.rzp-btn');
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }

    function close() {
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      if (root.parentNode) root.parentNode.removeChild(root);
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        var f = [closeBtn].concat(cta ? [cta] : []);
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        var next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
        f[next].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    closeBtn.addEventListener('click', close);
    root.querySelector('.rzp-overlay').addEventListener('click', close);
    if (cta) cta.addEventListener('click', function () {
      if (!test) writeNum(KEY_QUIET, Date.now() + QUIET_DAYS * DAY);
    });
  }

  function init() {
    var test = /[?&]popup-test\b/.test(location.search);
    var p = normPath(location.pathname);

    if (isCheckupPage(p)) {
      if (!test) writeNum(KEY_QUIET, Date.now() + QUIET_DAYS * DAY);
      return;
    }
    if (isEnglish()) return;
    if (!test) {
      var now = Date.now();
      if (readNum(KEY_QUIET) > now) return;
      if (now - readNum(KEY_LAST) < REPEAT_DAYS * DAY) return;
    }

    var items = document.querySelectorAll('[data-popup-item]');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!pageMatches(p, field(it, 'pages'))) continue;
      var data = {
        title: field(it, 'title'),
        accent: field(it, 'accent'),
        text: field(it, 'text'),
        button: field(it, 'button'),
        link: field(it, 'link'),
        image: field(it, 'image'),
        color: field(it, 'color')
      };
      if (!data.title) return;
      setTimeout(function () { show(data, test); }, test ? 1000 : DELAY_MS);
      return;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
