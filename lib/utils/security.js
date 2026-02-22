// lib/utils/security.js

/**
 * Comprehensive HTML escaping for prose and attributes.
 */
export const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

/**
 * Ensures a URL is web-safe and prevents XSS in href attributes.
 * Disallows javascript: protocols and other non-web schemes.
 */
export const sanitizeUrl = (url) => {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        // Only allow http/https
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'about:blank';
        }
        return escapeHtml(parsed.href);
    } catch (e) {
        return 'about:blank';
    }
};

/**
 * Basic SSRF check: prevents crawling local/internal network IPs.
 */
export const isSafeUrl = (url) => {
    try {
        const { hostname } = new URL(url);
        const privateIps = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;
        return !privateIps.test(hostname);
    } catch {
        return false;
    }
};