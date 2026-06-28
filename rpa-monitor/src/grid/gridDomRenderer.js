/**
 * gridDomRenderer.js
 * Pure imperative DOM-based virtual grid renderer.
 *
 * NO React involved in this file — it runs entirely outside React's reconciler.
 *
 * Algorithm:
 *  - Maintains a fixed pool of DOM row elements (poolSize ≈ viewport / rowHeight + 8)
 *  - On scroll: computes startIndex = floor(scrollTop / rowHeight)
 *  - Reuses pooled rows by repositioning via transform:translateY
 *  - Never mounts > poolSize DOM rows regardless of dataset size
 *  - Row content updated via textContent / direct DOM property assignment (never innerHTML)
 *  - Sparklines drawn on pooled <canvas> elements
 */

// ---- Default column definitions ----
export const DEFAULT_COLUMNS = [
  { key: 'pin',                  label: '',          width: 32,  sortable: false, type: 'pin'      },
  { key: 'project_id',           label: 'Project ID',width: 90,  sortable: false, type: 'text'     },
  { key: 'project_name',         label: 'Project',   width: 190, sortable: false, type: 'text'     },
  { key: 'project_status',       label: 'Status',    width: 90,  sortable: false, type: 'status'   },
  { key: 'automation_type',      label: 'Type',      width: 150, sortable: false, type: 'text'     },
  { key: 'robots_deployed',      label: 'Robots',    width: 65,  sortable: true,  type: 'num'      },
  { key: 'budget_usd',           label: 'Budget',    width: 90,  sortable: true,  type: 'currency' },
  { key: 'annual_savings_usd',   label: 'Savings',   width: 90,  sortable: true,  type: 'currency' },
  { key: 'roi_percent',          label: 'ROI %',     width: 80,  sortable: true,  type: 'roi'      },
  { key: 'roi_spark',            label: 'ROI Trend', width: 70,  sortable: false, type: 'spark'    },
  { key: 'employee_hours_saved', label: 'Hrs Saved', width: 90,  sortable: true,  type: 'num'      },
  { key: 'department',           label: 'Department',width: 140, sortable: false, type: 'text'     },
  { key: 'country',              label: 'Country',   width: 110, sortable: false, type: 'text'     },
  { key: 'ai_enabled',           label: 'AI',        width: 45,  sortable: false, type: 'bool'     },
  { key: 'cloud_deployment',     label: 'Cloud',     width: 55,  sortable: false, type: 'bool'     },
  { key: 'industry',             label: 'Industry',  width: 150, sortable: false, type: 'text'     },
];

// ---- Status CSS class mapping ----
const STATUS_CLASS = {
  'Active':    's-active',
  'Completed': 's-completed',
  'Planned':   's-planned',
  'Failed':    's-failed',
};

