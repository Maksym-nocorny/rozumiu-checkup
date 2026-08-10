/*! Rozumiu Wellbeing Check-up engine v1.2.0 | vanilla JS, config-driven */
(function () {
  'use strict';

  var ZONE_LABELS = { green: 'зелена', yellow: 'жовта', orange: 'помаранчева', red: 'червона' };

  function roundTo(x, d) {
    var m = Math.pow(10, d || 0);
    return Math.round(x * m) / m;
  }

  // ---- чиста математика, покривається фікстурами -------------------------
  function score(config, answers) {
    if (config.type === 'personal') {
      var spheres = config.spheres.map(function (s) {
        var vals = s.questions
          .map(function (q) { return answers[q]; })
          .filter(function (v) { return typeof v === 'number'; });
        var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
        var rounded = roundTo(avg, config.decimals);
        var zoneInput = s.reversed && config.reversedZoneMode === 'mirror'
          ? roundTo(config.scale.max - rounded, config.decimals)
          : rounded;
        return { key: s.key, score: rounded, reversed: !!s.reversed, zone: zoneOf(config.zones, zoneInput) };
      });
      var overall = null;
      if (config.overallRow && config.overallRow.enabled) {
        if (config.overallRow.source === 'avgAll') {
          var counted = [];
          config.spheres.forEach(function (s) { counted = counted.concat(s.questions); });
          var vals2 = counted.map(function (q) { return answers[q]; }).filter(function (v) { return typeof v === 'number'; });
          overall = vals2.length ? roundTo(vals2.reduce(function (a, b) { return a + b; }, 0) / vals2.length, config.decimals) : 0;
        } else {
          var src = parseInt(String(config.overallRow.source).replace(/\D/g, ''), 10);
          overall = typeof answers[src] === 'number' ? answers[src] : null;
        }
      }
      return { type: 'personal', spheres: spheres, overall: overall };
    }
    // team: сума всіх зарахованих відповідей
    var uncounted = config.uncounted || [];
    var total = 0, countedN = 0;
    Object.keys(answers).forEach(function (k) {
      var q = parseInt(k, 10);
      if (uncounted.indexOf(q) === -1) { total += answers[k]; countedN++; }
    });
    var max = countedN * config.scale.max;
    var band = null, gap = false;
    (config.bands || []).forEach(function (b) {
      if (band === null && total >= b.min && total <= b.max) band = b;
    });
    if (band === null && config.bands && config.bands.length) {
      gap = true;
      var best = null, bestD = Infinity;
      config.bands.forEach(function (b) {
        var c = (b.min + b.max) / 2, d = Math.abs(total - c);
        if (d < bestD) { bestD = d; best = b; }
      });
      band = best;
    }
    return { type: 'team', total: total, max: max, band: band, bandGap: gap };
  }

  function zoneOf(zones, value) {
    var sorted = zones.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < sorted.length; i++) if (value >= sorted[i].min) return sorted[i].id;
    return sorted[sorted.length - 1].id;
  }

  function fmtScore(x, config) {
    var s = x.toFixed(config.decimals || 0);
    var sep = (config.ui && config.ui.decimalSeparator) || '.';
    return sep === '.' ? s : s.replace('.', sep);
  }

  // ---- движок -------------------------------------------------------------
  function boot() {
    var root = document.querySelector('[data-quiz="root"]');
    if (!root) return;

    var config;
    try {
      var cfgNode = root.querySelector('[data-quiz="config"]');
      config = JSON.parse(cfgNode.textContent);
      if (!config || !config.type || !config.scale) throw new Error('config shape');
    } catch (e) {
      root.classList.add('is-config-error');
      console.error('[quiz] config parse failed', e);
      return;
    }

    validate(config);

    var state = { phase: 'lead', qIndex: 0, answers: {}, lead: {}, resultsSubmitted: false };
    var dom = collectDom(root, config);
    if (!dom) return;

    initLeadForm(root, config, state, dom);
    buildScales(root, config, state, dom);
    buildMilestone(root, config, dom);
    initNav(config, state, dom);
    root.classList.add('is-lead');

    window.__rozumiuQuiz = {
      version: '1.2.0',
      score: score,
      config: config,
      getState: function () { return JSON.parse(JSON.stringify(state)); }
    };
  }

  function validate(config) {
    if (config.type === 'team' && config.bands) {
      var maxTotal = (config.questionsTotal - (config.uncounted || []).length) * config.scale.max;
      var covered = [];
      config.bands.forEach(function (b) { for (var i = b.min; i <= Math.min(b.max, maxTotal); i++) covered[i] = true; });
      for (var t = 0; t <= maxTotal; t++) if (!covered[t]) { console.error('[quiz] band gap at total=' + t); break; }
    }
  }

  function collectDom(root, config) {
    var prefix = config.type + '-';
    // клієнтська фільтрація: item-и іншого тесту геть із DOM
    root.querySelectorAll('[data-quiz="question"]').forEach(function (q) {
      var slugNode = q.querySelector('[data-q-slug]');
      var slug = slugNode ? slugNode.textContent.trim() : '';
      if (slug.indexOf(prefix) !== 0) {
        var item = q.closest('.w-dyn-item') || q;
        item.parentNode.removeChild(item);
      }
    });
    var sphereKeys = (config.spheres || []).map(function (s) { return s.key; });
    root.querySelectorAll('[data-result="sphere-row"]').forEach(function (row) {
      var keyNode = row.querySelector('[data-sphere-key]');
      var key = keyNode ? keyNode.textContent.trim() : '';
      if (sphereKeys.indexOf(key) === -1) {
        var item = row.closest('.w-dyn-item') || row;
        item.parentNode.removeChild(item);
      }
    });

    var questions = Array.prototype.slice.call(root.querySelectorAll('[data-quiz="question"]'));
    questions.sort(function (a, b) { return qOrder(a) - qOrder(b); });
    if (questions.length !== config.questionsTotal) {
      console.error('[quiz] DOM questions=' + questions.length + ' config=' + config.questionsTotal);
    }
    if (!questions.length) { root.classList.add('is-config-error'); return null; }

    return {
      questions: questions,
      progressBar: root.querySelector('[data-quiz="progress-bar"]'),
      stepCounter: root.querySelector('[data-quiz="step-counter"]'),
      prev: root.querySelector('[data-quiz="prev"]'),
      next: root.querySelector('[data-quiz="next"]'),
      leadFormWrap: root.querySelector('[data-quiz="lead-form"]'),
      resultsFormWrap: root.querySelector('[data-quiz="results-form"]'),
      scaleTemplate: root.querySelector('[data-quiz="scale-btn-template"] [data-quiz="scale-btn"]')
    };
  }

  function qOrder(q) {
    var n = q.querySelector('[data-q-order]');
    var v = n ? parseInt(n.textContent, 10) : NaN;
    return isNaN(v) ? 0 : v;
  }

  // Webflow-реєстр форм не редагується headless: людські імена полів і форм
  // ставимо в рантаймі ДО сабміту — payload і листи отримують читабельні ключі.
  function normalizeLeadForm(root, form) {
    form.setAttribute('data-name', 'Checkup Lead');
    // webflow.js серіалізує ключі payload за data-name, тож ставимо обидва атрибути
    var rename = function (el, n) { if (el) { el.name = n; el.setAttribute('data-name', n); } };
    rename(form.querySelector('input[type="email"]'), 'contact-email');
    rename(form.querySelector('input[type="tel"]'), 'phone');
    rename(root.querySelector('[data-quiz="position-wrap"] input'), 'position');
    rename(root.querySelector('[data-quiz="hp-wrap"] input'), 'website');
    rename(root.querySelector('[data-quiz="consent-wrap"] input[type="checkbox"]'), 'consent');
    // решта текстових полів поза wrap-ами: перше — імʼя, друге — компанія
    var free = Array.prototype.filter.call(form.querySelectorAll('input[type="text"]'), function (el) {
      return !el.closest('[data-quiz="position-wrap"]') && !el.closest('[data-quiz="hp-wrap"]');
    });
    rename(free[0], 'contact-name');
    rename(free[1], 'company');
    // дефолтний Webflow-плейсхолдер виглядає як недоробка
    form.querySelectorAll('input').forEach(function (el) {
      if (el.placeholder === 'Example Text') el.placeholder = '';
    });
  }

  function initLeadForm(root, config, state, dom) {
    var wrap = dom.leadFormWrap;
    if (!wrap) return;
    var form = wrap.querySelector('form');
    if (!form) return;
    normalizeLeadForm(root, form);

    var byName = function (n) { return form.querySelector('[name="' + n + '"]'); };
    var checkupName = byName('checkup-name');
    if (checkupName) checkupName.value = config.checkupName || '';

    var posWrap = root.querySelector('[data-quiz="position-wrap"]');
    var posInput = byName('position');
    if (config.type === 'team') {
      if (posInput) posInput.required = true;
    } else {
      if (posWrap) posWrap.classList.add('is-hidden');
      if (posInput) { posInput.required = false; posInput.disabled = true; }
    }

    form.addEventListener('submit', function (e) {
      var hp = byName('website');
      if (hp && hp.value) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      var nameInput = byName('contact-name');
      var emailInput = byName('contact-email');
      state.lead = {
        name: nameInput ? nameInput.value : '',
        email: emailInput ? emailInput.value : ''
      };
    }, true);

    var done = wrap.querySelector('.w-form-done');
    if (done) {
      new MutationObserver(function () {
        if (getComputedStyle(done).display !== 'none' && state.phase === 'lead') {
          state.phase = 'quiz';
          root.classList.remove('is-lead');
          root.classList.add('is-quiz');
          goTo(0, config, state, dom);
          pushEvent('checkup_start', config);
        }
      }).observe(done, { attributes: true, attributeFilter: ['style'] });
    }
  }

  function buildScales(root, config, state, dom) {
    var tpl = dom.scaleTemplate;
    if (!tpl) { console.error('[quiz] no scale button template'); return; }
    var labels = (config.scale && config.scale.labels) || {};
    var labelKeys = Object.keys(labels);
    // підписані лише крайні значення (personal 0/10) → легенда під шкалою,
    // щоб пігулки лишались однакової ширини; підписи на всіх (team) → у кнопках
    var sparse = labelKeys.length > 0 && labelKeys.length * 2 < (config.scale.max - config.scale.min + 1);
    dom.questions.forEach(function (q) {
      var holder = q.querySelector('[data-quiz="scale"]');
      if (!holder) return;
      for (var v = config.scale.min; v <= config.scale.max; v++) {
        (function (val) {
          var btn = tpl.cloneNode(true);
          var valNode = btn.querySelector('[data-scale="val"]');
          var labNode = btn.querySelector('[data-scale="label"]');
          var label = labels[String(val)] || '';
          if (valNode) valNode.textContent = String(val);
          if (labNode) labNode.textContent = sparse ? '' : label;
          btn.setAttribute('data-value', String(val));
          btn.setAttribute('aria-label', label ? val + ' - ' + label : String(val));
          btn.addEventListener('click', function () { onSelect(q, val, config, state, dom); });
          holder.appendChild(btn);
        })(v);
      }
      if (sparse) {
        var legend = document.createElement('div');
        legend.setAttribute('data-quiz', 'scale-legend');
        labelKeys.sort(function (a, b) { return a - b; }).forEach(function (k) {
          var span = document.createElement('span');
          span.textContent = k + ' - ' + labels[k];
          legend.appendChild(span);
        });
        holder.parentNode.insertBefore(legend, holder.nextSibling);
      }
    });
  }

  function onSelect(q, val, config, state, dom) {
    var order = qOrder(q);
    state.answers[order] = val;
    q.classList.add('is-answered');
    q.querySelectorAll('[data-quiz="scale-btn"]').forEach(function (b) {
      b.classList.toggle('is-selected', parseInt(b.getAttribute('data-value'), 10) === val);
    });
    syncNav(config, state, dom);
    if (config.autoAdvance && state.qIndex < dom.questions.length - 1) {
      setTimeout(function () {
        if (state.phase === 'quiz' && state.qIndex < dom.questions.length - 1) {
          goTo(state.qIndex + 1, config, state, dom);
        }
      }, 300);
    }
  }

  // сервісність від клієнтки: підбадьорення на середині тесту
  function withIllustration(el, imgUrl, text) {
    el.textContent = '';
    if (imgUrl) {
      var pic = document.createElement('img');
      pic.src = imgUrl;
      pic.alt = '';
      pic.setAttribute('aria-hidden', 'true');
      el.appendChild(pic);
    }
    var span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
  }

  function buildMilestone(root, config, dom) {
    var text = config.ui && config.ui.milestoneText;
    var progress = root.querySelector('[data-quiz="progress"]');
    if (!text || !progress) return;
    var el = document.createElement('div');
    el.setAttribute('data-quiz', 'milestone');
    withIllustration(el, config.ui.milestoneImage, text);
    progress.parentNode.insertBefore(el, progress.nextSibling);
    dom.milestone = el;
  }

  function goTo(i, config, state, dom) {
    state.qIndex = i;
    if (dom.milestone) {
      dom.milestone.classList.toggle('is-visible', i + 1 === Math.ceil(dom.questions.length / 2));
    }
    dom.questions.forEach(function (q, idx) {
      var active = idx === i;
      q.classList.toggle('is-active', active);
      q.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    var total = dom.questions.length;
    if (dom.stepCounter) {
      var fmt = (config.ui && config.ui.stepFormat) || '{n} із {total}';
      dom.stepCounter.textContent = fmt.replace('{n}', i + 1).replace('{total}', total);
    }
    if (dom.progressBar) dom.progressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
    syncNav(config, state, dom);
    var heading = dom.questions[i].querySelector('[data-quiz="question-text"]');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
  }

  function syncNav(config, state, dom) {
    var i = state.qIndex, total = dom.questions.length;
    var answered = typeof state.answers[qOrder(dom.questions[i])] === 'number';
    if (dom.prev) dom.prev.disabled = i === 0;
    if (dom.next) {
      dom.next.disabled = !answered;
      var last = i === total - 1;
      dom.next.textContent = last
        ? ((config.ui && config.ui.showResultLabel) || 'Показати результат')
        : ((config.ui && config.ui.nextLabel) || 'Далі');
    }
  }

  function initNav(config, state, dom) {
    if (dom.prev) {
      dom.prev.textContent = (config.ui && config.ui.prevLabel) || 'Назад';
      dom.prev.addEventListener('click', function () {
        if (state.qIndex > 0) goTo(state.qIndex - 1, config, state, dom);
      });
    }
    if (dom.next) {
      dom.next.addEventListener('click', function () {
        if (dom.next.disabled) return;
        if (state.qIndex < dom.questions.length - 1) {
          goTo(state.qIndex + 1, config, state, dom);
        } else {
          finish(config, state, dom);
        }
      });
    }
  }

  function finish(config, state, dom) {
    if (state.phase !== 'quiz') return;
    state.phase = 'result';
    var root = document.querySelector('[data-quiz="root"]');
    var computed = score(config, state.answers);
    renderResult(root, config, computed);
    root.classList.remove('is-quiz');
    root.classList.add('is-result');
    pushEvent('checkup_complete', config);
    submitResults(root, config, state, computed);
  }

  function renderResult(root, config, computed) {
    var section = root.querySelector('[data-quiz="result"][data-result-type="' + config.type + '"]');
    if (!section) { console.error('[quiz] no result section for ' + config.type); return; }
    section.classList.add('is-active');

    if (computed.type === 'personal') {
      var entries = [];
      computed.spheres.forEach(function (s) {
        var row = null;
        root.querySelectorAll('[data-result="sphere-row"]').forEach(function (r) {
          var k = r.querySelector('[data-sphere-key]');
          if (k && k.textContent.trim() === s.key) row = r;
        });
        if (!row) { console.error('[quiz] no row for sphere ' + s.key); return; }
        row.classList.add('is-zone-' + s.zone);
        var scoreNode = row.querySelector('[data-result="sphere-score"]');
        if (scoreNode) scoreNode.textContent = fmtScore(s.score, config);
        var bar = row.querySelector('[data-result="sphere-bar"]');
        if (bar) bar.style.width = Math.round((s.score / config.scale.max) * 100) + '%';
        entries.push({ row: row, s: s });
      });
      initDetailPanel(root, section, config, entries);
      if (config.overallRow && config.overallRow.enabled && computed.overall !== null) {
        var overallRow = section.querySelector('[data-result="overall-row"]');
        if (overallRow) {
          overallRow.classList.add('is-visible');
          var ov = overallRow.querySelector('[data-result="overall-score"]');
          if (ov) ov.textContent = fmtScore(computed.overall, config);
        }
      }
    } else {
      var totalNode = section.querySelector('[data-result="total-score"]');
      if (totalNode) {
        var fmt = config.totalFormat || '{score} із {max}';
        totalNode.textContent = fmt.replace('{score}', computed.total).replace('{max}', computed.max);
      }
      if (computed.band) {
        var badge = section.querySelector('[data-result="band-badge"]');
        if (badge && computed.band.zone) badge.classList.add('is-zone-' + computed.band.zone);
        section.classList.add('is-zone-' + (computed.band.zone || ''));
        var bt = section.querySelector('[data-result="band-title"]');
        if (bt) bt.textContent = computed.band.title || '';
        var bx = section.querySelector('[data-result="band-text"]');
        if (bx) bx.textContent = computed.band.text || '';
      }
      if (computed.bandGap) console.error('[quiz] total=' + computed.total + ' hit no band; nearest used');
    }
    var fu = section.querySelector('[data-result="followup"]');
    if (fu && config.ui && config.ui.followupText) {
      withIllustration(fu, config.ui.followupImage, config.ui.followupText);
      fu.classList.add('is-visible');
    }
  }

  // плитки-дашборд: клік по сфері відкриває опис у деталь-панелі,
  // стартово розкрита сфера з найгіршою зоною
  function initDetailPanel(root, section, config, entries) {
    var detail = section.querySelector('[data-result="detail"]');
    if (!detail || !entries.length) return;
    var titleNode = detail.querySelector('[data-result="detail-title"]');
    var bodyNode = detail.querySelector('[data-result="detail-body"]');
    var select = function (e) {
      entries.forEach(function (x) { x.row.classList.remove('is-active'); });
      e.row.classList.add('is-active');
      if (titleNode) titleNode.textContent = sphereNameFromDom(root, e.s.key) + ' - ' + fmtScore(e.s.score, config);
      var src = e.row.querySelector('[data-result="sphere-text"]');
      if (bodyNode) bodyNode.innerHTML = src ? src.innerHTML : '';
      detail.classList.add('is-visible');
    };
    entries.forEach(function (e) {
      e.row.setAttribute('tabindex', '0');
      e.row.setAttribute('role', 'button');
      e.row.addEventListener('click', function () { select(e); });
      e.row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(e); }
      });
    });
    var rank = { red: 0, orange: 1, yellow: 2, green: 3 };
    var start = entries[0];
    entries.forEach(function (e) { if (rank[e.s.zone] < rank[start.s.zone]) start = e; });
    select(start);
  }

  function sphereNameFromDom(root, key) {
    var name = key;
    root.querySelectorAll('[data-result="sphere-row"]').forEach(function (r) {
      var k = r.querySelector('[data-sphere-key]');
      if (k && k.textContent.trim() === key) {
        var n = r.querySelector('[data-result="sphere-name"]');
        if (n) name = n.textContent.trim();
      }
    });
    return name;
  }

  function submitResults(root, config, state, computed) {
    if (state.resultsSubmitted) return;
    state.resultsSubmitted = true;
    try {
      var wrap = dom0(root, '[data-quiz="results-form"]');
      var form = wrap && wrap.querySelector('form');
      if (!form) { console.error('[quiz] results form missing'); return; }
      form.setAttribute('data-name', 'Checkup Results');
      var set = function (n, v) {
        var el = form.querySelector('[name="' + n + '"]');
        if (!el) return;
        // webflow.js серіалізує і disabled-інпути, тому порожні просто видаляємо
        if (v === null || v === undefined || v === '') { el.parentNode.removeChild(el); } else { el.value = v; }
      };
      set('checkup-name', config.checkupName || '');
      set('contact-name', state.lead.name);
      set('contact-email', state.lead.email);
      if (computed.type === 'personal') {
        computed.spheres.forEach(function (s, idx) {
          set('result-' + (idx + 1), sphereNameFromDom(root, s.key) + ': ' + fmtScore(s.score, config) + ' (' + (ZONE_LABELS[s.zone] || s.zone) + ')');
        });
        set('total-score', null);
        set('band-title', null);
        set('overall', computed.overall !== null && config.overallRow && config.overallRow.enabled ? fmtScore(computed.overall, config) : null);
      } else {
        for (var i = 1; i <= 8; i++) set('result-' + i, null);
        set('overall', null);
        set('total-score', computed.total + ' із ' + computed.max);
        set('band-title', computed.band ? computed.band.title : '');
      }
      set('answers-json', JSON.stringify({
        v: config.version, type: config.type, checkup: config.checkupName,
        answers: state.answers, computed: computed
      }));
      var fail = wrap.querySelector('.w-form-fail');
      if (fail) {
        new MutationObserver(function () {
          if (getComputedStyle(fail).display !== 'none') console.error('[quiz] results submit failed');
        }).observe(fail, { attributes: true, attributeFilter: ['style'] });
      }
      var btn = form.querySelector('input[type="submit"], button[type="submit"]');
      if (typeof form.requestSubmit === 'function') form.requestSubmit(btn || undefined);
      else if (btn) btn.click();
    } catch (e) {
      console.error('[quiz] results submit error', e);
    }
  }

  function dom0(root, sel) { return root.querySelector(sel); }

  function pushEvent(name, config) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, checkup_type: config.type, checkup_name: config.checkupName });
    } catch (e) { /* ignore */ }
  }

  // експорт математики для node-тестів
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { score: score, zoneOf: zoneOf, roundTo: roundTo };
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
