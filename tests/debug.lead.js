'use strict';
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[console:' + m.type() + ']', m.text().slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 400) console.log('[HTTP ' + r.status() + ']', r.url().slice(0, 140)); });
  page.on('request', (r) => { if (r.url().includes('/form')) console.log('[REQ]', r.method(), r.url().slice(0, 140)); });
  await page.route('**/api/v1/form/**', async (route) => {
    console.log('[ROUTE HIT]', route.request().url().slice(0, 120));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('https://rozumiu.webflow.io/checkup/personal', { waitUntil: 'networkidle' });

  console.log('engine:', await page.evaluate(() => window.__rozumiuQuiz ? window.__rozumiuQuiz.version : 'MISSING'));
  console.log('root classes:', await page.evaluate(() => document.querySelector('[data-quiz="root"]').className));

  await page.fill('[data-quiz="lead-form"] [name="contact-name"]', 'Тест');
  await page.fill('[data-quiz="lead-form"] [name="phone"]', '+380501112233');
  await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'test@example.com');
  await page.fill('[data-quiz="lead-form"] [name="company"]', 'QA');
  await page.check('[data-quiz="lead-form"] [name="consent"]');
  await page.click('[data-quiz="lead-form"] input[type="submit"]');
  await page.waitForTimeout(4000);

  console.log('after submit root classes:', await page.evaluate(() => document.querySelector('[data-quiz="root"]').className));
  console.log('done display:', await page.evaluate(() => {
    const d = document.querySelector('[data-quiz="lead-form"] .w-form-done');
    return d ? getComputedStyle(d).display + ' | style=' + d.getAttribute('style') : 'NO NODE';
  }));
  console.log('fail display:', await page.evaluate(() => {
    const d = document.querySelector('[data-quiz="lead-form"] .w-form-fail');
    return d ? getComputedStyle(d).display : 'NO NODE';
  }));
  console.log('form validity:', await page.evaluate(() => {
    const f = document.querySelector('[data-quiz="lead-form"] form');
    return f.checkValidity();
  }));
  await browser.close();
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
