// lib/ui/reportComponents.js

// ==========================
// Security & Formatting Utils
// ==========================
import { escapeHtml, sanitizeUrl } from '../utils/security.js';

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
  const safeLevel = escapeHtml(level || 'Best Practice');
  const cleanLevel = (level || 'best-practice').toLowerCase().replace(' ', '-');
  return `<span class="rule__badge rule__level--${cleanLevel}">WCAG ${safeLevel}</span>`;
};

/**
 * Renders a summary card for the top grid.
 */
export const SummaryCard = (label, value, statusClass = '', icon = '', meta = '') => `
  <div class="summary-card ${statusClass}">
    <span class="summary-label">${escapeHtml(label)}</span>
    <span class="summary-value">
      ${icon ? `<span aria-hidden="true">${icon}</span> ` : ''}
      ${escapeHtml(String(value))}
      ${
        meta
          ? `<span class="summary-meta">${escapeHtml(meta)}</span>`
          : ''
      }
    </span>
  </div>
`;

/**
 * Renders the "Fix These First" priority section.
 */
export const PrioritySection = (priorityRules, prioritySummary) => {
  if (!priorityRules?.length) return '';

  const names = priorityRules.slice(0, 3).map(r => escapeHtml(r.displayName || r.id));
  const friendlyList = new Intl.ListFormat('en', { 
    style: 'long', 
    type: 'conjunction' 
  }).format(names);

  return `
    <section class="priority-callout">
        <h2 class="priority-title">Priority Items: Fix These First</h2>
        <p class="priority-description">Ranked by weighted impact (severity × reach).</p>
        <p class="priority-tip">
          Fixing <strong>${friendlyList}</strong> resolves <strong>${prioritySummary.percentOfViolations}%</strong> of violations.
        </p>
        <ul class="priority-list">
            ${priorityRules.map(rule => `
            <li class="priority-item">
                <a href="#rule-${escapeHtml(rule.id)}" class="priority-link">
                    <span class="priority-name">
                        ${escapeHtml(rule.displayName || rule.id)}
                        ${rule.isSystemic ? Badge('SYSTEMIC', 'systemic') : ''}
                    </span>
                    <span class="priority-details">
                        <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact}</span>
                        ${WcagBadge(rule.wcagLevel)}
                        <span class="priority-count">${rule.pagesAffected} pages</span>
                    </span>
                </a>
            </li>`).join('')}
        </ul>
    </section>`;
};

/**
 * Renders a 'trends over time' chart optimized for developers.
 * Focuses on Total Error Count (raw occurrences) using CSS classes and design tokens.
 */
export const TrendChart = (history) => {
    if (!history || history.length < 2) return '';

    const width = 1000;
    const height = 150;
    const paddingLeft = 40; 

    const shortDate = (dateStr) => {
        try {
            if (!dateStr) return 'N/A';
            
            // If the string is just YYYY-MM-DD, add a space to prevent UTC shift
            const normalizedDate = dateStr.includes(' ') || dateStr.includes('T') 
                ? dateStr 
                : `${dateStr} 00:00:00`;

            const date = new Date(normalizedDate);
            
            if (isNaN(date.getTime())) return 'N/A';

            return new Intl.DateTimeFormat('en-US', { 
                month: 'numeric', 
                day: 'numeric', 
                year: '2-digit' 
            }).format(date);
        } catch (e) {
            return 'N/A';
        }
    };

    const historyWithTotals = history.map(h => ({
        ...h,
        totalErrors: h.violationCount || 0,
        displayDate: shortDate(h.date)
    }));

    // ==========================
    // Defensive Math: Guard against division by zero if all errors are 0
    // ==========================

    const errorCounts = historyWithTotals.map(h => h.totalErrors);
    // Use the actual max, but fallback to 1 to avoid division by zero
    const maxErrors = Math.max(...errorCounts, 1); 
    
    const getX = (i) => paddingLeft + (i * ((width - paddingLeft) / (historyWithTotals.length - 1)));
    const getY = (val) => height - ((val / maxErrors) * height);

    const points = historyWithTotals.map((h, i) => `${getX(i)},${getY(h.totalErrors)}`).join(' ');

    return `
    <section class="priority-callout chart-container">
        <h3 class="filter-title">Error Burn-down Trend</h3>
        <p class="priority-description">
            Tracking the total count of all accessibility violations found across the site.
        </p>
        
        <div class="chart-wrapper">
            <svg viewBox="-10 -40 ${width + 20} ${height + 70}" aria-hidden="true" class="trend-svg">
                
                <text x="${paddingLeft - 10}" y="${height}" text-anchor="end" alignment-baseline="middle" class="chart-label chart-label--axis">0</text>
                <text x="${paddingLeft - 10}" y="0" text-anchor="end" alignment-baseline="middle" class="chart-label chart-label--axis">${maxErrors}</text>
                
                <line x1="${paddingLeft}" y1="${height}" x2="${width}" y2="${height}" class="chart-grid-line" />
                <line x1="${paddingLeft}" y1="0" x2="${width}" y2="0" class="chart-grid-line chart-grid-line--dashed" />
                
                <polyline class="trend-line" points="${points}" />

                ${historyWithTotals.map((h, i) => {
                    const x = getX(i);
                    const y = getY(h.totalErrors);
                    
                    return `
                        <circle cx="${x}" cy="${y}" r="6" class="trend-point" />
                        <text x="${x}" y="${y - 15}" text-anchor="middle" class="chart-label chart-label--value">
                            ${h.totalErrors}
                        </text>
                        <text x="${x}" y="${height + 25}" text-anchor="middle" class="chart-label chart-label--date">
                            ${h.displayDate}
                        </text>
                    `;
                }).join('')}
            </svg>
        </div>
    </section>
    `;
};

