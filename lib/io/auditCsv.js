// lib/io/auditCsv.js
import fs from 'fs';
import { Parser as Json2CsvParser } from 'json2csv';

/**
 * Writes a CSV report from enriched rules.
 * @param {Array} rules - Array of enriched rule objects
 * @param {string} csvPath - Path to output CSV file
 */
export function writeAuditCsv(rules, csvPath) {
  const csvRows = [];

  rules.forEach(rule => {
    const wcagLevel = rule.wcagLevel;
    const ruleName = rule.displayName;
    const severity = rule.impact ? rule.impact.charAt(0).toUpperCase() + rule.impact.slice(1) : 'Unknown';

    const resourcesStr = rule.resources
      .map(r => `${r.label}: ${r.url}`)
      .join(' ; ');

    rule.occurrences.forEach(o => {
      csvRows.push({
        Rule: ruleName,
        Level: wcagLevel,
        Severity: severity,
        Page: o.page,
        Element: o.html,
        Resources: resourcesStr
      });
    });
  });

  const csvParser = new Json2CsvParser({ fields: ['Rule', 'Level', 'Severity', 'Page', 'Element', 'Resources'] });
  fs.writeFileSync(csvPath, csvParser.parse(csvRows));
}
