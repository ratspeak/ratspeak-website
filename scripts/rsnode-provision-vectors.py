#!/usr/bin/env python3
"""Record rsNode USB provisioning transcripts for the web flasher tests.

Runs rsNode's scripts/provision-rsnode.py against the device model in its own
tests (scripts/tests/test_provision_rsnode.py) and records every frame the
script writes and the model answers, with the script's own readings of them.
No device is touched. It also checks that the sentences the page mirrors are
still in docs/guides/ownership.md. Regenerate when any of the three changes:

  python3 -B scripts/rsnode-provision-vectors.py --rsnode-source ../rsNode \\
      --output tests/fixtures/rsnode-provision-vectors.json
"""

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
from unittest import mock

TESTS = "scripts/tests/test_provision_rsnode.py"
SCRIPT = "scripts/provision-rsnode.py"
GUIDE = "docs/guides/ownership.md"
GUIDE_SENTENCES = [
    "Owners manage a Repeater over the mesh.",
    "A node can have owners, a management key, or both.",
    "With neither, nobody updates it remotely; USB and the MANAGE window still work.",
    "Helpers read status, open windows and update.",
    "The primary changes only over USB.",
    "The node stores only public hashes: an owner's LXMF address, as Ratspeak shows it, or an identity hash.",
    "An entry matches by either name.",
    "The first enrollment creates the node's identity, so the node needs its Bluetooth or Wi-Fi radio "
    "running for entropy (a normal RNode-persona boot has one).",
    "EXIT a running Repeater first.",
    "A new primary replaces the previous one, which is removed.",
    "LAN management and updates that need it switch off with it.",
    "The changes take effect when the Repeater next starts.",
    "A lost primary needs USB.",
]

# Hashes and keys hold FEND/FESC bytes so every frame exercises KISS escaping.
PRIMARY = bytes.fromhex("c0db" + "11" * 14)
HELPER = bytes.fromhex("dbdc" + "22" * 14)
HELPER_IDENTITY = bytes.fromhex("33" * 15 + "c0")
OLD_PRIMARY = bytes.fromhex("44" * 16)
NEW_PRIMARY = bytes.fromhex("55" * 16)
DESTINATION = bytes([0xD0]) * 16
GENERATED_KEY = bytes([0xC0, 0xDB, 0xDC, 0xDD]) + bytes(range(4, 32))
FILE_KEY = bytes(range(0xC0, 0xE0))
PORT = "/dev/rsnode"
KEY_FILE = "{existing.key}"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def guide_sentences(path):
    prose = re.sub(r"\s+", " ", re.sub(r"\*\*|`", "", path.read_text(encoding="utf-8")))
    missing = [sentence for sentence in GUIDE_SENTENCES if sentence not in prose]
    if missing:
        raise SystemExit(f"{GUIDE} no longer says {missing}: update the page copy and this list")
    return GUIDE_SENTENCES


def scenarios(p):
    lxmf, identity, primary, helper = p.OWNER_KIND_LXMF, p.OWNER_KIND_IDENTITY, p.ROLE_PRIMARY, p.ROLE_HELPER
    enrolled = {"destination": DESTINATION, "owners": [(lxmf, primary, OLD_PRIMARY)]}
    provisioned = {"destination": DESTINATION,
                   "owners": [(lxmf, primary, PRIMARY), (identity, helper, HELPER_IDENTITY)]}
    full = {"destination": DESTINATION, "owners": enrolled["owners"] +
            [(lxmf, helper, bytes([index]) * 16) for index in (1, 2, 3)]}
    keyless = ["--no-psk", "--no-key"]
    return [
        ("read a fresh node", ["--read"], {}, {}),
        ("read a provisioned node", ["--read"], {"psk": b"set-already", "key": b"\x11" * 32, "floor": 7},
         provisioned),
        ("read firmware that predates owners", ["--read"], {"owners_supported": False}, {}),
        ("enroll the primary by LXMF address without a key", [*keyless, "--owner", f"<{PRIMARY.hex()}>"], {}, {}),
        ("enroll the primary by identity hash with a generated key",
         ["--no-psk", "--owner-identity", PRIMARY.hex().upper()], {}, {}),
        ("enroll the primary with an existing key file",
         ["--no-psk", "--management-key", KEY_FILE, "--owner", PRIMARY.hex()], {}, {}),
        ("enroll the primary and helpers", [*keyless, "--owner", PRIMARY.hex(), "--helper", HELPER.hex(),
                                            "--helper-identity", HELPER_IDENTITY.hex()], {}, {}),
        ("a new primary replaces the previous one", [*keyless, "--owner", NEW_PRIMARY.hex()], {}, enrolled),
        ("remove the primary, clear the key and enroll a new primary",
         ["--no-psk", "--clear-key", "--remove-owner", OLD_PRIMARY.hex(), "--owner", NEW_PRIMARY.hex()],
         {"key": b"\x33" * 32}, enrolled),
        ("remove a helper", [*keyless, "--remove-owner", HELPER_IDENTITY.hex()], {}, provisioned),
        ("remove every owner", [*keyless, "--remove-owner", HELPER_IDENTITY.hex(), "--remove-owner", PRIMARY.hex()],
         {}, provisioned),
        ("generate a key without owners", ["--no-psk"], {}, {}),
        ("clear the key", ["--no-psk", "--clear-key"], {"key": b"\x22" * 32}, {}),
        ("set a key on firmware that predates owners", ["--no-psk"], {"owners_supported": False}, {}),
        ("enrollment without entropy", [*keyless, "--owner", PRIMARY.hex()], {"entropy": False}, {}),
        ("remove an owner that is not enrolled", [*keyless, "--remove-owner", NEW_PRIMARY.hex()], {}, {}),
        ("enroll on firmware that predates owners", [*keyless, "--owner", PRIMARY.hex()],
         {"owners_supported": False}, {}),
        ("enroll a helper into a full owner table", [*keyless, "--helper", HELPER.hex()], {}, full),
    ]


