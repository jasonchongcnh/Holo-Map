'use strict';
// Minimal browser boundary mocks; tests execute the actual page scripts and events.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id;
    this.children = []; this.listeners = new Map(); this.attributes = new Map();
    this.textContent = ''; this.value = ''; this.disabled = false; this.style = {};
    this.clientWidth = 1024; this.clientHeight = 768;
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter((fn) => fn !== callback)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = [...children]; }
  remove() {}
  focus() {}
  getBoundingClientRect() { return { width: 370, height: 350, top: 12, bottom: 362, left: 12, right: 382 }; }
  async dispatch(type, values = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...values };
    await Promise.all((this.listeners.get(type) || []).map((fn) => fn(event)));
    return event;
  }
  click() { if (this.disabled) return Promise.resolve(); if (this.tagName === 'A' && this.onDownload) this.onDownload(this); return this.dispatch('click'); }
}
function descendants(element) { return element.children.flatMap((child) => typeof child === 'object' ? [child, ...descendants(child)] : []); }

function loadPage(filename, options = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const el = new Element(match[1], match[3]);
    el.disabled = /\bdisabled\b/.test(match[2]);
    const initial = /\bvalue="([^"]*)"/.exec(match[2]); if (initial) el.value = initial[1];
    el.clientWidth = options.width || 1024;
    elements.set(el.id, el);
  }
  const created = [], downloads = [], blobs = new Map(), windowEvents = new Map(), timeouts = new Map(), intervals = [];
  let timerId = 0;
  class BrowserURL extends URL {
    static createObjectURL(blob) { const url = 'blob:test-' + (blobs.size + 1); blobs.set(url, blob); return url; }
    static revokeObjectURL() {}
  }
  const document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => selector === '.panel' || selector === 'main' ? panel : null,
    createElement: (tag) => {
      const el = new Element(tag); created.push(el);
      if (tag.toLowerCase() === 'a') el.onDownload = (anchor) => downloads.push({ name: anchor.download, blob: blobs.get(anchor.href) });
      return el;
    },
    body: new Element('body'), documentElement: new Element('html'),
  };
  const panel = new Element('main');
  class FakeMap {
    constructor() { this.events = new Map(); this.sources = new Map(); this.layers = new Map(); this.canvas = new Element('canvas'); maps.push(this); }
    on(type, layer, callback) { const fn = callback || layer; if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push({ layer: callback ? layer : null, fn }); return this; }
    emit(type, value = {}) { for (const { fn } of this.events.get(type) || []) fn(value); }
    addSource(id, source) { this.sources.set(id, { data: source.data, setData(data) { this.data = data; } }); }
    getSource(id) { return this.sources.get(id); }
    removeSource(id) { this.sources.delete(id); }
    addLayer(layer) { this.layers.set(layer.id, layer); }
    getLayer(id) { return this.layers.get(id); }
    removeLayer(id) { this.layers.delete(id); }
    addControl() {}
    easeTo(value) { this.lastEase = value; }
    fitBounds(bounds, value) { this.lastFit = { bounds, ...value }; }
    getZoom() { return 8; }
    getCanvas() { return this.canvas; }
    getContainer() { return elements.get('map'); }
    loaded() { return true; }
    isStyleLoaded() { return true; }
  }
  const maps = [], sockets = [];
  class FakeSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) { this.url = url; this.readyState = 0; this.closeCalls = 0; sockets.push(this); }
    open() { this.readyState = 1; if (this.onopen) this.onopen({ target: this }); }
    message(data) { if (this.onmessage) this.onmessage({ data, target: this }); }
    close() { this.closeCalls++; this.readyState = 3; if (this.onclose) this.onclose({ target: this }); }
  }
  class Marker { setLngLat() { return this; } addTo() { return this; } remove() {} }
  class Popup { setLngLat() { return this; } setDOMContent() { return this; } setHTML() { return this; } addTo() { return this; } }
  class Bounds { constructor(a, b) { this.points = [a, b]; } extend(p) { this.points.push(p); return this; } }
  const stored = new Map(Object.entries(options.storage || {}));
  const storage = { fail: false, getItem: (key) => stored.get(key) ?? null, setItem(key, value) { if (this.fail) throw new Error('QuotaExceededError'); stored.set(key, value); }, removeItem(key) { stored.delete(key); } };
  const context = {
    console, document, localStorage: storage, location: new URL(options.url || 'https://jasonchongcnh.github.io/Holo-Map/bds_map.html'),
    navigator: options.navigator || {}, URL: BrowserURL, Blob, TextDecoder, TextEncoder,
    WebSocket: FakeSocket, innerWidth: options.width || 1024, innerHeight: 768,
    maplibregl: options.noMap ? undefined : { Map: FakeMap, Marker, Popup, LngLatBounds: Bounds, NavigationControl: class {} },
    setTimeout(fn) { const id = ++timerId; timeouts.set(id, fn); return id; }, clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn) { intervals.push(fn); return intervals.length; }, clearInterval() {},
    addEventListener(type, fn) { if (!windowEvents.has(type)) windowEvents.set(type, []); windowEvents.get(type).push(fn); },
    removeEventListener(type, fn) { windowEvents.set(type, (windowEvents.get(type) || []).filter((entry) => entry !== fn)); },
    matchMedia: () => ({ matches: (options.width || 1024) < 560 }),
    confirm: () => true,
  };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'nmea.js'), 'utf8'), context, { filename: 'nmea.js' });
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) vm.runInContext(match[1], context, { filename });
  if (options.mapLoad !== false) for (const map of maps) map.emit('load');
  return {
    elements, maps, sockets, storage, stored, downloads, created, timeouts, intervals, context,
    get: (id) => { const el = elements.get(id); if (!el) throw new Error('Missing DOM id ' + id); return el; },
    async event(type, value = {}) { const event = { preventDefault() { this.defaultPrevented = true; }, ...value }; await Promise.all((windowEvents.get(type) || []).map((fn) => fn(event))); return event; },
  };
}
module.exports = { loadPage, descendants };
