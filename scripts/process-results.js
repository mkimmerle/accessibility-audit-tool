// ==========================
// Core Node modules
// ==========================
import fs from 'fs'; 
import path from 'path'; 
import { fileURLToPath } from 'url'; 

// ==========================
// Custom utilities
// ==========================
import { loadJsonIfExists, stripChildren } from '../lib/utils.js';

// ==========================
// Core audit logic modules
// ==========================
import { aggregateRules } from '../lib/aggregate/aggregateRules.js'; 
import { diffRules } from '../lib/diff/diffRules.js'; 
import { enrichRules } from '../lib/enrich/enrichRules.js'; 

// ==========================
// IO modules
// ==========================
import { getSiteUrl, createAuditFiles, readPreviousAudit, writeAuditJson } from '../lib/io/auditFiles.js';
import { writeAuditCsv } from '../lib/io/auditCsv.js'; 
import { writeAuditHtml } from '../lib/io/auditHtml.js'; 

// ==========================
// __filename & __dirname setup for ES Modules
// ==========================
const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename); 

// ==========================
// Main async IIFE
// ==========================
(async () => {
  try {
    // ==========================
    // Load metadata
    // ==========================
    const AXE_RULE_METADATA = loadJsonIfExists(path.join(__dirname, '../data/axe-rules-4.11.1.json'));
    const WCAG_TAGS = loadJsonIfExists(path.join(__dirname, 'wcag-tags.json'));
    const RATIONALES = loadJsonIfExists(path.join(__dirname, '../data/rationales.json'));

    // ==========================
    // Load raw Axe results
    // ==========================
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

    // ==========================
    // Determine the site URL
    // ==========================
    const SITE_URL = getSiteUrl(rawResults);

    // ==========================
    // Generate audit output paths & timestamp
    // ==========================
    const {
      resultsDir: RESULTS_DIR,
      files: { html: HTML_FILE, csv: CSV_FILE, json: JSON_FILE, latestJson: PREV_JSON_FILE },
      timestamp: TIMESTAMP
    } = createAuditFiles({ siteUrl: SITE_URL });

    // ==========================
    // Aggregate & enrich rules
    // ==========================
    const { rules: aggregatedRules, summary } = aggregateRules(rawResults, { stripChildren });

    const rules = enrichRules(aggregatedRules, { 
      axeMetadata: AXE_RULE_METADATA, 
      wcagTags: WCAG_TAGS, 
      rationales: RATIONALES 
    });

    const currentRuleIds = new Set(rules.map(rule => rule.id));

    // ==========================
    // Compute priority rules (Weighted Scoring)
    // ==========================
    const IMPACT_WEIGHTS = { critical: 10000, serious: 1000, moderate: 100, minor: 10 };

    let priorityRules = [];
    if (rules.length > 0) {
      priorityRules = [...rules]
        .map(rule => {
          const uniquePages = new Set(rule.occurrences.map(o => o.page)).size;
          rule.priorityScore = IMPACT_WEIGHTS[rule.impact] + uniquePages;
          rule.pagesAffected = uniquePages; 
          return rule;
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 5);
    }

    const totalPagesAudited = rawResults.length;
    const priorityPages = new Set();
    let priorityOccurrencesCount = 0;

    priorityRules.forEach(rule => {
      rule.occurrences.forEach(o => {
        priorityPages.add(o.page);
        priorityOccurrencesCount++;
      });
    });

    const totalOccurrencesOverall = rules.reduce((acc, r) => acc + r.occurrences.length, 0);
    const percentOfViolations = totalOccurrencesOverall > 0 
        ? Math.round((priorityOccurrencesCount / totalOccurrencesOverall) * 100) 
        : 0;
    const percentOfPages = totalPagesAudited > 0 
        ? Math.round((priorityPages.size / totalPagesAudited) * 100) 
        : 0;

    const prioritySummary = {
      percentOfViolations,
      percentOfPages
    };

    // ==========================
    // Compute diffs from previous audit
    // ==========================
    const { diffTotals } = diffRules(rules, RESULTS_DIR, AXE_RULE_METADATA);

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

    // ==========================
    // Write CSV output
    // ==========================
    writeAuditCsv(rules, CSV_FILE);

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
      summary, 
      percentOfViolations, 
      percentOfPages, 
      prioritySummary
    });

    // ==========================
    // Log filenames
    // ==========================
    console.log(JSON.stringify({
      json: path.basename(JSON_FILE),
      csv: path.basename(CSV_FILE),
      html: path.basename(HTML_FILE)
    }));

    // ==========================
    // Terminal Scorecard
    // ==========================
    console.log('\n--- 📊 AUDIT SCORECARD ---');
    console.log(`Site:         ${SITE_URL}`);
    console.log(`Pages:        ${rawResults.length}`);
    console.log(`Total Issues: ${totalOccurrencesOverall}`);
    console.log(`New Issues:   ${diffTotals.newViolations} ${diffTotals.newViolations > 0 ? '⚠️' : '✅'}`);
    console.log(`Resolved:     ${diffTotals.resolvedViolations} 🎉`);
    console.log('--------------------------\n');

    // ==========================
    // CI Exit Code Gate
    // ==========================
    const shouldFailOnCritical = process.env.FAIL_ON_ACCESSIBILITY_CRITICAL === 'true';
    const shouldFailOnRegressions = process.env.FAIL_ON_ACCESSIBILITY_REGRESSIONS === 'true';

    let failReason = null;

    // Check 1: Critical Issues
    const criticalRules = rules.filter(r => r.impact === 'critical');
    if (shouldFailOnCritical && criticalRules.length > 0) {
      failReason = `🛑 [CI FAILURE] ${criticalRules.length} critical rules violated.`;
    }

    // Check 2: Regressions (New issues since last run)
    if (shouldFailOnRegressions && diffTotals.newViolations > 0) {
      failReason = `🛑 [CI FAILURE] ${diffTotals.newViolations} new violations introduced.`;
    }

    if (failReason) {
      console.error(failReason);
      if (criticalRules.length > 0) {
        criticalRules.forEach(r => console.error(`   - ${r.displayName || r.id}`));
      }
      process.exit(1); 
    }

    console.log('✅ Audit passed compliance checks. Build can proceed.');

    // Cleanup raw results in CI to keep workspace tidy
    if (process.env.CI === 'true' && fs.existsSync(RAW_FILE)) {
      fs.unlinkSync(RAW_FILE);
    }

    process.exit(0);

  } catch (err) {
    console.error('❌ Error during processing:', err);
    process.exit(1);
  }
})();