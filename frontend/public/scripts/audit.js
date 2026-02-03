const form = document.getElementById('audit-form');
const urlInput = document.getElementById('site-url');
const progressDiv = document.getElementById('progress');
const resultsDiv = document.getElementById('results');
const downloadLinks = document.getElementById('download-links');

/**
 * Single source of truth for UI state on the frontend
 * (mirrors server progress object)
 */
let lastStatusData = {
  status: 'idle',
  message: '',
  currentPage: null,
  totalPages: null,
  files: null
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const siteUrl = urlInput.value.trim();
  if (!siteUrl) return;

  const heading = document.getElementById('results-heading');
  document.title = `Accessibility Audit for ${siteUrl}`;
  if (heading) {
    heading.textContent = `Accessibility Audit for ${siteUrl}`;
  }

  // Reset UI
  resultsDiv.style.display = 'none';
  downloadLinks.innerHTML = '';

  // Initial UI state before polling starts
  lastStatusData = {
    status: 'starting',
    message: 'Starting audit…',
    currentPage: null,
    totalPages: null,
    files: null
  };
  renderProgress(lastStatusData);

  try {
    // Start audit
    const startResp = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl })
    });

    const startData = await startResp.json();
    if (startData.status !== 'started') {
      renderProgress({
        status: 'error',
        message: 'Failed to start audit'
      });
      return;
    }

    // Poll status
    const pollInterval = setInterval(async () => {
      try {
        const statusResp = await fetch('/api/audit/status');
        const statusData = await statusResp.json();

        lastStatusData = statusData;
        renderProgress(statusData);

        if (statusData.status === 'done') {
          clearInterval(pollInterval);
          renderProgress(statusData);
          showDownloadLinks(statusData.files);
        }

        if (statusData.status === 'error') {
          clearInterval(pollInterval);
          renderProgress(statusData);
        }
      } catch (err) {
        clearInterval(pollInterval);
        console.error(err);
        renderProgress({
          status: 'error',
          message: err.message || 'Polling failed'
        });
      }
    }, 1500);

  } catch (err) {
    console.error(err);
    renderProgress({
      status: 'error',
      message: err.message || 'Unexpected error'
    });
  }
});

/**
 * Renders progress UI:
 * - Page counter (if available)
 * - Current URL / status message
 */

function renderProgress(statusData = {}) {
  const {
    status,
    message,
    currentPage,
    totalPages
  } = statusData;

  let counterHtml = '';
  let progressBarHtml = '';

  if (Number.isInteger(totalPages) && totalPages > 0) {
    if (status === 'done') {
      // ✅ DONE STATE
      counterHtml = `
        <div id="page-counter">
          <strong>Audited ${totalPages} pages</strong>
          <span class="complete-label">(complete)</span>
        </div>
      `;

      progressBarHtml = `
        <progress
          id="audit-progress"
          value="${totalPages}"
          max="${totalPages}"
        ></progress>
      `;
    } else if (Number.isInteger(currentPage)) {
      // 🔄 RUNNING STATE
      const percent = Math.round((currentPage / totalPages) * 100);

      counterHtml = `
        <div id="page-counter">
          Auditing page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>
          <span class="percent">(${percent}%)</span>
        </div>
      `;

      progressBarHtml = `
        <progress
          id="audit-progress"
          value="${currentPage}"
          max="${totalPages}"
        ></progress>
      `;
    }
  }

  const messageHtml = message
    ? `<div id="current-url">${message}</div>`
    : '';

  progressDiv.innerHTML = `
    ${counterHtml}
    ${progressBarHtml}
    ${messageHtml}
  `;
}

/**
 * Fetch and embed the HTML report inline
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
    container.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    const container = document.getElementById('embedded-report') || resultsDiv;
    container.innerHTML = `<p style="color:red">Failed to load embedded report: ${err.message}</p>`;
  }
}

/**
 * Render download links and embed HTML report
 */
function showDownloadLinks(files = {}) {
  downloadLinks.innerHTML = '';

  const hasFiles = files.json || files.csv || files.html;

  if (!hasFiles) {
    renderProgress({
      ...lastStatusData,
      message: 'Audit complete (no files found)'
    });
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

  if (files.html) {
    embedHtmlReport(files.html);
  }
}
