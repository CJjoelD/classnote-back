#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <FS.h>
#include <SD.h>
#include <SPI.h>

// --- CONFIGURACIÓN DE HARDWARE ---
#define MIC_PIN     34
#define SD_CS       5
#define BTN_PIN     4
#define LED_GREEN   26
#define LED_RED     27

// --- CONFIGURACIÓN DE CONEXIÓN WIFI Y BACKEND ---
const char* ssid = "D-Link_DIR-611";
const char* password = "191820801428";
const char* serverUrl = "http://192.168.11.3:5000/api/classes/upload-hardware";
const char* heartbeatUrl = "http://192.168.11.3:5000/api/devices/heartbeat";

// Parámetros de Audio PCM/WAV
#define SAMPLE_RATE 16000
#define BUFFER_SIZE 512

// Variables de Control
bool isRecording = false;
File audioFile;
String currentFilename = "";
int fileCounter = 0;
unsigned long totalAudioBytes = 0;
unsigned long lastHeartbeatAt = 0;
const unsigned long heartbeatInterval = 15000; // 15 segundos

// Debouncing de Botón físico
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 350;

// --- FUNCIONES PARA CONSTRUCCIÓN DE ARCHIVOS WAV ---

void writeWavHeader(File file) {
  byte header[44];
  
  header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
  
  uint32_t fileSize = 0;
  header[4] = fileSize & 0xff;
  header[5] = (fileSize >> 8) & 0xff;
  header[6] = (fileSize >> 16) & 0xff;
  header[7] = (fileSize >> 24) & 0xff;
  
  header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';
  header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
  
  header[16] = 16; header[17] = 0; header[18] = 0; header[19] = 0;
  header[20] = 1; header[21] = 0;
  header[22] = 1; header[23] = 0;
  
  uint32_t sampleRate = SAMPLE_RATE;
  header[24] = sampleRate & 0xff;
  header[25] = (sampleRate >> 8) & 0xff;
  header[26] = (sampleRate >> 16) & 0xff;
  header[27] = (sampleRate >> 24) & 0xff;
  
  uint32_t byteRate = SAMPLE_RATE * 2; 
  header[28] = byteRate & 0xff;
  header[29] = (byteRate >> 8) & 0xff;
  header[30] = (byteRate >> 16) & 0xff;
  header[31] = (byteRate >> 24) & 0xff;
  
  header[32] = 2; header[33] = 0;
  header[34] = 16; header[35] = 0;
  
  header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
  
  uint32_t dataSize = 0;
  header[40] = dataSize & 0xff;
  header[41] = (dataSize >> 8) & 0xff;
  header[42] = (dataSize >> 16) & 0xff;
  header[43] = (dataSize >> 24) & 0xff;
  
  file.write(header, 44);
}

void finalizeWavHeader(String path, uint32_t dataSize) {
  File file = SD.open(path, FILE_WRITE);
  if (!file) {
    Serial.println("No se pudo reabrir el archivo para actualizar cabecera.");
    return;
  }
  
  uint32_t fileSize = dataSize + 36;
  file.seek(4);
  file.write((uint8_t*)&fileSize, 4);
  file.seek(40);
  file.write((uint8_t*)&dataSize, 4);
  file.close();
  Serial.println("Cabecera WAV finalizada correctamente.");
}

// --- CONEXIÓN DE RED WIFI ---
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  Serial.print("Conectando a red WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    digitalWrite(LED_RED, HIGH);
    delay(250);
    digitalWrite(LED_RED, LOW);
    delay(250);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("MAC: ");
    Serial.println(WiFi.macAddress());
  } else {
    Serial.println("\nNo se pudo conectar WiFi.");
  }
}

// --- HEARTBEAT: Mantiene vivo el dispositivo en la app ---
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(heartbeatUrl);
  http.addHeader("X-Device-MAC", WiFi.macAddress());
  http.setTimeout(5000);
  
  int statusCode = http.POST("");
  
  if (statusCode == 200) {
    Serial.println("Heartbeat OK");
  } else if (statusCode == 401) {
    Serial.println("Heartbeat: Dispositivo no emparejado");
    Serial.print("  MAC: ");
    Serial.println(WiFi.macAddress());
    Serial.println("  -> Vincular desde la app");
  } else {
    Serial.print("Heartbeat falló: ");
    Serial.println(statusCode);
  }
  
  http.end();
}

