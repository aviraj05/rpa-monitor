/**
 * RowInspector.jsx
 * Detailed inspector viewport panel for a selected RPA project row.
 * Opens when the user clicks a row while the stream is PAUSED.
 * Displays all 18+ fields, financial metrics, timeline, ROI gauge, and vs-avg comparators.
 */

import { memo, useEffect, useRef } from 'react';
import { fmtCurrencyFull, fmtInt } from '../stream/normalizeRow.js';

// Dataset averages (pre-computed from the 50k row analysis)
const DATASET_AVG = {
  roi_percent:          174.5,
  budget_usd:           182162.8,
  annual_savings_usd:   318086.4,
  robots_deployed:      25.5,
  employee_hours_saved: 61179.0,
};

// ROI arc gauge on canvas
function RoiGauge({ roi }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.75;
    const r  = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, W, H);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = '#1E2F4A';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value arc — clamped 0-500%
    const clamped = Math.max(0, Math.min(roi, 500));
    const sweep   = (clamped / 500) * Math.PI;
    const color   = roi < 0 ? '#FF4757' : roi > 200 ? '#00E5A0' : '#00C8FF';

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI + sweep);
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center text
    ctx.fillStyle = color;
    ctx.font = '700 13px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, cx, cy - 8);

    ctx.fillStyle = '#3E5570';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText('ROI', cx, cy + 8);
  }, [roi]);

  return <canvas ref={canvasRef} width={100} height={68} />;
}

function VsAvgBar({ label, value, avg, fmt }) {
  const delta = value - avg;
  const pct   = avg > 0 ? Math.min(100, Math.abs(delta) / avg * 100) : 0;
  const positive = delta >= 0;

  return (
    <div className="vs-avg-bar">
      <span className="vs-avg-label">{label}</span>
      <div className="vs-avg-track">
        <div
          className={positive ? 'vs-avg-fill-positive' : 'vs-avg-fill-negative'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`vs-avg-delta ${positive ? 'pos' : 'neg'}`}>
        {positive ? '+' : ''}{fmt(delta)}
      </span>
    </div>
  );
}

function TimelineBar({ startDate, completionDate, status }) {
  const parseDate = (s) => s ? new Date(s).getTime() : null;
  const start = parseDate(startDate);
  const end   = parseDate(completionDate) || Date.now();
  const now   = Date.now();

  if (!start) return null;

  const totalSpan = end - start;
  const elapsed   = Math.min(now - start, totalSpan);
  const pct       = totalSpan > 0 ? Math.round((elapsed / totalSpan) * 100) : 0;

  const fmt = (ts) => new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

  return (
    <div className="timeline-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>Project Timeline</span>
        <span style={{ color: pct >= 100 ? 'var(--green)' : 'var(--cyan)' }}>{pct}% elapsed</span>
      </div>
      <div className="timeline-bar-bg">
        <div className="timeline-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="timeline-labels">
        <span>{fmt(start)}</span>
        <span>{completionDate ? fmt(end) : 'Ongoing'}</span>
      </div>
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div className="inspector-field">
      <span className="inspector-field-key">{label}</span>
      <span className="inspector-field-val">{value}</span>
    </div>
  );
}

