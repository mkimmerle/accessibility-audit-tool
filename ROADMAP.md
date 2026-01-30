# Accessibility Audit Tool – Roadmap

This roadmap outlines the development plan for the Accessibility Audit Tool. The tool is designed to help developers and content teams identify and track accessibility issues across websites, with progressively more advanced features.

---

## Phase 1 – Core Audit Scripts
- Fetch URLs from a site’s sitemap (or provided URL list).
- Run automated accessibility audits using `@axe-core/puppeteer`.
- Generate structured output in JSON format.
- Aggregate violations by rule and page for easier analysis.

---

## Phase 2 – Reporting & Output
- Process raw JSON results into human-readable formats:
  - HTML report with violations grouped by rule.
  - CSV export for spreadsheet analysis.
  - Cleaned/processed JSON for programmatic use.
- Include relevant metadata:
  - Site URL
  - Pages audited
  - Rule details (impact, description, WCAG link)
- Ensure output is “sane” and easy to share with team members.
- Maintain historical tracking by timestamping output files.

---

## Phase 3 – Web-Based GUI
- Develop a standalone web interface for running audits:
  - Enter a site URL to automatically discover sitemap URLs.
  - Upload a `.txt` file of URLs to audit.
- Display results directly in the browser:
  - Violations grouped by rule.
  - Page URLs and affected elements clearly visible.
- Allow access to historical audit results stored on the server or in the repo.
- Provide export options (HTML/CSV/JSON) from the web interface.
- Focus on usability and clean design to make audits accessible to non-technical users.

---

## Phase 4 – Enhancements & Advanced Features
- Add filtering and search capabilities in reports (by page, rule, or impact).
- Provide summaries and statistics for easier decision-making.
- Optional notifications for new or recurring violations.
- Support multi-site audits with centralized result storage.
- Consider integrating automated testing pipelines for CI/CD workflows (optional).

---

## Phase 5 – Community & Collaboration
- Publish as a public/open-source project.
- Accept contributions and feature requests.
- Maintain a changelog and versioning system.
- Provide example reports and documentation for onboarding new users.
