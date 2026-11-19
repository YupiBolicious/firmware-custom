const assert = require('assert');
const { addWorkingDays, calculateEta } = require('../src/utils/workingDays');

let checks = 0;
const eq = (actual, expected, label) => {
  checks++;
  assert.strictEqual(actual, expected, `${label}: got ${actual}, expected ${expected}`);
};
const d = (y, m, day) => new Date(y, m - 1, day);

eq(addWorkingDays(d(2026, 11, 20), 1), '2026-11-23', 'Friday + 1 -> Monday');
eq(addWorkingDays(d(2026, 11, 21), 1), '2026-11-23', 'Saturday + 1 -> Monday');
eq(addWorkingDays(d(2026, 11, 22), 1), '2026-11-23', 'Sunday + 1 -> Monday');
eq(addWorkingDays(d(2026, 11, 21), 0), '2026-11-23', 'Saturday + 0 -> Monday');
eq(addWorkingDays(d(2026, 11, 18), 0), '2026-11-18', 'Wednesday + 0 -> same day');
eq(addWorkingDays(d(2026, 11, 20), 2), '2026-11-24', 'Friday + 2 -> Tuesday');
eq(addWorkingDays(d(2026, 12, 31), 1), '2027-01-01', 'year boundary');
eq(addWorkingDays(d(2027, 1, 1), 1), '2027-01-04', 'New Year Friday + 1 -> Monday');
eq(calculateEta(d(2026, 11, 18), 12), '2026-11-20', '12h = 2 working days');
eq(calculateEta(d(2026, 11, 18), '32'), '2026-11-24', '32h numeric string = 4 working days');
eq(calculateEta(d(2026, 11, 18), 0), '2026-11-18', '0h = 0 working days');

console.log(`verify-eta-working-days: OK (${checks} assertions)`);