function RowInspector({ row, engine, onClose }) {
  if (!row) return null;

  const history = engine.rowHistory.get(row.internal_uid);
  const avgRoi  = DATASET_AVG.roi_percent;

  const statusColor = row.project_status === 'Failed'   ? 'var(--red)'
                    : row.project_status === 'Active'    ? 'var(--green)'
                    : row.project_status === 'Completed' ? 'var(--cyan)'
                    : 'var(--amber)';

  return (
    <div className="inspector-panel" role="complementary" aria-label="Project Inspector">
      {/* Header */}
      <div className="inspector-header">
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            Project Inspector
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
            {row.project_id}
          </div>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close inspector">✕</button>
      </div>

      <div className="inspector-body">
        {/* Project name & status badge */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 6,
            lineHeight: 1.3,
          }}>
            {row.project_name}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className={`badge badge-${row.project_status.toLowerCase()}`}
            >
              {row.project_status}
            </span>
            {row.ai_enabled === 'Yes' && (
              <span className="chip" style={{ fontSize: 10, color: 'var(--purple)' }}>
                🤖 AI-Enabled
              </span>
            )}
            {row.cloud_deployment === 'Yes' && (
              <span className="chip" style={{ fontSize: 10, color: 'var(--cyan)' }}>
                ☁ Cloud
              </span>
            )}
          </div>
        </div>

        {/* ROI gauge + metric cards */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <RoiGauge roi={row.roi_percent} />
          <div style={{ flex: 1 }}>
            <div className="inspector-metrics" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="inspector-metric-card c-cyan">
                <div className="inspector-metric-label">Budget</div>
                <div className="inspector-metric-val">{row._fmt_budget}</div>
                <div className="inspector-metric-sub">{row._fmt_budget_full}</div>
              </div>
              <div className="inspector-metric-card c-green">
                <div className="inspector-metric-label">Savings</div>
                <div className="inspector-metric-val">{row._fmt_savings}</div>
                <div className="inspector-metric-sub">{row._fmt_savings_full}</div>
              </div>
              <div className="inspector-metric-card c-amber">
                <div className="inspector-metric-label">Robots</div>
                <div className="inspector-metric-val">{row.robots_deployed}</div>
                <div className="inspector-metric-sub">deployed</div>
              </div>
              <div className="inspector-metric-card c-purple">
                <div className="inspector-metric-label">FTE-Years</div>
                <div className="inspector-metric-val">{row._fte_years}</div>
                <div className="inspector-metric-sub">{fmtInt(row.employee_hours_saved)} hrs</div>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <TimelineBar
          startDate={row.start_date}
          completionDate={row.completion_date}
          status={row.project_status}
        />

        {/* vs Dataset Average */}
        <div className="inspector-section" style={{ marginTop: 14 }}>
          <div className="inspector-section-title">vs. Dataset Average</div>
          <VsAvgBar
            label="ROI %"
            value={row.roi_percent}
            avg={DATASET_AVG.roi_percent}
            fmt={(v) => `${v.toFixed(1)}%`}
          />
          <VsAvgBar
            label="Savings"
            value={row.annual_savings_usd}
            avg={DATASET_AVG.annual_savings_usd}
            fmt={(v) => {
              const abs = Math.abs(v);
              return (v < 0 ? '-' : '+') + (abs >= 1e6
                ? `$${(abs/1e6).toFixed(1)}M`
                : abs >= 1e3
                ? `$${(abs/1e3).toFixed(0)}K`
                : `$${fmtInt(abs)}`);
            }}
          />
          <VsAvgBar
            label="Hrs Saved"
            value={row.employee_hours_saved}
            avg={DATASET_AVG.employee_hours_saved}
            fmt={(v) => `${v >= 0 ? '+' : ''}${fmtInt(Math.abs(v))}`}
          />
          <VsAvgBar
            label="Robots"
            value={row.robots_deployed}
            avg={DATASET_AVG.robots_deployed}
            fmt={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
          />
        </div>

        {/* Project Identity */}
        <div className="inspector-section">
          <div className="inspector-section-title">Project Identity</div>
          <FieldRow label="Project ID"  value={row.project_id} />
          <FieldRow label="Company ID"  value={row.company_id} />
          <FieldRow label="Identifier"  value={row.internal_uid} />
        </div>

        {/* Automation Profile */}
        <div className="inspector-section">
          <div className="inspector-section-title">Automation Profile</div>
          <FieldRow label="Type"           value={row.automation_type} />
          <FieldRow label="Robots Deployed" value={row.robots_deployed} />
          <FieldRow label="AI Enabled"     value={row.ai_enabled} />
          <FieldRow label="Cloud Deploy"   value={row.cloud_deployment} />
        </div>

        {/* Organisational */}
        <div className="inspector-section">
          <div className="inspector-section-title">Organisation</div>
          <FieldRow label="Department"  value={row.department} />
          <FieldRow label="Industry"    value={row.industry} />
          <FieldRow label="Country"     value={row.country} />
          <FieldRow label="Partner"     value={row.implementation_partner} />
        </div>

        {/* Dates */}
        <div className="inspector-section">
          <div className="inspector-section-title">Timeline</div>
          <FieldRow label="Start Date"      value={row.start_date || '—'} />
          <FieldRow label="Completion Date" value={row.completion_date || 'Ongoing'} />
        </div>

        {/* ROI history */}
        {history && history.roi.length > 1 && (
          <div className="inspector-section">
            <div className="inspector-section-title">ROI History (last {history.roi.length} ticks)</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
              {history.roi.map((v, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: v < 0 ? 'var(--red)' : v > 200 ? 'var(--green)' : 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}>
                  {v.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(RowInspector);
