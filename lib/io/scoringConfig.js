// lib/io/scoringConfig.js

// Calibrated against the WebAIM Million study, which reports an average
// of ~20 weighted penalty points per homepage. All grading thresholds
// are expressed as impact density scores (total penalty / pages audited).

export const BENCHMARK_AVERAGE = 20;

export const GRADE_THRESHOLDS = [
  { grade: 'A', max: 2,        label: 'Optimized',                description: 'Minimal technical debt; site demonstrates high automated compliance.' },
  { grade: 'B', max: 5,        label: 'Low Risk',                 description: 'Performance is stable; identified issues are likely isolated to specific components.' },
  { grade: 'C', max: 15,       label: 'Notable Friction',         description: 'Notable user friction exists; standard remediation is recommended.' },
  { grade: 'D', max: 40,       label: 'Systemic Risk',            description: 'Material accessibility exposure detected across core user journeys.' },
  { grade: 'F', max: Infinity, label: 'Architectural Barriers',   description: 'Widespread technical debt is impacting primary site functionality.' }
];

/**
 * Returns the grade letter for a given numeric impact density score.
 */
export function getGrade(score) {
  return GRADE_THRESHOLDS.find(t => score <= t.max)?.grade ?? 'F';
}

/**
 * Returns the full threshold config for a given grade letter.
 */
export function getThreshold(grade) {
  return GRADE_THRESHOLDS.find(t => t.grade === grade);
}