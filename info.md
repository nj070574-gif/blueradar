# BlueRadar

A management UI, REST API, and Lovelace card for BLE on Home Assistant
— layered on top of the
[Bermuda BLE Trilateration integration](https://github.com/agittins/bermuda).

**You must install Bermuda separately for full functionality.**
Read-only views (device list, manufacturers, heat map) work without
Bermuda; track/untrack requires it.

## Features

- **Live device list** with one-click track / untrack per row
- **Radar heat-map** with manufacturer-coloured dots, zoom, and pan
- **Manufacturer breakdown** chart
- **REST API** with OpenAPI 3.1 spec for AI agents and external scripts
- **4 summary sensors** ready for automations
- **Auto-registered Lovelace card** — no manual `resources:` editing

## After installing

1. Restart Home Assistant
2. Settings → Devices & Services → **+ Add Integration** → BlueRadar
3. Add to a dashboard:
   ```yaml
   type: custom:blueradar-card
   ```

Full docs and screenshots in the [GitHub README](https://github.com/nj070574-gif/blueradar).
