import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import { fetchUrls } from './fetch-urls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔒 SINGLE SOURCE OF TRUTH
const RESULTS_DIR = path.resolve(process.cwd(), 'results');

const app = express();
const PORT = process.env.PORT || 1977;

// ===== Middleware =====
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ===== In-memory audit state =====
let progress = {
  status: 'idle', // idle | running | done | error
  message: '',
  files: null,
  currentPage: 0,
  totalPages: 0
};

// ===== Helper: run a script and capture JSON output =====
function runScript(scriptPath, args = [], envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...envOverrides }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;

      // 🔹 Page-count signal
      if (text.includes('__AUDIT_PAGE__')) {
        progress.currentPage += 1;
        process.stdout.write(data);
        return;
      }

      // 🔹 URL or status messages stay here
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) {
        progress.message = lines[lines.length - 1];
      }

      process.stdout.write(data);
    });

    child.stderr.on('data', data => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(data); // optional: mirror
      progress.message = text; // show errors in UI
    });

    child.on('close', code => {
      if (code !== 0) {
        return reject(new Error(stderr || `Script exited with code ${code}`));
      }

      // Only parse JSON if this is process-results.js
      if (scriptPath.includes('process-results')) {
        const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const parsed = JSON.parse(lines[i]);
            return resolve(parsed);
          } catch {}
        }
        console.error('❌ No JSON output found in process-results.js');
        console.error(stdout);
        return resolve({});
      } else {
        resolve({});
      }
    });
  });
}

// ===== Start audit =====
app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (progress.status === 'running') {
    return res.status(409).json({ error: 'Audit already running' });
  }

  progress = {
    status: 'running',
    message: 'Starting audit…',
    files: null
  };

  res.json({ status: 'started' });

  try {
    progress.message = 'Fetching sitemap…';
    await fetchUrls(url);

    const urlsFile = path.resolve(process.cwd(), 'urls-clean.txt');
    const urls = fs
      .readFileSync(urlsFile, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    progress.totalPages = urls.length;
    progress.currentPage = 0;

    progress.message = 'Running accessibility audits…';
    await runScript(path.join(__dirname, 'run-audit.js'));

    progress.message = 'Processing results…';
    const files = await runScript(path.join(__dirname, 'process-results.js'));

    progress.files = files || {};
    progress.currentPage = progress.totalPages;
    progress.status = 'done';
    progress.message = 'Audit complete!';

    // 🔍 PROOF
    console.log('RESULTS_DIR:', RESULTS_DIR);
    console.log('FILES RETURNED:', progress.files);

  } catch (err) {
    console.error(err);
    progress.status = 'error';
    progress.message = err.message || 'Unknown error';
  }
});

// ===== Poll audit status =====
app.get('/api/audit/status', (req, res) => {
  res.json(progress);
});

// ===== Serve result files =====
app.get('/api/results/:file', (req, res) => {
  const filePath = path.join(RESULTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});

// ===== Serve raw HTML output =====
app.get('/api/results/html-content/:file', (req, res) => {
  const filePath = path.join(RESULTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  res.send(html); // send raw HTML content
});


// ===== Health check =====
app.get('/health', (req, res) => {
  res.send('Server is alive');
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`✅ Audit Tool running at http://localhost:${PORT}`);
  console.log('📁 Results directory:', RESULTS_DIR);
});
