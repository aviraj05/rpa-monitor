/**
 * RpaStreamEngine.js
 * Core state engine for the RPA Control Terminal.
 *
 * Architecture: Plain JS class (no React). React components subscribe to
 * snapshots. The virtual grid reads snapshots imperatively.
 *
 * Responsibilities:
 *  - Ingest batches from dataStream.js every 200ms
 *  - Normalize rows via normalizeRow()
 *  - Maintain canonical row store (rowsById Map)
 *  - Maintain snapshot aggregate KPIs
 *  - Manage pause/play queue semantics
 *  - Compute derived visibleIds (filter + search + sort)
 *  - Emit lightweight snapshots to subscribers via requestAnimationFrame
 *  - Track diagnostics (tick rate, batch sizes, latency)
 *  - Maintain row history for sparklines
 *  - Handle pinned rows persisted in localStorage
 */

import { normalizeRow } from './normalizeRow.js';

// ---- Sort comparator helpers ----
const NUMERIC_FIELDS = new Set([
  'robots_deployed', 'budget_usd', 'annual_savings_usd',
  'roi_percent', 'employee_hours_saved',
]);

function compareRows(a, b, field, direction) {
  const va = a[field];
  const vb = b[field];
  let cmp;
  if (NUMERIC_FIELDS.has(field)) {
    cmp = (va || 0) - (vb || 0);
  } else {
    cmp = String(va ?? '').localeCompare(String(vb ?? ''));
  }
  return direction === 'asc' ? cmp : -cmp;
}

// ---- Category fields to track ----
const CAT_FIELDS = [
  'automation_type', 'department', 'industry',
  'country', 'project_status', 'ai_enabled', 'cloud_deployment',
];

export class RpaStreamEngine {
  constructor() {
    // ---- Canonical store ----
    this.rowsById  = new Map();   // uid -> NormalizedRow
    this.rowOrder  = [];          // insertion order of uids

    // ---- KPI aggregates (snapshot sum — latest value per row) ----
    this.processedCount = 0;      // total row-events received (may count same uid multiple times)
    this.uniqueRowCount = 0;      // unique project IDs seen
    this.robotsTotal    = 0;      // sum of robots_deployed across all known rows (latest values)
    this.savingsTotal   = 0;      // sum of annual_savings_usd across all known rows
    this.anomalyCount   = 0;      // rows with Failed status or negative ROI

    // ---- Category option sets (built from observed data) ----
    this.categoryOptions = {};
    CAT_FIELDS.forEach(f => { this.categoryOptions[f] = new Set(); });

    // ---- Filter / search / sort state ----
    this.filters  = {};           // { [field]: Set<string> } — active selections
    this.query    = '';           // search text
    this.sortSpec = [];           // [{ field, direction }]

    // ---- Derived view ----
    this.visibleIds  = [];
    this._viewDirty  = false;
    this._lastSortedOrder = null; // cached sorted base before filter/search

    // ---- Pause / queue ----
    this.paused          = false;
    this.queuedRowCount  = 0;    // rows processed into canonical store while paused but not yet published
    this._pendingFlush   = false;

    // ---- Diagnostics ----
    this.tickCount        = 0;
    this.ticksPerSec      = 0;
    this.batchSizes       = new Array(20).fill(0); // circular buffer of last 20 batch sizes
    this._batchPtr        = 0;
    this.processingLatencyMs = 0;
    this.lastTickMs       = 0;
    this._tickSecCounter  = 0;
    this._tickSecReset    = 0;

    // ---- Row sparkline history ----
    // Map<uid, { roi: number[] }> — capped at 12 values
    this.rowHistory = new Map();

    // ---- Search blob cache ----
    this._searchBlobs = new Map(); // uid -> lowercased searchable string

    // ---- Pinned rows ----
    this._loadPinned();

    // ---- Subscribers ----
    // Subscribe to full snapshots (grid, panels)
    this._subscribers = new Set();
    // Subscribe to lightweight KPI-only updates
    this._kpiSubscribers = new Set();

    // ---- RAF frame scheduling ----
    this._rafScheduled = false;

    // ---- Column visibility (persisted) ----
    const savedCols = localStorage.getItem('rpa_col_visibility');
    this.colVisibility = savedCols ? JSON.parse(savedCols) : null;

    // ---- Density ----
    this.density = localStorage.getItem('rpa_density') || 'comfortable';

    // ---- Diagnostics ticks-per-second ticker ----
    setInterval(() => {
      this.ticksPerSec = this._tickSecCounter;
      this._tickSecCounter = 0;
      // Sample heap if available (Chrome only)
      if (performance.memory) {
        this.heapUsedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
      }
    }, 1000);
  }

