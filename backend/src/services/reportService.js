const reportRepository = require('../repositories/reportRepository');
const { assertOptionalDate } = require('../utils/validation');
const { ApiError } = require('../middleware/errorHandler');

const MAX_REPORT_SPAN_DAYS = 5 * 366;

const quarterLabel = (ymd) => {
  const m = Number(ymd.slice(5, 7));
  return `${ymd.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
};

const quarterEnd = (ymd) => {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return `${y}-${String(m + 2).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const getQuarterlyReport = async (query = {}) => {
  const from = (query.from || '').trim();
  const to = (query.to || '').trim();
  if (!from || !to) {
    throw new ApiError(400, 'Validation failed', ['"from" and "to" dates are required']);
  }
  assertOptionalDate('from', from);
  assertOptionalDate('to', to);
  if (from > to) {
    throw new ApiError(400, 'Validation failed', ['"from" must not be after "to"']);
  }
  const spanDays = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
  if (spanDays > MAX_REPORT_SPAN_DAYS) {
    throw new ApiError(400, 'Validation failed', ['range must not exceed 5 years']);
  }

  const rows = await reportRepository.findQuarterlyReport(from, to);
  const quarters = rows.map((r) => {
    const fromBound = r.quarter_start < from ? from : r.quarter_start;
    const qEnd = quarterEnd(r.quarter_start);
    const toBound = qEnd > to ? to : qEnd;
    return {
      quarter: quarterLabel(r.quarter_start),
      from: fromBound,
      to: toBound,
      work_orders: r.work_orders,
      custom_items: r.custom_items,
      hours: {
        queued: Number(r.hours_queued),
        in_progress: Number(r.hours_in_progress),
        completed: Number(r.hours_completed),
        total: Number(r.hours_total),
      },
      coder_reviews: r.coder_reviews,
    };
  });

  return {
    range: { from, to },
    granularity: 'quarter',
    quarters,
  };
};

// Historical / Quarter report: select a calendar year (and optionally a
// quarter) and get the selected-quarter metrics plus the Q1-Q4 comparison
// for the year. Reuses the same quarter buckets / hour definitions as
// getQuarterlyReport; coder_reviews = classifications reviewed by a coder
// (reviewed_by set, status CLASSIFIED/NON_FIRMWARE) bucketed by reviewed_at.
const getHistoricalReport = async (query = {}) => {
  const year = (query.year || '').trim();
  const quarter = (query.quarter || '').trim();
  if (!/^\d{4}$/.test(year)) {
    throw new ApiError(400, 'Validation failed', ['"year" must be a 4-digit year']);
  }
  let quarterNo = null;
  if (quarter !== '') {
    quarterNo = Number(quarter);
    if (!/^[1-4]$/.test(quarter)) {
      throw new ApiError(400, 'Validation failed', ['"quarter" must be 1 to 4']);
    }
  }

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = await reportRepository.findQuarterlyReport(from, to);
  const quarters = rows.map((r, i) => ({
    year,
    quarter: `Q${i + 1}`,
    work_orders: r.work_orders,
    custom_items: r.custom_items,
    estimated_hours: Number(r.hours_total),
    completed_hours: Number(r.hours_completed),
    coder_reviews: r.coder_reviews,
  }));

  return {
    year,
    quarter: quarterNo,
    selected_quarter: quarterNo ? quarters[quarterNo - 1] : null,
    quarters,
  };
};

module.exports = { getQuarterlyReport, getHistoricalReport };