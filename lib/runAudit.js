// lib/runAudit.js
import puppeteer from 'puppeteer';
import AxePuppeteer from '@axe-core/puppeteer';

/**
 * Run accessibility audit on an array of URLs
 * @param {string[]} urls - URLs to audit
 * @param {Object} [options] - Optional parameters
 * @param {number} [options.gotoTimeout=30000] - page.goto timeout (ms)
 * @param {number} [options.analysisTimeout=30000] - axe analysis timeout (ms)
 * @param {function} [options.onPageAudited] - callback after each page is audited
 * @returns {Promise<Array>} - array of results { url, timestamp, violations | error }
 */
export async function runAudit(urls, options = {}) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('❌ No URLs provided for audit.');
  }

  const {
    gotoTimeout = 30000,
    analysisTimeout = 30000,
    onPageAudited,
  } = options;

  let browser = null;
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 runAudit received ${signal}. Shutting down gracefully…`);

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

  try {
    try {
      browser = await puppeteer.launch();
    } catch (err) {
      throw new Error(`❌ Failed to launch Puppeteer browser: ${err.message}`);
    }

    const results = [];

    for (const url of urls) {
      if (isShuttingDown) break;

      const page = await browser.newPage();

      // "Pro Settle" Enhancement: Larger viewport to trigger lazy-loaded content (e.g., BV reviews)
      await page.setViewport({ width: 1280, height: 2000 });

      console.log(`Auditing ${url}`);
      console.log(`__AUDIT_PAGE__ ${url}`);

      try {
        await page.goto(url, {
          waitUntil: 'networkidle2', 
          timeout: gotoTimeout,
        });

        // "Pro Settle" Enhancement: Wait for secondary network idle and a grace period for JS hydration
        // We wrap networkIdle in a catch because some trackers might keep the connection open indefinitely
        await Promise.all([
          page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 }).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 1500)) 
        ]);

        let timer;

        const axeResults = await Promise.race([
          new AxePuppeteer(page).analyze(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Axe analysis timed out')),
              analysisTimeout
            );
          }),
        ]).finally(() => {
          clearTimeout(timer); 
        });

        const result = {
          url,
          timestamp: new Date().toISOString(),
          violations: axeResults.violations,
        };

        results.push(result);

        if (onPageAudited) onPageAudited(result);
      } catch (err) {
        let friendlyMessage = err.message;

        if (err.name === 'TimeoutError') {
          friendlyMessage = `Navigation timed out after ${gotoTimeout}ms. The page may be slow or continuously loading.`;
        } else if (err.message.includes('Axe analysis timed out')) {
          friendlyMessage = `Axe analysis exceeded ${analysisTimeout}ms and was aborted.`;
        } else if (err.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
          friendlyMessage = 'DNS lookup failed. The domain may not exist or is unreachable.';
        } else if (err.message.includes('net::ERR_CONNECTION_REFUSED')) {
          friendlyMessage = 'Connection was refused by the server.';
        }

        console.warn(`⚠️ Failed to audit ${url}`);
        console.warn(`   Reason: ${friendlyMessage}`);

        results.push({
          url,
          error: friendlyMessage,
        });
      } finally {
        try {
          await page.close();
        } catch {
          // Ignore page close errors
        }
      }
    }

    if (isShuttingDown) {
      console.log('🚫 Audit aborted by user. Partial results discarded.');
      return [];
    }

    return results;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore close errors
      }
      browser = null;
    }

    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  }
}