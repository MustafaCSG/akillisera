/**
 * Akilli Sera - NodeMCU (ESP8266) IoT Kontrol Yazilimi
 * 
 * Bu yazilim, Firebase Realtime Database ile NodeMCU arasindaki
 * cift yonlu veri akisini ve yerel sera otomasyon dongusunu yonetir.
 * 
 * Kullanilan Kutuphaneler:
 * - ESP8266WiFi (Dahili)
 * - Firebase-ESP8266 (Yazar: Mobizt)
 * - Adafruit ADS1X15 (ADS1115 ADC Modulu icin)
 * - DHT sensor library (DHT22 sensoru icin)
 * - OneWire ve DallasTemperature (DS18B20 Su Sicaklik sensoru icin)
 */

#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>  // ADS1115 kutuphanesi
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ==========================================
// 1. KULLANICI VE SISTEM YAPILANDIRMASI
// ==========================================
// Wi-Fi Bilgileri
#define WIFI_SSID "TTNET_ZyXEL_HE49"
#define WIFI_PASSWORD "679B688158157"

// Firebase Bilgileri
#define FIREBASE_HOST "https://akillisera-5dc6a-default-rtdb.europe-west1.firebasedatabase.app"
#define FIREBASE_AUTH "AIzaSyCQKS2ESgAbL5CVjp05vu2EOAgkntvFWxI" // API Anahtari veya DB Secret

// Firebase Authentication (E-posta / Sifre ile yetkilendirme)
#define FIREBASE_EMAIL "akilli@sera.com"
#define FIREBASE_PASSWORD "123456"

// ==========================================
// 2. PIN TANIMLAMALARI
// ==========================================
// I2C Pinleri (ADS1115 icin)
#define I2C_SDA D2 // GPIO4
#define I2C_SCL D1 // GPIO5

// Role Kontrol Pinleri (ESP8266 GPIO)
#define PIN_POMPA_ANA   D5 // GPIO14 - Ana Su Pompasi (Damlama)
#define PIN_POMPA_BES_A D6 // GPIO12 - Besin A Pompasi
#define PIN_POMPA_BES_B D7 // GPIO13 - Besin B Pompasi
#define PIN_ROLE_LED    D0 // GPIO16 - LED Işık
#define PIN_ROLE_FAN    D8 // GPIO15 - Fan (Boot sirasinda LOW kalmasi icin role karti aktif-HIGH veya pull-down olmali)

// Sensor Pinleri
#define PIN_DHT         D4 // GPIO2  - DHT22 (Ortam Sicaklik / Nem)
#define DS18B20_PIN     D3 // GPIO0  - DS18B20 Su Sicakligi (D3 pini, harici veya dahi 4.7k/10k pull-up ile)
#define SAMANDIRA_ADS_CHANNEL 1 // ADS1115 Channel A1 - Su Seviye Şamandırası (harici 10k pull-up ile)

// ==========================================
// 3. SENSOR VE AKTUATOR NESNELERI
// ==========================================
DHT dht(PIN_DHT, DHT22);
OneWire oneWire(DS18B20_PIN);
DallasTemperature sensors(&oneWire);
Adafruit_ADS1115 ads; // 16-Bit ADC nesnesi

// Firebase Baglanti Nesneleri
FirebaseData fbdoTelemetry;
FirebaseData fbdoActuators;
FirebaseData fbdoSettings;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

// ==========================================
// 4. SISTEM DURUM DEGISKENLERI
// ==========================================
struct TelemetryData {
  float ortamTemp = 24.8;
  float ortamHumid = 62.0;
  int suTds = 780;
  float suTemp = 21.5;
  bool suSeviyesi = true; // true = Yeterli (Dolu), false = Yetersiz (Bos)
} telemetry;

struct Thresholds {
  float ortamTempMin = 18.0;
  float ortamTempMax = 30.0;
  float ortamHumidMin = 40.0;
  float ortamHumidMax = 80.0;
  int suTdsMin = 600;
  int suTdsMax = 900;
  float suTempMin = 16.0;
  float suTempMax = 26.0;
} thresholds;

bool autoMode = false;
bool adsAvailable = false;

struct ActuatorStates {
  bool pompaAna = false;
  bool pompaBesA = false;
  bool pompaBesB = false;
  bool fan = false;
  bool led = false;
} actuators;

