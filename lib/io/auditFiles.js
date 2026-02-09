import fs from 'fs';
import path from 'path';

/**
 * Determine the site URL from raw axe results
 */
export function getSiteUrl(rawResults) {
  if (rawResults?.site) {
    return rawResults.site;
  }

  if (Array.isArray(rawResults) && rawResults.length > 0 && rawResults[0].url) {
    const firstUrl = new URL(rawResults[0].url);
    return `${firstUrl.protocol}//${firstUrl.host}`;
  }

  return 'Unknown site';
}

/**
 * Create all audit file paths and ensure results directory exists
 */
export function createAuditFiles({ siteUrl, cwd = process.cwd() }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const siteSlug = siteUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/[^\w-]/g, '_');

  const baseName = `audit-results-${siteSlug}-${timestamp}`;
  const resultsDir = path.resolve(cwd, 'results');

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  return {
    siteSlug,
    timestamp,
    resultsDir,
    baseName,
    files: {
      html: path.join(resultsDir, `${baseName}.html`),
      csv: path.join(resultsDir, `${baseName}.csv`),
      json: path.join(resultsDir, `${baseName}.json`),
      latestJson: path.join(resultsDir, `latest-${siteSlug}.json`)
    }
  };
}

/**
 * Read the previous audit JSON if it exists
 */
export function readPreviousAudit(latestJsonPath) {
  if (!fs.existsSync(latestJsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(latestJsonPath, 'utf-8'));
  } catch (err) {
    console.warn('⚠️ Failed to read previous audit JSON:', err);
    return null;
  }
}

/**
 * Write the current audit JSON and update the "latest" pointer
 */
export function writeAuditJson({ jsonPath, latestJsonPath, data }) {
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  fs.copyFileSync(jsonPath, latestJsonPath);
}
