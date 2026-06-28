/**
 * CategoricalFilters.jsx
 * Left sidebar: fuzzy search + multi-select categorical filters.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { debounce } from '../filters/fuzzySearch.js';

// Fields to show filter groups for, in display order
const FILTER_FIELDS = [
  { key: 'project_status', label: 'Status' },
  { key: 'automation_type', label: 'Automation Type' },
  { key: 'department', label: 'Department' },
  { key: 'industry', label: 'Industry' },
  { key: 'country', label: 'Country' },
  { key: 'ai_enabled', label: 'AI Enabled' },
  { key: 'cloud_deployment', label: 'Cloud' },
];

// Number of options to show before "show more"
const SHOW_LIMIT = 8;

function FilterGroup({ fieldKey, label, options, selectedValues, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...options].sort();
  const visible = expanded ? sorted : sorted.slice(0, SHOW_LIMIT);
  const hasMore = sorted.length > SHOW_LIMIT;

  return (
    <div className="filter-group">
      <div className="filter-group-label">
        <span>{label}</span>
        {selectedValues.size > 0 && (
          <span style={{ color: 'var(--cyan)', fontSize: 10 }}>
            {selectedValues.size} selected
          </span>
        )}
      </div>
      <div className="filter-option-list">
        {visible.map(opt => (
          <label key={opt} className={`filter-option${selectedValues.has(opt) ? ' active' : ''}`}>
            <input
              type="checkbox"
              checked={selectedValues.has(opt)}
              onChange={() => onToggle(fieldKey, opt)}
              aria-label={`Filter by ${label}: ${opt}`}
            />
            <span className="truncate">{opt || '(blank)'}</span>
          </label>
        ))}
      </div>
      {hasMore && (
        <button
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 4, fontSize: 10, height: 22 }}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? '▲ Show less' : `▼ Show ${sorted.length - SHOW_LIMIT} more`}
        </button>
      )}
    </div>
  );
}

function CategoricalFilters({ snapshot, engine }) {
  const [localQuery, setLocalQuery]   = useState('');
  const [activeFilters, setActiveFilters] = useState({});
  // Track active chips for display
  const chipList = Object.entries(activeFilters).flatMap(([field, vals]) =>
    [...vals].map(v => ({ field, value: v }))
  );

  // Debounced search engine update
  const debouncedSetQuery = useRef(
    debounce((q) => engine.setQuery(q), 100)
  ).current;

  const handleQueryChange = useCallback((e) => {
    const q = e.target.value;
    setLocalQuery(q);
    debouncedSetQuery(q);
  }, [debouncedSetQuery]);

  const handleToggle = useCallback((field, value) => {
    setActiveFilters(prev => {
      const current = new Set(prev[field] || []);
      if (current.has(value)) current.delete(value);
      else current.add(value);

      const updated = { ...prev };
      if (current.size === 0) delete updated[field];
      else updated[field] = current;

      // Update engine
      engine.setFilter(field, current);

      return updated;
    });
  }, [engine]);

  const handleClearAll = useCallback(() => {
    setActiveFilters({});
    setLocalQuery('');
    engine.clearFilters();
  }, [engine]);

  const handleRemoveChip = useCallback(({ field, value }) => {
    handleToggle(field, value);
  }, [handleToggle]);

  const catOptions = snapshot?.categoryOptions || {};
  const hasActiveFilters = chipList.length > 0 || localQuery;

  return (
    <div className="sidebar-left">
      <div className="panel-header">
        <span className="panel-title">🔍 Filters & Search</span>
        {hasActiveFilters && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 10, padding: '2px 6px', height: 20 }}
            onClick={handleClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search input */}
      <div className="filter-search-wrap">
        <div className="search-input-wrap">
          <span className="search-icon">⊕</span>
          <input
            type="text"
            className="input search-input"
            placeholder="Search projects, partners, countries…"
            value={localQuery}
            onChange={handleQueryChange}
            aria-label="Multi-field fuzzy search"
            id="grid-search-input"
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          Matches project · company · partner · country · industry
        </div>
      </div>

      {/* Active filter chips */}
      {chipList.length > 0 && (
        <div className="filter-chips-wrap">
          {chipList.map(({ field, value }) => (
            <div key={`${field}:${value}`} className="chip">
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {field.replace(/_/g, ' ')}:
              </span>
              <span>{value}</span>
              <span
                className="chip-remove"
                onClick={() => handleRemoveChip({ field, value })}
                aria-label={`Remove filter ${value}`}
              >✕</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter groups */}
      <div className="scroll-y flex-1">
        {FILTER_FIELDS.map(({ key, label }) => (
          <FilterGroup
            key={key}
            fieldKey={key}
            label={label}
            options={catOptions[key] || new Set()}
            selectedValues={activeFilters[key] || new Set()}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(CategoricalFilters);
