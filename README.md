# Ratspeak Website

Source for [ratspeak.org](https://ratspeak.org) — the public website and documentation for the Ratspeak project.

## Building Docs

After editing any markdown in `docs/content/` or `docs/nav.json`:

```bash
python3 build-docs.py
```

This regenerates `docs/js/docs-content.js`, `docs/search-index.json`, and patches the inline data in `docs.html`.

## License

This repository is dual-licensed:

- **Code** — HTML structure, CSS, JavaScript, the `api/firmware.js` edge function, `build-docs.py`, and configuration files (`vercel.json`, `site.webmanifest`, `robots.txt`, `sitemap.xml`) — is licensed under the [MIT License](LICENSE).
- **Content** — documentation in `docs/content/`, prose copy in HTML pages, and images (favicons, OG cards, web-app icons, Windows tile) — is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](LICENSE-CONTENT) (CC BY-SA 4.0).
