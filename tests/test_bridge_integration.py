import asyncio
import contextlib
import socket
import time
import unittest
from unittest.mock import patch

from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

import uart_nmea_bridge as bridge


class FakeUART:
    def __init__(self):
        self.chunks = []
        self.closed = False

    @property
    def in_waiting(self):
        return 1

    def read(self, size):
        time.sleep(0.01)
        return self.chunks.pop(0) if self.chunks else b""

    def close(self):
        self.closed = True


class BridgeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_origin_validation_framing_and_shutdown(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        uart = FakeUART()
        with patch.object(bridge.serial, "Serial", return_value=uart), patch(
            "sys.argv", ["bridge", "--ws-port", str(port)]
        ):
            task = asyncio.create_task(bridge.main())
            try:
                client = None
                for _ in range(100):
                    try:
                        client = await connect(
                            f"ws://127.0.0.1:{port}",
                            origin="https://jasonchongcnh.github.io",
                        )
                        break
                    except OSError:
                        await asyncio.sleep(0.02)
                self.assertIsNotNone(client, "Bridge failed to start")
                async with client:
                    for origin in ("https://untrusted.example", None):
                        with self.assertRaises(InvalidStatus):
                            await connect(f"ws://127.0.0.1:{port}", origin=origin)
                    uart.chunks.extend([b"$GPGGA,partial", b"", b",continued\r\n"])
                    self.assertEqual(
                        await asyncio.wait_for(client.recv(), 2),
                        "$GPGGA,partial,continued\n",
                    )
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            self.assertTrue(uart.closed, "UART must close when bridge stops")


if __name__ == "__main__":
    unittest.main()
