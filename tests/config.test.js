// Гейт на ЖИВІ конфіги, які лежать у CMS: fixtures/*.json — той самий текст,
// що заливається в поле Result Config. Ловить діри в діапазонах, загублені
// питання і довгі тире в текстах, які бачить людина.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { score } = require('../src/quiz.js');

const load = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '.json'), 'utf8'));
const personal = load('personal');
const team = load('team');
let checks = 0;
const ok = (name, cond) => { assert.ok(cond, name); checks++; };

// --- командний: діапазони суцільні, стеля збігається -----------------------
const teamMax = (team.questionsTotal - (team.uncounted || []).length) * team.scale.max;
ok('team: стеля 80', teamMax === 80);
ok('team: перший діапазон з нуля', team.bands[0].min === 0);
ok('team: останній діапазон до стелі', team.bands[team.bands.length - 1].max === teamMax);
team.bands.forEach((b, i) => {
  ok(`team: діапазон ${i + 1} не вивернутий`, b.min <= b.max);
  ok(`team: діапазон ${i + 1} у межах стелі`, b.max <= teamMax);
  if (i) ok(`team: діапазон ${i + 1} стикується з попереднім`, b.min === team.bands[i - 1].max + 1);
  ok(`team: діапазон ${i + 1} має заголовок і текст`, !!b.title && !!b.text && !!b.zone);
});
// кожен можливий бал потрапляє в діапазон без прапорця «діра»
for (let t = 0; t <= teamMax; t++) {
  const answers = {};
  let left = t;
  for (let q = 1; q <= team.questionsTotal; q++) {
    const v = Math.min(team.scale.max, left);
    answers[q] = v; left -= v;
  }
  const r = score(team, answers);
  assert.strictEqual(r.total, t, 'team: сума ' + t);
  assert.ok(r.band, 'team: діапазон для ' + t);
  assert.strictEqual(r.bandGap, false, 'team: діра на ' + t);
}
checks++;

// --- командний: групи покривають усі твердження ----------------------------
const grouped = team.groups.flatMap((g) => g.questions);
ok('team: групи покривають 20 тверджень', grouped.length === team.questionsTotal);
ok('team: у групах немає повторів', new Set(grouped).size === grouped.length);
ok('team: групи від 1 до 20', Math.min(...grouped) === 1 && Math.max(...grouped) === team.questionsTotal);

// --- особистий: сфери покривають усі питання -------------------------------
const inSpheres = personal.spheres.flatMap((s) => s.questions);
ok('personal: 22 питання', personal.questionsTotal === 22);
ok('personal: сфери покривають усі питання', inSpheres.length === personal.questionsTotal);
ok('personal: питання не дублюються між сферами', new Set(inSpheres).size === inSpheres.length);
ok('personal: немає питання поза сферами', (personal.uncounted || []).length === 0);
ok('personal: питання 1..22', Math.min(...inSpheres) === 1 && Math.max(...inSpheres) === 22);
ok('personal: 23-го питання немає', !inSpheres.includes(23));
ok('personal: рядок «Загальне благополуччя» прибрано', !personal.overallRow || !personal.overallRow.enabled);

// --- особистий: зони і дзеркало для reversed -------------------------------
const zoneIds = personal.zones.map((z) => z.id);
ok('personal: три зони', zoneIds.join(',') === 'green,yellow,orange');
ok('personal: дзеркало для reversed', personal.reversedZoneMode === 'mirror');
const worst = score(personal, Object.fromEntries(Array.from({ length: 22 }, (_, i) => [i + 1, 10])));
const neg = worst.spheres.find((s) => s.key === 'negative-emotions');
ok('personal: 10 балів негативних емоцій це помаранчева зона', neg.zone === 'orange');
const lone = worst.spheres.find((s) => s.key === 'loneliness');
ok('personal: 10 балів самотності це помаранчева зона', lone.zone === 'orange');

// --- блоки під результатом -------------------------------------------------
const TYPES = ['legend', 'text', 'map', 'print'];
[['personal', personal], ['team', team]].forEach(([name, cfg]) => {
  ok(`${name}: блоки під результатом є`, Array.isArray(cfg.outro) && cfg.outro.length > 0);
  cfg.outro.forEach((b, i) => {
    ok(`${name}: тип блоку ${i + 1} відомий`, TYPES.includes(b.type));
    if (b.type === 'legend') {
      ok(`${name}: у легенді є пункти`, b.items.length > 0);
      b.items.forEach((it) => ok(`${name}: зона пункту легенди відома`, zoneIds.includes(it.zone)));
    }
    if (b.type === 'map') ok(`${name}: у карти є колонки`, b.columns.length > 0);
    if (b.type === 'print') ok(`${name}: у кнопки друку є підпис`, !!b.label);
  });
  ok(`${name}: кнопка друку рівно одна`, cfg.outro.filter((b) => b.type === 'print').length === 1);
});

// --- тексти для людей: без довгих тире -------------------------------------
[['personal', personal], ['team', team]].forEach(([name, cfg]) => {
  const dashes = (JSON.stringify(cfg).match(/[—–]/g) || []).length;
  ok(`${name}: жодного довгого тире`, dashes === 0);
});

console.log('config.test.js: OK, перевірок ' + checks);
