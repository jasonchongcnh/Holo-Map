#!/usr/bin/env python3
"""Bridge Raspberry Pi UART NMEA input to allowed browser origins over WS/WSS."""

import argparse
import asyncio
import ssl
import sys

import serial
from websockets.asyncio.server import serve

DEFAULT_ORIGINS = (
    "https://jasonchongcnh.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
)


class LineFramer:
    """Keep UART timeout fragments until newline; drop oversized/corrupt frames."""

    def __init__(self, max_length=4096):
        self.buffer = bytearray()
        self.max_length = max_length
        self.discarding = False

    def feed(self, chunk):
        lines = []
        for value in chunk:
            if value == 10:
                if not self.discarding:
                    try:
                        line = self.buffer.decode("ascii").strip()
                    except UnicodeDecodeError:
                        line = ""
                    if line.startswith(("$", "!")):
                        lines.append(line)
                self.buffer.clear()
                self.discarding = False
            elif not self.discarding:
                self.buffer.append(value)
                if len(self.buffer) > self.max_length:
                    self.buffer.clear()
                    self.discarding = True
        return lines


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", default="/dev/serial0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--host", default="127.0.0.1", help="Bind address; default is loopback only")
    parser.add_argument("--ws-port", type=int, default=8765)
    parser.add_argument("--allow-origin", action="append", default=[], help="Additional exact browser origin; repeat as needed")
    parser.add_argument("--certfile", help="TLS certificate chain for direct WSS")
    parser.add_argument("--keyfile", help="TLS private key for direct WSS")
    args = parser.parse_args()
    if bool(args.certfile) != bool(args.keyfile):
        parser.error("--certfile and --keyfile must be provided together")
    if not 1 <= args.ws_port <= 65535 or args.baud <= 0:
        parser.error("Use a valid port (1..65535) and positive baud rate")
    return args


async def main():
    args = parse_args()
    tls = None
    if args.certfile:
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.minimum_version = ssl.TLSVersion.TLSv1_2
        tls.load_cert_chain(args.certfile, args.keyfile)
    try:
        uart = serial.Serial(args.device, args.baud, timeout=0.25)
    except serial.SerialException as exc:
        print(f"Cannot open {args.device}: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    clients = set()

    async def websocket_handler(websocket):
        if len(clients) >= 8:
            await websocket.close(code=1013, reason="Too many clients")
            return
        clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            clients.discard(websocket)

    async def send_line(client, line):
        try:
            await asyncio.wait_for(client.send(line + "\n"), timeout=1)
        except Exception:
            clients.discard(client)
            await client.close()

    scheme = "wss" if tls else "ws"
    origins = list(dict.fromkeys([*DEFAULT_ORIGINS, *args.allow_origin]))
    print(f"Reading NMEA from {args.device} at {args.baud} baud")
    print(f"WebSocket listening on {scheme}://{args.host}:{args.ws_port}")
    print(f"Allowed browser origins: {', '.join(origins)}")
    framer = LineFramer()
    try:
        async with serve(websocket_handler, args.host, args.ws_port,
                         origins=origins, ssl=tls, max_size=4096,
                         max_queue=8, close_timeout=2):
            while True:
                chunk = await asyncio.to_thread(uart.read, max(1, min(uart.in_waiting, 4096)))
                for line in framer.feed(chunk):
                    await asyncio.gather(*(send_line(client, line) for client in tuple(clients)))
    finally:
        uart.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nUART bridge stopped")
