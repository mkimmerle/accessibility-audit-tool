#!/usr/bin/env node
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';

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

function isLikelyHtml(url) {
  const lower = url.toLowerCase();
  if (NON_HTML_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (BLOCKED_PATH_FRAGMENTS.some(p => lower.includes(p))) return false;
  return true;
}

function normalizeUrl(rawUrl) {
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

async function fetchAndParseSitemap(url) {
  console.log(`Fetching sitemap: ${url}`);
  const { data } = await axios.get(url, { timeout: REQUEST_TIMEOUT });
  return xml2js.parseStringPromise(data);
}

export async function fetchUrls(siteUrl) {
  if (!siteUrl) {
    console.error('❌ SITE_URL is not set. Please run: SITE_URL=https://example.com npm run fetch-urls');
    process.exit(1);
  }

  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;
  const projectRoot = process.cwd();
  const outputFile = path.join(projectRoot, 'urls-clean.txt');

  let collectedUrls = [];

  let parsed;
  try {
    parsed = await fetchAndParseSitemap(sitemapUrl);
  } catch (err) {
    console.error(`❌ Failed to fetch or parse sitemap.xml at ${sitemapUrl}`);
    console.error(err.message);
    process.exit(1);
  }

  // Handle sitemap index (Shopify-style)
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
      } catch (err) {
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
    console.error('❌ No URLs found in sitemap(s)');
    process.exit(1);
  }

  const cleanedUrls = [
    ...new Set(
      collectedUrls
        .map(normalizeUrl)
        .filter(Boolean)
        .filter(isLikelyHtml)
    )
  ];

  try {
    fs.writeFileSync(outputFile, cleanedUrls.join('\n'), 'utf-8');
    console.log(`✅ Wrote ${cleanedUrls.length} URLs to ${outputFile}`);
  } catch (err) {
    console.error(`❌ Failed to write urls-clean.txt`);
    console.error(err.message);
    process.exit(1);
  }

  return cleanedUrls;
}

// Run the function immediately if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const siteUrl = process.env.SITE_URL;
  fetchUrls(siteUrl).catch(err => {
    console.error('❌ fetch-urls failed:', err);
    process.exit(1);
  });
}
