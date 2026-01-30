# Accessibility Audit Tool

A lightweight, Node‑based accessibility auditing workflow built on **axe-core**, designed to run against one or more pages and produce **human‑readable reports** you can actually work with.

This project intentionally avoids dashboards, SaaS platforms, and magic abstractions. The goal is simple:

> **Run an accessibility audit, understand the results, and fix real problems without fighting the tooling.**

---

## Features

* Uses **axe-core** for reliable WCAG checks
* Audits multiple pages per run
* Outputs results in **HTML, CSV, and JSON**
* Clear, rule‑grouped HTML report with collapsible sections
* Filenames include **site name + timestamp** for traceability
* Keeps raw axe output intact for debugging or reprocessing

---

## Project Structure

```
.
├── scripts/
│   ├── run-audit.js          # Runs axe-core and writes raw results
│   └── process-results.js    # Aggregates + formats results
├── raw-axe-results.json      # Raw axe output (generated)
├── audit-results-*.html      # Human-readable report (generated)
├── audit-results-*.csv       # Flat export for spreadsheets (generated)
├── audit-results-*.json      # Processed structured data (generated)
└── README.md
```

---

## Requirements

* Node.js **18+** (ESM required)
* npm or equivalent package manager

### Dependencies

* `axe-core`
* `playwright` or `puppeteer` (used by `run-audit.js`)
* `json2csv`

---

## Usage

### 1. Install dependencies

```bash
npm install
```

### 2. Set the site URL

The site under audit is provided via environment variable:

```bash
export SITE_URL="https://example.com"
```

(or use `.env` if you prefer)

---

### 3. Run the audit

```bash
node scripts/run-audit.js
```

This generates:

```
raw-axe-results.json
```

This file is intentionally **unprocessed** and mirrors axe-core output as closely as possible.

---

### 4. Process results

```bash
node scripts/process-results.js
```

This generates three files:

* `audit-results-<site>-<timestamp>.html`
* `audit-results-<site>-<timestamp>.csv`
* `audit-results-<site>-<timestamp>.json`

---

## Output Details

### HTML Report

* Rules grouped by axe rule ID
* Each rule section is collapsible
* Shows:

  * Impact level
  * Description
  * WCAG guidance link
  * Per‑page occurrences
* Only the **offending element** is displayed (child nodes stripped)

### CSV

* One row per violation instance
* Useful for spreadsheets, issue tracking, or bulk triage

### JSON (Processed)

* Structured, grouped representation of violations
* Ideal for automation or custom reporting

---

## Design Philosophy

* **Transparency over cleverness** – raw data is preserved
* **Semantic HTML first** – no ARIA gymnastics in the reports
* **Predictable output** – filenames encode context and time
* **Hackable** – scripts are meant to be edited, not worshipped

This tool is opinionated in favor of *understanding* accessibility issues, not just counting them.

---

## Notes & Known Issues

* Axe rules around landmarks (e.g. `<main>`, `<nav>`) can surface false positives when legacy ARIA patterns are used
* This tool does not attempt to "fix" axe results — it reports them faithfully
* Always validate findings manually, especially for structural and landmark rules

---

## Future Improvements (Ideas)

* Rule severity summaries
* Page‑level grouping toggle
* Optional screenshot capture per violation
* CI‑friendly exit codes by severity
* GUI for easier interaction

---

## License

MIT — use it, break it, improve it, ship it.

