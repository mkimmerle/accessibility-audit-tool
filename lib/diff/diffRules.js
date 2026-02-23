// lib/diff/diffRules.js
import fs from 'fs';
import path from 'path';

/**
 * Generates a stable unique key for an occurrence.
 * Normalizes URLs and selectors to prevent "Badge Spam."
 */
function getOccurrenceKey(page, ruleId, node) {
  const cleanPage = page.replace(/\/$/, '').split('#')[0];

  // Consistency fix: Handle both fresh Axe arrays and loaded JSON strings
  const selector = Array.isArray(node.target) 
    ? node.target.join(' > ') 
    : node.target;

  return `${cleanPage}|${ruleId}|${selector}`;
}

/**
 * Compute diffs between current rules and previous audit.
 * Returns a NEW set of rules and totals without mutating the input.
 */
export function diffRules(rules, resultsDir, friendlyNames = {}, prevAuditFileName = null) {
  let prevAudit = null;
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

  // Index previous audit if it exists
  if (prevAudit) {
    prevAudit.rules.forEach(rule => {
      prevRuleIds.add(rule.id);
      prevPagesByRule[rule.id] = new Set(rule.occurrences.map(o => o.page.replace(/\/$/, '')));
      
      const keys = rule.occurrences.map(o => getOccurrenceKey(o.page, rule.id, o));
      prevOccurrencesByRule[rule.id] = new Set(keys);
    });
  }

  // Use .map to create a new array of rule objects
  const processedRules = rules.map(rule => {
    const currentKeys = rule.occurrences.map(o => getOccurrenceKey(o.page, rule.id, o));
    const prevSet = prevOccurrencesByRule[rule.id] || new Set();

    const newCount = prevAudit ? [...new Set(currentKeys)].filter(x => !prevSet.has(x)).length : 0;
    const resolvedCount = prevAudit ? [...prevSet].filter(x => !new Set(currentKeys).has(x)).length : 0;
    const unchangedCount = prevAudit ? [...new Set(currentKeys)].filter(x => prevSet.has(x)).length : currentKeys.length;

    // Update the running totals (these are primitive numbers, so this is safe)
    diffTotals.newViolations += newCount;
    diffTotals.resolvedViolations += resolvedCount;
    diffTotals.unchanged += unchangedCount;

    // Detect if rule spread to new pages
    let newPages = new Set();
    if (prevAudit && prevPagesByRule[rule.id]) {
      const currentPages = new Set(rule.occurrences.map(o => o.page.replace(/\/$/, '')));
      const prevPages = prevPagesByRule[rule.id];
      newPages = new Set([...currentPages].filter(p => !prevPages.has(p)));
    }

    // Return a NEW rule object with deep-mapped occurrences
    return {
      ...rule,
      isNewRule: prevAudit ? !prevRuleIds.has(rule.id) : false,
      diff: { 
        new: newCount, 
        resolved: resolvedCount, 
        unchanged: unchangedCount,
        newPages 
      },
      occurrences: rule.occurrences.map((o, index) => {
        const key = currentKeys[index];
        return {
          ...o,
          isNewOccurrence: prevAudit ? !prevSet.has(key) : false,
          isNewPage: prevAudit ? newPages.has(o.page.replace(/\/$/, '')) : false
        };
      })
    };
  });

  // Calculate fully resolved rules
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

  // Return the new data structures
  return { rules: processedRules, diffTotals, fullyResolvedRules };
}