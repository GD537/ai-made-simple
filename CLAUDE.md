# CLAUDE.md — AI Made Simple

## Project Overview

**AI Made Simple** is a static educational website that explains artificial intelligence in plain, jargon-free English for non-technical audiences (especially adults 50+). It is published by "Sam Digital" and hosted via GitHub Pages at `https://gd537.github.io/ai-made-simple/`.

The site contains beginner-friendly articles, a cheat sheet, FAQ, newsletter archive, and social media content — all focused on making AI approachable for everyday users.

## Repository Structure

```
ai-made-simple/
├── index.html                  # Main homepage
├── start-here.html             # Onboarding page for new visitors
├── about.html                  # About page
├── cheatsheet.html             # AI cheat sheet / quick reference
├── faq.html                    # Frequently asked questions
├── newsletter.html             # Newsletter archive page
├── status.html                 # Site status dashboard
├── articles/                   # All educational article pages (HTML)
│   ├── index.html              # Article listing / browse page
│   ├── what-is-chatgpt.html
│   ├── chatgpt-prompts-beginners.html
│   ├── ai-email-writing.html
│   ├── ai-safety-what-to-know.html
│   ├── ai-scams-protection.html
│   ├── ai-travel-planning.html
│   ├── ai-photo-restoration.html
│   ├── ai-genealogy-family-history.html
│   ├── ai-home-garden.html
│   ├── ai-learning-languages.html
│   ├── ai-for-small-business.html
│   ├── ai-creative-writing.html
│   ├── ai-for-caregivers.html
│   ├── ai-privacy-guide.html
│   ├── ai-tools-seniors-2026.html
│   ├── ai-vs-google-search.html
│   ├── google-gemini-guide.html
│   └── 5-ways-ai-helps-daily-life.html
├── content/                    # Marketing / outreach content (Markdown)
│   ├── CONTENT_CALENDAR.md
│   ├── newsletter-issue-1.md through newsletter-issue-20.md
│   ├── twitter-posts.md
│   ├── twitter-threads-*.md    # Weekly Twitter thread batches
│   ├── linkedin-posts.md
│   ├── medium-posts.md
│   ├── quora-reddit-posts.md
│   ├── youtube-scripts.md
│   └── email-welcome-sequence.md
├── family-movies/              # Family Movie Night app (separate from the articles site)
│   ├── index.html              # App shell + inline CSS
│   ├── js/engine.js            # Recommendation logic (pure, tested)
│   ├── js/importers.js         # Netflix/Letterboxd/IMDb/CSV/zip parsing (pure, tested)
│   ├── js/services.js          # TMDB, title matching, Trakt/Jellyfin/Plex, Claude photo reading
│   ├── js/demo-data.js         # Built-in film list + demo family
│   ├── js/app.js               # UI, localStorage state, event handling
│   ├── tests/                  # node:test unit tests
│   └── README.md
├── public/                     # Alternate/private-hosted interface
│   ├── index.html              # Private-deployment landing page
│   └── tools.html              # Tools page
├── monitoring/                 # Health check outputs
│   └── health_check_*.json
├── .github/workflows/
│   └── deploy.yml              # GitHub Pages deployment workflow
├── service-worker.js           # PWA offline caching (v2.1)
├── manifest.json               # PWA manifest
├── sitemap.xml                 # SEO sitemap
├── robots.txt                  # Blocks all crawlers (private site)
├── .htaccess                   # Apache privacy headers + bot blocking
├── nginx-private.conf          # Nginx config for private deployment
├── version.json                # Version metadata (currently 2.0)
├── status.json                 # Operational status snapshot
├── implementation_plan.py      # Legacy face-swap feature roadmap (unused)
├── implementation_plan.json    # Legacy planning data (unused)
├── video_preview_handler.js    # Legacy video preview JS (unused)
├── apify_tools_analysis.json   # Legacy Apify integration data (large, unused)
├── apify_working_tools.json    # Legacy Apify tools list (unused)
├── integration_plan.json       # Legacy integration data (unused)
└── *.md                        # Various planning/reference docs at root
```

