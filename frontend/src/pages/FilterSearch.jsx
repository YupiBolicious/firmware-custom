const WORK_ORDER_STATUS_LABELS = {
  DRAFT: 'Draft',
  ANALYZED: 'Analyzed',
  FINALIZED: 'Finalized',
  PRODUCTION: 'Production',
  COMPLETED: 'Completed',
};

export default function FilterSearch({
  filters,
  setFilter,
  showAdvanced,
  setShowAdvanced,
  clearFilters,
  hasActiveFilters,
  uniqueModels,
  uniqueVersions,
  uniqueComplexities,
  classificationLabels,
}) {
  return (
    <div>
      <div className="toolbar mb-8">
        <input
          className="filter-input"
          placeholder="Search WO number, title, customer, or item..."
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
        />
        <button
          className={`btn btn-sm ${showAdvanced ? '' : 'btn-secondary'}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          Advanced Filters {showAdvanced ? '▲' : '▼'}
        </button>
        {hasActiveFilters && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="filter-advanced">
          <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label className="filter-label">Work Order Status</label>
              <select
                className="filter-control"
                value={filters.statusFilter}
                onChange={(e) => setFilter('statusFilter', e.target.value)}
              >
                <option value="ALL">All</option>
                {Object.entries(WORK_ORDER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {classificationLabels && (
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label className="filter-label">Classification</label>
                <select
                  className="filter-control"
                  value={filters.classificationStatusFilter}
                  onChange={(e) => setFilter('classificationStatusFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {Object.entries(classificationLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            )}
            {uniqueModels?.length > 0 && (
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label className="filter-label">Machine Model</label>
                <select
                  className="filter-control"
                  value={filters.modelFilter}
                  onChange={(e) => setFilter('modelFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {uniqueModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.code}</option>
                  ))}
                </select>
              </div>
            )}
            {uniqueComplexities?.length > 0 && (
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label className="filter-label">Complexity</label>
                <select
                  className="filter-control"
                  value={filters.complexityFilter}
                  onChange={(e) => setFilter('complexityFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {uniqueComplexities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            {filters.fwRelatedFilter !== undefined && (
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label className="filter-label">FW Related</label>
                <select
                  className="filter-control"
                  value={filters.fwRelatedFilter}
                  onChange={(e) => setFilter('fwRelatedFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="FW">Firmware</option>
                  <option value="NON_FW">Non-Firmware</option>
                </select>
              </div>
            )}
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label className="filter-label">From</label>
              <input
                type="date"
                className="filter-control"
                value={filters.dateFrom}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
              />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label className="filter-label">To</label>
              <input
                type="date"
                className="filter-control"
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}