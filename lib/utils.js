import fs from 'fs';

/**
 * Safely load a JSON file if it exists; return {} if missing.
 * Exits process on parse error.
 */
export function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`❌ Failed to parse ${filePath}:`, err);
    process.exit(1);
  }
}

/**
 * Strip child elements from an HTML string, leaving only the outermost tag.
 * If input is not a string or empty, returns ''.
 */
export function stripChildren(html) {
  if (!html || typeof html !== 'string') return '';
  const match = html.match(/^<[^>]+>/);
  return match ? match[0] : html;
}

/**
 * Escape HTML special characters to safely inject into HTML.
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
