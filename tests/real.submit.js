'use strict';
/* РЕАЛЬНИЙ прогін особистого тесту на staging: форми НЕ мокаються — сабміти летять у Webflow Forms
 * (і далі у вебхук сайту). Використовувати лише для перевірки ланцюга; сабмішени потім видалити
 * через scripts/rozumiu_forms.sh delete <id>. */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'https://rozumiu.webflow.io';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const posted = [];
  page.on('response', (r) => { if (r.url().includes('/api/v1/form/')) posted.push({ status: r.status(), url: r.url().slice(0, 80) }); });
  await page.goto(BASE + '/checkup/personal', { waitUntil: 'networkidle' });
  await page.fill('[data-quiz="lead-form"] [name="contact-name"]', 'ТЕСТ NoCorny (видалити)');
  await page.fill('[data-quiz="lead-form"] [name="phone"]', '+380000000000');
  await page.fill('[data-quiz="lead-form"] [name="contact-email"]', 'mechaman-test@nocorny.agency');
  await page.fill('[data-quiz="lead-form"] [name="company"]', 'NoCorny QA');
  await page.check('[data-quiz="lead-form"] [name="consent"]');
  await page.click('[data-quiz="lead-form"] input[type="submit"]');
  await page.locator('[data-quiz="question"].is-active').waitFor({ timeout: 10000 });
  const values = [7,5,9,3,8,4,10,6,9,6,2,5,8,2,9,4,7,3,7,8,5,10];
  for (let i = 0; i < values.length; i++) {
    const active = page.locator('[data-quiz="question"].is-active');
    await active.waitFor({ state: 'visible' });
    await active.locator(`[data-quiz="scale-btn"][data-value="${values[i]}"]`).click();
    await page.locator('[data-quiz="next"]').click();
  }
  await page.locator('[data-quiz="result"][data-result-type="personal"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2500);
  const tiles = await page.locator('[data-result="sphere-row"]').count();
  console.log(JSON.stringify({ posted, tiles, resultVisible: true }));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
