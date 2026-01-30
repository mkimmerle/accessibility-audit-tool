import fs from 'fs';
import path from 'path';
import { Parser as Json2CsvParser } from 'json2csv';

// ===== CONFIG =====
const SITE_URL = process.env.SITE_URL;
if (!SITE_URL) {
  console.error('❌ SITE_URL must be set');
  process.exit(1);
}

const RAW_FILE = path.resolve(process.cwd(), 'raw-axe-results.json');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const SITE_SLUG = SITE_URL
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '')
  .replace(/[^\w-]/g, '_');

const BASE_NAME = `audit-results-${SITE_SLUG}-${TIMESTAMP}`;

const HTML_FILE = `${BASE_NAME}.html`;
const CSV_FILE = `${BASE_NAME}.csv`;
const JSON_FILE = `${BASE_NAME}.json`;

// ===== HELPERS =====
function stripChildren(html) {
  if (!html || typeof html !== 'string') return '';

  // Return only the opening tag
  const match = html.match(/^<[^>]+>/);
  return match ? match[0] : html;
}

// ===== LOAD RAW RESULTS =====
if (!fs.existsSync(RAW_FILE)) {
  console.error(`❌ Raw results file not found: ${RAW_FILE}`);
  process.exit(1);
}

const rawResults = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));

// ===== AGGREGATE & GROUP BY RULE =====
const rulesMap = new Map();

rawResults.forEach(pageResult => {
  const pageUrl = pageResult.url;

  (pageResult.violations || []).forEach(rule => {
    if (!rulesMap.has(rule.id)) {
      rulesMap.set(rule.id, {
        id: rule.id,
        impact: rule.impact,
        description: rule.description,
        help: rule.help,
        helpUrl: rule.helpUrl,
        occurrences: []
      });
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

// ===== WRITE JSON (PROCESSED) =====
fs.writeFileSync(
  JSON_FILE,
  JSON.stringify(
    {
      site: SITE_URL,
      pagesAudited: rawResults.length,
      rules
    },
    null,
    2
  )
);

// ===== WRITE CSV =====
const csvRows = [];

rules.forEach(rule => {
  rule.occurrences.forEach(o => {
    csvRows.push({
      rule: rule.id,
      impact: rule.impact,
      page: o.page,
      target: o.target,
      html: o.html,
      helpUrl: rule.helpUrl
    });
  });
});

const csvParser = new Json2CsvParser();
fs.writeFileSync(CSV_FILE, csvParser.parse(csvRows));

// ===== WRITE HTML =====
const escapeHtml = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Accessibility Audit – ${SITE_URL}</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
summary { cursor: pointer; font-weight: 600; font-size: 1.1rem; }
pre { background: #f6f8fa; padding: 0.75rem; overflow-x: auto; }
.rule { margin-bottom: 2rem; }
.occurrence { border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1rem; }
a { color: #0366d6; text-decoration: none; }
</style>
</head>
<body>
<h1>Accessibility Audit Report</h1>
<p><strong>Site:</strong> ${SITE_URL}</p>
<p><strong>Pages audited:</strong> ${rawResults.length}</p>
<p><strong>Rules violated:</strong> ${rules.length}</p>
`;

rules.forEach(rule => {
  html += `
<details class="rule" open>
  <summary>${rule.id} (${rule.impact})</summary>
  <p>${rule.description}</p>
  <p><a href="${rule.helpUrl}" target="_blank">WCAG guidance</a></p>
`;

  rule.occurrences.forEach(o => {
    html += `
  <div class="occurrence">
    <p><strong>Page:</strong> <a href="${o.page}" target="_blank">${o.page}</a></p>
    <p><strong>Target:</strong> ${escapeHtml(o.target)}</p>
    <pre>${escapeHtml(o.html)}</pre>
  </div>
`;
  });

  html += '</details>';
});

html += '</body></html>';

fs.writeFileSync(HTML_FILE, html);

// ===== DONE =====
console.log('✅ Audit results generated:');
console.log(`- ${HTML_FILE}`);
console.log(`- ${CSV_FILE}`);
console.log(`- ${JSON_FILE}`);
