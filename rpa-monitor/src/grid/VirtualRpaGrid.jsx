/**
 * VirtualRpaGrid.jsx
 * React wrapper around the imperative GridDomRenderer.
 *
 * React manages: column headers (sort click), footer, empty state, paused banner.
 * The DOM renderer manages: all row content, recycled pool, scroll handling.
 *
 * This component NEVER re-renders React rows on stream ticks —
 * it calls renderer.update() imperatively via useEffect.
 */

import { useEffect, useRef, useCallback, memo } from 'react';
import { GridDomRenderer, DEFAULT_COLUMNS } from './gridDomRenderer.js';

// ---- Column header component ----
const ColumnHeader = memo(function ColumnHeader({
  col, sortSpec, onSort, onShiftSort, colWidth
}) {
  const sortEntry = sortSpec.find(s => s.field === col.key);
  const isActive  = !!sortEntry;
  const sortIdx   = sortSpec.indexOf(sortEntry) + 1;
  const dir       = sortEntry?.direction;

  const handleClick = useCallback((e) => {
    if (!col.sortable) return;
    if (e.shiftKey) {
      onShiftSort(col.key);
    } else {
      onSort(col.key, dir === 'asc' ? 'desc' : 'asc');
    }
  }, [col, dir, onSort, onShiftSort]);

  let sortIcon = null;
  if (col.sortable) {
    if (isActive) {
      sortIcon = <span className={`sort-icon active`}>{dir === 'asc' ? '▲' : '▼'}</span>;
    } else {
      sortIcon = <span className="sort-icon">⇅</span>;
    }
  }

  return (
    <div
      className={`grid-header-cell${col.sortable ? ' sortable' : ''}${isActive ? ' sort-active' : ''}`}
      style={{ width: colWidth || col.width, minWidth: colWidth || col.width }}
      onClick={handleClick}
      role="columnheader"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      data-tooltip={col.sortable ? `Sort by ${col.label}${sortSpec.length > 1 && isActive ? ' (Shift+click to multi-sort)' : ''}\nShift+click to multi-sort` : undefined}
    >
      <span className="truncate">{col.label}</span>
      {sortIcon}
      {isActive && sortSpec.length > 1 && (
        <span className="sort-priority">{sortIdx}</span>
      )}
    </div>
  );
});

// ---- Main Grid component ----
function VirtualRpaGrid({
  snapshot,
  engine,
  visibleColumns,
  onRowClick,
  density,
}) {
  const scrollRef  = useRef(null);
  const spacerRef  = useRef(null);
  const poolRef    = useRef(null);
  const rendererRef = useRef(null);

  // Derive row height from density
  const rowHeight = density === 'compact' ? 24
                  : density === 'spacious' ? 38 : 30;

  // Filtered column list based on visibility settings
  const columns = visibleColumns
    ? DEFAULT_COLUMNS.filter(c => visibleColumns[c.key] !== false)
    : DEFAULT_COLUMNS;

  // ---- Mount / unmount renderer ----
  useEffect(() => {
    if (!poolRef.current || !scrollRef.current || !spacerRef.current) return;

    const renderer = new GridDomRenderer(
      poolRef.current,
      scrollRef.current,
      spacerRef.current,
      {
        rowHeight,
        columns,
        onRowClick:  (uid, isPaused) => onRowClick(uid, isPaused),
        onPinToggle: (uid) => engine.togglePin(uid),
        pinnedRows:  engine.pinnedRows,
      }
    );
    rendererRef.current = renderer;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []); // intentionally empty — renderer is imperative

  // ---- Update renderer whenever snapshot changes ----
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !snapshot) return;
    r.update(
      snapshot.visibleIds,
      engine.rowsById,
      engine.rowHistory,
      snapshot.pinnedRows,
      snapshot.paused,
    );
  }, [snapshot]); // runs every time snapshot reference changes (each RAF frame)

  // ---- Sync row height if density changes ----
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setRowHeight(rowHeight);
  }, [rowHeight]);

  // ---- Sync columns if visibility changes ----
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setColumns(columns);
  }, [visibleColumns]);

  // ---- Sort handlers (passed to React header, not the renderer) ----
  const handleSort = useCallback((field, direction) => {
    engine.setSort(field, direction);
  }, [engine]);

  const handleShiftSort = useCallback((field) => {
    engine.addSort(field);
  }, [engine]);

  const sortSpec = snapshot?.sortSpec || [];
  const totalVisible = snapshot?.visibleCount ?? 0;
  const totalRows    = snapshot?.totalRows ?? 0;
  const isPaused     = snapshot?.paused ?? false;
  const queueCount   = snapshot?.queuedRowCount ?? 0;

  const totalColWidth = columns.reduce((s, c) => s + c.width, 0);

  return (
    <div className="grid-shell" style={{ '--row-height': rowHeight + 'px' }}>

      {/* Paused banner */}
      {isPaused && (
        <div className="grid-paused-banner">
          <span>⏸</span>
          <span>
            Stream paused — <strong>{queueCount.toLocaleString()}</strong> rows queued.
            Click any row to inspect it.
          </span>
        </div>
      )}

      {/* Column headers — React-managed for sort click handling */}
      <div
        className="grid-header"
        role="row"
        style={{ minWidth: totalColWidth }}
      >
        {columns.map(col => (
          <ColumnHeader
            key={col.key}
            col={col}
            sortSpec={sortSpec}
            onSort={handleSort}
            onShiftSort={handleShiftSort}
          />
        ))}
      </div>

      {/* Scroll viewport — all row content is managed by GridDomRenderer */}
      <div
        ref={scrollRef}
        className="grid-scroll-viewport"
        role="grid"
        aria-label="RPA Projects Grid"
        aria-rowcount={totalRows}
        tabIndex={0}
      >
        {/* Spacer sets total scrollable height */}
        <div ref={spacerRef} className="grid-spacer" />

        {/* Fixed pool of DOM row nodes — positioned by renderer */}
        <div
          ref={poolRef}
          className="grid-row-pool"
          style={{ minWidth: totalColWidth, position: 'relative' }}
        />

        {/* Empty state */}
        {totalVisible === 0 && totalRows > 0 && (
          <div className="grid-empty-state">
            <div className="empty-icon">⚬</div>
            <div>No rows match current filters</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {totalRows.toLocaleString()} total rows in dataset
            </div>
          </div>
        )}

        {totalRows === 0 && (
          <div className="grid-empty-state">
            <div className="empty-icon">📡</div>
            <div>Awaiting stream data…</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="grid-footer">
        <span>
          Showing{' '}
          <span className="count-highlight">{totalVisible.toLocaleString()}</span>
          {' '}of{' '}
          <span className="count-highlight">{totalRows.toLocaleString()}</span>
          {' '}rows
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          DOM pool: {rendererRef.current?.poolSize ?? '—'} nodes
        </span>
      </div>
    </div>
  );
}

export default memo(VirtualRpaGrid);
