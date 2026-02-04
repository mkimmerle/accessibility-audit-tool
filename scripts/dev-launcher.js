#!/usr/bin/env node
/**
 * Cross-platform dev launcher for Accessibility Audit Tool
 * - Starts the server
 * - Auto-opens the browser (tries to reuse existing tab)
 * - Handles Ctrl+C gracefully
 */

import { spawn } from 'child_process';
import open from 'open';

const SERVER_SCRIPT = 'scripts/server.js';
const SERVER_PORT = 1977;

// Spawn the server
console.log('Starting server...');
const server = spawn(process.execPath, [SERVER_SCRIPT], {
  stdio: 'inherit', // mirror server output
  env: process.env
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Ctrl+C detected, shutting down server...');
  if (!server.killed) server.kill('SIGINT');
  process.exit(0);
});

// Handle exit events
process.on('exit', () => {
  if (!server.killed) server.kill('SIGINT');
});

// Give the server a moment to start, then open browser
setTimeout(() => {
  console.log(`Opening browser at http://localhost:${SERVER_PORT}`);

  // Try to open in default browser and reuse an existing window/tab if possible
  const browserOptions = {
    wait: false, // don't block
    app: { name: getDefaultBrowser() }
  };

  open(`http://localhost:${SERVER_PORT}`, browserOptions);
}, 1000);

// Optional: forward server exit code
server.on('close', code => {
  process.exit(code);
});

// Helper: pick default browser cross-platform
function getDefaultBrowser() {
  switch (process.platform) {
    case 'darwin': return 'google chrome';
    case 'win32': return 'chrome';
    default: return 'google-chrome';
  }
}
