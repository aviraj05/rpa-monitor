/**
 * fuzzySearch.js
 * Multi-field token-based search.
 *
 * Algorithm:
 *  - Split query by whitespace into tokens
 *  - For each row, check that ALL tokens appear in the pre-built search blob
 *  - Blob is lowercased and pre-computed on first row sight, updated on change
 *  - Debounce is applied at the UI layer (not here) — this module is pure
 */

/**
 * Build a lowercased searchable string from a normalized row.
 * Called once per row update, result cached in engine.
 */
export function buildSearchBlob(row) {
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

/**
 * Test whether a row blob matches all tokens from a query.
 * @param {string} blob       - Pre-computed lowercased string for the row
 * @param {string[]} tokens   - Tokenized, lowercased query terms
 * @returns {boolean}
 */
export function matchesQuery(blob, tokens) {
  return tokens.every(t => blob.includes(t));
}

/**
 * Tokenize a search query string.
 * @param {string} query
 * @returns {string[]}
 */
export function tokenize(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Simple debounce utility for the search input.
 */
export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
