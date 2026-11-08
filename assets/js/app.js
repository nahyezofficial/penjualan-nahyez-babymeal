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
    window.currentNahyezUser = user;
    hideLoading();
    loginView.classList.add("hidden");
    dashboardView.classList.remove("hidden");
    $("appLayout").classList.remove("hidden");
    activatePage("pageDashboard");
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
    document.querySelectorAll(".nav-item[data-page=\"pageSettings\"]").forEach(el => el.classList.toggle("hidden", user.role !== "OWNER"));
    $("pageSettings").classList.toggle("hidden", user.role !== "OWNER");
    if (user.role === "OWNER") loadOwnerOutlets();
    else initializeCrewWorkspace();
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
        if (status === "DRAFT") openReportWorkspace(result.laporan, result.namaOutlet, false);
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
      if (result.laporan) openReportWorkspace(result.laporan, result.namaOutlet, !result.sudahAda);
    } catch (error) {
      setOwnerReportStatus(error.message || "Gagal membuat Draft Laporan.", "error");
      $("createOwnerReportButton").disabled = false;
    } finally {
      $("ownerOutletSelect").disabled = false;
    }
  }

  $("ownerOutletSelect").addEventListener("change", checkOwnerTodayReport);
  $("createOwnerReportButton").addEventListener("click", createOwnerDailyReport);


  let activeReport = null;
  let activeProducts = [];

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
  }

  function setWorkspaceStatus(message, type = "") {
    const box = $("workspaceStatus");
    box.textContent = message;
    box.className = `report-status ${type}`.trim();
  }

  async function initializeCrewWorkspace() {
    setWorkspaceStatus("Memeriksa laporan harian outlet...");
    try {
      let result = await NahyezAPI.getTodayReport();
      let draftBaru = false;
      if (!result.ditemukan) {
        setWorkspaceStatus("Belum ada Draft hari ini. Sistem sedang membuat Draft laporan untuk outlet Crew...");
        result = await NahyezAPI.createDailyReport();
        draftBaru = !result.sudahAda;
      }
      if (result.laporan) {
        openReportWorkspace(result.laporan, result.namaOutlet || $("profileOutlet").textContent, draftBaru);
      } else {
        setWorkspaceStatus("Laporan hari ini belum dapat dibuka.", "warning");
      }
    } catch (error) {
      setWorkspaceStatus(error.message || "Gagal memuat laporan Crew.", "error");
    }
  }

  async function openReportWorkspace(report, outletName, draftBaru = false) {
    if (!report || !report.LaporanID) return;
    activeReport = report;
    $("reportWorkspace").classList.remove("hidden");
    $("workspaceMeta").textContent =
      `Outlet: ${outletName || "—"} · Tanggal: ${report.Tanggal || "hari ini (WIB)"} · Status: ${report.StatusLaporan || "DRAFT"} · ID: ${report.LaporanID}`;
    $("workspaceTitle").textContent = "Rincian Produk Terjual";
    $("workspaceSubtitle").textContent = "Masukkan jumlah produk terjual dan gratis. Kosongkan atau isi 0 jika produk tidak terjual.";
    $("productEntryList").innerHTML = '<div class="report-status">Mengambil daftar produk dan harga untuk outlet...</div>';
    $("saveProductDetailsButton").disabled = true;
    if (String(report.StatusLaporan || "").toUpperCase() !== "DRAFT") {
      $("productEntryList").innerHTML = "";
      setWorkspaceStatus("Laporan sudah final dan tidak dapat diubah.", "warning");
      return;
    }
    try {
      const outletId = report.OutletID || "";
      const result = await NahyezAPI.getProductPrices(outletId);
      activeProducts = Array.isArray(result.harga) ? result.harga : [];
      const saved = await NahyezAPI.getReportDetails(report.LaporanID);
      const savedMap = new Map((Array.isArray(saved.detail) ? saved.detail : []).map(item => [item.produkId, item]));
      renderProductEntries(savedMap);
      setWorkspaceStatus(
        activeProducts.length
          ? (saved.jumlahBaris
              ? `Rincian tersimpan berhasil dimuat (${saved.jumlahBaris} jenis produk). Anda dapat memeriksa atau memperbarui jumlahnya.`
              : `${activeProducts.length} produk aktif tersedia. Belum ada rincian tersimpan; silakan isi jumlah produk.`)
          : "Tidak ada produk dengan harga aktif untuk outlet ini.",
        activeProducts.length ? "success" : "warning"
      );
      $("saveProductDetailsButton").disabled = !activeProducts.length;
    } catch (error) {
      $("productEntryList").innerHTML = "";
      setWorkspaceStatus(error.message || "Gagal memuat produk dan harga.", "error");
    }
  }

  function renderProductEntries(savedMap = new Map()) {
    const list = $("productEntryList");
    list.innerHTML = "";
    activeProducts.forEach(product => {
      const row = document.createElement("div");
      row.className = "product-entry";
      row.dataset.productId = product.produkId;
      const canFree = /bubur bayi full cup|puding 1 cup/i.test(product.namaProduk || "");
      row.innerHTML = `
        <div class="product-entry-main">
          <strong></strong><small></small>
        </div>
        <div><label>Terjual</label><input class="sold-input" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Jumlah terjual"></div>
        <div><label>Gratis</label><input class="free-input" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Jumlah gratis" ${canFree ? "" : "disabled"}></div>`;
      row.querySelector("strong").textContent = product.namaProduk;
      row.querySelector("small").textContent = `${formatRupiah(product.hargaJual)} / satuan · Konversi stok ${product.konversiStok}`;
      const saved = savedMap.get(product.produkId);
      if (saved) {
        row.querySelector(".sold-input").value = Number(saved.jumlahTerjual) || 0;
        row.querySelector(".free-input").value = Number(saved.jumlahGratis) || 0;
      }
      row.querySelectorAll("input").forEach(input => input.addEventListener("input", updateProductTotal));
      list.appendChild(row);
    });
    updateProductTotal();
  }

  function updateProductTotal() {
    let total = 0;
    document.querySelectorAll(".product-entry").forEach(row => {
      const product = activeProducts.find(p => p.produkId === row.dataset.productId);
      const sold = Math.max(0, Number(row.querySelector(".sold-input").value) || 0);
      total += sold * Number(product && product.hargaJual || 0);
    });
    $("productTotal").textContent = formatRupiah(total);
  }

  async function saveProductDetails() {
    if (!activeReport || !activeReport.LaporanID) return;
    const daftarProduk = [];
    let invalid = false;
    document.querySelectorAll(".product-entry").forEach(row => {
      const soldInput = row.querySelector(".sold-input");
      const freeInput = row.querySelector(".free-input");
      const jumlahTerjual = Number(soldInput.value || 0);
      const jumlahGratis = Number(freeInput.value || 0);
      if (!Number.isSafeInteger(jumlahTerjual) || jumlahTerjual < 0 ||
          !Number.isSafeInteger(jumlahGratis) || jumlahGratis < 0) invalid = true;
      if (jumlahTerjual + jumlahGratis > 0) {
        daftarProduk.push({ produkId: row.dataset.productId, jumlahTerjual, jumlahGratis });
      }
    });
    if (invalid) return setWorkspaceStatus("Jumlah harus berupa bilangan bulat 0 atau lebih.", "error");
    if (!daftarProduk.length) return setWorkspaceStatus("Masukkan minimal satu jumlah produk terjual atau gratis.", "warning");
    if (!window.confirm("Simpan rincian produk untuk laporan Draft ini? Rincian sebelumnya pada laporan yang sama akan diganti.")) return;

    $("saveProductDetailsButton").disabled = true;
    $("saveProductDetailsButton").querySelector("span").textContent = "Menyimpan...";
    setWorkspaceStatus("Mengirim rincian produk untuk divalidasi server...");
    try {
      const result = await NahyezAPI.saveReportDetails(activeReport.LaporanID, daftarProduk);
      setWorkspaceStatus(`Rincian berhasil disimpan. ${result.jumlahBaris} jenis produk · Total omzet ${formatRupiah(result.totalOmzet)}.`, "success");
      $("productTotal").textContent = formatRupiah(result.totalOmzet);
      activeReport.TotalOmzet = result.totalOmzet;
    } catch (error) {
      setWorkspaceStatus(error.message || "Gagal menyimpan rincian produk.", "error");
      $("saveProductDetailsButton").disabled = false;
    } finally {
      $("saveProductDetailsButton").querySelector("span").textContent = "Simpan Rincian Produk";
    }
  }

  $("saveProductDetailsButton").addEventListener("click", saveProductDetails);

  // V2.6 — pengaturan tarif operasional hanya untuk Owner.
  let outletFuelCache = [];
  let routeFuelCache = [];
  let settingsOutletNames = {};
  const rupiahInput = value => value === null || value === undefined || value === "" ? "" : String(value);
  function setSettingsStatus(id, message, type = "") {
    const el = $(id); if (!el) return;
    el.textContent = message; el.className = `report-status ${type}`.trim();
  }
  function renderOutletFuelSettings() {
    const host = $("outletFuelList"); host.replaceChildren();
    if (!outletFuelCache.length) { host.innerHTML = '<div class="report-status warning">Tidak ada konfigurasi tarif outlet aktif yang diterima.</div>'; return; }
    outletFuelCache.forEach(item => {
      const row = document.createElement("div"); row.className = "settings-row";
      const info = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = settingsOutletNames[item.outletId] || item.outletId;
      const meta = document.createElement("small"); meta.textContent = `${item.outletId} · ${item.terkonfigurasi ? `Terakhir diubah: ${item.waktuPerubahan || "—"}` : "Belum dikonfigurasi"}`;
      info.append(title, meta);
      const label = document.createElement("label"); label.textContent = "Tarif bensin (Rp)";
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "1"; input.inputMode = "numeric"; input.dataset.outletId = item.outletId; input.value = rupiahInput(item.nominalBensin); input.placeholder = "Masukkan nominal";
      label.appendChild(input); row.append(info, label); host.appendChild(row);
    });
  }
  function renderRouteFuelSettings() {
    const host = $("routeFuelList"); host.replaceChildren();
    if (!routeFuelCache.length) { host.innerHTML = '<div class="report-status warning">Tidak ada rute transfer aktif yang diterima.</div>'; return; }
    routeFuelCache.forEach(item => {
      const row = document.createElement("div"); row.className = "settings-row";
      const info = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = `${settingsOutletNames[item.outletAsal] || item.outletAsal} → ${settingsOutletNames[item.outletTujuan] || item.outletTujuan}`;
      const meta = document.createElement("small"); meta.textContent = `${item.pengaturanRuteId} · ${item.terkonfigurasi ? `Terakhir diubah: ${item.waktuPerubahan || "—"}` : "Belum dikonfigurasi"}`;
      info.append(title, meta);
      const label = document.createElement("label"); label.textContent = "Tarif bensin rute (Rp)";
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "1"; input.inputMode = "numeric"; input.dataset.routeId = item.pengaturanRuteId; input.value = rupiahInput(item.nominalBensin); input.placeholder = "Masukkan nominal";
      label.appendChild(input); row.append(info, label); host.appendChild(row);
    });
  }
  async function loadOperationalSettings() {
    if (!window.currentNahyezUser || window.currentNahyezUser.role !== "OWNER") return;
    setSettingsStatus("outletFuelStatus", "Memuat konfigurasi tarif bensin outlet...");
    setSettingsStatus("routeFuelStatus", "Memuat konfigurasi tarif transfer...");
    try {
      const [outlets, fuel, routes] = await Promise.all([NahyezAPI.getActiveOutlets(), NahyezAPI.getOutletFuelSettings(), NahyezAPI.getRouteFuelSettings()]);
      settingsOutletNames = {};
      (outlets.outlet || []).forEach(o => { settingsOutletNames[o.outletId] = o.namaOutlet; });
      outletFuelCache = fuel.daftarTarif || []; routeFuelCache = routes.daftarTarif || [];
      renderOutletFuelSettings(); renderRouteFuelSettings();
      setSettingsStatus("outletFuelStatus", `${outletFuelCache.filter(x => x.terkonfigurasi).length} dari ${outletFuelCache.length} outlet sudah memiliki tarif.`, fuel.semuaTarifTerisi ? "success" : "warning");
      setSettingsStatus("routeFuelStatus", `${routeFuelCache.filter(x => x.terkonfigurasi).length} dari ${routeFuelCache.length} rute sudah memiliki tarif.`, routes.semuaTarifTerisi ? "success" : "warning");
    } catch (error) {
      setSettingsStatus("outletFuelStatus", error.message || "Gagal memuat tarif outlet.", "error");
      setSettingsStatus("routeFuelStatus", error.message || "Gagal memuat tarif rute.", "error");
    }
  }
  async function saveOutletFuelSettings() {
    const inputs = [...document.querySelectorAll("#outletFuelList input[data-outlet-id]")];
    if (!inputs.length) return;
    const daftarTarif = [];
    for (const input of inputs) {
      if (input.value.trim() === "" || !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0) { input.focus(); setSettingsStatus("outletFuelStatus", "Isi seluruh tarif dengan angka Rupiah bulat, minimal 0.", "error"); return; }
      daftarTarif.push({ outletId: input.dataset.outletId, nominalBensin: Number(input.value) });
    }
    const button = $("saveOutletFuelButton"); button.disabled = true; button.querySelector("span").textContent = "Menyimpan...";
    try { await NahyezAPI.saveOutletFuelSettings(daftarTarif); setSettingsStatus("outletFuelStatus", "Tarif bensin outlet berhasil diperbarui.", "success"); await loadOperationalSettings(); }
    catch (error) { setSettingsStatus("outletFuelStatus", error.message || "Gagal menyimpan tarif outlet.", "error"); }
    finally { button.disabled = false; button.querySelector("span").textContent = "Simpan Tarif Bensin Outlet"; }
  }
  async function saveRouteFuelSettings() {
    const inputs = [...document.querySelectorAll("#routeFuelList input[data-route-id]")];
    if (!inputs.length) return;
    const daftarTarif = [];
    for (const input of inputs) {
      if (input.value.trim() === "" || !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0) { input.focus(); setSettingsStatus("routeFuelStatus", "Isi seluruh tarif dengan angka Rupiah bulat, minimal 0.", "error"); return; }
      daftarTarif.push({ pengaturanRuteId: input.dataset.routeId, nominalBensin: Number(input.value) });
    }
    const button = $("saveRouteFuelButton"); button.disabled = true; button.querySelector("span").textContent = "Menyimpan...";
    try { await NahyezAPI.saveRouteFuelSettings(daftarTarif); setSettingsStatus("routeFuelStatus", "Tarif transfer berhasil diperbarui.", "success"); await loadOperationalSettings(); }
    catch (error) { setSettingsStatus("routeFuelStatus", error.message || "Gagal menyimpan tarif transfer.", "error"); }
    finally { button.disabled = false; button.querySelector("span").textContent = "Simpan Tarif Transfer"; }
  }
  $("reloadFuelSettings").addEventListener("click", loadOperationalSettings);
  $("reloadRouteSettings").addEventListener("click", loadOperationalSettings);
  $("saveOutletFuelButton").addEventListener("click", saveOutletFuelSettings);
  $("saveRouteFuelButton").addEventListener("click", saveRouteFuelSettings);

  // Tahap 7A — persiapan stok awal dan modal kembalian dalam satu penyimpanan.
  let stockProducts = [];
  function stockStatus(message, type = "") { const el=$("stockStatus"); el.textContent=message; el.className=`report-status ${type}`.trim(); }
  async function loadStockPreparation() {
    const user=window.currentNahyezUser; if(!user) return;
    const select=$("stockOutletSelect"), wrap=$("stockOutletWrap");
    if(user.role==="OWNER") {
      wrap.classList.remove("hidden");
      try {
        if(!ownerOutletList.length) { const r=await NahyezAPI.getActiveOutlets(); ownerOutletList=r.outlet||[]; }
        const prior=select.value; select.innerHTML='<option value="">-- Pilih outlet --</option>';
        ownerOutletList.forEach(o=>{const op=document.createElement("option");op.value=o.outletId;op.textContent=o.namaOutlet;select.appendChild(op);});
        if(prior && ownerOutletList.some(o=>o.outletId===prior)) select.value=prior;
      } catch(e) { stockStatus(e.message||"Gagal memuat outlet.","error"); return; }
      if(!select.value) { $("stockMeta").textContent="Pilih outlet untuk memuat persiapan hari ini."; $("stockEntryList").replaceChildren(); $("saveStockPreparationButton").disabled=true; return; }
    } else { wrap.classList.add("hidden"); }
    const outletId=user.role==="OWNER"?select.value:"";
    $("saveStockPreparationButton").disabled=true;
    $("stockMeta").textContent="Memuat persiapan stok hari ini...";
    try {
      const r=await NahyezAPI.getDailyPreparation(outletId);
      stockProducts=r.produk||[]; $("stockMeta").textContent=`Outlet: ${user.role==="OWNER"?(ownerOutletList.find(o=>o.outletId===outletId)||{}).namaOutlet||outletId:user.outletNama||"Outlet Crew"} · Tanggal: ${r.tanggal} (WIB)`;
      $("changeFundInput").value=r.persiapan?Number(r.persiapan.modalKembalian)||0:0;
      const host=$("stockEntryList"); host.replaceChildren();
      stockProducts.forEach(item=>{const row=document.createElement("div");row.className="product-entry";row.dataset.productId=item.produkId;row.innerHTML='<div class="product-entry-main"><strong></strong><small></small></div><div><label>Stok awal</label><input class="stock-qty-input" type="number" min="0" step="1" inputmode="numeric"></div>';row.querySelector("strong").textContent=item.namaProduk;row.querySelector("small").textContent=`${item.kategoriStok||"Produk"} · ${item.satuanStok||"Satuan"} · Konversi stok ${item.konversiStok}`;row.querySelector("input").value=Number(item.jumlahStokAwal)||0;host.appendChild(row);});
      stockStatus(r.tersimpan?"Persiapan hari ini sudah tersimpan. Anda dapat memperbarui jumlah jika diperlukan.":"Belum ada persiapan hari ini. Silakan isi stok awal dan modal kembalian.",r.tersimpan?"success":"warning");
      $("saveStockPreparationButton").disabled=!stockProducts.length;
    } catch(e) { stockStatus(e.message||"Gagal memuat persiapan harian.","error"); $("stockMeta").textContent="Persiapan gagal dimuat."; }
  }
  async function saveStockPreparation() {
    const user=window.currentNahyezUser; if(!user||!stockProducts.length)return;
    const modal=Number($("changeFundInput").value);
    if(!Number.isSafeInteger(modal)||modal<0){stockStatus("Modal kembalian harus berupa angka Rupiah bulat minimal 0.","error");return;}
    const daftarStok=[]; let invalid=false;
    document.querySelectorAll("#stockEntryList .product-entry").forEach(row=>{const qty=Number(row.querySelector("input").value);if(!Number.isSafeInteger(qty)||qty<0)invalid=true;daftarStok.push({produkId:row.dataset.productId,jumlahStokAwal:qty});});
    if(invalid||daftarStok.length!==stockProducts.length){stockStatus("Seluruh stok harus berupa bilangan bulat 0 atau lebih.","error");return;}
    const outletId=user.role==="OWNER"?$("stockOutletSelect").value:"";
    if(user.role==="OWNER"&&!outletId){stockStatus("Pilih outlet terlebih dahulu.","warning");return;}
    const btn=$("saveStockPreparationButton");btn.disabled=true;btn.querySelector("span").textContent="Menyimpan...";stockStatus("Menyimpan stok awal dan modal kembalian secara bersamaan...");
    try {const r=await NahyezAPI.saveDailyPreparation({outletId,modalKembalian:modal,daftarStok});stockStatus(`${r.pesan} ${r.jumlahProduk} jenis produk tersimpan.`,"success");}
    catch(e){stockStatus(e.message||"Gagal menyimpan persiapan.","error");}
    finally{btn.disabled=false;btn.querySelector("span").textContent="Simpan Stok Awal & Modal";}
  }
  $("stockOutletSelect").addEventListener("change",loadStockPreparation);
  $("saveStockPreparationButton").addEventListener("click",saveStockPreparation);

  // Sidebar navigation V2.5. Dashboard content is retained; unfinished modules are clearly marked.
  function activatePage(pageId) {
    document.querySelectorAll(".app-page").forEach(page => page.classList.toggle("active", page.id === pageId));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === pageId));
    const active = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (pageId === "pageSettings") loadOperationalSettings();
    if (pageId === "pageStock") loadStockPreparation();
    $("activePageTitle").textContent = active ? active.textContent.trim() : "Dashboard";
    $("appSidebar").classList.remove("open");
  }
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => activatePage(button.dataset.page)));
  $("sidebarToggle").addEventListener("click", () => $("appSidebar").classList.toggle("open"));

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
