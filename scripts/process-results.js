import fs from 'fs';
import path from 'path';
import { Parser as Json2CsvParser } from 'json2csv';
import { fileURLToPath } from 'url';

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

    // ===== Determine SITE_URL from raw results =====
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
    const CSV_FILE  = path.join(RESULTS_DIR, `${BASE_NAME}.csv`);
    const JSON_FILE = path.join(RESULTS_DIR, `${BASE_NAME}.json`);

    const stripChildren = html => {
      if (!html || typeof html !== 'string') return '';
      const match = html.match(/^<[^>]+>/);
      return match ? match[0] : html;
    };

    // ===== Aggregate rules =====
    const rulesMap = new Map();
    rawResults.forEach(pageResult => {
      const pageUrl = pageResult.url;
      (pageResult.violations || []).forEach(rule => {
        if (!rulesMap.has(rule.id)) {
          rulesMap.set(rule.id, { ...rule, occurrences: [] });
        }
        rule.nodes.forEach(node => {
          rulesMap.get(rule.id).occurrences.push({
            page: pageUrl,
            html: stripChildren(node.html),
            target: node.target.join(', ')
          });
        });
      });
    });

    const rules = Array.from(rulesMap.values());
    if (rules.length === 0) {
      console.log('⚠️ No accessibility violations found.');
      process.exit(0);
    }

    // ===== LOAD PREVIOUS AUDIT FOR DIFFS =====
    let prevAudit = null;
    const prevJsonFile = path.join(RESULTS_DIR, `latest-${SITE_SLUG}.json`);
    if (fs.existsSync(prevJsonFile)) {
      try {
        prevAudit = JSON.parse(fs.readFileSync(prevJsonFile, 'utf-8'));
      } catch (err) {
        console.warn('⚠️ Could not parse previous audit for diff tracking:', err);
      }
    }

    const diffTotals = { newViolations: 0, resolvedViolations: 0, unchanged: 0 };
    const prevOccurrencesByRule = {};
    const prevPagesByRule = {};
    const prevRuleIds = new Set();

    if (prevAudit) {
      prevAudit.rules.forEach(rule => {
        prevOccurrencesByRule[rule.id] = new Set(rule.occurrences.map(o => o.page + '|' + o.html));
        prevPagesByRule[rule.id] = new Set(rule.occurrences.map(o => o.page));
        prevRuleIds.add(rule.id);
      });
    }

    // Compute per-rule diffs and total diffs
    rules.forEach(rule => {
      const currentSet = new Set(rule.occurrences.map(o => o.page + '|' + o.html));
      const prevSet = prevOccurrencesByRule[rule.id] || new Set();

      const newCount = [...currentSet].filter(x => !prevSet.has(x)).length;
      const resolvedCount = [...prevSet].filter(x => !currentSet.has(x)).length;
      const unchangedCount = [...currentSet].filter(x => prevSet.has(x)).length;

      rule.diff = { new: newCount, resolved: resolvedCount, unchanged: unchangedCount };

      // Determine if this rule is completely new
      rule.isNewRule = prevAudit ? !prevRuleIds.has(rule.id) : false;

      // Page-level "new" URLs (only if rule existed previously)
      let newPages = new Set();
      if (prevPagesByRule[rule.id]) {
        const currentPages = new Set(rule.occurrences.map(o => o.page));
        const prevPages = prevPagesByRule[rule.id];
        newPages = new Set([...currentPages].filter(p => !prevPages.has(p)));
      }

      rule.diff.newPages = newPages;

      rule.occurrences = rule.occurrences.map(o => ({
        ...o,
        isNewPage: rule.diff?.newPages?.has(o.page) || false
      }));

      diffTotals.newViolations += newCount;
      diffTotals.resolvedViolations += resolvedCount;
      diffTotals.unchanged += unchangedCount;
    });

    // ===== WRITE JSON =====
    fs.writeFileSync(JSON_FILE, JSON.stringify({
      site: SITE_URL,
      pagesAudited: rawResults.length,
      rules,
      diffTotals,
      timestamp: TIMESTAMP
    }, null, 2));

    // Update "latest" pointer
    fs.copyFileSync(JSON_FILE, prevJsonFile);

    // ===== WRITE CSV =====
    const csvRows = [];
    rules.forEach(rule => {
      const ruleName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
      const severity = rule.impact ? rule.impact.charAt(0).toUpperCase() + rule.impact.slice(1) : 'Unknown';
      const resources = [];
      if (rule.helpUrl) resources.push(`Deque: ${rule.helpUrl}`);
      if (Array.isArray(rule.tags)) {
        rule.tags.forEach(tag => {
          const wcag = WCAG_TAGS[tag];
          if (wcag && wcag.w3cURL) resources.push(`${wcag.title}: ${wcag.w3cURL}`);
        });
      }
      const resourcesStr = [...new Set(resources)].join(' | ');
      rule.occurrences.forEach(o => {
        csvRows.push({ Rule: ruleName, Severity: severity, Page: o.page, Element: o.html, Resources: resourcesStr });
      });
    });

    const csvParser = new Json2CsvParser({ fields: ['Rule', 'Severity', 'Page', 'Element', 'Resources'] });
    fs.writeFileSync(CSV_FILE, csvParser.parse(csvRows));

    // ===== WRITE HTML =====
    const escapeHtml = str =>
      String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const auditDate = new Date().toISOString().replace('T', ' ').split('.')[0];

    let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Accessibility Audit – ${SITE_URL}</title>