def as_json(value):
    if isinstance(value, bytes):
        return value.hex()
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [as_json(item) for item in value]
    return {re.sub(r"_(\w)", lambda m: m.group(1).upper(), key): as_json(item)
            for key, item in vars(value).items()}


def reading(p, payload):
    """The script's reading of a reply payload: its value or its error."""
    parse = p.parse_node_status if payload[:1] == bytes([p.TRANSPORT_CFG_READ_NODE]) else p.parse_management_status
    try:
        value = parse(payload)
    except ValueError as error:
        return {"error": str(error)}
    if isinstance(value, p.NodeStatus):
        return {"value": as_json(value), "lines": p.render_node(value)}
    return {"value": as_json(value), "line": p.render_status(value)}


def options(p, argv):
    """The parsed command line, as the page's form supplies it."""
    args = p.build_parser().parse_args(["--port", PORT, *argv])
    hashed = lambda value: p.parse_hash(value).hex() if value is not None else None
    return {
        "read": args.read,
        "managementKey": p.read_key_file(args.management_key).hex() if args.management_key else None,
        "noKey": args.no_key,
        "clearKey": args.clear_key,
        "owner": hashed(args.owner),
        "ownerIdentity": hashed(args.owner_identity),
        "helper": [hashed(value) for value in args.helper],
        "helperIdentity": [hashed(value) for value in args.helper_identity],
        "removeOwner": [hashed(value) for value in args.remove_owner],
    }


def run_scenario(model, scratch, name, argv, device_args, preset):
    p = model.provision
    key_file = scratch / "existing.key"
    if not key_file.exists():
        model.rsnode_keys.write_owner_only_key_file(key_file, FILE_KEY)
    argv_used = [str(key_file) if value == KEY_FILE else value for value in argv]
    device = model.FakeDevice(**device_args)
    device.destination = preset.get("destination")
    device.owners = list(preset.get("owners", []))
    transcript, replies = [], []
    write, reply = device.write, device._reply

    def record_write(data):
        transcript.append({"host": bytes(data).hex()})
        return write(data)

    def record_reply(command, payload):
        transcript.append({"device": p.encode(command, payload).hex()})
        replies.append((len(transcript) - 1, command, bytes(payload)))
        reply(command, payload)

    device.write, device._reply = record_write, record_reply
    key_dir = scratch / re.sub(r"\W+", "-", name)
    stdout, stderr = io.StringIO(), io.StringIO()
    with mock.patch.object(p, "open_esp_serial", return_value=device), \
            mock.patch.object(p, "DEFAULT_KEY_DIR", key_dir), \
            mock.patch.object(p, "generate_management_key", return_value=GENERATED_KEY), \
            contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = p.main(["--port", PORT, "--timeout", "2", *argv_used])
    written = sorted(key_dir.glob("*.key")) if key_dir.exists() else []
    scenario = {
        "name": name,
        "argv": argv,
        "options": options(p, argv_used),
        "transcript": transcript,
        "exitCode": code,
        "stdout": [re.sub(rf"(?:/private)?{re.escape(str(scratch))}", "{scratch}", line)
                   for line in stdout.getvalue().splitlines()],
        "stderr": stderr.getvalue().strip(),
        "keyFile": {"name": written[0].name, "text": written[0].read_text()} if written else None,
    }
    if code == 0:
        status = [payload for _, command, payload in replies
                  if command == p.CMD_TRANSPORT_CFG and payload[0] == p.TRANSPORT_CFG_READ_MGMT]
        scenario["status"] = reading(p, status[-1])
        read_node = p.encode(p.CMD_TRANSPORT_CFG, bytes([p.TRANSPORT_CFG_READ_NODE])).hex()
        asked = max(index for index, entry in enumerate(transcript) if entry.get("host") == read_node)
        _, command, payload = next(answer for answer in replies if answer[0] > asked)
        scenario["node"] = reading(p, payload) if command == p.CMD_TRANSPORT_CFG \
            else {"value": None, "lines": p.render_node(None)}
    return scenario


