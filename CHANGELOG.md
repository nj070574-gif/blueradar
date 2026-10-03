# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-03

### Security
- Write endpoints now require an **admin** Home Assistant user, not just any
  authenticated token. `track`, `untrack`, `track_bulk` and `track_by_filter`
  (REST) and the `blueradar/track` / `blueradar/untrack` WebSocket commands
  mutate the location backend's config, so they are now restricted to admin
  tokens. Read endpoints and the device-list card are unchanged (auth-only);
  the OpenAPI spec stays unauthenticated for self-discovery.
- MAC addresses are validated (`^[0-9A-F]{2}(:..){5}$`, case-insensitive) and
  normalised before anything is written to the backend's `configured_devices`
  list, so a malformed value can no longer pollute the backend config. Bulk
  track reports any skipped invalid entries in `skipped_invalid`.

### Fixed
- `track_by_filter` returned HTTP 500 when `min_rssi` (or `limit`) in the JSON
  body was non-numeric; both are now validated and rejected with a clear 400.
- `track_bulk` no longer errors on a non-string entry in the `macs` array —
  invalid entries are validated and skipped.

## [1.2.0] - 2026-04-26

### Added
- Heat-map zoom and pan: mouse wheel zoom (toward cursor),
  click-drag to pan, double-click to reset, on-screen zoom
  controls (+/− buttons + reset, with current zoom level
  shown as a percentage), touch support via pointer events.
- Animated pulsing scanner-centre marker on the heat-map.
- Gradient backdrop on the radar disc.
- Soft halos around dots for better visibility.
- Collision-avoidance dot placement: devices in the same
  distance ring are spread evenly by angle so all dots are
  visible.
- Larger default dot sizes.

### Changed
- Default colour for unknown manufacturers changed from
  `--secondary-text-color` (often invisible) to a fixed
  visible grey (`#94a3b8`).
- Default stroke colour for untracked dots changed from
  semi-transparent white to a visible dark slate.
- Card now refreshes immediately on first `hass` setter
  call, instead of waiting for the next 15-second poll
  interval.

### Fixed
- Heat-map dots were difficult or impossible to see on
  some Lovelace themes.

## [1.0.0] - 2026-04-26

### Added
- Initial public release.
- Custom integration: 4 summary sensors, 3 services
  (track / untrack / refresh), config flow.
- WebSocket API for the frontend card.
- REST API: 10 endpoints + OpenAPI 3.1 spec served
  unauthenticated for AI agent self-discovery.
- Custom Lovelace card with 4 tabs: All Devices /
  Tracked / Manufacturers / Heat Map.
- Live filter input and per-row track / untrack buttons.
- Manufacturer breakdown bar chart.
- Radar heat-map view.
- Auto-registration of the Lovelace card resource on
  setup, so users don't need to edit `resources:`
  manually.
