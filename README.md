# Holo-Map

Traditional Chinese live NMEA trip map, GPX export, and browser-local trip history.

- [Trip dashboard](https://jasonchongcnh.github.io/Holo-Map/) uses a Raspberry Pi UART WebSocket bridge.
- [USB GPS / device location](https://jasonchongcnh.github.io/Holo-Map/raspberry_pi.html) connects directly to a USB GPS/ESP32 in desktop Chrome or Edge, or uses browser geolocation. It also imports GPX, GeoJSON, and KML, including waypoints.

## GitHub Pages

In repository **Settings > Pages**, select **GitHub Actions** as the source. The included workflow checks JavaScript and Python before deploying pushes to `main`; pull requests run checks only. `index.html` opens the trip dashboard. Only the two pages, homepage, shared NMEA parser, and `.nojekyll` are published. Firmware, Python, tests, credentials, and editor settings are excluded from the website artifact.

## Connect the trip dashboard to a Raspberry Pi

GitHub Pages serves the website. The UART bridge runs on your Pi, at an address reachable from the browser. The dashboard's **UART bridge address** field accepts a full WebSocket URL; it remembers that address in this browser. It never connects to a GitHub server for GPS data.

On Raspberry Pi OS, enable the appropriate UART and disable its serial console. Confirm your board's pins, use the receiver's specified power/logic levels, cross TX to RX, and share GND. Check `/dev/serial0` and serial permissions (usually membership in `dialout`). Then:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python uart_nmea_bridge.py --device /dev/serial0 --baud 115200
```

The bridge defaults to `127.0.0.1:8765`, allows the deployed GitHub origin and localhost port 8000, and rejects other/missing browser origins. `--allow-origin` adds an exact origin without a trailing slash; repeat for additional origins. Origin checks protect browser access; they are not authentication for arbitrary non-browser clients. Keep the service on a trusted network or behind an authenticated proxy.

### GitHub Pages HTTPS + secure bridge

An HTTPS page needs a **wss://** bridge with a certificate trusted by the browser. Configure a TLS reverse proxy on the Pi (or another reachable host) to proxy to `127.0.0.1:8765`. Example Caddy configuration, after arranging a real hostname/DNS and a trusted certificate:

```caddyfile
pi.example.com {
    reverse_proxy 127.0.0.1:8765
}
```

Enter `wss://pi.example.com` in the dashboard. `pi.example.com` is an example, not a configured service. The Pi's private address or a `.local` name alone does not provide trusted HTTPS. Do not expose an unauthenticated GPS feed publicly; a private reachable TLS endpoint is preferable.

Alternatively, use an existing trusted certificate directly:

```sh
python uart_nmea_bridge.py --host 0.0.0.0 --certfile /path/fullchain.pem --keyfile /path/privkey.pem
```

Enter `wss://YOUR-CERTIFICATE-HOSTNAME:8765`. Private keys stay on the Pi; `.gitignore` excludes common key files. No key or certificate is bundled.

### Local HTTP on the Pi

For a trusted local network without TLS, serve this folder on the Pi:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
python uart_nmea_bridge.py --host 0.0.0.0 --allow-origin http://PI-LAN-IP:8000
```

Open `http://PI-LAN-IP:8000/bds_map.html` and enter `ws://PI-LAN-IP:8765`. Replace `PI-LAN-IP` in both places with the actual address. HTTP LAN hosting supports this WebSocket dashboard; Web Serial and browser geolocation need HTTPS or localhost. For USB use, open the GitHub Pages USB page in a supported browser on the computer attached to the USB device.

## Recording and recovery

Start a trip to connect and record; stop to disconnect and save. Completed and imported history entries have GPX export. Trips remain exportable when browser storage is unavailable/full, with an explicit unsaved indication and a page-leave warning until backed up. History lives in this browser profile on this origin, not in GitHub or on the Pi; export backups before clearing browser data or switching origins. Camera and PLY integration are not implemented.

## ESP32 USB firmware

Upload `bds_ant_read.ino` using Arduino IDE with the correct ESP32 board selected. UART1 and USB output use **115200 baud, 8N1**. The sketch retains the original **D4 RX / D3 TX** board aliases, now named `BDS_RX_PIN` and `BDS_TX_PIN`; verify them and replace with your board's actual GPIO numbers if needed. Receiver TX goes to ESP32 RX. Close Arduino Serial Monitor before connecting the browser. The sketch forwards bytes without blocking on newline.

## Checks and local preview

Requires Node.js 24 for tests and Python 3.10+ for the bridge.

```sh
node _sky_test.js
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py'
python -m http.server 8000
```

Open `http://localhost:8000/`. MapLibre and OpenFreeMap assets require internet access. Coordinates stay in your browser/bridge, but external map requests reveal the viewed map area. No offline map support is implemented. There is no project license yet.

API references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [WebSocket server TLS/origins](https://websockets.readthedocs.io/en/stable/reference/asyncio/server.html), [Web Serial](https://developer.chrome.com/docs/capabilities/serial).
