(() => {
  const $ = id => document.getElementById(id);
  const loginView = $("loginView"), dashboardView = $("dashboardView");
  const ownerForm = $("ownerForm"), staffForm = $("staffForm");
  let activeMode = "owner", stream = null, scanTimer = null, scanBusy = false;

  function showLoading(message = "Memverifikasi akun...") {
    $("loadingText").textContent = message;
    $("loadingOverlay").classList.remove("hidden");
  }
  function hideLoading() {
    $("loadingOverlay").classList.add("hidden");
  }

  function showNotice(message, type = "") {
    $("notice").textContent = message;
    $("notice").className = `notice ${type}`;
  }
  function setBusy(form, busy, label) {
    const button = form.querySelector(".primary-btn");
    button.disabled = busy;
    button.querySelector("span").textContent = busy ? "Memproses..." : label;
  }
  function selectMode(mode) {
    activeMode = mode;
    $("ownerTab").classList.toggle("active", mode === "owner");
    $("staffTab").classList.toggle("active", mode === "staff");
    ownerForm.classList.toggle("hidden", mode !== "owner");
    staffForm.classList.toggle("hidden", mode !== "staff");
    showNotice("");
    stopCamera();
  }
  function showLogin() {
    loginView.classList.remove("hidden");
    dashboardView.classList.add("hidden");
  }
  function showDashboard(user, expiresAt) {
    hideLoading();
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    $("welcomeName").textContent = user.nama || user.username || "Pengguna";
    $("welcomeRole").textContent = user.role === "OWNER"
      ? "Anda masuk dengan akses Owner."
      : `Anda masuk sebagai Crew${user.outletNama ? " · " + user.outletNama : ""}.`;
    // Label tampilan mengikuti istilah pada master absensi.
    // ID diambil dari nama properti profil asli, bukan label UI Crew/Karyawan.
    $("profileRole").textContent = user.role === "OWNER" ? "Owner" : "Karyawan";
    $("profileId").textContent = user.role === "OWNER"
      ? (user.username || "owner")
      : (user.idKaryawan || user.id || "—");
    $("profileOutlet").textContent = user.role === "OWNER" ? "Semua Outlet" : (user.outletNama || "—");
  }
  async function restoreSession() {
    if (!NahyezAPI.hasToken()) return showLogin();
    try {
      const result = await NahyezAPI.getSession();
      showDashboard(result.user, result.expiresAt);
    } catch {
      NahyezAPI.clearToken();
      showLogin();
    }
  }

  $("ownerTab").addEventListener("click", () => selectMode("owner"));
  $("staffTab").addEventListener("click", () => selectMode("staff"));
  $("togglePassword").addEventListener("click", () => {
    const input = $("password");
    input.type = input.type === "password" ? "text" : "password";
    $("togglePassword").textContent = input.type === "password" ? "Lihat" : "Tutup";
  });

  ownerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const username = $("username").value.trim();
    const password = $("password").value;
    setBusy(ownerForm, true, "Masuk sebagai Owner");
    showNotice("");
    showLoading("Memverifikasi akun Owner...");
    try {
      const result = await NahyezAPI.loginOwner(username, password);
      NahyezAPI.saveToken(result.token);
      $("password").value = "";
      showNotice("");
      showDashboard(result.user);
    } catch (error) {
      hideLoading();
      showNotice(error.message);
    } finally { setBusy(ownerForm, false, "Masuk sebagai Owner"); }
  });

  async function loginCrew(qrToken) {
    if (!qrToken || scanBusy) return;
    scanBusy = true;
    setBusy(staffForm, true, "Masuk sebagai Crew");
    showNotice("");
    showLoading("Memvalidasi QR Crew...");
    try {
      const result = await NahyezAPI.loginStaff(qrToken);
      NahyezAPI.saveToken(result.token);
      $("qrToken").value = "";
      await stopCamera();
      showDashboard(result.user);
    } catch (error) {
      hideLoading();
      showNotice(error.message);
    } finally {
      scanBusy = false;
      setBusy(staffForm, false, "Masuk sebagai Crew");
    }
  }

  staffForm.addEventListener("submit", async event => {
    event.preventDefault();
    const qrToken = $("qrToken").value.trim();
    if (!qrToken) return showNotice("Pindai QR atau masukkan QR Token terlebih dahulu.");
    await loginCrew(qrToken);
  });

  async function stopCamera() {
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    $("camera").classList.add("hidden");
    $("camera").srcObject = null;
  }
  $("scanButton").addEventListener("click", async () => {
    if (!("BarcodeDetector" in window)) {
      showNotice("Pemindaian kamera otomatis belum didukung browser ini. Masukkan QR Token secara manual atau gunakan browser Chrome/Edge terbaru.");
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      const video = $("camera");
      video.srcObject = stream;
      video.classList.remove("hidden");
      await video.play();
      showNotice("Arahkan kamera ke QR Token Crew.");
      scanTimer = setInterval(async () => {
        if (!video.videoWidth || !video.videoHeight) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length && codes[0].rawValue && !scanBusy) {
            const scannedToken = codes[0].rawValue.trim();
            $("qrToken").value = scannedToken;
            await stopCamera();
            await loginCrew(scannedToken);
          }
        } catch {}
      }, 500);
    } catch {
      showNotice("Kamera tidak dapat diakses. Periksa izin kamera browser atau masukkan token secara manual.");
      await stopCamera();
    }
  });

  $("logoutButton").addEventListener("click", async () => {
    try { if (NahyezAPI.hasToken()) await NahyezAPI.logout(); }
    catch {}
    finally {
      NahyezAPI.clearToken();
      $("password").value = "";
      $("qrToken").value = "";
      await stopCamera();
      hideLoading();
      selectMode("owner");
      showLogin();
    }
  });

  window.addEventListener("pagehide", stopCamera);
  restoreSession();
})();
