'use strict';
const assert = require('assert');
const { score, roundTo } = require('../src/quiz.js');

const personalCfg = {
  version: 1, type: 'personal',
  scale: { min: 0, max: 10 }, decimals: 1,
  questionsTotal: 23, uncounted: [23],
  spheres: [
    { key: 'positive-emotions', questions: [3, 13, 22], reversed: false },
    { key: 'engagement', questions: [2, 10, 17], reversed: false },
    { key: 'relationships', questions: [8, 19, 21], reversed: false },
    { key: 'meaning', questions: [7, 9, 20], reversed: false },
    { key: 'achievement', questions: [1, 5, 15], reversed: false },
    { key: 'health', questions: [6, 12, 18], reversed: false },
    { key: 'negative-emotions', questions: [4, 14, 16], reversed: true },
    { key: 'loneliness', questions: [11], reversed: true }
  ],
  zones: [{ id: 'green', min: 8 }, { id: 'yellow', min: 5 }, { id: 'orange', min: 0 }],
  reversedZoneMode: 'mirror',
  overallRow: { enabled: true, source: 'q23' }
};

const teamCfg = {
  version: 1, type: 'team', scale: { min: 0, max: 4 },
  questionsTotal: 20, uncounted: [],
  bands: [
    { min: 0, max: 20, zone: 'green', title: 'b1' },
    { min: 21, max: 40, zone: 'yellow', title: 'b2' },
    { min: 41, max: 60, zone: 'orange', title: 'b3' },
    { min: 61, max: 80, zone: 'red', title: 'b4' },
    { min: 81, max: 100, zone: 'red', title: 'b5' }
  ]
};

function answersAll(n, v) { const a = {}; for (let i = 1; i <= n; i++) a[i] = v; return a; }
function bySphere(r, key) { return r.spheres.find(s => s.key === key); }

// --- personal: усі 0 ---
let r = score(personalCfg, answersAll(23, 0));
assert.strictEqual(bySphere(r, 'achievement').score, 0);
assert.strictEqual(bySphere(r, 'achievement').zone, 'orange');
// reversed при mirror: 0 → дзеркало 10 → зелена
assert.strictEqual(bySphere(r, 'negative-emotions').zone, 'green');
assert.strictEqual(bySphere(r, 'loneliness').zone, 'green');
assert.strictEqual(r.overall, 0);

// --- personal: усі 10 ---
r = score(personalCfg, answersAll(23, 10));
assert.strictEqual(bySphere(r, 'meaning').score, 10);
assert.strictEqual(bySphere(r, 'meaning').zone, 'green');
assert.strictEqual(bySphere(r, 'negative-emotions').zone, 'orange'); // дзеркало 0
assert.strictEqual(r.overall, 10);

// --- personal: змішаний еталон (пораховано вручну) ---
const mixed = { 1: 7, 5: 8, 15: 9, 2: 5, 10: 6, 17: 7, 3: 9, 13: 8, 22: 10, 4: 3, 14: 2, 16: 4, 6: 4, 12: 5, 18: 3, 7: 10, 9: 9, 20: 8, 8: 6, 19: 7, 21: 5, 11: 2, 23: 7 };
r = score(personalCfg, mixed);
assert.strictEqual(bySphere(r, 'achievement').score, 8);        // (7+8+9)/3=8.0
assert.strictEqual(bySphere(r, 'achievement').zone, 'green');
assert.strictEqual(bySphere(r, 'engagement').score, 6);          // 6.0 yellow
assert.strictEqual(bySphere(r, 'engagement').zone, 'yellow');
assert.strictEqual(bySphere(r, 'positive-emotions').score, 9);   // 9.0 green
assert.strictEqual(bySphere(r, 'negative-emotions').score, 3);   // 3.0, дзеркало 7 → yellow
assert.strictEqual(bySphere(r, 'negative-emotions').zone, 'yellow');
assert.strictEqual(bySphere(r, 'health').score, 4);              // 4.0 orange
assert.strictEqual(bySphere(r, 'health').zone, 'orange');
assert.strictEqual(bySphere(r, 'loneliness').score, 2);          // 2.0, дзеркало 8 → green
assert.strictEqual(bySphere(r, 'loneliness').zone, 'green');
assert.strictEqual(r.overall, 7);                                 // Q23 як є

// --- personal: округлення на межі ---
let edge = Object.assign({}, mixed, { 1: 8, 5: 8, 15: 7 });       // 23/3 = 7.666.. → 7.7 → yellow
r = score(personalCfg, edge);
assert.strictEqual(bySphere(r, 'achievement').score, 7.7);
assert.strictEqual(bySphere(r, 'achievement').zone, 'yellow');
edge = Object.assign({}, mixed, { 1: 8, 5: 8, 15: 8 });           // 8.0 → green
r = score(personalCfg, edge);
assert.strictEqual(bySphere(r, 'achievement').zone, 'green');
// reversed межа: 2,3,3 → 2.7, дзеркало 7.3 → yellow (зелена лише при ≤2.0)
edge = Object.assign({}, mixed, { 4: 2, 14: 3, 16: 3 });
r = score(personalCfg, edge);
assert.strictEqual(bySphere(r, 'negative-emotions').score, 2.7);
assert.strictEqual(bySphere(r, 'negative-emotions').zone, 'yellow');

// --- Q23 не входить у сфери ---
const noQ23 = Object.assign({}, mixed); delete noQ23[23];
const withQ23zero = Object.assign({}, mixed, { 23: 0 });
const a1 = score(personalCfg, noQ23), a2 = score(personalCfg, withQ23zero);
personalCfg.spheres.forEach(s => {
  assert.strictEqual(bySphere(a1, s.key).score, bySphere(a2, s.key).score);
});

// --- team: краї ---
let t = score(teamCfg, answersAll(20, 0));
assert.strictEqual(t.total, 0); assert.strictEqual(t.max, 80); assert.strictEqual(t.band.title, 'b1');
t = score(teamCfg, answersAll(20, 4));
assert.strictEqual(t.total, 80); assert.strictEqual(t.band.title, 'b4'); assert.strictEqual(t.bandGap, false);
// межа 20/21
let a = answersAll(20, 1); assert.strictEqual(score(teamCfg, a).band.title, 'b1'); // 20
a[1] = 2; assert.strictEqual(score(teamCfg, a).band.title, 'b2');                   // 21
// межі 40/41 та 60/61
a = answersAll(20, 2); assert.strictEqual(score(teamCfg, a).band.title, 'b2');      // 40
a[1] = 3; assert.strictEqual(score(teamCfg, a).band.title, 'b3');                   // 41
a = answersAll(20, 3); assert.strictEqual(score(teamCfg, a).band.title, 'b3');      // 60
a[1] = 4; assert.strictEqual(score(teamCfg, a).band.title, 'b4');                   // 61

// --- team: діра в band-ах → найближчий + прапорець ---
const gapCfg = Object.assign({}, teamCfg, { bands: [{ min: 0, max: 10, title: 'x' }, { min: 30, max: 80, title: 'y' }] });
t = score(gapCfg, answersAll(20, 1)); // 20 не влучає
assert.strictEqual(t.bandGap, true);
assert.ok(t.band);

// --- roundTo half-up ---
assert.strictEqual(roundTo(7.95, 1), 8);
assert.strictEqual(roundTo(7.94, 1), 7.9);

console.log('OK: усі фікстури score() пройшли');
