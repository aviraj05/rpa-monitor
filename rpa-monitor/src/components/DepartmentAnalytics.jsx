/**
 * DepartmentAnalytics.jsx
 * Department-level breakdown: project count bars + Canvas donut for status split.
 */

import { memo, useEffect, useRef, useMemo } from 'react';

// Stable colour palette for department bars
const BAR_COLORS = [
  '#00C8FF','#00E5A0','#FFB627','#8B5CF6','#3B82F6',
  '#F472B6','#34D399','#FBBF24','#60A5FA','#A78BFA',
];

function DeptBar({ label, count, maxCount, colorIdx }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const color = BAR_COLORS[colorIdx % BAR_COLORS.length];
  return (
    <div className="dept-bar-row">
      <span className="dept-bar-label" title={label}>{label}</span>
      <div className="dept-bar-track">
        <div className="dept-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="dept-bar-value">{count.toLocaleString()}</span>
    </div>
  );
}

// Canvas donut chart for status distribution
function StatusDonut({ active, completed, planned, failed }) {
  const canvasRef = useRef(null);
  const total = active + completed + planned + failed || 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(cx, cy) - 4;
    const innerR = r * 0.58;

    ctx.clearRect(0, 0, W, H);

    const slices = [
      { value: completed, color: '#00C8FF' },
      { value: active,    color: '#00E5A0' },
      { value: planned,   color: '#FFB627' },
      { value: failed,    color: '#FF4757' },
    ];

    let startAngle = -Math.PI / 2;
    slices.forEach(({ value, color }) => {
      if (value === 0) return;
      const sweep = (value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      startAngle += sweep;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = '#0D1828';
    ctx.fill();

    // Center label
    ctx.fillStyle = '#D8E8F8';
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toLocaleString(), cx, cy);
  }, [active, completed, planned, failed, total]);

  return (
    <div className="donut-wrap">
      <canvas ref={canvasRef} width={80} height={80} />
      <div className="donut-legend">
        {[
          { label: 'Completed', count: completed, color: '#00C8FF' },
          { label: 'Active',    count: active,    color: '#00E5A0' },
          { label: 'Planned',   count: planned,   color: '#FFB627' },
          { label: 'Failed',    count: failed,    color: '#FF4757' },
        ].map(({ label, count, color }) => (
          <div key={label} className="donut-legend-item">
            <div className="donut-legend-dot" style={{ background: color }} />
            <span>{label}</span>
            <span className="donut-legend-pct">{((count/total)*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentAnalytics({ engine, snapshot }) {
  // Recompute department counts only when new unique rows arrive
  // We gate on uniqueRowCount from snapshot to avoid 200ms over-recomputation.
  const uniqueRowCount = snapshot?.uniqueRowCount ?? 0;

  const counts = useMemo(() => {
    const deptCount = {};
    let active = 0, completed = 0, planned = 0, failed = 0;

    for (const row of engine.rowsById.values()) {
      const dept = row.department || 'Unknown';
      deptCount[dept] = (deptCount[dept] || 0) + 1;

      switch (row.project_status) {
        case 'Active':    active++;    break;
        case 'Completed': completed++; break;
        case 'Planned':   planned++;   break;
        case 'Failed':    failed++;    break;
        default: break;
      }
    }

    const sorted = Object.entries(deptCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return { sorted, active, completed, planned, failed };
  }, [engine, uniqueRowCount]); // recompute when uniqueRowCount changes (new rows seen)

  const maxCount = counts.sorted[0]?.[1] || 1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-body scroll-y flex-1">
        {/* Status donut */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
            Status Distribution
          </div>
          <StatusDonut
            active={counts.active}
            completed={counts.completed}
            planned={counts.planned}
            failed={counts.failed}
          />
        </div>

        <div className="divider-h" style={{ margin: '6px 0' }} />

        {/* Department bars */}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
          Top Departments
        </div>
        <div className="dept-chart-wrap">
          {counts.sorted.map(([dept, count], i) => (
            <DeptBar key={dept} label={dept} count={count} maxCount={maxCount} colorIdx={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(DepartmentAnalytics);
