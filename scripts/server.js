import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import { fetchUrls } from './fetch-urls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Paths =====
const RESULTS_DIR = path.resolve(process.cwd(), 'results');
const STATE_FILE = path.resolve(process.cwd(), '.audit-state.json');

// ===== App =====
const app = express();
const PORT = process.env.PORT || 1977;

// ===== Middleware =====
app.use(express.json());

// ===== In-memory audit state =====
let progress = {
  status: 'idle',
  message: '',
  files: null,
  currentPage: 0,
  totalPages: 0
};

// ===== Track running child process =====
let runningAuditProcess = null;

// ===== Persistence helpers =====
function saveProgress() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(progress, null, 2)); }
  catch (err) { console.error('❌ Failed to save audit state:', err); }
}

function loadProgress() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    progress = { ...progress, ...data };
  } catch (err) { console.error('⚠️ Failed to load persisted audit state:', err); }
}

loadProgress();

if (progress.status === 'running') {
  progress.status = 'error';
  progress.message = 'Audit interrupted by server restart';
  saveProgress();
}

// ===== Helper: run a script and capture JSON output =====
function runScript(scriptPath, args = [], envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...envOverrides }
    });

    if (scriptPath.includes('run-audit')) runningAuditProcess = child;

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;

      if (text.includes('__AUDIT_PAGE__')) {
        progress.currentPage += 1;
        saveProgress();
        process.stdout.write(data);
        return;
      }

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) {
        progress.message = lines[lines.length - 1];
        saveProgress();
      }

      process.stdout.write(data);
    });

    child.stderr.on('data', data => {
      const text = data.toString();
      stderr += text;
      progress.message = text;
      saveProgress();
      process.stderr.write(data);
    });

    child.on('close', code => {
      if (scriptPath.includes('run-audit')) runningAuditProcess = null;

      if (progress.status === 'cancelled') return reject(new Error('Audit cancelled'));
      if (code !== 0) return reject(new Error(stderr || `Script exited with code ${code}`));

      if (scriptPath.includes('process-results')) {
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try { return resolve(JSON.parse(lines[i])); } catch {}
        }
        console.error('❌ No JSON output found in process-results.js');
        console.error(stdout);
        return resolve({});
      }

      resolve({});
    });
  });
}

// ===== Start audit =====
app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try { new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  if (progress.status === 'running') return res.status(409).json({ error: 'Audit already running' });

  progress = { status: 'running', message: 'Starting audit…', files: null, currentPage: 0, totalPages: 0 };
  saveProgress();
  res.json({ status: 'started' });

  try {
    progress.message = 'Fetching sitemap…';
    saveProgress();
    await fetchUrls(url);

    const urlsFile = path.resolve(process.cwd(), 'urls-clean.txt');
    const urls = fs.readFileSync(urlsFile, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);

    progress.totalPages = urls.length;
    progress.currentPage = 0;
    saveProgress();

    progress.message = 'Running accessibility audits…';
    saveProgress();
    await runScript(path.join(__dirname, 'run-audit.js'));

    progress.message = 'Processing results…';
    saveProgress();
    const files = await runScript(path.join(__dirname, 'process-results.js'));

    progress.files = files || {};
    progress.currentPage = progress.totalPages;
    progress.status = 'done';
    progress.message = 'Audit complete!';
    saveProgress();

  } catch (err) {
    console.error(err);
    if (progress.status !== 'cancelled') {
      progress.status = 'error';
      progress.message = err.message || 'Unknown error';
      saveProgress();
    }
  }
});

// ===== Cancel audit =====
app.post('/api/audit/cancel', (req, res) => {
  if (progress.status !== 'running') return res.status(400).json({ error: 'No audit running' });
  if (runningAuditProcess) runningAuditProcess.kill('SIGINT');
  runningAuditProcess = null;

  progress.status = 'cancelled';
  progress.message = 'Audit cancelled by user';
  saveProgress();
  res.json({ status: 'cancelled' });
});

// ===== Poll status =====
app.get('/api/audit/status', async (req, res) => {
  try {
    res.json(progress);
  } catch (err) {
    // Standardize network/server errors
    res.json({
      status: 'error',
      message: 'Network error: server unavailable or stopped'
    });
  }
});

// ===== Serve results =====
app.get('/api/results/:file', (req, res) => {
  const filePath = path.join(RESULTS_DIR, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

app.get('/api/results/html-content/:file', (req, res) => {
  const filePath = path.join(RESULTS_DIR, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.send(fs.readFileSync(filePath, 'utf-8'));
});

// ===== Serve frontend =====
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.get('/health', (req, res) => res.send('Server is alive'));

// ===== Start server =====
const server = app.listen(PORT, () => {
  console.log(`✅ Audit Tool running at http://localhost:${PORT}`);
  console.log('📁 Results directory:', RESULTS_DIR);
});

// ===== Graceful shutdown =====
function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down…`);

  if (runningAuditProcess) {
    console.log('🔪 Killing running audit process');
    runningAuditProcess.kill('SIGINT');
    runningAuditProcess = null;
  }

  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.warn('⚠️ Forced shutdown');
    process.exit(1);
  }, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
