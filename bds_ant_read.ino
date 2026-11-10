// 移除 SoftwareSerial.h，ESP32 直接使用硬體串口
HardwareSerial MySerial(1); // 使用 UART1

void setup() {
  // 與電腦序列埠監控視窗的通訊
  Serial.begin(115200);
  
  // 與北斗模組的通訊：波特率 115200, 格式 8N1, RX 腳位 D4, TX 腳位 D3
  MySerial.begin(115200, SERIAL_8N1, D4, D3); 
}

void loop() {
  if (MySerial.available() != 0) {
    String NMEA_BD = MySerial.readStringUntil('\n');
    Serial.println(NMEA_BD);
  }
  /*
  else {
    Serial.println("Nothing Read!!");
    delay(100);
  }
  */
}