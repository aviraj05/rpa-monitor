/**
 * AnalyticsOverlay.jsx
 * Full-screen frozen-snapshot analytics dashboard powered by Chart.js.
 *
 * Activates ONLY while the stream is paused ("Analytics Mode").
 * Reads from the engine's frozen canonical store — zero extra fetches.
 *
 * Three Chart.js visualisations:
 *  1. Scatter — Budget vs Annual Savings (coloured by project status)
 *  2. Horizontal Bar — Top Departments by Average ROI %
 *  3. Doughnut — Industry share by Robots Deployed
 *
 * Chart.js components are registered once at module level (tree-shaking safe).
 * Every Chart instance is destroyed on component unmount to prevent memory leaks.
 */

import { useEffect, useRef, useState, useMemo, memo } from 'react';
import {
  Chart,
  ScatterController,
  BarController,
  DoughnutController,
  LineElement,
  PointElement,
  BarElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  LogarithmicScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import {
  aggregateForAnalytics,
  CHART_COLORS,
  PALETTE,
  fmtAxisNumber,
} from '../filters/analyticsAggregator.js';
import { fmtCurrencyCompact, fmtKpiNumber } from '../stream/normalizeRow.js';

// ---- Register Chart.js components (tree-shaking friendly, done once) ----
Chart.register(
  ScatterController, BarController, DoughnutController,
  LineElement, PointElement, BarElement, ArcElement,
  LinearScale, CategoryScale, LogarithmicScale,
  Title, Tooltip, Legend,
);

// ---- Custom tooltip positioner to keep tooltips off chart center ----
Tooltip.positioners.followCursor = function(elements, eventPosition) {
  if (!eventPosition) return false;
  return {
    x: eventPosition.x,
    y: eventPosition.y - 20,
  };
};

// ---- Global Chart.js dark theme defaults ----
Chart.defaults.color          = '#7A9BBE';
Chart.defaults.borderColor    = '#1E2F4A';
Chart.defaults.font.family    = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size      = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding  = 12;

// ---- Tooltip dark theme plugin config ----
const DARK_TOOLTIP = {
  backgroundColor:  'rgba(13, 24, 40, 0.95)',
  borderColor:      '#2A4070',
  borderWidth:      1,
  titleColor:       '#D8E8F8',
  bodyColor:        '#7A9BBE',
  padding:          10,
  cornerRadius:     5,
  displayColors:    true,
  boxPadding:       4,
};

// ---- Utility: destroy chart instance safely ----
function destroyChart(ref) {
  if (ref.current) {
    ref.current.destroy();
    ref.current = null;
  }
}

// ===========================================================================
// Chart 1 — Scatter: Budget vs Annual Savings (coloured by project status)
// ===========================================================================
function ScatterChart({ scatterByStatus }) {
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    destroyChart(chartRef);

    const datasets = [
      {
        label:           'Active',
        data:            scatterByStatus.Active,
        backgroundColor: CHART_COLORS.green,
        pointRadius:     3,
        pointHoverRadius:5,
      },
      {
        label:           'Completed',
        data:            scatterByStatus.Completed,
        backgroundColor: CHART_COLORS.cyan,
        pointRadius:     3,
        pointHoverRadius:5,
      },
      {
        label:           'Planned',
        data:            scatterByStatus.Planned,
        backgroundColor: CHART_COLORS.amber,
        pointRadius:     3,
        pointHoverRadius:5,
      },
      {
        label:           'Failed',
        data:            scatterByStatus.Failed,
        backgroundColor: CHART_COLORS.red,
        pointRadius:     4,
        pointHoverRadius:6,
      },
    ].filter(ds => ds.data.length > 0);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          title: {
            display: true,
            text:    'Budget vs Annual Savings — by Project Status',
            color:   '#D8E8F8',
            font:    { size: 12, weight: '600' },
            padding: { bottom: 12 },
          },
          legend: { position: 'top', align: 'end' },
          tooltip: {
            ...DARK_TOOLTIP,
            callbacks: {
              label: (ctx) =>
                ` ${ctx.dataset.label}: Budget ${fmtAxisNumber(ctx.parsed.x)}  ·  Savings ${fmtAxisNumber(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            type:  'logarithmic',
            title: { display: true, text: 'Project Budget (USD)', color: '#3E5570' },
            ticks: { callback: fmtAxisNumber, maxTicksLimit: 8 },
            grid:  { color: '#152035' },
          },
          y: {
            type:  'logarithmic',
            title: { display: true, text: 'Annual Savings (USD)', color: '#3E5570' },
            ticks: { callback: fmtAxisNumber, maxTicksLimit: 8 },
            grid:  { color: '#152035' },
          },
        },
      },
    });

    return () => destroyChart(chartRef);
  }, [scatterByStatus]);

  return <canvas ref={canvasRef} />;
}

// ===========================================================================
// Chart 2 — Horizontal Bar: Top Departments by Average ROI %
// ===========================================================================
function DeptRoiBar({ deptAvgRoi }) {
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !deptAvgRoi.length) return;
    destroyChart(chartRef);

    const labels = deptAvgRoi.map(d => d.dept);
    const values = deptAvgRoi.map(d => d.avgRoi);

    // Gradient fill: low ROI → cyan, high ROI → green
    const maxRoi = Math.max(...values, 1);
    const backgroundColors = values.map(v => {
      const ratio = v / maxRoi;
      const r = Math.round(0   + ratio * 0);
      const g = Math.round(200 + ratio * 29);
      const b = Math.round(255 - ratio * 155);
      return `rgba(${r},${g},${b},0.82)`;
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Avg ROI %',
          data:            values,
          backgroundColor: backgroundColors,
          borderColor:     backgroundColors.map(c => c.replace('0.82', '1')),
          borderWidth:     1,
          borderRadius:    3,
        }],
      },
      options: {
        indexAxis:           'y',
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          title: {
            display: true,
            text:    'Top Departments by Average ROI %',
            color:   '#D8E8F8',
            font:    { size: 12, weight: '600' },
            padding: { bottom: 12 },
          },
          legend: { display: false },
          tooltip: {
            ...DARK_TOOLTIP,
            callbacks: {
              label: (ctx) =>
                ` Avg ROI: ${ctx.parsed.x.toFixed(1)}%  (${deptAvgRoi[ctx.dataIndex]?.count ?? '?'} projects)`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Average ROI (%)', color: '#3E5570' },
            ticks: { callback: v => `${v}%` },
            grid:  { color: '#152035' },
          },
          y: {
            ticks: { font: { size: 10 }, color: '#7A9BBE' },
            grid:  { display: false },
          },
        },
      },
    });

    return () => destroyChart(chartRef);
  }, [deptAvgRoi]);

  return <canvas ref={canvasRef} />;
}

// ===========================================================================
// Chart 3 — Doughnut: Top Industries by Robots Deployed
// ===========================================================================
function IndustryDoughnut({ topIndustries }) {
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !topIndustries.length) return;
    destroyChart(chartRef);

    const labels = topIndustries.map(([ind]) =>
      ind.length > 22 ? ind.slice(0, 20) + '…' : ind
    );
    const values = topIndustries.map(([, v]) => v);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data:            values,
          backgroundColor: PALETTE.slice(0, topIndustries.length),
          borderColor:     '#0B1220',
          borderWidth:     2,
          hoverOffset:     6,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation:           { duration: 800, easing: 'easeOutQuart' },
        cutout:              '62%',
        plugins: {
          title: {
            display: true,
            text:    'Robots Deployed by Industry',
            color:   '#D8E8F8',
            font:    { size: 12, weight: '600' },
            padding: { bottom: 8 },
          },
          legend: {
            position: 'right',
            align:    'center',
            labels:   { font: { size: 10 }, padding: 8, color: '#7A9BBE' },
          },
          tooltip: {
            ...DARK_TOOLTIP,
            position: 'followCursor',
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${ctx.label}: ${ctx.parsed.toLocaleString()} robots (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => destroyChart(chartRef);
  }, [topIndustries]);

  return <canvas ref={canvasRef} />;
}

// ===========================================================================
// Summary KPI stat row at the top of the overlay
// ===========================================================================
function AnalyticsStat({ label, value, sub, color }) {
  return (
    <div className="analytics-stat-card" style={{ borderTopColor: color }}>
      <div className="analytics-stat-label">{label}</div>
      <div className="analytics-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="analytics-stat-sub">{sub}</div>}
    </div>
  );
}

// ===========================================================================
// Main overlay component
// ===========================================================================
function AnalyticsOverlay({ engine, snapshot, onClose }) {
  const [computeMs, setComputeMs] = useState(null);

  // Run the aggregation once on mount — memoised so it doesn't re-run on re-renders
  const data = useMemo(() => {
    const t0 = performance.now();
    const result = aggregateForAnalytics(
      engine.rowsById,
      snapshot?.visibleIds ?? [],
    );
    const elapsed = (performance.now() - t0).toFixed(1);
    setComputeMs(elapsed);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — frozen snapshot, compute once

  const frozenAt = useMemo(() => {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }, []);

  // Keyboard close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const aiPct    = data.totalRows > 0 ? ((data.aiCounts.Yes / data.totalRows) * 100).toFixed(0) : 0;
  const cloudPct = data.totalRows > 0 ? ((data.cloudCounts.Yes / data.totalRows) * 100).toFixed(0) : 0;

  return (
    <div
      className="analytics-overlay-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Frozen Snapshot Analytics"
    >
      <div className="analytics-overlay-panel">

        {/* ── Header ── */}
        <div className="analytics-header">
          <div className="analytics-header-left">
            <div className="analytics-title">
              <span className="analytics-title-icon">🔬</span>
              Frozen Snapshot Analytics
            </div>
            <div className="analytics-subtitle">
              <span className="analytics-pill analytics-pill-amber">⏸ PAUSED</span>
              Frozen at {frozenAt}
              &nbsp;·&nbsp;
              <span style={{ color: 'var(--cyan)' }}>
                {data.totalRows.toLocaleString()} rows analysed
              </span>
              {snapshot?.filters && Object.keys(snapshot.filters).length > 0 && (
                <span style={{ color: 'var(--text-muted)' }}> · filtered view</span>
              )}
              {computeMs && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>
                  computed in {computeMs}ms
                </span>
              )}
            </div>
          </div>
          <button
            className="analytics-close-btn"
            onClick={onClose}
            aria-label="Close analytics overlay"
          >
            ✕ Close
          </button>
        </div>

        {/* ── KPI stat strip ── */}
        <div className="analytics-stats-row">
          <AnalyticsStat
            label="Total Budget"
            value={fmtCurrencyCompact(data.totalBudget)}
            sub="across all analysed projects"
            color="var(--cyan)"
          />
          <AnalyticsStat
            label="Total Annual Savings"
            value={fmtCurrencyCompact(data.totalSavings)}
            sub="snapshot sum"
            color="var(--green)"
          />
          <AnalyticsStat
            label="Average ROI"
            value={`${data.avgRoi.toFixed(1)}%`}
            sub="mean across all projects"
            color="var(--amber)"
          />
          <AnalyticsStat
            label="AI-Enabled"
            value={`${aiPct}%`}
            sub={`${data.aiCounts.Yes.toLocaleString()} projects`}
            color="var(--purple)"
          />
          <AnalyticsStat
            label="Cloud Deployed"
            value={`${cloudPct}%`}
            sub={`${data.cloudCounts.Yes.toLocaleString()} projects`}
            color="var(--blue)"
          />
          <AnalyticsStat
            label="Hrs Saved (Total)"
            value={fmtKpiNumber(data.totalHours)}
            sub={`≈ ${(data.totalHours / 2080).toFixed(0)} FTE-years`}
            color="var(--red)"
          />
        </div>

        {/* ── Charts grid ── */}
        <div className="analytics-charts-grid">

          {/* Chart 1 — Scatter */}
          <div className="analytics-chart-card analytics-chart-scatter">
            <div className="analytics-chart-inner">
              <ScatterChart scatterByStatus={data.scatterByStatus} />
            </div>
            <div className="analytics-chart-note">
              Sample of ~{Object.values(data.scatterByStatus).reduce((a, b) => a + b.length, 0)} points
              · log scale · hover for details
            </div>
          </div>

          {/* Chart 2 — Horizontal Bar */}
          <div className="analytics-chart-card analytics-chart-bar">
            <div className="analytics-chart-inner">
              <DeptRoiBar deptAvgRoi={data.deptAvgRoi} />
            </div>
            <div className="analytics-chart-note">
              Top {data.deptAvgRoi.length} departments · colour intensity ∝ ROI
            </div>
          </div>

          {/* Chart 3 — Doughnut */}
          <div className="analytics-chart-card analytics-chart-donut">
            <div className="analytics-chart-inner">
              <IndustryDoughnut topIndustries={data.topIndustries} />
            </div>
            <div className="analytics-chart-note">
              Top {data.topIndustries.length} industries by total robots deployed
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="analytics-footer">
          <span style={{ color: 'var(--amber)' }}>⏸</span>
          Stream is paused. This dashboard reflects the exact canonical state at the moment the pipeline was frozen.
          Resume the stream to return to live monitoring.
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="hotkey">Esc</span> to close
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(AnalyticsOverlay);
