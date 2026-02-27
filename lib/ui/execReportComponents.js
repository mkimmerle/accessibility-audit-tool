// lib/ui/execReportComponents.js
import { escapeHtml, sanitizeUrl } from '../utils/security.js';

export const Header = (siteUrl, auditDate) => `
    <header class="exec-header">
        <div class="exec-header__top">
            <h1>Executive Accessibility Summary</h1>
            <span class="exec-header__date">${escapeHtml(auditDate)}</span>
        </div>
        <p class="exec-header__url">
            Analysis for: <strong>${escapeHtml(siteUrl)}</strong>
        </p>
    </header>
`;

export const ScoreHero = (grade, score, totalPages, totalWeighted, topRule) => {
    const numericScore = parseFloat(score);
    const benchmarkAverage = 20; 
    const multiplier = (numericScore / benchmarkAverage).toFixed(1);
    
    // Logic for the percentage comparison
    const percentDiff = Math.abs(Math.round(((benchmarkAverage - numericScore) / benchmarkAverage) * 100));
    const isBetter = numericScore <= benchmarkAverage;

    // 1. Pivot the Triangulation Stat
    const benchmarkValue = isBetter ? `↓ ${percentDiff}%` : `${multiplier}x`;
    const benchmarkLabel = isBetter ? `Better than Average` : `Vs. Global Benchmark`;

    // 2. Pivot the Footer Narrative
    const comparisonText = isBetter 
        ? `Your score of ${score} is ${percentDiff}% lower than the industry average, placing this site in the top tier of accessible web properties.`
        : `At ${multiplier}x the industry average, your score of ${score} indicates significant technical debt and systemic risk relative to the global benchmark.`;

    const narratives = {
        'A': 'Optimized. Minimal technical debt; site demonstrates high automated compliance.',
        'B': 'Managed. Performance is stable; identified issues are likely isolated to specific components.',
        'C': 'Inconsistent. Notable user friction exists; standard remediation is recommended.',
        'D': 'High Systemic Risk. Material accessibility exposure detected across core user journeys.',
        'F': 'Significant Architectural Barriers. Widespread technical debt is impacting primary site functionality.'
    };

    let scoreContext = "";
    if (numericScore > 40) {
        scoreContext = `Impact density is <strong>${multiplier}x higher</strong> than the global benchmark.`;
    } else if (numericScore > 20) {
        scoreContext = `Impact density is <strong>above the benchmark average</strong>, indicating elevated risk.`;
    } else if (numericScore >= 15 && numericScore <= 20) {
        scoreContext = `Impact density is <strong>aligned with the global average</strong>; however, this average still reflects systemic industry risk.`;
    } else {
        scoreContext = `Impact density is <strong>performing ${percentDiff}% better</strong> than the benchmark average.`;
    }

    // Safe handling for topRule being null
    const topRuleName = topRule ? `${escapeHtml(topRule.displayName)}` : 'N/A';
    const topRulePercent = topRule ? `${topRule.riskReduction}%` : 'N/A';
    const topRuleText = topRule 
        ? `<p class="score-meta__leverage"><strong>Primary leverage:</strong> Fixing <strong>${topRuleName}</strong> would reduce overall accessibility risk by <strong>${topRulePercent}</strong>.</p>`
        : `<p class="score-meta__leverage"><strong>Primary leverage:</strong> No specific rule identified for top impact.</p>`;

    // ⚡ New: Next-grade improvement flag
    const gradeThresholds = [
        { grade: 'A', max: 2 },
        { grade: 'B', max: 5 },
        { grade: 'C', max: 15 },
        { grade: 'D', max: 40 },
        { grade: 'F', max: Infinity }
    ];

    // Find the next better grade (if any)
    const currentIndex = gradeThresholds.findIndex(g => g.grade === grade);
    let nextGradeText = '';
    if (currentIndex > 0) {
        const betterGrade = gradeThresholds[currentIndex - 1];
        const pointsToImprove = numericScore - betterGrade.max;
        // ONLY show if the improvement needed is between 0.1 and 5.0
        if (pointsToImprove > 0 && pointsToImprove <= 5) {
            nextGradeText = `<p class="score-meta__nextgrade">
                ⚡ Reduce average impact density by <strong>${pointsToImprove.toFixed(1)}</strong> points to reach a <strong>${betterGrade.grade}</strong> grade.
            </p>`;
        }
    }

    return `
    <section class="score-hero">
        <div class="score-hero__main">
            <div class="score-circle score-circle--${grade.toLowerCase()}">
                <span class="score-grade">${grade}</span>
                <span class="score-label">Health Grade</span>
            </div>
            <div class="score-meta">
                <h2 class="score-meta__title">Impact Density: ${score}</h2>
                <p class="score-meta__context">${scoreContext}</p>
                <p class="score-meta__narrative">${narratives[grade] || ''}</p>
                ${topRuleText}
                ${nextGradeText}
            </div>
        </div>

        <div class="score-triangulation">
            <div class="tri-metric">
                <span class="tri-value">${totalPages.toLocaleString()}</span>
                <span class="tri-label">Pages Audited</span>
            </div>
            <div class="tri-metric">
                <span class="tri-value">${totalWeighted.toLocaleString()}</span>
                <span class="tri-label">Total Weighted Violations</span>
            </div>
            <div class="tri-metric">
                <span class="tri-value">${benchmarkValue}</span>
                <span class="tri-label">${benchmarkLabel}</span>
            </div>
        </div>

        <div class="score-benchmark-footer">
            <strong>Benchmark Analysis:</strong> ${comparisonText}
            <br><br>
            Calibration is based on the <strong>WebAIM Million</strong> study, where a typical homepage averages 20 density points — illustrating the systemic risk present even at "average" levels.
        </div>
    </section>`;
};

