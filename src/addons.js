/*! Rozumiu check-up addons v1.3.6
 * Loaded from the Checkups Template page custom code (no registered-script update needed).
 * 1) Form payload: human-readable field keys, no service fields (stage/consent/honeypot/empty position).
 * 2) Print: rebuilds the result into A4 pages (logo, date, tiles, legend, map, writing lines, contact card).
 */
(function () {
  'use strict';
  if (window.RozumiuCheckupAddons) return; // loaded twice (page code + test harness): one instance is enough
  var ROOT_SEL = '[data-quiz="root"]';
  function q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------------------------------------------------------------- */
  /* 1. Form payload                                                   */
  /* ---------------------------------------------------------------- */
  var LEAD_KEYS = { 'contact-name': 'Імʼя', 'contact-email': 'Email', 'phone': 'Телефон', 'company': 'Компанія', 'position': 'Посада', 'checkup-name': 'Чек-ап' };
  var RESULT_KEYS = { 'checkup-name': 'Чек-ап', 'contact-name': 'Імʼя', 'contact-email': 'Email', 'total-score': 'Загальний бал', 'band-title': 'Рівень', 'overall': 'Загальне благополуччя', 'result-link': 'Посилання на результат' };
  var DROP_NAMES = ['stage', 'consent', 'website'];

  // Capture phase on document runs before webflow.js serializes the form (it keys fields by data-name).
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM' || !form.closest || !form.closest(ROOT_SEL)) return;
    var kind = form.getAttribute('data-name');
    var keys = kind === 'Checkup Results' ? RESULT_KEYS : (kind === 'Checkup Lead' ? LEAD_KEYS : null);
    if (!keys) return;
    var removed = [];
    var drop = function (node) {
      if (!node || !node.parentNode) return;
      removed.push({ el: node, parent: node.parentNode, next: node.nextSibling });
      node.parentNode.removeChild(node);
    };
    Object.keys(keys).forEach(function (n) {
      var f = form.querySelector('[name="' + n + '"]');
      if (f) f.setAttribute('data-name', keys[n]);
    });
    DROP_NAMES.forEach(function (n) { drop(form.querySelector('[name="' + n + '"]')); });
    // the bot trap never blocks a person (autofill can touch it); it just never reaches the inbox
    qa('[data-quiz="hp-wrap"] input', form).forEach(drop);
    if (kind === 'Checkup Lead') {
      var pos = form.querySelector('[name="position"]');
      if (pos && (pos.disabled || !String(pos.value || '').trim())) drop(pos);
    } else {
      // "Сфера: 7.3 (зелена)" -> key "Сфера", value "7.3 (зелена)"
      qa('input[name^="result-"]', form).forEach(function (f) {
        if (f.name === 'result-link') return;
        var v = String(f.value || ''), i = v.indexOf(': ');
        if (i > 0) { f.setAttribute('data-name', v.slice(0, i)); f.value = v.slice(i + 2); }
      });
    }
    // put the removed inputs back right after webflow.js has read the form (keeps validation on re-submit)
    if (removed.length) setTimeout(function () { removed.reverse().forEach(function (r) { r.parent.insertBefore(r.el, r.next); }); }, 0);
  }, true);

  /* ---------------------------------------------------------------- */
  /* 2. Print layout                                                   */
  /* ---------------------------------------------------------------- */
  var PRINT_CSS = [
    '[data-quiz="hp-wrap"]{display:none!important}',
    '@page{size:A4;margin:0}',
    '@media print{',
    'html,body{margin:0!important;padding:0!important;background:#fff!important;height:auto!important;min-height:0!important;display:block!important}',
    'body>*:not([data-print="wrap"]){display:none!important}',
    '[data-print="wrap"]{display:block;font-family:Aeroport,"Helvetica Neue",Arial,sans-serif;color:#000;font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '[data-print="wrap"] *{box-sizing:border-box}',
    '[data-print="page"]{position:relative;width:210mm;min-height:297mm;padding:12mm 16mm 22mm;break-after:page;page-break-after:always}',
    '[data-print="page"]:last-child{break-after:auto;page-break-after:auto}',
    '[data-print="head"]{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid #e8e8e8;margin-bottom:20px}',
    '[data-print="head"] svg{height:22px;width:auto;display:block}',
    '[data-print="logo-text"]{font-size:20px;font-weight:700;color:#3130d3}',
    '[data-print="meta"]{font-size:11px;color:#6b6b6b}',
    '[data-print="foot"]{position:absolute;left:16mm;right:16mm;bottom:9mm;padding-top:8px;border-top:1px solid #e8e8e8;display:flex;justify-content:space-between;font-size:10px;color:#9a9a9a}',
    '[data-print="foot"] b{font-weight:500;color:#6b6b6b}',
    '[data-print="page"] h2{font-size:32px;line-height:1.12;margin:0 0 8px;font-weight:700;letter-spacing:-.01em;color:#000}',
    '[data-print="page"] h3{font-size:20px;line-height:1.25;margin:0 0 8px;font-weight:700;color:#000}',
    '[data-print="lead"]{font-size:12px;line-height:1.5;color:#2a2a2a;margin:0 0 16px;max-width:150mm}',
    '[data-print="lead"] b{font-weight:500}',
    /* personal: tiles */
    '[data-result="rows"] .w-dyn-list{display:block!important}',
    '[data-result="rows"] .w-dyn-items{display:grid!important;grid-template-columns:1fr 1fr;gap:10px 14px;margin:0;padding:0}',
    '[data-result="rows"] .w-dyn-item{display:block!important;margin:0}',
    '[data-result="sphere-row"]{display:block!important;background:#f7f7f7!important;border:1px solid #e8e8e8!important;outline:none!important;box-shadow:none!important;border-radius:16px!important;padding:12px 15px 13px!important;break-inside:avoid;page-break-inside:avoid;cursor:default}',
    '[data-result="sphere-head"]{display:flex!important;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:0 8px}',
    '[data-result="sphere-name"]{order:0;font-size:12px!important;font-weight:500;color:#444!important;padding-top:2px;margin:0!important}',
    '[data-result="sphere-head"]:after{order:1;margin-left:auto;font-size:9.5px;font-weight:500;padding:3px 8px;border-radius:100px;white-space:nowrap;letter-spacing:.02em;line-height:1.3}',
    '.is-zone-green [data-result="sphere-head"]:after{content:"опора";background:#e3f3e9;color:#237a46}',
    '.is-zone-yellow [data-result="sphere-head"]:after{content:"варто уваги";background:#fff1cc;color:#8a6200}',
    '.is-zone-orange [data-result="sphere-head"]:after{content:"потребує уваги";background:#fde6d5;color:#a44f10}',
    '.is-zone-red [data-result="sphere-head"]:after{content:"потребує уваги";background:#fbdcd7;color:#9b2e1f}',
    '[data-result="sphere-score"]{order:2;flex-basis:100%;font-size:28px!important;font-weight:700;line-height:1!important;margin:7px 0 9px!important}',
    '.is-zone-green [data-result="sphere-score"]{color:#3fae6a!important}',
    '.is-zone-yellow [data-result="sphere-score"]{color:#e9a900!important}',
    '.is-zone-orange [data-result="sphere-score"]{color:#f08a3c!important}',
    '.is-zone-red [data-result="sphere-score"]{color:#e5533d!important}',
    '[data-result="bar-track"]{height:6px!important;background:#e1e1e1!important;border-radius:6px;overflow:hidden;margin:0!important}',
    '[data-result="sphere-bar"]{height:100%!important;border-radius:6px}',
    '.is-zone-green [data-result="sphere-bar"]{background:#3fae6a!important}',
    '.is-zone-yellow [data-result="sphere-bar"]{background:#fec23e!important}',
    '.is-zone-orange [data-result="sphere-bar"]{background:#f08a3c!important}',
    '.is-zone-red [data-result="sphere-bar"]{background:#e5533d!important}',
    '[data-result="sphere-text"]{display:block!important;font-size:11px!important;line-height:1.42!important;margin:10px 0 0!important;color:#1c1c1c}',
    '[data-result="sphere-text"] p{margin:0 0 4px!important;font-size:11px!important;line-height:1.42!important}',
    '[data-result="sphere-text"] p:last-child{margin-bottom:0!important}',
    '[data-result="sphere-text"] em{color:#4a4a4a}',
    '[data-sphere-key]{display:none!important}',
    /* team: score block */
    '[data-print="team-score"]{display:flex;align-items:center;gap:22px;background:#f7f7f7;border:1px solid #e8e8e8;border-radius:16px;padding:18px 22px;margin:0 0 18px}',
    '[data-result="total-score"]{font-size:44px!important;font-weight:700;line-height:1!important;margin:0!important;white-space:nowrap}',
    '.is-zone-green [data-result="total-score"]{color:#3fae6a!important}.is-zone-yellow [data-result="total-score"]{color:#e9a900!important}.is-zone-orange [data-result="total-score"]{color:#f08a3c!important}.is-zone-red [data-result="total-score"]{color:#e5533d!important}',
    '[data-result="band-badge"]{display:inline-block!important;background:none!important;padding:0!important;margin:0!important;border:0!important}',
    '[data-result="band-title"]{font-size:15px!important;font-weight:700;line-height:1.3!important;color:#000!important;margin:0!important}',
    '[data-result="band-text"]{font-size:12px!important;line-height:1.55!important;margin:0 0 22px!important;color:#1c1c1c}',
    /* outro blocks */
    '[data-result="outro"]{display:block!important;margin:0!important}',
    '[data-outro]{background:none!important;padding:0!important;border-radius:0!important;margin:0!important}',
    '[data-print="page"] [data-outro]+[data-outro],[data-print="page"] [data-outro]+[data-print="notes"]{margin-top:26px!important}',
    '[data-outro] p,[data-outro] li{font-size:12px!important;line-height:1.55!important;color:#1c1c1c}',
    '[data-outro] p{margin:0 0 8px!important}',
    '[data-outro-note]{border-left:3px solid #fec23e;padding:4px 0 4px 12px!important;margin:12px 0 0!important;font-size:11.5px!important;color:#4a4a4a!important;opacity:1!important}',
    '[data-outro-list="legend"]{display:grid!important;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:14px 0 0!important;padding:0!important;list-style:none}',
    '[data-outro-list="legend"] li{position:relative;border:1px solid #e8e8e8;border-radius:14px;padding:12px 14px 12px 34px!important;font-size:11.5px!important;line-height:1.45!important;margin:0!important}',
    '[data-outro-list="legend"] li:before{left:14px!important;top:14px!important;width:12px!important;height:12px!important}',
    '[data-outro="map"]>p{margin:0!important}',
    '[data-outro-map]{width:100%;border-collapse:collapse;margin-top:10px!important;font-size:12px;background:none!important;border-radius:0!important;overflow:visible!important}',
    '[data-outro-map] th{text-align:left;font-weight:500!important;font-size:11px!important;color:#555;padding:8px 10px!important;white-space:nowrap;border-bottom:1.5px solid #cfcfcf!important;background:none!important}',
    '[data-outro-map] td{padding:0 10px!important;height:33px!important;border-bottom:1px solid #e8e8e8!important;vertical-align:middle;font-size:12px!important}',
    '[data-outro-map] td:nth-child(2){font-weight:700;width:80px}',
    '[data-outro-map] th:nth-child(n+3),[data-outro-map] td:nth-child(n+3){width:120px!important;text-align:center!important}',
    '[data-outro-map] td:nth-child(n+3):after{display:inline-block!important;width:16px!important;height:16px!important;border:1.5px solid #9a9a9a!important;border-radius:4px!important;vertical-align:middle}',
    '[data-outro-map] tr.is-zone-green td:nth-child(2){color:#3fae6a}[data-outro-map] tr.is-zone-yellow td:nth-child(2){color:#e9a900}[data-outro-map] tr.is-zone-orange td:nth-child(2){color:#f08a3c}[data-outro-map] tr.is-zone-red td:nth-child(2){color:#e5533d}',
    /* questions with writing lines */
    '[data-print-lines] ul,[data-print-lines] ol{list-style:none!important;margin:10px 0 0!important;padding:0!important;counter-reset:q}',
    '[data-print-lines] li{counter-increment:q;position:relative;padding-left:30px!important;margin:0 0 14px!important;font-size:12.5px!important;line-height:1.5!important}',
    '[data-print-lines] li:before{content:counter(q)!important;position:absolute;left:0;top:1px;width:20px;height:20px;border-radius:50%;background:#3130d3!important;color:#fff;font-size:11px;font-weight:500;text-align:center;line-height:20px;border:0;transform:none}',
    /* writing lines are real elements with a border (vector strokes in the PDF), not gradients: those rasterize unevenly */
    '[data-print="lines"]{display:block;margin-top:6px}',
    '[data-print="lines"] i{display:block;height:26px;border-bottom:1px solid #cfcfcf}',
    '[data-print="notes"] p{font-size:11px;color:#6b6b6b;margin:0 0 4px}',
    '[data-print="cta"]{margin-top:28px;background:#3130d3!important;color:#fff;border-radius:20px;padding:22px 26px;display:flex;justify-content:space-between;align-items:center;gap:20px;break-inside:avoid;page-break-inside:avoid}',
    '[data-print="cta-title"]{font-size:18px;font-weight:700;line-height:1.25;margin:0 0 6px}',
    '[data-print="cta"] p{margin:0;font-size:11.5px;line-height:1.5;color:#dcdcff;max-width:92mm}',
    '[data-print="pill"]{background:#fec23e!important;color:#000;border-radius:100px;padding:12px 22px;font-size:13px;font-weight:700;white-space:nowrap;text-align:center}',
    '[data-print="pill"] small{display:block;font-size:10px;font-weight:400;color:#4a3a00;margin-top:2px}',
    '}'
  ].join('\n');

  var TEXT = {
    personal: {
      short: 'Check-up добробуту',
      lead: function (n, max) { return n + ' сфер добробуту, бал від 0 до ' + max + '. Що вищий бал, то більше ресурсу у сфері. Для <b>«Негативних емоцій»</b> і <b>«Самотності»</b> навпаки: що нижчий бал, то краще.'; },
      ctaTitle: 'Хочете обговорити результат?',
      ctaText: 'Психологи «Розумію» допоможуть розібрати ваші сфери добробуту і намітити перші кроки.'
    },
    team: {
      short: 'Check-up для команди',
      lead: function (n, max) { return n + ' тверджень про команду, максимум ' + max + ' балів. Що вищий бал, то більше сигналів, які варто не ігнорувати.'; },
      ctaTitle: 'Хочете розібрати результат команди?',
      ctaText: 'Напишіть, щоб домовитись про безкоштовну 30-хвилинну онлайн-зустріч з психологом «Розумію».'
    },
    notesTitle: 'Мої нотатки',
    notesHint: 'Що з результату хочеться запамʼятати. Один крок на цей тиждень.',
    ctaLabel: 'Хочу на консультацію',
    footer: '<b>Розумію</b> · платформа корпоративного добробуту · www.rozumiu.ua'
  };

  var state = { built: false, moved: [], wrap: null };

  function readConfig() {
    try { var c = q('[data-quiz="config"]'); return c ? JSON.parse(c.textContent) : {}; } catch (e) { return {}; }
  }
  function todayLabel() {
    try {
      return new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*р\.?$/, '');
    } catch (e) { return ''; }
  }
  function logoNode() {
    var svg = q('.w-nav-brand svg, .brand svg');
    if (svg) return svg.cloneNode(true);
    return el('span', { 'data-print': 'logo-text' }, 'розумію');
  }
  function move(node, into) {
    if (!node) return;
    state.moved.push({ el: node, parent: node.parentNode, next: node.nextSibling });
    into.appendChild(node);
  }
  function pageNode(meta) {
    var p = el('section', { 'data-print': 'page' });
    var head = el('div', { 'data-print': 'head' });
    head.appendChild(logoNode());
    head.appendChild(el('div', { 'data-print': 'meta' }, esc(meta)));
    p.appendChild(head);
    return p;
  }
  function linesNode(count) {
    var n = el('div', { 'data-print': 'lines' });
    for (var i = 0; i < count; i++) n.appendChild(el('i'));
    return n;
  }
  // questions block: number each question and give it 3 lines to write on
  function addWritingLines(block) {
    block.setAttribute('data-print-lines', '');
    qa('li', block).forEach(function (li) { li.appendChild(linesNode(3)); });
  }
  function tagZonesOnMap(result) {
    var names = {};
    qa('[data-result="sphere-row"]', result).forEach(function (row) {
      var n = q('[data-result="sphere-name"]', row);
      var m = /is-zone-\w+/.exec(row.className);
      if (n && m) names[n.textContent.trim()] = m[0];
    });
    qa('[data-outro-map] tr', result).forEach(function (tr) {
      var td = tr.querySelector('td');
      var z = td && names[td.textContent.trim()];
      if (z) tr.classList.add(z);
    });
  }

  function buildPrint() {
    if (state.built) return;
    var root = q(ROOT_SEL);
    var result = root && q('[data-quiz="result"].is-active', root);
    if (!result) return; // only the result screen gets the print layout
    var type = result.getAttribute('data-result-type') === 'team' ? 'team' : 'personal';
    var cfg = readConfig();
    var t = TEXT[type];
    var meta = t.short + ' · ' + todayLabel();
    var outro = q('[data-result="outro"]', result);
    var texts = outro ? qa(':scope > [data-outro="text"]', outro) : [];
    var cta = q('[data-result="cta"]', result);
    var email = (cta && /^mailto:/.test(cta.getAttribute('href') || '')) ? cta.getAttribute('href').replace(/^mailto:/, '') : 'hi@rozumiu.ua';
    var pages = [];

    var p1 = pageNode(meta);
    move(q(':scope > h2', result), p1);
    if (type === 'personal') {
      var rows = q('[data-result="rows"]', result);
      var n = qa('[data-result="sphere-row"]', rows).length || 8;
      var max = (cfg.scale && (cfg.scale.max || cfg.scale.to)) || 10;
      p1.appendChild(el('p', { 'data-print': 'lead' }, t.lead(n, max)));
      tagZonesOnMap(result); // before the rows leave the result node
      move(rows, p1);
      pages.push(p1);

      var p2 = pageNode(meta);
      move(q('[data-outro="legend"]', result), p2);
      move(q('[data-outro="map"]', result), p2);
      if (texts[0]) move(texts[0], p2);
      pages.push(p2);

      var p3 = pageNode(meta);
      if (texts[1]) { addWritingLines(texts[1]); move(texts[1], p3); }
      pages.push(p3);
      appendNotesAndCta(p3, t, email);
    } else {
      var total = q('[data-result="total-score"]', result);
      var qn = cfg.questionsTotal || 20;
      var maxT = (total && /із\s*(\d+)/.exec(total.textContent) || [])[1] || (qn * 4);
      p1.appendChild(el('p', { 'data-print': 'lead' }, t.lead(qn, maxT)));
      var score = el('div', { 'data-print': 'team-score' });
      move(total, score);
      var side = el('div');
      move(q('[data-result="band-badge"]', result), side);
      score.appendChild(side);
      p1.appendChild(score);
      move(q('[data-result="band-text"]', result), p1);
      if (texts[0]) { addWritingLines(texts[0]); move(texts[0], p1); }
      pages.push(p1);

      var p2t = pageNode(meta);
      if (texts[1]) move(texts[1], p2t);
      pages.push(p2t);
      appendNotesAndCta(p2t, t, email);
    }

    var wrap = el('div', { 'data-print': 'wrap' });
    pages.forEach(function (p, i) {
      var foot = el('div', { 'data-print': 'foot' });
      foot.appendChild(el('span', null, TEXT.footer));
      foot.appendChild(el('span', null, (i + 1) + ' / ' + pages.length));
      p.appendChild(foot);
      wrap.appendChild(p);
    });
    document.body.appendChild(wrap);
    state.wrap = wrap;
    state.built = true;
  }

  function appendNotesAndCta(page, t, email) {
    var notes = el('div', { 'data-print': 'notes' });
    notes.appendChild(el('h3', null, esc(TEXT.notesTitle)));
    notes.appendChild(el('p', null, esc(TEXT.notesHint)));
    notes.appendChild(linesNode(8));
    page.appendChild(notes);
    var cta = el('div', { 'data-print': 'cta' });
    var left = el('div');
    left.appendChild(el('div', { 'data-print': 'cta-title' }, esc(t.ctaTitle)));
    left.appendChild(el('p', null, esc(t.ctaText)));
    cta.appendChild(left);
    cta.appendChild(el('div', { 'data-print': 'pill' }, esc(email) + '<small>' + esc(TEXT.ctaLabel) + '</small>'));
    page.appendChild(cta);
  }

  function restorePrint() {
    if (!state.built) return;
    qa('[data-outro-map] tr[class*="is-zone-"]').forEach(function (tr) {
      tr.className = tr.className.replace(/\s*is-zone-\w+/g, '').trim();
      if (!tr.className) tr.removeAttribute('class');
    });
    qa('[data-print-lines] [data-print="lines"]').forEach(function (n) { n.parentNode.removeChild(n); });
    state.moved.reverse().forEach(function (m) {
      m.el.removeAttribute('data-print-lines');
      if (m.parent) m.parent.insertBefore(m.el, m.next && m.next.parentNode === m.parent ? m.next : null);
    });
    state.moved = [];
    if (state.wrap && state.wrap.parentNode) state.wrap.parentNode.removeChild(state.wrap);
    state.wrap = null;
    state.built = false;
  }

  function injectStyles() {
    if (q('#rozumiu-print-styles')) return;
    var s = el('style', { id: 'rozumiu-print-styles' });
    s.textContent = PRINT_CSS;
    // end of body: after the page's own embed CSS, so equal-specificity rules resolve in favour of print
    (document.body || document.head).appendChild(s);
  }

  function init() {
    injectStyles();
    window.addEventListener('beforeprint', buildPrint);
    window.addEventListener('afterprint', restorePrint);
    if (window.matchMedia) {
      try {
        var mq = window.matchMedia('print');
        var onChange = function (e) { if (e.matches) buildPrint(); else restorePrint(); };
        if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
      } catch (e) { /* no-op */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.RozumiuCheckupAddons = { version: '1.3.6', buildPrint: buildPrint, restorePrint: restorePrint };
})();
