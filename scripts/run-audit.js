#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { runAudit } from '../lib/runAudit.js';

const URLS_FILE = 'urls-clean.txt';
const OUTPUT_DIR = './raw';

// --- Initialization & Safety Checks ---

// 1. Ensure the output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Safely loads URLs from the local text file.
 * Catches missing files or read errors to prevent raw stack traces.
 */
function getUrls() {
  try {
    if (!fs.existsSync(URLS_FILE)) {
      console.error(`❌ Error: "${URLS_FILE}" not found.`);
      console.error(`👉 Run the fetch script first to generate your target list.`);
      process.exit(1);
    }

    const content = fs.readFileSync(URLS_FILE, 'utf-8');
    const urls = content
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      console.error(`❌ Error: "${URLS_FILE}" is empty.`);
      process.exit(1);
    }

    return urls;
  } catch (err) {
    console.error(`❌ Unexpected error reading ${URLS_FILE}: ${err.message}`);
    process.exit(1);
  }
}

// --- Main Execution ---

(async () => {
  const urls = getUrls();

  try {
    const results = await runAudit(urls);

    if (results.length > 0) {
      // --- Naming Logic ---
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      
      // Get a "slug" from the first URL
      let siteSlug = 'audit';
      try {
        const urlObj = new URL(urls[0]);
        siteSlug = urlObj.hostname.replace('www.', '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      } catch (e) { /* fallback to 'audit' */ }

      const fileName = `raw-axe-results-${siteSlug}-${timestamp}.json`;
      const fullPath = path.join(OUTPUT_DIR, fileName);

      fs.writeFileSync(fullPath, JSON.stringify(results, null, 2));
      console.log(`✅ Success! Raw results archived to: ${fullPath}`);
      
    } else {
      console.error('❌ Audit completed but returned no results.');
      process.exit(1);
    }
  } catch (err) {
    // Handle errors from the audit process itself (e.g., Puppeteer crashes)
    console.error(`❌ Audit Failed: ${err.message}`);
    process.exit(1);
  }
})();