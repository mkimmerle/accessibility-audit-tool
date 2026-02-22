// lib/fetchUrls.js
import axios from 'axios';
import xml2js from 'xml2js';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { isSafeUrl } from './utils/security.js';

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
 * Normalize URLs: remove hash, search, trailing slash, lowercase hostname, 
   with protocol validation to prevent non-web schemes
 */
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Breadth-First Search Crawler
 * With isSafeUrl check and better error reporting.
 */
async function crawlSiteFallback(startUrl, maxDepth = 2, maxPages = 100) {
  if (!isSafeUrl(startUrl)) {
    throw new Error(`Security Block: ${startUrl} is not a safe target for crawling.`);
  }

  console.log(`🕵️ Sitemap not found. Starting crawler (Depth: ${maxDepth}, Max: ${maxPages})...`);
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const baseUrl = new URL(startUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();

  const normalizedStart = normalizeUrl(startUrl);
  if (!normalizedStart) {
    await browser.close();
    throw new Error('Invalid start URL');
  }

  const discovered = new Set([normalizedStart]);
  const queue = [{ url: normalizedStart, depth: 0 }];
  const results = [];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    results.push(url);

    if (depth >= maxDepth) continue;

    // Create a fresh page for each hop to prevent state/cookie bleed
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(REQUEST_TIMEOUT);

    try {
      console.log(`  🔗 [Level ${depth}] Crawling: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      });

      for (const link of links) {
        const normalized = normalizeUrl(link);
        if (!normalized || !isSafeUrl(normalized)) continue;

        const linkUrl = new URL(normalized);
        const isInternal = linkUrl.hostname === baseHostname;

        if (isInternal && !discovered.has(normalized) && isLikelyHtml(normalized)) {
          discovered.add(normalized);
          queue.push({ url: normalized, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Skipping ${url}: ${err.message}`);
    } finally {
      await page.close(); // Clean up the page immediately
    }
  }

  await browser.close();
  return results;
}

/**
 * Fetch sitemap XML and parse it into a JS object
 */
export async function fetchAndParseSitemap(url) {
  if (!isSafeUrl(url)) throw new Error(`SSRF Block: Sitemap URL ${url} is unsafe.`);
  
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
  
  // 🔴 SSRF Prevention
  if (!isSafeUrl(siteUrl)) {
    throw new Error(`Security Block: ${siteUrl} is not a safe target.`);
  }

  const baseUrl = new URL(siteUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const projectRoot = process.cwd();
  const finalOutput = outputFile || path.join(projectRoot, 'urls-clean.txt');

  let collectedUrls = [];
  let useCrawler = false;

  try {
    const parsed = await fetchAndParseSitemap(sitemapUrl);
    
    if (parsed.sitemapindex?.sitemap) {
      await Promise.all(parsed.sitemapindex.sitemap.map(async (s) => {
        const loc = s.loc?.[0];
        if (!loc) return;
        try {
          const sub = await fetchAndParseSitemap(loc);
          if (sub.urlset?.url) sub.urlset.url.forEach(u => collectedUrls.push(u.loc?.[0]));
        } catch (err) {
          // 🟡 Fix: Log sub-sitemap failures instead of silent catching
          console.warn(`  ⚠️ Failed to fetch sub-sitemap: ${loc} (${err.message})`);
        }
      }));
    }

    if (parsed.urlset?.url) {
      parsed.urlset.url.forEach(u => collectedUrls.push(u.loc?.[0]));
    }

    if (collectedUrls.length === 0) useCrawler = true;
  } catch (err) {
    console.warn(`⚠️ Sitemap unavailable (${err.message}). Falling back to crawler...`);
    useCrawler = true;
  }

  if (useCrawler) {
    collectedUrls = await crawlSiteFallback(siteUrl, 2, maxUrls || 100);
  }

  const cleanedUrls = [
    ...new Set(
      collectedUrls
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(url => {
          try {
            return new URL(url).hostname === baseHostname && isSafeUrl(url);
          } catch { return false; }
        })
        .filter(isLikelyHtml)
    )
  ];

  const finalUrls = maxUrls ? cleanedUrls.slice(0, maxUrls) : cleanedUrls;
  
  // Ensure we don't proceed with 0 URLs
  if (finalUrls.length === 0) {
    throw new Error(`❌ Crawl failed: No valid URLs found for ${siteUrl}`);
  }

  await fs.writeFile(finalOutput, finalUrls.join('\n'), 'utf-8');
  console.log(`✅ Success: ${finalUrls.length} URLs ready in ${finalOutput}`);
  return finalUrls;
}