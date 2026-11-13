'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, descendants } = require('./browser-harness');
const firstFix = '$GPRMC,123519,A,4807.038,N,01131.000,E,22.4,84.4,230394,003.1,W';
const secondFix = '$GPRMC,123520,A,4807.040,N,01131.000,E,22.4,84.4,230394,003.1,W';

async function start(page, address = 'wss://gps.example.test/nmea') {
  page.get('bridgeUrl').value = address;
  await page.get('bridgeUrl').dispatch('change');
  await page.get('btnRecord').click();
  assert.equal(page.sockets.length, 1);
  page.sockets[0].open();
  return page.sockets[0];
}
function historyExports(page) { return descendants(page.get('historyList')).filter((el) => el.tagName === 'BUTTON' && /GPX|匯出/.test(el.textContent)); }

test('HTTPS requires an explicit secure Pi address rather than the GitHub host', async () => {
  const page = loadPage('bds_map.html');
  await page.get('btnRecord').click();
  assert.equal(page.sockets.length, 0);
  assert.match(page.get('status').className, /err/);
  page.get('bridgeUrl').value = 'ws://raspberrypi.local:8765';
  await page.get('btnRecord').click();
  assert.equal(page.sockets.length, 0);
  assert.match(page.get('status').className, /err/);
});

test('configured WSS endpoint is used and stop closes it without reconnecting', async () => {
  const page = loadPage('bds_map.html');
  const socket = await start(page, 'wss://gps.example.test/nmea');
  assert.equal(socket.url, 'wss://gps.example.test/nmea');
  socket.message(firstFix); socket.message(secondFix);
  await page.get('btnRecord').click();
  assert.equal(socket.closeCalls, 1);
  assert.equal(page.timeouts.size, 0);
  assert.equal(page.get('btnExport').disabled, false);
});

test('HTTP Pi-hosted page defaults to the local bridge host', async () => {
  const page = loadPage('bds_map.html', { url: 'http://raspberrypi.local:8000/bds_map.html' });
  await page.get('btnRecord').click();
  assert.equal(page.sockets.length, 1);
  assert.equal(page.sockets[0].url, 'ws://raspberrypi.local:8765/');
});

test('GGA following RMC preserves speed and heading', async () => {
  const page = loadPage('bds_map.html');
  const socket = await start(page);
  socket.message(firstFix);
  assert.equal(page.get('speed').textContent, '41.5 km/h');
  assert.equal(page.get('course').textContent, '84.4°');
  socket.message('$GPGGA,123520,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,');
  assert.equal(page.get('speed').textContent, '41.5 km/h');
  assert.equal(page.get('course').textContent, '84.4°');
});

test('quota failure retains stopped trip, warns before leaving, and exports recovery GPX', async () => {
  const page = loadPage('bds_map.html');
  const socket = await start(page);
  socket.message(firstFix); socket.message(secondFix);
  page.storage.fail = true;
  await page.get('btnRecord').click();
  assert.match(page.get('status').className, /err/);
  assert.equal(page.get('btnExport').disabled, false);
  assert.equal(historyExports(page).length, 1);
  const leaving = await page.event('beforeunload');
  assert.ok(leaving.defaultPrevented || leaving.returnValue !== undefined);
  await page.get('btnExport').click();
  assert.equal(page.downloads.length, 1);
  const xml = await page.downloads[0].blob.text();
  assert.equal((xml.match(/<trkpt /g) || []).length, 2);
  const backedUp = await page.event('beforeunload');
  assert.ok(!backedUp.defaultPrevented && backedUp.returnValue === undefined);
});

test('completed history remains exportable after a subsequent trip starts', async () => {
  const page = loadPage('bds_map.html');
  const socket = await start(page);
  socket.message(firstFix); socket.message(secondFix);
  await page.get('btnRecord').click();
  assert.equal(JSON.parse(page.stored.get('holo-map-tracks-v1')).length, 1);
  await page.get('btnRecord').click();
  await historyExports(page)[0].click();
  assert.equal(page.downloads.length, 1);
  assert.equal((await page.downloads[0].blob.text()).match(/<trkpt /g).length, 2);
});

test('malformed history and GeoJSON null coordinates do not become zero positions', async () => {
  const page = loadPage('bds_map.html', { storage: { 'holo-map-tracks-v1': JSON.stringify([{ name: 'bad', coordinates: [[null, 24], [121, 25]] }]) } });
  assert.equal(page.get('historyList').children.length, 0);
  const file = { name: 'bad.geojson', async text() { return JSON.stringify({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[null, 24], [121, 25]] } }); } };
  page.get('routeFile').files = [file];
  await page.get('routeFile').dispatch('change');
  assert.equal(page.get('historyList').children.length, 0);
  assert.match(page.get('status').className, /err/);
});

test('mobile fit padding leaves usable map width', async () => {
  const page = loadPage('bds_map.html', { width: 375 });
  const socket = await start(page);
  socket.message(firstFix); socket.message(secondFix);
  await page.get('btnFit').click();
  const padding = page.maps[0].lastFit.padding;
  assert.ok(typeof padding === 'number' ? padding * 2 < 375 : padding.left + padding.right < 375);
});
