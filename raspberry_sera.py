# -*- coding: utf-8 -*-
"""
Akilli Sera - Raspberry Pi IoT Kontrol Arayuzu
Firebase Realtime Database baglantisi ve yerel otomatik kontrol dongusu.

Gereksinimler:
pip install firebase-admin

Calistirmak icin:
python raspberry_sera.py
"""

import time
import random
import threading
import firebase_admin
from firebase_admin import credentials
from firebase_admin import db

# ==========================================
# 1. GPIO / RÖLE VE SENSÖR YAPILANDIRMASI
# ==========================================
# Gercek donanimda RPi.GPIO kütüphanesini kullanin:
# import RPi.GPIO as GPIO
# GPIO.setmode(GPIO.BCM)

# Röle Pin Tanimlamalari (Raspberry Pi GPIO Pin Numaralari)
PINS = {
    "pompa1": 17,  # Pompa 1 (Besin)
    "pompa2": 27,  # Pompa 2 (Sirkülasyon)
    "pompa3": 22,  # Pompa 3 (pH Dengeleyici)
    "fan": 23,     # Fan (Havalandirma)
    "led": 24      # LED (Gelisim Isigi)
}

# Röle pinlerini cikis olarak tanimlama simülasyonu
print("--- Akıllı Sera GPIO Yapılandırması Başlatıldı ---")
for device, pin in PINS.items():
    print("ROLEYE BAGLANDI: {} -> GPIO Pin: {}".format(device.upper(), pin))
    # GPIO.setup(pin, GPIO.OUT)
    # GPIO.output(pin, GPIO.LOW)  # Varsayilan olarak kapali

# ==========================================
# 2. FIREBASE BAĞLANTI AYARLARI
# ==========================================
# Firebase Console'dan indirdiginiz servis hesabi anahtar dosyasini buraya yerlestirin:
CRED_PATH = "serviceAccountKey.json"
DATABASE_URL = "https://akillisera-5dc6a-default-rtdb.europe-west1.firebasedatabase.app"

use_firebase = False

try:
    cred = credentials.Certificate(CRED_PATH)
    firebase_admin.initialize_app(cred, {
        'databaseURL': DATABASE_URL
    })
    use_firebase = True
    print("\n[FIREBASE] Baglanti basariyla kuruldu!")
except Exception as e:
    print("\n[HATA] Firebase Servis Anahtarı bulunamadı veya bağlantı kurulamadı!")
    print("Lütfen 'serviceAccountKey.json' dosyasını bu dizine ekleyin ve DATABASE_URL değerini güncelleyin.")
    print("Sistem şu anda SIMÜLE donanım modunda çalışıyor.")

# Yerel Telemetry Verileri (Sensör Ölçümleri)
telemetry = {
    "ortamTemp": 24.8,
    "ortamHumid": 62.0,
    "suTds": 780,
    "suTemp": 21.5
}

# Aktif Limit Eşikleri (Firebase settings/thresholds altından anlık senkronize edilir)
thresholds = {
    "ortamTemp": {"min": 18, "max": 30},
    "ortamHumid": {"min": 40, "max": 80},
    "suTds": {"min": 600, "max": 900},
    "suTemp": {"min": 16, "max": 26}
}

auto_mode = False
actuator_states = {
    "pompa1": False,
    "pompa2": False,
    "pompa3": False,
    "fan": False,
    "led": False
}

# ==========================================
# 3. YEREL RÖLE KONTROL TETİKLEYİCİSİ
# ==========================================
def set_physical_relay(device, state):
    """
    Röle pinlerini HIGH veya LOW yaparak fiziksel donanımı çalıştırır veya durdurur.
    """
    actuator_states[device] = state
    pin = PINS[device]
    status_str = "AKTİF / CALISIYOR" if state else "KAPALI / DURDURULDU"
    
    # Gercek donanim tetikleme:
    # GPIO.output(pin, GPIO.HIGH if state else GPIO.LOW)
    
    print("[DONANIM] {0} (GPIO Pin {1}) -> {2}".format(device.upper(), pin, status_str))

