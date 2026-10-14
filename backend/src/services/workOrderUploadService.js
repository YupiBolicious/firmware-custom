const PDFParser = require('pdf2json');
const { ApiError } = require('../middleware/errorHandler');
const { resolveQuantity } = require('../utils/qtyParser');

const NOISE_LINE = /^(work\s*order\s*form|page\s+\d+\s+of\s+\d+|platform\s+naming|raised\s*by\s*:|saved\s*by\s*:|designer\s*:|checked\s*by\s*csis\s*manager\s*:|document\s*number\s*:|revision\s*:|revised\s*by\s*:|path\s*:)/i;

// ponytail: magic column x + the Model Code / Work Order Number Y-window are tuned
// Left "custom items" column ends ~x16.2 and the right "amendment" column starts ~x23
const CUSTOM_ITEM_MAX_X = 20;
const CUSTOMER_VALUE_MAX_X = 16;

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

// ponytail: real forms split a label across glyph runs ("Wo" + "rk Order Number")
// with no visual gap; merge runs whose gap is below this so labels/values read whole.
// Tuned to the form's text scale (page width ~60 units); revisit if column spacing changes.
const MERGE_GAP_X = 1.5;

const mergeAdjacentCells = (cells) => {
  const merged = [];
  for (const cell of cells) {
    const prev = merged[merged.length - 1];
    if (prev && cell.x - prev.lastX <= MERGE_GAP_X) {
      prev.text += cell.text;
      prev.lastX = cell.x;
    } else {
      merged.push({ x: cell.x, lastX: cell.x, text: cell.text });
    }
  }
  return merged;
};

//MAPPING KOORDINAT NECESSARY FIELDS
const reconstructLines = (pdfData) => {
  const lines = [];
  (pdfData.Pages || []).forEach((page, pageIndex) => {
    const byY = new Map();
    for (const t of page.Texts || []) {
      const text = (t.R || []).map((r) => decodeText(r.T)).join('');
      if (text === '') continue;
      const key = Math.round(t.y * 2) / 2;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key).push({ x: t.x, text });
    }
    for (const [y, cells] of [...byY.entries()].sort((a, b) => a[0] - b[0])) {
      cells.sort((a, b) => a.x - b.x);
      const merged = mergeAdjacentCells(cells);
      const raw = merged.map((c) => c.text).join('');
      lines.push({ page: pageIndex, y, cells: merged, text: raw.replace(/\s+/g, ' ').trim() });
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
      valueParts.push(cell.text);
    }
  }
  const value = valueParts.join('').replace(/\s+/g, ' ').trim();
  return value || null;
};

const findLabelLine = (lines, labelRe) => lines.find(
  (line) => line.cells && line.cells.some((cell) => labelRe.test(normalize(cell.text)))
);

// ponytail: the real form wraps a cell's value onto the rows directly above/below its
// label, so the Name value straddles the "Name" row; pull the 3-row band's left-column
// cells (value column, x<CUSTOMER_VALUE_MAX_X) and skip headings/right-hand Rev Date.
const grabCustomer = (lines) => {
  const idx = lines.findIndex(
    (line) => line.cells && line.cells.some((cell) => /^NAME$/.test(normalize(cell.text)))
  );
  if (idx === -1) return null;
  const labelCell = lines[idx].cells.find((cell) => /^NAME$/.test(normalize(cell.text)));
  const parts = [];
  for (let i = idx - 1; i <= idx + 1; i += 1) {
    const line = lines[i];
    if (!line || !line.cells) continue;
    for (const cell of line.cells) {
      if (cell.x <= labelCell.x + 2 || cell.x >= CUSTOMER_VALUE_MAX_X) continue;
      if (/^NAME$/.test(normalize(cell.text)) || classifyHeading(cell.text)) continue;
      parts.push(cell.text);
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim() || null;
};


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
    const lineText = validCells.map((c) => c.text).join('').trim();
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
      // new elemen in new array if poin baru exist
      const itemContent = match[2].trim();
      if (itemContent) {
        items.push(itemContent);
      }
    } else if (items.length > 0) {
      // combine last item as multiline if no nomber and item active existed
      items[items.length - 1] += ` ${lineText.trim()}`;
    } else {
      // Fallback jika poin pertama tidak diawali nomor
      items.push(lineText.trim());
    }
  }

  return items.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
};


// EXTRACT EACH FIELDS
const extractFields = (lines) => {
  const buckets = { factory: [] };
  let current = 'ignore';
  for (const line of lines) {
    if (NOISE_LINE.test(line.text)) continue;
    const heading = classifyHeading(line.text);
    if (heading) { current = heading; continue; }
    if (buckets[current]) buckets[current].push(line);
  }

  const modelLabelLine = findLabelLine(buckets.factory, /^MODEL\s*CODE$/);
  const woLabelLine = findLabelLine(buckets.factory, /^WORK\s*ORDER\s*NUMBER$/);

  // model and SN on left (X < 12)
  // power supply and quantity (X >= 12)
  const MAX_LEFT_COL_X = 12;

  const rawSerial = grabWithMaxX(buckets.factory, /^SERIAL\s*NUMBER\s*S?$/, MAX_LEFT_COL_X);

  return {
    wo_number: grabWithMaxX(buckets.factory, /^WORK\s*ORDER\s*NUMBER$/, MAX_LEFT_COL_X),
    model_code: grabWithMaxX(buckets.factory, /^MODEL\s*CODE$/, MAX_LEFT_COL_X),
    serial_numbers: rawSerial ? rawSerial.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : [],
    customize_with: extractCustomizeWith(lines, modelLabelLine, woLabelLine)
      .map((title) => {
        const qty = resolveQuantity(title);
        return {
          title,
          quantity: qty.quantity,
          quantity_source: qty.source,
          quantity_confidence: qty.confidence,
          quantity_evidence: qty.evidence,
          quantity_needs_review: qty.needs_review,
        };
      }),
    customer: grabCustomer(lines),
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
