"""BlueRadar: rich BLE management + heat map for Home Assistant."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    DOMAIN,
    LOGGER,
    SERVICE_REFRESH,
    SERVICE_TRACK,
    SERVICE_UNTRACK,
)
from .coordinator import BlueRadarCoordinator

PLATFORMS = [Platform.SENSOR]

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

TRACK_SCHEMA = vol.Schema({
    vol.Required("mac"): str,
    vol.Optional("name"): str,
})

UNTRACK_SCHEMA = vol.Schema({vol.Required("mac"): str})


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up BlueRadar from a config entry."""
    coordinator = BlueRadarCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    if not hass.services.has_service(DOMAIN, SERVICE_TRACK):
        async def _track(call: ServiceCall) -> None:
            await coordinator.track_device(call.data["mac"], call.data.get("name"))

        async def _untrack(call: ServiceCall) -> None:
            await coordinator.untrack_device(call.data["mac"])

        async def _refresh(call: ServiceCall) -> None:
            await coordinator.async_request_refresh()

        hass.services.async_register(DOMAIN, SERVICE_TRACK, _track, schema=TRACK_SCHEMA)
        hass.services.async_register(DOMAIN, SERVICE_UNTRACK, _untrack, schema=UNTRACK_SCHEMA)
        hass.services.async_register(DOMAIN, SERVICE_REFRESH, _refresh)

    from . import websocket_api as ws_api
    ws_api.async_register(hass)

    from . import api as rest_api
    rest_api.async_register_views(hass)

    from homeassistant.components.http import StaticPathConfig
    card_dir = Path(__file__).parent / "frontend"
    if card_dir.exists():
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                "/blueradar_static",
                str(card_dir),
                cache_headers=False,
            )
        ])
        try:
            await ws_api.async_register_card_resource(hass)
        except Exception as e:
            LOGGER.warning("Could not auto-register Lovelace card resource: %s", e)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
