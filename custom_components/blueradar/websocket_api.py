"""WebSocket API for the BlueRadar frontend card."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, LOGGER


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_list_devices)
    websocket_api.async_register_command(hass, ws_track)
    websocket_api.async_register_command(hass, ws_untrack)
    websocket_api.async_register_command(hass, ws_refresh)


def _get_coord(hass):
    bucket = hass.data.get(DOMAIN, {})
    if not bucket:
        return None
    return next(iter(bucket.values()))


@websocket_api.websocket_command({vol.Required("type"): "blueradar/list"})
@websocket_api.async_response
async def ws_list_devices(hass, connection, msg):
    coord = _get_coord(hass)
    if coord is None:
        connection.send_error(msg["id"], "not_loaded", "BlueRadar not loaded")
        return
    connection.send_result(msg["id"], coord.data or {})


@websocket_api.websocket_command({
    vol.Required("type"): "blueradar/track",
    vol.Required("mac"): str,
    vol.Optional("name"): str,
})
@websocket_api.async_response
async def ws_track(hass, connection, msg):
    coord = _get_coord(hass)
    if coord is None:
        connection.send_error(msg["id"], "not_loaded", "BlueRadar not loaded")
        return
    result = await coord.track_device(msg["mac"], msg.get("name"))
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({
    vol.Required("type"): "blueradar/untrack",
    vol.Required("mac"): str,
})
@websocket_api.async_response
async def ws_untrack(hass, connection, msg):
    coord = _get_coord(hass)
    if coord is None:
        connection.send_error(msg["id"], "not_loaded", "BlueRadar not loaded")
        return
    result = await coord.untrack_device(msg["mac"])
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): "blueradar/refresh"})
@websocket_api.async_response
async def ws_refresh(hass, connection, msg):
    coord = _get_coord(hass)
    if coord is None:
        connection.send_error(msg["id"], "not_loaded", "BlueRadar not loaded")
        return
    await coord.async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


async def async_register_card_resource(hass: HomeAssistant) -> None:
    """Auto-register /blueradar_static/blueradar-card.js as a Lovelace resource."""
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        return
    resources = getattr(lovelace, "resources", None)
    if resources is None:
        return
    if hasattr(resources, "async_load") and not getattr(resources, "loaded", True):
        await resources.async_load()

    url = "/blueradar_static/blueradar-card.js"
    items = list(resources.async_items()) if hasattr(resources, "async_items") else []
    for item in items:
        if item.get("url") == url:
            return

    try:
        await resources.async_create_item({"res_type": "module", "url": url})
        LOGGER.info("Registered BlueRadar Lovelace card resource")
    except Exception as e:
        LOGGER.warning("Could not register Lovelace resource: %s", e)
