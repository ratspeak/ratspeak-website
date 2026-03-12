# Ratspeak Website

Source for [ratspeak.org](https://ratspeak.org) — the public website and documentation for the Ratspeak project.

## Building Docs

After editing any markdown in `docs/content/` or `docs/nav.json`:

```bash
python3 build-docs.py
```

This regenerates `docs/js/docs-content.js`, `docs/search-index.json`, and patches the inline data in `docs.html`.

## License

GPL-3.0
