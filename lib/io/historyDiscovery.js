// lib/io/historyDiscovery.js
import fs from 'fs';
import path from 'path';

export function getHistoryData(resultsDir, siteSlug) {
    const coreSlug = siteSlug.replace(/^www[-_]/, '');
    const fuzzyPatternString = coreSlug.replace(/[-_]/g, '[-_]');
    const filePattern = new RegExp(`${fuzzyPatternString}.*\\.json$`, 'i');

    if (!fs.existsSync(resultsDir)) return [];

    try {
        const files = fs.readdirSync(resultsDir);
        const weights = { critical: 10, serious: 5, moderate: 2, minor: 1 };

        const history = files
            .filter(f => filePattern.test(f))
            .map(f => {
                try {
                    const filePath = path.join(resultsDir, f);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    const dateRaw = data.timestamp || fs.statSync(filePath).mtime.toISOString();
                    
                    let weightedTotal = 0;
                    let totalViolations = 0; // The raw count for the dev report
                    let pageCount = 0;

                    // CASE 1: Raw Axe Results (Array of pages)
                    if (Array.isArray(data)) {
                        pageCount = data.length;
                        data.forEach(page => {
                            page.violations?.forEach(v => {
                                const count = v.nodes?.length || 0;
                                const weight = weights[v.impact] || 1;
                                
                                totalViolations += count; 
                                weightedTotal += count * weight;
                            });
                        });
                    } 
                    // CASE 2: Processed Results (Object with rules)
                    else if (data.rules) {
                        pageCount = data.pageCount || (data.urls ? data.urls.length : 1);
                        
                        data.rules.forEach(r => {
                            const count = r.occurrences?.length || 0;
                            const weight = weights[r.impact] || 1;

                            totalViolations += count;
                            weightedTotal += count * weight;
                        });
                    }

                    return {
                        date: dateRaw.split('T')[0],
                        violationCount: totalViolations, // This is what the chart needs
                        totalPenalty: weightedTotal,     // Keep for compatibility
                        pageCount: pageCount,
                        timestamp: new Date(dateRaw).getTime()
                    };
                } catch (err) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-10);

        return history;
    } catch (err) {
        console.error('❌ historyDiscovery Error:', err);
        return [];
    }
}