// lib/history/historyDiscovery.js
import fs from 'fs';
import path from 'path';

const HISTORY_LIMIT = 10;
const IMPACT_WEIGHTS = { 
    critical: 10, 
    serious: 5, 
    moderate: 2, 
    minor: 1 
};

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getHistoryData(resultsDir, siteSlug) {
    if (!fs.existsSync(resultsDir)) return [];

    const coreSlug = siteSlug.replace(/^www[-_]/, '');
    const safeSlug = escapeRegExp(coreSlug);
    const fuzzyPatternString = safeSlug.replace(/[-_]/g, '[-_]');
    const filePattern = new RegExp(`${fuzzyPatternString}.*\\.json$`, 'i');

    try {
        const files = fs.readdirSync(resultsDir);

        const history = files
            .filter(f => filePattern.test(f))
            .map(f => {
                const filePath = path.join(resultsDir, f);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    const dateRaw = data.timestamp || fs.statSync(filePath).mtime.toISOString();
                    
                    let weightedTotal = 0;
                    let totalViolations = 0;
                    let pageCount = 0; // 🟢 Start at 0, not 1

                    if (Array.isArray(data)) {
                        pageCount = data.length;
                        data.forEach(page => {
                            page.violations?.forEach(v => {
                                const count = v.nodes?.length || 0;
                                const weight = IMPACT_WEIGHTS[v.impact] || 1;
                                totalViolations += count; 
                                weightedTotal += count * weight;
                            });
                        });
                    } 
                    else if (data.rules) {
                        // 🟢 Priority: Use 'pagesAudited' from our standard JSON schema
                        // Fallback: Check 'urls' array or 'pageCount' property
                        // Final Fallback: 0 (Stay honest about unknown data)
                        pageCount = data.pagesAudited || data.pageCount || (data.urls ? data.urls.length : 0);
                        
                        data.rules.forEach(r => {
                            const count = r.occurrences?.length || 0;
                            const weight = IMPACT_WEIGHTS[r.impact] || 1;
                            totalViolations += count;
                            weightedTotal += count * weight;
                        });
                    }

                    return {
                        date: dateRaw.split('T')[0],
                        violationCount: totalViolations,
                        totalPenalty: weightedTotal,
                        pageCount: pageCount,
                        timestamp: new Date(dateRaw).getTime()
                    };
                } catch (err) {
                    console.error(`⚠️ History Discovery: Skipping corrupted file "${f}":`, err.message);
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-HISTORY_LIMIT);

        return history;
    } catch (err) {
        console.error('❌ historyDiscovery Error:', err);
        return [];
    }
}