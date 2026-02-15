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