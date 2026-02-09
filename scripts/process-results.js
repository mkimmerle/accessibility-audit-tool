import fs from 'fs';
import path from 'path';
import { Parser as Json2CsvParser } from 'json2csv';
import { fileURLToPath } from 'url';

import { aggregateRules } from '../lib/aggregate/aggregateRules.js';
import { diffRules } from '../lib/diff/diffRules.js';
import { enrichRules } from '../lib/enrich/enrichRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  try {
    // ===== Load Friendly Rule Names =====
    const FRIENDLY_RULE_NAMES_FILE = path.join(__dirname, 'friendly-rule-names.json');
    let FRIENDLY_RULE_NAMES = {};
    if (fs.existsSync(FRIENDLY_RULE_NAMES_FILE)) {
      try {
        FRIENDLY_RULE_NAMES = JSON.parse(fs.readFileSync(FRIENDLY_RULE_NAMES_FILE, 'utf-8'));
      } catch (err) {
        console.error('❌ Failed to parse friendly-rule-names.json:', err);
        process.exit(1);
      }
    }

    // ===== Load WCAG Tags =====
    const WCAG_TAGS_FILE = path.join(__dirname, 'wcag-tags.json');
    let WCAG_TAGS = {};
    if (fs.existsSync(WCAG_TAGS_FILE)) {
      try {
        WCAG_TAGS = JSON.parse(fs.readFileSync(WCAG_TAGS_FILE, 'utf-8'));
      } catch (err) {
        console.error('❌ Failed to parse wcag-tags.json:', err);
        process.exit(1);
      }
    }

    // ===== Load raw results =====
    const RAW_FILE = path.resolve(process.cwd(), 'raw-axe-results.json');
    if (!fs.existsSync(RAW_FILE)) {
      throw new Error(`❌ Raw results file not found: ${RAW_FILE}`);
    }

    let rawResults;
    try {
      rawResults = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
    } catch (err) {
      throw new Error(`❌ Failed to parse raw-axe-results.json: ${err.message}`);
    }

    // ===== Determine SITE_URL =====
    let SITE_URL = 'Unknown site';
    if (rawResults.site) {
      SITE_URL = rawResults.site;
    } else if (rawResults.length > 0 && rawResults[0].url) {
      const firstUrl = new URL(rawResults[0].url);
      SITE_URL = `${firstUrl.protocol}//${firstUrl.host}`;
    }

    const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
    const SITE_SLUG = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/[^\w-]/g, '_');
    const BASE_NAME = `audit-results-${SITE_SLUG}-${TIMESTAMP}`;
    const RESULTS_DIR = path.resolve(process.cwd(), 'results');
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const HTML_FILE = path.join(RESULTS_DIR, `${BASE_NAME}.html`);
    const CSV_FILE = path.join(RESULTS_DIR, `${BASE_NAME}.csv`);
    const JSON_FILE = path.join(RESULTS_DIR, `${BASE_NAME}.json`);
    const PREV_JSON_FILE = path.join(RESULTS_DIR, `latest-${SITE_SLUG}.json`);

    const stripChildren = html => {
      if (!html || typeof html !== 'string') return '';
      const match = html.match(/^<[^>]+>/);
      return match ? match[0] : html;
    };

    // ===== Aggregate rules =====
    const aggregatedRules = aggregateRules(rawResults, { stripChildren });
    const rules = enrichRules(aggregatedRules, {
      friendlyNames: FRIENDLY_RULE_NAMES,
      wcagTags: WCAG_TAGS
    });
    const currentRuleIds = new Set(rules.map(rule => rule.id));

    // ===== PRIORITY RULES =====
    const IMPACT_ORDER = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    const priorityRules = rules.length > 15
      ? [...rules]
          .sort((a, b) => {
            const impactDiff = (IMPACT_ORDER[b.impact] || 0) - (IMPACT_ORDER[a.impact] || 0);
            return impactDiff !== 0 ? impactDiff : b.occurrences.length - a.occurrences.length;
          })
          .slice(0, 5)
      : [];

    // ===== LOAD PREVIOUS AUDIT FOR DIFFS =====
    const { diffTotals } = diffRules(rules, RESULTS_DIR, FRIENDLY_RULE_NAMES);

    // ===== Identify Fully Resolved Rules =====
    const fullyResolvedRules = [];
    if (fs.existsSync(PREV_JSON_FILE)) {
      try {
        const prevAudit = JSON.parse(fs.readFileSync(PREV_JSON_FILE, 'utf-8'));
        prevAudit.rules.forEach(prevRule => {
          if (!currentRuleIds.has(prevRule.id)) {
            fullyResolvedRules.push({
              id: prevRule.id,
              friendlyName: FRIENDLY_RULE_NAMES[prevRule.id] || prevRule.id,
              impact: prevRule.impact
            });
          }
        });
      } catch (err) {
        console.warn('⚠️ Failed to read previous JSON for fully resolved rules:', err);
      }
    }

    // ===== WRITE JSON =====
    const rulesWithLevels = rules;
    fs.writeFileSync(JSON_FILE, JSON.stringify({
      site: SITE_URL,
      pagesAudited: rawResults.length,
      rules: rulesWithLevels,
      diffTotals,
      timestamp: TIMESTAMP
    }, null, 2));
    fs.copyFileSync(JSON_FILE, PREV_JSON_FILE);

    // ===== WRITE CSV =====
    const csvRows = [];
    rules.forEach(rule => {
      const wcagLevel = rule.wcagLevel;
      const ruleName = rule.displayName;
      const severity = rule.impact ? rule.impact.charAt(0).toUpperCase() + rule.impact.slice(1) : 'Unknown';

      const resourcesStr = rule.resources
        .map(r => `${r.label}: ${r.url}`)
        .join(' ; ');

      rule.occurrences.forEach(o => {
        csvRows.push({
          Rule: ruleName,
          Level: wcagLevel,
          Severity: severity,
          Page: o.page,
          Element: o.html,
          Resources: resourcesStr
        });
      });
    });

    const csvParser = new Json2CsvParser({ fields: ['Rule', 'Level', 'Severity', 'Page', 'Element', 'Resources'] });
    fs.writeFileSync(CSV_FILE, csvParser.parse(csvRows));

    // ===== WRITE HTML =====
    const escapeHtml = str => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const auditDate = new Date().toLocaleString();

    let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit Report for ${SITE_URL}</title>
<link rel="stylesheet" href="/audit.css">
</head>
<body class="results-page">
<main class="layout-container layout-container--wide results-shell">
    <h1>Audit Results for ${SITE_URL}</h1>
    <p><em>Audit recorded on ${auditDate}</em></p>

    <section class="audit-summary-grid">
        <div class="summary-card">
            <span class="summary-label">Pages Audited</span>
            <span class="summary-value">${rawResults.length}</span>
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
      };
      if (summary && !targetDetails.open) {
        summary.click();
      }
    });
  });
});
</script>
</body></html>`;

fs.writeFileSync(HTML_FILE, html);

// ===== Output filenames =====
console.log(JSON.stringify({
  json: JSON_FILE.split(path.sep).pop(),
  csv: CSV_FILE.split(path.sep).pop(),
  html: HTML_FILE.split(path.sep).pop()
}));

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();
