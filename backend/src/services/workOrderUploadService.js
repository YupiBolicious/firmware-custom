const PDFParser = require('pdf2json');
const { ApiError } = require('../middleware/errorHandler');
const { parseComponentQuantity } = require('../utils/qtyParser');

const NOISE_LINE = /^(work\s*order\s*form|page\s+\d+\s+of\s+\d+|platform\s+naming|raised\s*by\s*:|saved\s*by\s*:|designer\s*:|checked\s*by\s*csis\s*manager\s*:|document\s*number\s*:|revision\s*:|revised\s*by\s*:|path\s*:)/i;

// ponytail: magic column x + the Model Code / Work Order Number Y-window are tuned to this
// form's template image; revisit if the layout is redrawn.
const CUSTOM_ITEM_MAX_X = 15;

const decodeText = (raw) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const normalize = (text) => text.toUpperCase().replace(/[^A-Z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();

//PARSER PDF FILE
const parsePdfBuffer = (buffer) => new Promise((resolve, reject) => {
  const parser = new PDFParser();
  parser.on('pdfParser_dataError', () => reject(new ApiError(400, 'Could not read PDF file')));
  parser.on('pdfParser_dataReady', (data) => resolve(data));
  parser.parseBuffer(buffer);
});

//MAPPING KOORDINAT NECESSARY FIELDS
const reconstructLines = (pdfData) => {
  const lines = [];
  (pdfData.Pages || []).forEach((page, pageIndex) => {
    const byY = new Map();
    for (const t of page.Texts || []) {
      const text = (t.R || []).map((r) => decodeText(r.T)).join('');
      if (!text.trim()) continue;
      const key = Math.round(t.y * 2) / 2;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key).push({ x: t.x, text });
    }
    for (const [y, cells] of [...byY.entries()].sort((a, b) => a[0] - b[0])) {
      cells.sort((a, b) => a.x - b.x);
      const raw = cells.map((c) => c.text).join('  ');
      lines.push({ page: pageIndex, y, cells, text: raw.replace(/\s+/g, ' ').trim() });
    }
  });
  return lines;
};

const classifyHeading = (text) => {
  const n = normalize(text);
  if (!n) return null;
  if (n.includes('PLATFORM NAMING')) return 'ignore';
  if (n.includes('CUSTOMISATION') || n.includes('CUSTOMIZATION') || n.includes('REMINDER')) return 'ignore';
  if (n.includes('CUSTOMER INFORMATION')) return 'customer';
  if (n.includes('FACTORY INFORMATION')) return 'factory';
  return null;
};

const pickRightOfLabel = (line, labelRe, maxX = Infinity) => {
  if (!line || !line.cells) return null;
  let labelCell = null;
  for (const cell of line.cells) {
    if (labelRe.test(normalize(cell.text))) { labelCell = cell; break; }
  }
  if (!labelCell) return null;
  
  const valueParts = [];
  for (const cell of line.cells) {
   if (cell.x > labelCell.x + 0.01 && cell.x < maxX && !labelRe.test(normalize(cell.text))) {
      valueParts.push(cell.text.trim());
    }
  }
  const value = valueParts.join(' ').replace(/\s+/g, ' ').trim();
  return value || null;
};

const grab = (lines, labelRe) => {
  for (const line of lines) {
    const value = pickRightOfLabel(line, labelRe);
    if (value) return value;
  }
  return null;
};

const findLabelLine = (lines, labelRe) => lines.find(
  (line) => line.cells && line.cells.some((cell) => labelRe.test(normalize(cell.text)))
);


// SPECIFIC EXTRACTING MULTIPLE LINE ON CUSTOM ITEMS
const extractCustomizeWith = (lines, modelLabelLine, woLabelLine) => {
  if (!modelLabelLine || !woLabelLine) return [];
  if (modelLabelLine.page !== woLabelLine.page) return [];
  if (woLabelLine.y <= modelLabelLine.y) return [];

  // 1. Filter semua baris yang masuk dalam Bounding Box
  const rawCustomLines = [];
  for (const line of lines) {
    if (line.page !== modelLabelLine.page) continue;
    if (line.y <= modelLabelLine.y || line.y >= woLabelLine.y) continue;
    if (NOISE_LINE.test(line.text)) continue;

    // Ambil cell di kolom kiri (X < 15)
    const validCells = (line.cells || []).filter((cell) => cell.x < CUSTOM_ITEM_MAX_X);
    if (!validCells.length) continue;

    // Gabungkan text cell dalam satu baris Y
    const lineText = validCells.map((c) => c.text.trim()).join(' ').trim();
    const n = normalize(lineText);

    if (n.includes('CUSTOMIZE WITH') || n.includes('REFER TO GA DRAWING')) continue;
    if (lineText) rawCustomLines.push(lineText);
  }

  // 2. State Accumulator untuk Poin Nomor
  const items = [];
  // Regex presisi untuk menangkap awalan nomor seperti "1.", "2)", "1 .", "2 -"
  const NUMBER_START_RE = /^\s*(\d+)\s*[\.\)-]\s*(.*)/;

  for (const lineText of rawCustomLines) {
    const match = lineText.match(NUMBER_START_RE);

    if (match) {
      // JIKA MENEMUKAN NOMOR POIN BARU (misal "2. CUSTOM B")
      // Buat elemen baru di array items!
      const itemContent = match[2].trim();
      if (itemContent) {
        items.push(itemContent);
      }
    } else if (items.length > 0) {
      // JIKA TIDAK ADA NOMOR DAN SUDAH ADA ITEM AKTIF
      // Gabungkan ke item terakhir sebagai sambungan teks (multiline)
      items[items.length - 1] += ` ${lineText.trim()}`;
    } else {
      // Fallback jika poin pertama tidak diawali nomor
      items.push(lineText.trim());
    }
  }

  // Clean-up akhir: bersihkan spasi ganda
  return items.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
};


