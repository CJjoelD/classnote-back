#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <FS.h>
#include <SD.h>
#include <SPI.h>
#include <driver/i2s.h>

// --- CONFIGURACIÓN DE HARDWARE (AJUSTAR SEGÚN TU PLACA) ---
// Micrófono I2S digital INMP441
#define I2S_WS      15
#define I2S_SD      32
#define I2S_SCK     14
#define I2S_PORT    I2S_NUM_0

// Lector de tarjetas microSD (Bus SPI Estándar del ESP32)
#define SD_CS       5

// Interfaz Física: Pulsador y Diodos LED de Estado
#define BTN_PIN     4     // Botón físico (Normalmente HIGH con pull-up)
#define LED_GREEN   21    // LED Verde: Indica dispositivo Listo / Operativo
#define LED_RED     22    // LED Rojo: Indica Grabando / Procesando

// --- CONFIGURACIÓN DE CONEXIÓN WIFI Y BACKEND ---
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";
// IMPORTANTE: Reemplazar por la IP local del backend de tu PC en tu red WiFi
const char* serverUrl = "http://192.168.11.3:5000/api/classes/upload-hardware";
const char* heartbeatUrl = "http://192.168.11.3:5000/api/devices/heartbeat";

// Parámetros de Audio PCM/WAV
#define SAMPLE_RATE     16000                     // Frecuencia recomendada para Whisper (16kHz)
#define BITS_PER_SAMPLE I2S_BITS_PER_SAMPLE_16BIT  // 16-bit por muestra
#define BUFFER_SIZE     1024                      // Tamaño del buffer de lectura I2S

// Variables de Control
bool isRecording = false;
File audioFile;
String currentFilename = "";
int fileCounter = 0;
unsigned long totalAudioBytes = 0;
unsigned long lastHeartbeatAt = 0;
const unsigned long heartbeatInterval = 60000;

// Debouncing de Botón físico
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 450; // Aumentado a 450ms para evitar falsas dobles pulsaciones rápidas

// --- FUNCIONES PARA CONSTRUCCIÓN DE ARCHIVOS WAV ---

// Escribe la cabecera estándar RIFF/WAV de 44 bytes al inicio del archivo
void writeWavHeader(File file) {
  byte header[44];
  
  // Marca "RIFF"
  header[0] = 'R'; header[1] = 'I'; header[2] = 'F'; header[3] = 'F';
  
  // Tamaño total del archivo menos 8 bytes (se corregirá al finalizar la grabación)
  uint32_t fileSize = 0;
  header[4] = fileSize & 0xff;
  header[5] = (fileSize >> 8) & 0xff;
  header[6] = (fileSize >> 16) & 0xff;
  header[7] = (fileSize >> 24) & 0xff;
  
  // Formato "WAVE" y Sub-sección "fmt "
  header[8] = 'W'; header[9] = 'A'; header[10] = 'V'; header[11] = 'E';
  header[12] = 'f'; header[13] = 'm'; header[14] = 't'; header[15] = ' ';
  
  // Tamaño del bloque fmt (16 bytes para PCM lineal)
  header[16] = 16;  header[17] = 0;   header[18] = 0;   header[19] = 0;
  
  // Formato de Audio: 1 = PCM No Comprimido
  header[20] = 1;   header[21] = 0;
  
  // Número de Canales: 1 = Mono (Whisper funciona de forma nativa en Mono)
  header[22] = 1;   header[23] = 0;
  
  // Frecuencia de muestreo (Sample Rate)
  uint32_t sampleRate = SAMPLE_RATE;
  header[24] = sampleRate & 0xff;
  header[25] = (sampleRate >> 8) & 0xff;
  header[26] = (sampleRate >> 16) & 0xff;
  header[27] = (sampleRate >> 24) & 0xff;
  
  // Tasa de Transferencia (Byte Rate): SampleRate * NumChannels * BitsPerSample/8
  uint32_t byteRate = SAMPLE_RATE * 2; 
  header[28] = byteRate & 0xff;
  header[29] = (byteRate >> 8) & 0xff;
  header[30] = (byteRate >> 16) & 0xff;
  header[31] = (byteRate >> 24) & 0xff;
  
  // Alineación de Bloque (Block Align): NumChannels * BitsPerSample/8 = 2 bytes
  header[32] = 2;   header[33] = 0;
  
  // Bits por muestra: 16 bits
  header[34] = 16;  header[35] = 0;
  
  // Sección de datos "data"
  header[36] = 'd'; header[37] = 'a'; header[38] = 't'; header[39] = 'a';
  
  // Tamaño de los datos de audio puros (se actualizará al finalizar)
  uint32_t dataSize = 0;
  header[40] = dataSize & 0xff;
  header[41] = (dataSize >> 8) & 0xff;
  header[42] = (dataSize >> 16) & 0xff;
  header[43] = (dataSize >> 24) & 0xff;
  
  file.write(header, 44);
}

