'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('./browser-harness');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function usbFixture() {
  const counts = { open: 0, close: 0, cancel: 0, release: 0 };
  let endRead;
  const reader = {
    read() { return new Promise((resolve) => { endRead = resolve; }); },
    async cancel() { counts.cancel++; endRead?.({ done: true }); },
    releaseLock() { counts.release++; },
  };
  const port = { async open() { counts.open++; }, async close() { counts.close++; }, readable: { getReader() { return reader; } } };
  const serial = { async requestPort() { return port; }, addEventListener() {}, removeEventListener() {} };
  return { counts, navigator: { serial } };
}

test('USB disconnect cancels pending read, releases lock and closes the port', async () => {
  const usb = usbFixture();
  const page = loadPage('raspberry_pi.html', { navigator: usb.navigator });
  const connection = page.get('serialBtn').click();
  await tick();
  assert.equal(usb.counts.open, 1);
  assert.equal(page.get('serialBtn').disabled, false);
  await page.get('serialBtn').click();
  await connection;
  assert.deepEqual(usb.counts, { open: 1, close: 1, cancel: 1, release: 1 });
  assert.equal(page.get('serialBtn').disabled, false);
});

test('device location toggles one watch and clears it on stop', async () => {
  let watches = 0, cleared = [];
  const navigator = { geolocation: { watchPosition() { watches++; return watches; }, clearWatch(id) { cleared.push(id); } } };
  const page = loadPage('raspberry_pi.html', { navigator });
  await page.get('geoBtn').click();
  assert.equal(watches, 1);
  await page.get('geoBtn').click();
  assert.deepEqual(cleared, [1]);
  assert.equal(watches, 1);
});

test('point-only GeoJSON creates a visible point layer and fits the point', async () => {
  const page = loadPage('raspberry_pi.html');
  const file = { name: 'waypoint.geojson', async text() { return JSON.stringify({ type: 'Feature', properties: { name: 'Stop' }, geometry: { type: 'Point', coordinates: [121, 25] } }); } };
  page.get('routeFile').files = [file];
  await page.get('routeFile').dispatch('change');
  const map = page.maps[0];
  assert.ok([...map.layers.values()].some((layer) => layer.type === 'circle' && /imported/.test(layer.id)));
  assert.ok(map.lastFit || map.lastEase);
  assert.match(page.get('status').textContent, /waypoint.geojson/);
});
