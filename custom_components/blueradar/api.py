"""HTTP REST API for BlueRadar.

Designed for programmatic access by AI bots and external scripts.
All write endpoints require Home Assistant authentication via Bearer token.

Base URL: https://<ha-host>:8123/api/blueradar/

Endpoints:
  GET  /api/blueradar/devices
  GET  /api/blueradar/tracked
  GET  /api/blueradar/device/<mac>
  POST /api/blueradar/track          {"mac": "AA:BB:..", "name": "optional"}
  POST /api/blueradar/untrack        {"mac": "AA:BB:.."}
  POST /api/blueradar/track_bulk     {"macs": ["AA:..", "BB:.."]}
  POST /api/blueradar/track_by_filter {"named_only": true, "min_rssi": -75, ...}
  POST /api/blueradar/refresh
  GET  /api/blueradar/stats
  GET  /api/blueradar/openapi
"""
from __future__ import annotations

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, LOGGER, NAME, VERSION


def _get_coord(hass):
    bucket = hass.data.get(DOMAIN, {})
    if not bucket:
        return None
    return next(iter(bucket.values()))


def _filter_devices(devices, *, named_only=False, tracked_only=False,
                    min_rssi=None, manuf_name=None, addr_type=None):
    out = devices
    if named_only:
        out = [d for d in out if d.get("name")]
    if tracked_only:
        out = [d for d in out if d.get("tracked")]
    if min_rssi is not None:
        out = [d for d in out if (d.get("rssi") or -127) >= min_rssi]
    if manuf_name:
        ml = manuf_name.lower()
        out = [d for d in out if (d.get("manuf_name") or "").lower() == ml]
    if addr_type:
        out = [d for d in out if d.get("addr_type") == addr_type]
    return out


class _BaseView(HomeAssistantView):
    requires_auth = True

    def _coord(self, request):
        return _get_coord(request.app["hass"])

    def _err(self, msg, code=400):
        return self.json({"ok": False, "error": msg}, status_code=code)


