import fs from 'fs';
import path from 'path';
import { Parser as Json2CsvParser } from 'json2csv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Load Friendly Rule Names =====
const FRIENDLY_RULE_NAMES_FILE = path.join(__dirname, 'friendly-rule-names.json');
let FRIENDLY_RULE_NAMES = {};
if (fs.existsSync(FRIENDLY_RULE_NAMES_FILE)) {
  FRIENDLY_RULE_NAMES = JSON.parse(fs.readFileSync(FRIENDLY_RULE_NAMES_FILE, 'utf-8'));
} else {
  console.warn('⚠️ friendly-rule-names.json not found, will fallback to rule.id');
}

// ===== Load WCAG Tags =====
const WCAG_TAGS_FILE = path.join(__dirname, 'wcag-tags.json');
let WCAG_TAGS = {};
if (fs.existsSync(WCAG_TAGS_FILE)) {
  WCAG_TAGS = JSON.parse(fs.readFileSync(WCAG_TAGS_FILE, 'utf-8'));
} else {
  console.warn('⚠️ wcag-tags.json not found, will fallback to rule.helpUrl');
}

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
        tags: rule.tags || [],
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

function buildResourcesCsv(rule) {
  const resources = [];

  // Deque link
  if (rule.helpUrl) {
    resources.push(`Deque: ${rule.helpUrl}`);
  }

  // WCAG links from tags
  if (Array.isArray(rule.tags)) {
    rule.tags.forEach(tag => {
      const wcag = WCAG_TAGS[tag];
      if (wcag && wcag.w3cURL) {
        resources.push(`${wcag.title}: ${wcag.w3cURL}`);
      }
    });
  }

  // De-dupe and join
  return [...new Set(resources)].join(' | ');
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
  const ruleName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
  const severity = rule.impact
    ? rule.impact.charAt(0).toUpperCase() + rule.impact.slice(1)
    : 'Unknown';

  const resources = buildResourcesCsv(rule);

  rule.occurrences.forEach(o => {
    csvRows.push({
      Rule: ruleName,
      Severity: severity,
      Page: o.page,
      Element: o.html,
      Resources: resources
    });
  });
});

const csvParser = new Json2CsvParser({
  fields: ['Rule', 'Severity', 'Page', 'Element', 'Resources']
});

fs.writeFileSync(CSV_FILE, csvParser.parse(csvRows));


// ===== WRITE HTML =====
const escapeHtml = str =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Accessibility Audit – ${SITE_URL}</title>
<style>
/* === Base Styles === */
body {
  font-family: system-ui, sans-serif;
  margin: 2rem;
  line-height: 1.5;
  color: #111;
  background-color: #fff;
}
h1, h2 {
  margin-bottom: 0.5rem;
}
a {
  color: #0066cc;
  text-decoration: none;
}
a:hover, a:focus {
  text-decoration: underline;
}
pre {
  background: inherit;
  padding: 0.75rem 0 0;
  overflow-x: auto;
  border-radius: 0;
}

/* === Rule Block === */
.rule {
  margin-bottom: 2rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 1rem;
  background: #fafafa;
}
.rule__summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  font-size: 1.1rem;
}
.rule__impact {
  padding: 0.2rem 0.5rem;
  border-radius: 5px;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.rule__impact--critical { background-color: #b00020; }
.rule__impact--serious   { background-color: #e65100; }
.rule__impact--moderate  { background-color: #ff8f00; }
.rule__impact--minor     { background-color: #2e7d32; }

/* === Occurrence Block === */
.occurrence {
  padding: 1rem 0.5rem;
  margin-top: 0;
}
.occurrence:nth-child(odd) { background-color: #f9f9f9; }
.occurrence:nth-child(even) { background-color: #f0f0f0; }
.occurrence__page {
  margin-top: 0;
}
.occurrence__page a {
  font-weight: 500;
}
.occurrence__target {
  font-family: monospace;
  display: block;
  margin: 0.25rem 0;
}
.occurrence__html {
  margin: 0.5rem 0 0;
}

/* === Collapsible Details === */
details {
  margin-top: 0.5rem;
}
details[open] summary::after {
  content: "▲";
  float: right;
}
summary::after {
  content: "▼";
  float: right;
}

/* === Filter Input === */
#filter-input {
  padding: 0.5rem;
  margin-bottom: 1rem;
  width: 100%;
  max-width: 400px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
</style>
</head>
<body>

<h1>Accessibility Audit Report for ${SITE_URL}</h1>
<p><strong>Pages audited:</strong> ${rawResults.length}</p>
<p><strong>Rules violated:</strong> ${rules.length}</p>

<form><label for="filter-input">Filter rules or pages</label><input type="text" id="filter-input" placeholder="Filter rules or pages..." /></form>

<div id="rules-container">
`;

rules.forEach(rule => {
  const friendlyName = FRIENDLY_RULE_NAMES[rule.id] || rule.id;
  const occurrenceCount = rule.occurrences.length;
  const impactClass = `rule__impact--${rule.impact || 'minor'}`;

  // ===== Resources (Deque + WCAG) =====
  let resourcesHtml = `<strong>Resources:</strong> <a href="${rule.helpUrl}" target="_blank" rel="noopener">Deque University</a>`;

  if (Array.isArray(rule.tags) && rule.tags.length > 0) {
    const wcagLinks = rule.tags
      .map(tag => {
        const wcag = WCAG_TAGS[tag];
        if (wcag) {
          return `<a href="${wcag.w3cURL}" target="_blank" rel="noopener">${wcag.title}</a>`;
        }
        return null;
      })
      .filter(Boolean)
      .join(', ');

    if (wcagLinks) {
      resourcesHtml += `, ${wcagLinks}`;
    }
  }

  // ===== HTML for the rule block =====
  html += `
<details class="rule">
  <summary class="rule__summary">
    ${friendlyName} – ${occurrenceCount} occurrence${occurrenceCount !== 1 ? 's' : ''}
    <span class="rule__impact ${impactClass}">${rule.impact || 'minor'}</span>
  </summary>
  <p>${rule.description}</p>
  <p>${resourcesHtml}</p>
`;

  // ===== Occurrences =====
  rule.occurrences.forEach((o, index) => {
    html += `
  <div class="occurrence">
    <p class="occurrence__page"><strong>Page:</strong> <a href="${o.page}" target="_blank" rel="noopener">${o.page}</a></p>
    <p class="occurrence__target"><strong>Element:</strong> ${escapeHtml(o.target)}</p>
    <pre class="occurrence__html">${escapeHtml(o.html)}</pre>
  </div>
`;
  });

  html += `</details>`;
});


html += `
</div>

<script>
// === Filter Script ===
const filterInput = document.getElementById('filter-input');
filterInput.addEventListener('input', () => {
  const query = filterInput.value.toLowerCase();
  document.querySelectorAll('#rules-container .rule').forEach(ruleEl => {
    const ruleText = ruleEl.innerText.toLowerCase();
    ruleEl.style.display = ruleText.includes(query) ? '' : 'none';
  });
});
</script>

</body>
</html>
`;


fs.writeFileSync(HTML_FILE, html);

// ===== DONE =====
console.log('✅ Audit results generated:');
console.log(`- ${HTML_FILE}`);
console.log(`- ${CSV_FILE}`);
console.log(`- ${JSON_FILE}`);
