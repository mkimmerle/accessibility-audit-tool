#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { runAudit } from '../lib/runAudit.js';

const URLS_FILE = 'urls-clean.txt';
const OUTPUT_DIR = './raw'; // New dedicated folder

// Ensure the directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const urls = fs.readFileSync(URLS_FILE, 'utf-8')
  .split('\n')
  .map(u => u.trim())
  .filter(Boolean);

if (urls.length === 0) {
  console.error('❌ No URLs found in urls-clean.txt');
  process.exit(1);
}

(async () => {
  try {
    const results = await runAudit(urls);
    if (results.length > 0) {
      
      // --- New Naming Logic ---
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      
      // Get a "slug" from the first URL (e.g., earthbreeze.com)
      let siteSlug = 'audit';
      try {
        const urlObj = new URL(urls[0]);
        siteSlug = urlObj.hostname.replace('www.', '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      } catch (e) { /* fallback to 'audit' */ }

      const fileName = `raw-axe-results-${siteSlug}-${timestamp}.json`;
      const fullPath = path.join(OUTPUT_DIR, fileName);
      // -------------------------

      fs.writeFileSync(fullPath, JSON.stringify(results, null, 2));
      console.log(`✅ Success! Raw results archived to: ${fullPath}`);
      
    } else {
      console.log('No results to write.');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();