/**
 * Aggregate Axe rules across multiple pages.
 *
 * @param {Array} rawResults - raw Axe results from multiple pages
 * @param {Object} options
 * @param {Function} options.stripChildren - function to clean HTML snippets
 * @returns {Array} aggregated rules with occurrences array:
 *   [{ id, impact, description, nodes..., occurrences: [{ page, html, target }] }]
 */

export function aggregateRules(rawResults, { stripChildren }) {
  const rulesMap = new Map();
  let totalViolationsCount = 0;
  const totalPagesCount = rawResults.length;

  rawResults.forEach(pageResult => {
    const pageUrl = pageResult.url;
    const violations = pageResult.violations || [];
    totalViolationsCount += violations.length;

    violations.forEach(rule => {
      if (!rulesMap.has(rule.id)) {
        rulesMap.set(rule.id, {
          ...rule,
          occurrences: [],
          uniquePages: new Set() // Track pages for the impact math
        });
      }

      const entry = rulesMap.get(rule.id);
      entry.uniquePages.add(pageUrl);

      rule.nodes.forEach(node => {
        entry.occurrences.push({
          page: pageUrl,
          html: stripChildren(node.html),
          target: node.target.join(', ')
        });
      });
    });
  });

  const allRules = Array.from(rulesMap.values());

  // --- IMPACT CALCULATION ---
  const topN = 3;
  const sortedByCount = [...allRules].sort((a, b) => b.occurrences.length - a.occurrences.length);
  const topRules = sortedByCount.slice(0, topN);

  const affectedViolations = topRules.reduce((acc, r) => acc + r.occurrences.length, 0);
  const affectedPagesSet = new Set();
  topRules.forEach(r => {
    r.uniquePages.forEach(p => affectedPagesSet.add(p));
  });

  return {
    rules: allRules.map(({ uniquePages, ...rest }) => rest), // Strip the Set before sending to UI
    summary: {
      topRulesNames: topRules.map(r => r.id),
      violationPercentage: totalViolationsCount > 0 
        ? Math.round((affectedViolations / totalViolationsCount) * 100) 
        : 0,
      pagePercentage: totalPagesCount > 0 
        ? Math.round((affectedPagesSet.size / totalPagesCount) * 100) 
        : 0
    }
  };
}