// Sobrescribe los campos de tamaño en la cabecera WAV una vez conocidos los bytes reales
void finalizeWavHeader(String path, uint32_t dataSize) {
  // Abrir el archivo en modo escritura posicionándonos al inicio
  File file = SD.open(path, FILE_WRITE);
  if (!file) {
    Serial.println("No se pudo reabrir el archivo para actualizar cabecera.");
    return;
  }
  
  uint32_t fileSize = dataSize + 36;
  
  // Escribir FileSize en la posición 4
  file.seek(4);
  file.write((uint8_t*)&fileSize, 4);
  
  // Escribir DataSize en la posición 40
  file.seek(40);
  file.write((uint8_t*)&dataSize, 4);
  
  file.close();
  Serial.println("Cabecera WAV finalizada correctamente.");
}

// --- CONEXIÓN E INICIALIZACIÓN DE I2S (MIC INMP441) ---
void initI2S() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = BITS_PER_SAMPLE,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT, // Solo canal izquierdo (INMP441 mono)
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB),
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false
  };
  
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE, // No se usa salida
    .data_in_num = I2S_SD
  };
  
  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
  i2s_start(I2S_PORT);
  Serial.println("Driver I2S inicializado.");
}

// --- CONEXIÓN DE RED WIFI ---
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  Serial.print("Conectando a red WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  // Parpadear el led rojo mientras se conecta a WiFi
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
    Serial.print("Dirección IP local: ");
    Serial.println(WiFi.localIP());
    Serial.print("Dirección MAC del ESP32: ");
    Serial.println(WiFi.macAddress());
  } else {
    Serial.println("\nNo se pudo establecer conexión WiFi. Se subirá en el próximo ciclo.");
  }
}

// Confirma al backend que el dispositivo emparejado sigue disponible.
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(heartbeatUrl);
  http.addHeader("X-Device-MAC", WiFi.macAddress());
  int statusCode = http.POST("");
  Serial.printf("Heartbeat ClassNote Box: %d\\n", statusCode);
  http.end();
}

// --- ENVÍO DIRECTO DE AUDIO HTTP MULTIPART/FORM-DATA ---
bool uploadFile(String path) {
  connectWiFi();
  sendHeartbeat();
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
  
  // Configurar timeout largo para subidas pesadas (5 minutos)
  http.setTimeout(300000);
  
  // Cabeceras HTTP. X-Device-MAC identifica al dispositivo físico
  String mac = WiFi.macAddress();
  http.addHeader("X-Device-MAC", mac);
  http.addHeader("Content-Type", "audio/wav");
  
  Serial.println("Iniciando transmisión de archivo binario directo (Streaming)...");
  
  // Enviar la petición HTTP. sendRequest maneja automáticamente el stream del archivo
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

// --- CONFIGURACIÓN INICIAL (SETUP) ---
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Iniciando ClassNote Box Setup...");
  
  // Inicializar pines físicos
  pinMode(BTN_PIN, INPUT_PULLUP); // Resistencia interna PULL-UP para el botón
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  
  // Estado Inicial: Led Verde encendido (Operativo y en espera)
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, LOW);
  
  // Inicializar la interfaz SPI para la tarjeta MicroSD
  if (!SD.begin(SD_CS)) {
    Serial.println("ERROR CRÍTICO: No se pudo montar la tarjeta MicroSD.");
    // Parpadeo infinito de error en el led rojo
    while (true) {
      digitalWrite(LED_RED, HIGH);
      delay(150);
      digitalWrite(LED_RED, LOW);
      delay(150);
    }
  }
  Serial.println("Tarjeta MicroSD montada con éxito.");
  
  // Inicializar Micrófono I2S
  initI2S();
  
  // Intentar conectar WiFi al encendido (opcional pero ideal)
  connectWiFi();
  
  Serial.println("ClassNote Box inicializado y en espera del botón.");
}

