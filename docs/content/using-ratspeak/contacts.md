# Contacts

Managing your contact list, understanding reachability status, and how announces populate your address book.

## Contact List

Your contacts are the people you communicate with on the Reticulum network. Each contact is identified by their **LXMF destination hash** — a 32-character hex string derived from their cryptographic identity.

Contacts can be added in two ways:

1. **Manually** — paste a destination hash and optionally set a nickname
2. **Via announce** — when someone announces on the network and your node receives it, they appear automatically

## Reachability Status

Contacts are classified into three states based on their **path table entry age** — how recently a valid path to them was last confirmed:

| Status | Condition | Meaning |
|--------|-----------|---------|
| **Reachable** | Path age < 30 min | Active path exists, communication likely to succeed |
| **Stale** | Path age 30–60 min | Path exists but may be outdated |
| **Unreachable** | Path age > 60 min or no path | No known path, direct delivery will fail |

These thresholds are configurable in `ratspeak.conf`:

```ini
[dashboard]
path_age_reachable = 1800   # 30 minutes (seconds)
path_age_stale = 3600       # 60 minutes (seconds)
```

## How Announces Work

When a contact **announces** their presence on the network:

1. Their announce packet propagates through transport nodes
2. Each transport node records the path and hop count
3. Your node receives the announce and updates the path table
4. The contact's display name (if included) is shown in your contacts

Announces are rate-limited to **2% of interface bandwidth** by default. This prevents announce traffic from consuming the channel on low-bandwidth links like LoRa.

## Auto-Path Requests

Ratspeak automatically requests fresh paths for contacts that are missing from the path table. It rotates through contacts, requesting one path per polling cycle (~1.5 seconds). This keeps routes to your frequent contacts fresh.

## Path Age and Hop Count

For each contact, the connections view shows:

- **Path age** — how long ago the path was last confirmed
- **Hop count** — how many transport nodes sit between you and the contact
- **Interface** — which of your interfaces carries the path

Contacts with a hop count of 0 are on your local shared instance (directly connected). Non-contact path entries older than 2 hours are filtered from display. This 2-hour filter is hardcoded and separate from the configurable `path_age_reachable` and `path_age_stale` thresholds.

## What's Next

- [Messaging](../using-ratspeak/messaging) — send and receive messages
- [Network Monitoring](../using-ratspeak/network-monitoring) — interface stats and topology
- [Identity Management](../using-ratspeak/identity-management) — manage your identities
