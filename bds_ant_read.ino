// ESP32 UART1 bridge. Confirm these board aliases against your board's pinout.
// Replace D4/D3 below with GPIO numbers if your ESP32 board doesn't define them.
#ifndef BDS_RX_PIN
#define BDS_RX_PIN D4
#endif
#ifndef BDS_TX_PIN
#define BDS_TX_PIN D3
#endif

HardwareSerial MySerial(1);

void setup() {
  Serial.begin(115200);
  MySerial.begin(115200, SERIAL_8N1, BDS_RX_PIN, BDS_TX_PIN);
}

void loop() {
  // Forward bytes without waiting for a complete line or allocating Strings.
  while (MySerial.available() > 0) {
    Serial.write(MySerial.read());
  }
}
