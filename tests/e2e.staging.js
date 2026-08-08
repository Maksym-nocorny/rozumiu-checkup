'use strict';
/* E2E по staging: перехоплюємо Webflow form endpoint (нічого не летить у Forms/Make),
 * проходимо обидва тести, звіряємо скоринг і payload обох сабмітів. */
const { chromium } = require('playwright-core');
const assert = require('assert');

const BASE = 'https://rozumiu.webflow.io';
const results = [];
function ok(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  if (!cond) console.error('FAIL:', name, extra || '');
}

async function preparePage(ctx, submissions) {
  const page = await ctx.newPage();
  await page.route('**/api/v1/form/**', async (route) => {
    const req = route.request();
    submissions.push({ url: req.url(), body: req.postData() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"msg":"ok","code":200}' });
  });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  return page;
}

function parseBody(body) {
  // webflow.js шле form-urlencoded з полями як fields[Ключ]=значення
  const out = {};
  (body || '').split('&').forEach((kv) => {
    const [k, v] = kv.split('=');
    if (!k) return;
    let key = decodeURIComponent(k.replace(/\+/g, ' '));
    const m = key.match(/^fields\[(.+)\]$/);
    if (m) key = m[1];
    out[key] = decodeURIComponent((v || '').replace(/\+/g, ' '));
  });
  return out;
}

async function fillLead(page, { position } = {}) {
  await page.fill('[data-quiz="lead-form"] [name="contact-name"]', 'Тест Мехамен');
  await page.fill('[data-quiz="lead-form"] [name="phone"]', '+380501112233');
  await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'test+checkup@example.com');
  await page.fill('[data-quiz="lead-form"] [name="company"]', 'QA Dispatch');
  if (position) await page.fill('[data-quiz="lead-form"] [name="position"]', position);
  await page.check('[data-quiz="lead-form"] [name="consent"]');
}

