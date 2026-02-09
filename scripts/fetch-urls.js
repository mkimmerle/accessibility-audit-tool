#!/usr/bin/env node
import { fetchUrls } from '../lib/fetchUrls.js';

const siteUrl = process.argv[2] || process.env.SITE_URL;

fetchUrls(siteUrl)
  .then(urls => {
    console.log(`✅ Finished fetching ${urls.length} URLs.`);
  })
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });
