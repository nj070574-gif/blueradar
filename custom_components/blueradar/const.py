"""Constants for BlueRadar.

BlueRadar provides a management UI, REST API, and Lovelace card on top of the
Bermuda BLE trilateration integration by @agittins
(https://github.com/agittins/bermuda, MIT licensed).

We treat Bermuda as the location-engine backend: BlueRadar polls Home
Assistant's bluetooth integration for the live BLE device list, and writes
tracked-device updates to Bermuda's config entry options via the official
HA API (`hass.config_entries.async_update_entry`). Bermuda then handles
distance estimation, area assignment, and `device_tracker.*` entity
creation as it normally would.

Bermuda must be installed and configured for BlueRadar's track/untrack
functionality to work. The read-only views (device list, manufacturers,
heat map) work without it.
"""
import logging

DOMAIN = "blueradar"
NAME = "BlueRadar"
VERSION = "1.2.0"
LOGGER = logging.getLogger(__package__)

# The location-engine integration BlueRadar wraps. Track/untrack operations
# write to this integration's config entry options. See module docstring.
_BACKEND_DOMAIN = "bermuda"
_BACKEND_DEVICES_KEY = "configured_devices"

# Dispatcher signal fired when our device list changes
SIGNAL_DEVICES_UPDATED = f"{DOMAIN}_devices_updated"

# Services
SERVICE_TRACK = "track"
SERVICE_UNTRACK = "untrack"
SERVICE_REFRESH = "refresh"

# Bluetooth SIG company identifiers (subset of common ones)
MANUFACTURERS = {
    6: "Microsoft", 13: "Texas Instruments", 15: "Broadcom", 76: "Apple",
    89: "Nordic Semiconductor", 117: "Samsung", 196: "LG Electronics",
    224: "Google", 301: "Logitech", 343: "Xiaomi", 637: "Polar Electro",
    647: "Withings", 742: "Fitbit", 1281: "Nordic Semiconductor",
    13825: "Bose", 11033: "Generic Beacon", 59761: "Sony", 65535: "Reserved",
}

# RSSI thresholds (dBm)
RSSI_STRONG = -60
RSSI_GOOD = -75
RSSI_WEAK = -90

# Path-loss model defaults (log-distance)
DEFAULT_REF_POWER = -55.0
DEFAULT_ATTENUATION = 3.0


def manuf_name(mid):
    if mid is None:
        return None
    return MANUFACTURERS.get(mid, f"ID {mid}")


def signal_label(rssi):
    if rssi is None:
        return "—"
    if rssi >= RSSI_STRONG:
        return "🟢 strong"
    if rssi >= RSSI_GOOD:
        return "🟡 good"
    if rssi >= RSSI_WEAK:
        return "🟠 weak"
    return "🔴 faint"


def estimate_distance(rssi, ref_power=DEFAULT_REF_POWER, attenuation=DEFAULT_ATTENUATION):
    """Estimate distance in metres from RSSI using log-distance path loss model."""
    if rssi is None or rssi == -127:
        return None
    try:
        return round(10 ** ((ref_power - rssi) / (10.0 * attenuation)), 2)
    except (ValueError, OverflowError):
        return None


def addr_type(mac):
    """Classify a Bluetooth MAC address."""
    try:
        first = int(mac.split(":")[0], 16)
    except (ValueError, IndexError):
        return "?"
    bits = first & 0xC0
    return {
        0x00: "PUBLIC",
        0x40: "RND-RESOLVABLE",
        0x80: "RND-NON-RESOLVABLE",
        0xC0: "RND-STATIC",
    }.get(bits, "?")