// TDS Kalibrasyon Parametreleri
float VREF = 3.3;      // NodeMCU besleme voltaji veya ADS1115 referans voltaji
float calibrationFactor = 1.0; 

// Zamanlama Kontrolleri
unsigned long lastTelemetryTime = 0;
const unsigned long telemetryInterval = 5000; // 5 saniyede bir telemetry gonder

// ==========================================
// 5. YARDIMCI FONKSIYONLAR & KONTROLLER
// ==========================================

// Role durumlarini fiziksel pinlere uygular
void updatePhysicalRelays() {
  // Pompa Kuru Calisma Korumasi (Su Seviyesi Bos ise pompalari kapat)
  if (!telemetry.suSeviyesi) {
    if (actuators.pompaAna || actuators.pompaBesA || actuators.pompaBesB) {
      Serial.println(F("[GUVENLIK] Su seviyesi KRITIK! Tum pompalar acilen durduruluyor."));
      actuators.pompaAna = false;
      actuators.pompaBesA = false;
      actuators.pompaBesB = false;
      
      // Veritabanindaki durumlari da guncelle
      if (Firebase.ready()) {
        Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/pompa1", false);
        Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/pompa2", false);
        Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/pompa3", false);
      }
    }
  }

  // Roleler genellikle aktif-LOW (tetiklendiginde LOW çeker) calisir. 
  // Baglantiniza gore HIGH/LOW durumlarini tersine cevirebilirsiniz.
  digitalWrite(PIN_POMPA_ANA,   actuators.pompaAna   ? LOW : HIGH);
  digitalWrite(PIN_POMPA_BES_A, actuators.pompaBesA  ? LOW : HIGH);
  digitalWrite(PIN_POMPA_BES_B, actuators.pompaBesB  ? LOW : HIGH);
  digitalWrite(PIN_ROLE_FAN,    actuators.fan        ? LOW : HIGH);
  digitalWrite(PIN_ROLE_LED,    actuators.led        ? LOW : HIGH);
}

// TDS Sensorunden veri okuma ve sicaklik kompanzasyonu
int readTdsValue(float temperature) {
  if (!adsAvailable) return -1; // ADS1115 yoksa -1 don (N/A tetikler)
  
  // ADS1115 A0 kanalindan analog degeri oku (Single-ended okuma)
  int16_t adc0 = ads.readADC_SingleEnded(0); 
  float voltage = adc0 * 0.1875 / 1000.0; // ADS1115 varsayilan gain ile 1 LSB = 0.1875mV
  
  // Sicaklik kompanzasyon formulu: f(T) = 1 + 0.02 * (T - 25)
  float compensationCoefficient = 1.0 + 0.02 * (temperature - 25.0);
  float compensatedVoltage = voltage / compensationCoefficient;
  
  // Voltajdan TDS degerine donusum (PPM)
  float tds = (133.33 * compensatedVoltage * compensatedVoltage * compensatedVoltage 
               - 255.86 * compensatedVoltage * compensatedVoltage 
               + 857.39 * compensatedVoltage) * 0.5 * calibrationFactor;
               
  return (int)tds;
}

// Sensörlerden verileri okur ve telemetry yapisini gunceller
void readSensors() {
  // 1. Ortam Sicaklik ve Nem (DHT22)
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) {
    telemetry.ortamTemp = t;
    telemetry.ortamHumid = h;
  } else {
    telemetry.ortamTemp = -99.0;
    telemetry.ortamHumid = -99.0;
    Serial.println(F("[HATA] DHT22 sensorunden veri okunamadi!"));
  }

  // 2. Su Sicakligi (DS18B20)
  sensors.requestTemperatures();
  float waterTemp = sensors.getTempCByIndex(0);
  if (waterTemp != DEVICE_DISCONNECTED_C) {
    telemetry.suTemp = waterTemp;
  } else {
    telemetry.suTemp = -127.0;
    Serial.println(F("[HATA] DS18B20 sensorunden veri okunamadi!"));
  }

  // 3. Su Seviyesi (ADS1115 A1 uzerinden)
  if (adsAvailable) {
    int16_t adc1 = ads.readADC_SingleEnded(SAMANDIRA_ADS_CHANNEL);
    float voltage1 = adc1 * 0.1875 / 1000.0;
    telemetry.suSeviyesi = (voltage1 < 1.5); // 1.5V altındaysa su var (yeterli)
  } else {
    telemetry.suSeviyesi = true; // ADS1115 yoksa varsayilan
  }

  // 4. TDS (ADS1115 A0 uzerinden su sicakligi kompanzasyonlu okuma)
  telemetry.suTds = readTdsValue(telemetry.suTemp);
}

