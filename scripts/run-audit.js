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

let browser = null;
let isShuttingDown = false;

/**
 * IMPORTANT:
 * - Do NOT call process.exit() here
 * - Let Node unwind naturally after cleanup
 * - This allows the parent (server.js) to exit cleanly
 */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 run-audit.js received ${signal}, shutting down…`);

  try {
    if (browser) {
      await browser.close();
      browser = null;
    }
  } catch (err) {
    console.error('⚠️ Error while closing browser:', err.message);
  }
}

// Handle Ctrl+C AND parent kill
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

browser = await puppeteer.launch();
const results = [];

try {
  for (const url of urls) {
    if (isShuttingDown) break;

    const page = await browser.newPage();

    // These logs MUST remain unchanged for your UI
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
      try {
        await page.close();
      } catch {}
    }
  }
} finally {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// 🔑 If shutdown happened, DO NOT write partial results
if (isShuttingDown) {
  console.log('🚫 Audit aborted — no results written');
  process.exit(1);
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
console.log(`Raw results written to ${OUTPUT_FILE}`);