// --- ENVÍO DE AUDIO HTTP POST ---
bool uploadFile(String path) {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(3000);
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cancelando subida: Red WiFi no disponible.");
    return false;
  }
  
  File file = SD.open(path, FILE_READ);
  if (!file) {
    Serial.println("Error: No se pudo abrir el archivo de audio para subir.");
    return false;
  }
  
  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(300000);
  
  String mac = WiFi.macAddress();
  http.addHeader("X-Device-MAC", mac);
  http.addHeader("Content-Type", "audio/wav");
  
  Serial.println("Iniciando transmisión de archivo binario directo...");
  int statusCode = http.sendRequest("POST", &file, file.size());
  
  file.close();
  
  Serial.print("HTTP Código de Respuesta: ");
  Serial.println(statusCode);
  
  if (statusCode >= 200 && statusCode < 300) {
    String responseText = http.getString();
    Serial.println("Detalle Servidor: " + responseText);
    http.end();
    return true;
  } else {
    Serial.print("Error al subir archivo. Código: ");
    Serial.println(statusCode);
    http.end();
    return false;
  }
}

// --- SETUP ---
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Iniciando ClassNote Box Setup...");
  
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, LOW);
  
  if (!SD.begin(SD_CS)) {
    Serial.println("ERROR CRÍTICO: No se pudo montar la tarjeta MicroSD.");
    while (true) {
      digitalWrite(LED_RED, HIGH);
      delay(150);
      digitalWrite(LED_RED, LOW);
      delay(150);
    }
  }
  Serial.println("Tarjeta MicroSD montada con éxito.");
  
  analogReadResolution(12);
  analogSetPinAttenuation(MIC_PIN, ADC_11db);
  
  connectWiFi();
  
  // Primer heartbeat para que la app detecte el ESP32
  sendHeartbeat();
  lastHeartbeatAt = millis();
  
  Serial.println("ClassNote Box listo.");
}

// --- BUCLE DE CONTROL PRINCIPAL ---
void loop() {
  // Heartbeat periódico cada 15 segundos
  if (!isRecording && millis() - lastHeartbeatAt >= heartbeatInterval) {
    sendHeartbeat();
    lastHeartbeatAt = millis();
  }

  int btnVal = digitalRead(BTN_PIN);
  
  if (btnVal == LOW && (millis() - lastDebounceTime) > debounceDelay) {
    lastDebounceTime = millis();
    
    if (!isRecording) {
      Serial.println("Estabilizando ADC antes de grabar...");
      analogRead(MIC_PIN); delay(10);
      analogRead(MIC_PIN); delay(10);

      Serial.println("Iniciando grabacion analógica...");
      
      currentFilename = "/rec_" + String(millis()) + ".wav";
      
      audioFile = SD.open(currentFilename, FILE_WRITE);
      
      if (audioFile) {
        writeWavHeader(audioFile);
        audioFile.flush();
        totalAudioBytes = 0;
        isRecording = true;
        
        digitalWrite(LED_GREEN, LOW);
        digitalWrite(LED_RED, HIGH);
        Serial.println("Archivo creado en SD: " + currentFilename);
      } else {
        Serial.println("Error grave: ¡No se pudo crear el archivo en la tarjeta SD!");
        isRecording = false;
        digitalWrite(LED_GREEN, HIGH);
        digitalWrite(LED_RED, LOW);
      }
    } else {
      Serial.println("Deteniendo grabacion...");
      isRecording = false;
      
      if (audioFile) {
        audioFile.close();
        finalizeWavHeader(currentFilename, totalAudioBytes);
      }
      
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_GREEN, LOW);
      
      digitalWrite(LED_RED, HIGH);
      bool success = uploadFile(currentFilename);
      digitalWrite(LED_RED, LOW);
      
      if (success) {
        Serial.println("Subido con éxito. Archivo conservado en SD...");
        // SD.remove(currentFilename);
        for (int i = 0; i < 3; i++) {
          digitalWrite(LED_GREEN, HIGH); delay(120);
          digitalWrite(LED_GREEN, LOW);  delay(120);
        }
      } else {
        Serial.println("Error al subir. Guardado en SD.");
        for (int i = 0; i < 5; i++) {
          digitalWrite(LED_RED, HIGH); delay(120);
          digitalWrite(LED_RED, LOW);  delay(120);
        }
      }
      
      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(LED_RED, LOW);
    }
  }
  
  // --- CAPTURA DE AUDIO ---
  if (isRecording && audioFile) {
    int16_t sample;
    
    for (int i = 0; i < BUFFER_SIZE; i++) {
      int raw = analogRead(MIC_PIN);
      
      sample = (raw - 1500) * 12; 
      sample = constrain(sample, -32768, 32767); 
      
      size_t bytesEscritos = audioFile.write((uint8_t*)&sample, sizeof(sample));
      if (bytesEscritos > 0) {
        totalAudioBytes += bytesEscritos;
      }
      
      delayMicroseconds(10); 
    }
    
    audioFile.flush(); 
  }
}
