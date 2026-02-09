#!/usr/bin/env node
import fs from 'fs';
import { runAudit } from '../lib/runAudit.js';

const URLS_FILE = 'urls-clean.txt';
const OUTPUT_FILE = 'raw-axe-results.json';

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
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      console.log(`Raw results written to ${OUTPUT_FILE}`);
    } else {
      console.log('No results to write.');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
