"""Data coordinator for BlueRadar."""
from __future__ import annotations

import time
from datetime import timedelta
from typing import Any

from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    _BACKEND_DEVICES_KEY,
    _BACKEND_DOMAIN,
    DOMAIN,
    LOGGER,
    SIGNAL_DEVICES_UPDATED,
    addr_type,
    estimate_distance,
    manuf_name,
)


class BlueRadarCoordinator(DataUpdateCoordinator):
    """Polls the bluetooth integration for live BLE devices and manages the tracked set."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry):
        super().__init__(
            hass,
            LOGGER,
            name="blueradar",
            update_interval=timedelta(seconds=15),
        )
        self.entry = entry
        self._scanner_count = 0

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch live BLE list directly from the bluetooth integration's API."""
        adv_infos = list(bluetooth.async_discovered_service_info(self.hass, connectable=False))
        try:
            self._scanner_count = bluetooth.async_scanner_count(self.hass, connectable=False)
        except TypeError:
            self._scanner_count = bluetooth.async_scanner_count(self.hass)

        devs = []
        for info in adv_infos:
            mac = info.address
            name = info.name or ""
            local_name = getattr(info, "local_name", None) or ""
            manuf_id = None
            if info.manufacturer_data:
                try:
                    manuf_id = next(iter(info.manufacturer_data.keys()))
                except StopIteration:
                    pass
            rssi = info.rssi if info.rssi is not None else -127
            devs.append({
                "mac": mac.upper(),
                "name": name or local_name,
                "rssi": rssi,
                "manuf_id": manuf_id,
                "manuf_name": manuf_name(manuf_id),
                "addr_type": addr_type(mac),
                "distance_m": estimate_distance(rssi),
                "last_seen_unix": time.time(),
                "service_uuids": list(info.service_uuids or []),
                "tx_power": info.tx_power,
            })

        tracked = self.get_tracked_macs()
        tracked_set = {m.upper() for m in tracked}
        for d in devs:
            d["tracked"] = d["mac"] in tracked_set
        devs.sort(key=lambda x: (
            0 if x["tracked"] else 1,
            0 if x["name"] else 1,
            -(x["rssi"] or -127),
        ))

        named = sum(1 for d in devs if d["name"])
        return {
            "devices": devs,
            "total": len(devs),
            "named": named,
            "unnamed": len(devs) - named,
            "tracked_count": len(tracked),
            "scanner_count": self._scanner_count,
            "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _get_backend_entry(self) -> ConfigEntry | None:
        for ent in self.hass.config_entries.async_entries(_BACKEND_DOMAIN):
            return ent
        return None

    def get_tracked_macs(self) -> list[str]:
        ent = self._get_backend_entry()
        if ent is None:
            return []
        return list(ent.options.get(_BACKEND_DEVICES_KEY, []) or [])

    async def track_device(self, mac: str, name: str | None = None) -> dict[str, Any]:
        mac = mac.upper().strip()
        ent = self._get_backend_entry()
        if ent is None:
            LOGGER.error("Location backend not installed/configured")
            return {"ok": False, "error": "backend_not_found"}

        existing = list(ent.options.get(_BACKEND_DEVICES_KEY, []) or [])
        if mac in (m.upper() for m in existing):
            return {"ok": True, "already_tracked": True, "mac": mac}

        new_options = dict(ent.options)
        new_options[_BACKEND_DEVICES_KEY] = existing + [mac]
        self.hass.config_entries.async_update_entry(ent, options=new_options)
        LOGGER.info("Tracking %s (now %d devices)", mac, len(new_options[_BACKEND_DEVICES_KEY]))

        await self.async_request_refresh()
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_UPDATED)
        return {"ok": True, "mac": mac, "tracked_count": len(new_options[_BACKEND_DEVICES_KEY])}

    async def track_devices_bulk(self, macs: list[str]) -> dict[str, Any]:
        ent = self._get_backend_entry()
        if ent is None:
            return {"ok": False, "error": "backend_not_found"}

        existing = list(ent.options.get(_BACKEND_DEVICES_KEY, []) or [])
        existing_upper = {m.upper() for m in existing}
        added = []
        for m in macs:
            mu = m.upper().strip()
            if mu and mu not in existing_upper:
                existing.append(mu)
                existing_upper.add(mu)
                added.append(mu)
        if not added:
            return {"ok": True, "added": [], "count": 0, "tracked_count": len(existing)}

        new_options = dict(ent.options)
        new_options[_BACKEND_DEVICES_KEY] = existing
        self.hass.config_entries.async_update_entry(ent, options=new_options)
        LOGGER.info("Bulk-tracked %d new (now %d total)", len(added), len(existing))

        await self.async_request_refresh()
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_UPDATED)
        return {"ok": True, "added": added, "count": len(added), "tracked_count": len(existing)}

    async def untrack_device(self, mac: str) -> dict[str, Any]:
        mac = mac.upper().strip()
        ent = self._get_backend_entry()
        if ent is None:
            return {"ok": False, "error": "backend_not_found"}

        existing = list(ent.options.get(_BACKEND_DEVICES_KEY, []) or [])
        new_list = [m for m in existing if m.upper() != mac]
        if len(new_list) == len(existing):
            return {"ok": True, "not_tracked": True, "mac": mac}

        new_options = dict(ent.options)
        new_options[_BACKEND_DEVICES_KEY] = new_list
        self.hass.config_entries.async_update_entry(ent, options=new_options)
        LOGGER.info("Untracked %s (now %d devices)", mac, len(new_list))

        await self.async_request_refresh()
        async_dispatcher_send(self.hass, SIGNAL_DEVICES_UPDATED)
        return {"ok": True, "mac": mac, "tracked_count": len(new_list)}
