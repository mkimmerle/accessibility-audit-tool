# Accessibility Audit Tool

Most accessibility tools give you a snapshot in time. This one gives you a timeline. It doesn't just scan your site; it tracks your progress, highlights regressions, and tells you exactly when a new bug was introduced.

No dashboards, SaaS platforms, or magic abstractions. Just a simple goal:

> **Run an accessibility audit, understand the results, and fix real problems without fighting the tooling.**

---

## Features

- Uses **axe-core** for reliable WCAG checks
- Audits multiple pages per run
- Outputs results in **HTML, CSV, and JSON**
- Clear, rule-grouped HTML report with collapsible sections
- **Audit history with automatic diffs** between runs
- Highlights **new, resolved, and unchanged** violations
- Rule-level and page-level **change indicators**
- Filenames include **site name + timestamp** for traceability
- Keeps raw axe output intact for debugging or reprocessing
- **Inline HTML embedding** for instant results in the web UI
- Cancel audits mid-run and safely stop Puppeteer/browser processes
- Handles Ctrl+C in the terminal for graceful shutdown

---

## Project Structure

```
├── scripts/
│ ├── fetch-urls.js # Crawls pages for audit
│ ├── run-audit.js # Runs axe-core and writes raw results
│ └── process-results.js # Aggregates and formats results
├── raw-axe-results.json # Raw axe output (generated)
├── results/ # Processed output (generated)
│ ├── audit-results-.html
│ ├── audit-results-.csv
│ └── audit-results-*.json
├── frontend/public/ # Web UI files
├── dev-launcher.js # Optional dev helper to auto-open browser
└── README.md
```

---

## Requirements

- Node.js **18+** (ESM required)
- npm or equivalent package manager

### Dependencies

- `@axe-core/puppeteer`
- `puppeteer`
- `express`
- `json2csv`
- `axios`
- `xml2js`

---

## Usage

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Optionally, `dev-launcher.js` can auto-open the browser for convenience.

### 3. Run audits manually

**Fetch pages**

```bash
npm run fetch-urls
```

**Run accessibility audits**

```bash
npm run run-audit
````

**Process results**

```bash
npm run process-results
````

**Run full workflow**

```bash
npm run audit
````

---

## Output Details

### HTML Report

* Rules grouped by axe rule ID
* Each rule section is collapsible
* Shows:

  * Impact level
  * Description
  * WCAG guidance link
  * Per-page occurrences
  * **Change status since last audit (new / resolved / unchanged)**

* Rule headers include **diff indicators** when changes are detected
* Inline embedding supported for web UI
* Only the **offending element** is displayed (child nodes stripped)

### CSV

* One row per violation instance
* Useful for spreadsheets, issue tracking, or bulk triage

### JSON (Processed)

* Structured, grouped representation of violations
* Ideal for automation or custom reporting

---

## Audit History & Diffs

Each audit run is treated as a snapshot in time.

When a new audit is processed, results are automatically compared
against the **previous run for the same site**, allowing you to see:

- Which violations are **new**
- Which violations were **resolved**
- Which violations remain **unchanged**

Diffs are calculated at the rule and occurrence level and surfaced
directly in the HTML report, making regressions and improvements
immediately visible.

This makes the tool useful not just for one-off audits, but for
tracking accessibility progress over time.

---

## Design Philosophy

* **Transparency over cleverness** – raw data is preserved
* **Semantic HTML first** – no ARIA gymnastics in the reports
* **Predictable output** – filenames encode context and time
* **History-aware** – audits are meant to be compared, not forgotten
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
* Page-level grouping toggle
* Optional screenshot capture per violation
* CI-friendly exit codes by severity
* Multi-site audits with centralized storage
* Improved frontend animations

---

## License

MIT — use it, break it, improve it, ship it.

