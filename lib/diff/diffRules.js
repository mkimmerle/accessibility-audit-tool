import fs from 'fs';
import path from 'path';

/**
 * Generates a stable unique key for an occurrence.
 * We prioritize 'target' (the CSS selector path) over 'html' to avoid brittle diffs
 * caused by whitespace changes or dynamic content.
 */
function getOccurrenceKey(page, ruleId, node) {
  // node.target is usually an array from Axe, e.g., ["#footer", "div > button"]
  const selector = Array.isArray(node.target) ? node.target.join(' > ') : node.target;
  return `${page}|${ruleId}|${selector}`;
}

/**
 * Compute diffs between current rules and previous audit
 */
export function diffRules(rules, resultsDir, friendlyNames = {}, prevAuditFileName = null) {
  // ===== Load previous audit =====
  let prevAudit = null;
  // Use a fallback if rules[0] is missing (empty audit)
  const siteSlug = rules[0]?.siteSlug || 'unknown';
  const prevJsonFile = prevAuditFileName
    ? path.join(resultsDir, prevAuditFileName)
    : path.join(resultsDir, `latest-${siteSlug}.json`);

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

  // ===== Index previous audit by stable keys =====
  if (prevAudit) {
    prevAudit.rules.forEach(rule => {
      prevRuleIds.add(rule.id);
      prevPagesByRule[rule.id] = new Set(rule.occurrences.map(o => o.page));
      
      // Map occurrences to stable keys
      const keys = rule.occurrences.map(o => getOccurrenceKey(o.page, rule.id, o));
      prevOccurrencesByRule[rule.id] = new Set(keys);
    });
  }

  // ===== Compute diffs =====
  rules.forEach(rule => {
    const currentKeys = rule.occurrences.map(o => getOccurrenceKey(o.page, rule.id, o));
    const currentSet = new Set(currentKeys);
    const prevSet = prevOccurrencesByRule[rule.id] || new Set();

    // Identify which keys are new, resolved, or unchanged
    const newCount = [...currentSet].filter(x => !prevSet.has(x)).length;
    const resolvedCount = [...prevSet].filter(x => !currentSet.has(x)).length;
    const unchangedCount = [...currentSet].filter(x => prevSet.has(x)).length;

    rule.diff = { 
      new: newCount, 
      resolved: resolvedCount, 
      unchanged: unchangedCount,
      newPages: new Set()
    };

    rule.isNewRule = prevAudit ? !prevRuleIds.has(rule.id) : false;

    // Detect if the rule has spread to new pages
    if (prevPagesByRule[rule.id]) {
      const currentPages = new Set(rule.occurrences.map(o => o.page));
      const prevPages = prevPagesByRule[rule.id];
      rule.diff.newPages = new Set([...currentPages].filter(p => !prevPages.has(p)));
    }

    // Annotate individual occurrences
    rule.occurrences = rule.occurrences.map((o, index) => {
      const key = currentKeys[index];
      return {
        ...o,
        isNewOccurrence: !prevSet.has(key), // Specific element is new
        isNewPage: rule.diff.newPages.has(o.page) // Page itself is new to this rule
      };
    });

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