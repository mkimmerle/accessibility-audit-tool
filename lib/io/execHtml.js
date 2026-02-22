// lib/io/execHtml.js
import fs from 'fs';
import path from 'path';
import { getHistoryData } from './historyDiscovery.js';
import { escapeHtml } from '../utils/security.js';
import * as ExecUI from '../ui/execReportComponents.js';

export function writeExecHtml({ htmlPath, siteUrl, rawResults, rules }) {

  // 1. EMBED LOGIC: Follows saved instructions to embed CSS directly
  const projectRoot = process.cwd();
  const cssPath = path.join(projectRoot, 'frontend', 'public', 'exec-report.css');
  let cssContent = '';
  
  try {
    cssContent = fs.readFileSync(cssPath, 'utf8');
  } catch (err) {
    console.warn("⚠️ Could not find exec-report.css to embed. Report will have no styling.");
  }

  const safeUrl = escapeHtml(siteUrl);
  const auditDate = new Date().toLocaleDateString();
  const totalPages = rawResults.length;

  const weights = { critical: 10, serious: 5, moderate: 2, minor: 1 };
  const totalPenalty = rules.reduce((acc, r) => acc + (r.occurrences.length * (weights[r.impact] || 1)), 0);
  
  const rawAvgPenalty = totalPages > 0 ? totalPenalty / totalPages : 0;
  const formattedScore = rawAvgPenalty.toFixed(1);
  const numericScore = parseFloat(formattedScore);

  let grade = 'F';
  if (numericScore <= 2.0) grade = 'A';
  else if (numericScore <= 5.0) grade = 'B';
  else if (numericScore <= 15.0) grade = 'C';
  else if (numericScore <= 40.0) grade = 'D';
  else grade = 'F';

  const topPages = rawResults
    .map(p => {
      const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      p.violations.forEach(v => {
        counts[v.impact] += v.nodes.length;
      });
      const score = Object.keys(counts).reduce((acc, key) => acc + (counts[key] * weights[key]), 0);
      return { url: p.url, score, counts };
    })
    .sort((a, b) => {
      if (a.counts.critical > 0 && b.counts.critical === 0) return -1;
      if (a.counts.critical === 0 && b.counts.critical > 0) return 1;
      return b.score - a.score;
    })
    .slice(0, 5)
    .filter(p => p.score > 0);

    const siteSlug = siteUrl.replace(/^https?:\/\//, '').replace(/[^\w-]/g, '_');
    const rawDataDir = path.join(process.cwd(), 'raw');
    const history = getHistoryData(rawDataDir, siteSlug);

    const ensureEncoded = (str) => {
      if (!str) return '';
      // If it already contains &lt; or &gt;, it's likely already encoded
      if (str.includes('&lt;') || str.includes('&gt;')) {
          return str; 
      }
      return escapeHtml(str);
  };

  const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Executive Summary: ${safeUrl}</title>
    <style>
      ${cssContent}
    </style>
</head>
<body class="exec-report">
    ${ExecUI.PrintButton()}
    <main class="exec-container">
        ${ExecUI.Header(safeUrl, auditDate)}
        ${ExecUI.ScoreHero(grade, formattedScore, totalPages, totalPenalty)}

        <div class="full-width-section" style="margin-bottom: var(--space-xl);">
            ${ExecUI.TopPages(topPages)}
        </div>

        ${ExecUI.HighLevelFindings(rules, totalPages)}

        ${ExecUI.TrendChart(history)}

        <div class="exec-grid" style="margin-top: var(--space-xl);">
            ${ExecUI.ImpactSummary(rules)}
            ${ExecUI.Methodology()}
        </div>

        <footer class="report-footer">
            <p>
                <strong>Audit Methodology:</strong> This report was generated using <strong>Axe-Core</strong> automated testing.<br>
                Automated tools typically detect 30% to 50% of accessibility issues. Manual testing by certified specialists is required for comprehensive WCAG compliance verification.
            </p>
            <p>© ${new Date().getFullYear()}</p>
        </footer>
    </main>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
}