<link rel="stylesheet" href="/main.css">
</head>
<body class="results__page">
<main>
<h1>Accessibility Audit Report for ${SITE_URL}</h1>
<p><em>Audited on: ${auditDate}</em></p>
<p><strong>Pages audited:</strong> ${rawResults.length}</p>
<p><strong>Rules violated:</strong> ${rules.length}</p>
<p><strong>Changes since last audit:</strong> ${diffTotals.newViolations} new, ${diffTotals.resolvedViolations} resolved, ${diffTotals.unchanged} unchanged</p>
<div id="rules-container">`;

    rules.forEach(rule => {
      const friendlyName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
      const occurrenceCount = rule.occurrences.length;
      const impactClass = `rule__impact--${rule.impact || 'minor'}`;

      let resourcesHtml = `<strong>Resources:</strong> <a href="${rule.helpUrl}" target="_blank" rel="noopener">Deque University</a>`;
      if (Array.isArray(rule.tags) && rule.tags.length > 0) {
        const wcagLinks = rule.tags
          .map(tag => {
            const wcag = WCAG_TAGS[tag];
            return wcag ? `<a href="${wcag.w3cURL}" target="_blank" rel="noopener">${wcag.title}</a>` : null;
          })
          .filter(Boolean)
          .join(', ');
        if (wcagLinks) resourcesHtml += `, ${wcagLinks}`;
      }

      html += `<details class="rule">
<summary class="rule__summary">
  <span class="rule__summary--text">
    ${friendlyName} – ${occurrenceCount} occurrence${occurrenceCount !== 1 ? 's' : ''}
    ${rule.isNewRule ? `
      <span class="rule__badge rule__badge--new" aria-hidden="true">NEW</span>
      <span class="sr-only">This rule is new since last audit</span>
    ` : ''}
    ${rule.diff ? `
      <span class="rule__diff">
        <span class="rule__diff--visual" aria-hidden="true">
          <span class="rule__diff--new">▲ ${rule.diff.new}</span>, 
          <span class="rule__diff--resolved">▼ ${rule.diff.resolved}</span>
        </span>
        <span class="sr-only">${rule.diff.new} new issues, ${rule.diff.resolved} resolved since last audit</span>
      </span>
    ` : ''}
  </span>
  <span class="rule__impact--container"><span class="rule__impact ${impactClass}">
    ${rule.impact || 'minor'}
  </span></span>
</summary>
<p>${rule.description}</p>
<p>${resourcesHtml}</p>`;

      rule.occurrences.forEach(o => {
        html += `<div class="occurrence">
<p class="occurrence__page">
<strong>Page:</strong> 
<a href="${o.page}" target="_blank" rel="noopener">${o.page}</a>
${o.isNewPage ? `
  <span class="page__new" aria-hidden="true">NEW</span>
  <span class="sr-only">New page for this issue</span>
` : ''}
</p>
<p class="occurrence__target"><strong>Element:</strong> ${escapeHtml(o.target)}</p>
<pre class="occurrence__html">${escapeHtml(o.html)}</pre>
</div>`;
      });

      html += `</details>`;
    });

    html += `</div></main></body></html>`;
    fs.writeFileSync(HTML_FILE, html);

    // ===== OUTPUT FILENAMES FOR SERVER =====
    console.log(JSON.stringify({
      json: JSON_FILE.split(path.sep).pop(),
      csv: CSV_FILE.split(path.sep).pop(),
      html: HTML_FILE.split(path.sep).pop()
    }));

  } catch (err) {
    console.error('❌ Uncaught error in process-results.js:', err);
    process.exit(1);
  }
})();
