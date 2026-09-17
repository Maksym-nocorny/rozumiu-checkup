'use strict';
/* Local check of dist/popup.min.js: fake pages under https://rozumiu.webflow.io with the same
 * hidden CMS data markup the site renders, fake clock for the 10 s delay.
 * NODE_PATH=<playwright> node tests/popup.local.js */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'dist', 'popup.min.js'), 'utf8');
const results = [];
const ok = (name, cond, extra) => { results.push({ name, pass: !!cond }); if (!cond) console.error('FAIL:', name, extra || ''); };

const item = (o) => `
<div role="listitem" class="w-dyn-item" data-popup-item="">
  <div data-popup-field="title">${o.title}</div>
  <div data-popup-field="accent">${o.accent}</div>
  <div data-popup-field="text">${o.text}</div>
  <div data-popup-field="button">${o.button}</div>
  <div data-popup-field="link">${o.link}</div>
  <div data-popup-field="pages">${o.pages}</div>
  <div data-popup-field="color">${o.color}</div>
  <img data-popup-field="image" src="https://cdn.prod.website-files.com/66c4727995c0791bec5a55dc/68f764d8b403cc05b61ab6b6_image%207.webp" loading="lazy" alt="">
</div>`;

const html = (lang) => `<!doctype html><html lang="${lang}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:Arial"><a href="#" id="first">first</a><div style="height:3000px">page</div>
<div class="w-dyn-list" style="display:none"><div role="list" class="w-dyn-items">
${item({ title: 'Що насправді відбувається', accent: 'з вашою командою?', text: 'Короткий чек-ап допоможе подивитися на стан команди.', button: 'Пройти командний чек-ап', link: '/checkup/team', pages: '/, /education, /webinars, /about', color: 'Blue' })}
${item({ title: 'Як ваші справи', accent: 'з ресурсом?', text: 'Пройдіть короткий чек-ап особистого добробуту.', button: 'Пройти чек-ап', link: '/checkup/personal', pages: '/blog\n/blog/*\n/team\n/vacansies\n/faq', color: 'Yellow' })}
</div></div>
<script>${SCRIPT}</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('https://rozumiu.webflow.io/**', (route) => {
    const u = new URL(route.request().url());
    const lang = u.pathname.startsWith('/en') ? 'en' : 'uk';
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html(lang) });
  });
  const page = await ctx.newPage();
  await page.clock.install();
  const B = 'https://rozumiu.webflow.io';
  const open = async (p) => { await page.goto(B + p); };
  const popupTitle = () => page.evaluate(() => { const t = document.querySelector('.rzp-title'); return t ? t.textContent : null; });
  const clear = () => page.evaluate(() => localStorage.clear());

  // 1. blog article, before and after 10 s
  await open('/blog/some-article'); await clear(); await open('/blog/some-article');
  await page.clock.runFor(9000);
  ok('no popup before 10 s', (await popupTitle()) === null);
  await page.clock.runFor(1500);
  ok('personal popup on blog article after 10 s', (await popupTitle()) === 'Як ваші справиз ресурсом?', await popupTitle());
  const info = await page.evaluate(() => ({
    color: document.querySelector('.rzp').getAttribute('data-color'),
    focus: document.activeElement && document.activeElement.className,
    role: document.querySelector('.rzp-card').getAttribute('role'),
    href: document.querySelector('.rzp-btn').getAttribute('href'),
    last: localStorage.getItem('rozumiu-popup-last'),
    overflow: document.documentElement.style.overflow,
    z: getComputedStyle(document.querySelector('.rzp')).zIndex,
    cardW: document.querySelector('.rzp-card').getBoundingClientRect().width,
  }));
  ok('yellow theme', info.color === 'yellow');
  ok('focus on dialog card', info.focus === 'rzp-card');
  ok('dialog role', info.role === 'dialog');
  ok('button link', info.href === '/checkup/personal');
  ok('shown timestamp stored', !!info.last);
  ok('page scroll locked', info.overflow === 'hidden');
  ok('card 580 on desktop', Math.round(info.cardW) === 580, info.cardW);
  await page.keyboard.press('Escape');
  ok('Escape closes', (await page.evaluate(() => !document.querySelector('.rzp'))));
  ok('scroll restored', (await page.evaluate(() => document.documentElement.style.overflow)) === '');

  // 2. repeat within 7 days
  await open('/'); await page.clock.runFor(11000);
  ok('no second popup within 7 days', (await popupTitle()) === null);
  await page.clock.runFor(8 * 864e5);
  await open('/'); await page.clock.runFor(11000);
  ok('team popup on home after 7 days', (await popupTitle()) === 'Що насправді відбуваєтьсяз вашою командою?', await popupTitle());
  ok('blue theme', (await page.evaluate(() => document.querySelector('.rzp').getAttribute('data-color'))) === 'blue');
  await page.mouse.click(20, 20);
  ok('overlay click closes', await page.evaluate(() => !document.querySelector('.rzp')));

  // 3. CTA sets 30 days of quiet
  await clear(); await open('/about'); await page.clock.runFor(11000);
  ok('team popup on /about', (await popupTitle()) !== null);
  await page.evaluate(() => document.querySelector('.rzp-btn').addEventListener('click', (e) => e.preventDefault()));
  await page.click('.rzp-btn');
  const quiet = await page.evaluate(() => parseInt(localStorage.getItem('rozumiu-popup-quiet-until'), 10));
  ok('CTA sets ~30 days quiet', quiet - Date.now() > 29 * 864e5, quiet - Date.now());

  // 4. check-up page sets quiet
  await clear(); await open('/checkup/personal'); await page.clock.runFor(11000);
  ok('no popup on check-up page', (await popupTitle()) === null);
  ok('check-up page sets quiet', !!(await page.evaluate(() => localStorage.getItem('rozumiu-popup-quiet-until'))));
  await open('/blog'); await page.clock.runFor(11000);
  ok('quiet blocks popup after check-up visit', (await popupTitle()) === null);

  // 5. page rules
  for (const [p, want] of [['/blog', 'personal'], ['/team', 'personal'], ['/vacansies/', 'personal'], ['/faq', 'personal'], ['/education', 'team'], ['/webinars', 'team'], ['/contact', null], ['/team/someone', null], ['/en', null], ['/en/blog/x', null]]) {
    await clear(); await open(p); await page.clock.runFor(11000);
    const t = await popupTitle();
    const got = t === null ? null : (t.indexOf('команд') > -1 ? 'team' : 'personal');
    ok(`page ${p} -> ${want}`, got === want, got);
  }

  // 6. close button, tab trap, test mode
  await clear(); await open('/faq?popup-test'); await page.clock.runFor(1200);
  ok('test mode shows after 1 s', (await popupTitle()) !== null);
  ok('test mode does not store', (await page.evaluate(() => localStorage.getItem('rozumiu-popup-last'))) === null);
  await page.keyboard.press('Tab');
  ok('tab moves to close', (await page.evaluate(() => document.activeElement.className)) === 'rzp-close');
  await page.keyboard.press('Tab');
  ok('tab moves to button', (await page.evaluate(() => document.activeElement.className)) === 'rzp-btn');
  await page.keyboard.press('Tab');
  ok('tab wraps to close', (await page.evaluate(() => document.activeElement.className)) === 'rzp-close');
  await page.click('.rzp-close');
  ok('close button closes', await page.evaluate(() => !document.querySelector('.rzp')));

  // 7. mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await clear(); await open('/blog?popup-test'); await page.clock.runFor(1200);
  const m = await page.evaluate(() => ({
    cardW: document.querySelector('.rzp-card').getBoundingClientRect().width,
    btnW: document.querySelector('.rzp-btn').getBoundingClientRect().width,
    closeW: document.querySelector('.rzp-close').getBoundingClientRect().width,
    scrollW: document.documentElement.scrollWidth,
  }));
  ok('mobile card 358', Math.round(m.cardW) === 358, m.cardW);
  ok('mobile button full width', Math.round(m.btnW) === 326, m.btnW);
  ok('mobile close 48', Math.round(m.closeW) === 48, m.closeW);
  ok('no horizontal scroll', m.scrollW <= 390, m.scrollW);
  await page.screenshot({ path: path.join(__dirname, 'popup-local-390.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await clear(); await open('/?popup-test'); await page.clock.runFor(1200);
  await page.screenshot({ path: path.join(__dirname, 'popup-local-1440.png') });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`popup local: ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