// EXTRACT EACH FIELDS
const extractFields = (lines) => {
  const buckets = { customer: [], factory: [] };
  let current = 'ignore';
  for (const line of lines) {
    if (NOISE_LINE.test(line.text)) continue;
    const heading = classifyHeading(line.text);
    if (heading) { current = heading; continue; }
    if (buckets[current]) buckets[current].push(line);
  }

  const modelLabelLine = findLabelLine(buckets.factory, /^MODEL\s*CODE$/);
  const woLabelLine = findLabelLine(buckets.factory, /^WORK\s*ORDER\s*NUMBER$/);

  // Kolom Model Code & Serial Number ada di sebelah kiri (X < 12)
  // Kolom Power Supply & Cordset Qty ada di sebelah kanan (X >= 12)
  const MAX_LEFT_COL_X = 12;

  const rawSerial = grabWithMaxX(buckets.factory, /^SERIAL\s*NUMBER\s*S?$/, MAX_LEFT_COL_X);

  return {
    wo_number: grabWithMaxX(buckets.factory, /^WORK\s*ORDER\s*NUMBER$/, MAX_LEFT_COL_X),
    model_code: grabWithMaxX(buckets.factory, /^MODEL\s*CODE$/, MAX_LEFT_COL_X),
    serial_numbers: rawSerial ? rawSerial.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [],
    customize_with: extractCustomizeWith(lines, modelLabelLine, woLabelLine)
      .map((title) => ({ title, quantity: parseComponentQuantity(title) })),
    customer: grab(buckets.customer, /^NAME$/),
  };
};
// Helper dengan parameter maxX
const grabWithMaxX = (lines, labelRe, maxX) => {
  for (const line of lines) {
    const value = pickRightOfLabel(line, labelRe, maxX);
    if (value) return value;
  }
  return null;
};

const parseWorkOrderPdf = async (buffer) => {
  const pdfData = await parsePdfBuffer(buffer);
  return extractFields(reconstructLines(pdfData));
};

module.exports = { parseWorkOrderPdf, extractFields, reconstructLines };
