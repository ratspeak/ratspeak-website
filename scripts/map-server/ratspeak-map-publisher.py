#!/usr/bin/env python3
"""Publish sanitized Python RNS discovery data to the Ratspeak map ingest API.

This script is intentionally standalone. It is meant to run on the dedicated
Linux Reticulum host without cloning the website repo. Copy this file and the
Natural Earth land GeoJSON next to it, point it at the single `deadbeef*` RNS
config directory, and give it MAP_INGEST_TOKEN.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


WEB_MERCATOR_LAT_LIMIT = 85.05112878
DEFAULT_TTL_SECONDS = 15 * 60
DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
UNKNOWN_AFTER_SECONDS = 24 * 60 * 60
STALE_AFTER_SECONDS = 3 * 24 * 60 * 60
SERVER_TYPES = {"BackboneInterface", "TCPServerInterface"}
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_LAND_GEOJSON_CANDIDATES = [
    SCRIPT_DIR / "ne_110m_land.geojson",
    SCRIPT_DIR / "data" / "ne_110m_land.geojson",
    SCRIPT_DIR.parent / "data" / "ne_110m_land.geojson",
    SCRIPT_DIR.parent.parent / "scripts" / "data" / "ne_110m_land.geojson",
]


def main() -> int:
    args = parse_args()
    if args.interval:
        while True:
            publish_cycle(args)
            time.sleep(args.interval)

    publish_cycle(args)
    return 0


def publish_cycle(args: argparse.Namespace) -> None:
    generated_at = now_iso()
    land_mask = None if args.include_water else load_land_mask(args.land_geojson, args.require_land_mask)
    raw_records = load_rnstatus_records(args)
    accepted_records: list[dict[str, Any]] = []
    skipped = {
        "missingLocation": 0,
        "water": 0,
        "expired": 0,
        "invalid": 0,
    }

    for index, record in enumerate(raw_records, start=1):
        normalized = normalize_record(record, index)
        if not has_usable_location(normalized):
            skipped["missingLocation"] += 1
            continue
        if age_seconds(normalized.get("last_heard")) > args.max_age:
            skipped["expired"] += 1
            continue
        if land_mask and not point_is_on_land(normalized["latitude"], normalized["longitude"], land_mask):
            skipped["water"] += 1
            continue
        accepted_records.append(normalized)

    nodes = dedupe_nodes([record_to_node(record) for record in accepted_records])
    snapshot = {
        "schemaVersion": 1,
        "sourceMode": "live-discovery",
        "generatedAt": generated_at,
        "ttlSeconds": DEFAULT_TTL_SECONDS,
        "sources": [
            {
                "id": "deadbeef-rns-discovery",
                "label": "Ratspeak discovery ingest",
                "kind": "server-observed",
                "trust": "operator",
            }
        ],
        "stats": {
            "recordsRead": len(raw_records),
            "recordsAccepted": len(accepted_records),
            "nodesPlotted": len(nodes),
            "skippedMissingLocation": skipped["missingLocation"],
            "skippedWater": skipped["water"],
            "skippedExpired": skipped["expired"],
            "skippedInvalid": skipped["invalid"],
        },
        "nodes": nodes,
    }

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.dry_run:
        print_status("dry-run", snapshot)
        return

    publish_snapshot(snapshot, args.ingest_url, args.ingest_token, args.timeout)
    print_status("published", snapshot)


def load_rnstatus_records(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.rnstatus_json:
        raw = Path(args.rnstatus_json).read_text(encoding="utf-8").strip()
    else:
        command = [
            args.rnstatus_bin,
            "--config",
            str(args.rns_config),
            "-d",
            "--json",
        ]
        result = subprocess.run(command, text=True, capture_output=True, timeout=args.timeout, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"rnstatus failed with {result.returncode}: {result.stderr.strip()}")
        raw = result.stdout.strip()

    if not raw:
        return []

    payload = json.loads(raw)
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict) and isinstance(payload.get("interfaces"), list):
        records = payload["interfaces"]
    else:
        raise ValueError("rnstatus JSON must be an array or { interfaces: [...] }")

    return [record for record in records if isinstance(record, dict)]


def normalize_record(record: dict[str, Any], index: int) -> dict[str, Any]:
    normalized = dict(record)
    normalized["fileStem"] = (
        string_value(record.get("discovery_hash"))
        or string_value(record.get("transport_id"))
        or string_value(record.get("network_id"))
        or f"rnstatus-{index}"
    )
    normalized["name"] = string_value(record.get("name")) or string_value(record.get("discovery_name")) or "Unnamed node"
    normalized["type"] = string_value(record.get("type"))
    normalized["latitude"] = finite_number(record.get("latitude"))
    normalized["longitude"] = finite_number(record.get("longitude"))
    normalized["height"] = finite_number(record.get("height"))
    normalized["last_heard"] = finite_number(record.get("last_heard"))
    normalized["discovered"] = finite_number(record.get("discovered"))
    normalized["hops"] = finite_int(record.get("hops"))
    normalized["heard_count"] = finite_int(record.get("heard_count"))
    normalized["value"] = finite_int(record.get("value"))
    normalized["port"] = finite_int(record.get("port"))
    normalized["reachable_on"] = string_value(record.get("reachable_on"))
    normalized["transport_id"] = string_value(record.get("transport_id"))
    normalized["network_id"] = string_value(record.get("network_id"))
    return normalized


def record_to_node(record: dict[str, Any]) -> dict[str, Any]:
    kind = kind_for_record(record)
    services = services_for(record, kind)
    node = {
        "id": f"disc:{record.get('fileStem') or stable_hash(record)}",
        "label": record.get("name") or "Unnamed node",
        "kind": kind,
        "status": status_for(record),
        "sourceId": "deadbeef-rns-discovery",
        "sourceMode": "live-discovery",
        "lastSeen": iso_from_unix(record.get("last_heard")),
        "firstSeen": iso_from_unix(record.get("discovered")),
        "location": {
            "lat": record["latitude"],
            "lon": record["longitude"],
        },
        "services": services,
        "reticulum": {
            "interfaceType": record.get("type") or None,
            "transportId": record.get("transport_id") or None,
            "networkId": record.get("network_id") or None,
            "hops": record.get("hops"),
            "stampValue": record.get("value"),
            "heardCount": record.get("heard_count"),
            "reachableOn": record.get("reachable_on") or None,
            "port": record.get("port"),
            "heightMeters": record.get("height"),
            "radio": radio_for(record),
        },
    }

    node["location"] = drop_none(node["location"])
    node["reticulum"] = drop_none(node["reticulum"])
    return drop_none(node)


def kind_for_record(record: dict[str, Any]) -> str:
    interface_type = record.get("type") or ""
    reachable_on = record.get("reachable_on") or ""
    if interface_type == "I2PInterface":
        return "i2p"
    if text_mentions_yggdrasil(record.get("name"), interface_type, reachable_on) or is_yggdrasil_address(reachable_on):
        return "yggdrasil"
    if interface_type in SERVER_TYPES:
        return "server"
    return "client-auto"


def services_for(record: dict[str, Any], kind: str) -> list[str]:
    interface_type = record.get("type") or ""
    services = ["rns.transport"]
    if interface_type == "TCPServerInterface":
        services.append("tcp.server")
    elif interface_type == "I2PInterface":
        services.append("i2p.server")
    elif kind == "yggdrasil":
        services.append("yggdrasil.server")
    elif interface_type in {"RNodeInterface", "KISSInterface"}:
        services.append("lora.mesh")
    elif kind == "client-auto":
        services.append("discoverable")
    return services


def radio_for(record: dict[str, Any]) -> dict[str, Any] | None:
    radio = {
        "frequency": first_int(record.get("frequency"), record.get("freq")),
        "bandwidth": first_int(record.get("bandwidth")),
        "spreadingFactor": first_int(record.get("spreading_factor"), record.get("spreadingFactor"), record.get("sf")),
        "codingRate": first_int(record.get("coding_rate"), record.get("codingRate"), record.get("cr")),
        "txPowerDbm": first_int(record.get("tx_power"), record.get("txPower"), record.get("txPowerDbm")),
        "modulation": string_value(record.get("modulation")) or None,
        "channel": first_int(record.get("channel")),
    }
    radio = drop_none(radio)
    return radio or None


def dedupe_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for node in nodes:
        previous = by_id.get(node["id"])
        if not previous or timestamp_value(node.get("lastSeen")) >= timestamp_value(previous.get("lastSeen")):
            by_id[node["id"]] = node
    return sorted(by_id.values(), key=lambda node: timestamp_value(node.get("lastSeen")), reverse=True)


def publish_snapshot(snapshot: dict[str, Any], ingest_url: str, token: str, timeout: int) -> None:
    body = json.dumps(snapshot).encode("utf-8")
    request = urllib.request.Request(
        ingest_url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "ratspeak-map-publisher/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status < 200 or response.status >= 300:
                detail = response.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"ingest failed with HTTP {response.status}: {detail}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ingest failed with HTTP {error.code}: {detail}") from error


def load_land_mask(path: str | Path, required: bool) -> list[dict[str, Any]] | None:
    geojson_path = Path(path)
    if not geojson_path.exists():
        message = f"land mask not found at {geojson_path}"
        if required:
            raise FileNotFoundError(message)
        print(f"[map-publisher] warning: {message}; water filtering disabled", file=sys.stderr)
        return None

    geojson = json.loads(geojson_path.read_text(encoding="utf-8"))
    polygons: list[dict[str, Any]] = []
    for feature in geojson.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Polygon":
            groups = [geometry.get("coordinates") or []]
        elif geometry.get("type") == "MultiPolygon":
            groups = geometry.get("coordinates") or []
        else:
            groups = []

        for rings in groups:
            if not rings:
                continue
            polygons.append({"rings": rings, "bbox": bbox_for_ring(rings[0])})

    if not polygons:
        raise ValueError(f"no land polygons loaded from {geojson_path}")
    return polygons


def point_is_on_land(lat: float, lon: float, polygons: list[dict[str, Any]]) -> bool:
    return any(
        bbox_contains(poly["bbox"], lat, lon) and point_in_polygon(lon, lat, poly["rings"])
        for poly in polygons
    )


def point_in_polygon(x: float, y: float, rings: list[list[list[float]]]) -> bool:
    if not rings or not point_in_ring(x, y, rings[0]):
        return False
    return not any(point_in_ring(x, y, ring) for ring in rings[1:])


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        xi, yi = float(point[0]), float(point[1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if (yi > y) != (yj > y):
            denominator = (yj - yi) or sys.float_info.epsilon
            if x < ((xj - xi) * (y - yi)) / denominator + xi:
                inside = not inside
        j = i
    return inside


def bbox_for_ring(ring: list[list[float]]) -> dict[str, float]:
    lons = [float(point[0]) for point in ring]
    lats = [float(point[1]) for point in ring]
    return {"minLat": min(lats), "maxLat": max(lats), "minLon": min(lons), "maxLon": max(lons)}


def bbox_contains(bbox: dict[str, float], lat: float, lon: float) -> bool:
    return bbox["minLat"] <= lat <= bbox["maxLat"] and bbox["minLon"] <= lon <= bbox["maxLon"]


def has_usable_location(record: dict[str, Any]) -> bool:
    lat = record.get("latitude")
    lon = record.get("longitude")
    if lat is None or lon is None:
        return False
    if abs(lat) > WEB_MERCATOR_LAT_LIMIT or abs(lon) > 180:
        return False
    return abs(lat) > 0.000001 or abs(lon) > 0.000001


def status_for(record: dict[str, Any]) -> str:
    age = age_seconds(record.get("last_heard"))
    if age > STALE_AFTER_SECONDS:
        return "stale"
    if age > UNKNOWN_AFTER_SECONDS:
        return "unknown"
    return "available"


def age_seconds(unix_seconds: Any) -> float:
    value = finite_number(unix_seconds)
    if value is None or value <= 0:
        return float("inf")
    return max(0.0, time.time() - value)


def timestamp_value(value: Any) -> float:
    text = string_value(value)
    if not text:
        return 0.0
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def iso_from_unix(unix_seconds: Any) -> str | None:
    value = finite_number(unix_seconds)
    if value is None or value <= 0:
        return None
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def is_yggdrasil_address(value: Any) -> bool:
    address = string_value(value).lower()
    if ":" not in address:
        return False
    first_hextet = address.split(":", 1)[0]
    try:
        number = int(first_hextet, 16)
    except ValueError:
        return False
    return 0x0200 <= number <= 0x03FF


def text_mentions_yggdrasil(*values: Any) -> bool:
    text = " ".join(string_value(value).lower() for value in values if string_value(value))
    if not text:
        return False
    return "yggdrasil" in text or " ygg " in f" {text} "


def stable_hash(record: dict[str, Any]) -> str:
    source = f"{record.get('type') or ''}:{record.get('name') or ''}:{record.get('latitude') or ''}:{record.get('longitude') or ''}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:24]


def first_int(*values: Any) -> int | None:
    for value in values:
        number = finite_int(value)
        if number is not None:
            return number
    return None


def finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def finite_int(value: Any) -> int | None:
    number = finite_number(value)
    return int(number) if number is not None else None


def string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else ""


def drop_none(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None}


def print_status(action: str, snapshot: dict[str, Any]) -> None:
    stats = snapshot["stats"]
    print(
        "[map-publisher] "
        f"{action} {stats['nodesPlotted']} node(s) from {stats['recordsRead']} record(s) "
        f"({stats['skippedMissingLocation']} missing location, "
        f"{stats['skippedWater']} water, {stats['skippedExpired']} expired)"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish Python RNS discovery data to Ratspeak map ingest")
    parser.add_argument("--rns-config", default=os.environ.get("RNS_CONFIG_DIR"), help="RNS config directory for the deadbeef node")
    parser.add_argument("--rnstatus-bin", default=os.environ.get("RNSTATUS_BIN", "rnstatus"), help="rnstatus executable")
    parser.add_argument("--rnstatus-json", default=None, help="read existing rnstatus -d --json output instead of invoking rnstatus")
    parser.add_argument("--land-geojson", default=os.environ.get("MAP_LAND_GEOJSON", default_land_geojson()), help="Natural Earth land GeoJSON")
    parser.add_argument("--include-water", action="store_true", help="do not filter points outside land polygons")
    parser.add_argument("--require-land-mask", action="store_true", help="fail if the land mask is unavailable")
    parser.add_argument("--max-age", type=int, default=int(os.environ.get("MAP_MAX_AGE_SECONDS", DEFAULT_MAX_AGE_SECONDS)), help="max last_heard age in seconds")
    parser.add_argument("--ingest-url", default=os.environ.get("MAP_INGEST_URL", "https://ratspeak.org/api/map-ingest"), help="Vercel map ingest URL")
    parser.add_argument("--ingest-token", default=os.environ.get("MAP_INGEST_TOKEN"), help="Vercel map ingest bearer token")
    parser.add_argument("--out", default=os.environ.get("MAP_SNAPSHOT_OUT", "/var/lib/ratspeak-map/map-live.json"), help="write snapshot copy to this path")
    parser.add_argument("--interval", type=int, default=int(os.environ.get("MAP_PUBLISH_INTERVAL", "0")), help="repeat every N seconds")
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("MAP_PUBLISH_TIMEOUT", "30")), help="subprocess and HTTP timeout")
    parser.add_argument("--dry-run", action="store_true", help="build snapshot but do not publish")

    args = parser.parse_args()
    if not args.rnstatus_json and not args.rns_config:
        parser.error("--rns-config or --rnstatus-json is required")
    if not args.dry_run and not args.ingest_token:
        parser.error("--ingest-token or MAP_INGEST_TOKEN is required")
    if args.interval and args.interval < 10:
        parser.error("--interval must be at least 10 seconds")
    return args


def default_land_geojson() -> str:
    for candidate in DEFAULT_LAND_GEOJSON_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    return str(DEFAULT_LAND_GEOJSON_CANDIDATES[0])


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        print(f"[map-publisher] error: {exc}", file=sys.stderr)
        raise SystemExit(1)
