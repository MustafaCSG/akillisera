/**
 * Akıllı Sera - Mobile Dashboard Interaction Engine
 * Pure Vanilla JavaScript handling transitions, stateful IoT simulations, and YODA scans.
 */

function initApp() {
  // Safe helper to create Lucide icons if loaded
  function safeCreateIcons() {
    if (typeof lucide !== 'undefined') {
      try {
        lucide.createIcons();
      } catch (err) {
        console.error("Lucide icons could not be initialized:", err);
      }
    } else {
      console.warn("Lucide library is not loaded.");
    }
  }

    // Initialize Lucide Icons
    safeCreateIcons();

    // --- 0. FIREBASE INTEGRATION SETUP ---
    // Replace these placeholders with your actual Firebase project config credentials
    const firebaseConfig = {
      apiKey: "AIzaSyCQKS2ESgAbL5CVjp05vu2EOAgkntvFWxI",
      authDomain: "akillisera-5dc6a.firebaseapp.com",
      databaseURL: "https://akillisera-5dc6a-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "akillisera-5dc6a",
      storageBucket: "akillisera-5dc6a.firebasestorage.app",
      messagingSenderId: "174924882165",
      appId: "1:174924882165:web:cd2f4a7c2ebd3af67de5bc",
      measurementId: "G-K6SM17QEQ5"
    };

    let db = null;
    let auth = null;
    let useFirebase = false;

    if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
      try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        if (typeof firebase.auth === 'function') {
          auth = firebase.auth();
        }
        useFirebase = true;
        console.log("Firebase RTDB and Authentication successfully initialized.");
      } catch (err) {
        console.error("Firebase initialization failed, falling back to Simulation mode:", err);
      }
    } else {
      console.log("Firebase is not fully configured. Running in offline SIMULATION mode.");
    }

  // --- STATE VARIABLES ---
  let currentUser = { email: "akilli@sera.com", name: "Ceren Demir", role: "Akıllı Sera Yöneticisi" };

  // Real-time IoT sensor telemetry baselines
  let telemetry = {
    ortamTemp: 24.8,
    ortamHumid: 62.0,
    suTds: 780,
    suTemp: 21.5,
    suSeviyesi: true
  };
  let prevSuSeviyesi = true;

  // Real-time daily averages (simulated)
  let dailyAverages = {
    ortamTemp: 24.6,
    ortamHumid: 61,
    suTds: 785,
    suTemp: 21.3
  };

  // Target values when actuators are active
  const baselines = {
    ortamTemp: 24.8,
    ortamHumid: 62.0,
    suTds: 780,
    suTemp: 21.5,
    suSeviyesi: true
  };

  // --- DOM SELECTORS ---
  const screenSplash = document.getElementById("screen-splash");
  const splashProgress = document.getElementById("splash-progress");
  const screenLogin = document.getElementById("screen-login");
  const screenMain = document.getElementById("screen-main");

  // Auto mode elements
  const switchAuto = document.getElementById("switch-auto");
  const rowAuto = document.getElementById("row-auto");
  const statusAuto = document.getElementById("status-auto");


  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");

  // Toast elements
  const toastContainer = document.getElementById("app-toast");
  const toastTitle = document.getElementById("toast-title");
  const toastMsg = document.getElementById("toast-msg");

  // Tab panels & navigation buttons
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanels = document.querySelectorAll(".tab-panel");

  // Sensor DOM values
  const elOrtamTemp = document.getElementById("val-ortam-temp");
  const elOrtamHumid = document.getElementById("val-ortam-humid");
  const elSuTds = document.getElementById("val-su-tds");
  const elSuTemp = document.getElementById("val-su-temp");
  const elSuTdsBadge = document.getElementById("badge-su-tds");

  // Actuator switches & rows
  const switches = {
    pompa1: document.getElementById("switch-pompa1"),
    pompa2: document.getElementById("switch-pompa2"),
    pompa3: document.getElementById("switch-pompa3"),
    fan: document.getElementById("switch-fan"),
    led: document.getElementById("switch-led")
  };

  const rows = {
    pompa1: document.getElementById("row-pompa1"),
    pompa2: document.getElementById("row-pompa2"),
    pompa3: document.getElementById("row-pompa3"),
    fan: document.getElementById("row-fan"),
    led: document.getElementById("row-led")
  };

  const statuses = {
    pompa1: document.getElementById("status-pompa1"),
    pompa2: document.getElementById("status-pompa2"),
    pompa3: document.getElementById("status-pompa3"),
    fan: document.getElementById("status-fan"),
    led: document.getElementById("status-led")
  };

  // YODA scanner elements
  const btnScanYODA = document.getElementById("btn-scan-yoda");
  const scanBtnText = document.getElementById("scan-btn-text");
  const yodaLoader = document.getElementById("yoda-loader");
  const yodaBox = document.getElementById("yoda-box");
  const yodaResults = document.getElementById("yoda-results");
  const yodaTips = document.getElementById("yoda-tips");
  const yodaScanBar = document.getElementById("yoda-scan-bar");

  // Helper to update a single circular progress gauge
  function updateSingleGauge(key, score, averageVal) {
    const fillEl = document.getElementById("gauge-fill-" + key);
    const scoreEl = document.getElementById("score-" + key);
    const statusEl = document.getElementById("status-" + key);
    const badgeEl = document.getElementById("badge-" + key);

    if (fillEl && scoreEl && statusEl) {
      // Handle disconnected sensor values
      if (isNaN(averageVal) || isNaN(score) || averageVal <= -99 || score < 0) {
        scoreEl.innerText = "--";
        statusEl.innerText = "Yok";
        statusEl.style.color = "var(--text-muted)";
        fillEl.style.strokeDashoffset = 110;
        fillEl.style.stroke = "rgba(255, 255, 255, 0.1)";
        if (badgeEl) {
          badgeEl.innerText = "N/A";
          badgeEl.className = "card-badge badge-warning";
        }
        return;
      }
      
      // Format average value to display in the gauge center (no percentages unless it's humidity!)
      if (key === "ortam-temp" || key === "su-temp") {
        scoreEl.innerText = averageVal.toFixed(1) + "°";
      } else if (key === "ortam-humid") {
        scoreEl.innerText = "%" + Math.round(averageVal);
      } else if (key === "su-tds") {
        scoreEl.innerText = Math.round(averageVal) + " ppm";
        // Shrink font size slightly for TDS if it's too long
        scoreEl.style.fontSize = Math.round(averageVal) >= 1000 ? "0.68rem" : "0.78rem";
      }

      // Calculate stroke-dashoffset (stroke-dasharray is 110)
      let offset = 110 - (score / 100) * 110;
      fillEl.style.strokeDashoffset = offset;

      // Determine status and stroke color
      let color = "";
      let statusText = "";
      let badgeClass = "";
      if (score >= 75) {
        statusText = "İyi";
        color = "#2ec4b6"; // Green
        badgeClass = "card-badge badge-normal";
      } else if (score >= 45) {
        statusText = "Orta";
        color = "#ffc107"; // Yellow
        badgeClass = "card-badge badge-warning";
      } else {
        statusText = "Kötü";
        color = "#ff4d4d"; // Red
        badgeClass = "card-badge badge-warning";
      }

      // Apply stroke color
      fillEl.style.stroke = color;
      statusEl.innerText = statusText;
      statusEl.style.color = color;

      // Dynamically update the card-badge next to the value
      if (badgeEl) {
        if (key === "su-tds") {
          badgeEl.innerText = score >= 75 ? "Optimal" : (score >= 45 ? "Yüksek/Düşük" : "Kritik");
        } else {
          badgeEl.innerText = score >= 75 ? "Normal" : (score >= 45 ? "Orta" : "Kritik");
        }
        badgeEl.className = badgeClass;
      }
    }
  }

  // Helper to update all 4 circular progress gauges dynamically
  function updateAllGauges() {
    // 1. Ortam Sıcaklığı
    let tempDiff = Math.abs(telemetry.ortamTemp - 24.8);
    let tempScore = Math.max(0, Math.min(100, Math.round(100 - (tempDiff * 14))));
    updateSingleGauge("ortam-temp", tempScore, dailyAverages.ortamTemp);

    // 2. Ortam Nemi
    let humidDiff = Math.abs(telemetry.ortamHumid - 62);
    let humidScore = Math.max(0, Math.min(100, Math.round(100 - (humidDiff * 3.5))));
    updateSingleGauge("ortam-humid", humidScore, dailyAverages.ortamHumid);

    // 3. Su Besin Değeri (TDS)
    let tdsDiff = Math.abs(telemetry.suTds - 780);
    let tdsScore = Math.max(0, Math.min(100, Math.round(100 - (tdsDiff * 0.4))));
    updateSingleGauge("su-tds", tdsScore, dailyAverages.suTds);

    // 4. Su Sıcaklığı
    let waterTempDiff = Math.abs(telemetry.suTemp - 21.5);
    let waterTempScore = Math.max(0, Math.min(100, Math.round(100 - (waterTempDiff * 25))));
    updateSingleGauge("su-temp", waterTempScore, dailyAverages.suTemp);
  }

  // Helper to update Water Level UI dynamically
  function updateWaterLevelUI() {
    const elSuSeviyesi = document.getElementById("val-su-seviyesi");
    const badgeSuSeviyesi = document.getElementById("badge-su-seviyesi");
    const fillEl = document.getElementById("gauge-fill-su-seviyesi");
    const scoreEl = document.getElementById("score-su-seviyesi");
    const statusEl = document.getElementById("status-su-seviyesi");
    const cardEl = document.getElementById("sensor-card-suSeviyesi");

    if (telemetry.suSeviyesi === undefined) {
      telemetry.suSeviyesi = true; // default to safe water level
    }

    const isWaterOk = telemetry.suSeviyesi;

    if (isWaterOk === "N/A" || isWaterOk === null || isWaterOk === undefined) {
      if (elSuSeviyesi) {
        elSuSeviyesi.innerText = "N/A";
        elSuSeviyesi.style.color = "var(--text-muted)";
      }
      if (badgeSuSeviyesi) {
        badgeSuSeviyesi.innerText = "N/A";
        badgeSuSeviyesi.className = "card-badge badge-warning";
      }
      if (scoreEl) scoreEl.innerText = "--";
      if (statusEl) {
        statusEl.innerText = "Yok";
        statusEl.style.color = "var(--text-muted)";
      }
      if (fillEl) {
        fillEl.style.strokeDashoffset = 110;
        fillEl.style.stroke = "rgba(255, 255, 255, 0.1)";
      }
      if (cardEl) cardEl.classList.remove("pulse-alarm-border");
      return;
    }

    // Check transition for browser notification!
    if (prevSuSeviyesi === true && isWaterOk === false) {
      sendBrowserNotification("🚨 Sera Su Seviyesi Kritik!", "Depodaki su seviyesi kritik düzeye ulaştı! Tüm pompalar koruma amaçlı durduruldu.");
    } else if (prevSuSeviyesi === false && isWaterOk === true) {
      sendBrowserNotification("💧 Sera Deposu Dolduruldu", "Depo su seviyesi normale döndü.");
    }
    prevSuSeviyesi = isWaterOk;

    if (elSuSeviyesi) {
      elSuSeviyesi.innerText = isWaterOk ? "Yeterli" : "Kritik";
      elSuSeviyesi.style.color = isWaterOk ? "" : "#ff4d4d";
    }

    if (badgeSuSeviyesi) {
      badgeSuSeviyesi.innerText = isWaterOk ? "Normal" : "Düşük";
      badgeSuSeviyesi.className = isWaterOk ? "card-badge badge-normal" : "card-badge badge-warning";
    }

    if (scoreEl) {
      scoreEl.innerText = isWaterOk ? "Dolu" : "Boş";
    }

    if (statusEl) {
      statusEl.innerText = isWaterOk ? "İyi" : "Kritik";
      statusEl.style.color = isWaterOk ? "#2ec4b6" : "#ff4d4d";
    }

    if (fillEl) {
      // 100% full is 0 offset, empty is 110 offset
      fillEl.style.strokeDashoffset = isWaterOk ? 0 : 110;
      fillEl.style.stroke = isWaterOk ? "#2ec4b6" : "#ff4d4d";
    }

    if (cardEl) {
      if (!isWaterOk) {
        cardEl.classList.add("pulse-alarm-border");
      } else {
        cardEl.classList.remove("pulse-alarm-border");
      }
    }
  }

  // Initial Comfort Scores calculation
  updateAllGauges();
  updateWaterLevelUI();

  // Helper to dynamically update the profile name based on signed-in user
  function updateProfileUI(email) {
    const profileNameEl = document.querySelector(".profile-name");
    if (profileNameEl) {
      const namePart = email.split('@')[0];
      const capitalized = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      profileNameEl.innerText = capitalized;
    }
  }

  // --- 1. SPLASH SCREEN PROGRESS SIMULATION & AUTH OBSERVER ---
  setTimeout(() => {
    if (splashProgress) {
      splashProgress.style.width = "100%";
    }
  }, 100);

  let hasSession = false;
  if (useFirebase && auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        hasSession = true;
        currentUser.email = user.email;
        updateProfileUI(user.email);
        console.log("Oturum açık:", user.email);
        setupFirebaseListeners(); // Fix: Setup listeners on successful auth
      } else {
        hasSession = false;
        detachFirebaseListeners(); // Fix: Detach listeners on logout
      }
    });
  }

  // Transition from Splash to Login or Dashboard after 2.6 seconds
  setTimeout(() => {
    screenSplash.classList.remove("active");
    if (hasSession) {
      screenMain.classList.add("active");
      showToast("Hoş Geldiniz", `${currentUser.email} olarak giriş yapıldı.`, "shield-check");
    } else {
      screenLogin.classList.add("active");
    }
  }, 2600);


  // --- 2. LOGIN & LOGOUT FLOW ---
  btnLogin.addEventListener("click", () => {
    // Request browser notification permission on user click gesture
    if ("Notification" in window) {
      Notification.requestPermission().then(permission => {
        console.log("Bildirim izni:", permission);
      });
    }
    const emailVal = document.getElementById("email").value;
    const passwordVal = document.getElementById("password").value;

    if (emailVal.trim() === "" || passwordVal.trim() === "") {
      showToast("Hata", "E-posta ve şifre alanları boş bırakılamaz.", "alert-triangle");
      return;
    }

    if (useFirebase && auth) {
      showToast("Giriş Yapılıyor", "Firebase kimlik doğrulaması yapılıyor...", "loader");
      
      auth.signInWithEmailAndPassword(emailVal, passwordVal)
        .then((userCredential) => {
          currentUser.email = userCredential.user.email;
          updateProfileUI(userCredential.user.email);
          
          screenLogin.classList.remove("active");
          screenMain.classList.add("active");
          showToast("Giriş Başarılı", "Akıllı Sera portalına hoş geldiniz!", "shield-check");
        })
        .catch((error) => {
          console.warn("Sign in failed, trying registration:", error);
          if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            // User does not exist (or first login), auto-register them
            showToast("Kayıt Yapılıyor", "Yeni hesap oluşturuluyor...", "user-plus");
            auth.createUserWithEmailAndPassword(emailVal, passwordVal)
              .then((userCredential) => {
                currentUser.email = userCredential.user.email;
                updateProfileUI(userCredential.user.email);
                
                screenLogin.classList.remove("active");
                screenMain.classList.add("active");
                showToast("Hesap Oluşturuldu", "Yeni hesabınız başarıyla oluşturuldu ve giriş yapıldı!", "user-check");
              })
              .catch((regError) => {
                showToast("Kayıt Hatası", regError.message, "alert-triangle");
              });
          } else {
            showToast("Giriş Hatası", error.message, "alert-triangle");
          }
        });
    } else {
      // Offline Simulation Fallback
      currentUser.email = emailVal;
      updateProfileUI(emailVal);
      screenLogin.classList.remove("active");
      screenMain.classList.add("active");
      showToast("Giriş Başarılı", "Simülasyon Modu: Giriş yapıldı.", "shield-check");
    }
  });

  btnLogout.addEventListener("click", () => {
    if (useFirebase && auth) {
      auth.signOut()
        .then(() => {
          showToast("Çıkış Yapıldı", "Oturum güvenli bir şekilde kapatıldı.", "log-out");
        })
        .catch((err) => {
          console.error("Sign out error:", err);
        });
    }

    // Reset inputs & navigation
    screenMain.classList.remove("active");
    screenLogin.classList.add("active");

    // Switch back to dashboard tab default
    switchTab("dashboard");

    // Turn off auto mode on logout
    if (switchAuto && switchAuto.checked) {
      switchAuto.checked = false;
      rowAuto.classList.remove("active");
      statusAuto.innerText = "Pasif";
      statusAuto.style.color = "rgba(255, 255, 255, 0.8)";
    }

    // Turn off all switches on logout and make sure they are enabled
    Object.keys(switches).forEach(key => {
      switches[key].disabled = false;
      rows[key].classList.remove("disabled-row");
      if (switches[key].checked) {
        switches[key].checked = false;
        handleSwitchChange(key, false, true);
      }
    });

    showToast("Oturum Kapatıldı", "Güvenli çıkış yapıldı.", "log-out");
  });


  // --- 3. TOAST NOTIFICATION SYSTEM ---
  let toastTimeout;
  function showToast(title, message, iconName = "bell") {
    // Clear previous timeouts
    clearTimeout(toastTimeout);

    toastTitle.innerText = title;
    toastMsg.innerText = message;

    // Update toast icon dynamically
    const iconContainer = toastContainer.querySelector(".toast-icon");
    iconContainer.innerHTML = `<i data-lucide="${iconName}"></i>`;
    safeCreateIcons(); // Render the new icon

    toastContainer.classList.add("active");

    toastTimeout = setTimeout(() => {
      toastContainer.classList.remove("active");
    }, 3200);
  }

  // Browser Push Notification Helper
  function sendBrowserNotification(title, body) {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body: body,
            icon: "favicon.ico"
          });
        } catch (e) {
          console.warn("Failed to trigger Notification:", e);
        }
      }
    }
  }


  // --- WEEKLY DATASETS FOR ANALİZ TAB ---
  const weeklyData = {
    ortamTemp: [22.4, 23.8, 25.1, 24.5, 26.2, 25.5, 24.8], // past 7 days temperatures
    ortamHumid: [58, 62, 65, 60, 63, 61, 62],           // past 7 days humidities
    suTds: [740, 780, 795, 770, 790, 785, 780],          // past 7 days TDS
    suTemp: [20.8, 21.2, 21.8, 21.5, 21.9, 21.6, 21.5]     // past 7 days water temp
  };

  // Function to animate bar chart fills when loading the charts tab
  function animateWeeklyCharts() {
    const scales = {
      "ortamTemp": 40,      // Scale max for temp
      "ortamHumid": 100,    // Scale max for humidity
      "suTds": 1000,        // Scale max for TDS
      "suTemp": 30          // Scale max for water temp
    };

    const units = {
      "ortamTemp": "°C",
      "ortamHumid": "%",
      "suTds": " ppm",
      "suTemp": "°C"
    };

    Object.keys(weeklyData).forEach(paramKey => {
      const fills = document.querySelectorAll(`.bar-fill-${paramKey}`);
      const bubbles = document.querySelectorAll(`.bar-bubble-${paramKey}`);
      const values = weeklyData[paramKey];
      const scale = scales[paramKey];
      const unit = units[paramKey];

      fills.forEach((fill, index) => {
        const val = values[index];
        const height = (val / scale) * 100;

        // Staggered cascade delay for growing animation
        setTimeout(() => {
          fill.style.height = height + "%";
        }, index * 80);

        // Update bubble text dynamically
        if (bubbles[index]) {
          bubbles[index].innerText = val.toFixed(paramKey === "suTds" || paramKey === "ortamHumid" ? 0 : 1) + unit;
        }
      });
    });
  }

  // --- 4. NAVIGATION / TAB SWITCHING ---
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetTab = item.getAttribute("data-tab");
      switchTab(targetTab);
    });
  });

  function switchTab(tabId) {
    // Update navigation active state
    navItems.forEach(btn => {
      if (btn.getAttribute("data-tab") === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Toggle panels
    tabPanels.forEach(panel => {
      if (panel.id === `panel-${tabId}`) {
        panel.style.display = "block";
      } else {
        panel.style.display = "none";
      }
    });

    // Trigger animations when entering or leaving charts tab
    if (tabId === "charts") {
      animateWeeklyCharts();
    } else {
      // Reset heights so it animates again next time
      const fills = document.querySelectorAll(".bar-fill");
      fills.forEach(fill => {
        fill.style.height = "0%";
      });
    }
  }


  // --- 5. SWITCH & ACTUATOR INTERACTIONS ---
  Object.keys(switches).forEach(key => {
    switches[key].addEventListener("change", (e) => {
      handleSwitchChange(key, e.target.checked);
    });
  });

  // Auto Mode UI Helper
  function triggerAutoModeUI(isAutoActive) {
    if (isAutoActive) {
      rowAuto.classList.add("active");
      statusAuto.innerText = "Aktif";
      statusAuto.style.color = "var(--primary)";

      // Lock all manual switches
      Object.keys(switches).forEach(key => {
        switches[key].disabled = true;
        rows[key].classList.add("disabled-row");
      });
    } else {
      rowAuto.classList.remove("active");
      statusAuto.innerText = "Pasif";
      statusAuto.style.color = "";

      // Unlock all manual switches
      Object.keys(switches).forEach(key => {
        switches[key].disabled = false;
        rows[key].classList.remove("disabled-row");
      });
    }
    safeCreateIcons();
  }

  // Tam Otomatik Mode Switch Listener
  if (switchAuto) {
    switchAuto.addEventListener("change", (e) => {
      const isAutoActive = e.target.checked;
      triggerAutoModeUI(isAutoActive);

      if (useFirebase) {
        db.ref("greenhouse/settings/autoMode").set(isAutoActive);
      }

      if (isAutoActive) {
        showToast("Tam Otomatik Mod", "Sistem otomatik kontrole geçti, manuel ayarlar kilitlendi.", "cpu");
      } else {
        showToast("Manuel Kontrol", "Tam otomatik mod kapatıldı, kontrol kullanıcıya devredildi.", "sliders");
      }
    });
  }

  function handleSwitchChange(deviceKey, isActive, suppressToast = false) {
    const row = rows[deviceKey];
    const statusText = statuses[deviceKey];

    if (useFirebase) {
      db.ref("greenhouse/actuators/" + deviceKey).set(isActive);
    }

    if (isActive) {
      row.classList.add("active");
      statusText.innerText = "Aktif";
      statusText.style.color = "var(--primary)";

      // Customize feedback toasts
      if (!suppressToast) {
        if (deviceKey === "pompa1") {
          showToast("Besin A Pompası", "Besin A Pompası çalıştırıldı. Besleme başladı.", "droplet");
        } else if (deviceKey === "pompa2") {
          showToast("Ana Su Pompası", "Ana Su Pompası (Damlama) çalıştırıldı. Sulama başladı.", "refresh-cw");
        } else if (deviceKey === "pompa3") {
          showToast("Besin B Pompası", "Besin B Pompası çalıştırıldı. Besleme başladı.", "test-tube");
        } else if (deviceKey === "fan") {
          showToast("Havalandırma Aktif", "Vantilatörler çalıştırıldı, sera içi serinletiliyor.", "fan");
        } else if (deviceKey === "led") {
          showToast("Gelişim Işığı Açık", "LED aydınlatma sistemi devreye girdi.", "sun");
        }
      }
    } else {
      row.classList.remove("active");
      statusText.innerText = "Kapalı";
      statusText.style.color = "var(--text-muted)";

      // Off notifications
      if (!suppressToast) {
        if (deviceKey === "pompa1") showToast("Besin A Durduruldu", "Besin A Pompası kapatıldı.", "droplet");
        if (deviceKey === "pompa2") showToast("Ana Su Durduruldu", "Ana Su Pompası (Damlama) kapatıldı.", "refresh-cw");
        if (deviceKey === "pompa3") showToast("Besin B Durduruldu", "Besin B Pompası kapatıldı.", "test-tube");
        if (deviceKey === "fan") showToast("Fanlar Kapatıldı", "Havalandırma durduruldu.", "fan");
        if (deviceKey === "led") showToast("LED Kapatıldı", "Yapay aydınlatma kapatıldı.", "sun");
      }
    }

    safeCreateIcons(); // Keep icons loaded
  }


  // --- 6. REAL-TIME IoT SIMULATION ENGINE ---
  setInterval(() => {
    if (!screenMain.classList.contains("active")) return; // Only simulate when logged in
    if (useFirebase) return; // In Firebase mode, telemetry comes directly from the Raspberry Pi sensors!

    // AUTOMATIC SYSTEM CONTROLLER
    if (switchAuto && switchAuto.checked) {
      // 1. Fan Control: cool down if temp > 25.0 or reduce humidity if > 65
      let shouldFanBeOn = false;
      if (telemetry.ortamTemp > 25.0 || telemetry.ortamHumid > 65.0) {
        shouldFanBeOn = true;
      } else if (telemetry.ortamTemp < 23.5 && telemetry.ortamHumid < 58.0) {
        shouldFanBeOn = false;
      } else {
        shouldFanBeOn = switches.fan.checked;
      }

      if (switches.fan.checked !== shouldFanBeOn) {
        switches.fan.checked = shouldFanBeOn;
        handleSwitchChange("fan", shouldFanBeOn, true);
      }

      // 2. LED Control: turn on to warm up if temp < 24.2, turn off if too hot > 25.5
      let shouldLedBeOn = switches.led.checked;
      if (telemetry.ortamTemp < 24.2) {
        shouldLedBeOn = true;
      } else if (telemetry.ortamTemp > 25.5) {
        shouldLedBeOn = false;
      }

      if (switches.led.checked !== shouldLedBeOn) {
        switches.led.checked = shouldLedBeOn;
        handleSwitchChange("led", shouldLedBeOn, true);
      }

      // 3. Pompa 1 (Nutrients): turn on if TDS < 730, off if TDS > 810
      let shouldPompa1BeOn = switches.pompa1.checked;
      if (telemetry.suTds < 730) {
        shouldPompa1BeOn = true;
      } else if (telemetry.suTds > 810) {
        shouldPompa1BeOn = false;
      }

      if (switches.pompa1.checked !== shouldPompa1BeOn) {
        switches.pompa1.checked = shouldPompa1BeOn;
        handleSwitchChange("pompa1", shouldPompa1BeOn, true);
      }

      // 4. Pompa 2 (Circulation): Always ON in auto mode for healthy water flow
      if (!switches.pompa2.checked) {
        switches.pompa2.checked = true;
        handleSwitchChange("pompa2", true, true);
      }

      // 5. Pompa 3 (pH balancer): turn on if TDS > 830, off if TDS < 770
      let shouldPompa3BeOn = switches.pompa3.checked;
      if (telemetry.suTds > 830) {
        shouldPompa3BeOn = true;
      } else if (telemetry.suTds < 770) {
        shouldPompa3BeOn = false;
      }

      if (switches.pompa3.checked !== shouldPompa3BeOn) {
        switches.pompa3.checked = shouldPompa3BeOn;
        handleSwitchChange("pompa3", shouldPompa3BeOn, true);
      }
    }

    // Baseline fluctuations (noise)
    let tempNoise = (Math.random() * 0.2 - 0.1);
    let humidNoise = (Math.random() * 1.0 - 0.5);
    let tdsNoise = Math.floor(Math.random() * 4 - 2);
    let waterTempNoise = (Math.random() * 0.1 - 0.05);

    // ACTUATOR PHYSICAL PHYSICS INFLUENCE
    // 1. Fan cools down the greenhouse and reduces humidity
    if (switches.fan.checked) {
      // Pull temp down towards 21.0°C
      if (telemetry.ortamTemp > 21.0) {
        telemetry.ortamTemp -= 0.18;
      }
      // Pull humidity down towards 52%
      if (telemetry.ortamHumid > 52) {
        telemetry.ortamHumid -= 0.8;
      }
    } else {
      // Fan off, slowly drift back to baseline ambient
      if (telemetry.ortamTemp < baselines.ortamTemp) {
        telemetry.ortamTemp += 0.06;
      }
    }

    // 2. LED lighting slightly heats the ambient environment
    if (switches.led.checked) {
      if (telemetry.ortamTemp < 26.8) {
        telemetry.ortamTemp += 0.10;
      }
    }

    // 3. Pump 1 (Nutrient) increases water nutrient concentration (TDS)
    if (switches.pompa1.checked) {
      if (telemetry.suTds < 920) {
        telemetry.suTds += 8;
      }
    } else if (switches.pompa2.checked) {
      // Sirkülasyon dilutes slightly over time or stabilizes
      if (telemetry.suTds > baselines.suTds) {
        telemetry.suTds -= 1;
      }
    }

    // 4. Pump 3 (pH Down/Acid) can lower TDS or change water chemistry
    if (switches.pompa3.checked) {
      if (telemetry.suTds > 650) {
        telemetry.suTds -= 4;
      }
    }

    // Apply natural fluctuations
    telemetry.ortamTemp += tempNoise;
    telemetry.ortamHumid += humidNoise;
    telemetry.suTds += tdsNoise;
    telemetry.suTemp += waterTempNoise;

    // Update daily averages slowly towards current telemetry
    dailyAverages.ortamTemp = dailyAverages.ortamTemp * 0.92 + telemetry.ortamTemp * 0.08;
    dailyAverages.ortamHumid = dailyAverages.ortamHumid * 0.92 + telemetry.ortamHumid * 0.08;
    dailyAverages.suTds = dailyAverages.suTds * 0.92 + telemetry.suTds * 0.08;
    dailyAverages.suTemp = dailyAverages.suTemp * 0.92 + telemetry.suTemp * 0.08;

    // Simulate Water Level draining if pump is running
    if (!telemetry.hasOwnProperty('waterReserve')) {
      telemetry.waterReserve = 100;
    }

    if (switches.pompa1.checked || switches.pompa2.checked || switches.pompa3.checked) {
      telemetry.waterReserve -= 1.5;
    } else {
      telemetry.waterReserve -= 0.05; // natural loss
    }

    if (telemetry.waterReserve <= 10) {
      telemetry.suSeviyesi = false;
      // Safety dry-run shutoff
      Object.keys(switches).forEach(key => {
        if ((key === "pompa1" || key === "pompa2" || key === "pompa3") && switches[key].checked) {
          switches[key].checked = false;
          handleSwitchChange(key, false, true);
          showToast("Kuru Çalışma Koruması", "Su yetersiz olduğu için pompalar durduruldu!", "alert-triangle");
        }
      });

      if (telemetry.waterReserve <= 0) {
        telemetry.waterReserve = 100; // Auto-refill simulation
        telemetry.suSeviyesi = true;
        showToast("Su Deposu", "Depo otomatik olarak dolduruldu.", "droplet");
      }
    } else {
      telemetry.suSeviyesi = true;
    }

    // Render updated values on screen with premium formatting
    elOrtamTemp.innerText = telemetry.ortamTemp.toFixed(1);
    elOrtamHumid.innerText = Math.round(telemetry.ortamHumid);
    elSuTds.innerText = Math.round(telemetry.suTds);
    elSuTemp.innerText = telemetry.suTemp.toFixed(1);

    // Update comfort health gauges and water level UI
    updateAllGauges();
    updateWaterLevelUI();

    // Color-code the Water Nutrient Badge according to optimal levels (700 - 850 ppm is optimal)
    if (telemetry.suTds >= 700 && telemetry.suTds <= 850) {
      elSuTdsBadge.innerText = "Optimal";
      elSuTdsBadge.className = "card-badge badge-normal";
    } else if (telemetry.suTds > 850) {
      elSuTdsBadge.innerText = "Yüksek";
      elSuTdsBadge.className = "card-badge badge-warning";
    } else {
      elSuTdsBadge.innerText = "Düşük";
      elSuTdsBadge.className = "card-badge badge-warning";
    }

    if (typeof checkAlarmTelemetry === 'function') checkAlarmTelemetry();
  }, 3500);


  // --- 7. YODA LEAF HEALTH SCANNER FLOW ---
  let isScanning = false;
  let hasScanned = false;

  btnScanYODA.addEventListener("click", () => {
    if (isScanning) return;

    if (hasScanned) {
      // RESET CAMERA STATE FOR NEW SCAN
      yodaBox.style.display = "none";
      yodaBox.style.opacity = "0";
      yodaResults.style.display = "none";
      yodaTips.style.display = "block";
      yodaScanBar.style.display = "none";
      scanBtnText.innerText = "Bitkiyi Tara (YODA)";
      hasScanned = false;

      // Randomize Unsplash leaf image on re-scan to show different leaf analyses!
      const leafImages = [
        "https://images.unsplash.com/photo-1624421719748-179e1a8e956d?auto=format&fit=crop&q=80&w=600", // Healthy green
        "https://images.unsplash.com/photo-1507290439931-a8e92384c66f?auto=format&fit=crop&q=80&w=600", // Detail veins
        "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=600"  // Pothos drop
      ];
      const randomImg = leafImages[Math.floor(Math.random() * leafImages.length)];
      document.getElementById("plant-scan-img").src = randomImg;

      showToast("Kamera Yenilendi", "Yeni tarama için yaprağı odaklayın.", "camera");
      return;
    }

    // RUN YODA SCANNING PROCESS
    isScanning = true;
    yodaLoader.style.display = "flex";
    yodaScanBar.style.display = "block";
    btnScanYODA.style.opacity = "0.7";
    scanBtnText.innerText = "Taranıyor...";

    showToast("YODA AI Tarayıcı", "Görüntü işleniyor, yaprak morfolojisi analiz ediliyor.", "aperture");

    setTimeout(() => {
      // COMPLETE ANALYSIS AFTER 2.8 SECONDS
      isScanning = false;
      hasScanned = true;
      yodaLoader.style.display = "none";
      yodaScanBar.style.display = "none";
      btnScanYODA.style.opacity = "1";
      scanBtnText.innerText = "Yeni Yaprak Tara";

      // Reveal overlays with soft animations
      yodaTips.style.display = "none";
      yodaBox.style.display = "block";
      setTimeout(() => {
        yodaBox.style.opacity = "1";
      }, 50);

      yodaResults.style.display = "block";
      yodaResults.style.scrollIntoView({ behavior: "smooth", block: "nearest" });

      showToast("Tarama Bitti", "YODA Yaprak teşhisi başarıyla tamamlandı!", "check-circle");
    }, 2800);
  });

  // --- 8. BOTTOM SHEET SETTINGS MODAL & DONANIM TEST STATION LOGIC ---
  const modalSettings = document.getElementById("modal-settings");
  const btnOpenSettings = document.getElementById("btn-open-settings");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const modalBackdrop = document.getElementById("modal-backdrop");

  if (btnOpenSettings && modalSettings) {
    btnOpenSettings.addEventListener("click", () => {
      modalSettings.classList.add("active");
    });
  }

  const closeModal = () => {
    if (modalSettings) {
      modalSettings.classList.remove("active");

      // Safely turn off any active background switches that were toggled for testing
      Object.keys(switches).forEach(key => {
        const card = document.getElementById(`test-card-${key}`);
        if (card && card.classList.contains("testing")) {
          if (switches[key] && switches[key].checked) {
            switches[key].checked = false;
            handleSwitchChange(key, false, true);
          }
          resetDeviceTestState(key);
        }
      });
    }
  };

  if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

  const resetDeviceTestState = (key) => {
    const card = document.getElementById(`test-card-${key}`);
    const status = document.getElementById(`test-status-${key}`);
    const action = document.getElementById(`test-action-${key}`);
    if (card && status && action) {
      card.className = "test-device-card";
      status.innerText = "Hazır";
      status.style.color = "var(--text-muted)";
      action.innerHTML = `<button class="btn-test-start" onclick="runHardwareTest('${key}')">Test Et</button>`;
      safeCreateIcons();
    }
  };

  // Expose hardware testing actions globally
  window.runHardwareTest = function (key) {
    const card = document.getElementById(`test-card-${key}`);
    const status = document.getElementById(`test-status-${key}`);
    const action = document.getElementById(`test-action-${key}`);

    const deviceNames = {
      pompa1: "Besin A Pompası",
      pompa2: "Ana Su Pompası (Damlama)",
      pompa3: "Besin B Pompası",
      fan: "Fan Sistemi (Havalandırma)",
      led: "LED Aydınlatma (Gelişim Işığı)"
    };

    if (!card || !status || !action) return;

    // If auto mode is ON, automatically disable it for safety and visual clarity
    if (switchAuto && switchAuto.checked) {
      switchAuto.checked = false;
      rowAuto.classList.remove("active");
      statusAuto.innerText = "Pasif";
      statusAuto.style.color = "rgba(255, 255, 255, 0.8)";

      // Unlock switches in dashboard
      Object.keys(switches).forEach(swKey => {
        switches[swKey].disabled = false;
        rows[swKey].classList.remove("disabled-row");
      });

      showToast("Mod Değişti", "Test başlatıldığı için Tam Otomatik Mod kapatıldı.", "sliders");
    }

    // 1. Initial Testing State (Active - 3s)
    card.className = "test-device-card testing";
    status.innerText = "⚡ Test Ediliyor: Çalışıyor (3s)";
    status.style.color = "#ffc107";
    action.innerHTML = `<button class="btn-test-start" disabled>Test Ediliyor...</button>`;

    // Dynamically toggle dashboard switch to ON in background
    if (switches[key] && !switches[key].checked) {
      switches[key].checked = true;
      handleSwitchChange(key, true, true); // suppress toast in background
    }

    // 2. Transition to Rest/Standby after 3 seconds
    setTimeout(() => {
      if (!modalSettings.classList.contains("active")) {
        resetDeviceTestState(key);
        return;
      }

      status.innerText = "💤 Test Ediliyor: Durduruldu (3s)";

      // Dynamically toggle dashboard switch to OFF in background
      if (switches[key] && switches[key].checked) {
        switches[key].checked = false;
        handleSwitchChange(key, false, true); // suppress toast in background
      }

      // 3. Reveal Validation Prompts after another 3 seconds (6s total)
      setTimeout(() => {
        if (!modalSettings.classList.contains("active")) {
          resetDeviceTestState(key);
          return;
        }

        status.innerText = "❓ Fiziksel olarak çalıştı mı?";
        status.style.color = "var(--text-muted)";

        action.innerHTML = `
          <div class="test-verify-buttons">
            <button class="btn-verify-yes" onclick="verifyHardwareTest('${key}', true)">
              <i data-lucide="check"></i> Çalıştı
            </button>
            <button class="btn-verify-no" onclick="verifyHardwareTest('${key}', false)">
              <i data-lucide="x"></i> Hatalı
            </button>
          </div>
        `;
        safeCreateIcons(); // Render SVG checkmark and cross
      }, 3000);

    }, 3000);
  };

  window.verifyHardwareTest = function (key, isSuccess) {
    const card = document.getElementById(`test-card-${key}`);
    const status = document.getElementById(`test-status-${key}`);
    const action = document.getElementById(`test-action-${key}`);

    const deviceNames = {
      pompa1: "Besin A Pompası",
      pompa2: "Ana Su Pompası (Damlama)",
      pompa3: "Besin B Pompası",
      fan: "Fan Sistemi (Havalandırma)",
      led: "LED Aydınlatma (Gelişim Işığı)"
    };

    if (!card || !status || !action) return;

    if (isSuccess) {
      card.className = "test-device-card success";
      status.innerText = "✅ Donanım Doğrulandı: Çalışıyor";
      status.style.color = "#4caf50";
      action.innerHTML = `
        <div class="test-result-container">
          <span class="test-result-badge badge-success">
            <i data-lucide="check-circle"></i> Sorunsuz
          </span>
          <button class="btn-test-retry" onclick="runHardwareTest('${key}')">Tekrar</button>
        </div>
      `;
      showToast("Donanım Testi", `${deviceNames[key]} başarıyla doğrulandı!`, "check-circle");
    } else {
      card.className = "test-device-card failed";
      status.innerText = "❌ Sinyal Hatası: Çalışmıyor";
      status.style.color = "#ff4d4d";
      action.innerHTML = `
        <div class="test-result-container">
          <span class="test-result-badge badge-failed">
            <i data-lucide="alert-triangle"></i> Arızalı
          </span>
          <button class="btn-test-retry" onclick="runHardwareTest('${key}')">Tekrar</button>
        </div>
      `;
      showToast("Donanım Hatası", `${deviceNames[key]} fiziksel arıza kaydı açıldı!`, "alert-triangle");
    }
    safeCreateIcons();
  };

  // --- 9. ALARM & KRİTİK EŞİK LOGIC ---
  let alarmThresholds = {
    ortamTemp: { min: 18.0, max: 30.0 },
    ortamHumid: { min: 40.0, max: 80.0 },
    suTds: { min: 600.0, max: 900.0 },
    suTemp: { min: 16.0, max: 26.0 }
  };

  // State to prevent spamming alarm toasts
  let activeAlarms = {
    ortamTemp: false,
    ortamHumid: false,
    suTds: false,
    suTemp: false
  };

  const modalAlarms = document.getElementById("modal-alarms");
  const btnOpenAlarms = document.getElementById("btn-open-alarms");
  const btnCloseAlarms = document.getElementById("btn-close-modal-alarms");
  const modalBackdropAlarms = document.getElementById("modal-backdrop-alarms");

  if (btnOpenAlarms && modalAlarms) {
    btnOpenAlarms.addEventListener("click", () => {
      modalAlarms.classList.add("active");
      // Update values in modal immediately on open
      checkAlarmTelemetry();
    });
  }

  const closeAlarmsModal = () => {
    if (modalAlarms) modalAlarms.classList.remove("active");
  };

  if (btnCloseAlarms) btnCloseAlarms.addEventListener("click", closeAlarmsModal);
  if (modalBackdropAlarms) modalBackdropAlarms.addEventListener("click", closeAlarmsModal);

  // Setup dynamic slider updates
  const bindAlarmSlider = (key, type) => {
    const slider = document.getElementById(`rng-${key}-${type}`);
    const label = document.getElementById(`lbl-val-${key}-${type}`);
    if (slider && label) {
      slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        label.innerText = val;
        alarmThresholds[key][type] = val;
        checkAlarmTelemetry();

        // Write slider updates to Firebase RTDB
        if (useFirebase) {
          db.ref(`greenhouse/settings/thresholds/${key}/${type}`).set(val);
        }
      });
    }
  };

  bindAlarmSlider("ortamTemp", "min");
  bindAlarmSlider("ortamTemp", "max");
  bindAlarmSlider("ortamHumid", "min");
  bindAlarmSlider("ortamHumid", "max");
  bindAlarmSlider("suTds", "min");
  bindAlarmSlider("suTds", "max");
  bindAlarmSlider("suTemp", "min");
  bindAlarmSlider("suTemp", "max");

  // Core alarm checking engine
  window.checkAlarmTelemetry = function() {
    // 1. Update current readings inside the modal if it's active
    const lblTemp = document.getElementById("lbl-current-ortamTemp");
    const lblHumid = document.getElementById("lbl-current-ortamHumid");
    const lblTds = document.getElementById("lbl-current-suTds");
    const lblWaterTemp = document.getElementById("lbl-current-suTemp");

    if (lblTemp) lblTemp.innerText = (isNaN(telemetry.ortamTemp) || telemetry.ortamTemp <= -99) ? "N/A" : telemetry.ortamTemp.toFixed(1) + "°C";
    if (lblHumid) lblHumid.innerText = (isNaN(telemetry.ortamHumid) || telemetry.ortamHumid <= -99) ? "N/A" : "%" + Math.round(telemetry.ortamHumid);
    if (lblTds) lblTds.innerText = (isNaN(telemetry.suTds) || telemetry.suTds < 0) ? "N/A" : Math.round(telemetry.suTds) + " ppm";
    if (lblWaterTemp) lblWaterTemp.innerText = (isNaN(telemetry.suTemp) || telemetry.suTemp <= -127) ? "N/A" : telemetry.suTemp.toFixed(1) + "°C";

    // 2. Perform threshold boundary evaluations
    const params = [
      { key: "ortamTemp", val: telemetry.ortamTemp, name: "Ortam Sıcaklığı", unit: "°C" },
      { key: "ortamHumid", val: telemetry.ortamHumid, name: "Ortam Nemi", unit: "%" },
      { key: "suTds", val: telemetry.suTds, name: "Su Besin Değeri", unit: " ppm" },
      { key: "suTemp", val: telemetry.suTemp, name: "Su Sıcaklığı", unit: "°C" }
    ];

    let hasAnyAlarm = false;
    let alarmMessages = [];

    params.forEach(p => {
      const minLimit = alarmThresholds[p.key].min;
      const maxLimit = alarmThresholds[p.key].max;
      const card = document.getElementById(`sensor-card-${p.key}`);
      
      let isViolated = false;
      let reason = "";

      const isValid = !isNaN(p.val) && p.val !== "N/A" && 
                      !(p.key === "ortamTemp" && p.val <= -99) &&
                      !(p.key === "ortamHumid" && p.val <= -99) &&
                      !(p.key === "suTemp" && p.val <= -127) &&
                      !(p.key === "suTds" && p.val < 0);

      if (isValid) {
        if (p.val < minLimit) {
          isViolated = true;
          reason = "düşük";
        } else if (p.val > maxLimit) {
          isViolated = true;
          reason = "yüksek";
        }
      }

      if (isViolated) {
        hasAnyAlarm = true;
        alarmMessages.push(`${p.name} ${reason}`);
        
        // Highlight sensor card in red pulse
        if (card) card.classList.add("pulse-alarm-border");

        // Fire single alert Toast on transition
        if (!activeAlarms[p.key]) {
          activeAlarms[p.key] = true;
          showToast(
            "Kritik Limit Aşımı", 
            `${p.name} limit dışı: ${p.val.toFixed(p.key === "suTds" || p.key === "ortamHumid" ? 0 : 1)}${p.unit}!`, 
            "alert-triangle"
          );
          sendBrowserNotification(
            `⚠️ Kritik Eşik Aşımı: ${p.name}`, 
            `Sera içi ${p.name} sınırların dışında! Anlık Değer: ${p.val.toFixed(p.key === "suTds" || p.key === "ortamHumid" ? 0 : 1)}${p.unit}`
          );
        }
      } else {
        // Remove highlight
        if (card) card.classList.remove("pulse-alarm-border");

        // Fire clear Toast on transition
        if (activeAlarms[p.key]) {
          activeAlarms[p.key] = false;
          showToast("Durum Normale Döndü", `${p.name} stabil limitlere girdi.`, "check-circle");
          sendBrowserNotification(
            `✅ Eşik Normale Döndü: ${p.name}`, 
            `Sera içi ${p.name} tekrar güvenli limitler içine girdi. Anlık Değer: ${p.val.toFixed(p.key === "suTds" || p.key === "ortamHumid" ? 0 : 1)}${p.unit}`
          );
        }
      }
    });

    // 3. Update top-bar status text and dots
    const statusDot = document.getElementById("system-status-dot");
    const statusText = document.getElementById("system-status-text");

    if (statusDot && statusText) {
      if (hasAnyAlarm) {
        statusDot.className = "status-dot alarm";
        statusText.innerText = "Kritik Durum: " + alarmMessages.join(", ");
        statusText.style.color = "#ff4d4d";
      } else {
        statusDot.className = "status-dot normal";
        statusText.innerText = "Tüm Sistemler: Çalışıyor";
        statusText.style.color = "";
      }
    }
  };

  // Initial call
  checkAlarmTelemetry();

  // --- 10. DESTEK & YARDIM LOGIC ---
  const modalSupport = document.getElementById("modal-support");
  const btnOpenSupport = document.getElementById("btn-open-support");
  const btnCloseSupport = document.getElementById("btn-close-modal-support");
  const modalBackdropSupport = document.getElementById("modal-backdrop-support");

  if (btnOpenSupport && modalSupport) {
    btnOpenSupport.addEventListener("click", () => {
      modalSupport.classList.add("active");
    });
  }

  const closeSupportModal = () => {
    if (modalSupport) modalSupport.classList.remove("active");
  };

  if (btnCloseSupport) btnCloseSupport.addEventListener("click", closeSupportModal);
  if (modalBackdropSupport) modalBackdropSupport.addEventListener("click", closeSupportModal);

  // FAQ Accordion Trigger
  window.toggleFaq = function(button) {
    const item = button.parentNode;
    const isActive = item.classList.contains("active");
    
    // Close other FAQs for clean navigation
    const faqItems = document.querySelectorAll(".faq-item");
    faqItems.forEach(el => el.classList.remove("active"));

    if (!isActive) {
      item.classList.add("active");
    }
  };

  // Support Request Submitter
  window.submitSupportRequest = function() {
    const message = document.getElementById("support-message").value;

    if (message.trim() === "") {
      showToast("Hata", "Lütfen talebiniz için bir açıklama yazın.", "alert-triangle");
      return;
    }

    const submitBtn = document.getElementById("btn-submit-support");
    const container = document.getElementById("support-container");

    if (!submitBtn || !container) return;

    // 1. Enter Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s infinite linear; margin-right: 4px; vertical-align: middle;"></span> Gönderiliyor...`;

    // Spin animation style injected if not already
    if (!document.getElementById("spin-style")) {
      const style = document.createElement("style");
      style.id = "spin-style";
      style.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }

    const ticketNo = "#SR-" + Math.floor(1000 + Math.random() * 9000);

    // 2. Complete Submission after 1.4 seconds
    setTimeout(() => {
      showToast("Destek Talebi Alındı", `Talebiniz ${ticketNo} numarası ile oluşturuldu.`, "check-circle");

      container.className = "support-success-card";
      container.innerHTML = `
        <i data-lucide="check-circle"></i>
        <span class="support-success-title">Talep Başarıyla İletildi</span>
        <span class="support-success-desc">Teknik destek ekibimiz talebinizi başarıyla aldı. En kısa sürede sistem yöneticisi e-postanıza yanıt iletilecektir.</span>
        <div class="support-ticket-no">Talep No: ${ticketNo}</div>
        <button class="btn-test-retry" style="margin-top: 0.5rem;" onclick="resetSupportForm()">Yeni Talep Oluştur</button>
      `;
      safeCreateIcons();
    }, 1400);
  };

  // Support Form Reset
  window.resetSupportForm = function() {
    const container = document.getElementById("support-container");
    if (!container) return;

    container.className = "support-ticket-card";
    container.innerHTML = `
      <h4 class="support-section-title">Teknik Destek Talebi</h4>
      <p class="support-desc" style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 0.8rem;">Sistem arızaları veya sorularınız için destek ekibimizle hızlıca iletişime geçebilirsiniz.</p>
      
      <div class="form-group" style="margin-top: 0.4rem; display: flex; flex-direction: column; gap: 0.3rem;">
        <label for="support-category" style="font-size: 0.72rem; font-weight: 700; color: #5d616d; text-transform: uppercase;">Talep Kategorisi</label>
        <div class="select-wrapper">
          <select id="support-category">
            <option value="hardware">Donanım Arızası / Sinyal Hatası</option>
            <option value="yoda">YODA AI Teşhis Sistemi</option>
            <option value="network">Bağlantı & Entegrasyon</option>
            <option value="other">Diğer Sorular</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.8rem; margin-bottom: 1rem;">
        <label for="support-message" style="font-size: 0.72rem; font-weight: 700; color: #5d616d; text-transform: uppercase;">Açıklama</label>
        <textarea id="support-message" placeholder="Sorununuzu veya talebinizi detaylıca açıklayın..." rows="3"></textarea>
      </div>

      <button class="support-submit-btn" id="btn-submit-support" onclick="submitSupportRequest()">
        <i data-lucide="send"></i> Talep Oluştur
      </button>
    `;
    safeCreateIcons();
  };

  // --- 11. FIREBASE REALTIME DATABASE LISTENERS (DYNAMIC ENABLING/DISABLING) ---
  let telemetryRef = null;
  let settingsRef = null;
  let actuatorsRef = null;

  function setupFirebaseListeners() {
    if (!useFirebase || !db) return;

    // Detach any existing listeners first to prevent duplicates
    detachFirebaseListeners();

    // 1. Live Telemetry Listener (ESP8266 -> Web)
    telemetryRef = db.ref("greenhouse/telemetry");
    telemetryRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.ortamTemp !== undefined) telemetry.ortamTemp = parseFloat(data.ortamTemp);
        if (data.ortamHumid !== undefined) telemetry.ortamHumid = parseFloat(data.ortamHumid);
        if (data.suTds !== undefined) telemetry.suTds = parseFloat(data.suTds);
        if (data.suTemp !== undefined) telemetry.suTemp = parseFloat(data.suTemp);
        if (data.suSeviyesi !== undefined) telemetry.suSeviyesi = data.suSeviyesi;
        
        // Render values instantly with "N/A" fallback
        elOrtamTemp.innerText = (data.ortamTemp === "N/A" || isNaN(telemetry.ortamTemp) || telemetry.ortamTemp <= -99) ? "N/A" : telemetry.ortamTemp.toFixed(1) + "°C";
        elOrtamHumid.innerText = (data.ortamHumid === "N/A" || isNaN(telemetry.ortamHumid) || telemetry.ortamHumid <= -99) ? "N/A" : "%" + Math.round(telemetry.ortamHumid);
        elSuTds.innerText = (data.suTds === "N/A" || isNaN(telemetry.suTds) || telemetry.suTds < 0) ? "N/A" : Math.round(telemetry.suTds) + " ppm";
        elSuTemp.innerText = (data.suTemp === "N/A" || isNaN(telemetry.suTemp) || telemetry.suTemp <= -127) ? "N/A" : telemetry.suTemp.toFixed(1) + "°C";

        updateAllGauges();
        updateWaterLevelUI();
        if (typeof checkAlarmTelemetry === 'function') checkAlarmTelemetry();
      }
    }, (error) => {
      console.warn("Telemetry listener cancelled:", error.message);
    });

    // 2. Settings Sync Listener (DB -> Web)
    settingsRef = db.ref("greenhouse/settings");
    settingsRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.autoMode !== undefined && switchAuto.checked !== data.autoMode) {
          switchAuto.checked = data.autoMode;
          triggerAutoModeUI(data.autoMode);
        }
        if (data.thresholds) {
          alarmThresholds = data.thresholds;
          // Sync slider visuals
          Object.keys(data.thresholds).forEach(paramKey => {
            const minVal = data.thresholds[paramKey].min;
            const maxVal = data.thresholds[paramKey].max;
            
            const minSlider = document.getElementById(`rng-${paramKey}-min`);
            const minLabel = document.getElementById(`lbl-val-${paramKey}-min`);
            if (minSlider) minSlider.value = minVal;
            if (minLabel) minLabel.innerText = minVal;

            const maxSlider = document.getElementById(`rng-${paramKey}-max`);
            const maxLabel = document.getElementById(`lbl-val-${paramKey}-max`);
            if (maxSlider) maxSlider.value = maxVal;
            if (maxLabel) maxLabel.innerText = maxVal;
          });
          if (typeof checkAlarmTelemetry === 'function') checkAlarmTelemetry();
        }
      }
    }, (error) => {
      console.warn("Settings listener cancelled:", error.message);
    });

    // 3. Actuators State Listener (DB/ESP8266 -> Web)
    actuatorsRef = db.ref("greenhouse/actuators");
    actuatorsRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        Object.keys(data).forEach(key => {
          if (switches[key] && switches[key].checked !== data[key]) {
            switches[key].checked = data[key];
            handleSwitchChange(key, data[key], true); // Sync silently
          }
        });
      }
    }, (error) => {
      console.warn("Actuators listener cancelled:", error.message);
    });
  }

  function detachFirebaseListeners() {
    if (telemetryRef) {
      telemetryRef.off();
      telemetryRef = null;
    }
    if (settingsRef) {
      settingsRef.off();
      settingsRef = null;
    }
    if (actuatorsRef) {
      actuatorsRef.off();
      actuatorsRef = null;
    }
  }

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
