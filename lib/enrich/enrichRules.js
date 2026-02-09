/**
 * Enrich aggregated rules with friendly names, WCAG levels, and helpful resources.
 *
 * @param {Array} rules - aggregated rules from aggregateRules()
 * @param {Object} options
 * @param {Object} options.friendlyNames - mapping of rule IDs to human-readable names
 * @param {Object} options.wcagTags - mapping of tags to WCAG info ({ title, w3cURL })
 * @returns {Array} enriched rules with:
 *   - displayName
 *   - wcagLevel (A / AA / AAA / Best Practice)
 *   - resources (array of helpful links)
 *   - all original rule properties
 */

export function enrichRules(rules, { friendlyNames = {}, wcagTags = {} }) {
  const getWcagLevel = tags => {
    if (!Array.isArray(tags)) return 'Best Practice';
    if (tags.some(t => ['wcag2aaa', 'wcag21aaa', 'wcag22aaa'].includes(t))) return 'AAA';
    if (tags.some(t => ['wcag2aa', 'wcag21aa', 'wcag22aa'].includes(t))) return 'AA';
    if (tags.some(t => ['wcag2a', 'wcag21a', 'wcag22a'].includes(t))) return 'A';
    return 'Best Practice';
  };

  return rules.map(rule => {
    const wcagLevel = getWcagLevel(rule.tags);
    const displayName = friendlyNames[rule.id] || rule.id;

    const resources = [
      {
        label: 'Deque University',
        url: rule.helpUrl
      }
    ];

    if (Array.isArray(rule.tags)) {
      rule.tags.forEach(tag => {
        const wcag = wcagTags[tag];
        if (wcag?.w3cURL) {
          resources.push({
            label: wcag.title,
            url: wcag.w3cURL
          });
        }
      });
    }

    return {
      ...rule,
      displayName,
      wcagLevel,
      resources
    };
  });
}
