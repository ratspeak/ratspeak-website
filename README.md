# Ratspeak Website

Source for [ratspeak.org](https://ratspeak.org) — the public website for the Ratspeak project. Live documentation is published from the separate docs portal at [docs.ratspeak.org](https://docs.ratspeak.org).

## Documentation

Do not edit or regenerate documentation in this repository. The canonical docs
live in the separate `ratspeak-docs` repository and are published to
[docs.ratspeak.org](https://docs.ratspeak.org).

The legacy embedded docs app has been removed from this repo. The public
`docs.html` page remains only as a redirect shim for old `ratspeak.org/docs.html`
links and hash routes.

## License

This repository is dual-licensed:

- **Code** — HTML structure, CSS, JavaScript, the `api/firmware.js` edge function, and configuration files (`vercel.json`, `site.webmanifest`, `robots.txt`, `sitemap.xml`) — is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
- **Content** — prose copy in HTML pages and images (favicons, OG cards, web-app icons, Windows tile) — is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](LICENSE-CONTENT) (CC BY-SA 4.0).
- **Third-party** — `lib/fonts/JetBrainsMono-Medium.ttf` (used by the generated map share image) is licensed under the [SIL Open Font License 1.1](lib/fonts/OFL.txt).