## Technology Stack

- **Frontend:** Static HTML, inline CSS, vanilla JavaScript. No build system, no framework, no bundler.
- **Fonts:** Google Fonts (Inter for UI, Merriweather for body text)
- **Hosting:** GitHub Pages (primary), with an alternate Nginx private deployment config
- **CI/CD:** GitHub Actions — single workflow (`.github/workflows/deploy.yml`) that deploys the entire repo root to GitHub Pages on push to `master`
- **PWA:** Service worker (`service-worker.js`) + web app manifest (`manifest.json`) for offline capability
- **No backend:** Entirely client-side. No server-side rendering, no database, no API calls from the site itself.

## Development Workflow

### Branching

- **`master`** is the production branch. Pushes to `master` trigger automatic GitHub Pages deployment.
- Feature branches should be created off `master` and merged back via pull request.

### Deployment

Deployment is automatic via `.github/workflows/deploy.yml`:
1. Push to `master` triggers the workflow
2. The entire repo root is uploaded as a GitHub Pages artifact
3. GitHub Pages serves the site at `https://gd537.github.io/ai-made-simple/`

There is no build step — the HTML files are served as-is.

### Adding a New Article

1. Create a new HTML file in `articles/` following the naming convention: `kebab-case-topic-name.html`
2. Use the same HTML structure as existing articles (inline CSS, consistent header/footer, responsive design)
3. Add a link to the new article in `articles/index.html`
4. Add a card entry on `index.html` if it should be featured on the homepage
5. Add the URL to `sitemap.xml`
6. Update the service worker's `CACHE_FILES` array in `service-worker.js` if the page should be available offline

### Adding Newsletter Content

Newsletter issues live in `content/newsletter-issue-N.md` (Markdown format). The newsletter archive page (`newsletter.html`) displays them.

## Key Conventions

### HTML/CSS Style

- All pages use **inline `<style>` blocks** — no external CSS files. Each page is self-contained.
- CSS custom properties (variables) are defined in `:root` for colors:
  - `--blue: #1a365d` (primary), `--blue-light: #2b6cb0`, `--orange: #ed8936` (accent/CTA), `--green: #38a169`
  - Gray scale: `--gray-50` through `--gray-800`
