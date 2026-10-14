// Free-standing number boundaries: a number touching a letter/dot/slash/colon/hyphen/percent is technical.
const NUM_LEFT = '(?<![\\w./:\\-])';
const NUM_RIGHT = '(?![\\w./:\\-%])';
const MULTIPLIER_RE = new RegExp(`${NUM_LEFT}(\\d+)\\s*[xX]${NUM_RIGHT}`, 'g');
const COUNT_RE = new RegExp(`${NUM_LEFT}(\\d+)${NUM_RIGHT}`, 'g');

// Next-word units are technical, never a count ("5 Amps"). Denylist only — no component-noun allowlist, so arbitrary counts ("2 EO", "3 brackets") still count.
const UNIT_WORDS = new Set([
  'amp', 'amps', 'ampere', 'amperes', 'a', 'v', 'vac', 'vdc', 'volt', 'volts',
  'hz', 'khz', 'mhz', 'w', 'kw', 'va', 'mm', 'cm', 'meter', 'meters', 'metre',
  'ft', 'feet', 'foot', 'inch', 'in', 'kg', 'g', 'mg', 'lb', 'lbs', 'c', 'f',
  'ra', 'bar', 'psi', 'rpm', 'l', 'litre', 'liter', 'ml', 's', 'sec', 'secs',
  'second', 'seconds', 'min', 'mins', 'minute', 'minutes', 'hr', 'hrs', 'hour',
  'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  '%', 'no', 'nos', 'sr',
]);

const ACCEPT_MIN_CONFIDENCE = 0.75;

const nextWord = (text, from) => {
  const m = text.slice(from).match(/^\s*([A-Za-z%][A-Za-z%]*)/);
  return m ? m[1].toLowerCase().replace(/[^a-z%]/g, '') : '';
};

const result = (quantity, evidence, confidence, source) => ({
  quantity,
  evidence,
  confidence,
  source,
  needs_review: confidence < ACCEPT_MIN_CONFIDENCE,
});

const resolveQuantity = (text) => {
  const raw = text == null ? '' : String(text);

  // A. Explicit multipliers, summed, anywhere in the title ("2x", "2 x", "2X").
  const multipliers = [...raw.matchAll(MULTIPLIER_RE)];
  if (multipliers.length) {
    const total = multipliers.reduce((sum, m) => sum + (parseInt(m[1], 10) || 0), 0);
    if (total > 0) {
      return result(total, multipliers.map((m) => m[0].trim()), 0.95, 'EXPLICIT');
    }
  }

  // B. Generic free-standing count: first valid one, skipping unit-followed numbers.
  for (const m of raw.matchAll(COUNT_RE)) {
    const value = parseInt(m[1], 10) || 0;
    if (value < 1) continue;
    if (UNIT_WORDS.has(nextWord(raw, (m.index || 0) + m[0].length))) continue;
    return result(value, [m[0]], 0.8, 'GENERIC');
  }

  // C. Nothing valid found.
  return result(1, [], 0, 'DEFAULT');
};

// Backward-compatible numeric API.
const parseComponentQuantity = (text) => resolveQuantity(text).quantity;

module.exports = { resolveQuantity, parseComponentQuantity };

if (require.main === module) {
  const assert = require('assert');
  const q = parseComponentQuantity;
  const r = resolveQuantity;

  // The 14 real-WO items.
  assert.equal(q('Full SS316L Construction'), 1);
  assert.equal(q('BIBO HEPA (Exhaust Filter)'), 1);
  assert.equal(q('Integration of particle counter has a smooth bore per ISO/TR 14644- 21:2023, if possible with surface roughness \u2264 0.5 Ra, please amend the bend radius of the connection to NVP counter to be at least 150mm or sloping'), 1);
  assert.equal(q('CCTV mounting at the side wall'), 1);
  assert.equal(q('Ethernet In Port (Inner Liner), and Out Port (Back Wall, Bottom of the Unit)'), 1);
  assert.equal(q('Cable port on both left and right side'), 1);
  assert.equal(q('2x Magnehelic pressure gauge (for Supply & Exhaust Filter)'), 2);
  assert.equal(q('2x EO on the Left wall, 1x EO on the Right wall, with max combined output 5 Amps'), 3);
  assert.equal(q('Full SS316L support stand'), 1);
  assert.equal(q('Add on 2 EO on support stand with separate cordset from the BSC for particle counter (max combined output of 10A)'), 2);
  assert.equal(q('Add on shelf on support stand for particle counter'), 1);
  assert.equal(q('Remove UV Provision'), 1);
  assert.equal(q('Remove Service Fixture Provision'), 1);
  assert.equal(q('Cover Balancing on the Back'), 1);

  // The 5 template items.
  assert.equal(q('CUSTOM A'), 1);
  assert.equal(q('CUSTOM B'), 1);
  assert.equal(q('CUSTOM C'), 1);
  assert.equal(q('CUSTOM SIDE A'), 1);
  assert.equal(q('CUSTOM SIDE B 2X'), 2);

  // Explicit: sum all, anywhere, spaced form.
  assert.equal(q('2x A, 1x B'), 3);
  assert.equal(q('2 x A'), 2);
  assert.deepEqual(r('2x A, 1x B').evidence, ['2x', '1x']);
  assert.equal(r('2x A, 1x B').source, 'EXPLICIT');

  // Generic: first valid count, arbitrary noun.
  assert.equal(q('Add on 2 EO'), 2);
  assert.equal(q('part 2'), 2);
  assert.equal('needs_review' in r('part 2'), true);
  assert.equal(r('part 2').source, 'GENERIC');

  // Exceptions: technical numbers must be ignored.
  assert.equal(q('5 Amps'), 1);
  assert.equal(q('10A'), 1);
  assert.equal(q('150mm'), 1);
  assert.equal(q('0.5 Ra'), 1);
  assert.equal(q('ISO/TR 14644-21:2023'), 1);
  assert.equal(q('SS316L'), 1);
  assert.equal(q('230VAC 50/60Hz'), 1);
  assert.equal(q('0x1F'), 1);
  assert.equal(q('LB2X'), 1);

  // Default.
  assert.equal(q(''), 1);
  assert.equal(q(null), 1);
  assert.equal(r('').source, 'DEFAULT');
  assert.equal(r('').needs_review, true);
  assert.equal(r('2x A').needs_review, false);

  console.log('qtyParser OK');
}