/**
 * Renders a single occurrence of a violation.
 */
export const Occurrence = (o, isNewRule = false) => `
  <div class="occurrence ${o.isNewOccurrence ? 'occurrence--new' : ''}">
    <p>
      <span class="occurrence__page">Page:</span> 
      <a href="${sanitizeUrl(o.page)}" target="_blank">${escapeHtml(o.page)}</a> 
      ${o.isNewPage ? Badge('NEW PAGE', 'new') : (!isNewRule && o.isNewOccurrence ? Badge('NEW ELEMENT', 'new') : '')}
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
        const currentScript = document.currentScript;
        const root = currentScript ? currentScript.parentElement : document;

        const form = root.querySelector('#rule-filters-form');
        if (!form) return;

        const filterAll = form.querySelector('#filter-all');
        const impactBoxes = form.querySelectorAll('.filter-impact');
        const filterNew = form.querySelector('#filter-new');
        
        const rules = root.querySelectorAll('.rule');

        function applyFilters() {
            const activeImpacts = [...impactBoxes].filter(cb => cb.checked).map(cb => cb.value);
            const newOnly = filterNew && filterNew.checked;

            rules.forEach(rule => {
                const impact = rule.dataset.impact;
                const isNew = rule.dataset.new === 'true';
                let visible = true;

                if (!filterAll.checked) {
                    if (activeImpacts.length) {
                        visible = activeImpacts.includes(impact);
                    } else if (!newOnly) {
                        visible = false;
                    }

                    if (newOnly) {
                        visible = visible && isNew;
                    }
                }
                rule.style.display = visible ? '' : 'none';
            });
        }

        const allControls = [filterAll, ...impactBoxes, filterNew].filter(Boolean);
        allControls.forEach(el => {
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
export const Rule = (rule) => {

  const resourcesHtml = rule.resources && rule.resources.length > 0
    ? `<div class="rule__resources"><strong>Resources:</strong> ` +
      rule.resources
        .map(r => `<a href="${r.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.label)}</a>`)
        .join(', ') +
      `</div>`
    : '';

  return `
    <details class="rule" id="rule-${escapeHtml(rule.id)}" data-impact="${rule.impact || 'minor'}" data-new="${rule.isNewRule ? 'true' : 'false'}">
      <summary class="rule__summary">
        <span class="rule__title">
          <span class="rule__name--wrapper">
            ${escapeHtml(rule.displayName || rule.id)}
            ${rule.isNewRule ? Badge('NEW RULE', 'new') : ''}
            ${rule.isSystemic ? Badge('GLOBAL ISSUE', 'systemic') : ''}
          </span>
        </span>
        <span class="rule__details">
          <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${escapeHtml(rule.impact)}</span>
          ${WcagBadge(rule.wcagLevel)}
          <span class="rule__diff">▲ ${rule.diff?.new ?? 0} / ▼ ${rule.diff?.resolved ?? 0}</span>
        </span>
      </summary>

      <div class="rule__content">
        <p class="rule__description">${escapeHtml(rule.description)}</p>

        <div class="rule__rationale">
          <strong>Why this matters:</strong>
          <p>${escapeHtml(rule.rationale)}</p>
        </div>

        ${resourcesHtml}

        ${rule.occurrences.map(o => Occurrence(o, rule.isNewRule)).join('')}
      </div>
    </details>`;
};

/**
 * Renders the "Needs Manual Review" component.
 */
