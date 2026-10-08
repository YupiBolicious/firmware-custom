const parseComponentQuantity = (text) => {
  if (!text) return 1;
  let totalQty = 0;
  for (const m of String(text).matchAll(/(\d+)\s+(?:custom|panel|unit|pcs|side|sisi)/gi)) {
    totalQty += parseInt(m[1], 10) || 0;
  }
  if (totalQty === 0) {
    const suffix = String(text).match(/(\d+)\s*x$/i);
    if (suffix) totalQty = parseInt(suffix[1], 10);
  }
  return totalQty > 0 ? totalQty : 1;
};

module.exports = { parseComponentQuantity };

if (require.main === module) {
  const assert = require('assert');
  const p = parseComponentQuantity;
  assert.equal(p('2 custom panel'), 2);
  assert.equal(p('custom panel 2x'), 2);
  assert.equal(p('custom panel'), 1);
  assert.equal(p(''), 1);
  console.log('qtyParser OK');
}
