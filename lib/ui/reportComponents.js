// lib/ui/reportComponents.js

/**
 * Escapes HTML characters to prevent injection.
 */
export const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Renders a standardized badge.
 */
export const Badge = (text, type = 'default') => {
  const className = type ? `rule__badge--${type.toLowerCase().replace(/\s+/g, '-')}` : '';
  return `<span class="rule__badge ${className}">${text}</span>`;
};

/**
 * Renders a WCAG level pill.
 */
export const WcagBadge = (level) => {
  const cleanLevel = level ? level.toLowerCase().replace(' ', '-') : 'best-practice';
  return `<span class="rule__badge rule__level--${cleanLevel}">WCAG ${level || 'Best Practice'}</span>`;
};

/**
 * Renders a summary card for the top grid.
 */
export const SummaryCard = (label, value, statusClass = '', icon = '') => `
  <div class="summary-card ${statusClass}">
    <span class="summary-label">${label}</span>
    <span class="summary-value">
        ${icon ? `<span aria-hidden="true">${icon}</span> ` : ''}
        ${value}
    </span>
  </div>
`;

/**
 * Renders a single occurrence of a violation.
 */
export const Occurrence = (o) => `
  <div class="occurrence ${o.isNewOccurrence ? 'occurrence--new' : ''}">
    <p>
      <span class="occurrence__page">Page:</span> 
      <a href="${o.page}" target="_blank">${o.page}</a> 
      ${o.isNewPage ? Badge('NEW PAGE', 'new') : (o.isNewOccurrence ? Badge('NEW ELEMENT', 'new') : '')}
    </p>
    <p><strong>Element:</strong> <code>${escapeHtml(o.target)}</code></p>
    <pre class="occurrence__html"><code>${escapeHtml(o.html)}</code></pre>
  </div>
`;

/**
 * Renders the entire filter section.
 */
export const FilterBar = (rules, impacts, hasNewRules) => {
    const getCount = (imp) => rules.filter(r => r.impact === imp).length;
    
    // Internal helper for individual labels to keep it DRY
    const FilterLabel = (id, label, value = '', isImpact = true) => `
        <label class="filter-label">
            <input type="checkbox" 
                   ${id ? `id="${id}"` : ''} 
                   class="${isImpact ? 'filter-impact' : ''}" 
                   ${value ? `value="${value}"` : ''} 
                   ${id === 'filter-all' ? 'checked' : ''}>
            ${label} <small>(${id === 'filter-new' ? rules.filter(r => r.isNewRule).length : getCount(value)})</small>
        </label>`;

    return `
    <section class="rule-filters" aria-label="Filter issues">
        <form id="rule-filters-form">
            <fieldset>
                <legend class="filter-title">Filter By:</legend>
                <div class="filter-row">
                    <label class="filter-label">
                        <input type="checkbox" id="filter-all" class="filter-impact" checked> Show all issues
                    </label>
                    ${impacts.map(imp => FilterLabel('', imp.charAt(0).toUpperCase() + imp.slice(1), imp)).join('')}
                    ${hasNewRules ? FilterLabel('filter-new', 'New', '', false) : ''}
                </div>
            </fieldset>
        </form>
    </section>`;
};

/**
 * Returns the client-side script for filtering as a string.
 */
export const FilterScript = () => `
    (function () {
        const form = document.getElementById('rule-filters-form');
        if (!form) return;
        const filterAll = document.getElementById('filter-all');
        const impactBoxes = form.querySelectorAll('.filter-impact');
        const filterNew = document.getElementById('filter-new');
        const rules = document.querySelectorAll('.rule');

        function applyFilters() {
            const activeImpacts = [...impactBoxes].filter(cb => cb.checked).map(cb => cb.value);
            const newOnly = filterNew && filterNew.checked;
            rules.forEach(rule => {
                const impact = rule.dataset.impact;
                const isNew = rule.dataset.new === 'true';
                let visible = true;
                if (!filterAll.checked) {
                    if (activeImpacts.length) visible = activeImpacts.includes(impact);
                    if (newOnly) visible = visible && isNew;
                }
                rule.style.display = visible ? '' : 'none';
            });
        }

        [filterAll, ...impactBoxes, filterNew].forEach(el => {
            if (!el) return;
            el.addEventListener('change', (e) => {
                if (e.target === filterAll && filterAll.checked) {
                    impactBoxes.forEach(cb => cb.checked = false);
                    if (filterNew) filterNew.checked = false;
                } else if (e.target.checked) {
                    filterAll.checked = false;
                }
                applyFilters();
            });
        });
        applyFilters();
    })();
`;

/**
 * Renders a full Rule details component.
 */
export const Rule = (rule) => `
    <details class="rule" id="rule-${rule.id}" data-impact="${rule.impact || 'minor'}" data-new="${rule.isNewRule ? 'true' : 'false'}">
        <summary class="rule__summary">
            <span class="rule__title">
                <span class="rule__name--wrapper">
                    ${rule.displayName || rule.id}
                    ${rule.isNewRule ? Badge('NEW RULE', 'new') : ''}
                    ${rule.isSystemic ? Badge('GLOBAL ISSUE', 'systemic') : ''}
                </span>
            </span>
            <span class="rule__details">
                <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact}</span>
                ${WcagBadge(rule.wcagLevel)}
                <span class="rule__diff">▲ ${rule.diff.new} / ▼ ${rule.diff.resolved}</span>
            </span>
        </summary>
        <div class="rule__content">
            <p>${rule.description || ''}</p>
            <div class="rule__rationale"><strong>Why this matters:</strong><p>${rule.rationale}</p></div>
            ${rule.occurrences.map(o => Occurrence(o)).join('')}
        </div>
    </details>`;