// Yerel otomasyon dongusu (Lokal Karar Motoru - Internet kopsa dahi calisir)
void runLocalAutomation() {
  if (!autoMode) return;

  Serial.println(F("[OTOMASYON] Yerel Akilli Otomasyon Kontrol Ediyor..."));

  // 1. Ortam Sicakligi & Nem Kontrolu -> Fan
  // Sicaklik veya nem maksimum siniri asarsa fani ac; min sinira geldiginde kapat
  if (telemetry.ortamTemp > thresholds.ortamTempMax || telemetry.ortamHumid > thresholds.ortamHumidMax) {
    actuators.fan = true;
  } else if (telemetry.ortamTemp < (thresholds.ortamTempMin + 2.0) && telemetry.ortamHumid < (thresholds.ortamHumidMin + 10.0)) {
    actuators.fan = false;
  }

  // 2. Sicaklik Dusukse LED Gelisim Isigini Acarak Isinma Sagla
  if (telemetry.ortamTemp < thresholds.ortamTempMin) {
    actuators.led = true;
  } else if (telemetry.ortamTemp > (thresholds.ortamTempMax - 2.0)) {
    actuators.led = false;
  }

  // 3. TDS (Besin) Kontrolu -> Besin A ve B Pompasi (Birlikte calistirilir)
  // TDS min sinirin altina duserse besleme yapilir, hedef degeri asinca durdurulur
  if (telemetry.suTds < thresholds.suTdsMin) {
    // Su seviyesi yeterli ise pompalari ac
    if (telemetry.suSeviyesi) {
      actuators.pompaBesA = true;
      actuators.pompaBesB = true;
    }
  } else if (telemetry.suTds > (thresholds.suTdsMin + 80)) {
    actuators.pompaBesA = false;
    actuators.pompaBesB = false;
  }

  // Yerel kararlari rolelere uygula
  updatePhysicalRelays();
  
  // Veritabanini yerel durumlar ile guncelle
  if (Firebase.ready()) {
    Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/fan", actuators.fan);
    Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/led", actuators.led);
    Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/pompa1", actuators.pompaBesA);
    Firebase.setBool(fbdoTelemetry, "/greenhouse/actuators/pompa3", actuators.pompaBesB);
  }
}

// Telemetry verilerini Firebase RTDB'ye gonderir
void sendTelemetryToFirebase() {
  FirebaseJson json;
  
  if (telemetry.ortamTemp <= -99.0) json.add("ortamTemp", "N/A");
  else json.add("ortamTemp", telemetry.ortamTemp);

  if (telemetry.ortamHumid <= -99.0) json.add("ortamHumid", "N/A");
  else json.add("ortamHumid", telemetry.ortamHumid);

  if (telemetry.suTds == -1) json.add("suTds", "N/A");
  else json.add("suTds", telemetry.suTds);

  if (telemetry.suTemp <= -127.0) json.add("suTemp", "N/A");
  else json.add("suTemp", telemetry.suTemp);

  if (!adsAvailable) json.add("suSeviyesi", "N/A");
  else json.add("suSeviyesi", telemetry.suSeviyesi);
  
  // Sunucu zaman damgasi
  FirebaseJson timestampJson;
  timestampJson.add(".sv", "timestamp");
  json.add("lastUpdated", timestampJson);

  Serial.println(F("[FIREBASE] Telemetry yukleniyor..."));
  if (Firebase.set(fbdoTelemetry, "/greenhouse/telemetry", json)) {
    Serial.println(F("[FIREBASE] Telemetry basariyla gonderildi!"));
  } else {
    Serial.printf("[HATA] Telemetry gonderilemedi: %s\n", fbdoTelemetry.errorReason().c_str());
  }
}