// --- BUCLE DE CONTROL PRINCIPAL (LOOP) ---
void loop() {
  if (!isRecording && millis() - lastHeartbeatAt >= heartbeatInterval) {
    connectWiFi();
    sendHeartbeat();
    lastHeartbeatAt = millis();
  }

  int btnVal = digitalRead(BTN_PIN);
  
  // Detectar pulsación del botón físico con filtrado antirrebotes
  if (btnVal == LOW && (millis() - lastDebounceTime) > debounceDelay) {
    lastDebounceTime = millis();
    
    if (!isRecording) {
      // --- INICIAR PROCESO DE GRABACIÓN ---
      Serial.println("Pulsador detectado: Iniciando grabación física...");
      isRecording = true;
      
      // Indicadores: Apagar Verde, Encender Rojo (Fijo indicando grabación activa)
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_RED, HIGH);
      
      // Crear nombre de archivo de audio único basado en millis y número aleatorio
      // para evitar sobrescrituras accidentales tras reinicios
      currentFilename = "/rec_" + String(millis()) + "_" + String(esp_random() % 1000) + ".wav";
      
      // Abrir archivo en modo escritura
      audioFile = SD.open(currentFilename, FILE_WRITE);
      if (audioFile) {
        writeWavHeader(audioFile);
        totalAudioBytes = 0;
        Serial.println("Archivo de grabación abierto: " + currentFilename);
      } else {
        Serial.println("Error: No se pudo crear el archivo en la microSD.");
        isRecording = false;
        digitalWrite(LED_GREEN, HIGH);
        digitalWrite(LED_RED, LOW);
      }
    } else {
      // --- DETENER PROCESO DE GRABACIÓN ---
      Serial.println("Pulsador detectado: Deteniendo grabación...");
      isRecording = false;
      
      // Cerrar y guardar el archivo de audio
      audioFile.close();
      
      // Corregir tamaño del archivo en la cabecera WAV con los bytes reales
      finalizeWavHeader(currentFilename, totalAudioBytes);
      
      // Indicadores: Apagar ledes mientras se inicia la transmisión
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_GREEN, LOW);
      
      // Parpadear el led rojo lentamente simulando "Cargando/Procesando en Servidor"
      digitalWrite(LED_RED, HIGH);
      
      // Subir archivo al backend por la API
      bool success = uploadFile(currentFilename);
      digitalWrite(LED_RED, LOW);
      
      if (success) {
        Serial.println("Grabación subida exitosamente! Conservando en SD para pruebas...");
        // SD.remove(currentFilename); // COMENTADO para poder revisar el archivo físico en la PC
        fileCounter++;
        
        // Destello de éxito en el LED Verde (3 parpadeos rápidos)
        for (int i = 0; i < 3; i++) {
          digitalWrite(LED_GREEN, HIGH); delay(120);
          digitalWrite(LED_GREEN, LOW);  delay(120);
        }
      } else {
        Serial.println("Fallo en la subida. El audio se conservará en la SD para recuperación física.");
        // Destello de error en el LED Rojo (5 parpadeos rápidos)
        for (int i = 0; i < 5; i++) {
          digitalWrite(LED_RED, HIGH); delay(120);
          digitalWrite(LED_RED, LOW);  delay(120);
        }
      }
      
      // Regresar al estado original de Espera (Listo)
      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(LED_RED, LOW);
    }
  }
  
  // Tarea de Grabación Activa: Capturar datos I2S en buffer y volcar a microSD
  if (isRecording && audioFile) {
    int16_t i2sData[BUFFER_SIZE];
    size_t bytesRead = 0;
    
    // Leer muestras del micrófono I2S
    i2s_read(I2S_PORT, &i2sData, sizeof(i2sData), &bytesRead, portMAX_DELAY);
    
    if (bytesRead > 0) {
      // Escribir bytes leídos en la tarjeta microSD
      audioFile.write((const uint8_t*)i2sData, bytesRead);
      totalAudioBytes += bytesRead;
    }
  }
}
