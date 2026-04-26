# Acknowledgements

BlueRadar would not exist without the work of others. This file exists to make
that explicit.

## Bermuda BLE Trilateration

BlueRadar is a management UI, REST API, and Lovelace card layered on top of
the **Bermuda BLE Trilateration integration** for Home Assistant by
[**@agittins**](https://github.com/agittins).

- Repository: https://github.com/agittins/bermuda
- License: MIT (Copyright © 2021 agittins)

Specifically, BlueRadar:

- Reads Bermuda's `configured_devices` option list to know which MACs are
  currently tracked
- Calls Home Assistant's official `hass.config_entries.async_update_entry`
  API on Bermuda's config entry when adding or removing tracked devices
- Relies on Bermuda for the actual location-engine work: distance
  estimation, area assignment, and `device_tracker.*` entity creation

BlueRadar does **not** redistribute Bermuda's code. Bermuda must be
installed separately (via HACS or manually). BlueRadar's track/untrack
features require Bermuda; the read-only views (device list,
manufacturers, heat map) work without it.

If you find BlueRadar useful, please also consider:

- ⭐ Starring https://github.com/agittins/bermuda
- 💖 Sponsoring agittins if you appreciate their work

## Home Assistant

BlueRadar is built for and depends on Home Assistant
(https://www.home-assistant.io/). The bluetooth and bluetooth_adapters
integrations bundled with Home Assistant provide the underlying BLE
discovery on which BlueRadar's read-only views depend.

## HACS

The repository structure follows conventions from
[HACS](https://www.hacs.xyz/) to make community installation simple.

## Iconography

Material Design Icons (https://pictogrammers.com/library/mdi/) are used
throughout the card UI under the Apache 2.0 license.
