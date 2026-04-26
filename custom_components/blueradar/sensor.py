"""Sensor platform for BlueRadar."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import BlueRadarCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: BlueRadarCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        BLEDeviceCountSensor(coordinator),
        BLENamedSensor(coordinator),
        BLETrackedSensor(coordinator),
        BLEScannerCountSensor(coordinator),
    ])


class _Base(CoordinatorEntity[BlueRadarCoordinator], SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, coordinator: BlueRadarCoordinator):
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}_{self._key}"

    @property
    def _key(self):
        raise NotImplementedError


class BLEDeviceCountSensor(_Base):
    _key = "ble_devices_total"
    _attr_name = "BLE Devices Total"
    _attr_icon = "mdi:bluetooth"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def native_value(self):
        return self.coordinator.data["total"] if self.coordinator.data else 0

    @property
    def extra_state_attributes(self):
        if not self.coordinator.data:
            return {}
        d = self.coordinator.data
        return {
            "named": d["named"],
            "unnamed": d["unnamed"],
            "tracked_count": d["tracked_count"],
            "updated": d["updated"],
            "devices": d["devices"],
        }


class BLENamedSensor(_Base):
    _key = "ble_devices_named"
    _attr_name = "BLE Devices Named"
    _attr_icon = "mdi:bluetooth-audio"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def native_value(self):
        return self.coordinator.data["named"] if self.coordinator.data else 0


class BLETrackedSensor(_Base):
    _key = "ble_devices_tracked"
    _attr_name = "BLE Devices Tracked"
    _attr_icon = "mdi:map-marker-check"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def native_value(self):
        return self.coordinator.data["tracked_count"] if self.coordinator.data else 0


class BLEScannerCountSensor(_Base):
    _key = "ble_scanners"
    _attr_name = "BLE Scanners"
    _attr_icon = "mdi:radar"
    _attr_state_class = SensorStateClass.MEASUREMENT

    @property
    def native_value(self):
        return self.coordinator.data["scanner_count"] if self.coordinator.data else 0
