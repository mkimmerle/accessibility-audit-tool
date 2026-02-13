// tests/test-diff.js (Improved Logic)
import { diffRules } from '../lib/diff/diffRules.js';
import fs from 'fs';
import assert from 'assert';

// Load current audit results
const currentRules = JSON.parse(
  fs.readFileSync('./tests/fixtures/new.json', 'utf-8')
).rules;

// Run diff against the old audit
const { diffTotals } = diffRules(currentRules, './tests/fixtures', {}, 'old.json');

// Define edge case scenarios
const scenarios = [
  { name: "Whitespace Stability", actual: diffTotals.unchanged, expected: 2 },
  { name: "Ghost Fix Detection", actual: diffTotals.resolvedViolations, expected: 1 },
  { name: "New Page Movement", actual: diffTotals.newViolations, expected: 2 }
];

// Print a quick overview
console.table(scenarios);

// Track failures manually so we can show all at once
const failures = [];

scenarios.forEach(s => {
  try {
    assert.strictEqual(s.actual, s.expected, `${s.name} failed: expected ${s.expected}, got ${s.actual}`);
  } catch (err) {
    failures.push(err.message);
  }
});

if (failures.length === 0) {
  console.log('\n✅ ENGINE TRUSTED: Handled whitespace, removals, and routing.');
  process.exit(0);
} else {
  console.error('\n❌ ENGINE BRITTLE: Failed edge case scenarios:');
  failures.forEach(f => console.error(' -', f));
  process.exit(1);
}