  // ----------------------------------------------------------------
  // Public API — called by React bridge
  // ----------------------------------------------------------------

  /** Subscribe to full state snapshots */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  /** Subscribe to lightweight KPI-only snapshots */
  subscribeKpi(callback) {
    this._kpiSubscribers.add(callback);
    return () => this._kpiSubscribers.delete(callback);
  }

  /** Called by the React bridge with each incoming batch */
  ingestBatch(batch) {
    const start = performance.now();
    this._tickSecCounter++;
    this.tickCount++;
    this.lastTickMs = Date.now();

    // Record batch size in circular buffer
    this.batchSizes[this._batchPtr] = batch.length;
    this._batchPtr = (this._batchPtr + 1) % 20;

    // Accumulate aggregates deltas before processing
    this._processRows(batch);

    if (!this.paused) {
      this._scheduleFrame();
    } else {
      // Still process into canonical store; track queued count
      this.queuedRowCount += batch.length;
      // Notify KPI subscribers only (KPIs still update while paused, grid doesn't)
      this._scheduleKpiFrame();
    }

    this.processingLatencyMs = Math.round(performance.now() - start);
  }

  /** Pause the stream UI output */
  pause() {
    this.paused = true;
    this.queuedRowCount = 0;
    this._notifySubscribers(); // update controls immediately
  }

  /** Resume — rebuild view once from latest canonical state */
  resume() {
    this.paused = false;
    this.queuedRowCount = 0;
    this._viewDirty = true;
    this._scheduleFrame();
  }

  /** Set search query */
  setQuery(q) {
    this.query = q;
    this._viewDirty = true;
    if (!this.paused) this._scheduleFrame();
  }

  /** Set filter for a field */
  setFilter(field, values) {
    if (values.size === 0) {
      delete this.filters[field];
    } else {
      this.filters[field] = values;
    }
    this._viewDirty = true;
    if (!this.paused) this._scheduleFrame();
  }

  /** Clear all filters and search */
  clearFilters() {
    this.filters = {};
    this.query = '';
    this._viewDirty = true;
    if (!this.paused) this._scheduleFrame();
  }

  /** Set sort spec — replaces (normal click) */
  setSort(field, direction) {
    this.sortSpec = [{ field, direction }];
    this._viewDirty = true;
    this._lastSortedOrder = null;
    if (!this.paused) this._scheduleFrame();
  }

  /** Add/cycle field in sort spec (Shift+click multi-sort) */
  addSort(field) {
    const existing = this.sortSpec.find(s => s.field === field);
    if (!existing) {
      this.sortSpec = [...this.sortSpec, { field, direction: 'asc' }];
    } else if (existing.direction === 'asc') {
      this.sortSpec = this.sortSpec.map(s =>
        s.field === field ? { ...s, direction: 'desc' } : s
      );
    } else {
      // Remove from sort
      this.sortSpec = this.sortSpec.filter(s => s.field !== field);
    }
    this._viewDirty = true;
    this._lastSortedOrder = null;
    if (!this.paused) this._scheduleFrame();
  }

