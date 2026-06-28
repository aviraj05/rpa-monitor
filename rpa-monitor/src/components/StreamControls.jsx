/**
 * StreamControls.jsx
 * Top command bar: status, pause/play, queue count, fps ticker, layout toggles.
 */

import { memo, useState, useEffect, useRef } from 'react';

function FpsTicker({ processingLatencyMs }) {
  const color = processingLatencyMs < 10 ? 'var(--green)'
              : processingLatencyMs < 50 ? 'var(--amber)'
              : 'var(--red)';
  return (
    <span className="fps-display font-mono" style={{ color }}>
      {processingLatencyMs}ms
    </span>
  );
}

function StreamControls({
  snapshot,
  onPause,
  onResume,
  onOpenAnalytics,
  onSimulateAlert,
  onOpenCommandPalette,
  onToggleLayoutMenu,
  showLayoutMenu,
  layout,
  onTogglePanel,
  onResetLayout,
  colVisibility,
  onToggleColumn,
  density,
  onSetDensity,
}) {
  const isPaused   = snapshot?.paused ?? false;
  const queueCount = snapshot?.queuedRowCount ?? 0;
  const latency    = snapshot?.processingLatencyMs ?? 0;
  const tickCount  = snapshot?.tickCount ?? 0;
  const lastTickMs = snapshot?.lastTickMs ?? 0;

  // Compute stream health
  const now = Date.now();
  const msSinceTick = lastTickMs ? now - lastTickMs : 9999;
  const isLive = !isPaused && msSinceTick < 600;

  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showLayoutMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onToggleLayoutMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLayoutMenu, onToggleLayoutMenu]);

  const PANELS = [
    { key: 'showKpiStrip',      label: 'KPI Strip' },
    { key: 'showLeftSidebar',   label: 'Filter Panel' },
    { key: 'showRightSidebar',  label: 'Right Panel' },
    { key: 'showDiagnostics',   label: 'Diagnostics' },
    { key: 'showDeptAnalytics', label: 'Dept Analytics' },
    { key: 'showWorldMap',      label: 'World Map' },
  ];

  const ALL_COLUMNS = [
    { key: 'project_id',           label: 'Project ID' },
    { key: 'project_name',         label: 'Project Name' },
    { key: 'automation_type',      label: 'Automation Type' },
    { key: 'robots_deployed',      label: 'Robots' },
    { key: 'budget_usd',           label: 'Budget' },
    { key: 'annual_savings_usd',   label: 'Savings' },
    { key: 'roi_percent',          label: 'ROI %' },
    { key: 'roi_spark',            label: 'ROI Trend' },
    { key: 'employee_hours_saved', label: 'Hrs Saved' },
    { key: 'department',           label: 'Department' },
    { key: 'country',              label: 'Country' },
    { key: 'ai_enabled',           label: 'AI Enabled' },
    { key: 'cloud_deployment',     label: 'Cloud' },
    { key: 'industry',             label: 'Industry' },
  ];

  return (
    <div className="topbar">
      {/* Logo */}
      <div className="topbar-logo">
        <div className="topbar-logo-mark">R</div>
        <div>
          <div className="topbar-logo-text">RPA Control Terminal</div>
          <div className="topbar-logo-sub">Enterprise Monitor v2.0</div>
        </div>
      </div>

      <div className="topbar-divider" />

      {/* Stream status */}
      <div className="topbar-stream-status">
        <div className={`pulse-dot ${isPaused ? 'pulse-dot-paused' : isLive ? 'pulse-dot-active' : 'pulse-dot-dead'}`} />
        <span style={{ color: isPaused ? 'var(--amber)' : isLive ? 'var(--green)' : 'var(--red)' }}>
          {isPaused ? 'PAUSED' : isLive ? 'LIVE' : 'CONNECTING'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          tick #{tickCount.toLocaleString()}
        </span>
      </div>

      <div className="topbar-divider" />

      {/* Pause / Play */}
      {isPaused ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-green"
            onClick={onResume}
            id="btn-resume-stream"
            title="Resume stream — flush queued rows"
          >
            ▶ Resume
            {queueCount > 0 && (
              <span style={{
                background: 'rgba(255,182,39,0.2)',
                color: 'var(--amber)',
                borderRadius: 3,
                padding: '0 5px',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}>
                {queueCount.toLocaleString()} queued
              </span>
            )}
          </button>
          <button
            className="analytics-toggle-btn"
            onClick={onOpenAnalytics}
            id="btn-analytics-view"
            title="Open Chart.js visualisations for frozen dataset"
          >
            📊 Analytics View
          </button>
        </div>
      ) : (
        <button
          className="btn btn-amber"
          onClick={onPause}
          id="btn-pause-stream"
          title="Pause stream — freeze grid, keep ingesting"
        >
          ⏸ Pause
        </button>
      )}

      {/* Simulate alert */}
      <button
        className="btn btn-red sim-alert-btn"
        onClick={onSimulateAlert}
        id="btn-simulate-alert"
        title="Inject a synthetic Failed/negative-ROI row"
      >
        ⚡ Simulate Alert
      </button>

      <div className="topbar-divider" />

      {/* Processing latency */}
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>latency</span>
      <FpsTicker processingLatencyMs={latency} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Density toggle */}
      <div className="density-toggle-group">
        {['compact','comfortable','spacious'].map(d => (
          <button
            key={d}
            className={`density-btn${density === d ? ' active' : ''}`}
            onClick={() => onSetDensity(d)}
            title={`Row density: ${d}`}
          >
            {d === 'compact' ? '≡' : d === 'comfortable' ? '☰' : '⊟'}
          </button>
        ))}
      </div>

      {/* Command palette */}
      <button
        className="btn btn-ghost"
        onClick={onOpenCommandPalette}
        id="btn-command-palette"
        title="Command palette (Ctrl+K)"
      >
        ⌘ <span className="hotkey">Ctrl K</span>
      </button>

      {/* Layout menu */}
      <div className="layout-menu" ref={menuRef}>
        <button
          className="btn btn-ghost"
          onClick={onToggleLayoutMenu}
          id="btn-layout-menu"
          title="Toggle panel visibility"
        >
          ⊞ Layout
        </button>

        {showLayoutMenu && (
          <div className="layout-dropdown">
            <div style={{ padding: '4px 8px 2px', fontSize: 9, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Panels
            </div>
            {PANELS.map(({ key, label }) => (
              <div key={key} className="layout-item" onClick={() => onTogglePanel(key)}>
                <span>{label}</span>
                <span style={{ color: layout[key] ? 'var(--green)' : 'var(--text-muted)', fontSize: 14 }}>
                  {layout[key] ? '✓' : '○'}
                </span>
              </div>
            ))}

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            <div style={{ padding: '4px 8px 2px', fontSize: 9, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Columns
            </div>
            <div className="col-vis-menu" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {ALL_COLUMNS.map(({ key, label }) => (
                <div key={key} className="col-vis-item" onClick={() => onToggleColumn(key)}>
                  <span style={{ color: colVisibility[key] !== false ? 'var(--green)' : 'var(--text-muted)', fontSize: 12 }}>
                    {colVisibility[key] !== false ? '▣' : '□'}
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            <div className="layout-item" onClick={onResetLayout} style={{ color: 'var(--red)' }}>
              ↺ Reset Layout
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(StreamControls);