export const TrendChart = (history) => {
    if (!history || history.length < 2) return '';

    const width = 1000;
    const height = 180;
    const paddingLeft = 40;

    const shortDate = (dateStr) => {
        try {
            if (!dateStr) return 'N/A';
            
            // If the string is just YYYY-MM-DD, add a space to prevent UTC shift
            const normalizedDate = dateStr.includes(' ') || dateStr.includes('T') 
                ? dateStr 
                : `${dateStr} 00:00:00`;

            const date = new Date(normalizedDate);
            
            if (isNaN(date.getTime())) return 'N/A';

            return new Intl.DateTimeFormat('en-US', { 
                month: 'numeric', 
                day: 'numeric', 
                year: '2-digit' 
            }).format(date);
        } catch (e) {
            return 'N/A';
        }
    };

    const historyWithDensity = history.map(h => ({
        ...h,
        density: h.pageCount > 0 ? parseFloat((h.totalPenalty / h.pageCount).toFixed(1)) : 0,
        displayDate: shortDate(h.date)
    }));

    const densities = historyWithDensity.map(h => h.density);
    // Guard for maxDensity to prevent Y-axis scale issues
    const maxDensity = Math.max(...densities, 5); 
    
    const getX = (i) => paddingLeft + (i * ((width - paddingLeft) / (historyWithDensity.length - 1)));
    const getY = (val) => height - ((val / maxDensity) * height);

    const points = historyWithDensity.map((h, i) => `${getX(i)},${getY(h.density)}`).join(' ');

    return `
    <section class="exec-card trend-card">
        <h3>Accessibility Health Trend (Impact Density)</h3>
        <p class="card-subtitle">
            Tracking the <strong>average weighted impact per page</strong>. Lower scores indicate a more accessible codebase regardless of site size.
        </p>
        <div class="trend-wrapper">
            <svg viewBox="-10 -40 ${width + 20} ${height + 80}" aria-hidden="true" class="trend-svg">
                <text x="${paddingLeft - 10}" y="${height}" text-anchor="end" alignment-baseline="middle" class="chart-label chart-label--axis">0</text>
                <text x="${paddingLeft - 10}" y="0" text-anchor="end" alignment-baseline="middle" class="chart-label chart-label--axis">${maxDensity}</text>
                
                <line x1="${paddingLeft}" y1="${height}" x2="${width}" y2="${height}" class="chart-grid-line" />
                <line x1="${paddingLeft}" y1="0" x2="${width}" y2="0" class="chart-grid-line chart-grid-line--dashed" />
                
                <polyline class="trend-line" points="${points}" />

                ${historyWithDensity.map((h, i) => {
                    const x = getX(i);
                    const y = getY(h.density);
                    
                    return `
                        <circle cx="${x}" cy="${y}" r="6" class="trend-point" />
                        <text x="${x}" y="${y - 18}" text-anchor="middle" class="chart-label chart-label--value">
                            ${h.density}
                        </text>
                        <text x="${x}" y="${height + 30}" text-anchor="middle" class="chart-label chart-label--date">
                            ${escapeHtml(h.displayDate)}
                        </text>
                    `;
                }).join('')}
            </svg>
        </div>
    </section>
    `;
};

