# Accessibility Audit Tool – Roadmap

This roadmap outlines the development plan for the Accessibility Audit Tool. It focuses on progressively improving accessibility auditing for developers and content teams.

---

## Phase 1 – Core Audit Scripts

- Fetch URLs from a site’s sitemap or a provided URL list
- Run automated accessibility audits using `@axe-core/puppeteer`
- Write structured JSON output
- Aggregate violations by rule and page for analysis

---

## Phase 2 – Reporting & Output

- Process raw JSON into human-readable formats:
  - HTML report (violations grouped by rule)
  - CSV export for spreadsheets
  - Cleaned/processed JSON for programmatic use
- Include metadata:
  - Site URL
  - Pages audited
  - Rule details (impact, description, WCAG link)
- Timestamp output files for historical tracking

---

## Phase 3 – Web-Based GUI

- Standalone web interface for running audits:
  - Enter a site URL or upload a `.txt` file of URLs
- Display results directly in the browser:
  - Violations grouped by rule
  - Page URLs and affected elements clearly visible
- Access historical audit results
- Export options: HTML / CSV / JSON
- Focus on usability and clarity for non-technical users

---

## Phase 4 – Enhancements & Advanced Features

- Filtering and search in reports (by page, rule, or impact)
- Summaries and statistics for decision-making
- Optional notifications for new or recurring violations
- Support multi-site audits with centralized result storage
- Integrate automated testing pipelines for CI/CD (optional)

---

## Phase 5 – Community & Collaboration

- Publish as open-source
- Accept contributions and feature requests
- Maintain changelog and versioning
- Provide example reports and documentation for onboarding
