/**
 * App.jsx
 * Root application component.
 *
 * Responsibilities:
 *  - Create and own the RpaStreamEngine singleton
 *  - Bridge dataStream.js callback → engine.ingestBatch()
 *  - Subscribe to engine snapshots → propagate to child components
 *  - Manage layout state (panel visibility, column visibility, density)
 *  - Manage UI-layer state: inspector row, command palette, layout menu
 *  - Keyboard shortcuts: Ctrl+K (palette), Escape (close)
 *  - Export filtered rows as CSV via clipboard
 *  - tab visibility handling (pause render on background)
 */

import { useEffect, useState, useCallback, useRef } from 'react';

import '../styles/base.css';
import '../styles/grid.css';
import '../styles/dashboard.css';

import { RpaStreamEngine } from '../stream/RpaStreamEngine.js';
import {
  loadLayout, saveLayout, togglePanel, resetLayout as resetLayoutStore,
  loadColVisibility, toggleColumn,
  loadDensity, saveDensity,
} from './layoutStore.js';

import BootSequence       from '../components/BootSequence.jsx';
import KpiStrip           from '../components/KpiStrip.jsx';
import StreamControls     from '../components/StreamControls.jsx';
import CategoricalFilters from '../components/CategoricalFilters.jsx';
import DiagnosticsPanel   from '../components/DiagnosticsPanel.jsx';
import DepartmentAnalytics from '../components/DepartmentAnalytics.jsx';
import RowInspector       from '../components/RowInspector.jsx';
import CommandPalette     from '../components/CommandPalette.jsx';
import VirtualRpaGrid     from '../grid/VirtualRpaGrid.jsx';
import AnalyticsOverlay   from '../components/AnalyticsOverlay.jsx';
import { exportCsvInBackground } from '../utils/csvExporter.js';

// ---- Singleton engine — created once ----
const engine = new RpaStreamEngine();