export const ImpactSummary = (rules) => {
    const ruleCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    
    rules.forEach(r => {
        const impact = r.impact || 'minor';
        ruleCounts[impact] += 1; 
    });

    return `
        <div class="exec-card">
            <h3>Accessibility Rule Categories</h3>
            <p class="card-subtitle">This shows how many different <strong>kinds</strong> of accessibility issues were found.</p>
            <div class="impact-list">
                ${Object.entries(ruleCounts).map(([sev, count]) => `
                    <div class="impact-item impact-item--${escapeHtml(sev)}">
                        <span class="impact-label">${escapeHtml(sev.toUpperCase())}</span>
                        <span class="impact-count">${count.toLocaleString()}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
};

export const TopPages = (topPages) => `
    <section class="exec-card">
        <h3>Highest Priority Pages</h3>
        <p class="card-subtitle">
            Ranked by concentration of critical and serious barriers. Fix these first to see the largest impact on your score.
        </p>
        <div class="top-pages-list">
            ${topPages.map(p => `
                <div class="page-entry">
                    <a href="${sanitizeUrl(p.url)}" target="_blank" rel="noopener" class="page-link">${escapeHtml(p.url)}</a>
                    <div class="count-pill-group">
                        ${p.counts.critical > 0 ? `<span class="count-pill pill--critical">${p.counts.critical} Critical</span>` : ''}
                        ${p.counts.serious > 0 ? `<span class="count-pill pill--serious">${p.counts.serious} Serious</span>` : ''}
                        <span class="count-pill pill--moderate">${p.counts.moderate + p.counts.minor} Other</span>
                    </div>
                </div>
            `).join('')}
        </div>
    </section>
`;

export const Methodology = () => `
    <section class="exec-card">
        <h3>Understanding the Metrics</h3>
        <div class="methodology-grid">
            <div class="method-item">
                <h4>Scoring Logic</h4>
                <p>
                    Issues are weighted by severity: <strong>Critical (10pts)</strong>, <strong>Serious (5pts)</strong>, <strong>Moderate (2pts)</strong>, and <strong>Minor (1pt)</strong>. 
                    <strong>Impact Density</strong> represents the average penalty points per page audited.
                </p>
            </div>
            <div class="method-item">
                <h4>Grading Legend</h4>
                <ul class="grade-legend">
                    <li><span class="dot dot--a"></span> <strong>0-2 (A):</strong> Optimized</li>
                    <li><span class="dot dot--b"></span> <strong>2-5 (B):</strong> Low Risk</li>
                    <li><span class="dot dot--c"></span> <strong>5-15 (C):</strong> Notable Friction</li>
                    <li><span class="dot dot--d"></span> <strong>15-40 (D):</strong> Systemic Risk</li>
                    <li><span class="dot dot--f"></span> <strong>40+ (F):</strong> Architectural Barriers</li>
                </ul>
            </div>
        </div>
    </section>
`;

export const HighLevelFindings = (rules, totalPages) => `
    <section class="findings-section">
        <h3>Primary Compliance Risks</h3>
        <p class="card-subtitle">
            Key issues identified across the site, ranked by impact on the end-user experience.
        </p>
        <table class="findings-table">
            <thead>
                <tr>
                    <th class="col-main">Issue & Human Impact</th>
                    <th class="col-sev">Severity</th>
                    <th class="col-exp">Site Exposure</th>
                </tr>
            </thead>
            <tbody>
                ${rules.map(r => {
                    const uniquePages = new Set(r.occurrences.map(o => o.page)).size;
                    const exposure = totalPages > 0 
                        ? Math.round((uniquePages / totalPages) * 100) 
                        : 0;
                    
                    const explanation = r.rationale || r.description || "Impacts how assistive technology interprets page content.";
                    
                    return `
                        <tr>
                            <td data-label="Issue">
                                <div class="issue-name">${escapeHtml(r.displayName || r.id)}</div>
                                <div class="issue-explanation">
                                    <strong>Why this matters:</strong> ${escapeHtml(explanation)}
                                </div>
                            </td>
                            <td data-label="Severity">
                                <span class="impact-tag impact--${escapeHtml(r.impact)}">${escapeHtml(r.impact)}</span>
                            </td>
                            <td data-label="Exposure">
                                ${exposure}% of pages
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </section>
`;

export const PrintButton = () => `
    <button class="print-button" onclick="window.print()">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
        </svg>
        Save as PDF
    </button>
`;