- Font stack: `'Inter', sans-serif` for headings/nav, `'Merriweather', serif` for article body text
- Responsive design via media queries (breakpoint at 768px)
- Card-based layouts using CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`)

### Content Tone

- Plain English, no jargon
- Target audience: non-technical adults, especially 50+
- Practical and action-oriented (e.g., "5 ways to...", "How to...")
- Safety-conscious — always include privacy/safety considerations

### File Naming

- HTML pages: `kebab-case.html`
- Content files: `kebab-case.md`
- Article slugs match the filename (e.g., `ai-email-writing.html`)

### Navigation

All main pages include a consistent `<nav>` bar linking to:
- Start Here (`start-here.html`)
- All Articles (`articles/`)
- Cheat Sheet (`cheatsheet.html`)
- FAQ (`faq.html`)
- About (`about.html`)

Articles include a back link to the homepage.

## Family Movie Night app (`family-movies/`)

A self-contained family film recommender that sits alongside the articles site. It isn't linked from the site nav or `sitemap.xml`, and it deploys with everything else when `master` is pushed. See `family-movies/README.md` for how it works.

- **Separate JS files are intended here**, unlike the rest of the site: the logic is split into files so it can be unit-tested. CSS stays inline in `index.html`.
- **Classic scripts, not ES modules**, so the page also works when opened straight from disk. Each file uses the same wrapper: `module.exports` in Node, a `window.FM*` global in the browser (`FMEngine`, `FMImport`, `FMServices`, `FMDemo`). Load order in `index.html` matters.
- **`engine.js` and `importers.js` must stay pure**: no DOM, no network. `services.js` takes an injectable `fetch` (and Anthropic SDK class) so it can be tested offline.
- **Escaping:** in `app.js`, every piece of text from people, files or APIs must go through `esc()` before reaching `innerHTML`, including attribute values.
- **Clicks** are handled by one listener that dispatches on `data-action`. Form controls use `data-change` / `data-input`, and file inputs use `data-file`.
- **State** is in localStorage: `familyMovies.state.v1` (family, history, settings), `familyMovies.movies.v1` (film cache) and `familyMovies.keys.v1` (TMDB / Anthropic / Trakt keys). Keys never go into backups.
- **Claude API:** screenshot and shelf-photo import use the official `@anthropic-ai/sdk` (pinned version, loaded from jsDelivr) with model `claude-opus-5`, `output_config.format` JSON schema, and `fallbacks: "default"` under the `server-side-fallback-2026-07-01` beta.
- **Tests:** `node --test 'family-movies/tests/*.test.js'`. The SDK request-shape test runs only when `ANTHROPIC_SDK_DIR` points at a folder with `@anthropic-ai/sdk` installed.

## Privacy Configuration

The site is configured to block search engine indexing:
- `robots.txt` disallows all crawlers
- `.htaccess` sets `X-Robots-Tag: noindex, nofollow` and blocks known bot user agents
- `nginx-private.conf` includes basic auth and bot blocking for the private deployment

## Legacy / Unused Files

The repository contains several files from a previous "face swap" feature that has been removed:
- `FACE_SWAP_IMPLEMENTATION.md`, `implementation_plan.py`, `implementation_plan.json`
- `video_preview_handler.js`
- `apify_tools_analysis.json` (22 MB — very large), `apify_working_tools.json`, `integration_plan.json`
- `manifest.json` still references face-swap features in its description and shortcuts
- `public/` directory contains an older interface from the face-swap era

These files are not part of the current educational content site and can be cleaned up.

## Root-Level Documentation Files

| File | Purpose |
|------|---------|
| `ACCOUNT_SETUP_GUIDE.md` | Account setup instructions |
| `API_REFERENCE.md` | Legacy API reference |
| `ARTICLE_SUMMARY.md` | Summary of published articles |
| `BUSINESS_PLAN.md` | Business/monetization strategy |
| `DEPLOYMENT_READY.md` | Deployment checklist and notes |
| `FINAL_SPRINT_SUMMARY.md` | Content sprint completion report |
| `QUICK_START_GUIDE.md` | Quick start for the site |
| `SEO_STRATEGY.md` | SEO strategy documentation |
| `SETUP_GUIDE.md` | Full setup guide |
| `SPRINT_COMPLETION_REPORT.md` | Sprint report with metrics |
| `SPRINT_REPORT.md` | Earlier sprint report |
| `TROUBLESHOOTING_GUIDE.md` | Troubleshooting common issues |

## Important Notes for AI Assistants

1. **No build system** — changes to HTML files take effect immediately on deploy. There is nothing to compile or bundle.
2. **Inline styles only** — do not create external CSS files. Follow the existing pattern of `<style>` blocks in each page.
3. **Self-contained pages** — each HTML file includes all its own styles and scripts. There are no shared JS/CSS imports across pages. (Exception: `family-movies/` splits its JS into files for testing; see its section above.)
4. **Audience awareness** — all content should be written for non-technical readers. Avoid technical jargon. Use clear, simple language.
5. **Privacy first** — the site is intentionally not indexed by search engines. Do not remove the privacy headers or robots.txt rules without explicit permission.
6. **Large file caution** — `apify_tools_analysis.json` is ~22 MB. Avoid reading or processing this file unnecessarily.
7. **master = production** — be careful with changes to the `master` branch as they deploy automatically.
8. **Tests only for the app** — `family-movies/` has unit tests (`node --test 'family-movies/tests/*.test.js'`). The rest of the site has no tests, linter or formatter; validate HTML manually.
9. **Google Fonts dependency** — pages load Inter and Merriweather from Google Fonts CDN. Pages will still render without them but with fallback fonts.
