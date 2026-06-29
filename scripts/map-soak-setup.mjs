#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const soakRoot = path.join(repoRoot, '.tmp', 'map-soak');
const rnsDir = path.join(soakRoot, 'rsreticulum');
const lxmfDir = path.join(soakRoot, 'rslxmf');

const rnsConfig = `[reticulum]
share_instance = yes
instance_name = ratspeak_map_soak
shared_instance_type = tcp
shared_instance_port = 38430
instance_control_port = 38431
enable_transport = no
discover_interfaces = yes
discover_interfaces_required_value = 14

[logging]
loglevel = 5

[interfaces]

  [[Ratspeak TCP]]
    type = TCPClientInterface
    enabled = yes
    target_host = rns.ratspeak.org
    target_port = 4242
`;

const lxmfConfig = `[propagation]
enable_node = no
announce_at_start = no
autopeer = no

[lxmf]
display_name = Ratspeak Map Soak
announce_at_start = yes
delivery_transfer_max_accepted_size = 1000

[logging]
loglevel = 4
`;

await mkdir(rnsDir, { recursive: true });
await mkdir(lxmfDir, { recursive: true });
await writeFile(path.join(rnsDir, 'config'), rnsConfig, 'utf8');
await writeFile(path.join(lxmfDir, 'config'), lxmfConfig, 'utf8');

console.log(`Wrote fresh soak configs:
  RNS:  ${rnsDir}
  LXMF: ${lxmfDir}

Discovery store:
  ${path.join(rnsDir, 'storage', 'discovery', 'interfaces')}

Run lxmd-rs with:
  /Users/Games/Desktop/main/rsLXMF/target/debug/lxmd-rs --config ${lxmfDir} --rnsconfig ${rnsDir}
`);