  /** Toggle row pin */
  togglePin(uid) {
    if (this.pinnedRows.has(uid)) {
      this.pinnedRows.delete(uid);
    } else {
      this.pinnedRows.add(uid);
    }
    this._savePinned();
    this._viewDirty = true;
    if (!this.paused) this._scheduleFrame();
  }

  /** Get row by uid */
  getRow(uid) {
    return this.rowsById.get(uid);
  }

  /** Inject a synthetic alert row (Simulate Alert button) */
  injectAlertRow() {
    if (this.rowOrder.length === 0) return;
    // Pick a random known uid and inject a Failed / negative ROI version
    const randomIdx = Math.floor(Math.random() * Math.min(this.rowOrder.length, 100));
    const uid = this.rowOrder[randomIdx];
    const existing = this.rowsById.get(uid);
    if (!existing) return;

    const alertRow = {
      ...existing,
      project_status: 'Failed',
      roi_percent: -(Math.random() * 50 + 5).toFixed(2) * 1,
    };
    this._processRows([alertRow]);
    this._scheduleFrame();
  }

  /** Get a snapshot for the current state */
  getSnapshot() {
    return {
      // KPIs
      processedCount:  this.processedCount,
      uniqueRowCount:  this.uniqueRowCount,
      robotsTotal:     this.robotsTotal,
      savingsTotal:    this.savingsTotal,
      anomalyCount:    this.anomalyCount,

      // View
      visibleIds:      this.visibleIds,
      totalRows:       this.rowOrder.length,
      visibleCount:    this.visibleIds.length,

      // Pause state
      paused:          this.paused,
      queuedRowCount:  this.queuedRowCount,

      // Sort / filter
      sortSpec:        this.sortSpec,
      filters:         this.filters,
      query:           this.query,

      // Diagnostics
      tickCount:        this.tickCount,
      ticksPerSec:      this.ticksPerSec,
      batchSizes:       [...this.batchSizes],
      processingLatencyMs: this.processingLatencyMs,
      lastTickMs:       this.lastTickMs,
      heapUsedMB:       this.heapUsedMB || '—',

      // Category options
      categoryOptions:  this.categoryOptions,

      // Pinned
      pinnedRows:       this.pinnedRows,

      // Density
      density:          this.density,
    };
  }

  // ----------------------------------------------------------------
  // Private — row processing
  // ----------------------------------------------------------------

  _processRows(batch) {
    const prevRobots  = new Map();
    const prevSavings = new Map();

    for (const raw of batch) {
      const row = normalizeRow(raw);
      const uid = row.internal_uid;
      if (!uid) continue;

      const isNew = !this.rowsById.has(uid);

      if (isNew) {
        this.rowOrder.push(uid);
        this.uniqueRowCount++;

        // Populate category option sets
        CAT_FIELDS.forEach(f => {
          const v = row[f];
          if (v) this.categoryOptions[f].add(v);
        });

        // Init search blob
        this._searchBlobs.set(uid, this._buildBlob(row));
      } else {
        // Track previous values for delta aggregation
        const old = this.rowsById.get(uid);
        prevRobots.set(uid,  old.robots_deployed);
        prevSavings.set(uid, old.annual_savings_usd);
      }

      // Update canonical store
      this.rowsById.set(uid, row);
      this.processedCount++;

      // Update search blob (values may have changed)
      if (!isNew) {
        this._searchBlobs.set(uid, this._buildBlob(row));
      }

      // Maintain row sparkline history (capped at 12 for memory safety)
      if (!this.rowHistory.has(uid)) this.rowHistory.set(uid, { roi: [] });
      const hist = this.rowHistory.get(uid);
      hist.roi.push(row.roi_percent);
      if (hist.roi.length > 12) hist.roi.shift();
    }

    // Recompute snapshot aggregates (O(n) over all rows — acceptable for 50k)
    // We do this on every tick rather than delta-tracking to stay correct.
    // For 50k rows the sum loop is ~0.5ms, well within 200ms budget.
    this._recomputeAggregates();
    this._viewDirty = true;
  }

