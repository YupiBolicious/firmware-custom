import fs from 'fs';
import service from './src/services/workOrderUploadService.js';

const pdf = fs.readFileSync('uploads/real-wo.pdf');
service.parseWorkOrderPdf(pdf).then(r => {
  console.log('=== PDF (real-wo.pdf) ===');
  console.log(JSON.stringify(r, null, 2));
}).catch(e => console.error('ERR', e.message));
