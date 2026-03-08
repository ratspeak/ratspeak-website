# ratspeak-website

Source for [ratspeak.org](https://ratspeak.org) — the public website and documentation for the Ratspeak project.

## Structure

```
index.html          Landing page
docs.html           Documentation viewer (SPA)
download.html       Download & web flasher
about.html          About page
docs/
  nav.json          Navigation structure (71 pages)
  content/          Markdown source files (9 sections)
  js/               Documentation JS modules
  css/              Documentation styles
build-docs.py       Rebuild docs-content.js + search-index.json from markdown
branding/           Logo assets (SVG + PNG)
```

## Building Docs

After editing any markdown in `docs/content/` or `docs/nav.json`:

```bash
python3 build-docs.py
```

This regenerates `docs/js/docs-content.js`, `docs/search-index.json`, and patches the inline data in `docs.html`.

## Deployment

Hosted on Vercel. Pushes to `main` auto-deploy.

## License

GPL-3.0
