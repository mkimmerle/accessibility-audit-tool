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
 */
export function writeAuditHtml({ 
  htmlPath, 
  siteUrl, 
  rules, 
  priorityRules, 
  fullyResolvedRules, 
  diffTotals, 
  summary, 
  pagesAudited, 
  prioritySummary 
}) {
  const auditDate = new Date().toLocaleString();

  // --- FORMAT FRIENDLY NAMES FOR RULES ---
  let formattedRules = '';
  if (priorityRules && priorityRules.length > 0) {
    const ruleNames = priorityRules
      .slice(0, 3)
      .map(r => r.displayName || r.id);
    
    const listFormatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
    formattedRules = listFormatter.format(ruleNames);
  }

  // 1. Build Header and Summary Grid
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

    <button class="btn-pdf-export" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
        </svg>
        <span>Print/Save PDF</span>
    </button>

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
    </section>`;

  // 2. Build Priority Callout
  if (priorityRules && priorityRules.length > 0) {
    html += `
    <section class="priority-callout">
        <h2 class="priority-title">Priority Items: Fix These First</h2>
        <p class="priority-description">
            If you’re short on time, focus on the items below — priority items are ranked by 
            <strong>weighted impact</strong> (severity × how many pages are affected). 
            Fixing these first typically reduces the most risk fastest.
        </p>
        
        <p class="priority-tip">
          By focusing on <strong>${formattedRules}</strong>, you can resolve 
          <strong>${prioritySummary.percentOfViolations}%</strong> of all violations 
          across <strong>${prioritySummary.percentOfPages}%</strong> of your audited pages.
        </p>

        <ul class="priority-list">
        ${priorityRules.map(rule => {
          const friendlyName = rule.displayName || rule.id;
          const wcagLevel = rule.wcagLevel || 'Best Practice';
          const levelClass = `rule__level--${wcagLevel.toLowerCase().replace(' ', '-')}`;
          return `
            <li class="priority-item">
              <a href="#rule-${rule.id}" class="priority-link">
                    <span class="priority-name">
                        <span class="rule__name--wrapper">${friendlyName}</span>
                    </span>
                    <span class="priority-details">
                        <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact || 'minor'}</span>
                        <span class="rule__badge ${levelClass}">WCAG ${wcagLevel}</span>
                        <span class="priority-count">${rule.pagesAffected || 1} page${(rule.pagesAffected || 1) === 1 ? '' : 's'} affected</span>
                    </span>
                </a>
            </li>`;
        }).join('')}
        </ul>
    </section>`;
  }

  // 3. Build Success Hero if clean
  if (rules.length === 0) {
    html += `
    <section class="success-hero">
        <div class="success-content">
            <div class="success-icon-frame">
                <span class="success-icon" aria-hidden="true">✓</span>
            </div>
            <h2 class="success-title">Zero Automated Issues Detected</h2>
            <p class="success-message">
                Your site successfully passed all <strong>Axe-Core</strong> automated audits. 
                Automated tools typically detect 30–50% of issues. 
                Manual review is recommended to reach full compliance.
            </p>
        </div>
    </section>`;
  }

  // 4. Build Detailed Rules List
  html += `<div id="rules-container">`;

  rules.forEach(rule => {
    const friendlyName = rule.displayName || rule.id;
    const impactClass = `rule__impact--${rule.impact || 'minor'}`;
    const wcagLevel = rule.wcagLevel || 'Best Practice';
    const levelClass = `rule__level--${wcagLevel.toLowerCase().replace(' ', '-')}`;
    
    const resourcesHtml = rule.resources && rule.resources.length > 0 
      ? `<strong>Resources:</strong> ` + rule.resources.map(r => `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`).join(', ')
      : '';
    
    html += `
<details class="rule" id="rule-${rule.id}">
    <summary class="rule__summary">
        <span class="rule__title">
            <span class="rule__name--wrapper">
                ${friendlyName} 
                ${rule.isNewRule ? `<span class="rule__badge rule__badge--new">NEW RULE</span>` : ''}
            </span>
        </span>
        <span class="rule__details">
            <span class="rule__impact ${impactClass}">${rule.impact || 'minor'}</span>
            <span class="rule__badge ${levelClass}">WCAG ${wcagLevel}</span>
            <span class="rule__diff">
                <span aria-hidden="true">▲</span> ${rule.diff.new} / 
                <span aria-hidden="true">▼</span> ${rule.diff.resolved}
            </span>
        </span>
    </summary>
    <div class="rule__content">
        <p>${rule.description || ''}</p>
        <div class="rule__rationale">
            <strong>Why this matters:</strong>
            <p>${rule.rationale || 'No rationale provided.'}</p>
        </div>
        <p>${resourcesHtml}</p>
        ${rule.occurrences.map(o => `
        <div class="occurrence ${o.isNewOccurrence ? 'occurrence--new' : ''}">
            <p>
                <span class="occurrence__page">Page:</span> 
                <a href="${o.page}" target="_blank">${o.page}</a> 
                
                ${o.isNewPage ? 
                    `<span class="occurrence__badge">NEW PAGE</span>` : 
                    (o.isNewOccurrence ? `<span class="occurrence__badge">NEW ELEMENT</span>` : '')
                }
            </p>
            <p><strong>Element:</strong> <code>${escapeHtml(o.target)}</code></p>
            <pre class="occurrence__html"><code>${escapeHtml(o.html)}</code></pre>
        </div>`).join('')}
    </div>
</details>`;
  });

  // 5. Build Resolved Section
  if (fullyResolvedRules && fullyResolvedRules.length > 0) {
    html += `
    <section class="resolved-section">
        <h2>🎉 Fully Resolved Since Last Audit</h2>
        <ul style="list-style: none; padding: 0;">
            ${fullyResolvedRules.map(r => `
                <li style="margin-bottom:0.5rem">
                    <span aria-hidden="true">✅</span> 
                    <strong>${r.displayName || r.friendlyName || r.id}</strong> 
                    (Previously ${r.impact})
                </li>`).join('')}
        </ul>
    </section>`;
  }

  // 6. Footer and Scripts
  html += `<footer class="report-footer">
  <p>
    <strong>Audit Methodology:</strong> This report was generated using <strong>Axe-Core</strong> automated testing. 
    Manual testing is required for full WCAG compliance.
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
      if (targetDetails) {
        targetDetails.open = true;
        targetDetails.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});
</script>
</body></html>`;

  fs.writeFileSync(htmlPath, html);
}