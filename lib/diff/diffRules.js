import fs from 'fs';
import path from 'path';

/**
 * Compute diffs between current rules and previous audit
 * @param {Array} rules - rules array from aggregateRules
 * @param {string} resultsDir - directory where previous audit JSONs are stored
 * @param {Object} friendlyNames - mapping of rule IDs to friendly names
 * @param {string|null} prevAuditFileName - optional override of previous JSON file name
 * @returns {Object} { rules: enrichedRules, diffTotals, fullyResolvedRules }
 */
export function diffRules(rules, resultsDir, friendlyNames = {}, prevAuditFileName = null) {
  // ===== Load previous audit =====
  let prevAudit = null;
  const prevJsonFile = prevAuditFileName
    ? path.join(resultsDir, prevAuditFileName)
    : path.join(resultsDir, `latest-${rules[0]?.siteSlug || 'unknown'}.json`);

  if (fs.existsSync(prevJsonFile)) {
    try {
      prevAudit = JSON.parse(fs.readFileSync(prevJsonFile, 'utf-8'));
    } catch (err) {
      console.warn('⚠️ Could not parse previous audit:', err);
    }
  }

  // ===== Prepare previous data sets =====
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

  // ===== Compute diffs =====
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

    // Annotate occurrences with isNewPage
    rule.occurrences = rule.occurrences.map(o => ({
      ...o,
      isNewPage: rule.diff?.newPages?.has(o.page) || false
    }));

    diffTotals.newViolations += newCount;
    diffTotals.resolvedViolations += resolvedCount;
    diffTotals.unchanged += unchangedCount;
  });

  // ===== Identify Fully Resolved Rules =====
  const fullyResolvedRules = [];
  const currentRuleIds = new Set(rules.map(rule => rule.id));

  if (prevAudit) {
    prevAudit.rules.forEach(prevRule => {
      if (!currentRuleIds.has(prevRule.id)) {
        fullyResolvedRules.push({
          id: prevRule.id,
          friendlyName: friendlyNames[prevRule.id] || prevRule.id,
          impact: prevRule.impact
        });
      }
    });
  }

  return { rules, diffTotals, fullyResolvedRules };
}
