// lib/fetchUrls.js
import axios from 'axios';
import xml2js from 'xml2js';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { isSafeUrl } from './utils/security.js';

const REQUEST_TIMEOUT = 20000; // Increased for stability

const NON_HTML_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg',
  '.zip', '.mp4', '.mp3', '.webp', '.json'
];

const BLOCKED_PATH_FRAGMENTS = ['/admin', '/cart', '/checkout', '/account'];

export function isLikelyHtml(url) {
  const lower = url.toLowerCase();
  if (NON_HTML_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (BLOCKED_PATH_FRAGMENTS.some(p => lower.includes(p))) return false;
  return true;
}

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.search = ''; // Keeping this clean; add back if site uses query-based routing
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

async function crawlSiteFallback(startUrl, maxDepth = 2, maxPages = 100) {
  if (!isSafeUrl(startUrl)) throw new Error(`Security Block: ${startUrl} is unsafe.`);

  console.log(`🕵️ Starting deterministic crawler (Depth: ${maxDepth})...`);
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const baseUrl = new URL(startUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();
  const normalizedStart = normalizeUrl(startUrl);

  const discovered = new Set([normalizedStart]);
  const queue = [{ url: normalizedStart, depth: 0 }];
  const results = new Set(); // Use a Set to avoid duplicates during crawl

  while (queue.length > 0 && results.size < maxPages) {
    const { url, depth } = queue.shift();
    results.add(url);

    if (depth >= maxDepth) continue;

    const page = await browser.newPage();
    // Set a realistic viewport so mobile/hidden links might appear
    await page.setViewport({ width: 1280, height: 800 });

    try {
      console.log(`  🔗 [Level ${depth}] Crawling: ${url}`);
      
      // Use networkidle2 to ensure JS-rendered links are present
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: REQUEST_TIMEOUT 
      });

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href.startsWith('http'));
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
      await page.close();
    }
  }

  await browser.close();
  return Array.from(results);
}

export async function fetchAndParseSitemap(url) {
  if (!isSafeUrl(url)) throw new Error(`SSRF Block: Sitemap URL ${url} is unsafe.`);
  try {
    const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    return await xml2js.parseStringPromise(data);
  } catch (err) {
    if (err.response?.status === 404) throw new Error('404');
    throw err;
  }
}

export async function fetchUrls(siteUrl, outputFile = null, maxUrls = null) {
  if (!siteUrl) throw new Error('❌ SITE_URL is required.');
  if (!isSafeUrl(siteUrl)) throw new Error(`Security Block: ${siteUrl} is unsafe.`);

  const baseUrl = new URL(siteUrl);
  const baseHostname = baseUrl.hostname.toLowerCase();
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const projectRoot = process.cwd();
  const finalOutput = outputFile || path.join(projectRoot, 'urls-clean.txt');

  let rawUrls = [];
  let useCrawler = false;

  try {
    const parsed = await fetchAndParseSitemap(sitemapUrl);
    
    // Flatten sitemap structure into rawUrls properly
    if (parsed.sitemapindex?.sitemap) {
      const subSitemaps = parsed.sitemapindex.sitemap.map(s => s.loc?.[0]).filter(Boolean);
      for (const loc of subSitemaps) {
        try {
          const sub = await fetchAndParseSitemap(loc);
          if (sub.urlset?.url) {
            sub.urlset.url.forEach(u => rawUrls.push(u.loc?.[0]));
          }
        } catch (err) {
          console.warn(`  ⚠️ Sub-sitemap failed: ${loc}`);
        }
      }
    }

    if (parsed.urlset?.url) {
      parsed.urlset.url.forEach(u => rawUrls.push(u.loc?.[0]));
    }

    if (rawUrls.length === 0) useCrawler = true;
  } catch (err) {
    console.warn(`⚠️ Sitemap unavailable (${err.message}). Falling back to crawler...`);
    useCrawler = true;
  }

  let collected = useCrawler 
    ? await crawlSiteFallback(siteUrl, 2, maxUrls || 100)
    : rawUrls;

  // Final Cleaning & Normalization
  const cleanedUrls = [
    ...new Set(
      collected
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(url => {
          try {
            const u = new URL(url);
            return u.hostname === baseHostname && isSafeUrl(url);
          } catch { return false; }
        })
        .filter(isLikelyHtml)
    )
  ];

  const finalUrls = maxUrls ? cleanedUrls.slice(0, maxUrls) : cleanedUrls;
  
  if (finalUrls.length === 0) {
    throw new Error(`❌ No valid URLs found for ${siteUrl}`);
  }

  await fs.writeFile(finalOutput, finalUrls.join('\n'), 'utf-8');
  console.log(`✅ Success: ${finalUrls.length} URLs ready in ${finalOutput}`);
  return finalUrls;
}