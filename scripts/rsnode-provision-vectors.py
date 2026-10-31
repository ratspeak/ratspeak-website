#!/usr/bin/env python3
"""Record rsNode USB provisioning transcripts for the web flasher tests.

Runs rsNode's scripts/provision-rsnode.py against the device model in its own
tests (scripts/tests/test_provision_rsnode.py) and records every frame the
script writes and the model answers, with the script's own readings of them.
No device is touched. Regenerate when either changes:

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
from unittest import mock

TESTS = "scripts/tests/test_provision_rsnode.py"
SCRIPT = "scripts/provision-rsnode.py"

# Hashes hold FEND/FESC bytes so every frame exercises KISS escaping.
OWNER = bytes.fromhex("c0db" + "11" * 14)
ADMIN = bytes.fromhex("dbdc" + "22" * 14)
ADMIN_IDENTITY = bytes.fromhex("33" * 15 + "c0")
OLD_OWNER = bytes.fromhex("44" * 16)
NEW_OWNER = bytes.fromhex("55" * 16)
DESTINATION = bytes([0xD0]) * 16
PORT = "/dev/rsnode"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def scenarios(p):
    lxmf, identity, owner, admin = p.OWNER_KIND_LXMF, p.OWNER_KIND_IDENTITY, p.ROLE_PRIMARY, p.ROLE_HELPER
    enrolled = {"destination": DESTINATION, "owners": [(lxmf, owner, OLD_OWNER)]}
    provisioned = {"destination": DESTINATION,
                   "owners": [(lxmf, owner, OWNER), (identity, admin, ADMIN_IDENTITY)]}
    nearby = {**provisioned, "nearby_only": True}
    full = {"destination": DESTINATION, "owners": enrolled["owners"] +
            [(lxmf, admin, bytes([index]) * 16) for index in (1, 2, 3)]}
    return [
        ("read a fresh node", ["--read"], {}, {}),
        ("read a node with managers", ["--read"], {}, provisioned),
        ("read a nearby-only node", ["--read"], {}, nearby),
        ("read firmware that predates managers", ["--read"], {"owners_supported": False}, {}),
        ("add the owner by LXMF address", ["--owner", f"<{OWNER.hex()}>"], {}, {}),
        ("add the owner by identity hash", ["--owner-identity", OWNER.hex().upper()], {}, {}),
        ("add the owner and admins", ["--owner", OWNER.hex(), "--admin", ADMIN.hex(),
                                      "--admin-identity", ADMIN_IDENTITY.hex()], {}, {}),
        ("a new owner replaces the previous one", ["--owner", NEW_OWNER.hex()], {}, enrolled),
        ("remove the owner and add a new one",
         ["--remove-manager", OLD_OWNER.hex(), "--owner", NEW_OWNER.hex()], {}, enrolled),
        ("remove an admin", ["--remove-manager", ADMIN_IDENTITY.hex()], {}, provisioned),
        ("remove every manager",
         ["--remove-manager", ADMIN_IDENTITY.hex(), "--remove-manager", OWNER.hex()], {}, provisioned),
        ("adding without entropy", ["--owner", OWNER.hex()], {"entropy": False}, {}),
        ("remove a manager that is not on the node", ["--remove-manager", NEW_OWNER.hex()], {}, {}),
        ("add on firmware that predates managers", ["--owner", OWNER.hex()], {"owners_supported": False}, {}),
        ("add an admin to a full manager list", ["--admin", ADMIN.hex()], {}, full),
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
    return {"value": as_json(value)}


def options(p, argv):
    """The parsed command line, under the page's option names (helper is an Admin)."""
    args = p.build_parser().parse_args(["--port", PORT, *argv])
    hashed = lambda value: p.parse_hash(value).hex() if value is not None else None
    return {
        "read": args.read,
        "owner": hashed(args.owner),
        "ownerIdentity": hashed(args.owner_identity),
        "helper": [hashed(value) for value in args.admin],
        "helperIdentity": [hashed(value) for value in args.admin_identity],
        "removeOwner": [hashed(value) for value in args.remove_manager],
    }


def run_scenario(model, name, argv, device_args, preset):
    p = model.provision
    device = model.FakeDevice(**device_args)
    device.destination = preset.get("destination")
    device.owners = list(preset.get("owners", []))
    device.nearby_only = preset.get("nearby_only", False)
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
    stdout, stderr = io.StringIO(), io.StringIO()
    with mock.patch.object(p, "open_esp_serial", return_value=device), \
            contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = p.main(["--port", PORT, "--timeout", "2", *argv])
    scenario = {
        "name": name,
        "argv": argv,
        "options": options(p, argv),
        "transcript": transcript,
        "exitCode": code,
        "stdout": stdout.getvalue().splitlines(),
        "stderr": stderr.getvalue().strip(),
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
    node = bytes([0x07, 1]) + DESTINATION + bytes([1, 2, 1, 1]) + OWNER + bytes([2, 2]) + ADMIN_IDENTITY
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
    text = OWNER.hex()
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


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rsnode-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    root = args.rsnode_source.resolve()
    model = load("rsnode_provision_model", root / TESTS)
    fixture = {
        "source": {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in (SCRIPT, TESTS)},
        "scenarios": [run_scenario(model, *scenario) for scenario in scenarios(model.provision)],
        "replies": reply_vectors(model.provision),
        "hashes": hash_vectors(model.provision),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
