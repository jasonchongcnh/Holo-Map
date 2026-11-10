#!/usr/bin/env python3
"""Bridge Raspberry Pi UART NMEA input to browser clients over WebSocket."""

import argparse
import asyncio
import sys

import serial
from websockets.asyncio.server import serve


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", default="/dev/serial0", help="UART device (default: /dev/serial0)")
    parser.add_argument("--baud", type=int, default=115200, help="UART baud rate (default: 115200)")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket port (default: 8765)")
    args = parser.parse_args()

    try:
        uart = serial.Serial(args.device, args.baud, timeout=0.25)
    except serial.SerialException as exc:
        print(f"Cannot open {args.device}: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    clients = set()

    async def websocket_handler(websocket):
        clients.add(websocket)
        print(f"Browser connected ({len(clients)} client(s))")
        try:
            await websocket.wait_closed()
        finally:
            clients.discard(websocket)
            print(f"Browser disconnected ({len(clients)} client(s))")

    print(f"Reading NMEA from {args.device} at {args.baud} baud")
    print(f"WebSocket listening on ws://0.0.0.0:{args.ws_port}")
    try:
        async with serve(websocket_handler, "0.0.0.0", args.ws_port):
            while True:
                raw_line = await asyncio.to_thread(uart.readline)
                if not raw_line:
                    continue
                line = raw_line.decode("ascii", errors="replace").strip()
                if not line.startswith(("$", "!")):
                    continue
                stale = []
                for client in tuple(clients):
                    try:
                        await client.send(line + "\n")
                    except Exception:
                        stale.append(client)
                for client in stale:
                    clients.discard(client)
    finally:
        uart.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nUART bridge stopped")