export default function App() {
  // ---- Boot state ----
  const [bootVisible,  setBootVisible]  = useState(true);
  const [streamReady,  setStreamReady]  = useState(false);
  const streamReadyRef = useRef(false);

  // ---- Layout state ----
  const [layout,       setLayout]       = useState(loadLayout);
  const [colVisibility, setColVisibility] = useState(loadColVisibility);
  const [density,      setDensity]      = useState(loadDensity);

  // ---- UI state ----
  const [showLayoutMenu,     setShowLayoutMenu]     = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [inspectorRow,       setInspectorRow]       = useState(null);
  const [showAnalytics,      setShowAnalytics]      = useState(false);
  const [exportProgress,     setExportProgress]     = useState(null);

  // ---- Stream snapshot (triggers React renders) ----
  const [snapshot, setSnapshot] = useState(null);

  // Subscribe to engine once
  useEffect(() => {
    const unsub = engine.subscribe((snap) => {
      setSnapshot(snap);
    });
    return unsub;
  }, []);

  // ---- Initialize dataStream.js ----
  useEffect(() => {
    if (typeof window.initializeRpaStream !== 'function') {
      console.error('❌ dataStream.js not loaded. Check index.html script order.');
      return;
    }

    window.initializeRpaStream((incomingBatch) => {
      if (!streamReadyRef.current) {
        streamReadyRef.current = true;
        setStreamReady(true);
      }
      engine.ingestBatch(incomingBatch);
    }, './automation_projects.csv');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // streamReady drives BootSequence exit — no additional effect needed

  // ---- Tab visibility — pause render when backgrounded ----
  useEffect(() => {
    const handleVisibility = () => {
      // We don't pause the engine (still ingests), just note for diagnostics
      // The RAF scheduling in the engine already throttles when tab is hidden
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K or Cmd+K → command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(p => !p);
        return;
      }
      // Escape → close overlays
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowLayoutMenu(false);
        setInspectorRow(null);
        setShowAnalytics(false);
        return;
      }
      // Ctrl+Shift+E → direct downloadable CSV
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleExport();
        return;
      }
      // Ctrl+F → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('grid-search-input')?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handlePause  = useCallback(() => engine.pause(),  []);
  const handleResume = useCallback(() => {
    engine.resume();
    setShowAnalytics(false);
  }, []);

  const handleSimulateAlert = useCallback(() => {
    engine.injectAlertRow();
  }, []);

  const handleTogglePanel = useCallback((key) => {
    setLayout(prev => {
      const updated = togglePanel(prev, key);
      return updated;
    });
    setShowLayoutMenu(false);
  }, []);

  const handleResetLayout = useCallback(() => {
    const reset = resetLayoutStore();
    setLayout(reset);
    setShowLayoutMenu(false);
  }, []);

  const handleToggleColumn = useCallback((key) => {
    setColVisibility(prev => toggleColumn(prev, key));
  }, []);

  const handleSetDensity = useCallback((d) => {
    setDensity(d);
    saveDensity(d);
  }, []);

  // Row click → open inspector if paused
  const handleRowClick = useCallback((uid, isPaused) => {
    if (!isPaused) return;
    const row = engine.getRow(uid);
    if (row) setInspectorRow(row);
  }, []);

  // Export filtered rows as CSV in a Web Worker (downloadable file)
  const handleExport = useCallback(() => {
    if (exportProgress !== null) return;

    const ids = engine.visibleIds;
    if (ids.length === 0) return;

    const headers = [
      'project_id','project_name','company_id','project_status','automation_type',
      'robots_deployed','budget_usd','annual_savings_usd','roi_percent',
      'employee_hours_saved','department','country','industry',
      'ai_enabled','cloud_deployment','implementation_partner',
      'start_date','completion_date',
    ];

    const dataToExport = [];
    for (let i = 0; i < ids.length; i++) {
      const row = engine.rowsById.get(ids[i]);
      if (row) dataToExport.push(row);
    }

    setExportProgress(0);

    exportCsvInBackground(
      dataToExport,
      headers,
      (progress) => {
        setExportProgress(progress);
      },
      (csvBlob) => {
        setExportProgress(null);
        
        // Trigger browser file download
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `rpa_snapshot_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    );
  }, [exportProgress]);

  // ---- Right sidebar content switcher ----
  const rightPanelTab = useRef('diag');
  const [rightTab, setRightTab] = useState('diag');

  return (
    <>
      {/* Boot overlay */}
      {bootVisible && (
        <BootSequence
          streamReady={streamReady && snapshot && snapshot.processedCount > 0}
          onComplete={() => setBootVisible(false)}
        />
      )}

      {/* Command palette */}
      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onPause={handlePause}
          onResume={handleResume}
          onOpenAnalytics={() => setShowAnalytics(true)}
          onSimulateAlert={handleSimulateAlert}
          onTogglePanel={handleTogglePanel}
          onResetLayout={handleResetLayout}
          onExport={handleExport}
          onSetDensity={handleSetDensity}
          layout={layout}
          isPaused={snapshot?.paused ?? false}
        />
      )}

      {/* Analytics Overlay (Chart.js) */}
      {showAnalytics && snapshot?.paused && (
        <AnalyticsOverlay
          engine={engine}
          snapshot={snapshot}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      <div className={`app-shell density-${density}`}>

        {/* Top command bar */}
        <StreamControls
          snapshot={snapshot}
          onPause={handlePause}
          onResume={handleResume}
          onOpenAnalytics={() => setShowAnalytics(true)}
          onSimulateAlert={handleSimulateAlert}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onToggleLayoutMenu={() => setShowLayoutMenu(p => !p)}
          showLayoutMenu={showLayoutMenu}
          layout={layout}
          onTogglePanel={handleTogglePanel}
          onResetLayout={handleResetLayout}
          colVisibility={colVisibility}
          onToggleColumn={handleToggleColumn}
          density={density}
          onSetDensity={handleSetDensity}
          exportProgress={exportProgress}
          onExport={handleExport}
        />

        {/* KPI strip */}
        {layout.showKpiStrip && (
          <KpiStrip snapshot={snapshot} />
        )}

        {/* Main content area */}
        <div className="main-content">

          {/* Left sidebar — Filters */}
          {layout.showLeftSidebar && (
            <CategoricalFilters snapshot={snapshot} engine={engine} />
          )}

          {/* Main grid */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <VirtualRpaGrid
              snapshot={snapshot}
              engine={engine}
              visibleColumns={colVisibility}
              onRowClick={handleRowClick}
              density={density}
              onOpenAnalytics={() => setShowAnalytics(true)}
            />
          </div>

          {/* Row inspector — shown when a row is selected while paused */}
          {inspectorRow && snapshot?.paused && (
            <RowInspector
              row={inspectorRow}
              engine={engine}
              onClose={() => setInspectorRow(null)}
            />
          )}

          {/* Right sidebar — Diagnostics / Analytics / World Map */}
          {layout.showRightSidebar && !inspectorRow && (
            <div className="sidebar-right">
              {/* Tab switcher */}
              <div className="panel-header" style={{ gap: 0, padding: 0 }}>
                {[
                  layout.showDiagnostics   && { key: 'diag', icon: '🔬', label: 'Diagnostics' },
                  layout.showDeptAnalytics && { key: 'dept', icon: '📈', label: 'Analytics' },
                  layout.showWorldMap      && { key: 'map',  icon: '🗺', label: 'World Map' },
                ].filter(Boolean).map(tab => (
                  <button
                    key={tab.key}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      background: rightTab === tab.key ? 'var(--bg-hover)' : 'transparent',
                      border: 'none',
                      borderBottom: rightTab === tab.key ? '2px solid var(--cyan)' : '2px solid transparent',
                      color: rightTab === tab.key ? 'var(--cyan)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setRightTab(tab.key)}
                    title={tab.label}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {rightTab === 'diag' && layout.showDiagnostics && (
                <DiagnosticsPanel snapshot={snapshot} />
              )}
              {rightTab === 'dept' && layout.showDeptAnalytics && (
                <DepartmentAnalytics engine={engine} snapshot={snapshot} />
              )}
              {rightTab === 'map' && layout.showWorldMap && (
                <div className="panel-body" style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🗺</div>
                  <div>World map view</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Enable in Layout menu</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
