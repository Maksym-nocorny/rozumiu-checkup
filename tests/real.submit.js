'use strict';
/* РЕАЛЬНИЙ прогін чек-апу на staging: форми НЕ мокаються — сабміти летять у Webflow Forms, сповіщення
 * клієнтці на пошту і далі у вебхук сайту. Лише для свідомої перевірки ланцюга, про лист її попередити.
 * CHECKUP=team|personal (за замовчуванням personal), дані лише TEST + maksym@nocorny.agency. */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'https://rozumiu.webflow.io';
const TYPE = process.env.CHECKUP === 'team' ? 'team' : 'personal';
const VALUES = {
  personal: [7, 5, 9, 3, 8, 4, 10, 6, 9, 6, 2, 5, 8, 2, 9, 4, 7, 3, 7, 8, 5, 10],
  team: [2, 1, 3, 0, 4, 2, 1, 3, 2, 0, 4, 1, 3, 2, 1, 4, 0, 2, 3, 1],
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const posted = [];
  page.on('response', (r) => { if (r.url().includes('/api/v1/form/')) posted.push({ status: r.status(), url: r.url().slice(0, 80) }); });
  await page.goto(BASE + '/checkup/' + TYPE, { waitUntil: 'networkidle' });
  await page.fill('[data-quiz="lead-form"] [name="contact-name"]', 'TEST');
  await page.fill('[data-quiz="lead-form"] [name="phone"]', '+380000000000');
  await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'maksym@nocorny.agency');
  await page.fill('[data-quiz="lead-form"] [name="company"]', 'TEST');
  if (TYPE === 'team') {
    await page.fill('[data-quiz="lead-form"] [name="position"]', 'TEST');
    await page.selectOption('[data-quiz="lead-form"] [name="company-size"]', { index: 1 });
  }
  await page.check('[data-quiz="lead-form"] [name="consent"]');
  await page.click('[data-quiz="lead-form"] input[type="submit"]');
  await page.locator('[data-quiz="question"].is-active').waitFor({ timeout: 10000 });
  const values = VALUES[TYPE];
  for (let i = 0; i < values.length; i++) {
    const active = page.locator('[data-quiz="question"].is-active');
    await active.waitFor({ state: 'visible' });
    await active.locator(`[data-quiz="scale-btn"][data-value="${values[i]}"]`).click();
    await page.locator('[data-quiz="next"]').click();
  }
  await page.locator(`[data-quiz="result"][data-result-type="${TYPE}"]`).waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2500);
  console.log(JSON.stringify({ type: TYPE, posted, resultVisible: true }));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
