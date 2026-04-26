# BlueRadar

A Home Assistant management UI, REST API, and Lovelace card for
Bluetooth Low Energy devices — built on top of the excellent
[Bermuda BLE Trilateration integration](https://github.com/agittins/bermuda).

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.2.0-blue)

---

## What this is, and is not

BlueRadar is a **management layer**, not a location engine.

- The location-engine work — RSSI smoothing, distance estimation,
  area assignment, and `device_tracker.*` entity creation — is done by
  [Bermuda](https://github.com/agittins/bermuda) by
  [@agittins](https://github.com/agittins). All credit for that goes to
  them.
- BlueRadar adds a polished management UI, a REST API designed for AI
  agents and external scripts, summary sensors, and a custom Lovelace
  card with a radar heat-map view on top of Bermuda.

If you have not installed Bermuda yet, install it first
(via [HACS](https://hacs.xyz/) or manually). BlueRadar's track / untrack
features write to Bermuda's config entry options to drive the Bermuda
device list. Read-only features (device list, manufacturer breakdown,
heat-map view) work without Bermuda but are most useful with it.

## Why this exists

Bermuda is excellent at what it does. The gap BlueRadar fills:

1. **Adding a new BLE device to track is fiddly.** It usually means
   finding the right MAC in some other UI, then editing Bermuda's
   options through the integration's options flow. BlueRadar shows
   every advertising BLE device live in one list with a one-click
   "Track" button per row.
2. **Headless and AI-agent access.** BlueRadar exposes a small REST
   API with an OpenAPI 3.1 spec served unauthenticated, so an AI
   agent can self-discover capabilities and then bulk-track devices
   matching a filter. Useful if you run agents like OpenClaw or are
   wiring BLE into n8n / Node-RED.
3. **Quick visual situational awareness.** A radar heat-map shows
   every visible BLE device positioned by estimated distance from
   the HA scanner, with manufacturer-coloured dots, click-to-track,
   and zoom / pan.

If those three problems aren't problems you have, you probably don't
need BlueRadar — Bermuda alone is fine.

## Honest caveats

- **Distances are estimates.** BlueRadar uses the same log-distance
  path-loss model that's standard for single-radio RSSI estimation
  (ref −55 dBm @ 1 m by default). Walls, bodies, and antenna
  orientation all affect this. If you need precision, use multiple
  Bermuda scanners and trust Bermuda's trilateration over our
  single-scanner estimate.
- **Angles on the heat-map are not real bearings.** A single radio
  cannot determine direction. The heat-map arranges devices on
  concentric distance rings with collision-avoiding angles for
  visibility, not as a literal compass-bearing display. The card
  states this caveat in plain language. Don't use the heat-map to
  navigate to a misplaced device — use the per-device distance
  number.
- **Random MACs rotate.** Many phones (iPhone, modern Android)
  rotate their advertising MAC every ~15 minutes for privacy.
  Tracking a randomised MAC will lose the device when it rotates.
  BlueRadar marks address types (`PUB` / `RND`) so you can make
  informed choices.
- **Single-author project.** This is a personal project. It works
  for me on Home Assistant 2026.x. It may not work for you. PRs
  welcome.

## Features

### Custom integration (`custom_components/blueradar/`)

- 4 summary sensors:
  `sensor.ble_devices_total`, `sensor.ble_devices_named`,
  `sensor.ble_devices_tracked`, `sensor.ble_scanners`
- 3 services: `blueradar.track`, `blueradar.untrack`,
  `blueradar.refresh`
- WebSocket API for the frontend card
- REST API with 10 endpoints + OpenAPI 3.1 spec
- Config flow: single-instance, no configuration needed

### Lovelace card (auto-registered)

- 4 tabs: All Devices / Tracked / Manufacturers / Heat Map
- Live filter input (by name, MAC, manufacturer)
- One-click track / untrack per row
- Manufacturer breakdown bar chart
- Animated radar heat-map with zoom and pan
- Manual refresh button + auto-refresh every 15 s

### REST API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/blueradar/devices` | List all visible BLE devices (filterable) |
| GET | `/api/blueradar/tracked` | Currently tracked MAC addresses |
| GET | `/api/blueradar/device/{mac}` | One device's full details |
| POST | `/api/blueradar/track` | Track a single device |
| POST | `/api/blueradar/untrack` | Untrack a single device |
| POST | `/api/blueradar/track_bulk` | Track many at once |
| POST | `/api/blueradar/track_by_filter` | Filter + bulk track, with `dry_run` |
| POST | `/api/blueradar/refresh` | Force a re-poll |
| GET | `/api/blueradar/stats` | Summary statistics |
| GET | `/api/blueradar/openapi` | OpenAPI 3.1 spec (no auth) |

All write endpoints require an `Authorization: Bearer <ha-long-lived-token>`
header. The OpenAPI spec is intentionally unauthenticated so AI agents
can self-discover capabilities.

## Installation

### Prerequisites

- Home Assistant 2026.4 or later
- The built-in `bluetooth` integration enabled with at least one BLE
  scanner (HA host adapter, ESPHome BLE proxy, Shelly, etc.)
- For full functionality: [Bermuda BLE Trilateration](https://github.com/agittins/bermuda)
  installed and configured

### Via HACS (custom repository)

1. Open HACS → **⋮** menu → Custom repositories
2. Add `https://github.com/nj070574-gif/blueradar` as an
   *Integration*
3. Install **BlueRadar**
4. Restart Home Assistant
5. Settings → Devices & Services → **+ Add Integration** →
   search "BlueRadar"
6. Add the card to a dashboard:
   ```yaml
   type: custom:blueradar-card
   ```

The Lovelace resource is auto-registered, so you don't need to add
anything to `Resources` manually.

### Manual install

1. Copy `custom_components/blueradar/` to your HA config's
   `custom_components/` directory
2. Restart Home Assistant
3. Add the integration via the UI as above

## Card configuration

```yaml
type: custom:blueradar-card
title: BlueRadar              # optional
show_unnamed: true            # default true
show_heatmap: true            # default true
refresh_interval: 15          # seconds, default 15
default_tab: list             # list | tracked | manuf | heatmap
```

## Heat-map controls

| Action | How |
|---|---|
| Zoom in / out | Mouse wheel over the radar |
| Zoom toward cursor | Wheel zooms toward the cursor position |
| Pan | Click and drag |
| Reset view | Double-click, or click the centre-focus button |
| Step zoom | + / − buttons below the radar |
| Track / untrack | Click any dot |

## Example: AI agent workflow

```bash
TOKEN='<your-ha-long-lived-token>'
HOST='https://homeassistant.local:8123'

# 1. Self-discover capabilities (no auth needed)
curl -sk $HOST/api/blueradar/openapi

# 2. Preview what "track all named Apple devices with strong signal"
#    would do
curl -sk -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"named_only":true,"manuf_name":"Apple","min_rssi":-65,"dry_run":true}' \
  $HOST/api/blueradar/track_by_filter

# 3. Apply it
curl -sk -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"named_only":true,"manuf_name":"Apple","min_rssi":-65}' \
  $HOST/api/blueradar/track_by_filter
```

## How tracking works internally

Bermuda has a config entry option called `configured_devices` — a list
of MACs to actively track. When you click **Track** in BlueRadar:

1. BlueRadar reads Bermuda's current `configured_devices` list
2. Adds the new MAC to that list
3. Calls `hass.config_entries.async_update_entry(bermuda_entry, options=new_options)`

That official HA API call triggers Bermuda's own
`async_reload_entry` listener, which spins up the
`device_tracker.<name>_*`, `sensor.<name>_distance`, and
`sensor.<name>_area` entities for the newly tracked MAC, exactly as
if you'd added it through Bermuda's own options flow.

We use the official API rather than editing storage files directly
because it is the only way HA guarantees the backend sees the change.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------|-----|
| Card shows "BlueRadar not loaded" | Integration not added via UI | Settings → Devices & Services → + Add → BlueRadar |
| Track button does nothing | Bermuda not installed | Install Bermuda first |
| `device_tracker.*` not created after track | Bermuda not yet seeded that MAC | Wait one poll cycle (15 s) |
| Card not picking up code changes | Browser cache | Ctrl+Shift+R hard refresh |
| Heat map shows nothing | First poll hasn't completed | Wait ~15 s, or click the refresh button |
| OpenAPI endpoint hangs | HA still starting | Wait for HA to fully boot |

## Privacy & security

- All operations are local. No outbound network calls.
- All write endpoints require an HA long-lived access token.
- The OpenAPI spec is intentionally unauthenticated to allow AI
  agents to self-discover capabilities, but it returns only schema
  metadata, never device data.

## Credits & licence

- BlueRadar is MIT licensed — see [LICENSE](LICENSE)
- Built on [Bermuda BLE Trilateration](https://github.com/agittins/bermuda)
  by [@agittins](https://github.com/agittins) (MIT) — please star
  Bermuda if you find this project useful
- See [NOTICE.md](NOTICE.md) for full acknowledgements

## Contributing

Issues and PRs welcome. Please open an issue describing the problem
or feature before sending a large PR.
