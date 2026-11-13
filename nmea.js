(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HoloNmea = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function coordinate(value, hemisphere, axis) {
    const latitude = axis === 'lat';
    if (axis !== 'lat' && axis !== 'lon') return null;
    if (!(latitude ? /^[NS]$/ : /^[EW]$/).test(hemisphere || '')) return null;
    if (!(latitude ? /^\d{4}(?:\.\d+)?$/ : /^\d{5}(?:\.\d+)?$/).test(value || '')) return null;
    const number = Number(value);
    const degrees = Math.floor(number / 100);
    const minutes = number - degrees * 100;
    const limit = latitude ? 90 : 180;
    if (!Number.isFinite(number) || minutes >= 60 || degrees > limit || (degrees === limit && minutes !== 0)) return null;
    const decimal = degrees + minutes / 60;
    return hemisphere === 'S' || hemisphere === 'W' ? -decimal : decimal;
  }
  function optionalNumber(value, maximum) {
    if (value == null || value === '') return null;
    if (!/^\d+(?:\.\d+)?$/.test(value)) return NaN;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= maximum ? number : NaN;
  }
  function parseSentence(line) {
    if (typeof line !== 'string' || line.length > 1024) return null;
    const match = /^\$([A-Z]{2}(?:GGA|RMC)),([^*\r\n]*)(?:\*([0-9A-Fa-f]{2}))?$/.exec(line.trim());
    if (!match) return null;
    const body = match[1] + ',' + match[2];
    if (match[3] != null) {
      let checksum = 0;
      for (const character of body) checksum ^= character.charCodeAt(0);
      if (checksum !== parseInt(match[3], 16)) return null;
    }
    const fields = body.split(',');
    const kind = fields[0].slice(-3);
    let hasFix;
    let lat;
    let lon;
    let speed = null;
    let course = null;
    if (kind === 'GGA') {
      if (!/^[0-8]$/.test(fields[6] || '')) return null;
      hasFix = fields[6] !== '0';
      if (hasFix) {
        lat = coordinate(fields[2], fields[3], 'lat');
        lon = coordinate(fields[4], fields[5], 'lon');
      }
    } else {
      if (fields[2] !== 'A' && fields[2] !== 'V') return null;
      hasFix = fields[2] === 'A';
      if (hasFix) {
        lat = coordinate(fields[3], fields[4], 'lat');
        lon = coordinate(fields[5], fields[6], 'lon');
        speed = optionalNumber(fields[7], Number.MAX_VALUE / 1.852);
        course = optionalNumber(fields[8], 360);
        if (Number.isNaN(speed) || Number.isNaN(course)) return null;
      }
    }
    if (hasFix && (lat == null || lon == null)) return null;
    const result = { kind, hasFix, lat: hasFix ? lat : null, lon: hasFix ? lon : null };
    if (kind === 'RMC') { result.speed = speed == null ? null : speed * 1.852; result.course = course; }
    return result;
  }
  return { parseSentence, coordinate };
});
