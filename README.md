# Accessibility Audit Tool

A site-wide accessibility auditor that tracks progress and highlights regressions over time.

![Accessibility Audit Tool Dashboard](https://github.com/user-attachments/assets/3e493cb0-082e-4fb2-9501-783117987d06)


Most accessibility tools give you a snapshot in time. This one gives you a timeline. It doesn't just scan your site; it tracks your progress, highlights regressions, and tells you exactly when a new bug was introduced.

No dashboards, SaaS platforms, or magic abstractions. Just a simple goal:

> **Run an accessibility audit, understand the results, and fix real problems without fighting the tooling.**

---

## Quick Start

- Clone repo
- Install dependencies (`npm install`)
- Start server (`npm run dev`)
- Open <http://localhost:1977/> in a browser
- Enter URL to test

**NOTE:** This tool currently only works on sites with a sitemap.xml file. If your site doesn't have one, consider testing against a demo site with known accessibility issues like <https://fakewinebarrel.com/>.

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
├── frontend/
│ └── public/ # Web UI files
│ ├── audit.css
│ ├── index.html
│ ├── main.css
│ └── scripts/
│ └── audit.js # Frontend JS for UI & polling
├── data/ # Data files for rule enrichment
│ │ └── axe-rules-4.11.1.json # Help and description text
│ │ └── rationales.json # "why this matters" text for each rule
├── lib/ # Shared libraries / utilities
│ ├── aggregate/
│ │ └── aggregateRules.js # Aggregate and process audit rules
│ ├── io/
│ │ ├── auditCsv.js # CSV export helpers
│ │ ├── auditFiles.js # File I/O helpers
│ │ └── auditHtml.js # HTML report helpers
│ ├── diff/
│ │ └── diffRules.js # Diff-checking logic
│ ├── enrich/
│ │ └── enrichRules.js # Rule enrichment logic
│ ├── fetchUrls.js # URL crawling helper
│ ├── runAudit.js # Wrapper for running axe-core audits
│ └── utils.js # Misc utility functions
├── scripts/ # CLI / Node helpers
│ ├── dev-launcher.js # Optional dev helper
│ ├── fetch-urls.js # Crawls pages for audit
│ ├── friendly-rule-names.json
│ ├── server.js # Express server
│ ├── run-audit.js # Runs axe-core and writes raw results
│ ├── process-results.js # Aggregates and formats results
│ └── wcag-tags.json
├── results/ # Generated output
│ ├── audit-results-*.html
│ ├── audit-results-*.csv
│ └── audit-results-*.json
├── raw-axe-results.json # Raw axe output (generated)
├── tests/
│ │ └── test-diffs.js # Test diff rules
│ ├── fixtures/
│ │ └── new.json
│ │ └── old.json
├── urls-clean.txt
├── README.md
├── ROADMAP.md
├── package.json
├── package-lock.json
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
```

**Process results**

```bash
npm run process-results
```

**Run full workflow**

```bash
npm run audit
```

---

## Output Details

### HTML Report

* Summary section at the top:
  * Pages audited
  * New issues
  * Resolved issues
  * Active rules
* Rule sections are collapsible and show per-page occurrences
* Only the offending element is displayed by default; multiple occurrences per page are summarized
* **Priority items callout** highlights the top 5 most critical or impactful violations to help focus remediation efforts
* Rule headers include:
  * **Impact level** badge (Critical → Minor)
  * **WCAG level** badge (A, AA, AAA)
  * Change indicators since last audit (new / resolved / unchanged)
* Fully resolved rules since last audit appear in a dedicated “🎉 Fully Resolved” section
* Clicking a priority item in the summary scrolls to and expands the corresponding rule in the report
* Inline embedding supported for web UI — the report HTML can be opened directly in a browser or embedded in a web page

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

Diffs are calculated at the rule and occurrence level and surfaced directly in the HTML report
and web UI. History tracking is available at both rule-level and page-level, and feeds the summary
and priority items sections, so you can see exactly which violations are new, resolved, or still active.

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
* Improved diff stability
* HTML normalization

---

## License

MIT — use it, break it, improve it, ship it.

