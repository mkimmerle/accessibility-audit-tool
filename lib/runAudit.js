// lib/runAudit.js
import puppeteer from 'puppeteer';
import AxePuppeteer from '@axe-core/puppeteer';

/**
 * Run accessibility audit on an array of URLs
 * @param {string[]} urls - URLs to audit
 * @param {Object} [options] - Optional parameters
 * @param {number} [options.gotoTimeout=30000] - page.goto timeout
 * @param {function} [options.onPageAudited] - callback after each page is audited
 * @returns {Promise<Array>} - array of results { url, timestamp, violations | error }
 */
export async function runAudit(urls, options = {}) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('❌ No URLs provided for audit');
  }

  const { gotoTimeout = 30000, onPageAudited } = options;

  let browser = null;
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 runAudit received ${signal}, shutting down…`);

    try {
      if (browser) {
        await browser.close();
        browser = null;
      }
    } catch (err) {
      console.error('⚠️ Error while closing browser:', err.message);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  browser = await puppeteer.launch();
  const results = [];

  try {
    for (const url of urls) {
      if (isShuttingDown) break;

      const page = await browser.newPage();

      console.log(`Auditing ${url}`);
      console.log(`__AUDIT_PAGE__ ${url}`);

      try {
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: gotoTimeout,
        });

        const axeResults = await new AxePuppeteer(page).analyze();

        const result = {
          url,
          timestamp: new Date().toISOString(),
          violations: axeResults.violations,
        };
        results.push(result);

        if (onPageAudited) onPageAudited(result);
      } catch (err) {
        console.warn(`⚠️ Failed to audit ${url}: ${err.message}`);
        results.push({
          url,
          error: err.message,
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

  if (isShuttingDown) {
    console.log('🚫 Audit aborted — no results returned');
    return [];
  }

  return results;
}