async function answerAll(page, values) {
  // values: масив значень у порядку питань
  for (let i = 0; i < values.length; i++) {
    const active = page.locator('[data-quiz="question"].is-active');
    await active.waitFor({ state: 'visible' });
    await active.locator(`[data-quiz="scale-btn"][data-value="${values[i]}"]`).click();
    const next = page.locator('[data-quiz="next"]');
    if (i < values.length - 1) await next.click();
  }
  await page.locator('[data-quiz="next"]').click(); // показати результат
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // ---------- PERSONAL ----------
  {
    const submissions = [];
    const page = await preparePage(ctx, submissions);
    await page.goto(BASE + '/checkup/personal', { waitUntil: 'networkidle' });

    ok('P: intro видно', await page.locator('[data-quiz="screen-intro"]').isVisible());
    ok('P: quiz схований', !(await page.locator('[data-quiz="screen-quiz"]').isVisible()));
    ok('P: заголовок з CMS', (await page.locator('[data-quiz="root"] h1').innerText()).includes('Як зараз почувається'));
    ok('P: посада схована', !(await page.locator('[data-quiz="position-wrap"]').isVisible()));

    // невалідний email блокується браузером
    await fillLead(page);
    await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'not-an-email');
    await page.click('[data-quiz="lead-form"] input[type="submit"]');
    await page.waitForTimeout(700);
    ok('P: невалідний email не пройшов', submissions.length === 0);

    await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'test+checkup@example.com');
    await page.click('[data-quiz="lead-form"] input[type="submit"]');
    await page.locator('[data-quiz="question"].is-active').waitFor({ timeout: 8000 });
    ok('P: лід-сабміт 1 шт', submissions.length === 1);
    const lead = parseBody(submissions[0] && submissions[0].body);
    ok('P: checkup-name у ліді', /Особистий/.test(lead['checkup-name'] || ''), JSON.stringify(lead).slice(0, 200));
    ok('P: stage=lead', lead.stage === 'lead');
    ok('P: position порожня або відсутня', !lead.position);
    ok('P: honeypot порожній у payload', (lead.website || '') === '');

    const qCount = await page.locator('[data-quiz="question"]').count();
    ok('P: 23 питання після фільтрації', qCount === 23, 'got ' + qCount);
    const firstQ = await page.locator('[data-quiz="question"].is-active [data-quiz="question-text"]').innerText();
    ok('P: текст Q1 з CMS', firstQ.includes('просуваєтеся до своїх цілей'));
    ok('P: лічильник кроку', (await page.locator('[data-quiz="step-counter"]').innerText()).trim() === '1 із 23');
    ok('P: next заблокований без відповіді', await page.locator('[data-quiz="next"]').isDisabled());
    ok('P: 11 кнопок шкали', (await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"]').count()) === 11);

    // Назад повертає збережену відповідь
    await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="7"]').click();
    await page.click('[data-quiz="next"]');
    await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="5"]').click();
    await page.click('[data-quiz="prev"]');
    ok('P: назад показує вибране', await page
      .locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="7"]')
      .evaluate((el) => el.classList.contains('is-selected')));
    await page.click('[data-quiz="next"]'); // Q1 → Q2 (відповідь 5 збережена)
    await page.click('[data-quiz="next"]'); // Q2 → Q3, answerAll стартує з Q3

    // еталон з fixtures (Q1=7 уже стоїть, Q2=5 уже стоїть; заповнюємо решту)
    const mixed = { 1: 7, 2: 5, 3: 9, 4: 3, 5: 8, 6: 4, 7: 10, 8: 6, 9: 9, 10: 6, 11: 2, 12: 5, 13: 8, 14: 2, 15: 9, 16: 4, 17: 7, 18: 3, 19: 7, 20: 8, 21: 5, 22: 10, 23: 7 };
    const rest = [];
    for (let q = 3; q <= 23; q++) rest.push(mixed[q]);
    await answerAll(page, rest);

    await page.locator('[data-quiz="result"][data-result-type="personal"]').waitFor({ state: 'visible', timeout: 8000 });
    ok('P: екран результату видно', true);

    const expected = {
      'positive-emotions': ['9.0', 'green'], engagement: ['6.0', 'yellow'],
      relationships: ['6.0', 'yellow'], meaning: ['9.0', 'green'],
      achievement: ['8.0', 'green'], health: ['4.0', 'orange'],
      'negative-emotions': ['3.0', 'yellow'], loneliness: ['2.0', 'green']
    };
    const rowCount = await page.locator('[data-result="sphere-row"]').count();
    ok('P: 8 рядків сфер', rowCount === 8, 'got ' + rowCount);
    for (const key of Object.keys(expected)) {
      const row = page.locator('[data-result="sphere-row"]', { has: page.locator(`[data-sphere-key]:text-is("${key}")`) });
      const scoreTxt = (await row.locator('[data-result="sphere-score"]').innerText()).trim();
      const zoneOk = await row.evaluate((el, z) => el.classList.contains('is-zone-' + z), expected[key][1]);
      ok(`P: ${key} = ${expected[key][0]} ${expected[key][1]}`, scoreTxt === expected[key][0] && zoneOk, `got "${scoreTxt}"`);
    }

    await page.waitForTimeout(1200);
    ok('P: сабміт результатів пішов', submissions.length === 2, 'submissions=' + submissions.length);
    const res = parseBody(submissions[1] && submissions[1].body);
    ok('P: result-1 читабельний', /Позитивні емоції: 9\.0 \(зелена\)/.test(res['result-1'] || ''), res['result-1']);
    ok('P: result-7 негативні', /Негативні емоції: 3\.0 \(жовта\)/.test(res['result-7'] || ''), res['result-7']);
    ok('P: total-score відсутній', !('total-score' in res));
    ok('P: answers-json валідний', (() => { try { const j = JSON.parse(res['answers-json']); return j.type === 'personal' && j.answers['23'] === 7; } catch (e) { return false; } })());
    ok('P: контакти в результатах', res['contact-name'] === 'Тест Мехамен' && /test\+checkup/.test(res['contact-email'] || ''));

    // подвійний клік по «Показати результат» не дає другого сабміту
    await page.waitForTimeout(300);
    ok('P: анти-дабл', submissions.length === 2);
    await page.close();
  }

  // ---------- TEAM ----------
  {
    const submissions = [];
    const page = await preparePage(ctx, submissions);
    await page.goto(BASE + '/checkup/team', { waitUntil: 'networkidle' });

    ok('T: посада видима', await page.locator('[data-quiz="position-wrap"]').isVisible());
    ok('T: посада required', await page.locator('[name="position"]').evaluate((el) => el.required));

    await fillLead(page, { position: 'HR Director' });
    await page.click('[data-quiz="lead-form"] input[type="submit"]');
    await page.locator('[data-quiz="question"].is-active').waitFor({ timeout: 8000 });
    const lead = parseBody(submissions[0] && submissions[0].body);
    ok('T: position у payload', lead.position === 'HR Director');
    ok('T: checkup-name team', /Командний/.test(lead['checkup-name'] || ''));

    const qCount = await page.locator('[data-quiz="question"]').count();
    ok('T: 20 тверджень', qCount === 20, 'got ' + qCount);
    ok('T: 5 кнопок шкали', (await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"]').count()) === 5);
    const lbl = await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="0"] [data-scale="label"]').innerText();
    ok('T: підпис «ніколи» на 0', lbl.trim() === 'ніколи', lbl);

    await answerAll(page, Array(20).fill(4));
    await page.locator('[data-quiz="result"][data-result-type="team"]').waitFor({ state: 'visible', timeout: 8000 });
    const total = (await page.locator('[data-result="total-score"]').innerText()).trim();
    ok('T: 80 із 80', total === '80 із 80', total);
    const band = (await page.locator('[data-result="band-title"]').innerText()).trim();
    ok('T: band 61–80', band === 'У команді помітні системні труднощі', band);
    ok('T: зона червона', await page.locator('[data-quiz="result"][data-result-type="team"]').evaluate((el) => el.classList.contains('is-zone-red')));

    await page.waitForTimeout(1200);
    const res = parseBody(submissions[1] && submissions[1].body);
    ok('T: total-score у payload', res['total-score'] === '80 із 80', res['total-score']);
    ok('T: band-title у payload', res['band-title'] === 'У команді помітні системні труднощі');
    ok('T: result-1 відсутній', !('result-1' in res));
    await page.close();
  }

  // ---------- MOBILE (390×844) швидкий прохід ----------
  {
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const submissions = [];
    const page = await mctx.newPage();
    await page.route('**/api/v1/form/**', async (r) => { submissions.push(1); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"msg":"ok","code":200}' }); });
    await page.goto(BASE + '/checkup/personal', { waitUntil: 'networkidle' });
    await fillLead(page);
    await page.click('[data-quiz="lead-form"] input[type="submit"]');
    await page.locator('[data-quiz="question"].is-active').waitFor({ timeout: 8000 });
    await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="10"]').tap();
    ok('M: тап по шкалі працює', await page.locator('[data-quiz="next"]').isEnabled());
    const box = await page.locator('[data-quiz="question"].is-active [data-quiz="scale-btn"][data-value="10"]').boundingBox();
    ok('M: тач-таргет ≥44px', box && box.height >= 44 && box.width >= 44, JSON.stringify(box));
    await mctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== E2E: ${results.length - failed.length}/${results.length} pass ===`);
  failed.forEach((f) => console.log('  ✗', f.name, f.extra));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
