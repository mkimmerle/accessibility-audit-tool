// lib/fetchUrls.js
import axios from 'axios';
import xml2js from 'xml2js';
import fs from 'fs';
import path from 'path';

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
 * @param {string} url
 */
export function isLikelyHtml(url) {
  const lower = url.toLowerCase();
  if (NON_HTML_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (BLOCKED_PATH_FRAGMENTS.some(p => lower.includes(p))) return false;
  return true;
}

/**
 * Normalize URLs: remove hash, search, trailing slash, lowercase hostname
 * @param {string} rawUrl
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
 * Fetch sitemap XML and parse it into a JS object
 * @param {string} url
 */
export async function fetchAndParseSitemap(url) {
  console.log(`Fetching sitemap: ${url}`);
  const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
  return xml2js.parseStringPromise(data);
}

/**
 * Fetch and clean all HTML URLs from a site's sitemap
 * @param {string} siteUrl
 * @param {string} [outputFile] Optional path to write cleaned URLs
 */
export async function fetchUrls(siteUrl, outputFile = null) {
  if (!siteUrl) {
    throw new Error('❌ SITE_URL is not set. Provide it as an argument.');
  }

  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const projectRoot = process.cwd();
  const finalOutput = outputFile || path.join(projectRoot, 'urls-clean.txt');

  let collectedUrls = [];

  let parsed;
  try {
    parsed = await fetchAndParseSitemap(sitemapUrl);
  } catch (err) {
    throw new Error(`❌ Failed to fetch or parse sitemap.xml at ${sitemapUrl}: ${err.message}`);
  }

  // Handle sitemap index
  if (parsed.sitemapindex?.sitemap) {
    for (const sitemap of parsed.sitemapindex.sitemap) {
      const loc = sitemap.loc?.[0];
      if (!loc) continue;

      try {
        const subParsed = await fetchAndParseSitemap(loc);
        if (subParsed.urlset?.url) {
          for (const urlObj of subParsed.urlset.url) {
            collectedUrls.push(urlObj.loc?.[0]);
          }
        }
      } catch {
        console.warn(`⚠️ Skipping unreachable sub-sitemap: ${loc}`);
      }
    }
  }

  // Handle single sitemap
  if (parsed.urlset?.url) {
    for (const urlObj of parsed.urlset.url) {
      collectedUrls.push(urlObj.loc?.[0]);
    }
  }

  if (collectedUrls.length === 0) {
    throw new Error('❌ No URLs found in sitemap(s)');
  }

  const cleanedUrls = [
    ...new Set(
      collectedUrls
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(isLikelyHtml)
    )
  ];

  fs.writeFileSync(finalOutput, cleanedUrls.join('\n'), 'utf-8');
  console.log(`✅ Wrote ${cleanedUrls.length} URLs to ${finalOutput}`);

  return cleanedUrls;
}
