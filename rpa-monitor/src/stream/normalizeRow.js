/**
 * normalizeRow.js
 * Converts raw rows from dataStream.js into properly-typed, sanitized records.
 *
 * IMPORTANT: dataStream.js was built for a different schema (employee_count,
 * annual_revenue_usd, etc.) and does NOT type-cast our RPA CSV fields.
 * All numeric coercion and validation must happen here.
 */

// Cached Intl.NumberFormat instances — never create inside loops
const _fmtCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const _fmtCurrencyFull = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const _fmtNumber = new Intl.NumberFormat('en-US');
const _fmtCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Coerce a value to a finite number, with an optional fallback.
 */
function toNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Clamp a number between min and max.
 */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Normalize a raw RPA row from the stream into a typed, safe record.
 * @param {Object} raw - Raw row object from dataStream.js callback
 * @returns {NormalizedRow}
 */
export function normalizeRow(raw) {
  const robots      = clamp(Math.round(toNum(raw.robots_deployed, 0)), 0, 10000);
  const budget      = Math.max(0, toNum(raw.budget_usd, 0));
  const savings     = Math.max(0, toNum(raw.annual_savings_usd, 0));
  const roi         = parseFloat(clamp(toNum(raw.roi_percent, 0), -9999, 9999).toFixed(2));
  const hoursRaw    = Math.max(0, toNum(raw.employee_hours_saved, 0));

  const status = String(raw.project_status || '').trim() || 'Unknown';

  return {
    // Identity
    internal_uid:          String(raw.internal_uid || ''),
    project_id:            String(raw.project_id   || ''),
    company_id:            String(raw.company_id   || ''),
    project_name:          String(raw.project_name || ''),

    // Status & timeline
    project_status:        status,
    start_date:            String(raw.start_date       || ''),
    completion_date:       String(raw.completion_date  || ''),

    // Automation profile
    automation_type:       String(raw.automation_type  || ''),
    robots_deployed:       robots,
    ai_enabled:            String(raw.ai_enabled        || 'No'),
    cloud_deployment:      String(raw.cloud_deployment  || 'No'),

    // Financial — numeric
    budget_usd:            budget,
    annual_savings_usd:    savings,
    roi_percent:           roi,

    // Productivity — numeric
    employee_hours_saved:  Math.round(hoursRaw),

    // Categorical
    department:            String(raw.department            || ''),
    implementation_partner:String(raw.implementation_partner || ''),
    country:               String(raw.country               || ''),
    industry:              String(raw.industry              || ''),

    // Derived / formatted (pre-computed, never in the render hot-path)
    _fmt_budget:    _fmtCurrency.format(budget),
    _fmt_savings:   _fmtCurrency.format(savings),
    _fmt_roi:       roi.toFixed(2) + '%',
    _fmt_robots:    String(robots),
    _fmt_hours:     _fmtCompact.format(hoursRaw),
    _fmt_budget_full:  _fmtCurrencyFull.format(budget),
    _fmt_savings_full: _fmtCurrencyFull.format(savings),

    // Alert flag — pre-computed per row
    _isAlert: status === 'Failed' || roi < 0,

    // FTE-years derived metric (2080 working hours per year)
    _fte_years: (hoursRaw / 2080).toFixed(1),
  };
}

/** Format a large raw number compactly for KPI display */
export function fmtKpiNumber(n) {
  return _fmtCompact.format(n);
}

/** Format currency compactly */
export function fmtCurrencyCompact(n) {
  return _fmtCurrency.format(n);
}

/** Format currency full */
export function fmtCurrencyFull(n) {
  return _fmtCurrencyFull.format(n);
}

/** Format a plain integer */
export function fmtInt(n) {
  return _fmtNumber.format(Math.round(n));
}
