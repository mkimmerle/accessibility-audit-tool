const form = document.getElementById('audit-form');
const urlInput = document.getElementById('site-url');
const startButton = document.getElementById('start-audit');
const progressDiv = document.getElementById('progress');
const resultsDiv = document.getElementById('results');
const downloadLinks = document.getElementById('download-links');

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
 * Smoothly animate <progress> value
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

  // Stick to "cancelled" if audit was cancelled
  if (status === 'cancelled') {
    progressDiv.innerHTML = `
      <div id="page-counter">
        ❌ Audit cancelled
      </div>
    `;
    return;
  }

  // Build counter and progress bar
  let counterHtml = '';
  let progressBarHtml = '';

  if (Number.isInteger(totalPages) && totalPages > 0) {
    if (status === 'done') {
      counterHtml = `
        <div id="page-counter">
          <strong>Audited ${totalPages} pages</strong>
          <span class="complete-label">(complete)</span>
        </div>
      `;
      progressBarHtml = `<progress id="audit-progress" value="${totalPages}" max="${totalPages}"></progress>`;
    } else if (Number.isInteger(currentPage)) {
      const percent = Math.round((currentPage / totalPages) * 100);
      counterHtml = `
        <div id="page-counter">
          Auditing page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>
          <span class="percent">(${percent}%)</span>
        </div>
      `;
      progressBarHtml = `<progress id="audit-progress" value="${currentPage}" max="${totalPages}"></progress>`;
    }
  }

  const messageHtml = message ? `<div id="current-url">${message}</div>` : '';

  progressDiv.innerHTML = `${counterHtml}${progressBarHtml}${messageHtml}`;

  // Animate progress bar if it exists
  const progressEl = document.getElementById('audit-progress');
  if (progressEl && Number.isInteger(currentPage)) {
    animateProgressBar(progressEl, currentPage, 400); // 400ms for smoothness
  }
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
  cancelButton.textContent = 'Cancel Audit';
  cancelButton.style.marginTop = '1.5rem';
  progressDiv.insertAdjacentElement('afterend', cancelButton);

  cancelButton.addEventListener('click', async () => {
    cancelButton.disabled = true;
    try {
      await fetch('/api/audit/cancel', { method: 'POST' });
      // Stick to "Audit cancelled"
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

    let container = document.getElementById('embedded-report');
    if (!container) {
      container = document.createElement('div');
      container.id = 'embedded-report';
      container.style.marginTop = '2rem';
      container.style.borderTop = '1px solid #ccc';
      container.style.paddingTop = '1rem';
      resultsDiv.appendChild(container);
    }

    container.innerHTML = html;

    // Downgrade <h1> to <h2>
    const h1 = container.querySelector('h1');
    if (h1) {
      const h2 = document.createElement('h2');
      h2.innerHTML = h1.innerHTML;
      h1.replaceWith(h2);
    }

    container.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    const container = document.getElementById('embedded-report') || resultsDiv;
    container.innerHTML = `<p style="color:red">Failed to load embedded report: ${err.message}</p>`;
  }
}