# ==========================================
# 4. FIREBASE VERİ DINLEME (LISTENER)
# ==========================================
def on_actuator_change(event):
    """
    Kullanıcı web portalından butona bastığında tetiklenir ve röleyi açar/kapatır.
    """
    if auto_mode:
        # Otomatik mod aktifse manuel komutlari yok say
        return

    path = event.path
    data = event.data
    
    if path == "/":
        # Tüm cihazların toplu ilk yüklemesi
        if data:
            for device, state in data.items():
                if device in PINS:
                    set_physical_relay(device, bool(state))
    else:
        # Tek bir cihazın anlık durum değişimi (Örn: /fan)
        device = path.replace("/", "")
        if device in PINS:
            set_physical_relay(device, bool(data))

def on_settings_change(event):
    """
    Sistem modu (autoMode) veya limit eşikleri değiştiğinde anlık olarak güncellenir.
    """
    global auto_mode, thresholds
    path = event.path
    data = event.data
    
    if path == "/":
        if data:
            if "autoMode" in data:
                auto_mode = bool(data["autoMode"])
                print("[MOD] Tam Otomatik Kontrol: {}".format("AKTIF" if auto_mode else "PASIF (MANUEL)"))
            if "thresholds" in data:
                thresholds = data["thresholds"]
    elif "autoMode" in path:
        auto_mode = bool(data)
        print("[MOD] Tam Otomatik Kontrol: {}".format("AKTIF" if auto_mode else "PASIF (MANUEL)"))
    elif "thresholds" in path:
        # Limit eşiği güncellemesi
        param = path.split("/")[-1]
        if param in thresholds:
            thresholds[param] = data

# Firebase dinleyicilerini arka planda baslatma
if use_firebase:
    db.reference("greenhouse/actuators").listen(on_actuator_change)
    db.reference("greenhouse/settings").listen(on_settings_change)

