/**
 * BlueRadar Card
 * ==============
 * A Lovelace card for Home Assistant providing live Bluetooth Low Energy
 * device management with a built-in radar / heat-map visualisation.
 *
 * BlueRadar is a management UI on top of the Bermuda BLE trilateration
 * integration by @agittins (https://github.com/agittins/bermuda, MIT).
 *
 * Configuration (Lovelace YAML):
 *   type: custom:blueradar-card
 *   title: BlueRadar                # optional
 *   show_unnamed: true              # default true
 *   show_heatmap: true              # default true
 *   refresh_interval: 15            # seconds, default 15
 *   default_tab: list               # list | tracked | manuf | heatmap
 *
 * SPDX-License-Identifier: MIT
 */

const BR_VERSION = "1.2.0";

class BlueRadarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._devices = [];
    this._meta = {};
    this._lastFetch = 0;
    this._busy = new Set();
    this._tab = "list";
    this._filter = "";
    // Heat-map view transform
    this._zoom = 1.0;       // 1.0 = fit to view, larger = zoomed in
    this._panX = 0;         // pan offsets in viewBox units
    this._panY = 0;
    this._dragging = false;
    this._dragStart = null;
    this._pinchDist = null;
  }

  setConfig(config) {
    this._config = {
      title: "BlueRadar",
      show_unnamed: true,
      show_heatmap: true,
      refresh_interval: 15,
      default_tab: "list",
      ...config,
    };
    this._tab = this._config.default_tab || "list";
    this._render();
  }

  set hass(hass) {
    const wasFirstSet = !this._hass;
    this._hass = hass;
    if (wasFirstSet || Date.now() - this._lastFetch > (this._config.refresh_interval || 15) * 1000) {
      this._refresh();
    }
  }

  async _ws(type, payload = {}) {
    if (!this._hass) return null;
    try {
      return await this._hass.callWS({ type, ...payload });
    } catch (e) {
      console.error("BlueRadar WS error", type, e);
      return null;
    }
  }

  async _refresh() {
    this._lastFetch = Date.now();
    const data = await this._ws("blueradar/list");
    if (data) {
      this._devices = data.devices || [];
      this._meta = {
        total: data.total,
        named: data.named,
        unnamed: data.unnamed,
        tracked_count: data.tracked_count,
        scanner_count: data.scanner_count,
        updated: data.updated,
      };
      this._render();
    }
  }

  async _track(mac, name) {
    if (this._busy.has(mac)) return;
    this._busy.add(mac);
    this._render();
    await this._ws("blueradar/track", { mac, name: name || "" });
    this._busy.delete(mac);
    await this._refresh();
  }

  async _untrack(mac) {
    if (this._busy.has(mac)) return;
    this._busy.add(mac);
    this._render();
    await this._ws("blueradar/untrack", { mac });
    this._busy.delete(mac);
    await this._refresh();
  }

  _signal(rssi) {
    if (rssi === null || rssi === undefined) return { c: "var(--secondary-text-color)", l: "—" };
    if (rssi >= -60) return { c: "#22c55e", l: "strong" };
    if (rssi >= -75) return { c: "#eab308", l: "good" };
    if (rssi >= -90) return { c: "#f97316", l: "weak" };
    return { c: "#ef4444", l: "faint" };
  }

  _bars(rssi) {
    if (rssi === null || rssi === undefined) return 0;
    if (rssi >= -60) return 4;
    if (rssi >= -70) return 3;
    if (rssi >= -85) return 2;
    if (rssi >= -100) return 1;
    return 0;
  }

  _manufBreakdown() {
    const counts = {};
    for (const d of this._devices) {
      const k = d.manuf_name || "Unknown";
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  _render() {
    if (!this.shadowRoot) return;
    const html = `
      <style>${this._styles()}</style>
      <ha-card>
        ${this._headerHtml()}
        ${this._tabsHtml()}
        <div class="content">
          ${this._tab === "list" ? this._listHtml() : ""}
          ${this._tab === "tracked" ? this._trackedHtml() : ""}
          ${this._tab === "manuf" ? this._manufHtml() : ""}
          ${this._tab === "heatmap" ? this._heatmapHtml() : ""}
        </div>
        ${this._footerHtml()}
      </ha-card>
    `;
    this.shadowRoot.innerHTML = html;
    this._wireEvents();
  }

  _styles() {
    return `
      :host { display: block; }
      ha-card { padding: 0; overflow: hidden; }
      .header {
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(135deg, rgba(14,165,233,0.08), rgba(99,102,241,0.04));
        border-bottom: 1px solid var(--divider-color);
      }
      .header .logo {
        width: 36px; height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #0ea5e9, #6366f1);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(14,165,233,0.3);
      }
      .header .logo ha-icon { --mdc-icon-size: 22px; color: #fff; }
      .header .title-block { flex: 1; min-width: 0; }
      .header .title {
        font-size: 1.15em; font-weight: 600;
        background: linear-gradient(135deg, #0ea5e9, #6366f1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .header .subtitle {
        font-size: 0.75em; color: var(--secondary-text-color); margin-top: 2px;
      }
      .header .stats {
        display: flex;
        gap: 14px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      .header .stats span { white-space: nowrap; }
      .header .stats b { color: var(--primary-text-color); margin-right: 3px; font-weight: 600; }
      .tabs {
        display: flex;
        background: var(--secondary-background-color);
        border-bottom: 1px solid var(--divider-color);
      }
      .tab {
        flex: 1;
        padding: 10px;
        text-align: center;
        cursor: pointer;
        font-size: 0.9em;
        color: var(--secondary-text-color);
        border-bottom: 2px solid transparent;
        transition: all 0.15s;
      }
      .tab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
        background: var(--card-background-color);
      }
      .tab:hover:not(.active) { background: var(--card-background-color); }
      .content { padding: 8px 0; min-height: 200px; }
      .filter-bar { padding: 8px 16px; }
      .filter-bar input {
        width: 100%;
        padding: 6px 10px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        color: var(--primary-text-color);
        font-size: 0.9em;
        box-sizing: border-box;
      }
      .device-list { display: flex; flex-direction: column; }
      .device-row {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        gap: 12px;
        align-items: center;
        padding: 10px 16px;
        border-bottom: 1px solid var(--divider-color);
        transition: background 0.15s;
      }
      .device-row:hover { background: var(--secondary-background-color); }
      .device-row.tracked { background: rgba(34, 197, 94, 0.06); }
      .signal-icon { display: flex; align-items: end; gap: 1px; height: 16px; }
      .signal-icon span {
        width: 3px;
        background: var(--secondary-text-color);
        opacity: 0.3;
        border-radius: 1px;
      }
      .signal-icon span.lit { opacity: 1; }
      .signal-icon span:nth-child(1) { height: 4px; }
      .signal-icon span:nth-child(2) { height: 7px; }
      .signal-icon span:nth-child(3) { height: 11px; }
      .signal-icon span:nth-child(4) { height: 15px; }
      .device-info { min-width: 0; overflow: hidden; }
      .device-name {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .device-name.unknown { color: var(--secondary-text-color); font-style: italic; }
      .device-meta {
        font-size: 0.78em;
        color: var(--secondary-text-color);
        font-family: var(--code-font-family, monospace);
        margin-top: 2px;
      }
      .device-rssi {
        font-family: var(--code-font-family, monospace);
        font-size: 0.85em;
        color: var(--secondary-text-color);
        text-align: right;
        white-space: nowrap;
      }
      .device-rssi b { color: var(--primary-text-color); }
      .badge {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 10px;
        font-size: 0.68em;
        font-weight: 600;
        background: var(--divider-color);
        color: var(--primary-text-color);
        margin-left: 6px;
        vertical-align: middle;
      }
      .badge.public { background: rgba(34, 197, 94, 0.15); color: #16a34a; }
      .badge.random { background: rgba(234, 179, 8, 0.15); color: #ca8a04; }
      .badge.tracked { background: rgba(34, 197, 94, 0.22); color: #15803d; }
      button.action {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border: none;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85em;
        font-weight: 500;
        transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
        min-width: 70px;
      }
      button.action:hover:not(:disabled) { opacity: 0.85; }
      button.action:active:not(:disabled) { transform: scale(0.97); }
      button.action.untrack { background: var(--error-color, #ef4444); }
      button.action:disabled { opacity: 0.5; cursor: not-allowed; }
      button.action .spinner {
        display: inline-block;
        width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: br-spin 0.6s linear infinite;
        vertical-align: middle;
      }
      @keyframes br-spin { to { transform: rotate(360deg); } }
      .footer {
        padding: 8px 16px;
        font-size: 0.75em;
        color: var(--secondary-text-color);
        text-align: right;
        border-top: 1px solid var(--divider-color);
        background: var(--secondary-background-color);
      }
      .footer a { color: var(--primary-color); text-decoration: none; }
      .empty {
        text-align: center;
        padding: 40px 16px;
        color: var(--secondary-text-color);
        font-style: italic;
      }
      /* Manufacturer chart */
      .manuf-chart { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
      .manuf-row {
        display: grid;
        grid-template-columns: 140px 1fr 80px;
        gap: 12px;
        align-items: center;
        font-size: 0.9em;
      }
      .manuf-bar {
        height: 18px;
        background: var(--divider-color);
        border-radius: 3px;
        overflow: hidden;
      }
      .manuf-bar .fill {
        height: 100%;
        background: linear-gradient(90deg, #0ea5e9, #6366f1);
        transition: width 0.3s;
      }
      .manuf-row .num {
        text-align: right;
        font-family: var(--code-font-family, monospace);
        color: var(--secondary-text-color);
        font-size: 0.85em;
      }
      /* Heat map */
      .heatmap-wrap { padding: 16px; }
      .heatmap-svg {
        width: 100%; height: auto; max-height: 520px; display: block;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      .heatmap-svg.dragging { cursor: grabbing; }
      .heatmap-svg .zoom-pan { transition: transform 0.05s ease-out; }
      .heatmap-controls {
        display: flex; align-items: center; gap: 6px;
        margin-top: 10px; justify-content: center;
        font-size: 0.85em;
      }
      .zc-btn {
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        color: var(--primary-text-color);
        width: 30px; height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.1em;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        padding: 0;
      }
      .zc-btn:hover {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: var(--primary-color);
      }
      .zc-level {
        font-family: var(--code-font-family, monospace);
        color: var(--secondary-text-color);
        margin-left: 8px;
        min-width: 44px;
        text-align: center;
      }
      .heatmap-svg .ring-label {
        fill: var(--secondary-text-color); font-size: 10px;
      }
      .heatmap-svg .center-label {
        fill: var(--primary-text-color); font-size: 11px; font-weight: 600;
      }
      .heatmap-svg .dot-label {
        fill: var(--primary-text-color); font-size: 10px;
      }
      .bd-dot { transition: r 0.15s; }
      .bd-dot:hover circle { r: 9; }
      .heatmap-legend {
        display: flex; gap: 16px; flex-wrap: wrap;
        justify-content: center;
        margin-top: 12px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }
      .heatmap-legend .swatch {
        display: inline-block;
        width: 12px; height: 12px;
        border-radius: 50%;
        margin-right: 4px;
        vertical-align: middle;
      }
      .caveat {
        margin-top: 10px;
        font-size: 0.72em;
        color: var(--secondary-text-color);
        text-align: center;
        padding: 0 16px;
      }
    `;
  }

  _headerHtml() {
    const m = this._meta;
    return `
      <div class="header">
        <div class="logo"><ha-icon icon="mdi:radar"></ha-icon></div>
        <div class="title-block">
          <div class="title">${this._escape(this._config.title)}</div>
          <div class="subtitle">Bluetooth Low Energy device manager</div>
        </div>
        <div class="stats">
          <span><b>${m.total ?? "—"}</b>visible</span>
          <span><b>${m.named ?? "—"}</b>named</span>
          <span><b>${m.tracked_count ?? "—"}</b>tracked</span>
          <span><b>${m.scanner_count ?? "—"}</b>scanners</span>
        </div>
      </div>
    `;
  }

  _tabsHtml() {
    const tabs = [
      ["list", "All Devices", "mdi:format-list-bulleted"],
      ["tracked", "Tracked", "mdi:map-marker-check"],
      ["manuf", "Manufacturers", "mdi:factory"],
    ];
    if (this._config.show_heatmap) tabs.push(["heatmap", "Heat Map", "mdi:radar"]);
    return `
      <div class="tabs">
        ${tabs.map(([k, l, ic]) =>
          `<div class="tab ${this._tab === k ? "active" : ""}" data-tab="${k}">
            <ha-icon icon="${ic}" style="--mdc-icon-size:16px;vertical-align:-3px"></ha-icon>
            ${l}
          </div>`
        ).join("")}
      </div>
    `;
  }

  _filterBarHtml() {
    return `
      <div class="filter-bar">
        <input type="text" class="filter-input" placeholder="Filter by name, MAC or manufacturer…" value="${this._escape(this._filter || "")}">
      </div>
    `;
  }

  _matchesFilter(d) {
    if (!this._filter) return true;
    const f = this._filter.toLowerCase();
    return (
      (d.name || "").toLowerCase().includes(f) ||
      (d.mac || "").toLowerCase().includes(f) ||
      (d.manuf_name || "").toLowerCase().includes(f)
    );
  }

  _deviceRowHtml(d) {
    const sig = this._signal(d.rssi);
    const bars = this._bars(d.rssi);
    const isBusy = this._busy.has(d.mac);
    const buttonLabel = isBusy
      ? '<span class="spinner"></span>'
      : (d.tracked ? "Untrack" : "Track");
    const buttonClass = d.tracked ? "action untrack" : "action";
    const dataAttr = `data-mac="${d.mac}" data-action="${d.tracked ? "untrack" : "track"}"`;
    const addrBadge = d.addr_type === "PUBLIC"
      ? '<span class="badge public" title="Stable public OUI">PUB</span>'
      : (d.addr_type && d.addr_type.startsWith("RND") ? '<span class="badge random" title="Random/private MAC - may rotate">RND</span>' : "");
    const trackedBadge = d.tracked ? '<span class="badge tracked">●&nbsp;TRACKED</span>' : "";
    const distance = d.distance_m != null ? ` · ~${d.distance_m}m` : "";
    return `
      <div class="device-row ${d.tracked ? "tracked" : ""}">
        <div class="signal-icon" title="${d.rssi} dBm — ${sig.l}">
          ${[1, 2, 3, 4].map(i => `<span class="${i <= bars ? "lit" : ""}" style="${i <= bars ? `background:${sig.c}` : ""}"></span>`).join("")}
        </div>
        <div class="device-info">
          <div class="device-name ${d.name ? "" : "unknown"}">
            ${this._escape(d.name || "(unknown)")}
            ${trackedBadge}
            ${addrBadge}
          </div>
          <div class="device-meta">${d.mac}${d.manuf_name ? " · " + this._escape(d.manuf_name) : ""}${distance}</div>
        </div>
        <div class="device-rssi"><b>${d.rssi}</b> dBm</div>
        <button class="${buttonClass}" ${dataAttr} ${isBusy ? "disabled" : ""}>${buttonLabel}</button>
      </div>
    `;
  }

  _listHtml() {
    let devs = this._devices;
    if (!this._config.show_unnamed) devs = devs.filter(d => d.name);
    devs = devs.filter(d => this._matchesFilter(d));
    if (devs.length === 0) {
      return this._filterBarHtml() + `<div class="empty">No matching devices.</div>`;
    }
    return this._filterBarHtml() + `<div class="device-list">${devs.map(d => this._deviceRowHtml(d)).join("")}</div>`;
  }

  _trackedHtml() {
    const devs = this._devices.filter(d => d.tracked);
    if (devs.length === 0) {
      return `<div class="empty">No devices tracked yet.<br>Click <strong>Track</strong> on any device in the All Devices tab.</div>`;
    }
    return `<div class="device-list">${devs.map(d => this._deviceRowHtml(d)).join("")}</div>`;
  }

  _manufHtml() {
    const breakdown = this._manufBreakdown();
    const total = this._devices.length || 1;
    if (breakdown.length === 0) return `<div class="empty">No data yet.</div>`;
    return `
      <div class="manuf-chart">
        ${breakdown.map(([name, count]) => {
          const pct = (100 * count / total).toFixed(1);
          return `
            <div class="manuf-row">
              <div>${this._escape(name)}</div>
              <div class="manuf-bar"><div class="fill" style="width:${pct}%"></div></div>
              <div class="num">${count} (${pct}%)</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  _heatmapHtml() {
    const SIZE = 480;
    const CENTER = SIZE / 2;
    const MAX_RADIUS = SIZE / 2 - 30;
    const MAX_DIST = 25;

    const colourFor = (mn) => {
      const map = {
        "Apple": "#0ea5e9", "Samsung": "#14b8a6", "Microsoft": "#22c55e",
        "Bose": "#a855f7", "Sony": "#ec4899", "LG Electronics": "#f97316",
        "Google": "#84cc16", "Nordic Semiconductor": "#3b82f6",
        "Generic Beacon": "#eab308",
      };
      return map[mn] || "#94a3b8";
    };

    const macToAngle = (mac) => {
      let h = 0;
      for (const c of mac) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
      return (h / 0xffff) * 2 * Math.PI;
    };

    const rings = [5, 10, 15, 20, 25].map(r => {
      const px = (r / MAX_DIST) * MAX_RADIUS;
      return `
        <circle cx="${CENTER}" cy="${CENTER}" r="${px}" fill="none"
                stroke="var(--divider-color)" stroke-width="1" stroke-dasharray="2,3"/>
        <text x="${CENTER + px - 4}" y="${CENTER - 4}" class="ring-label" text-anchor="end">${r}m</text>
      `;
    }).join("");

    const crosshairs = `
      <line x1="${CENTER}" y1="20" x2="${CENTER}" y2="${SIZE - 20}"
            stroke="var(--divider-color)" stroke-width="1" stroke-dasharray="1,4"/>
      <line x1="20" y1="${CENTER}" x2="${SIZE - 20}" y2="${CENTER}"
            stroke="var(--divider-color)" stroke-width="1" stroke-dasharray="1,4"/>
    `;

    // Collision-avoidance: bucket by 1m ring, spread angles evenly so all devices visible
    const _withDist = this._devices.filter(x => x.distance_m != null);
    _withDist.sort((a,b) => a.distance_m - b.distance_m);
    const _ringBuckets = new Map();
    _withDist.forEach(x => {
      const r = Math.min(Math.floor(x.distance_m), MAX_DIST);
      if (!_ringBuckets.has(r)) _ringBuckets.set(r, []);
      _ringBuckets.get(r).push(x);
    });
    const _angles = new Map();
    _ringBuckets.forEach((devs, r) => {
      devs.sort((a,b) => a.mac.localeCompare(b.mac));
      const offset = (r * 17 * Math.PI) / 180;
      devs.forEach((d, i) => _angles.set(d.mac, offset + (i * 2 * Math.PI / devs.length)));
    });
    const dots = this._devices.map(d => {
      if (d.distance_m == null) return "";
      const dist = Math.min(d.distance_m, MAX_DIST);
      const radius_px = (dist / MAX_DIST) * MAX_RADIUS;
      const angle = _angles.get(d.mac) ?? macToAngle(d.mac);
      const x = CENTER + radius_px * Math.cos(angle);
      const y = CENTER + radius_px * Math.sin(angle);
      const dotSize = d.tracked ? 10 : (d.rssi >= -60 ? 8 : d.rssi >= -75 ? 7 : 6);
      const colour = colourFor(d.manuf_name);
      const stroke = d.tracked ? '#16a34a' : '#1e293b';
      const strokeWidth = d.tracked ? 2.5 : 1;
      const label = d.name ? d.name.substring(0, 14) : "";
      const titleAttr = `${d.name || "(unknown)"} · ${d.mac} · ${d.rssi} dBm · ~${d.distance_m}m${d.tracked ? " · TRACKED" : ""}`;
      return `
        <g class="bd-dot" data-mac="${d.mac}" style="cursor:pointer">
          <title>${this._escape(titleAttr)}</title>
          <circle cx="${x}" cy="${y}" r="${dotSize + 5}"
                  fill="${colour}" fill-opacity="0.18"/>
          <circle cx="${x}" cy="${y}" r="${dotSize}"
                  fill="${colour}" fill-opacity="0.95"
                  stroke="${stroke}" stroke-width="${strokeWidth}"/>
          ${(d.tracked || d.name) && label ? `<text x="${x + dotSize + 3}" y="${y + 3}" class="dot-label">${this._escape(label)}</text>` : ""}
        </g>
      `;
    }).join("");

    const centreMarker = `
      <circle cx="${CENTER}" cy="${CENTER}" r="22" fill="none"
              stroke="#0ea5e9" stroke-width="1" stroke-opacity="0.3">
        <animate attributeName="r" values="14;30;14" dur="3s" repeatCount="indefinite"/>
        <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${CENTER}" cy="${CENTER}" r="14" fill="none"
              stroke="#0ea5e9" stroke-width="1" stroke-opacity="0.5"/>
      <circle cx="${CENTER}" cy="${CENTER}" r="9" fill="#0ea5e9"/>
      <text x="${CENTER}" y="${CENTER + 38}" class="center-label" text-anchor="middle">HA Scanner</text>
    `;

    const legendItems = [
      ["Apple", "#0ea5e9"], ["Samsung", "#14b8a6"], ["Microsoft", "#22c55e"],
      ["Bose", "#a855f7"], ["Sony", "#ec4899"], ["LG", "#f97316"],
      ["Other", "var(--secondary-text-color)"],
    ];

    return `
      <div class="heatmap-wrap">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" class="heatmap-svg" data-size="${SIZE}">
          <g class="zoom-pan" transform="translate(${SIZE/2 + this._panX}, ${SIZE/2 + this._panY}) scale(${this._zoom}) translate(${-SIZE/2}, ${-SIZE/2})">
          <defs>
            <radialGradient id="brBack" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.12"/>
              <stop offset="60%" stop-color="#0ea5e9" stop-opacity="0.04"/>
              <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="${CENTER}" cy="${CENTER}" r="${MAX_RADIUS}" fill="url(#brBack)"/>
          ${rings}
          ${crosshairs}
          ${dots}
          ${centreMarker}
        </svg>
        <div class="heatmap-controls">
          <button class="zc-btn" data-zc="in" title="Zoom in">+</button>
          <button class="zc-btn" data-zc="out" title="Zoom out">−</button>
          <button class="zc-btn" data-zc="reset" title="Reset view"><ha-icon icon="mdi:image-filter-center-focus" style="--mdc-icon-size:14px"></ha-icon></button>
          <span class="zc-level">${(this._zoom * 100).toFixed(0)}%</span>
        </div>
        <div class="heatmap-legend">
          ${legendItems.map(([n, c]) => `<span><span class="swatch" style="background:${c}"></span>${n}</span>`).join("")}
        </div>
        <div class="caveat">
          Distances are estimates from RSSI (log-distance path-loss model, ref −55 dBm @ 1 m). Angles are deterministic-by-MAC, not real bearings — true direction requires 3+ scanners. Click any dot to toggle tracking.
        </div>
      </div>
    `;
  }

  _footerHtml() {
    return `<div class="footer">
      Updated: ${this._meta.updated ?? "—"}
      · BlueRadar v${BR_VERSION}
    </div>`;
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => {
        this._tab = el.dataset.tab;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("button.action").forEach(btn => {
      btn.addEventListener("click", () => {
        const mac = btn.dataset.mac;
        const action = btn.dataset.action;
        const dev = this._devices.find(d => d.mac === mac);
        if (action === "track") this._track(mac, dev?.name || "");
        else this._untrack(mac);
      });
    });
    const fi = this.shadowRoot.querySelector(".filter-input");
    if (fi) {
      fi.addEventListener("input", (ev) => {
        this._filter = ev.target.value;
        const c = this.shadowRoot.querySelector(".content");
        if (c && this._tab === "list") c.innerHTML = this._listHtml();
        this._wireEvents();
      });
      // keep cursor at end after re-render
      fi.focus();
      fi.setSelectionRange(this._filter.length, this._filter.length);
    }
    this.shadowRoot.querySelectorAll("g.bd-dot").forEach(g => {
      g.addEventListener("click", (ev) => {
        // Only treat as click if we did not drag
        if (this._didPan) { this._didPan = false; return; }
        const mac = g.dataset.mac;
        const d = this._devices.find(x => x.mac === mac);
        if (!d) return;
        if (d.tracked) this._untrack(mac); else this._track(mac, d.name || "");
      });
    });

    // === Zoom + pan on the heat-map SVG ===
    const svg = this.shadowRoot.querySelector(".heatmap-svg");
    if (svg) {
      const SIZE = parseFloat(svg.dataset.size) || 480;
      const updateTransform = () => {
        const g = svg.querySelector(".zoom-pan");
        if (g) {
          g.setAttribute("transform",
            `translate(${SIZE/2 + this._panX}, ${SIZE/2 + this._panY}) scale(${this._zoom}) translate(${-SIZE/2}, ${-SIZE/2})`);
        }
        const lvl = this.shadowRoot.querySelector(".zc-level");
        if (lvl) lvl.textContent = `${(this._zoom * 100).toFixed(0)}%`;
      };

      // Mouse wheel zoom
      svg.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        const delta = -ev.deltaY * 0.0015;
        const factor = Math.exp(delta);
        // Zoom toward cursor position
        const rect = svg.getBoundingClientRect();
        const sx = (ev.clientX - rect.left) / rect.width * SIZE;
        const sy = (ev.clientY - rect.top) / rect.height * SIZE;
        // Convert screen point to current world coords
        const wx = (sx - SIZE/2 - this._panX) / this._zoom + SIZE/2;
        const wy = (sy - SIZE/2 - this._panY) / this._zoom + SIZE/2;
        const newZoom = Math.max(0.5, Math.min(8, this._zoom * factor));
        // Adjust pan so the same world point stays under the cursor
        this._panX = sx - SIZE/2 - (wx - SIZE/2) * newZoom;
        this._panY = sy - SIZE/2 - (wy - SIZE/2) * newZoom;
        this._zoom = newZoom;
        updateTransform();
      }, { passive: false });

      // Mouse drag to pan
      svg.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest("g.bd-dot")) return; // let dot clicks through
        this._dragging = true;
        this._didPan = false;
        this._dragStart = { x: ev.clientX, y: ev.clientY, panX: this._panX, panY: this._panY };
        svg.classList.add("dragging");
        svg.setPointerCapture(ev.pointerId);
      });
      svg.addEventListener("pointermove", (ev) => {
        if (!this._dragging || !this._dragStart) return;
        const rect = svg.getBoundingClientRect();
        const scale = SIZE / rect.width;
        const dx = (ev.clientX - this._dragStart.x) * scale;
        const dy = (ev.clientY - this._dragStart.y) * scale;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didPan = true;
        this._panX = this._dragStart.panX + dx;
        this._panY = this._dragStart.panY + dy;
        updateTransform();
      });
      const endDrag = (ev) => {
        if (!this._dragging) return;
        this._dragging = false;
        this._dragStart = null;
        svg.classList.remove("dragging");
        try { svg.releasePointerCapture(ev.pointerId); } catch (e) {}
      };
      svg.addEventListener("pointerup", endDrag);
      svg.addEventListener("pointercancel", endDrag);
      svg.addEventListener("pointerleave", endDrag);

      // Double-click to reset
      svg.addEventListener("dblclick", () => {
        this._zoom = 1.0; this._panX = 0; this._panY = 0;
        updateTransform();
      });
    }

    // Zoom buttons
    this.shadowRoot.querySelectorAll(".zc-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.zc;
        const svg = this.shadowRoot.querySelector(".heatmap-svg");
        if (!svg) return;
        const SIZE = parseFloat(svg.dataset.size) || 480;
        if (action === "in") this._zoom = Math.min(8, this._zoom * 1.4);
        else if (action === "out") this._zoom = Math.max(0.5, this._zoom / 1.4);
        else if (action === "reset") { this._zoom = 1.0; this._panX = 0; this._panY = 0; }
        const g = svg.querySelector(".zoom-pan");
        if (g) g.setAttribute("transform",
          `translate(${SIZE/2 + this._panX}, ${SIZE/2 + this._panY}) scale(${this._zoom}) translate(${-SIZE/2}, ${-SIZE/2})`);
        const lvl = this.shadowRoot.querySelector(".zc-level");
        if (lvl) lvl.textContent = `${(this._zoom * 100).toFixed(0)}%`;
      });
    });
  }

  _escape(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  getCardSize() { return 6; }

  static getStubConfig() {
    return { title: "BlueRadar", show_unnamed: true, show_heatmap: true };
  }
}

customElements.define("blueradar-card", BlueRadarCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "blueradar-card",
  name: "BlueRadar",
  description: "Live BLE device list with one-click track/untrack and radar heat-map.",
  preview: false,
});

console.info(
  `%c BLUERADAR %c v${BR_VERSION} `,
  "color:#fff;background:linear-gradient(135deg,#0ea5e9,#6366f1);font-weight:700;padding:2px 6px;border-radius:3px",
  "color:#0ea5e9;font-weight:400"
);
