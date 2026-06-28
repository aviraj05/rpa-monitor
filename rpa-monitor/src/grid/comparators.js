/**
 * comparators.js
 * Sort comparator utilities for the virtual grid.
 */

export const NUMERIC_FIELDS = new Set([
  'robots_deployed', 'budget_usd', 'annual_savings_usd',
  'roi_percent', 'employee_hours_saved',
]);

export function numericComparator(a, b) {
  return (a || 0) - (b || 0);
}

export function stringComparator(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export function multiSortComparator(sortSpec, rowsById) {
  return (uidA, uidB) => {
    const ra = rowsById.get(uidA);
    const rb = rowsById.get(uidB);
    if (!ra || !rb) return 0;
    for (const { field, direction } of sortSpec) {
      const va = ra[field];
      const vb = rb[field];
      let cmp = NUMERIC_FIELDS.has(field)
        ? numericComparator(va, vb)
        : stringComparator(va, vb);
      if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}
