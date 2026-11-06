#!/usr/bin/env python3
"""Record contact-card vectors for the web flasher's card tests.

Builds a small Rust program on rsReticulum's rns-identity: each identity's
public key, identity hash, LXMF address (lxmf.delivery) and management
destination (rsnode.manage) come from rns-identity itself, and each card is
written as Ratspeak's contact_card.rs writes RSCP1 (base64url names and keys,
lowercase hex). No hash is computed here. Requires Cargo and access to the
rsReticulum source checkout. Cargo first tries an offline build, then retries
with network access if that fails. Build files use a temporary directory; the
JSON output is overwritten. Regenerate when those sources change:

  python3 -B scripts/rsnode-card-vectors.py --reticulum-source ../rsReticulum \\
      --output tests/fixtures/rsnode-card-vectors.json
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

SOURCES = [
    "crates/rns-identity/src/identity.rs",
    "crates/rns-identity/src/destination.rs",
    "crates/rns-identity/src/name_hash.rs",
    "crates/rns-crypto/src/sha.rs",
]

CARGO_TOML = """\
[package]
name = "rsnode-card-vectors"
version = "0.0.0"
edition = "2024"
publish = false

[dependencies]
base64 = "0.22"
hex = "0.4"
rns-identity = {{ path = "{root}/crates/rns-identity" }}

[workspace]
"""

# Fixed private keys (X25519 then Ed25519 seed), so the vectors are stable.
PROGRAM = r"""
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use rns_identity::destination::Destination;
use rns_identity::identity::Identity;

fn main() {
    let cases: [(&str, u8); 3] = [("Alice Example", 0x11), ("rsNode 887A", 0x42), ("Zoë 🐀 Field kit", 0xa7)];
    let mut out = Vec::new();
    for (name, seed) in cases {
        let private: Vec<u8> = (0..64u8).map(|i| seed.wrapping_mul(31).wrapping_add(i.wrapping_mul(7))).collect();
        let identity = Identity::from_private_key(&private).expect("identity");
        let public_key = identity.get_public_key();
        let lxmf = Destination::hash_from_name_and_identity("lxmf.delivery", Some(&identity.hash));
        let manage = Destination::hash_from_name_and_identity("rsnode.manage", Some(&identity.hash));
        let card = format!(
            "RSCP1:{}:{}:{}:{}",
            B64URL.encode(name.as_bytes()),
            hex::encode(lxmf),
            hex::encode(identity.hash),
            B64URL.encode(public_key),
        );
        out.push(format!(
            "{{\"name\":{:?},\"publicKey\":\"{}\",\"identity\":\"{}\",\"lxmf\":\"{}\",\"manage\":\"{}\",\"rscp1\":{:?}}}",
            name, hex::encode(public_key), hex::encode(identity.hash), hex::encode(lxmf), hex::encode(manage), card
        ));
    }
    println!("[{}]", out.join(","));
}
"""


def build(root, scratch):
    (scratch / "src").mkdir(parents=True)
    (scratch / "Cargo.toml").write_text(CARGO_TOML.format(root=root), encoding="utf-8")
    (scratch / "src/main.rs").write_text(PROGRAM, encoding="utf-8")
    command = ["cargo", "run", "--quiet", "--manifest-path", str(scratch / "Cargo.toml")]
    result = subprocess.run([*command, "--offline"], capture_output=True, text=True)
    if result.returncode:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reticulum-source", type=Path, required=True, help="rsReticulum source checkout")
    parser.add_argument("--output", type=Path, required=True, help="JSON fixture to write or overwrite")
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    root = args.reticulum_source.resolve()
    with tempfile.TemporaryDirectory() as directory:
        identities = build(root, Path(directory) / "vectors")
    fixture = {
        "source": {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in SOURCES},
        "identities": identities,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
