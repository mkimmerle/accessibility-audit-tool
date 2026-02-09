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

  rawResults.forEach(pageResult => {
    const pageUrl = pageResult.url;

    (pageResult.violations || []).forEach(rule => {
      if (!rulesMap.has(rule.id)) {
        rulesMap.set(rule.id, {
          ...rule,
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

  return Array.from(rulesMap.values());
}