export const ManualReviewSection = (rules) => `
    <section class="manual-review-section">
        <h2 class="manual-title">Manual Review Required</h2>
        <p class="rules-subtitle">
            The following items were flagged by automated checks but require human intuition to verify.
        </p>
        <div class="manual-review-grid">
            ${rules.map(rule => ManualRule(rule)).join('')}
        </div>
    </section>
`;

/**
 * Renders a manual review rule with selector-level clustering and sample elements.
 * - Shows Scope summary always.
 * - Shows Pattern summary only if >5 occurrences.
 * - Limits Most Affected Pages to top 3–5.
 * - 1–3 sample elements per pattern.
 */
export const ManualRule = (rule) => {
  const occurrences = rule.occurrences || [];
  const cleanFailureSummary = (summary) => {
    if (!summary) return null;
    return summary.replace(/^Fix (?:any|all) of the following:\s*/i, '').trim();
  };
  const reason = rule.manualReason || cleanFailureSummary(occurrences[0]?.failureSummary) || "Automated tools could not determine a result.";
  const totalItems = occurrences.length;
  const totalPages = new Set(occurrences.map(o => o.page)).size;

  // Compute target counts
  const targetCounts = {};
  occurrences.forEach(o => {
    const sel = o.target || 'unknown';
    targetCounts[sel] = (targetCounts[sel] || 0) + 1;
  });
  const sortedSelectors = Object.entries(targetCounts)
    .sort((a, b) => b[1] - a[1]);

  // Compute page counts
  const pageCounts = {};
  occurrences.forEach(o => {
    const page = o.page || 'unknown';
    pageCounts[page] = (pageCounts[page] || 0) + 1;
  });
  const sortedPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Helper to render 1–3 sample occurrences for a given target
  const renderSamples = (target) => {
    const filtered = occurrences.filter(o => o.target === target).slice(0, 3);
    return filtered.map(o => Occurrence(o)).join('');
  };

  // Resources HTML (if available)
  const resourcesHtml = rule.resources && rule.resources.length > 0
    ? `<div class="rule__resources"><strong>Resources:</strong> ` +
      rule.resources.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.label)}</a>`).join(', ') +
      `</div>`
    : '';

  // Optional rationale HTML
  const rationaleHtml = rule.rationale
    ? `<div class="rule__rationale"><strong>Why this matters:</strong><p>${escapeHtml(rule.rationale)}</p></div>`
    : '';

  // Help URL with fallback
  const helpUrl = sanitizeUrl(rule.helpUrl || `https://dequeuniversity.com/rules/axe/4.11/${rule.id}`);
  const helpLabel = escapeHtml(rule.displayName || rule.id);

  return `
    <details class="rule rule--manual" id="manual-${escapeHtml(rule.id)}">
      <summary class="rule__summary">
        <span class="rule__title">
          <span class="rule__name--wrapper">
            ${escapeHtml(rule.displayName || rule.id)}
          </span>
        </span>
        <span class="rule__details">
          <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${escapeHtml(rule.impact)}</span>
          ${WcagBadge(rule.wcagLevel)}
          <span class="rule__count">${totalItems} items</span>
        </span>
      </summary>
      <div class="rule__content">
        <p class="rule__description">${escapeHtml(rule.description)}</p>
        ${rationaleHtml}
        <div class="rule__incomplete-reason">
          <strong>Why manual review is needed:</strong>
          <p>${escapeHtml(reason)}</p>
          <a href="${helpUrl}" target="_blank" class="rule__help-link">How to manually test: ${helpLabel} →</a>
        </div>
        ${resourcesHtml}
        <div class="rule__scope-summary">
          <h3>Scope</h3>
          <p>${totalItems} flagged elements across ${totalPages} pages.</p>
        </div>
        ${
          totalItems > 5 ? `
          <div class="rule__pattern-summary">
            <h3>Top Selectors</h3>
            <ul>
              ${sortedSelectors.slice(0, 5).map(([sel, count]) =>
                `<li><code>${escapeHtml(sel)}</code> — ${count}</li>`).join('')}
            </ul>
            <h3>Most Affected Pages</h3>
            <ul>
              ${sortedPages.map(([page, count]) =>
                `<li><a href="${sanitizeUrl(page)}" target="_blank">${escapeHtml(page)}</a> — ${count}</li>`).join('')}
            </ul>
          </div>
          <div class="rule__samples">
            <h3>Sample Elements</h3>
            ${sortedSelectors.slice(0, 3).map(([sel]) => renderSamples(sel)).join('')}
          </div>
          ` : `
          <div class="rule__samples">
            <h3>Occurrences</h3>
            ${occurrences.map(o => Occurrence(o)).join('')}
          </div>
          `
        }
      </div>
    </details>
  `;
};
