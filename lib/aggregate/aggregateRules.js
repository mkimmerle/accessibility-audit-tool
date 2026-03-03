// lib/aggregate/aggregateRules.js

/**
 * Aggregate Axe rules across multiple pages.
 *
 * @param {Array} rawResults - raw Axe results from multiple pages
 * @param {Object} options
 * @param {Function} options.stripChildren - function to clean HTML snippets
 * @returns {Object} { rules: aggregated rules, incompleteRules: aggregated incompletes, summary: impact summary }
 */
export function aggregateRules(rawResults, { stripChildren }) {
  const rulesMap = new Map();
  const incompleteMap = new Map();
  let totalOccurrencesCount = 0; 
  const totalPagesCount = rawResults.length;

  const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

  rawResults.forEach(pageResult => {
    const pageUrl = pageResult.url;

    // =====================
    // Aggregate Violations
    // =====================
    const violations = pageResult.violations || [];
    violations.forEach(rule => {
      if (!rulesMap.has(rule.id)) {
        rulesMap.set(rule.id, {
          ...rule,
          occurrences: [],
          uniquePages: new Set()
        });
      }
      const entry = rulesMap.get(rule.id);
      entry.uniquePages.add(pageUrl);

      rule.nodes.forEach(node => {
        totalOccurrencesCount++;
        entry.occurrences.push({
          page: pageUrl,
          html: stripChildren(node.html),
          target: node.target.join(' > ')
        });
      });
    });

    // =====================
    // Aggregate Incompletes
    // =====================
    const incompletes = pageResult.incomplete || [];
    incompletes.forEach(rule => {
      if (!incompleteMap.has(rule.id)) {
        incompleteMap.set(rule.id, {
          ...rule,
          occurrences: [],
          uniquePages: new Set(),
          impact: 'incomplete'
        });
      }
      const entry = incompleteMap.get(rule.id);
      entry.uniquePages.add(pageUrl);

      rule.nodes.forEach(node => {
        entry.occurrences.push({
          page: pageUrl,
          html: stripChildren(node.html),
          target: node.target.join(' > '),
          failureSummary: node.failureSummary || null
        });
      });
    });
  });

  // =====================
  // Process Violations
  // =====================
  const allRules = Array.from(rulesMap.values()).map(rule => {
    const pagesAffectedCount = rule.uniquePages.size;
    const density = totalPagesCount > 0 ? (pagesAffectedCount / totalPagesCount) : 0;
    const isSystemic = totalPagesCount > 1 && pagesAffectedCount === totalPagesCount;

    return {
      ...rule,
      pagesAffected: pagesAffectedCount,
      density: parseFloat(density.toFixed(2)),
      isSystemic
    };
  });

  // =====================
  // Process Incompletes
  // =====================
  const allIncompletes = Array.from(incompleteMap.values()).map(rule => {
    const pagesAffectedCount = rule.uniquePages.size;
    const density = totalPagesCount > 0 ? (pagesAffectedCount / totalPagesCount) : 0;
    const isSystemic = totalPagesCount > 1 && pagesAffectedCount === totalPagesCount;

    return {
      ...rule,
      pagesAffected: pagesAffectedCount,
      density: parseFloat(density.toFixed(2)),
      isSystemic
    };
  });

  // =====================
  // Sort Violations
  // =====================
  allRules.sort((a, b) => {
    const rankA = IMPACT_ORDER[a.impact] ?? 99;
    const rankB = IMPACT_ORDER[b.impact] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    if (a.isSystemic !== b.isSystemic) return a.isSystemic ? -1 : 1;
    return b.occurrences.length - a.occurrences.length;
  });

  // =====================
  // Build Summary
  // =====================
  const topN = 5;
  const topRules = allRules.slice(0, topN);
  const priorityOccurrencesCount = topRules.reduce((acc, r) => acc + r.occurrences.length, 0);
  const priorityPagesSet = new Set();
  topRules.forEach(r => r.uniquePages.forEach(p => priorityPagesSet.add(p)));

  return {
    rules: allRules.map(({ uniquePages, nodes, ...rest }) => rest),
    incompleteRules: allIncompletes.map(({ uniquePages, nodes, ...rest }) => rest),
    summary: {
      topRulesNames: topRules.map(r => r.id),
      violationPercentage: totalOccurrencesCount > 0
        ? Math.round((priorityOccurrencesCount / totalOccurrencesCount) * 100)
        : 0,
      pagePercentage: totalPagesCount > 0
        ? Math.round((priorityPagesSet.size / totalPagesCount) * 100)
        : 0
    }
  };
}