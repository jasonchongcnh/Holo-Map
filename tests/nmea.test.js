'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSentence } = require('../nmea.js');

function checksum(body) {
  let value = 0;
  for (const char of body) value ^= char.charCodeAt(0);
  return '$' + body + '*' + value.toString(16).toUpperCase().padStart(2, '0');
}
function gga(lat = '4807.038', ns = 'N', lon = '01131.000', ew = 'E', quality = '1') {
  return checksum(`GPGGA,123519,${lat},${ns},${lon},${ew},${quality},08,0.9,545.4,M,46.9,M,,`);
}
function rmc(status = 'A', speed = '22.4', course = '84.4') {
  return checksum(`GPRMC,123519,${status},4807.038,N,01131.000,E,${speed},${course},230394,003.1,W`);
}

test('GGA and RMC decode known coordinates and preserve motion field semantics', () => {
  const position = parseSentence(gga());
  assert.equal(position.kind, 'GGA');
  assert.equal(position.hasFix, true);
  assert.ok(Math.abs(position.lat - 48.1173) < 1e-8);
  assert.ok(Math.abs(position.lon - 11.5166666667) < 1e-8);
  assert.equal(Object.hasOwn(position, 'speed'), false);
  assert.equal(Object.hasOwn(position, 'course'), false);
  const motion = parseSentence(rmc());
  assert.ok(Math.abs(motion.speed - 41.4848) < 1e-8);
  assert.equal(motion.course, 84.4);
});

test('checksum failures and malformed checksum suffixes are rejected', () => {
  const valid = gga();
  assert.equal(parseSentence(valid.slice(0, -2) + '00'), null);
  for (const ending of ['*4', '*GG', '*47junk', '*470', '**47']) {
    assert.equal(parseSentence(valid.split('*')[0] + ending), null, ending);
  }
  assert.equal(parseSentence('not NMEA'), null);
  assert.equal(parseSentence('!GPGGA,123519,4807.038,N,01131.000,E,1'), null);
});

test('receivers without a checksum remain supported', () => {
  assert.equal(parseSentence(gga().split('*')[0]).hasFix, true);
});

test('corrupt or out-of-range coordinates never produce a valid fix', () => {
  for (const args of [
    ['', 'N'], ['4860.000', 'N'], ['4899.999', 'N'], ['9100.000', 'N'],
    ['9000.001', 'N'], ['4807.038', 'X'], ['4807.038', 'E'],
    ['-4807.038', 'N'], ['4.807038e3', 'N'], [' 4807.038', 'N'],
    ['4807.038', 'N', '', 'E'], ['4807.038', 'N', '18100.000', 'E'],
    ['4807.038', 'N', '18000.001', 'E'], ['4807.038', 'N', '01160.000', 'E'],
    ['4807.038', 'N', '01131.000', 'N'],
  ]) {
    const result = parseSentence(gga(...args));
    assert.ok(!result || !result.hasFix || result.lat == null || result.lon == null, args.join(','));
  }
});

test('southern/western coordinates and exact pole/dateline limits are valid', () => {
  const sw = parseSentence(gga('4807.038', 'S', '01131.000', 'W'));
  assert.ok(sw.lat < 0 && sw.lon < 0);
  const edge = parseSentence(gga('9000.000', 'N', '18000.000', 'E'));
  assert.equal(edge.lat, 90);
  assert.equal(edge.lon, 180);
});

test('no-fix and missing fix quality do not create positions', () => {
  for (const quality of ['0', '', '-1', '1.5', '9', 'not-a-number']) {
    const result = parseSentence(gga('4807.038', 'N', '01131.000', 'E', quality));
    assert.ok(!result || !result.hasFix, quality);
  }
  assert.equal(parseSentence(rmc('V')).hasFix, false);
});

test('missing and invalid RMC motion fields do not turn into numeric zero', () => {
  const missing = parseSentence(rmc('A', '', ''));
  assert.equal(missing.speed, null);
  assert.equal(missing.course, null);
  const invalid = parseSentence(rmc('A', '-1', '361'));
  assert.ok(invalid === null || invalid.speed === null);
  assert.ok(invalid === null || invalid.course === null);
  const stationary = parseSentence(rmc('A', '0', '0'));
  assert.equal(stationary.speed, 0);
  assert.equal(stationary.course, 0);
});
