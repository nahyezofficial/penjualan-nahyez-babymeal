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
    $("ownerReportPanel").classList.toggle("hidden", user.role !== "OWNER");
    $("crewComingCard").classList.toggle("hidden", user.role === "OWNER");
    if (user.role === "OWNER") loadOwnerOutlets();
  }

  let ownerOutletList = [];
  let ownerReportCheckSequence = 0;

  function setOwnerReportStatus(message, type = "") {
    const box = $("ownerReportStatus");
    box.textContent = message;
    box.className = `report-status ${type}`.trim();
  }

  function setOwnerReportBusy(busy) {
    $("ownerOutletSelect").disabled = busy;
    $("createOwnerReportButton").disabled = busy || !$("ownerOutletSelect").value;
    $("createOwnerReportButton").querySelector("span").textContent =
      busy ? "Memproses..." : "Buat Draft Laporan";
  }

  async function loadOwnerOutlets() {
    const select = $("ownerOutletSelect");
    select.disabled = true;
    select.innerHTML = '<option value="">Memuat daftar outlet...</option>';
    $("createOwnerReportButton").disabled = true;
    setOwnerReportStatus("Mengambil daftar outlet aktif dari Master Absensi...");
    try {
      const result = await NahyezAPI.getActiveOutlets();
      ownerOutletList = Array.isArray(result.outlet) ? result.outlet : [];
      select.innerHTML = '<option value="">-- Pilih outlet --</option>';
      ownerOutletList.forEach(outlet => {
        const option = document.createElement("option");
        option.value = outlet.outletId;
        option.textContent = outlet.namaOutlet;
        select.appendChild(option);
      });
      select.disabled = false;
      if (!ownerOutletList.length) {
        setOwnerReportStatus("Tidak ada outlet aktif yang tersedia pada Master Absensi.", "warning");
      } else {
        setOwnerReportStatus(`${ownerOutletList.length} outlet aktif berhasil dimuat. Pilih outlet untuk memeriksa laporan hari ini.`, "success");
      }
    } catch (error) {
      select.innerHTML = '<option value="">Daftar outlet gagal dimuat</option>';
      setOwnerReportStatus(error.message || "Gagal mengambil daftar outlet aktif.", "error");
    }
  }

  async function checkOwnerTodayReport() {
    const outletId = $("ownerOutletSelect").value;
    const seq = ++ownerReportCheckSequence;
    $("createOwnerReportButton").disabled = true;
    if (!outletId) {
      setOwnerReportStatus("Pilih outlet untuk memeriksa laporan hari ini.");
      return;
    }
    setOwnerReportStatus("Memeriksa apakah outlet sudah memiliki laporan hari ini...");
    try {
      const result = await NahyezAPI.getTodayReport(outletId);
      if (seq !== ownerReportCheckSequence) return;
      if (result.ditemukan && result.laporan) {
        const status = result.laporan.StatusLaporan || "TERCATAT";
        setOwnerReportStatus(
          `Laporan hari ini sudah tersedia untuk ${result.namaOutlet || "outlet ini"}. Status: ${status}. Sistem mencegah pembuatan laporan kedua untuk outlet dan tanggal yang sama.`,
          "warning"
        );
        $("createOwnerReportButton").disabled = true;
      } else {
        setOwnerReportStatus(
          `Belum ada laporan untuk ${result.namaOutlet || "outlet ini"} pada ${result.tanggalServer || "hari ini"} (WIB). Draft laporan dapat dibuat.`,
          "success"
        );
        $("createOwnerReportButton").disabled = false;
      }
    } catch (error) {
      if (seq !== ownerReportCheckSequence) return;
      setOwnerReportStatus(error.message || "Gagal memeriksa laporan hari ini.", "error");
      $("createOwnerReportButton").disabled = true;
    }
  }

  async function createOwnerDailyReport() {
    const outletId = $("ownerOutletSelect").value;
    if (!outletId) return;
    const outlet = ownerOutletList.find(item => item.outletId === outletId);
    const confirmed = window.confirm(
      `Buat Draft Laporan Harian untuk ${outlet ? outlet.namaOutlet : outletId}?\n\nTanggal akan ditentukan otomatis oleh server (WIB). Pembuatan laporan kedua untuk outlet dan tanggal yang sama akan ditolak.`
    );
    if (!confirmed) return;

    setOwnerReportBusy(true);
    setOwnerReportStatus("Membuat Draft Laporan Harian...");
    try {
      const result = await NahyezAPI.createDailyReport(outletId);
      if (result.sudahAda) {
        setOwnerReportStatus(
          `Laporan untuk ${result.namaOutlet || "outlet ini"} ternyata sudah dibuat sebelumnya. Sistem tidak membuat duplikat.`,
          "warning"
        );
      } else {
        const pembuat = result.pembuat && result.pembuat.nama ? result.pembuat.nama : "Owner";
        setOwnerReportStatus(
          `Draft berhasil dibuat untuk ${result.namaOutlet || "outlet ini"}. ID: ${result.laporan && result.laporan.LaporanID ? result.laporan.LaporanID : "tersimpan"}. Pembuat: ${pembuat}.`,
          "success"
        );
      }
      $("createOwnerReportButton").disabled = true;
      $("createOwnerReportButton").querySelector("span").textContent = "Draft Sudah Dibuat";
    } catch (error) {
      setOwnerReportStatus(error.message || "Gagal membuat Draft Laporan.", "error");
      $("createOwnerReportButton").disabled = false;
    } finally {
      $("ownerOutletSelect").disabled = false;
    }
  }

  $("ownerOutletSelect").addEventListener("change", checkOwnerTodayReport);
  $("createOwnerReportButton").addEventListener("click", createOwnerDailyReport);

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
