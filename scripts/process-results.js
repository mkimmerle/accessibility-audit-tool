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

    // ===== LOAD PREVIOUS AUDIT FOR DIFFS =====
    let prevAudit = null;
    const prevJsonFile = path.join(RESULTS_DIR, `latest-${SITE_SLUG}.json`);
    if (fs.existsSync(prevJsonFile)) {
      try {
        prevAudit = JSON.parse(fs.readFileSync(prevJsonFile, 'utf-8'));
      } catch (err) {
        console.warn('⚠️ Could not parse previous audit:', err);
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

    // Compute Diffs
    rules.forEach(rule => {
      const currentSet = new Set(rule.occurrences.map(o => o.page + '|' + o.html));
      const prevSet = prevOccurrencesByRule[rule.id] || new Set();

      const newCount = [...currentSet].filter(x => !prevSet.has(x)).length;
      const resolvedCount = [...prevSet].filter(x => !currentSet.has(x)).length;
      const unchangedCount = [...currentSet].filter(x => prevSet.has(x)).length;

      rule.diff = { new: newCount, resolved: resolvedCount, unchanged: unchangedCount };
      rule.isNewRule = prevAudit ? !prevRuleIds.has(rule.id) : false;

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

    // Identify Fully Resolved Rules
    const fullyResolvedRules = [];
    if (prevAudit) {
      prevAudit.rules.forEach(prevRule => {
        if (!rulesMap.has(prevRule.id)) {
          fullyResolvedRules.push({
            id: prevRule.id,
            friendlyName: FRIENDLY_RULE_NAMES[prevRule.id] || prevRule.id,
            impact: prevRule.impact
          });
        }
      });
    }

    // ===== WRITE JSON =====
    fs.writeFileSync(JSON_FILE, JSON.stringify({ site: SITE_URL, pagesAudited: rawResults.length, rules, diffTotals, timestamp: TIMESTAMP }, null, 2));
    fs.copyFileSync(JSON_FILE, prevJsonFile);

    // ===== WRITE CSV (Restored Resource Mapping) =====
    const csvRows = [];
    rules.forEach(rule => {
      const ruleName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
      const severity = rule.impact ? rule.impact.charAt(0).toUpperCase() + rule.impact.slice(1) : 'Unknown';
      
      const resources = [`Deque: ${rule.helpUrl}`];
      if (Array.isArray(rule.tags)) {
        rule.tags.forEach(tag => {
          const wcag = WCAG_TAGS[tag];
          if (wcag && wcag.w3cURL) resources.push(`${wcag.title}: ${wcag.w3cURL}`);
        });
      }
      const resourcesStr = [...new Set(resources)].join(' ; ');

      rule.occurrences.forEach(o => {
        csvRows.push({ Rule: ruleName, Severity: severity, Page: o.page, Element: o.html, Resources: resourcesStr });
      });
    });
    const csvParser = new Json2CsvParser({ fields: ['Rule', 'Severity', 'Page', 'Element', 'Resources'] });
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
<style>
:root {
    --color-new: #bc222f; --color-fixed: #1a7f37; --color-serious: #7d5200;
    --color-bg-new: #fff0f1; --color-bg-fixed: #f0fff4;
    --color-text: #24292f; --border-color: #d0d7de;
    --font-main: system-ui, sans-serif;
}
body.results__page { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; color: #333; background-color: #fefefe; width: auto; max-width: none; }
a { color:#145193;text-decoration:underline;transition: all .3s ease;}
a:hover,a:focus{text-decoration:underline;}
pre{background:inherit;padding:0.75rem 0 0;overflow-x:auto;border-radius:0;}
main { max-width: 1000px; margin: 0 auto; background: white; padding: 2rem; border: 1px solid var(--border-color); border-radius: 8px; }
.audit-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0; }
.summary-card { padding: 1.25rem; border: 1px solid var(--border-color); border-radius: 6px; background: #fff; border-left: 5px solid #666; }
.summary-label { font-size: 0.75rem; text-transform: uppercase; color: #57606a; font-weight: 600; }
.summary-value { font-size: 1.75rem; font-weight: 800; display: block; }
.status--new { border-left-color: var(--color-new); background: var(--color-bg-new); color: var(--color-new); }
.status--fixed { border-left-color: var(--color-fixed); background: var(--color-bg-fixed); color: var(--color-fixed); }
details.rule { margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: 6px; }
summary { padding: 1rem; background: #f8f9fa; cursor: pointer; display: flex; justify-content: space-between; font-weight: 600; }
.rule__badge--new { background: var(--color-new); color: white; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; margin-left: 10px; }
.rule__diff--visual { font-size: 0.8rem; color: #57606a; margin-left: auto; padding-right: 1rem; }
.occurrence { padding: 1rem; border-top: 1px solid #eee; }
.occurrence--highlight { border-left: 5px solid var(--color-new); background: var(--color-bg-new); }
.badge--new-page { background: var(--color-new); color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
.occurrence__html { background: #24292f; color: #f6f8fa; padding: 1rem; border-radius: 4px; font-size: 0.85rem; overflow-x: auto; }
.resolved-section { margin-top: 3rem; padding: 1.5rem; border: 2px dashed var(--color-fixed); border-radius: 8px; background: var(--color-bg-fixed); }
.rule__impact { text-transform: capitalize; font-weight: bold; }
.rule__impact--critical { color: var(--color-new); }
.rule__impact--serious { color: var(--color-serious); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
details{margin-top:0.5rem;}
summary{list-style: none;}
summary::-webkit-details-marker{display: none;}
summary::after{content:"▼";float:right;margin-left:1rem;}
details[open] summary::after{content:"▲";float:right;}
#filter-input{padding:0.5rem;margin-bottom:1rem;width:100%;max-width:400px;border:1px solid #145193;border-radius:5px;}
</style>
</head>
<body class="results__page">
<main>
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
                <span class="sr-only">Increased by </span>${diffTotals.newViolations}
            </span>
        </div>
        <div class="summary-card status--fixed">
            <span class="summary-label">Resolved Issues</span>
            <span class="summary-value">
                <span aria-hidden="true">▼</span>
                <span class="sr-only">Decreased by </span>${diffTotals.resolvedViolations}
            </span>
        </div>
        <div class="summary-card">
            <span class="summary-label">Active Rules</span>
            <span class="summary-value">${rules.length}</span>
        </div>
    </section>

    <div id="rules-container">`;

    rules.forEach(rule => {
      const friendlyName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
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
      
      html += `
<details class="rule">
    <summary>
        <span>
            ${friendlyName}
            ${rule.isNewRule ? `<span class="rule__badge--new"><span class="sr-only">New Rule: </span>NEW RULE</span>` : ''}
        </span>
        <span class="rule__diff--visual">
            <span aria-hidden="true">▲</span><span class="sr-only">New:</span> ${rule.diff.new} / 
            <span aria-hidden="true">▼</span><span class="sr-only">Fixed:</span> ${rule.diff.resolved}
        </span>
        <span class="rule__impact ${impactClass}">${rule.impact || 'minor'}</span>
    </summary>
    <div style="padding: 1rem;">
        <p>${rule.description}</p>
        <p>${resourcesHtml}</p>
        ${rule.occurrences.map(o => `
            <div class="occurrence ${o.isNewPage ? 'occurrence--highlight' : ''}">
                <p><strong>Page:</strong> <a href="${o.page}" target="_blank">${o.page}</a> 
                   ${o.isNewPage ? `<span class="badge--new-page"><span class="sr-only">New location: </span>NEW PAGE</span>` : ''}
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
        <h2>🎉 <span class="sr-only">Success: </span>Fully Resolved Since Last Audit</h2>
        <ul style="list-style: none; padding: 0;">
            ${fullyResolvedRules.map(r => `
                <li style="margin-bottom:0.5rem">
                    <span aria-hidden="true">✅</span> 
                    <strong>${r.friendlyName}</strong> 
                    <span class="sr-only">(Resolved)</span> 
                    (Previously ${r.impact})
                </li>`).join('')}
        </ul>
    </section>`;
    }

    html += `</div></main></body></html>`;
    fs.writeFileSync(HTML_FILE, html);

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