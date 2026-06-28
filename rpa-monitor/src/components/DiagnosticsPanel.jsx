/**
 * DiagnosticsPanel.jsx
 * Stream diagnostics: tick rate, batch stats, latency, heap, queue gauge.
 */

import { memo } from 'react';

function DiagRow({ label, value, quality }) {
  const color = quality === 'good' ? 'var(--green)'
              : quality === 'warn' ? 'var(--amber)'
              : quality === 'bad'  ? 'var(--red)'
              : 'var(--text-primary)';
  return (
    <div className="diag-row">
      <span className="diag-label">{label}</span>
      <span className="diag-value font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function BatchHistogram({ batchSizes }) {
  const max = Math.max(...batchSizes, 1);
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: 0.5 }}>
        BATCH SIZE (last 20 ticks)
      </div>
      <div className="batch-histogram">
        {batchSizes.map((size, i) => (
          <div
            key={i}
            className="batch-bar"
            style={{ height: `${Math.max(2, (size / max) * 100)}%` }}
            title={`${size} rows`}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>min: {Math.min(...batchSizes)}</span>
        <span>avg: {Math.round(batchSizes.reduce((a,b)=>a+b,0)/batchSizes.length)}</span>
        <span>max: {max}</span>
      </div>
    </div>
  );
}

function QueueGauge({ queueCount, isPaused }) {
  const MAX_QUEUE = 10000;
  const pct = Math.min(100, (queueCount / MAX_QUEUE) * 100);
  if (!isPaused && queueCount === 0) return null;
  return (
    <div className="queue-gauge-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span style={{ color: 'var(--text-muted)' }}>Queue depth</span>
        <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {queueCount.toLocaleString()}
        </span>
      </div>
      <div className="queue-gauge-bar">
        <div className="queue-gauge-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DiagnosticsPanel({ snapshot }) {
  if (!snapshot) return null;

  const {
    tickCount,
    ticksPerSec,
    batchSizes,
    processingLatencyMs,
    heapUsedMB,
    paused,
    queuedRowCount,
    uniqueRowCount,
    processedCount,
    totalRows,
  } = snapshot;

  const latencyQuality = processingLatencyMs < 10 ? 'good'
                       : processingLatencyMs < 50 ? 'warn' : 'bad';

  const heapNum = parseFloat(heapUsedMB) || 0;
  const heapQuality = heapNum < 200 ? 'good' : heapNum < 400 ? 'warn' : 'bad';

  const dupeCount = processedCount - uniqueRowCount;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-body scroll-y flex-1">

        <DiagRow label="Tick count"    value={tickCount.toLocaleString()} />
        <DiagRow label="Ticks/sec"     value={`${ticksPerSec}/s`} quality={ticksPerSec >= 4 ? 'good' : 'warn'} />
        <DiagRow label="Proc. latency" value={`${processingLatencyMs}ms`} quality={latencyQuality} />
        <DiagRow label="Heap (Chrome)" value={heapUsedMB !== undefined ? `${heapUsedMB} MB` : 'N/A'} quality={heapQuality} />
        <DiagRow label="Unique rows"   value={uniqueRowCount.toLocaleString()} />
        <DiagRow label="Total events"  value={processedCount.toLocaleString()} />
        <DiagRow label="Re-emissions"  value={dupeCount.toLocaleString()} quality="warn" />
        <DiagRow label="Stream state"  value={paused ? 'PAUSED' : 'LIVE'} quality={paused ? 'warn' : 'good'} />

        <div style={{ height: 8 }} />

        <BatchHistogram batchSizes={batchSizes} />

        <div style={{ height: 8 }} />

        <QueueGauge queueCount={queuedRowCount} isPaused={paused} />
      </div>
    </div>
  );
}

export default memo(DiagnosticsPanel);
