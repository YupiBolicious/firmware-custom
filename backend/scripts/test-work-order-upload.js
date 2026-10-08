const assert = require('assert');
const { extractFields } = require('../src/services/workOrderUploadService');

const line = (cells, { page = 0, y = 0 } = {}) => {
  const arr = Array.isArray(cells) ? cells : [{ x: 0, text: cells }];
  return {
    page,
    y,
    cells: arr,
    text: arr.map((c) => c.text).join('  ').replace(/\s+/g, ' ').trim(),
  };
};

const lines = [
  line('Work order form', { y: 0 }),
  line('Customer Information', { y: 2 }),
  line([{ x: 10, text: 'Name' }, { x: 40, text: 'CUSTOMIZED' }], { y: 5 }),
  line('Factory Information', { y: 15 }),
  line([{ x: 1, text: 'Model Code' }, { x: 5, text: 'MD-ABC' }], { y: 20 }),
  line([{ x: 1, text: 'Customize with:' }], { y: 22 }),
  line([{ x: 1, text: '1. CUSTOM A' }], { y: 25 }),
  line([{ x: 1, text: '2. CUSTOM B' }], { y: 26 }),
  line([{ x: 1, text: '3. CUSTOM C' }], { y: 27 }),
  line([{ x: 1, text: '4. 2 custom panel' }], { y: 28 }),
  line([{ x: 1, text: '5. CUSTOM D 3x' }], { y: 29 }),
  line([{ x: 1, text: 'Refer to GA Drawing' }], { y: 31 }),
  line([{ x: 1, text: 'Work Order Number' }, { x: 5, text: '1234' }], { y: 40 }),
  line([{ x: 1, text: 'Serial Number(s)' }, { x: 5, text: '001,002,003' }], { y: 45 }),
  line('MAIN CABINET ORDER', { page: 1, y: 10 }),
  line([{ x: 1, text: '1. SHOULD NOT LEAK' }], { page: 1, y: 30 }),
  line([{ x: 10, text: 'Cabinet' }, { x: 40, text: 'MODEL ABC' }, { x: 80, text: '4' }], { page: 1, y: 60 }),
];

const fields = extractFields(lines);

assert.strictEqual(fields.wo_number, '1234');
assert.strictEqual(fields.model_code, 'MD-ABC');
assert.deepStrictEqual(fields.serial_numbers, ['001', '002', '003']);
assert.deepStrictEqual(fields.customize_with, [
  { title: 'CUSTOM A', quantity: 1 },
  { title: 'CUSTOM B', quantity: 1 },
  { title: 'CUSTOM C', quantity: 1 },
  { title: '2 custom panel', quantity: 2 },
  { title: 'CUSTOM D 3x', quantity: 3 },
]);
assert.strictEqual(fields.customer, 'CUSTOMIZED');

console.log('work-order-upload fixtures: PASS');
console.log(JSON.stringify(fields));
