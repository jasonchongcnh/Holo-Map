import unittest
from uart_nmea_bridge import LineFramer


class LineFramerTests(unittest.TestCase):
    def test_uart_timeout_keeps_partial_sentence(self):
        framer = LineFramer()
        self.assertEqual(framer.feed(b'$GPGGA,123'), [])
        self.assertEqual(framer.feed(b''), [])
        self.assertEqual(framer.feed(b'4*00\r\n'), ['$GPGGA,1234*00'])

    def test_multiple_lines_and_non_nmea(self):
        self.assertEqual(LineFramer().feed(b'boot\r\n$GPRMC,a\n!AIVDM,b\n'), ['$GPRMC,a', '!AIVDM,b'])

    def test_oversize_and_non_ascii_frames_are_discarded(self):
        framer = LineFramer(max_length=8)
        self.assertEqual(framer.feed(b'$123456789'), [])
        self.assertEqual(framer.feed(b'ignored\n$OK\n$bad\xff\n'), ['$OK'])
        self.assertEqual(len(framer.buffer), 0)


if __name__ == '__main__':
    unittest.main()
