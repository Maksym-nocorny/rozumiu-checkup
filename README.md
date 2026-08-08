# Rozumiu Wellbeing Check-up engine

CMS-driven multi-step quiz engine for the Rozumiu Webflow site.

- `src/quiz.js` - движок тестів (personal: середні по сферах; team: сума + діапазони). Конфіг читається з CMS-поля `result-config` через прихований вузол `[data-quiz="config"]`.
- `src/popup.js` - промо-попап (site-wide, шукає `[data-popup="root"]`).
- `tests/score.test.js` - фікстури математики (`node tests/score.test.js`).
- Підключення: jsDelivr із pinned-тегом + SRI, hosted registered script на template-сторінку Checkups.

Реліз: правка `src/` → `npm run build` → тест → коміт → новий тег `vX.Y.Z` → оновити версію+SRI у Webflow registered script.
