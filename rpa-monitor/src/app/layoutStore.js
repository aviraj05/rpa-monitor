/**
 * layoutStore.js
 * Manages panel visibility and workspace layout preferences in localStorage.
 *
 * Persists:
 *  - Panel visibility (KPI strip, left sidebar, right sidebar, diagnostics, etc.)
 *  - Column visibility
 *  - Row density
 *
 * Never persists stream data, row values, or derived view state.
 */

const STORAGE_KEY = 'rpa_layout_v1';
const COL_VIS_KEY = 'rpa_col_visibility';
const DENSITY_KEY = 'rpa_density';

const DEFAULT_LAYOUT = {
  showKpiStrip:       true,
  showLeftSidebar:    true,
  showRightSidebar:   true,
  showDiagnostics:    true,
  showDeptAnalytics:  true,
  showWorldMap:       false, // off by default to keep main real estate for grid
};

const DEFAULT_COL_VISIBILITY = {
  pin:                  true,
  project_id:           true,
  project_name:         true,
  project_status:       true,
  automation_type:      true,
  robots_deployed:      true,
  budget_usd:           true,
  annual_savings_usd:   true,
  roi_percent:          true,
  roi_spark:            true,
  employee_hours_saved: true,
  department:           true,
  country:              true,
  ai_enabled:           true,
  cloud_deployment:     true,
  industry:             false, // hidden by default to reduce width
};

/** Load layout from localStorage, merging with defaults */
export function loadLayout() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_LAYOUT };
    return { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

/** Save layout to localStorage */
export function saveLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch { /* quota exceeded */ }
}

/** Toggle a layout panel key and persist */
export function togglePanel(layout, key) {
  const updated = { ...layout, [key]: !layout[key] };
  saveLayout(updated);
  return updated;
}

/** Reset to defaults */
export function resetLayout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  return { ...DEFAULT_LAYOUT };
}

/** Load column visibility */
export function loadColVisibility() {
  try {
    const saved = localStorage.getItem(COL_VIS_KEY);
    if (!saved) return { ...DEFAULT_COL_VISIBILITY };
    return { ...DEFAULT_COL_VISIBILITY, ...JSON.parse(saved) };
  } catch {
    return { ...DEFAULT_COL_VISIBILITY };
  }
}

/** Save column visibility */
export function saveColVisibility(vis) {
  try {
    localStorage.setItem(COL_VIS_KEY, JSON.stringify(vis));
  } catch {}
}

/** Toggle a single column's visibility */
export function toggleColumn(vis, key) {
  const updated = { ...vis, [key]: !vis[key] };
  saveColVisibility(updated);
  return updated;
}

/** Load density preference */
export function loadDensity() {
  return localStorage.getItem(DENSITY_KEY) || 'comfortable';
}

/** Save density preference */
export function saveDensity(d) {
  localStorage.setItem(DENSITY_KEY, d);
}
