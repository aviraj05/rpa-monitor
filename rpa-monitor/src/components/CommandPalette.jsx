/**
 * CommandPalette.jsx
 * Ctrl+K command palette with fuzzy command search.
 * Supports: panel toggles, export, layout reset, alert simulation,
 * pause/resume, density change, and filter preset shortcuts.
 */

import { useEffect, useState, useCallback, useRef, memo } from 'react';

function fuzzyMatchCmd(query, label) {
  const q = query.toLowerCase();
  return label.toLowerCase().includes(q);
}

export function CommandPalette({
  onClose,
  onPause,
  onResume,
  onSimulateAlert,
  onTogglePanel,
  onResetLayout,
  onExport,
  onSetDensity,
  layout,
  isPaused,
}) {
  const [query, setQuery]       = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build command list
  const allCommands = [
    {
      id: 'pause_resume',
      icon: isPaused ? '▶' : '⏸',
      label: isPaused ? 'Resume Stream' : 'Pause Stream',
      badge: isPaused ? 'PAUSED' : 'LIVE',
      action: isPaused ? onResume : onPause,
      group: 'Stream',
    },
    {
      id: 'simulate_alert',
      icon: '⚡',
      label: 'Simulate Alert Row',
      badge: 'inject',
      action: onSimulateAlert,
      group: 'Stream',
    },
    {
      id: 'export',
      icon: '↓',
      label: 'Export Filtered Rows (CSV)',
      badge: 'clipboard',
      action: onExport,
      group: 'Data',
    },
    {
      id: 'toggle_kpi',
      icon: '📊',
      label: `${layout.showKpiStrip ? 'Hide' : 'Show'} KPI Strip`,
      action: () => onTogglePanel('showKpiStrip'),
      group: 'Panels',
    },
    {
      id: 'toggle_filters',
      icon: '🔍',
      label: `${layout.showLeftSidebar ? 'Hide' : 'Show'} Filter Panel`,
      action: () => onTogglePanel('showLeftSidebar'),
      group: 'Panels',
    },
    {
      id: 'toggle_right',
      icon: '📋',
      label: `${layout.showRightSidebar ? 'Hide' : 'Show'} Right Panel`,
      action: () => onTogglePanel('showRightSidebar'),
      group: 'Panels',
    },
    {
      id: 'toggle_diag',
      icon: '🔬',
      label: `${layout.showDiagnostics ? 'Hide' : 'Show'} Diagnostics`,
      action: () => onTogglePanel('showDiagnostics'),
      group: 'Panels',
    },
    {
      id: 'toggle_dept',
      icon: '📈',
      label: `${layout.showDeptAnalytics ? 'Hide' : 'Show'} Dept Analytics`,
      action: () => onTogglePanel('showDeptAnalytics'),
      group: 'Panels',
    },
    {
      id: 'toggle_map',
      icon: '🗺',
      label: `${layout.showWorldMap ? 'Hide' : 'Show'} World Map`,
      action: () => onTogglePanel('showWorldMap'),
      group: 'Panels',
    },
    {
      id: 'density_compact',
      icon: '≡',
      label: 'Row Density: Compact',
      action: () => onSetDensity('compact'),
      group: 'View',
    },
    {
      id: 'density_comfortable',
      icon: '☰',
      label: 'Row Density: Comfortable',
      action: () => onSetDensity('comfortable'),
      group: 'View',
    },
    {
      id: 'density_spacious',
      icon: '⊟',
      label: 'Row Density: Spacious',
      action: () => onSetDensity('spacious'),
      group: 'View',
    },
    {
      id: 'reset_layout',
      icon: '↺',
      label: 'Reset Layout to Defaults',
      badge: 'caution',
      action: onResetLayout,
      group: 'View',
    },
  ];

  const filtered = query
    ? allCommands.filter(c => fuzzyMatchCmd(query, c.label) || fuzzyMatchCmd(query, c.group))
    : allCommands;

  // Group by category
  const groups = {};
  filtered.forEach(cmd => {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  });

  // Flat list for keyboard nav
  const flatFiltered = filtered;

  const execute = useCallback((cmd) => {
    cmd.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatFiltered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (flatFiltered[activeIdx]) execute(flatFiltered[activeIdx]);
    }
  }, [flatFiltered, activeIdx, execute, onClose]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  let globalIdx = 0;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="palette-input-wrap">
          <span className="palette-icon">⌘</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Type a command…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Command search"
            id="command-palette-input"
          />
          {query && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
              onClick={() => setQuery('')}
            >✕</button>
          )}
        </div>

        {/* Commands list */}
        <div className="palette-list" role="listbox">
          {Object.entries(groups).map(([groupName, cmds]) => (
            <div key={groupName}>
              <div className="palette-sep">{groupName}</div>
              {cmds.map(cmd => {
                const isActive = flatFiltered[activeIdx]?.id === cmd.id;
                const idx = globalIdx++;
                return (
                  <div
                    key={cmd.id}
                    className={`palette-item${isActive ? ' active' : ''}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => execute(cmd)}
                    onMouseEnter={() => setActiveIdx(flatFiltered.findIndex(c => c.id === cmd.id))}
                  >
                    <span className="palette-item-icon">{cmd.icon}</span>
                    <span className="palette-item-label">{cmd.label}</span>
                    {cmd.badge && (
                      <span className="palette-item-badge">{cmd.badge}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No commands match "{query}"
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="palette-footer">
          <span><span className="hotkey">↑↓</span> navigate</span>
          <span><span className="hotkey">Enter</span> execute</span>
          <span><span className="hotkey">Esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

export default memo(CommandPalette);
