# Ratspeak Website

Source for [ratspeak.org](https://ratspeak.org) — the public website for the Ratspeak project. Live documentation is published from the separate docs portal at [docs.ratspeak.org](https://docs.ratspeak.org).

## Legacy Docs Data

The old custom docs content is retained under `docs/` as archival/reference material. If you need to regenerate its embedded content/search data:

```bash
python3 build-docs.py
```

This regenerates `docs/js/docs-content.js` and `docs/search-index.json`. The public `docs.html` page is now a redirect to `https://docs.ratspeak.org/` and is not patched by this script.

## License

This repository is dual-licensed:

- **Code** — HTML structure, CSS, JavaScript, the `api/firmware.js` edge function, `build-docs.py`, and configuration files (`vercel.json`, `site.webmanifest`, `robots.txt`, `sitemap.xml`) — is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
- **Content** — documentation in `docs/content/`, prose copy in HTML pages, and images (favicons, OG cards, web-app icons, Windows tile) — is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](LICENSE-CONTENT) (CC BY-SA 4.0).
