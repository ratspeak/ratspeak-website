#!/usr/bin/env python3
"""
build-docs.py — Regenerate docs-content.js and search-index.json from markdown files.

Walks docs/content/ for all .md files, generates:
  1. docs/js/docs-content.js  (PAGES object for DocsContent)
  2. docs/search-index.json   (search index for DocsSearch)

Also prints NAV_DATA and SEARCH_INDEX JSON for pasting into docs.html.
"""

import json
import os
import re
import sys

CONTENT_DIR = os.path.join(os.path.dirname(__file__), "docs", "content")
NAV_JSON = os.path.join(os.path.dirname(__file__), "docs", "nav.json")
OUTPUT_JS = os.path.join(os.path.dirname(__file__), "docs", "js", "docs-content.js")
OUTPUT_SEARCH = os.path.join(os.path.dirname(__file__), "docs", "search-index.json")


def read_nav():
    with open(NAV_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def read_markdown(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def extract_title(md_content):
    """Extract the first H1 title from markdown."""
    m = re.search(r"^#\s+(.+)$", md_content, re.MULTILINE)
    return m.group(1).strip() if m else ""


def extract_headings(md_content):
    """Extract all H2+ headings."""
    headings = []
    for m in re.finditer(r"^#{2,}\s+(.+)$", md_content, re.MULTILINE):
        headings.append(m.group(1).strip())
    return headings


def strip_markdown(md_content):
    """Strip markdown formatting for search content preview."""
    text = md_content
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    # Remove markdown headings markers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    # Remove link syntax
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove code blocks
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Remove inline code
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove images
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    # Remove horizontal rules
    text = re.sub(r"^---+$", "", text, flags=re.MULTILINE)
    # Remove table formatting
    text = re.sub(r"\|", " ", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def escape_js_string(s):
    """Escape a string for embedding in a JS string literal."""
    s = s.replace("\\", "\\\\")
    s = s.replace('"', '\\"')
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "")
    s = s.replace("\t", "\\t")
    return s


def build_docs_content_js(nav_data):
    """Generate docs-content.js from nav structure and markdown files."""
    lines = []
    lines.append('/**')
    lines.append(' * docs-content.js — All markdown content embedded inline')
    lines.append(' * Generated from docs/content/ markdown files')
    lines.append(' */')
    lines.append('(function() {')
    lines.append('    "use strict";')
    lines.append('')
    lines.append('    var PAGES = {};')
    lines.append('')

    for section in nav_data["sections"]:
        section_slug = section["slug"]
        for page in section["pages"]:
            page_slug = page["slug"]
            path = f"{section_slug}/{page_slug}"
            filepath = os.path.join(CONTENT_DIR, section_slug, f"{page_slug}.md")

            if not os.path.exists(filepath):
                print(f"  WARNING: Missing file: {filepath}", file=sys.stderr)
                continue

            content = read_markdown(filepath)
            escaped = escape_js_string(content)
            lines.append(f'    PAGES["{path}"] = "{escaped}";')
            lines.append('')

    lines.append('    window.DocsContent = {')
    lines.append('        get: function(path) { return PAGES[path] || null; },')
    lines.append('        paths: function() { return Object.keys(PAGES); }')
    lines.append('    };')
    lines.append('})();')
    lines.append('')

    return "\n".join(lines)


def build_search_index(nav_data):
    """Generate search index from nav structure and markdown files."""
    index = []

    for section in nav_data["sections"]:
        section_slug = section["slug"]
        section_title = section["title"]
        for page in section["pages"]:
            page_slug = page["slug"]
            page_title = page["title"]
            path = f"{section_slug}/{page_slug}"
            filepath = os.path.join(CONTENT_DIR, section_slug, f"{page_slug}.md")

            if not os.path.exists(filepath):
                continue

            content = read_markdown(filepath)
            headings = extract_headings(content)
            plain = strip_markdown(content)
            preview = plain[:300]

            index.append({
                "title": page_title,
                "section": section_title,
                "path": path,
                "headings": ", ".join(headings),
                "content": preview,
            })

    return index


def main():
    if not os.path.exists(CONTENT_DIR):
        print(f"ERROR: Content directory not found: {CONTENT_DIR}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(NAV_JSON):
        print(f"ERROR: nav.json not found: {NAV_JSON}", file=sys.stderr)
        sys.exit(1)

    nav_data = read_nav()

    # Generate docs-content.js
    js_content = build_docs_content_js(nav_data)
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"Generated {OUTPUT_JS} ({len(js_content):,} bytes)")

    # Generate search-index.json
    search_index = build_search_index(nav_data)
    search_json = json.dumps(search_index, indent=2, ensure_ascii=False)
    with open(OUTPUT_SEARCH, "w", encoding="utf-8") as f:
        f.write(search_json)
    print(f"Generated {OUTPUT_SEARCH} ({len(search_index)} entries)")

    # Print inline versions for docs.html
    nav_inline = json.dumps(nav_data, separators=(",", ":"), ensure_ascii=False)
    search_inline = json.dumps(search_index, ensure_ascii=False)

    print("\n--- NAV_DATA for docs.html line 119 ---")
    print(f"    var NAV_DATA = {nav_inline};")
    print("\n--- SEARCH_INDEX for docs.html line 122 ---")
    print(f"    var SEARCH_INDEX = {search_inline};")


if __name__ == "__main__":
    main()
