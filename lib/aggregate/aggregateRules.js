/**
 * Aggregate Axe rules across multiple pages.
 *
 * @param {Array} rawResults - raw Axe results from multiple pages
 * @param {Object} options
 * @param {Function} options.stripChildren - function to clean HTML snippets
 * @returns {Object} { rules: aggregated rules, summary: impact summary }
 */
export function aggregateRules(rawResults, { stripChildren }) {
  const rulesMap = new Map();
  let totalOccurrencesCount = 0; 
  const totalPagesCount = rawResults.length;

  // 1. Map Severity to a numeric rank (Lower = More Urgent)
  const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

  rawResults.forEach(pageResult => {
    const pageUrl = pageResult.url;
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
  });

  // 2. Process and enrich aggregated rules
  const allRules = Array.from(rulesMap.values()).map(rule => {
    const pagesAffectedCount = rule.uniquePages.size;
    
    // Calculate Density: what % of the site is affected by this specific rule?
    const density = totalPagesCount > 0 ? (pagesAffectedCount / totalPagesCount) : 0;
    
    // Systemic Check: If it's on every single page, it's almost certainly a Header/Footer/Layout issue
    const isSystemic = totalPagesCount > 1 && pagesAffectedCount === totalPagesCount;

    return {
      ...rule,
      pagesAffected: pagesAffectedCount,
      density: parseFloat(density.toFixed(2)),
      isSystemic,
      // We keep uniquePages for the sort/summary logic but strip it in the final map
    };
  });

  // 3. Sort Rules
  allRules.sort((a, b) => {
    // Primary Sort: Impact Severity
    const rankA = IMPACT_ORDER[a.impact] ?? 99;
    const rankB = IMPACT_ORDER[b.impact] ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    // Secondary Sort: Systemic issues first (High-leverage fixes)
    if (a.isSystemic !== b.isSystemic) return a.isSystemic ? -1 : 1;

    // Tertiary Sort: Frequency (Occurrences)
    return b.occurrences.length - a.occurrences.length;
  });

  // 4. Build Summary Data
  const topN = 5;
  const topRules = allRules.slice(0, topN);

  const priorityOccurrencesCount = topRules.reduce((acc, r) => acc + r.occurrences.length, 0);
  const priorityPagesSet = new Set();
  topRules.forEach(r => {
    r.uniquePages.forEach(p => priorityPagesSet.add(p));
  });

  return {
    // Strip the Set and the extra Axe rule metadata before returning
    rules: allRules.map(({ uniquePages, nodes, ...rest }) => rest),
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