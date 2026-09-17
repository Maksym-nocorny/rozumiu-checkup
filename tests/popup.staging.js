'use strict';
/* Popup check on a live site (default staging). BASE=https://www.rozumiu.ua to run on production.
 * NODE_PATH=<playwright> SHOTS=<dir> node tests/popup.staging.js */
const { chromium } = require('playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'https://rozumiu.webflow.io';
const SHOTS = process.env.SHOTS || __dirname;
const tag = BASE.includes('webflow.io') ? 'stg' : 'prod';
const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond }); console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + JSON.stringify(extra) : '')); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const fresh = async (w = 1440, h = 900) => browser.newContext({ viewport: { width: w, height: h } });
  const title = (page) => page.evaluate(() => { const t = document.querySelector('.rzp-title'); return t ? t.textContent : null; });

  // 1. test mode, desktop, team popup on /about, real font and stacking over the navbar
  let ctx = await fresh(); let page = await ctx.newPage();
  await page.goto(BASE + '/about?popup-test', { waitUntil: 'load' });
  await page.waitForSelector('.rzp-title', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('team popup on /about (test mode)', (await title(page)) === 'Що насправді відбуваєтьсяз вашою командою?', await title(page));
  const d = await page.evaluate(() => {
    const card = document.querySelector('.rzp-card').getBoundingClientRect();
    const img = document.querySelector('.rzp-head img');
    const topEl = document.elementFromPoint(40, 40);
    return { cardW: Math.round(card.width), cardH: Math.round(card.height), font: getComputedStyle(document.querySelector('.rzp-title')).fontFamily, imgOk: !!(img && img.naturalWidth), overNavbar: !!(topEl && topEl.closest('.rzp')), btn: getComputedStyle(document.querySelector('.rzp-btn')).backgroundColor };
  });
  ok('desktop card 580', d.cardW === 580, d);
  ok('site font', /aeroport/i.test(d.font), d.font);
  ok('illustration loaded', d.imgOk);
  ok('overlay covers navbar', d.overNavbar);
  ok('blue button', d.btn === 'rgb(49, 48, 211)', d.btn);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-popup-team-1440.png`) });
  await Promise.all([page.waitForURL(/\/checkup\/team/, { timeout: 15000 }).catch(() => {}), page.click('.rzp-btn')]);
  ok('button opens team check-up', /\/checkup\/team/.test(page.url()), page.url());
  await ctx.close();

  // 2. test mode, mobile, personal popup on a blog article
  ctx = await fresh(390, 844); page = await ctx.newPage();
  await page.goto(BASE + '/blog/pro-vidavnichu-spravu?popup-test', { waitUntil: 'load' });
  await page.waitForSelector('.rzp-title', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('personal popup on blog article (mobile)', (await title(page)) === 'Як ваші справиз ресурсом?', await title(page));
  const m = await page.evaluate(() => ({ cardW: Math.round(document.querySelector('.rzp-card').getBoundingClientRect().width), btnW: Math.round(document.querySelector('.rzp-btn').getBoundingClientRect().width), scrollW: document.documentElement.scrollWidth, btn: getComputedStyle(document.querySelector('.rzp-btn')).backgroundColor, img: !!document.querySelector('.rzp-head img').naturalWidth }));
  ok('mobile card 358, button full width', m.cardW === 358 && m.btnW === 326, m);
  ok('yellow button', m.btn === 'rgb(254, 194, 62)', m.btn);
  ok('mobile illustration loaded', m.img);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-popup-personal-390.png`) });
  await page.keyboard.press('Escape');
  ok('Escape closes', await page.evaluate(() => !document.querySelector('.rzp')));
  await ctx.close();

  // 3. real rules: fresh visitor on /faq sees the popup after 10 s, not before, and not again
  ctx = await fresh(); page = await ctx.newPage();
  await page.goto(BASE + '/faq', { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  ok('nothing before 10 s on /faq', (await title(page)) === null);
  await page.waitForSelector('.rzp-title', { timeout: 8000 }).catch(() => {});
  ok('personal popup after 10 s on /faq', (await title(page)) === 'Як ваші справиз ресурсом?', await title(page));
  ok('shown time stored', !!(await page.evaluate(() => localStorage.getItem('rozumiu-popup-last'))));
  await page.click('.rzp-close');
  await page.goto(BASE + '/about', { waitUntil: 'load' });
  await page.waitForTimeout(12500);
  ok('no second popup in the same week', (await title(page)) === null);
  await ctx.close();

  // 4. English version never shows
  ctx = await fresh(); page = await ctx.newPage();
  await page.goto(BASE + '/en/about', { waitUntil: 'load' });
  await page.waitForTimeout(12500);
  ok('no popup on /en/about', (await title(page)) === null);
  await ctx.close();

  // 5. visiting a check-up page silences popups
  ctx = await fresh(); page = await ctx.newPage();
  await page.goto(BASE + '/checkup/team', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const q = await page.evaluate(() => parseInt(localStorage.getItem('rozumiu-popup-quiet-until'), 10) - Date.now());
  ok('check-up visit sets 30 days quiet', q > 29 * 864e5, q);
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(12500);
  ok('no popup after check-up visit', (await title(page)) === null);
  await ctx.close();

  // 6. page without a popup
  ctx = await fresh(); page = await ctx.newPage();
  await page.goto(BASE + '/contact', { waitUntil: 'load' });
  await page.waitForTimeout(12500);
  ok('no popup on /contact', (await title(page)) === null);
  await ctx.close();

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`popup ${tag}: ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
