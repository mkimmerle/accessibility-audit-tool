#!/usr/bin/env node
import puppeteer from 'puppeteer';
import AxePuppeteer from '@axe-core/puppeteer';
import fs from 'fs';

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

const browser = await puppeteer.launch();
const results = [];

try {
  for (const url of urls) {
    const page = await browser.newPage();
    console.log(`Auditing ${url}`);
    console.log(`__AUDIT_PAGE__ ${url}`);

    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const axeResults = await new AxePuppeteer(page).analyze();

      results.push({
        url,
        timestamp: new Date().toISOString(),
        violations: axeResults.violations
      });
    } catch (err) {
      console.warn(`⚠️ Failed to audit ${url}: ${err.message}`);
      results.push({
        url,
        error: err.message
      });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
console.log(`Raw results written to ${OUTPUT_FILE}`);