def reply_vectors(p):
    management = bytes([0x05, 1, 0]) + b"887A" + (1755400000).to_bytes(4, "big")
    node = bytes([0x07, 1]) + DESTINATION + bytes([1, 2, 1, 1]) + PRIMARY + bytes([2, 2]) + HELPER_IDENTITY
    payloads = [
        management, bytes([0x05, 0, 1]) + b"0F3C" + bytes(4), management[:-1], management + b"\0",
        bytes([0x00]) + management[1:], bytes([0x05, 2, 0]) + management[3:],
        bytes([0x05, 1, 0]) + b"88zA" + management[7:], bytes([0x05, 1, 0]) + b"887a" + management[7:],
        node, bytes([0x07, 0]) + bytes(18), bytes([0x07, 1]) + DESTINATION + bytes([0, 0]), node[:-1],
        node + b"\0", bytes([0x05]) + node[1:], node[:1] + bytes([2]) + node[2:],
        node[:18] + bytes([2]) + node[19:], node[:19] + bytes([5]) + node[20:],
        node[:20] + bytes([9]) + node[21:], node[:21] + bytes([3]) + node[22:],
    ]
    return [{"payload": payload.hex(), **reading(p, payload)} for payload in payloads]


def hash_vectors(p):
    text = PRIMARY.hex()
    texts = [text, f"<{text}>", f"  <{text.upper()}>\n", " ".join(text[i:i + 2] for i in range(0, 32, 2)),
             f"<<{text}>>", text[:30], text + "00", "zz" * 16, "", "<>", text[:1] + " " + text[1:],
             f"　{text} ", text[:16] + " " + text[16:], text[:16] + "\x0b" + text[16:],
             f"\x1c{text}\x85", f"﻿{text}"]
    vectors = []
    for value in texts:
        try:
            vectors.append({"text": value, "hash": p.parse_hash(value).hex()})
        except ValueError as error:
            vectors.append({"text": value, "error": str(error)})
    return vectors


def key_file_vectors(model, scratch):
    text = FILE_KEY.hex()
    contents = [text.encode() + b"\n", text.upper().encode(), b"  " + text.encode() + b"\r\n", FILE_KEY,
                text[:32].encode(), text[:-2].encode(), text.encode() + b"00", bytes(64).hex().encode(),
                bytes(32), b"zz" * 32, b"\xff" * 64, text.encode() + b"\n" * 3,
                (text[:30] + " " + text[30:60] + " " + text[60:62]).encode(), b"\x0b" + text.encode() + b"\x0c"]
    vectors = []
    for index, content in enumerate(contents):
        path = scratch / f"key-{index}.key"
        path.write_bytes(content)
        path.chmod(0o600)
        try:
            vectors.append({"bytes": content.hex(), "key": model.provision.read_key_file(path).hex()})
        except model.rsnode_keys.KeyFileError as error:
            vectors.append({"bytes": content.hex(), "error": str(error)})
    return vectors


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rsnode-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    root = args.rsnode_source.resolve()
    model = load("rsnode_provision_model", root / TESTS)
    with tempfile.TemporaryDirectory() as directory:
        scratch = Path(directory)
        fixture = {
            "source": {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in (SCRIPT, TESTS, GUIDE)},
            "guide": guide_sentences(root / GUIDE),
            "scenarios": [run_scenario(model, scratch, *scenario) for scenario in scenarios(model.provision)],
            "replies": reply_vectors(model.provision),
            "hashes": hash_vectors(model.provision),
            "keyFiles": key_file_vectors(model, scratch),
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