# ==========================================
# 5. YEREL LOKAL KONTROL (EDGE AUTOMATION LOOP)
# ==========================================
def local_auto_control_loop():
    """
    RASPBERRY PI LOKAL OTOMASYON MOTORU
    Sera içi sensör verilerini okur ve autoMode aktif ise cihazları kararlı limitlerde tutar.
    Lokalde çalıştığı için internet kopsa dahi serayı tamamen korur!
    """
    global telemetry
    while True:
        # A. SENSÖRLERDEN VERİ OKUMA SİMÜLASYONU
        # (Fiziksel donanımda sensör kütüphanelerinden okunacaktır, Örn: DHT22)
        temp_drift = random.uniform(-0.15, 0.15)
        humid_drift = random.uniform(-0.5, 0.5)
        tds_drift = random.randint(-2, 2)
        water_temp_drift = random.uniform(-0.05, 0.05)

        # Aktüatörlerin sensörlere fiziksel etkisi (Isı dalgalanmaları, pompalama etkisi)
        if actuator_states["fan"]:
            telemetry["ortamTemp"] -= 0.12
            telemetry["ortamHumid"] -= 0.5
        else:
            telemetry["ortamTemp"] += 0.04
            
        if actuator_states["led"]:
            telemetry["ortamTemp"] += 0.08
            
        if actuator_states["pompa1"]:
            telemetry["suTds"] += 6
        elif actuator_states["pompa2"]:
            telemetry["suTds"] -= 1

        if actuator_states["pompa3"]:
            telemetry["suTds"] -= 3

        telemetry["ortamTemp"] += temp_drift
        telemetry["ortamHumid"] += humid_drift
        telemetry["suTds"] += tds_drift
        telemetry["suTemp"] += water_temp_drift

        # B. OTOMATİK MOD DEĞERLENDİRME DÖNGÜSÜ (PI EDGE CONTROLLER)
        if auto_mode:
            print("\n--- Yerel Otomatik Kontrol Devrede (Raspberry Pi Edge) ---")
            
            # 1. Sıcaklık & Nem Kontrolü -> Fan Sistemi
            # Sıcaklık max sınırı aşarsa veya Nem max sınırı aşarsa fanı aç; min sınırların altına inerse kapat.
            should_fan_be_on = actuator_states["fan"]
            if telemetry["ortamTemp"] > thresholds["ortamTemp"]["max"] or telemetry["ortamHumid"] > thresholds["ortamHumid"]["max"]:
                should_fan_be_on = True
            elif telemetry["ortamTemp"] < thresholds["ortamTemp"]["min"] + 2 and telemetry["ortamHumid"] < thresholds["ortamHumid"]["min"] + 10:
                should_fan_be_on = False

            if actuator_states["fan"] != should_fan_be_on:
                set_physical_relay("fan", should_fan_be_on)
                if use_firebase:
                    db.reference("greenhouse/actuators/fan").set(should_fan_be_on)

            # 2. Sıcaklık Düşükse LED Gelisim Işığını Açarak Isınma Sağla (Güneş Işığı Simülasyonu)
            should_led_be_on = actuator_states["led"]
            if telemetry["ortamTemp"] < thresholds["ortamTemp"]["min"]:
                should_led_be_on = True
            elif telemetry["ortamTemp"] > thresholds["ortamTemp"]["max"] - 2:
                should_led_be_on = False

            if actuator_states["led"] != should_led_be_on:
                set_physical_relay("led", should_led_be_on)
                if use_firebase:
                    db.reference("greenhouse/actuators/led").set(should_led_be_on)

            # 3. TDS (Besin Değeri) Kontrolü -> Besin Pompası (Pompa 1)
            # TDS min sınırın altına düşerse besleme pompasını çalıştır.
            should_pompa1_be_on = actuator_states["pompa1"]
            if telemetry["suTds"] < thresholds["suTds"]["min"]:
                should_pompa1_be_on = True
            elif telemetry["suTds"] > thresholds["suTds"]["min"] + 80:
                should_pompa1_be_on = False

            if actuator_states["pompa1"] != should_pompa1_be_on:
                set_physical_relay("pompa1", should_pompa1_be_on)
                if use_firebase:
                    db.reference("greenhouse/actuators/pompa1").set(should_pompa1_be_on)

            # 4. TDS Yüksekse pH Düzenleyici Asit (Pompa 3) çalıştırarak dengeliyoruz
            should_pompa3_be_on = actuator_states["pompa3"]
            if telemetry["suTds"] > thresholds["suTds"]["max"]:
                should_pompa3_be_on = True
            elif telemetry["suTds"] < thresholds["suTds"]["max"] - 80:
                should_pompa3_be_on = False

            if actuator_states["pompa3"] != should_pompa3_be_on:
                set_physical_relay("pompa3", should_pompa3_be_on)
                if use_firebase:
                    db.reference("greenhouse/actuators/pompa3").set(should_pompa3_be_on)

            # 5. Su Sirkülasyon Pompası (Pompa 2) -> Otomatik modda sürekli su devirdaimi için açık tutulur
            if not actuator_states["pompa2"]:
                set_physical_relay("pompa2", True)
                if use_firebase:
                    db.reference("greenhouse/actuators/pompa2").set(True)

        # C. VERİLERİ FIREBASE'E GÖNDERME
        if use_firebase:
            telemetry["lastUpdated"] = {".sv": "timestamp"}  # Sunucu saati ile guncelle
            try:
                db.reference("greenhouse/telemetry").set(telemetry)
                print("[TELEMETRY] Sensor verileri yuklendi -> Temp: {0:.1f}C, Humid: {1:.0f}%, TDS: {2}ppm".format(
                    telemetry["ortamTemp"], telemetry["ortamHumid"], telemetry["suTds"]
                ))
            except Exception as e:
                print("[HATA] Telemetry verileri yuklenemedi: {}".format(e))
        else:
            # Offline modda konsola yazdir
            print("[MOCK TELEMETRY] Temp: {0:.1f}C, Humid: {1:.0f}%, TDS: {2}ppm".format(
                telemetry["ortamTemp"], telemetry["ortamHumid"], telemetry["suTds"]
            ))

        time.sleep(3.5)

# Lokal döngüyü arka planda baslat
auto_thread = threading.Thread(target=local_auto_control_loop)
auto_thread.daemon = True
auto_thread.start()

# Ana programın kapanmasını önleme
try:
    print("\n--- Akıllı Sera IoT Sistem Servisi Başarıyla Çalıştırıldı ---")
    print("Çıkış yapmak için Ctrl+C tuşlarına basın.")
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nSistem kapatılıyor. GPIO pinleri temizleniyor...")
    # GPIO.cleanup()
    print("Güvenli çıkış yapıldı.")
