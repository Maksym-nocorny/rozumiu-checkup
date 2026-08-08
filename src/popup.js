/*! Rozumiu promo popup v1.0.0 */
(function () {
  'use strict';
  function init() {
    var root = document.querySelector('[data-popup="root"]');
    if (!root) return;
    if (document.querySelector('[data-quiz="root"]')) return; // не на сторінках тестів
    var delay = parseInt(root.getAttribute('data-delay-ms'), 10) || 10000;
    var cooldownH = parseInt(root.getAttribute('data-cooldown-h'), 10) || 24;
    var KEY = 'rozumiu-popup-shown';
    var now = Date.now();
    try {
      var last = parseInt(localStorage.getItem(KEY), 10);
      if (last && now - last < cooldownH * 3600 * 1000) return;
    } catch (e) { /* приватний Safari */ }
    function mark() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
    function close() { root.classList.remove('is-open'); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    setTimeout(function () {
      root.classList.add('is-open');
      mark();
      document.addEventListener('keydown', onKey);
    }, delay);
    var x = root.querySelector('[data-popup="close"]');
    if (x) x.addEventListener('click', close);
    var ov = root.querySelector('[data-popup="overlay"]');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var cta = root.querySelector('[data-popup="cta"]');
    if (cta) cta.addEventListener('click', function () { mark(); close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
