// lib/io/auditHtml.js
import fs from 'fs';
import * as UI from '../ui/reportComponents.js';

export function writeAuditHtml({ 
  htmlPath, siteUrl, rules, priorityRules, fullyResolvedRules, 
  diffTotals, pagesAudited, prioritySummary 
}) {
  const auditDate = new Date().toLocaleString();
  const activeRules = rules.filter(r => r.occurrences?.length > 0);
  const totalActiveCount = activeRules.length;

  // Helper for priority rule naming
  const getFriendlyRuleList = () => {
    if (!priorityRules?.length) return '';
    const names = priorityRules.slice(0, 3).map(r => r.displayName || r.id);
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
  };

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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
        <span>Print/Save PDF</span>
    </button>

    <section class="audit-summary-grid">
        ${UI.SummaryCard('Pages Audited', pagesAudited)}
        ${UI.SummaryCard('New Issues', diffTotals.newViolations, 'status--new', '▲')}
        ${UI.SummaryCard('Resolved Issues', diffTotals.resolvedViolations, 'status--fixed', '▼')}
        ${UI.SummaryCard('Active Rules', rules.length)}
    </section>`;

  // Priority Section
  if (totalActiveCount >= 10 && priorityRules?.length > 0) {
    html += `
    <section class="priority-callout">
        <h2 class="priority-title">Priority Items: Fix These First</h2>
        <p class="priority-description">Ranked by weighted impact (severity × reach).</p>
        <p class="priority-tip">
          Fixing <strong>${getFriendlyRuleList()}</strong> resolves <strong>${prioritySummary.percentOfViolations}%</strong> of violations.
        </p>
        <ul class="priority-list">
            ${priorityRules.map(rule => `
            <li class="priority-item">
                <a href="#rule-${rule.id}" class="priority-link">
                    <span class="priority-name">
                        ${rule.displayName || rule.id}
                        ${rule.isSystemic ? UI.Badge('SYSTEMIC', 'systemic') : ''}
                    </span>
                    <span class="priority-details">
                        <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact}</span>
                        ${UI.WcagBadge(rule.wcagLevel)}
                        <span class="priority-count">${rule.pagesAffected} pages</span>
                    </span>
                </a>
            </li>`).join('')}
        </ul>
    </section>`;
  }

  // Success Hero
  if (rules.length === 0) {
    html += `
    <section class="success-hero">
        <div class="success-icon-frame"><span class="success-icon">✓</span></div>
        <h2 class="success-title">Zero Automated Issues Detected</h2>
        <p class="success-message">Manual review is recommended for full compliance.</p>
    </section>`;
  }

  // Main Rules Loop
  html += `<div id="rules-container">`;
  rules.forEach(rule => {
    html += `
    <details class="rule" id="rule-${rule.id}">
        <summary class="rule__summary">
            <span class="rule__title">
                <span class="rule__name--wrapper">
                    ${rule.displayName || rule.id}
                    ${rule.isNewRule ? UI.Badge('NEW RULE', 'new') : ''}
                    ${rule.isSystemic ? UI.Badge('GLOBAL ISSUE', 'systemic') : ''}
                </span>
            </span>
            <span class="rule__details">
                <span class="rule__impact rule__impact--${rule.impact || 'minor'}">${rule.impact}</span>
                ${UI.WcagBadge(rule.wcagLevel)}
                <span class="rule__diff">▲ ${rule.diff.new} / ▼ ${rule.diff.resolved}</span>
            </span>
        </summary>
        <div class="rule__content">
            <p>${rule.description || ''}</p>
            <div class="rule__rationale"><strong>Why this matters:</strong><p>${rule.rationale}</p></div>
            ${rule.occurrences.map(o => UI.Occurrence(o)).join('')}
        </div>
    </details>`;
  });

  // Footer & Scripts (Truncated for brevity, keep your original scripts here)
  html += `</div></main></body></html>`;

  fs.writeFileSync(htmlPath, html);
}