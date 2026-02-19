// lib/fetchUrls.js
import axios from 'axios';
import xml2js from 'xml2js';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer'; // Added for crawler fallback

const REQUEST_TIMEOUT = 15000;

const NON_HTML_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg',
  '.zip', '.mp4', '.mp3', '.webp', '.json'
];

const BLOCKED_PATH_FRAGMENTS = [
  '/admin',
  '/cart',
  '/checkout',
  '/account'
];

/**
 * Determines if a URL likely points to an HTML page.
 */
export function isLikelyHtml(url) {
  const lower = url.toLowerCase();
  if (NON_HTML_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (BLOCKED_PATH_FRAGMENTS.some(p => lower.includes(p))) return false;
  return true;
}

/**
 * Normalize URLs: remove hash, search, trailing slash, lowercase hostname
 */
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * NEW: Controlled Crawler
 * Crawls via BFS (Breadth-First Search) to respect depth levels.
 */
async function crawlSiteFallback(startUrl, maxDepth = 2, maxPages = 100) {
  console.log(`🕵️ Sitemap not found. Starting crawler (Depth: ${maxDepth}, Max: ${maxPages})...`);
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(REQUEST_TIMEOUT);
  const baseUrl = new URL(startUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();

  const normalizedStart = normalizeUrl(startUrl);
  if (!normalizedStart) throw new Error('Invalid start URL');

  const discovered = new Set([normalizedStart]);
  const queue = [{ url: normalizedStart, depth: 0 }];

  const results = [];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    results.push(url);

    // If we are at max depth, we don't look for more links on this page
    if (depth >= maxDepth) continue;

    try {
      console.log(`  🔗 [Level ${depth}] Crawling: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      });

      for (const link of links) {
        const normalized = normalizeUrl(link);
        if (!normalized) continue;

        const linkUrl = new URL(normalized);
        const isInternal = linkUrl.hostname === baseHostname;

        if (isInternal && !discovered.has(normalized) && isLikelyHtml(normalized)) {
          discovered.add(normalized);
          queue.push({ url: normalized, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Skipping ${url}: ${err.message}`);
    }
  }

  await browser.close();
  return results;
}

/**
 * Fetch sitemap XML and parse it into a JS object
 */
export async function fetchAndParseSitemap(url) {
  console.log(`Fetching sitemap: ${url}`);
  try {
    const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    return await xml2js.parseStringPromise(data);
  } catch (err) {
    if (err.response?.status === 404) throw new Error('404');
    throw err;
  }
}

/**
 * Main fetch function with Sitemap-to-Crawler fallback
 */
export async function fetchUrls(siteUrl, outputFile = null, maxUrls = null) {
  if (!siteUrl) throw new Error('❌ SITE_URL is required.');

  const baseUrl = new URL(siteUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const projectRoot = process.cwd();
  const finalOutput = outputFile || path.join(projectRoot, 'urls-clean.txt');

  let collectedUrls = [];
  let useCrawler = false;

  // 1. TRY SITEMAP FIRST
  try {
    const parsed = await fetchAndParseSitemap(sitemapUrl);
    
    // Handle Sitemap Index
    if (parsed.sitemapindex?.sitemap) {
      await Promise.all(parsed.sitemapindex.sitemap.map(async (s) => {
        const loc = s.loc?.[0];
        if (!loc) return;
        try {
          const sub = await fetchAndParseSitemap(loc);
          if (sub.urlset?.url) sub.urlset.url.forEach(u => collectedUrls.push(u.loc?.[0]));
        } catch {
          // Silent catch for sub-sitemaps
        }
      }));
    }
    // Handle Standard Sitemap
    if (parsed.urlset?.url) {
      parsed.urlset.url.forEach(u => collectedUrls.push(u.loc?.[0]));
    }

    if (collectedUrls.length === 0) {
      useCrawler = true;
    }
  } catch (err) {
    // CHANGE: Don't throw the error, just log and trigger the fallback
    console.warn(`⚠️ Sitemap unavailable (${err.message}). Falling back to crawler...`);
    useCrawler = true;
  }

  // 2. FALLBACK TO CRAWLER
  if (useCrawler) {
    // Passing maxUrls || 100 as the limit
    collectedUrls = await crawlSiteFallback(siteUrl, 2, maxUrls || 100);
  }

  // 3. CLEAN AND NORMALIZE
  const cleanedUrls = [
    ...new Set(
      collectedUrls
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(url => {
          try {
            return new URL(url).hostname === baseHostname;
          } catch { return false; }
        })
        .filter(isLikelyHtml)
    )
  ];

  const finalUrls = maxUrls ? cleanedUrls.slice(0, maxUrls) : cleanedUrls;
  await fs.writeFile(finalOutput, finalUrls.join('\n'), 'utf-8');

  console.log(`✅ Success: ${finalUrls.length} URLs ready in ${finalOutput}`);
  return finalUrls;
}