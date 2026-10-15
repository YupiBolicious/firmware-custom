import fs from 'fs';
import { createRequire } from 'module';
import service from './src/services/workOrderUploadService.js';

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const parse = (buffer) => new Promise((res, rej) => {
  const p = new PDFParser();
  p.on('pdfParser_dataError', rej);
  p.on('pdfParser_dataReady', res);
  p.parseBuffer(buffer);
});

const data = await parse(fs.readFileSync('uploads/real-wo.pdf'));
const lines = service.reconstructLines(data);
lines.slice(0, 22).forEach(l => {
  console.log('y=' + l.y, JSON.stringify(l.cells.map(c => [c.x, c.text])));
});