// ---- Sparkline painter ----
function paintSparkline(canvas, history, isAlert) {
  if (!canvas || !history || history.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const step = w / (history.length - 1);

  ctx.beginPath();
  history.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.strokeStyle = isAlert ? '#FF4757' : '#00C8FF';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Fill area under line
  ctx.lineTo((history.length - 1) * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = isAlert
    ? 'rgba(255,71,87,0.1)'
    : 'rgba(0,200,255,0.08)';
  ctx.fill();
}

export class GridDomRenderer {
  /**
   * @param {HTMLElement} poolEl       — The container for row nodes (position: relative)
   * @param {HTMLElement} scrollEl     — The scrolling viewport element
   * @param {HTMLElement} spacerEl     — The element whose height controls total scroll range
   * @param {Object} options
   *   @param {number}   options.rowHeight      — Fixed row height in px
   *   @param {Column[]} options.columns        — Column definitions
   *   @param {Function} options.onRowClick     — Called with (uid, isPaused)
   *   @param {Function} options.onPinToggle    — Called with (uid)
   *   @param {Set}      options.pinnedRows     — Current pinned uid set
   */
  constructor(poolEl, scrollEl, spacerEl, options = {}) {
    this.poolEl   = poolEl;
    this.scrollEl = scrollEl;
    this.spacerEl = spacerEl;

    this.rowHeight  = options.rowHeight || 30;
    this.columns    = options.columns || DEFAULT_COLUMNS;
    this.onRowClick  = options.onRowClick  || (() => {});
    this.onPinToggle = options.onPinToggle || (() => {});
    this.pinnedRows  = options.pinnedRows  || new Set();

    // Dynamic pool size — enough to fill viewport plus buffer
    this.poolSize = 0;

    // Current rendered state
    this.currentIds  = [];    // full visible id array
    this.rowsById    = null;  // reference to engine's rowsById Map
    this.rowHistory  = null;  // reference to engine's rowHistory Map
    this.isPaused    = false;
    this._scrollRaf  = null;
    this._lastScrollTop = -1;

    // Bind scroll handler with RAF throttle
    this._onScroll = this._onScroll.bind(this);
    this.scrollEl.addEventListener('scroll', this._onScroll, { passive: true });

    this._initPool();
  }

  // ---- Public API ----

  /** Call when column list changes (e.g. column visibility toggle) */
  setColumns(columns) {
    this.columns = columns;
    // Rebuild pool with new column structure
    this._teardownPool();
    this._initPool();
    if (this.currentIds.length > 0) {
      this._renderViewport();
    }
  }

  /** Call when row height changes (density toggle) */
  setRowHeight(h) {
    this.rowHeight = h;
    if (this.spacerEl && this.currentIds.length > 0) {
      this.spacerEl.style.height = (this.currentIds.length * this.rowHeight) + 'px';
    }
    // Re-position all rows in pool
    this._renderViewport(true);
  }

  /** Update the renderer with latest state snapshot */
  update(visibleIds, rowsById, rowHistory, pinnedRows, isPaused) {
    this.currentIds = visibleIds;
    this.rowsById   = rowsById;
    this.rowHistory = rowHistory;
    this.pinnedRows = pinnedRows;
    this.isPaused   = isPaused;

    // Ensure pool is large enough for current viewport
    this._ensurePoolSize();

    // Update spacer height (drives total scroll range)
    if (this.spacerEl) {
      this.spacerEl.style.height = (this.currentIds.length * this.rowHeight) + 'px';
    }

    // Render only the visible window
    this._renderViewport();
  }

  /** Cleanup */
  destroy() {
    this.scrollEl.removeEventListener('scroll', this._onScroll);
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    this._teardownPool();
  }

  // ---- Private — pool management ----

  _calcPoolSize() {
    const vpHeight = this.scrollEl.clientHeight || 600;
    return Math.ceil(vpHeight / this.rowHeight) + 8; // 8 row buffer
  }

  _initPool() {
    this.poolSize = this._calcPoolSize();
    this._pool = [];
    for (let i = 0; i < this.poolSize; i++) {
      const rowEl = this._createRowEl(i);
      this._pool.push(rowEl);
      this.poolEl.appendChild(rowEl);
    }
  }

  _teardownPool() {
    if (this._pool) {
      this._pool.forEach(el => el.parentNode && el.parentNode.removeChild(el));
    }
    this._pool = [];
    this.poolSize = 0;
  }

  _ensurePoolSize() {
    const needed = this._calcPoolSize();
    if (needed > this.poolSize) {
      for (let i = this.poolSize; i < needed; i++) {
        const rowEl = this._createRowEl(i);
        this._pool.push(rowEl);
        this.poolEl.appendChild(rowEl);
      }
      this.poolSize = needed;
    }
  }

  _createRowEl(poolIndex) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.setAttribute('role', 'row');
    row.dataset.poolIndex = String(poolIndex);
    row.style.height = this.rowHeight + 'px';

    for (const col of this.columns) {
      const cell = this._createCellEl(col);
      row.appendChild(cell);
    }

    // Click handler — event delegation at pool level
    row.addEventListener('click', (e) => {
      const uid = row.dataset.uid;
      if (!uid) return;
      // Check if pin icon was clicked
      if (e.target.closest('.cell-pin')) {
        this.onPinToggle(uid);
        return;
      }
      this.onRowClick(uid, this.isPaused);
    });

    return row;
  }

  _createCellEl(col) {
    const cell = document.createElement('div');
    cell.className = `grid-cell`;
    cell.setAttribute('role', 'gridcell');
    cell.style.width = col.width + 'px';
    cell.style.minWidth = col.width + 'px';
    cell.style.maxWidth = col.width + 'px';

    if (col.type === 'num' || col.type === 'currency' || col.type === 'roi') {
      cell.classList.add('num-cell');
    }
    if (col.type === 'status') cell.classList.add('cell-status');
    if (col.type === 'bool')   cell.classList.add('cell-bool');
    if (col.type === 'pin')    cell.classList.add('cell-pin');
    if (col.type === 'spark')  cell.classList.add('cell-sparkline');

    if (col.type === 'spark') {
      const canvas = document.createElement('canvas');
      canvas.width  = col.width - 12;
      canvas.height = this.rowHeight - 6;
      cell.appendChild(canvas);
    } else if (col.type === 'status') {
      const span = document.createElement('span');
      cell.appendChild(span);
    } else if (col.type === 'bool') {
      const span = document.createElement('span');
      cell.appendChild(span);
    }

    return cell;
  }

  // ---- Private — scroll handling ----

  _onScroll() {
    if (this._scrollRaf) return; // already scheduled
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      const scrollTop = this.scrollEl.scrollTop;
      if (Math.abs(scrollTop - this._lastScrollTop) < 1) return;
      this._lastScrollTop = scrollTop;
      this._renderViewport();
    });
  }

  // ---- Private — viewport rendering (the hot path) ----

  _renderViewport(forceAll = false) {
    if (!this._pool || !this.rowsById) return;

    const scrollTop  = this.scrollEl.scrollTop;
    const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - 2);
    const endIndex   = Math.min(this.currentIds.length, startIndex + this.poolSize);

    for (let pi = 0; pi < this.poolSize; pi++) {
      const rowIndex = startIndex + pi;
      const rowEl    = this._pool[pi];

      if (rowIndex >= this.currentIds.length || rowIndex < 0) {
        rowEl.style.display = 'none';
        continue;
      }

      rowEl.style.display = 'flex';
      rowEl.style.transform = `translateY(${rowIndex * this.rowHeight}px)`;

      const uid = this.currentIds[rowIndex];
      const row = this.rowsById.get(uid);
      if (!row) { rowEl.style.display = 'none'; continue; }

      this._fillRow(rowEl, row, rowIndex);
    }
  }

  /** Fill a pooled row element with data from a NormalizedRow */
  _fillRow(rowEl, row, rowIndex) {
    const uid     = row.internal_uid;
    const isPinned = this.pinnedRows.has(uid);
    const isAlert  = row._isAlert;
    const isPaused = this.isPaused;

    // Set row classes efficiently
    let cls = 'grid-row';
    if (rowIndex % 2 === 0) cls += ' row-even'; else cls += ' row-odd';
    if (isPinned) cls += ' row-pinned';
    if (isAlert)  cls += ' row-alert';
    if (isPaused) cls += ' paused-clickable';

    // Avoid setting className if unchanged (avoids style recalc)
    if (rowEl.className !== cls) rowEl.className = cls;
    rowEl.dataset.uid = uid;

    const cells = rowEl.children;
    let ci = 0;

    for (const col of this.columns) {
      const cell = cells[ci++];
      if (!cell) continue;

      switch (col.type) {
        case 'pin': {
          // Use textContent — Unicode star is safe
          const star = isPinned ? '★' : '☆';
          if (cell.textContent !== star) cell.textContent = star;
          if (isPinned) cell.classList.add('pinned');
          else          cell.classList.remove('pinned');
          break;
        }

        case 'status': {
          const span = cell.firstElementChild;
          if (span) {
            const statusText = row.project_status || '';
            if (span.textContent !== statusText) span.textContent = statusText;
            const sc = STATUS_CLASS[statusText] || '';
            if (span.className !== sc) span.className = sc;
          }
          break;
        }

        case 'bool': {
          const span = cell.firstElementChild;
          if (span) {
            const val = row[col.key] === 'Yes' ? 'Yes' : 'No';
            if (span.textContent !== val) span.textContent = val;
            if (val === 'Yes') { span.className = 'yes'; }
            else               { span.className = 'no';  }
          }
          break;
        }

        case 'currency': {
          const formatted = col.key === 'budget_usd'
            ? row._fmt_budget
            : row._fmt_savings;
          if (cell.textContent !== formatted) cell.textContent = formatted;
          break;
        }

        case 'roi': {
          const roiText = row._fmt_roi;
          if (cell.textContent !== roiText) cell.textContent = roiText;
          // Color ROI: red if negative
          const color = row.roi_percent < 0 ? '#FF4757'
                      : row.roi_percent > 200 ? '#00E5A0'
                      : '#D8E8F8';
          if (cell.style.color !== color) cell.style.color = color;
          break;
        }

        case 'spark': {
          const canvas  = cell.firstElementChild;
          const history = this.rowHistory ? this.rowHistory.get(uid) : null;
          if (canvas && history) {
            paintSparkline(canvas, history.roi, isAlert);
          }
          break;
        }

        case 'num': {
          const val = col.key === 'robots_deployed'
            ? row._fmt_robots
            : row._fmt_hours;
          if (cell.textContent !== val) cell.textContent = val;
          break;
        }

        default: {
          // Text cells — use textContent only
          const val = String(row[col.key] ?? '');
          if (cell.textContent !== val) cell.textContent = val;
          break;
        }
      }
    }
  }
}