// Firebase'den anlik veri akisini dinleyen Stream Callback'leri
void streamCallback(StreamData data) {
  String streamPath = data.streamPath();
  String dataPath = data.dataPath();
  
  Serial.printf("[FIREBASE STREAM] Yol: %s, Veri Yolu: %s, Deger: %s\n", 
                streamPath.c_str(), dataPath.c_str(), data.payload().c_str());

  // A. AKTÜATÖR KOMUTLARI
  if (streamPath.startsWith("/greenhouse/actuators")) {
    if (autoMode) return; // Otomatik modda iken gelen manuel komutlari yoksay

    bool state = data.boolData();
    
    if (dataPath == "/pompa1") actuators.pompaBesA = state;
    else if (dataPath == "/pompa2") actuators.pompaAna = state;
    else if (dataPath == "/pompa3") actuators.pompaBesB = state;
    else if (dataPath == "/fan") actuators.fan = state;
    else if (dataPath == "/led") actuators.led = state;
    else if (dataPath == "/") {
      // Toplu ilk yukleme
      FirebaseJson &json = data.jsonObject();
      FirebaseJsonData result;
      
      json.get(result, "pompa1"); if (result.success) actuators.pompaBesA = result.boolValue;
      json.get(result, "pompa2"); if (result.success) actuators.pompaAna = result.boolValue;
      json.get(result, "pompa3"); if (result.success) actuators.pompaBesB = result.boolValue;
      json.get(result, "fan");    if (result.success) actuators.fan = result.boolValue;
      json.get(result, "led");    if (result.success) actuators.led = result.boolValue;
    }
    
    updatePhysicalRelays();
  }
  
  // B. MOD VE LIMIT AYARLARI
  else if (streamPath.startsWith("/greenhouse/settings")) {
    if (dataPath == "/autoMode") {
      autoMode = data.boolData();
      Serial.printf("[MOD] Tam Otomatik Mod: %s\n", autoMode ? "AKTIF" : "PASIF");
    } 
    else if (dataPath == "/") {
      FirebaseJson &json = data.jsonObject();
      FirebaseJsonData result;
      
      json.get(result, "autoMode");
      if (result.success) {
        autoMode = result.boolValue;
        Serial.printf("[MOD] Tam Otomatik Mod: %s\n", autoMode ? "AKTIF" : "PASIF");
      }
    }
    else if (dataPath.startsWith("/thresholds")) {
      // Limit esigi guncellemesi
      FirebaseJson &json = data.jsonObject();
      FirebaseJsonData result;
      
      // Eşikleri güncelle
      json.get(result, "ortamTemp/min"); if (result.success) thresholds.ortamTempMin = result.doubleValue;
      json.get(result, "ortamTemp/max"); if (result.success) thresholds.ortamTempMax = result.doubleValue;
      json.get(result, "ortamHumid/min"); if (result.success) thresholds.ortamHumidMin = result.doubleValue;
      json.get(result, "ortamHumid/max"); if (result.success) thresholds.ortamHumidMax = result.doubleValue;
      json.get(result, "suTds/min"); if (result.success) thresholds.suTdsMin = result.intValue;
      json.get(result, "suTds/max"); if (result.success) thresholds.suTdsMax = result.intValue;
      json.get(result, "suTemp/min"); if (result.success) thresholds.suTempMin = result.doubleValue;
      json.get(result, "suTemp/max"); if (result.success) thresholds.suTempMax = result.doubleValue;
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println(F("[STREAM] Baglanti zaman asimina ugradi, yeniden kuruluyor..."));
  }
}

// ==========================================
// 6. SETUP & LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println(F("\n--- Sera NodeMCU Yapilandirmasi Baslatildi ---"));

  // Pin Modlari
  pinMode(PIN_POMPA_ANA,   OUTPUT);
  pinMode(PIN_POMPA_BES_A, OUTPUT);
  pinMode(PIN_POMPA_BES_B, OUTPUT);
  pinMode(PIN_ROLE_FAN,    OUTPUT);
  pinMode(PIN_ROLE_LED,    OUTPUT);

  // Roleleri varsayilan olarak KAPALI yap (Pasif-HIGH röleler icin HIGH yaz)
  digitalWrite(PIN_POMPA_ANA,   HIGH);
  digitalWrite(PIN_POMPA_BES_A, HIGH);
  digitalWrite(PIN_POMPA_BES_B, HIGH);
  digitalWrite(PIN_ROLE_FAN,    HIGH);
  digitalWrite(PIN_ROLE_LED,    HIGH);

  // I2C Baslat ve ADS1115 algila (Floating pin donma engelleme)
  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  delay(10);
  // I2C pinlerinde pull-up varsa bosken HIGH okunurlar, yoksa floating/LOW olur.
  if (digitalRead(I2C_SDA) == HIGH && digitalRead(I2C_SCL) == HIGH) {
    Serial.println(F("[I2C] Hat pull-up algilandi. ADS1115 baslatiliyor..."));
    Wire.begin(I2C_SDA, I2C_SCL);
    if (ads.begin()) {
      adsAvailable = true;
      Serial.println(F("[I2C] ADS1115 basariyla baslatildi!"));
    } else {
      Serial.println(F("[I2C] HATA: ADS1115 baslatilamadi (Cihaz bagli olmayabilir)!"));
    }
  } else {
    Serial.println(F("[I2C] UYARI: I2C hattinda pull-up algilanamadi (ADS1115 bagli degil, simülasyon modunda)."));
  }
  
  // Sensorleri Baslat
  dht.begin();
  sensors.begin();

  // Wi-Fi Baglantisi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("WiFi Baglantisi kuruluyor..."));
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(F("\nWiFi Baglantisi Basarili!"));
  Serial.print(F("IP Adresi: "));
  Serial.println(WiFi.localIP());

  // Zaman Senkronizasyonu (NTP) - Firebase Auth icin gerekli!
  configTime(3 * 3600, 0, "pool.ntp.org", "time.nist.gov"); // GMT+3 (Turkiye)
  Serial.print(F("Zaman senkronizasyonu yapiliyor..."));
  time_t now = time(nullptr);
  int retryCount = 0;
  while (now < 24 * 3600 && retryCount < 20) { // 20 saniye limit
    delay(1000);
    Serial.print(".");
    now = time(nullptr);
    retryCount++;
  }
  if (now > 24 * 3600) {
    Serial.println(F("\nZaman senkronize edildi!"));
  } else {
    Serial.println(F("\n[UYARI] Zaman senkronizasyonu zaman asimina ugradi! Firebase baglantisi basarisiz olabilir."));
  }

  // Firebase Yapilandirmasi
  fbConfig.database_url = FIREBASE_HOST;
  fbConfig.api_key = FIREBASE_AUTH;
  
  fbAuth.user.email = FIREBASE_EMAIL;
  fbAuth.user.password = FIREBASE_PASSWORD;

  // Firebase Baslat
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  // Firebase Stream Baslat (Gercek zamanli komut dinleme)
  if (!Firebase.beginStream(fbdoActuators, "/greenhouse/actuators")) {
    Serial.printf("[HATA] Actuator Stream baslatilamadi: %s\n", fbdoActuators.errorReason().c_str());
  } else {
    Firebase.setStreamCallback(fbdoActuators, streamCallback, streamTimeoutCallback);
  }

  if (!Firebase.beginStream(fbdoSettings, "/greenhouse/settings")) {
    Serial.printf("[HATA] Settings Stream baslatilamadi: %s\n", fbdoSettings.errorReason().c_str());
  } else {
    Firebase.setStreamCallback(fbdoSettings, streamCallback, streamTimeoutCallback);
  }

  Serial.println(F("--- Sera Hazir, Izleme Basladi ---"));
}

void loop() {
  // Sensör verilerini anlık oku
  readSensors();

  // Acil durum röle durum güncellemesi (kuru çalışma koruması vb.)
  updatePhysicalRelays();

  // Yerel otomasyon kontrolü
  runLocalAutomation();

  // Telemetry Gönderme Zamanlaması (telemetryInterval kadar saniyede bir)
  unsigned long now = millis();
  if (now - lastTelemetryTime >= telemetryInterval) {
    lastTelemetryTime = now;
    if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
      sendTelemetryToFirebase();
    } else {
      Serial.println(F("[UYARI] Baglanti yok, offline modda yerel otomasyon calisiyor."));
    }
  }

  // Hafif bir gecikme ekleyerek islemci yukunu hafifletelim
  delay(200);
}