  _recomputeAggregates() {
    let robots = 0, savings = 0, anomalies = 0;
    for (const row of this.rowsById.values()) {
      robots  += row.robots_deployed;
      savings += row.annual_savings_usd;
      if (row._isAlert) anomalies++;
    }
    this.robotsTotal  = robots;
    this.savingsTotal = savings;
    this.anomalyCount = anomalies;
  }

  _buildBlob(row) {
    return [
      row.project_name,
      row.company_id,
      row.project_id,
      row.implementation_partner,
      row.country,
      row.industry,
      row.department,
      row.project_status,
      row.automation_type,
    ].join(' ').toLowerCase();
  }

  // ----------------------------------------------------------------
  // Private — view recomputation
  // ----------------------------------------------------------------

  _recomputeView() {
    if (!this._viewDirty) return;
    this._viewDirty = false;

    let ids = this.rowOrder;

    // ---- Filter (AND across fields, OR within field) ----
    const filterEntries = Object.entries(this.filters);
    if (filterEntries.length > 0) {
      ids = ids.filter(uid => {
        const row = this.rowsById.get(uid);
        if (!row) return false;
        return filterEntries.every(([field, vals]) => vals.has(row[field]));
      });
    }

    // ---- Fuzzy search (all tokens must match, order-independent) ----
    const q = this.query.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      ids = ids.filter(uid => {
        const blob = this._searchBlobs.get(uid) || '';
        return tokens.every(t => blob.includes(t));
      });
    }

    // ---- Sort ----
    if (this.sortSpec.length > 0) {
      // We must sort a copy to avoid mutating rowOrder
      ids = [...ids].sort((a, b) => {
        const ra = this.rowsById.get(a);
        const rb = this.rowsById.get(b);
        if (!ra || !rb) return 0;
        for (const { field, direction } of this.sortSpec) {
          const cmp = compareRows(ra, rb, field, direction);
          if (cmp !== 0) return cmp;
        }
        // Stable tie-breaker: insertion order
        return this.rowOrder.indexOf(a) - this.rowOrder.indexOf(b);
      });
    }

    // ---- Pinned rows always first ----
    if (this.pinnedRows.size > 0) {
      const pinned   = ids.filter(id => this.pinnedRows.has(id));
      const unpinned = ids.filter(id => !this.pinnedRows.has(id));
      ids = [...pinned, ...unpinned];
    }

    this.visibleIds = ids;
  }

  // ----------------------------------------------------------------
  // Private — frame scheduling & notification
  // ----------------------------------------------------------------

  _scheduleFrame() {
    if (this._rafScheduled) return;
    this._rafScheduled = true;
    requestAnimationFrame(() => {
      this._rafScheduled = false;
      this._recomputeView();
      this._notifySubscribers();
    });
  }

  _scheduleKpiFrame() {
    requestAnimationFrame(() => {
      this._notifyKpiSubscribers();
    });
  }

  _notifySubscribers() {
    const snap = this.getSnapshot();
    this._subscribers.forEach(cb => cb(snap));
    this._kpiSubscribers.forEach(cb => cb(snap));
  }

  _notifyKpiSubscribers() {
    const snap = this.getSnapshot();
    this._kpiSubscribers.forEach(cb => cb(snap));
  }

  // ----------------------------------------------------------------
  // Private — persistence
  // ----------------------------------------------------------------

  _loadPinned() {
    try {
      const saved = localStorage.getItem('rpa_pinned_rows');
      this.pinnedRows = new Set(saved ? JSON.parse(saved) : []);
    } catch {
      this.pinnedRows = new Set();
    }
  }

  _savePinned() {
    try {
      localStorage.setItem('rpa_pinned_rows', JSON.stringify([...this.pinnedRows]));
    } catch {
      // localStorage may be full
    }
  }
}
