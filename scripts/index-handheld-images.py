#!/usr/bin/env python3
"""Index verified public release images for browser updates; firmware bytes stay in releases."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile


def digest(data, algorithm="sha256"):
    return hashlib.new(algorithm, data).hexdigest()


def release_images(directory, component_prefix):
    """(path, image, board, package, version, revision) for each factory image.

    2.3.3 and earlier wrap each image in a ZIP with a manifest; later releases
    publish bare .bin images that carry their identity in each application."""
    archives = [path for path in sorted(directory.glob("*.zip")) if not path.name.endswith("notices.zip")]
    for path in archives:
        with zipfile.ZipFile(path) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            if manifest["sourceDirty"] or manifest["installMode"] != "factory":
                raise ValueError(f"Not a clean factory release: {path}")
            part, = manifest["parts"]
            data = archive.read(part["path"])
            if len(data) != part["size"] or digest(data) != part["sha256"]:
                raise ValueError(f"Factory digest mismatch: {path}")
            yield (path, data, *(manifest[key] for key in ("board", "package", "version", "sourceRevision")))
    if archives:
        return
    roles = {("launcher", "rnode", "standalone"): "full", ("standalone",): "standalone", ("rnode",): "rnode"}
    for path in sorted(directory.glob("*.bin")):
        if path.name.endswith("-launcher.bin"):
            continue
        data = path.read_bytes()
        found = [m.group(1).decode().split(":") for m in
                 re.finditer(re.escape(component_prefix) + rb"([^\0]*)\0", data)]
        identities = {(board, version, revision, dirty) for board, _, version, revision, dirty in found}
        package = roles.get(tuple(sorted(role for _, role, *_ in found)))
        if len(identities) != 1 or package is None:
            raise ValueError(f"Not a single-release factory image: {path}")
        board, version, revision, dirty = identities.pop()
        if dirty != "0":
            raise ValueError(f"Not a clean factory release: {path}")
        yield path, data, board, package, version, revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firmware-source", type=Path, required=True)
    parser.add_argument("--target-version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("directories", nargs="+", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(args.firmware_source.resolve() / "tools"))
    from release_images import COMPONENT_PREFIX, factory_partitions, verify_factory

    index = {"version": args.target_version, "layouts": {}, "components": {}, "packages": {}}
    for directory in args.directories:
        for path, data, board, mode, version, revision in release_images(directory, COMPONENT_PREFIX):
            components = verify_factory(data, board, mode, version, revision, False, args.firmware_source)
            entries = factory_partitions(board, mode, args.firmware_source)
            layout_id = f"{board}/{mode}"
            layout = {"board": board, "package": mode,
                      "tableSha256": digest(data[0x8000:0x8c00]),
                      "bootMd5": digest(data[:0x8000], "md5"),
                      "slots": [{"offset": p.offset, "capacity": p.size,
                                 "role": name if mode == "full" else mode}
                                for name, p in entries.items() if p.kind == "app"]}
            previous = index["layouts"].setdefault(layout_id, layout)
            if previous != layout:
                raise ValueError(f"Review layout/bootloader compatibility before indexing {path}")
            parts = []
            for role, component in components.items():
                probe = digest(component[:288])
                record = {"board": board, "role": role, "version": version,
                          "size": len(component), "md5": digest(component, "md5"),
                          "sha256": digest(component)}
                if index["components"].setdefault(probe, record) != record:
                    raise ValueError(f"Ambiguous application descriptor: {path}")
                slot = entries[role if mode == "full" else "app0"]
                parts.append({"offset": slot.offset, "component": probe})
            if version == args.target_version:
                index["packages"][digest(data)] = {"layout": layout_id, "parts": parts}
    if len(index["packages"]) != len(index["layouts"]):
        raise ValueError("Target release must contain every supported board/package")
    # One compact record per line keeps generated changes reviewable.
    groups = []
    for name in ("layouts", "components", "packages"):
        records = ",\n".join("    " + json.dumps(key) + ": " + json.dumps(value, separators=(",", ":"))
                              for key, value in sorted(index[name].items()))
        groups.append(f'  "{name}": {{\n{records}\n  }}')
    args.output.write_text("// Generated by scripts/index-handheld-images.py from verified release images.\n"
                           + "export const handheldImages = {\n  \"version\": "
                           + json.dumps(args.target_version) + ",\n" + ",\n".join(groups) + "\n};\n")
    print(f'{len(index["layouts"])} layouts, {len(index["components"])} applications, '
          f'{len(index["packages"])} update packages')


if __name__ == "__main__":
    main()
