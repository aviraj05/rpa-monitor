/**
 * analyticsAggregator.js
 * Single-pass aggregation over the frozen canonical store.
 *
 * Called once when the Analytics Overlay opens while stream is paused.
 * All computation happens synchronously on the JS main thread — for 50k rows
 * this typically finishes in 3–8ms, imperceptible to the user.
 *
 * Returns pre-computed datasets ready to hand directly to Chart.js.
 */

// ---- Constants ----
const SCATTER_TARGET_POINTS = 900; // max scatter points to keep canvas fast
const TOP_N_DEPT     = 12;
const TOP_N_INDUSTRY = 10;

// ---- Colour palette matching the terminal design system ----
export const CHART_COLORS = {
  cyan:    'rgba(0, 200, 255, 0.85)',
  cyanDim: 'rgba(0, 200, 255, 0.18)',
  green:   'rgba(0, 229, 160, 0.85)',
  greenDim:'rgba(0, 229, 160, 0.18)',
  amber:   'rgba(255, 182, 39, 0.85)',
  amberDim:'rgba(255, 182, 39, 0.18)',
  red:     'rgba(255, 71, 87, 0.85)',
  redDim:  'rgba(255, 71, 87, 0.18)',
  purple:  'rgba(139, 92, 246, 0.85)',
  purpleDim:'rgba(139, 92, 246, 0.18)',
  blue:    'rgba(59, 130, 246, 0.85)',
};

// Multi-segment palette for doughnuts / many-bar charts
export const PALETTE = [
  'rgba(0, 200, 255, 0.82)',
  'rgba(0, 229, 160, 0.82)',
  'rgba(139, 92, 246, 0.82)',
  'rgba(255, 182, 39, 0.82)',
  'rgba(59, 130, 246, 0.82)',
  'rgba(244, 114, 182, 0.82)',
  'rgba(52, 211, 153, 0.82)',
  'rgba(251, 191, 36, 0.82)',
  'rgba(96, 165, 250, 0.82)',
  'rgba(167, 139, 250, 0.82)',
  'rgba(255, 71, 87, 0.82)',
  'rgba(34, 197, 94, 0.82)',
];

/**
 * Run a full single-pass aggregation over the canonical row store.
 *
 * @param {Map<string, NormalizedRow>} rowsById   Engine's canonical store
 * @param {string[]}                  visibleIds  Current filtered view (may be same as all rows)
 * @returns {AggregationResult}
 */
export function aggregateForAnalytics(rowsById, visibleIds) {
  // Use visibleIds as the analysis population when filters/search are active.
  // Fall back to all rows if nothing is filtered.
  const sourceIds = (visibleIds && visibleIds.length > 0)
    ? visibleIds
    : [...rowsById.keys()];

  const totalRows = sourceIds.length;

  // ---- Accumulators ----
  const deptRoi       = {};   // dept -> { total, count }
  const industryRobots = {};  // industry -> total robots_deployed
  const statusCounts  = { Active: 0, Completed: 0, Planned: 0, Failed: 0, Unknown: 0 };
  const aiCounts      = { Yes: 0, No: 0 };
  const cloudCounts   = { Yes: 0, No: 0 };

  let totalBudget    = 0;
  let totalSavings   = 0;
  let totalRoiSum    = 0;
  let totalHours     = 0;

  // Scatter sampling — deterministic stride so results are stable across re-opens
  const scatterStride  = Math.max(1, Math.floor(totalRows / SCATTER_TARGET_POINTS));
  const scatterRaw     = []; // { x: budget, y: savings, status }

  sourceIds.forEach((uid, idx) => {
    const row = rowsById.get(uid);
    if (!row) return;

    // KPI totals
    totalBudget  += row.budget_usd;
    totalSavings += row.annual_savings_usd;
    totalRoiSum  += row.roi_percent;
    totalHours   += row.employee_hours_saved;

    // Status
    const st = row.project_status || 'Unknown';
    if (st in statusCounts) statusCounts[st]++;
    else statusCounts.Unknown++;

    // AI / Cloud
    if (row.ai_enabled === 'Yes') aiCounts.Yes++; else aiCounts.No++;
    if (row.cloud_deployment === 'Yes') cloudCounts.Yes++; else cloudCounts.No++;

    // Dept ROI accumulation
    const dept = row.department || 'Unknown';
    if (!deptRoi[dept]) deptRoi[dept] = { total: 0, count: 0 };
    deptRoi[dept].total += row.roi_percent;
    deptRoi[dept].count++;

    // Industry robots
    const ind = row.industry || 'Unknown';
    if (!industryRobots[ind]) industryRobots[ind] = 0;
    industryRobots[ind] += row.robots_deployed;

    // Scatter sample
    if (idx % scatterStride === 0) {
      scatterRaw.push({
        x:      row.budget_usd,
        y:      row.annual_savings_usd,
        status: row.project_status,
      });
    }
  });

  // ---- Derived / sorted structures ----

  // Department average ROI — top N, sorted descending
  const deptAvgRoi = Object.entries(deptRoi)
    .map(([dept, { total, count }]) => ({
      dept,
      avgRoi: parseFloat((total / count).toFixed(1)),
      count,
    }))
    .sort((a, b) => b.avgRoi - a.avgRoi)
    .slice(0, TOP_N_DEPT);

  // Industry robots deployed — top N, sorted descending
  const topIndustries = Object.entries(industryRobots)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_INDUSTRY);

  // Scatter split by status (for coloured datasets in Chart.js)
  const scatterByStatus = {
    Active:    scatterRaw.filter(p => p.status === 'Active'),
    Completed: scatterRaw.filter(p => p.status === 'Completed'),
    Planned:   scatterRaw.filter(p => p.status === 'Planned'),
    Failed:    scatterRaw.filter(p => p.status === 'Failed'),
  };

  // Summary KPIs
  const avgRoi = totalRows > 0 ? totalRoiSum / totalRows : 0;

  return {
    // Summary stats
    totalRows,
    totalBudget,
    totalSavings,
    avgRoi,
    totalHours,
    aiCounts,
    cloudCounts,

    // Chart datasets
    statusCounts,
    deptAvgRoi,         // [{ dept, avgRoi, count }] — for horizontal bar
    topIndustries,      // [[industry, totalRobots]] — for doughnut
    scatterByStatus,    // { Active: [{x,y}], ... } — for scatter
  };
}

/**
 * Compact number formatter for chart axis labels.
 */
export function fmtAxisNumber(n) {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}
