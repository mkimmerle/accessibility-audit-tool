// lib/io/auditHtml.js
import fs from 'fs';

/**
 * Escape HTML characters to prevent injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Write an HTML audit report.
 * @param {Object} params
 * @param {string} params.htmlPath - Path to output HTML file
 * @param {string} params.siteUrl
 * @param {Array} params.rules - Enriched rules
 * @param {Array} params.priorityRules - Top priority rules
 * @param {Array} params.fullyResolvedRules - Rules resolved since last audit
 * @param {Object} params.diffTotals - Diff summary
 */
export function writeAuditHtml({ htmlPath, siteUrl, rules, priorityRules, fullyResolvedRules, diffTotals, pagesAudited }) {
  const auditDate = new Date().toLocaleString();

  let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit Report for ${siteUrl}</title>
<link rel="stylesheet" href="/audit.css">
</head>
<body class="results-page">
<main class="layout-container layout-container--wide results-shell">
    <h1>Audit Results for ${siteUrl}</h1>
    <p><em>Audit recorded on ${auditDate}</em></p>

    <section class="audit-summary-grid">
        <div class="summary-card">
            <span class="summary-label">Pages Audited</span>
            <span class="summary-value">${pagesAudited}</span>
        </div>
        <div class="summary-card status--new">
            <span class="summary-label">New Issues</span>
            <span class="summary-value">
                <span aria-hidden="true">▲</span>
                <span class="u-sr-only">Increased by </span>${diffTotals.newViolations}
            </span>
        </div>
        <div class="summary-card status--fixed">
            <span class="summary-label">Resolved Issues</span>
            <span class="summary-value">
                <span aria-hidden="true">▼</span>
                <span class="u-sr-only">Decreased by </span>${diffTotals.resolvedViolations}
            </span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Active Rules</span>
            <span class="summary-value">${rules.length}</span>
        </div>
    </section>

    ${priorityRules.length > 0 ? `
    <section class="priority-callout">
      <h2 class="priority-title">Priority Items: Fix These First</h2>
      <p class="priority-description">
        If you’re short on time, focus on the items below — priority items are ranked first by impact (Critical → Minor)
        and then by how many pages are affected. Fixing these first typically reduces the most risk fastest.
      </p>
      <ul class="priority-list">
        ${priorityRules.map(rule => {
          const friendlyName = rule.displayName;
          const wcagLevel = rule.wcagLevel;
          const levelClass = `rule__level--${wcagLevel.toLowerCase().replace(' ', '-')}`;
          return `
            <li class="priority-item">
              <a href="#rule-${rule.id}" class="priority-link">${friendlyName}
              <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact || 'minor'}</span>
              <span class="priority-count">${rule.occurrences.length} page${rule.occurrences.length === 1 ? '' : 's'} affected · <span class="rule__badge ${levelClass}">WCAG ${wcagLevel}</span></span></a>
            </li>
          `;
        }).join('')}
      </ul>
    </section>` : ''}

    <div id="rules-container">`;

  rules.forEach(rule => {
    const friendlyName = rule.displayName;
    const impactClass = `rule__impact--${rule.impact || 'minor'}`;
    const wcagLevel = rule.wcagLevel;
    const levelClass = `rule__level--${wcagLevel.toLowerCase().replace(' ', '-')}`;
    
    const resourcesHtml = `<strong>Resources:</strong> ` +
      rule.resources
        .map(r => `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`)
        .join(', ');
    
    html += `
<details class="rule" id="rule-${rule.id}">
    <summary class="rule__summary">
        <span class="rule__title">
            ${friendlyName}
            <span class="rule__badge ${levelClass}">WCAG ${wcagLevel}</span>
            ${rule.isNewRule ? `<span class="rule__badge rule__badge--new"><span class="u-sr-only">New Rule: </span>NEW RULE</span>` : ''}
        </span>
        <span class="rule__diff">
            <span aria-hidden="true">▲</span><span class="u-sr-only">New:</span> ${rule.diff.new} / 
            <span aria-hidden="true">▼</span><span class="u-sr-only">Fixed:</span> ${rule.diff.resolved}
        </span>
        <span class="rule__impact ${impactClass}">${rule.impact || 'minor'}</span>
    </summary>
    <div class="rule__content">
        <p>${rule.description}</p>
        <p>${resourcesHtml}</p>
        ${rule.occurrences.map(o => `
            <div class="occurrence ${o.isNewPage ? 'occurrence--new' : ''}">
                <p><strong>Page:</strong> <a href="${o.page}" target="_blank">${o.page}</a> 
                   ${o.isNewPage ? `<span class="occurrence__badge"><span class="u-sr-only">New location: </span>NEW PAGE</span>` : ''}
                </p>
                <p><strong>Element:</strong> <code>${escapeHtml(o.target)}</code></p>
                <pre class="occurrence__html"><code>${escapeHtml(o.html)}</code></pre>
            </div>`).join('')}
    </div>
</details>`;
  });

  if (fullyResolvedRules.length > 0) {
    html += `
    <section class="resolved-section">
        <h2>🎉 <span class="u-sr-only">Success: </span>Fully Resolved Since Last Audit</h2>
        <ul style="list-style: none; padding: 0;">
            ${fullyResolvedRules.map(r => `
                <li style="margin-bottom:0.5rem">
                    <span aria-hidden="true">✅</span> 
                    <strong>${r.friendlyName}</strong> 
                    <span class="u-sr-only">(Resolved)</span> 
                    (Previously ${r.impact})
                </li>`).join('')}
        </ul>
    </section>`;
  }

  html += `<footer class="report-footer">
  <p>
    <strong>Audit Methodology:</strong> This report was generated using <strong>Axe-Core</strong> automated testing. 
    Automated tools typically detect 30% to 50% of accessibility issues. For full WCAG compliance, 
    manual testing (keyboard navigation, screen reader flow, and color contrast) is required.
  </p>
  <p>© ${new Date().getFullYear()}</p>
</footer></div></main>
<script>
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".priority-list li").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      const link = item.querySelector("a");
      if (!link) return;
      const targetId = link.getAttribute("href").slice(1);
      const targetDetails = document.getElementById(targetId);
      const summary = targetDetails.querySelector('summary');
      if (targetDetails) {
        targetDetails.open = true;
        targetDetails.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (summary && !targetDetails.open) {
        summary.click();
      }
    });
  });
});
</script>
</body></html>`;

  fs.writeFileSync(htmlPath, html);
}
