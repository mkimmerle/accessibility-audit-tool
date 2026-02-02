const form = document.getElementById('audit-form');
const urlInput = document.getElementById('site-url');
const progressDiv = document.getElementById('progress');
const resultsDiv = document.getElementById('results');
const downloadLinks = document.getElementById('download-links');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const siteUrl = urlInput.value.trim();
  if (!siteUrl) return;
  const heading = document.getElementById('results-heading');

  document.title = `Accessibility Audit for ${siteUrl}`;
  if (heading) {
    heading.textContent = `Accessibility Audit for ${siteUrl}`;
  }

  progressDiv.textContent = 'Starting audit…';
  resultsDiv.style.display = 'none';
  downloadLinks.innerHTML = '';

  try {
    const startResp = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl })
    });

    const startData = await startResp.json();
    if (startData.status !== 'started') {
      progressDiv.textContent = 'Failed to start audit.';
      return;
    }

    const pollInterval = setInterval(async () => {
      const statusResp = await fetch('/api/audit/status');
      const statusData = await statusResp.json();

      progressDiv.textContent = `Status: ${statusData.message}`;

      if (statusData.status === 'done') {
        clearInterval(pollInterval);
        progressDiv.textContent = '✅ Audit complete!';
        showDownloadLinks(statusData.files); // 🔑 THIS IS THE FIX
      }

      if (statusData.status === 'error') {
        clearInterval(pollInterval);
        progressDiv.textContent = `❌ Error: ${statusData.message}`;
      }
    }, 1500);

  } catch (err) {
    console.error(err);
    progressDiv.textContent = `❌ Unexpected error: ${err.message}`;
  }
});

async function embedHtmlReport(filename) {
  try {
    const resp = await fetch(`/api/results/html-content/${filename}`);
    if (!resp.ok) throw new Error('Failed to fetch report');

    const html = await resp.text();

    // Create a container at the bottom
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

    // Optional: scroll to the report automatically
    container.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    const container = document.getElementById('embedded-report') || resultsDiv;
    container.innerHTML = `<p style="color:red">Failed to load embedded report: ${err.message}</p>`;
  }
}

function showDownloadLinks(files = {}) {
  downloadLinks.innerHTML = '';

  const hasFiles = files.json || files.csv || files.html;

  if (!hasFiles) {
    progressDiv.textContent = 'Audit complete! (No files found)';
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

  // 🔹 Embed HTML report inline
  if (files && files.html) {
    embedHtmlReport(files.html);
  }
}
