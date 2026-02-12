// ==========================
// Core Node modules
// ==========================
import fs from 'fs'; // File system module, used to read/write JSON and audit output files
import path from 'path'; // Path utilities for cross-platform file paths
import { fileURLToPath } from 'url'; // Needed to get __dirname in ES modules

// ==========================
// Custom utilities
// ==========================
import { loadJsonIfExists, stripChildren } from '../lib/utils.js';
// loadJsonIfExists: safely loads a JSON file if it exists, returns {} if not
// stripChildren: helper to remove child HTML elements from an HTML snippet, used in aggregation

// ==========================
// Core audit logic modules
// ==========================
import { aggregateRules } from '../lib/aggregate/aggregateRules.js'; // Combines raw results by rule
import { diffRules } from '../lib/diff/diffRules.js'; // Computes diffs from previous audit
import { enrichRules } from '../lib/enrich/enrichRules.js'; // Adds friendly names, WCAG tags, etc.

// ==========================
// IO modules
// ==========================
import { getSiteUrl, createAuditFiles, readPreviousAudit, writeAuditJson } from '../lib/io/auditFiles.js';
// getSiteUrl: determines the site URL from raw results
// createAuditFiles: generates output filenames and directories
// readPreviousAudit: loads previous audit JSON for comparison
// writeAuditJson: writes audit results to JSON files

import { writeAuditCsv } from '../lib/io/auditCsv.js'; // Converts enriched rules to CSV and writes to disk
import { writeAuditHtml } from '../lib/io/auditHtml.js'; // Converts enriched rules to human-readable HTML report

// ==========================
// __filename & __dirname setup for ES Modules
// ==========================
const __filename = fileURLToPath(import.meta.url); // Required because ES modules don't have __filename
const __dirname = path.dirname(__filename); // Required because ES modules don't have __dirname

// ==========================
// Main async IIFE (Immediately Invoked Function Expression)
// ==========================
// Wrapping everything in an async function allows us to use await if needed
(async () => {
  try {
    // ==========================
    // Load metadata: friendly rule names & WCAG tags
    // ==========================
    const AXE_RULE_METADATA = loadJsonIfExists(path.join(__dirname, '../data/axe-rules-4.11.1.json'));
    // Maps rule IDs to human-readable names

    const WCAG_TAGS = loadJsonIfExists(path.join(__dirname, 'wcag-tags.json'));
    // Maps rule IDs to WCAG criteria for reporting

    // ==========================
    // Load raw Axe results
    // ==========================
    const RAW_FILE = path.resolve(process.cwd(), 'raw-axe-results.json');
    // Full path to the raw Axe JSON results, from the current working directory

    if (!fs.existsSync(RAW_FILE)) {
      throw new Error(`❌ Raw results file not found: ${RAW_FILE}`);
      // Fail early if the raw results are missing
    }

    let rawResults;
    try {
      rawResults = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
      // Parse raw results JSON
    } catch (err) {
      throw new Error(`❌ Failed to parse raw-axe-results.json: ${err.message}`);
      // Fail if the JSON is malformed
    }

    // ==========================
    // Determine the site URL for this audit
    // ==========================
    const SITE_URL = getSiteUrl(rawResults);
    // Usually taken from the first page in rawResults

    // ==========================
    // Generate audit output paths & timestamp
    // ==========================
    const {
      resultsDir: RESULTS_DIR,
      files: { html: HTML_FILE, csv: CSV_FILE, json: JSON_FILE, latestJson: PREV_JSON_FILE },
      timestamp: TIMESTAMP
    } = createAuditFiles({ siteUrl: SITE_URL });
    // RESULTS_DIR: folder for this audit
    // HTML_FILE / CSV_FILE / JSON_FILE: paths for outputs
    // PREV_JSON_FILE: symlink or copy pointing to latest JSON for diffing
    // TIMESTAMP: when this audit was run

    // ==========================
    // Aggregate & enrich rules
    // ==========================
    const { rules: aggregatedRules, summary } = aggregateRules(rawResults, { stripChildren });
    // Combines raw violations by rule ID, strips child HTML tags for easier reporting

    const rules = enrichRules(aggregatedRules, { axeMetadata: AXE_RULE_METADATA, wcagTags: WCAG_TAGS });
    // Adds friendly names, WCAG levels, resource links, etc.

    const currentRuleIds = new Set(rules.map(rule => rule.id));
    // Set of rule IDs in the current audit, used for computing fully resolved rules

    // ==========================
    // Compute priority rules for quick attention
    // ==========================
    const IMPACT_ORDER = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    // Used to rank rules by severity

    const priorityRules = rules.length > 3
      ? [...rules]
          .sort((a, b) => {
            // Sort by impact first, then by number of pages affected
            const impactDiff = (IMPACT_ORDER[b.impact] || 0) - (IMPACT_ORDER[a.impact] || 0);
            return impactDiff !== 0 ? impactDiff : b.occurrences.length - a.occurrences.length;
          })
          .slice(0, 5) // Keep only top 5 priority items
      : []; // If few rules, no priority callout needed

    // ==========================
    // Compute diffs from previous audit
    // ==========================
    const { diffTotals } = diffRules(rules, RESULTS_DIR, AXE_RULE_METADATA);
    // diffTotals: { newViolations, resolvedViolations } etc.
    // Used to highlight changes since the last audit

    // ==========================
    // Identify fully resolved rules
    // ==========================
    const fullyResolvedRules = [];
    const prevAudit = readPreviousAudit(PREV_JSON_FILE);
    if (prevAudit?.rules) {
      fullyResolvedRules.push(
      ...prevAudit.rules
        .filter(prevRule => !currentRuleIds.has(prevRule.id))
        .map(prevRule => ({
          id: prevRule.id,
          displayName: prevRule.displayName || prevRule.id,
          impact: prevRule.impact
        }))
      );
    }
    // Fully resolved rules are displayed in a "🎉 Success" section in the HTML report

    // ==========================
    // Write JSON output
    // ==========================
    writeAuditJson({
      jsonPath: JSON_FILE,
      latestJsonPath: PREV_JSON_FILE,
      data: {
        site: SITE_URL,
        pagesAudited: rawResults.length,
        rules,
        diffTotals,
        timestamp: TIMESTAMP
      }
    });
    // JSON is used for programmatic consumption, CI pipelines, and historical storage

    // ==========================
    // Write CSV output
    // ==========================
    writeAuditCsv(rules, CSV_FILE);
    // CSV is convenient for spreadsheets and simple data analysis

    // ==========================
    // Write HTML output
    // ==========================
    writeAuditHtml({
      htmlPath: HTML_FILE,
      siteUrl: SITE_URL,
      pagesAudited: rawResults.length,
      rules,
      priorityRules,
      fullyResolvedRules,
      diffTotals,
      summary
    });
    // HTML is the human-readable audit report with priority callouts and resolved rules

    // ==========================
    // Log filenames of generated reports
    // ==========================
    console.log(JSON.stringify({
      json: path.basename(JSON_FILE),
      csv: path.basename(CSV_FILE),
      html: path.basename(HTML_FILE)
    }));
    // Makes it easy to see or consume filenames in CI logs or scripts

  } catch (err) {
    // ==========================
    // Global error handling
    // ==========================
    console.error('❌ Error:', err);
    process.exit(1);
    // If anything goes wrong, exit with error code so CI / scripts know the audit failed
  }
})();