class DevicesView(_BaseView):
    url = "/api/blueradar/devices"
    name = "api:blueradar:devices"

    async def get(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        q = request.query
        try:
            min_rssi = int(q["min_rssi"]) if "min_rssi" in q else None
        except ValueError:
            return self._err("invalid min_rssi")
        devs = _filter_devices(
            coord.data.get("devices", []) if coord.data else [],
            named_only=q.get("named_only") in ("1", "true", "yes"),
            tracked_only=q.get("tracked_only") in ("1", "true", "yes"),
            min_rssi=min_rssi,
            manuf_name=q.get("manuf_name"),
            addr_type=q.get("addr_type"),
        )
        return self.json({
            "ok": True,
            "count": len(devs),
            "updated": coord.data.get("updated") if coord.data else None,
            "devices": devs,
        })


class TrackedView(_BaseView):
    url = "/api/blueradar/tracked"
    name = "api:blueradar:tracked"

    async def get(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        return self.json({"ok": True, "tracked": coord.get_tracked_macs()})


class DeviceDetailView(_BaseView):
    url = "/api/blueradar/device/{mac}"
    name = "api:blueradar:device_detail"

    async def get(self, request: web.Request, mac: str):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        mac = mac.upper()
        for d in (coord.data.get("devices", []) if coord.data else []):
            if d["mac"] == mac:
                return self.json({"ok": True, "device": d})
        return self._err(f"device {mac} not currently visible", 404)


class TrackView(_BaseView):
    url = "/api/blueradar/track"
    name = "api:blueradar:track"

    async def post(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        try:
            body = await request.json()
        except Exception:
            return self._err("invalid json")
        mac = body.get("mac")
        if not mac:
            return self._err("mac required")
        result = await coord.track_device(mac, body.get("name"))
        return self.json(result)


class UntrackView(_BaseView):
    url = "/api/blueradar/untrack"
    name = "api:blueradar:untrack"

    async def post(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        try:
            body = await request.json()
        except Exception:
            return self._err("invalid json")
        mac = body.get("mac")
        if not mac:
            return self._err("mac required")
        result = await coord.untrack_device(mac)
        return self.json(result)


class TrackBulkView(_BaseView):
    url = "/api/blueradar/track_bulk"
    name = "api:blueradar:track_bulk"

    async def post(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        try:
            body = await request.json()
        except Exception:
            return self._err("invalid json")
        macs = body.get("macs") or []
        if not isinstance(macs, list) or not macs:
            return self._err("macs (non-empty array) required")
        result = await coord.track_devices_bulk([m.upper() for m in macs])
        return self.json(result)


class TrackByFilterView(_BaseView):
    url = "/api/blueradar/track_by_filter"
    name = "api:blueradar:track_by_filter"

    async def post(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        try:
            body = await request.json()
        except Exception:
            return self._err("invalid json")
        devs = coord.data.get("devices", []) if coord.data else []
        filtered = _filter_devices(
            devs,
            named_only=bool(body.get("named_only")),
            min_rssi=body.get("min_rssi"),
            manuf_name=body.get("manuf_name"),
            addr_type=body.get("addr_type"),
        )
        filtered = [d for d in filtered if not d.get("tracked")]
        if "limit" in body and isinstance(body["limit"], int):
            filtered = filtered[: body["limit"]]
        macs = [d["mac"] for d in filtered]
        if body.get("dry_run"):
            return self.json({
                "ok": True, "dry_run": True,
                "would_add": macs, "count": len(macs),
                "preview": [{"mac": d["mac"], "name": d.get("name"), "rssi": d.get("rssi")} for d in filtered],
            })
        if not macs:
            return self.json({"ok": True, "added": [], "count": 0,
                              "note": "filter matched no untracked devices"})
        result = await coord.track_devices_bulk(macs)
        return self.json({**result, "matched": len(macs)})


class RefreshView(_BaseView):
    url = "/api/blueradar/refresh"
    name = "api:blueradar:refresh"

    async def post(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        await coord.async_request_refresh()
        return self.json({"ok": True, "updated": coord.data.get("updated") if coord.data else None})


class StatsView(_BaseView):
    url = "/api/blueradar/stats"
    name = "api:blueradar:stats"

    async def get(self, request: web.Request):
        coord = self._coord(request)
        if coord is None:
            return self._err("not_loaded", 503)
        d = coord.data or {}
        devs = d.get("devices", [])
        manuf_counts: dict[str, int] = {}
        addr_counts: dict[str, int] = {}
        rssi_buckets = {"strong": 0, "good": 0, "weak": 0, "faint": 0}
        for x in devs:
            mn = x.get("manuf_name") or "Unknown"
            manuf_counts[mn] = manuf_counts.get(mn, 0) + 1
            at = x.get("addr_type") or "?"
            addr_counts[at] = addr_counts.get(at, 0) + 1
            r = x.get("rssi") or -127
            if r >= -60:
                rssi_buckets["strong"] += 1
            elif r >= -75:
                rssi_buckets["good"] += 1
            elif r >= -90:
                rssi_buckets["weak"] += 1
            else:
                rssi_buckets["faint"] += 1
        return self.json({
            "ok": True,
            "total": d.get("total", 0),
            "named": d.get("named", 0),
            "unnamed": d.get("unnamed", 0),
            "tracked_count": d.get("tracked_count", 0),
            "scanner_count": d.get("scanner_count", 0),
            "updated": d.get("updated"),
            "manufacturers": manuf_counts,
            "addr_types": addr_counts,
            "signal_buckets": rssi_buckets,
        })


class OpenAPIView(_BaseView):
    """OpenAPI 3.1 spec for self-describing AI agent consumption."""
    url = "/api/blueradar/openapi"
    name = "api:blueradar:openapi"
    requires_auth = False

    async def get(self, request: web.Request):
        spec = {
            "openapi": "3.1.0",
            "info": {
                "title": f"{NAME} API",
                "version": VERSION,
                "description": (
                    "REST API for managing BLE devices through BlueRadar.\n\n"
                    "All write endpoints require a Home Assistant long-lived access token in the "
                    "`Authorization: Bearer <token>` header. The OpenAPI spec itself is "
                    "unauthenticated so AI agents can self-discover capabilities."
                ),
            },
            "servers": [{"url": "/api/blueradar"}],
            "components": {
                "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer"}},
                "schemas": {
                    "Device": {
                        "type": "object",
                        "properties": {
                            "mac": {"type": "string", "example": "AA:BB:CC:DD:EE:FF"},
                            "name": {"type": "string"},
                            "rssi": {"type": "integer", "description": "dBm"},
                            "manuf_id": {"type": "integer", "nullable": True},
                            "manuf_name": {"type": "string", "nullable": True},
                            "addr_type": {"type": "string", "enum": ["PUBLIC", "RND-STATIC", "RND-RESOLVABLE", "RND-NON-RESOLVABLE"]},
                            "distance_m": {"type": "number", "nullable": True},
                            "tracked": {"type": "boolean"},
                            "service_uuids": {"type": "array", "items": {"type": "string"}},
                            "tx_power": {"type": "integer", "nullable": True},
                        },
                    }
                },
            },
            "security": [{"bearerAuth": []}],
            "paths": {
                "/devices": {"get": {"summary": "List visible BLE devices",
                    "parameters": [
                        {"name": "named_only", "in": "query", "schema": {"type": "boolean"}},
                        {"name": "tracked_only", "in": "query", "schema": {"type": "boolean"}},
                        {"name": "min_rssi", "in": "query", "schema": {"type": "integer"}},
                        {"name": "manuf_name", "in": "query", "schema": {"type": "string"}},
                        {"name": "addr_type", "in": "query", "schema": {"type": "string"}},
                    ]}},
                "/tracked": {"get": {"summary": "List currently tracked MACs"}},
                "/device/{mac}": {"get": {"summary": "Get one device",
                    "parameters": [{"name": "mac", "in": "path", "required": True, "schema": {"type": "string"}}]}},
                "/track": {"post": {"summary": "Track a single BLE device",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {
                        "type": "object", "required": ["mac"],
                        "properties": {"mac": {"type": "string"}, "name": {"type": "string"}}}}}}}},
                "/untrack": {"post": {"summary": "Untrack a single BLE device",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {
                        "type": "object", "required": ["mac"],
                        "properties": {"mac": {"type": "string"}}}}}}}},
                "/track_bulk": {"post": {"summary": "Track multiple BLE devices",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {
                        "type": "object", "required": ["macs"],
                        "properties": {"macs": {"type": "array", "items": {"type": "string"}}}}}}}}},
                "/track_by_filter": {"post": {
                    "summary": "Track all currently-visible devices matching a filter",
                    "description": "Useful for AI agents: e.g. 'track every named Apple device with strong signal'. Use dry_run=true first to preview.",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "named_only": {"type": "boolean"},
                            "min_rssi": {"type": "integer"},
                            "manuf_name": {"type": "string"},
                            "addr_type": {"type": "string"},
                            "limit": {"type": "integer"},
                            "dry_run": {"type": "boolean"}}}}}}}},
                "/refresh": {"post": {"summary": "Force a re-poll"}},
                "/stats": {"get": {"summary": "Summary statistics"}},
                "/openapi": {"get": {"summary": "This OpenAPI spec"}},
            },
        }
        return self.json(spec)


def async_register_views(hass: HomeAssistant) -> None:
    """Register all REST API views."""
    for view_cls in (
        DevicesView, TrackedView, DeviceDetailView,
        TrackView, UntrackView, TrackBulkView, TrackByFilterView,
        RefreshView, StatsView, OpenAPIView,
    ):
        hass.http.register_view(view_cls())
    LOGGER.info("BlueRadar REST API registered (10 endpoints)")
