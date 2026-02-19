// lib/io/auditHtml.js
import fs from 'fs';
import path from 'path';
import * as UI from '../ui/reportComponents.js';

export function writeAuditHtml({ 
  htmlPath, siteUrl, rules, priorityRules, 
  diffTotals, pagesAudited, prioritySummary 
}) {
  const auditDate = new Date().toLocaleString();
  const activeRules = rules.filter(r => r.occurrences?.length > 0);

  // 1. EMBED LOGIC: Read the CSS file content
  const projectRoot = process.cwd();
  const cssPath = path.join(projectRoot, 'frontend', 'public', 'audit.css');
  let cssContent = '';
  
  try {
    cssContent = fs.readFileSync(cssPath, 'utf8');
  } catch (err) {
    console.warn("⚠️ Could not find audit.css to embed. Report will have no styling.");
  }
  
  // Prep metadata for UI components
  const impacts = [...new Set(rules.map(r => r.impact).filter(Boolean))];
  const hasMultipleSeverities = impacts.length > 1;
  const hasNewRules = rules.some(r => r.isNewRule);

  let html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Accessibility Audit Report for ${siteUrl}</title>
    <style>
      ${cssContent}
    </style>
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

  // 1. Priority Section (Only show if report is significant)
  if (activeRules.length >= 10) {
    html += UI.PrioritySection(priorityRules, prioritySummary);
  }

  // 2. Filter Bar or Success Hero
  if (rules.length === 0) {
    html += `
    <section class="success-hero">
        <div class="success-icon-frame"><span class="success-icon">✓</span></div>
        <h2 class="success-title">Zero Automated Issues Detected</h2>
        <p class="success-message">Manual review is recommended for full compliance.</p>
    </section>`;
  } else if (hasMultipleSeverities) {
    html += UI.FilterBar(rules, impacts, hasNewRules);
  }

  // 3. Main Rules List
  html += `
    <div id="rules-container">
        ${rules.map(rule => UI.Rule(rule)).join('')}
    </div>`;

  // 4. Scripts & Closure
  html += `
    <footer class="report-footer">
        <p>
            <strong>Audit Methodology:</strong> This report was generated using <strong>Axe-Core</strong> automated testing. 
            Automated tools typically detect 30% to 50% of accessibility issues. Manual testing is required for full WCAG compliance.
        </p>
        <p>© ${new Date().getFullYear()}</p>
    </footer>
    </main>
    <script>${UI.FilterScript()}</script>
  </body>
  </html>`;

  fs.writeFileSync(htmlPath, html);
}