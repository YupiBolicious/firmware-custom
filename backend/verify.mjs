import fs from 'fs';
import service from './src/services/workOrderUploadService.js';

const docx = fs.readFileSync('../tempLiveTest/fixtures/work-order-sample.docx');
const r = await service.parseWorkOrderDocx(docx);
console.log('=== DOCX ===');
console.log('wo_number      :', r.wo_number);
console.log('model_code     :', r.model_code);
console.log('revision       :', r.revision);
console.log('serial_numbers :', JSON.stringify(r.serial_numbers));
console.log('customer       :', r.customer);
console.log('customize_with :', r.customize_with.length, 'items');
r.customize_with.forEach((i, n) => console.log('  ' + (n + 1) + '.', i.title, '| qty', i.quantity, i.quantity_source));

console.log('\n=== PDF regression (real-wo.pdf) ===');
const p = await service.parseWorkOrderPdf(fs.readFileSync('uploads/real-wo.pdf'));
console.log('wo_number      :', p.wo_number);
console.log('model_code     :', p.model_code);
console.log('revision       :', p.revision);
console.log('serial_numbers :', JSON.stringify(p.serial_numbers));
console.log('customer       :', p.customer);
console.log('customize_with :', p.customize_with.length, 'items');

console.log('\n=== PDF regression (WO-format-temp.pdf) ===');
const t = await service.parseWorkOrderPdf(fs.readFileSync('uploads/WO-format-temp.pdf'));
console.log('wo_number      :', t.wo_number);
console.log('model_code     :', t.model_code);
console.log('revision       :', t.revision);
console.log('serial_numbers :', JSON.stringify(t.serial_numbers));
console.log('customer       :', t.customer);
console.log('customize_with :', t.customize_with.length, 'items');

const expect = (label, got, want) => console.log((got === want ? 'PASS' : 'FAIL') + ' ' + label + ' :: ' + JSON.stringify(got) + (got === want ? '' : ' != ' + JSON.stringify(want)));
console.log('\n=== DOCX expectations ===');
expect('wo_number', r.wo_number, '2145510');
expect('model_code', r.model_code, 'LB2-4B8-BIBO-C G4');
expect('revision', r.revision, 2);
expect('customer', r.customer, 'National University Hospital (Singapore) Pte Ltd');
expect('serial count', r.serial_numbers.length, 4);
expect('customize count', r.customize_with.length, 12);
expect('item 1', r.customize_with[0]?.title, 'Full SS316L Construction');
expect('item 12', r.customize_with[11]?.title, 'Cover Balancing on the Back');
expect('item 7 qty (2x)', r.customize_with[6]?.quantity, 2);
