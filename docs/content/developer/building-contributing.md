# Building & Contributing

How to set up a development environment, build from source, run tests, and contribute to Ratspeak.

## Repository Structure

Ratspeak has two main repositories:

| Repository | Language | URL |
|------------|----------|-----|
| **ratspeak** | Python | github.com/ratspeak/ratspeak |
| **ratspeak-rs** | Rust | github.com/ratspeak/rustrat |

Both share the same frontend code (HTML/CSS/JS) and database schema.

## Building Ratspeak-py

### Prerequisites

- Python 3.11+
- pip
- git

### Setup

```bash
git clone https://github.com/ratspeak/ratspeak.git
cd ratspeak
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run

```bash
./start.sh
# Dashboard at http://localhost:5050
```

Or manually:

```bash
# Terminal 1: Start RNS daemon
rnsd --config nodes/node_1 -vv

# Terminal 2: Start dashboard
python3 dashboard/app.py
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| rns >= 0.9.1 | Reticulum mesh networking |
| lxmf >= 0.5.5 | Encrypted messaging |
| flask | Web framework |
| flask-socketio | WebSocket support |
| pyserial | Serial port access (RNode) |
| bleak | BLE device scanning |
| cryptography | Key management |

## Building Ratspeak-rs

### Prerequisites

- Rust toolchain (rustup recommended)
- git

### Setup

```bash
git clone https://github.com/ratspeak/rustrat.git
cd rustrat
```

### Build

```bash
# Build all crates (release mode)
cargo build --release

# Build specific crate
cargo build -p ratspeak-dashboard --release

# Output binaries in target/release/
#   rnsd, rnstatus, rnpath, rnid, lxmd
```

### Run

```bash
# Start RNS daemon + dashboard
./target/release/rnsd -c ./nodes/node_1 -vv &
cargo run -p ratspeak-dashboard --release
# Dashboard at http://localhost:5050
```

### Run with Tauri (desktop app)

```bash
cargo tauri dev
# Or build for release:
cargo tauri build
```

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `serial` | Enabled | Serial/KISS/RNode interface support |

Disable serial support (e.g., for CI without USB):

```bash
cargo build --no-default-features
```

### Run Tests

```bash
# All tests (over 600 unit + integration tests)
cargo test --workspace

# Specific test suite
cargo test -p raticulum-tests

# With output
cargo test -- --nocapture
```

## Building the Documentation

The documentation site (this site) is built separately:

```bash
cd ratspeak-website

# Build docs content
python3 build-docs.py

# This generates:
#   docs/js/docs-content.js    (compiled markdown)
#   docs/search-index.json     (search data)
```

### Documentation Structure

```
docs/
├── nav.json                    # Section/page navigation
├── content/                    # Markdown source files
│   ├── introduction/
│   ├── getting-started/
│   ├── using-ratspeak/
│   ├── connecting/
│   ├── hardware/
│   ├── deployment/
│   ├── understanding/
│   ├── developer/
│   └── reference/
├── js/
│   └── docs-content.js         # Built output
└── search-index.json            # Built output
```

### Adding a New Page

1. Create `docs/content/{section-slug}/{page-slug}.md`
2. Add entry to `docs/nav.json`
3. Run `python3 build-docs.py`
4. Verify in browser

### Page Template

```markdown
# Page Title

One-sentence overview of what this page covers.

## First Section

Content here.

## Second Section

More content.

## What's Next

- [Related Page](../section-slug/page-slug) — brief description
- [Another Page](../section-slug/page-slug) — brief description
```

### Conventions

- **H1 title** → overview sentence → H2 sections → "## What's Next"
- **Internal links**: `../section-slug/page-slug` (no `.md` extension)
- **Admonitions**: `> **Note**:`, `> **Warning**:`, `> **Tip**:`
- **Code blocks**: Always include language identifier (```python, ```bash, ```ini, etc.)
- **Screenshot placeholders**: `<div class="screenshot-placeholder" data-caption="...">` with descriptive caption

## Development Workflow

### Branching

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes
4. Test locally
5. Push and open a pull request

### Code Style

**Python:**
- Follow PEP 8
- Use type hints for function signatures
- Docstrings for public functions

**Rust:**
- Run `cargo fmt` before committing
- Run `cargo clippy` for lint warnings
- Follow Rust API guidelines

**JavaScript:**
- Vanilla JS, no framework
- Module pattern with clear exports
- Event-driven updates via Socket.IO

### Testing

**Python:**
```bash
# Run with verbose RNS output
rnsd --config nodes/node_1 -vvv
python3 dashboard/app.py
```

**Rust:**
```bash
# Unit + integration tests
cargo test

# With logging
RUST_LOG=debug cargo test -- --nocapture
```

### Common Development Tasks

| Task | Python | Rust |
|------|--------|------|
| Add REST endpoint | `@app.route` in `app.py` | Handler in `routes.rs` |
| Add Socket.IO event | `@socketio.on` in `app.py` | Handler in `socketio.rs` |
| Add database table | Migration in `database.py` | Migration in `db.rs` |
| Add LRGP game | Subclass `GameBase` in `lrgp.games` | Implement in `lrgp` crate |
| Add network interface | Not applicable (uses python-rns) | Implement in `rns-interface` |

## What's Next

- [Architecture Overview](../developer/architecture-overview) — system design
- [Ratspeak-py Backend](../developer/ratspeak-py) — Python implementation
- [Ratspeak-rs Backend](../developer/ratspeak-rs) — Rust implementation
