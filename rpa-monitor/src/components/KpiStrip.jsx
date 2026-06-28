/**
 * KpiStrip.jsx
 * Top KPI metric cards with live stream aggregates.
 * Uses React.memo — only re-renders when values change.
 */

import { memo, useRef } from 'react';
import { fmtKpiNumber, fmtCurrencyCompact } from '../stream/normalizeRow.js';

function KpiCard({ label, icon, value, subValue, colorClass, hasAlert }) {
  const prevRef = useRef(null);
  const flash = prevRef.current !== null && prevRef.current !== value;
  prevRef.current = value;

  return (
    <div className={`kpi-card ${colorClass}${hasAlert ? ' has-alert' : ''}`}>
      <div className="kpi-label">
        <span className="kpi-label-icon">{icon}</span>
        {label}
      </div>
      <div className={`kpi-value tabular${flash ? ' kpi-flash' : ''}`} key={value}>
        {value}
      </div>
      {subValue && <div className="kpi-sub">{subValue}</div>}
    </div>
  );
}

function KpiStrip({ snapshot }) {
  if (!snapshot) return <div className="kpi-strip" />;

  const {
    processedCount,
    uniqueRowCount,
    robotsTotal,
    savingsTotal,
    anomalyCount,
    ticksPerSec,
  } = snapshot;

  return (
    <div className="kpi-strip" role="region" aria-label="Key Performance Indicators">
      <KpiCard
        label="Rows Processed"
        icon="📊"
        value={fmtKpiNumber(processedCount)}
        subValue={`${uniqueRowCount.toLocaleString()} unique projects`}
        colorClass="kpi-cyan"
      />
      <KpiCard
        label="Active Robots Deployed"
        icon="🤖"
        value={fmtKpiNumber(robotsTotal)}
        subValue="Snapshot sum across all projects"
        colorClass="kpi-green"
      />
      <KpiCard
        label="Global Annual Savings"
        icon="💰"
        value={fmtCurrencyCompact(savingsTotal)}
        subValue="Snapshot sum · all projects"
        colorClass="kpi-amber"
      />
      <KpiCard
        label="Anomalies Detected"
        icon="⚠️"
        value={anomalyCount.toLocaleString()}
        subValue="Failed status or negative ROI"
        colorClass="kpi-red"
        hasAlert={anomalyCount > 0}
      />
      <KpiCard
        label="Stream Rate"
        icon="⚡"
        value={`${ticksPerSec}/s`}
        subValue="Ticks per second"
        colorClass="kpi-purple"
      />
    </div>
  );
}

export default memo(KpiStrip);
