const form = document.getElementById('audit-form');
const urlInput = document.getElementById('site-url');
const startButton = document.getElementById('start-audit');
const progressDiv = document.getElementById('progress');
const resultsDiv = document.getElementById('results');
const downloadLinks = document.getElementById('download-links');

const historyDiv = document.getElementById('audit-history');
const historyList = document.getElementById('history-list');

let cancelButton = null;

/**
 * Frontend state mirrors server progress object
 */
let lastStatusData = {
  status: 'idle',
  message: '',
  currentPage: null,
  totalPages: null,
  files: null
};

/**
 * Animate <progress> value smoothly
 */
function animateProgressBar(progressEl, targetValue, duration = 300) {
  const startValue = parseFloat(progressEl.value) || 0;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    progressEl.value = startValue + t * (targetValue - startValue);
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/**
 * Render progress UI
 */
function renderProgress(statusData = {}) {
  const { status, message, currentPage, totalPages } = statusData;

  if (status === 'cancelled') {
    progressDiv.innerHTML = `<div id="page-counter">❌ Audit cancelled</div>`;
    return;
  }

  let counterHtml = '';
  let progressBarHtml = '';

  if (Number.isInteger(totalPages) && totalPages > 0) {
    if (status === 'done') {
      counterHtml = `<div id="page-counter" class="audit-status"><strong>Audited ${totalPages} pages</strong> <span class="complete-label">(complete)</span></div>`;
      progressBarHtml = `<progress id="audit-progress" class="audit-progress" value="${totalPages}" max="${totalPages}"></progress>`;
    } else if (Number.isInteger(currentPage)) {
      const percent = Math.round((currentPage / totalPages) * 100);
      counterHtml = `<div id="page-counter" class="audit-status">Auditing page <strong>${currentPage}</strong> of <strong>${totalPages}</strong> <span class="percent">(${percent}%)</span></div>`;
      progressBarHtml = `<progress id="audit-progress" class="audit-progress" value="${currentPage}" max="${totalPages}"></progress>`;
    }
  }

  const messageHtml = message ? `<div id="current-url" class="audit-url">${message}</div>` : '';
  progressDiv.innerHTML = `${counterHtml}${progressBarHtml}${messageHtml}`;

  const progressEl = document.getElementById('audit-progress');
  if (progressEl && Number.isInteger(currentPage)) animateProgressBar(progressEl, currentPage, 400);
}

/**
 * Start audit
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  startButton.textContent = 'Auditing...';
  startButton.disabled = true;
  showCancelButton();

  const siteUrl = urlInput.value.trim();
  if (!siteUrl) return;

  const heading = document.getElementById('results-heading');
  document.title = `Accessibility Audit for ${siteUrl}`;
  if (heading) heading.textContent = `Accessibility Audit for ${siteUrl}`;

  resultsDiv.style.display = 'none';
  downloadLinks.innerHTML = '';

  lastStatusData = { status: 'starting', message: 'Starting audit…', currentPage: 0, totalPages: 0, files: null };
  renderProgress(lastStatusData);

  try {
    const startResp = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl })
    });
    const startData = await startResp.json();
    if (startData.status !== 'started') {
      renderProgress({ status: 'error', message: 'Failed to start audit' });
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const statusResp = await fetch('/api/audit/status');
        const statusData = await statusResp.json();
        lastStatusData = statusData;
        renderProgress(statusData);

        if (['done', 'error', 'cancelled'].includes(statusData.status)) {
          clearInterval(pollInterval);
          if (statusData.status === 'done') showDownloadLinks(statusData.files);
          removeCancelButton();
          startButton.textContent = 'Start Audit';
          startButton.disabled = false;
          fetchAuditHistory(); // refresh history after each audit
        }
      } catch (err) {
        clearInterval(pollInterval);
        console.error(err);
        renderProgress({ status: 'error', message: err.message || 'Polling failed' });
      }
    }, 1500);

  } catch (err) {
    console.error(err);
    renderProgress({ status: 'error', message: err.message || 'Unexpected error' });
  }
});

/**
 * Cancel button
 */
function showCancelButton() {
  if (cancelButton) return;

  cancelButton = document.createElement('button');
  cancelButton.id = 'cancel-audit';
  cancelButton.className = 'button';
  cancelButton.textContent = 'Cancel Audit';
  cancelButton.style.marginTop = '1.5rem';
  progressDiv.insertAdjacentElement('afterend', cancelButton);

  cancelButton.addEventListener('click', async () => {
    cancelButton.disabled = true;
    try {
      await fetch('/api/audit/cancel', { method: 'POST' });
      renderProgress({ status: 'cancelled' });
    } catch (err) {
      console.error(err);
    } finally {
      removeCancelButton();
      startButton.textContent = 'Start Audit';
      startButton.disabled = false;
    }
  });
}

function removeCancelButton() {
  if (!cancelButton) return;
  cancelButton.remove();
  cancelButton = null;
}

/**
 * Show download links and embed report
 */
function showDownloadLinks(files = {}) {
  downloadLinks.innerHTML = '';
  const hasFiles = files.json || files.csv || files.html;
  if (!hasFiles) {
    renderProgress({ ...lastStatusData, message: 'Audit complete (no files found)' });
    return;
  }

  ['json', 'csv', 'html'].forEach(ext => {
    if (!files[ext]) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/api/results/${files[ext]}`;
    a.textContent = `Download ${ext.toUpperCase()}`;
    a.target = '_blank';
    li.appendChild(a);
    downloadLinks.appendChild(li);
  });

  resultsDiv.style.display = 'block';

  if (files.html) embedHtmlReport(files.html);
}

/**
 * Embed HTML report inline
 */
async function embedHtmlReport(filename) {
  try {
    const resp = await fetch(`/api/results/html-content/${filename}`);
    if (!resp.ok) throw new Error('Failed to fetch report');

    const html = await resp.text();
    let resultsContainer = document.getElementById('results');
    let container = document.getElementById('embedded-report');
    if (!container) {
      container = document.createElement('div');
      container.id = 'embedded-report';
      container.className = 'layout-container layout-container--wide';
      container.style.marginTop = '2rem';
      container.style.borderTop = '1px solid #ccc';
      container.style.paddingTop = '1rem';
      resultsDiv.appendChild(container);
    }

    container.innerHTML = html;

    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
      oldScript.remove();
    });

    container.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
      oldScript.remove();
    });

    container.querySelectorAll('meta, title, link').forEach(el => el.remove());

    const mainEl = container.querySelector('main');
    if (mainEl) {
      const div = document.createElement('div');
      div.innerHTML = mainEl.innerHTML;
      div.id = mainEl.id || ''; // preserve ID if needed
      mainEl.replaceWith(div);
    }

    const h1 = container.querySelector('h1');
    if (h1) {
      const h2 = document.createElement('h2');
      h2.innerHTML = h1.innerHTML;
      h1.replaceWith(h2);
    }

    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    const container = document.getElementById('embedded-report') || resultsDiv;
    container.innerHTML = `<p style="color:red">Failed to load embedded report: ${err.message}</p>`;
  }
}

/**
 * ===== Audit History =====
 */
async function fetchAuditHistory() {
  try {
    const resp = await fetch('/api/history');
    if (!resp.ok) throw new Error('Failed to fetch history');
    const history = await resp.json();

    // 1. Flatten all runs into a single array
    const allRuns = [];
    Object.entries(history.sites).forEach(([siteKey, siteData]) => {
      siteData.runs.forEach(run => {
        allRuns.push({
          ...run,
          // Fallback to the siteKey (domain) if run.url is missing
          displayUrl: run.url || siteKey 
        });
      });
    });

    if (!allRuns.length) {
      historyDiv.style.display = 'none';
      return;
    }

    // 2. Sort by timestamp descending (Newest first)
    allRuns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 3. Render back into the unordered list
    historyList.innerHTML = '';
    allRuns.forEach(run => {
      const li = document.createElement('li');
      li.className = 'history-item';
      
      // Clean up file paths to get just the filename for the API endpoint
      const htmlFile = run.artifacts.html ? run.artifacts.html.split('/').pop() : null;
      const csvFile = run.artifacts.csv ? run.artifacts.csv.split('/').pop() : null;
      const jsonFile = run.artifacts.json ? run.artifacts.json.split('/').pop() : null;

      li.innerHTML = `
        <strong>${run.displayUrl}</strong> — ${new Date(run.timestamp).toLocaleString()}:
        ${htmlFile ? `<a href="/api/results/${htmlFile}" target="_blank" rel="noopener">HTML</a>` : ''}
        ${csvFile ? (htmlFile ? ' | ' : '') + `<a href="/api/results/${csvFile}" target="_blank" rel="noopener">CSV</a>` : ''}
        ${jsonFile ? (htmlFile || csvFile ? ' | ' : '') + `<a href="/api/results/${jsonFile}" target="_blank" rel="noopener">JSON</a>` : ''}
      `;
      historyList.appendChild(li);
    });

    historyDiv.style.display = 'block';
  } catch (err) {
    console.error('Audit History Error:', err);
    historyDiv.style.display = 'none';
  }
}

// Fetch history on page load
fetchAuditHistory();
