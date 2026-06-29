#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT="${1:-${REPO_ROOT}/.tmp/ratspeak-map-server-bundle.tar.gz}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

BUNDLE_DIR="${WORK_DIR}/ratspeak-map-server"
mkdir -p "${BUNDLE_DIR}"

cp "${SCRIPT_DIR}/ratspeak-map-publisher.py" "${BUNDLE_DIR}/"
cp "${SCRIPT_DIR}/ratspeak-map.env.example" "${BUNDLE_DIR}/"
cp "${SCRIPT_DIR}/ratspeak-map-publisher.service" "${BUNDLE_DIR}/"
cp "${SCRIPT_DIR}/README.md" "${BUNDLE_DIR}/"
cp "${REPO_ROOT}/scripts/data/ne_110m_land.geojson" "${BUNDLE_DIR}/"

mkdir -p "$(dirname "${OUT}")"
tar -C "${WORK_DIR}" -czf "${OUT}" ratspeak-map-server
echo "Wrote ${OUT}"
