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
    $("crewComingCard").classList.add("hidden");
    document.querySelectorAll(".nav-item[data-page=\"pageSettings\"]").forEach(el => el.classList.toggle("hidden", user.role !== "OWNER"));
    $("pageSettings").classList.toggle("hidden", user.role !== "OWNER");
    // Persiapan stok awal dan modal kembalian adalah kewenangan Owner saja.
    document.querySelectorAll(".nav-item[data-page=\"pageStock\"]").forEach(el => el.classList.toggle("hidden", user.role !== "OWNER"));
    $("pageStock").classList.toggle("hidden", user.role !== "OWNER");
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
        // Draft dibuat otomatis setelah Owner memilih outlet; tidak ada tombol Buat Draft terpisah.
        setOwnerReportStatus(`Menyiapkan Draft untuk ${result.namaOutlet || "outlet ini"}...`);
        $("ownerOutletSelect").disabled = true;
        try {
          const dibuat = await NahyezAPI.createDailyReport(outletId);
          const laporan = dibuat.laporan;
          if (!laporan || !laporan.LaporanID) throw new Error("Draft belum berhasil dibuat oleh server.");
          setOwnerReportStatus(`Draft siap untuk ${dibuat.namaOutlet || result.namaOutlet || outletId}. ID: ${laporan.LaporanID}. Formulir laporan dapat langsung diisi.`, "success");
          openReportWorkspace(laporan, dibuat.namaOutlet || result.namaOutlet, !dibuat.sudahAda);
        } finally {
          $("ownerOutletSelect").disabled = false;
        }
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
    // Kompatibilitas handler lama; proses normal kini otomatis dari pemilihan outlet.
    if (!outletId) return;

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

  let workspaceLoadSequence = 0;
  async function openReportWorkspace(report, outletName, draftBaru = false) {
    if (!report || !report.LaporanID) return;
    const loadSeq = ++workspaceLoadSequence;
    activeReport = report;
    activeProducts = [];
    transactionReference = { rute: [], pelanggan: [] };
    lastTransactionPreview = null;
    $("reportReviewPanel").classList.add("hidden");
    $("reportWorkspace").classList.remove("hidden");
    if (window.currentNahyezUser?.role === "OWNER") $("ownerReportPanel").classList.remove("hidden");
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

    // Produk/harga adalah komponen utama formulir. Kegagalan referensi piutang/rute
    // tidak boleh menghapus formulir produk yang sudah berhasil dimuat.
    let saved = { detail: [], jumlahBaris: 0 };
    let productStage = "harga produk";
    try {
      const outletId = report.OutletID || "";
      const result = await NahyezAPI.getProductPrices(outletId);
      if (loadSeq !== workspaceLoadSequence || activeReport?.LaporanID !== report.LaporanID) return;
      activeProducts = Array.isArray(result?.harga) ? result.harga : [];
      productStage = "rincian laporan tersimpan";
      saved = await NahyezAPI.getReportDetails(report.LaporanID);
      if (loadSeq !== workspaceLoadSequence || activeReport?.LaporanID !== report.LaporanID) return;
      const savedMap = new Map((Array.isArray(saved?.detail) ? saved.detail : []).map(item => [item.produkId, item]));
      renderProductEntries(savedMap);
    } catch (error) {
      console.error(`[Nahyez] Gagal memuat ${productStage} untuk ${report.LaporanID}:`, error);
      $("productEntryList").innerHTML = "";
      setWorkspaceStatus(`${error.message || "Gagal memuat formulir."} (tahap: ${productStage})`, "error");
      return;
    }

    let referenceWarning = "";
    try {
      await loadTransactionReferences();
    } catch (error) {
      console.error(`[Nahyez] Gagal memuat referensi transaksi untuk ${report.LaporanID}:`, error);
      transactionReference = { rute: [], pelanggan: [] };
      renderCustomerRows("newDebtRows", "debt");
      renderCustomerRows("debtPaymentRows", "payment");
      renderTransferRows();
      referenceWarning = ` Referensi piutang/transfer belum termuat: ${error.message || "kesalahan tidak diketahui"}. Form produk tetap dapat digunakan.`;
    }

    if (loadSeq !== workspaceLoadSequence || activeReport?.LaporanID !== report.LaporanID) return;
    if (report.SudahDisubmit) {
      document.querySelectorAll("#reportWorkspace input,#reportWorkspace select,#reportWorkspace textarea,#reportWorkspace button").forEach(el => el.disabled = true);
      setWorkspaceStatus("Laporan ini sudah berhasil disubmit sebagai Draft. Input dikunci agar transaksi tidak tercatat dua kali.", "success");
      return;
    }
    setWorkspaceStatus(
      activeProducts.length
        ? (saved.jumlahBaris
            ? `Rincian tersimpan berhasil dimuat (${saved.jumlahBaris} jenis produk). Anda dapat memeriksa atau memperbarui jumlahnya.`
            : `${activeProducts.length} produk aktif tersedia. Belum ada rincian tersimpan; silakan isi jumlah produk.`) + referenceWarning
        : "Tidak ada produk dengan harga aktif untuk outlet ini.",
      activeProducts.length ? (referenceWarning ? "warning" : "success") : "warning"
    );
    $("saveProductDetailsButton").disabled = !activeProducts.length;
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
    // Hanya baris produk penjualan. Baris stok awal/transfer tidak memiliki .sold-input.
    document.querySelectorAll("#productEntryList .product-entry").forEach(row => {
      const soldInput = row.querySelector(".sold-input");
      if (!soldInput) return;
      const product = activeProducts.find(p => p.produkId === row.dataset.productId);
      const sold = Math.max(0, Number(soldInput.value) || 0);
      total += sold * Number(product && product.hargaJual || 0);
    });
    $("productTotal").textContent = formatRupiah(total);
  }

  let transactionReference = { rute: [], pelanggan: [] };
  let lastTransactionPreview = null;
  function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function loadTransactionReferences(){
    const outletId=activeReport?.OutletID||'';
    const result=await NahyezAPI.getTransactionReference(outletId);
    transactionReference=(result && typeof result==='object')?result:{rute:[],pelanggan:[]};
    renderCustomerRows('newDebtRows','debt');renderCustomerRows('debtPaymentRows','payment');
    renderTransferRows();
  }
  function renderCustomerRows(hostId,type){
    const host=$(hostId);if(!host)return;host.innerHTML='';
    if(!transactionReference.pelanggan?.length){host.innerHTML='<div class="report-status warning">Belum ada pelanggan aktif untuk outlet ini. Piutang dapat dibiarkan kosong sampai pelanggan terdaftar.</div>';return;}
    addCustomerAmountRow(hostId,type);
  }
  function addCustomerAmountRow(hostId,type){
    const host=$(hostId);if(!host)return;
    const row=document.createElement('div');row.className='transaction-row';
    const opts=['<option value="">Pilih pelanggan</option>',...(transactionReference.pelanggan||[]).map(p=>`<option value="${escHtml(p.pelangganId)}">${escHtml(p.namaPelanggan)}${p.penandaPembeda?' · '+escHtml(p.penandaPembeda):''} · ${escHtml(p.pelangganId)}</option>`)].join('');
    row.innerHTML=`<select class="customer-select" aria-label="Pelanggan">${opts}</select><input class="customer-amount" type="number" min="0" step="1" value="0" aria-label="Nominal Rupiah"><button type="button" class="remove-row" aria-label="Hapus baris">×</button>`;
    row.querySelector('.remove-row').addEventListener('click',()=>row.remove());host.appendChild(row);
  }
  function renderTransferRows(){
    const host=$('stockTransferRows');if(!host)return;host.innerHTML='';
    if(!transactionReference.rute?.length){host.innerHTML='<div class="report-status warning">Tidak ada rute transfer aktif untuk outlet ini.</div>';return;}
    addTransferRow();
  }
  function addTransferRow(){
    const host=$('stockTransferRows');if(!host||host.querySelectorAll('.transfer-card').length>=2)return;
    const n=host.querySelectorAll('.transfer-card').length+1,row=document.createElement('div');row.className='transfer-card';
    const routeOptions=['<option value="">Pilih rute transfer</option>',...transactionReference.rute.map(r=>`<option value="${escHtml(r.pengaturanRuteId)}">${escHtml(r.outletAsal)} → ${escHtml(r.outletTujuan)} · ${r.nominalBensin===null?'Tarif belum diatur':formatRupiah(r.nominalBensin)}</option>`)].join('');
    row.innerHTML=`<div class="transfer-card-head"><strong>Transfer ${n}</strong><button type="button" class="remove-row">Hapus</button></div><select class="transfer-route report-select">${routeOptions}</select><div class="transfer-product-list"></div>`;
    const list=row.querySelector('.transfer-product-list');activeProducts.forEach(p=>{const item=document.createElement('label');item.className='transfer-product';item.innerHTML=`<span>${escHtml(p.namaProduk)} <small>Jumlah dalam cup</small></span><input type="number" min="0" step="1" value="0" data-product-id="${escHtml(p.produkId)}">`;list.appendChild(item);});
    row.querySelector('.remove-row').addEventListener('click',()=>row.remove());host.appendChild(row);
  }
  function collectIntegratedPayload(){
    const daftarProduk=[];document.querySelectorAll('#productEntryList .product-entry').forEach(row=>daftarProduk.push({produkId:row.dataset.productId,jumlahTerjual:Number(row.querySelector('.sold-input').value||0),jumlahGratis:Number(row.querySelector('.free-input').value||0)}));
    const collectCustomers=id=>[...document.querySelectorAll(`#${id} .transaction-row`)].map(row=>({pelangganId:row.querySelector('.customer-select').value,nominal:Number(row.querySelector('.customer-amount').value||0)})).filter(x=>x.pelangganId&&x.nominal>0);
    const daftarTransfer=[...document.querySelectorAll('#stockTransferRows .transfer-card')].map(row=>({pengaturanRuteId:row.querySelector('.transfer-route').value,daftarProduk:[...row.querySelectorAll('.transfer-product input')].map(i=>({produkId:i.dataset.productId,jumlahCup:Number(i.value||0)})).filter(x=>x.jumlahCup>0)})).filter(t=>t.pengaturanRuteId);
    return {laporanId:activeReport?.LaporanID,outletId:activeReport?.OutletID,daftarProduk,qris:Number($('qrisInput').value||0),transferPembayaran:Number($('transferPaymentInput').value||0),daftarPiutang:collectCustomers('newDebtRows'),daftarPembayaranPiutang:collectCustomers('debtPaymentRows'),daftarTransfer,catatan:$('reportNoteInput').value.trim()};
  }
  function renderReview(preview){
    const fee=preview.fee,stock=preview.remaining;const money=formatRupiah;
    const productRows=preview.details.map(p=>`<tr><td>${escHtml(p.namaProduk)}</td><td>${p.jumlahTerjual}</td><td>${p.jumlahGratis}</td><td>${money(p.subtotal)}</td></tr>`).join('');
    const debtRows=(preview.debts||[]).map(p=>`<tr><td>${escHtml(p.namaPelanggan)}</td><td>${escHtml(p.pelangganId)}</td><td>${money(p.nominal)}</td></tr>`).join('');
    const paidRows=(preview.payments||[]).map(p=>`<tr><td>${escHtml(p.namaPelanggan)}</td><td>${escHtml(p.pelangganId)}</td><td>${money(p.nominal)}</td></tr>`).join('');
    const transferRows=(preview.transferPlans||[]).map(t=>`<tr><td>${escHtml(t.route.asal)} → ${escHtml(t.route.tujuan)}</td><td>${t.totalCup}</td><td>${money(t.route.tarif)}</td></tr>`).join('');
    const stockRows=Object.entries(stock).map(([k,v])=>`<div class="review-stock"><span>${({bubur:'Bubur',puding:'Puding',nasitim:'Nasi Tim',oatmeal:'Oatmeal',abon:'Abon'})[k]||k}</span><strong>${v}</strong></div>`).join('');
    $('reviewContent').innerHTML=`<div class="review-summary-grid"><div><small>Omzet Produk</small><strong>${money(preview.omzet)}</strong></div><div><small>QRIS</small><strong>${money(preview.qris)}</strong></div><div><small>Transfer</small><strong>${money(preview.transferPembayaran)}</strong></div><div><small>Piutang Baru</small><strong>${money(preview.totalDebt)}</strong></div><div><small>Pembayaran Piutang</small><strong>${money(preview.totalPaid)}</strong></div><div><small>Daily Fee</small><strong>${money(preview.dailyFee)}</strong></div><div><small>Modal Kembalian</small><strong>${money(preview.modalKembalian)}</strong></div><div class="review-highlight"><small>Estimasi Setoran Tunai</small><strong>${money(preview.cash)}</strong></div></div><h4>Rincian Produk</h4><div class="review-table-wrap"><table class="review-table"><thead><tr><th>Produk</th><th>Terjual</th><th>Gratis</th><th>Subtotal</th></tr></thead><tbody>${productRows}</tbody></table></div><h4>Piutang Baru</h4><div class="review-table-wrap"><table class="review-table"><thead><tr><th>Pelanggan</th><th>PelangganID</th><th>Nominal</th></tr></thead><tbody>${debtRows||'<tr><td colspan="3">Tidak ada piutang baru.</td></tr>'}</tbody></table></div><h4>Pembayaran Piutang Lama</h4><div class="review-table-wrap"><table class="review-table"><thead><tr><th>Pelanggan</th><th>PelangganID</th><th>Nominal</th></tr></thead><tbody>${paidRows||'<tr><td colspan="3">Tidak ada pembayaran piutang.</td></tr>'}</tbody></table></div><h4>Pengambilan Stok</h4><div class="review-table-wrap"><table class="review-table"><thead><tr><th>Rute</th><th>Jumlah Cup</th><th>Tarif Bensin</th></tr></thead><tbody>${transferRows||'<tr><td colspan="3">Tidak ada transfer stok.</td></tr>'}</tbody></table></div><h4>Perhitungan Daily Fee</h4><div class="review-list"><span>Fee dasar</span><b>${money(fee.feeBase)}</b><span>Bonus cup bubur (${fee.totalCupBubur} × ${money(fee.bonusCup)})</span><b>${money(fee.bonusTotal)}</b><span>Bonus target (${fee.targets} target)</span><b>${money(fee.bonusTargetTotal)}</b><span>Bensin outlet</span><b>${money(fee.fuelOutlet)}</b><span>Bensin transfer</span><b>${money(fee.fuelTransfer)}</b></div><h4>Sisa Stok Setelah Transaksi</h4><div class="review-stock-grid">${stockRows}</div><p class="report-footnote">Outlet: ${escHtml(preview.outlet.namaOutlet)} · Tanggal: ${escHtml(preview.tanggal)} WIB · ID: ${escHtml(preview.laporanId)}</p>`;
  }
  function showReviewPage(){
    // Mode review menggantikan formulir input, bukan ditambahkan di bawahnya.
    $('reportWorkspace').classList.add('hidden');
    $('ownerReportPanel').classList.add('hidden');
    $('reportReviewPanel').classList.remove('hidden');
    $('reportReviewPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function showInputPage(){
    $('reportReviewPanel').classList.add('hidden');
    $('reportWorkspace').classList.remove('hidden');
    if(window.currentNahyezUser?.role==='OWNER') $('ownerReportPanel').classList.remove('hidden');
    $('reportWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function reviewIntegratedReport(){
    if(!activeReport)return;
    const btn=$('saveProductDetailsButton');
    btn.disabled=true;btn.querySelector('span').textContent='Memeriksa...';
    setWorkspaceStatus('Memvalidasi seluruh komponen laporan di server...');
    try{
      const preview=await NahyezAPI.previewIntegratedReport(collectIntegratedPayload());
      lastTransactionPreview=preview;
      renderReview(preview);
      $('reviewStatus').textContent='Pemeriksaan berhasil. Periksa kembali seluruh rincian sebelum Submit Laporan.';
      $('reviewStatus').className='report-status success';
      showReviewPage();
    }catch(e){
      setWorkspaceStatus(e.message||'Validasi laporan gagal. Periksa kembali seluruh input.','error');
    }finally{
      btn.disabled=false;btn.querySelector('span').textContent='Review Laporan';
    }
  }
  async function submitIntegratedReport(){
    if(!activeReport||!lastTransactionPreview)return;
    const btn=$('submitIntegratedReportButton');
    btn.disabled=true;btn.querySelector('span').textContent='Mengirim...';
    $('reviewStatus').textContent='Menyimpan seluruh komponen laporan secara bersamaan...';
    $('reviewStatus').className='report-status';
    try{
      const result=await NahyezAPI.submitIntegratedReport(collectIntegratedPayload());
      $('reviewStatus').textContent=`${result.pesan} Omzet ${formatRupiah(result.omzet)} · Daily Fee ${formatRupiah(result.dailyFee)} · Setoran tunai ${formatRupiah(result.setoranTunai)}.`;
      $('reviewStatus').className='report-status success';
      activeReport.SudahDisubmit=true;
      $('saveProductDetailsButton').disabled=true;
      document.querySelectorAll('#reportWorkspace input,#reportWorkspace select,#reportWorkspace textarea,#reportWorkspace button').forEach(el=>el.disabled=true);
      btn.querySelector('span').textContent='Laporan Berhasil Disubmit';
      btn.classList.add('hidden');
      $('backToReportButton').disabled=true;
      $('finishSubmittedReportButton').querySelector('span').textContent =
        window.currentNahyezUser?.role === 'OWNER'
          ? 'Selesai & Pilih Outlet Berikutnya'
          : 'Tutup Laporan Hari Ini';
      $('finishSubmittedReportButton').classList.remove('hidden');
      $('reviewContent').insertAdjacentHTML('beforeend',`<h4>Sisa Stok Tersimpan</h4><div class="review-stock-grid">${Object.entries(result.sisaStok||{}).map(([k,v])=>`<div class="review-stock"><span>${escHtml(k)}</span><strong>${v}</strong></div>`).join('')}</div>`);
    }catch(e){
      $('reviewStatus').textContent=e.message||'Submit laporan gagal. Data belum dinyatakan tersimpan.';
      $('reviewStatus').className='report-status error';
      btn.disabled=false;btn.querySelector('span').textContent='Coba Submit Lagi';
    }
  }
  async function finishSubmittedReport(){
    const isOwner=window.currentNahyezUser?.role==='OWNER';
    if(!isOwner){
      $('reviewStatus').textContent='Laporan hari ini sudah berhasil disubmit dan tersimpan. Anda dapat keluar dari akun.';
      $('finishSubmittedReportButton').classList.add('hidden');
      return;
    }
    activeReport=null;
    activeProducts=[];
    lastTransactionPreview=null;
    transactionReference={rute:[],pelanggan:[]};

    // Bersihkan state visual agar transaksi outlet berikutnya selalu dimulai dari awal.
    $('reportReviewPanel').classList.add('hidden');
    $('reportWorkspace').classList.add('hidden');
    $('reviewContent').innerHTML='';
    $('reviewStatus').textContent='';
    $('productEntryList').innerHTML='';
    $('newDebtRows').innerHTML='';
    $('debtPaymentRows').innerHTML='';
    $('stockTransferRows').innerHTML='';
    $('qrisInput').value='0';
    $('transferPaymentInput').value='0';
    $('reportNoteInput').value='';
    $('productTotal').textContent=formatRupiah(0);

    if(isOwner){
      $('ownerReportPanel').classList.remove('hidden');
      $('ownerOutletSelect').disabled=false;
      $('ownerOutletSelect').value='';
      $('createOwnerReportButton').disabled=true;
      $('createOwnerReportButton').classList.add('hidden');
      setOwnerReportStatus('Laporan sebelumnya sudah tersimpan. Pilih outlet berikutnya untuk memulai laporan baru.','success');
      activatePage('pageInput');
      $('ownerReportPanel').scrollIntoView({behavior:'smooth',block:'start'});
    }else{
      $('ownerReportPanel').classList.add('hidden');
      setWorkspaceStatus('Laporan hari ini berhasil disubmit dan tersimpan. Form input telah ditutup.','success');
      $('reportWorkspace').classList.remove('hidden');
      $('reportWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
    }
    $('finishSubmittedReportButton').classList.add('hidden');
    $('submitIntegratedReportButton').classList.remove('hidden');
    $('submitIntegratedReportButton').disabled=false;
    $('submitIntegratedReportButton').querySelector('span').textContent='Submit Laporan';
    $('backToReportButton').disabled=false;
  }

  $('saveProductDetailsButton').addEventListener('click',reviewIntegratedReport);
  $('backToReportButton').addEventListener('click',showInputPage);
  $('submitIntegratedReportButton').addEventListener('click',submitIntegratedReport);
  $('finishSubmittedReportButton').addEventListener('click',finishSubmittedReport);
  $('addCustomerButton').addEventListener('click',async()=>{const nama=window.prompt('Nama pelanggan:');if(!nama||!nama.trim())return;try{await NahyezAPI.addTransactionCustomer({outletId:activeReport?.OutletID,namaPelanggan:nama.trim()});await loadTransactionReferences();setWorkspaceStatus('Pelanggan baru berhasil ditambahkan. Identitas transaksi menggunakan PelangganID.','success');}catch(e){setWorkspaceStatus(e.message||'Gagal menambahkan pelanggan.','error');}});
  $('addDebtRow').addEventListener('click',()=>addCustomerAmountRow('newDebtRows','debt'));
  $('addDebtPaymentRow').addEventListener('click',()=>addCustomerAmountRow('debtPaymentRows','payment'));
  $('addStockTransfer').addEventListener('click',addTransferRow);


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

  // Tahap 7A/7B — stok bubur dan puding dicatat sebagai total cup per kategori.
  let stockProducts = [];
  let stockEntryGroups = [];
  function stockStatus(message, type = "") { const el=$("stockStatus"); el.textContent=message; el.className=`report-status ${type}`.trim(); }
  function stockCategory(product) {
    const category=String(product.kategoriStok||"").toLowerCase();
    const name=String(product.namaProduk||"").toLowerCase();
    if(category.includes("bubur") || name.includes("bubur")) return "bubur";
    if(category.includes("puding") || name.includes("puding")) return "puding";
    if(category.includes("nasi") || name.includes("nasi tim")) return "nasitim";
    if(category.includes("oat") || name.includes("oatmeal")) return "oatmeal";
    if(category.includes("abon") || name.includes("abon")) return "abon";
    return `produk:${product.produkId}`;
  }
  function buildStockEntryGroups(products, preparation) {
    const buckets=new Map();
    products.forEach(product=>{const key=stockCategory(product);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(product);});
    const labels={bubur:{name:"Stok Awal Bubur",unit:"Cup",help:"Total seluruh cup bubur. Tidak dipisah menurut varian penjualan."},puding:{name:"Stok Awal Puding",unit:"Cup",help:"Total seluruh cup puding. Tidak dipisah menurut ukuran kemasan."}};
    const summary=preparation||{};
    return [...buckets.entries()].map(([key,items])=>{
      const canonical=[...items].sort((a,b)=>Number(a.konversiStok)-Number(b.konversiStok))[0];
      let qty=0;
      if(key==="bubur") qty=Number(summary.stokAwalBubur ?? items.reduce((n,x)=>n+Number(x.jumlahStokAwal||0),0))||0;
      else if(key==="puding") qty=Number(summary.stokAwalPuding ?? items.reduce((n,x)=>n+Number(x.jumlahStokAwal||0),0))||0;
      else qty=Number(items[0].jumlahStokAwal)||0;
      return {key,items,canonical,qty,label:labels[key]?.name||items[0].namaProduk,unit:labels[key]?.unit||items[0].satuanStok||"Satuan",help:labels[key]?.help||`${items[0].kategoriStok||"Produk"} · Konversi stok ${items[0].konversiStok}`};
    });
  }
  async function loadStockPreparation() {
    const user=window.currentNahyezUser; if(!user || user.role!=="OWNER") return;
    const select=$("stockOutletSelect"), wrap=$("stockOutletWrap");
    wrap.classList.remove("hidden");
    try {
      if(!ownerOutletList.length) { const r=await NahyezAPI.getActiveOutlets(); ownerOutletList=r.outlet||[]; }
      const prior=select.value; select.innerHTML='<option value="">-- Pilih outlet --</option>';
      ownerOutletList.forEach(o=>{const op=document.createElement("option");op.value=o.outletId;op.textContent=o.namaOutlet;select.appendChild(op);});
      if(prior && ownerOutletList.some(o=>o.outletId===prior)) select.value=prior;
    } catch(e) { stockStatus(e.message||"Gagal memuat outlet.","error"); return; }
    if(!select.value) { $("stockMeta").textContent="Pilih outlet untuk memuat persiapan hari ini."; $("stockEntryList").replaceChildren(); $("saveStockPreparationButton").disabled=true; return; }
    const outletId=select.value;
    $("saveStockPreparationButton").disabled=true;
    $("stockMeta").textContent="Memuat persiapan stok hari ini...";
    try {
      const r=await NahyezAPI.getDailyPreparation(outletId);
      stockProducts=r.produk||[];
      $("stockMeta").textContent=`Outlet: ${(ownerOutletList.find(o=>o.outletId===outletId)||{}).namaOutlet||outletId} · Tanggal: ${r.tanggal} (WIB)`;
      $("changeFundInput").value=r.persiapan?Number(r.persiapan.modalKembalian)||0:0;
      stockEntryGroups=buildStockEntryGroups(stockProducts,r.persiapan);
      const host=$("stockEntryList");host.replaceChildren();
      stockEntryGroups.forEach(group=>{
        const row=document.createElement("div");row.className="product-entry stock-entry-row";row.dataset.groupKey=group.key;
        row.innerHTML='<div class="product-entry-main"><strong></strong><small></small></div><div><label></label><input class="stock-qty-input" type="number" min="0" step="1" inputmode="numeric"></div>';
        row.querySelector("strong").textContent=group.label;
        row.querySelector("small").textContent=group.help;
        row.querySelector("label").textContent=`Stok awal (${group.unit})`;
        row.querySelector("input").value=group.qty;
        host.appendChild(row);
      });
      const saved = Boolean(r.tersimpan && r.persiapan);
      stockStatus(saved ? "Persiapan hari ini sudah tersimpan dan dikunci. Nilai stok awal serta modal kembalian ditampilkan sebagai ringkasan." : "Belum ada persiapan hari ini. Silakan isi stok awal dan modal kembalian.", saved ? "success" : "warning");
      document.querySelectorAll("#stockEntryList .stock-qty-input").forEach(input => { input.disabled = saved; });
      $("changeFundInput").disabled = saved;
      $("saveStockPreparationButton").classList.toggle("hidden", saved);
      $("saveStockPreparationButton").disabled = saved || !stockEntryGroups.length;
      if (saved) $("saveStockPreparationButton").querySelector("span").textContent = "Persiapan Sudah Tersimpan";
      else $("saveStockPreparationButton").querySelector("span").textContent = "Simpan Stok Awal & Modal";
    } catch(e) { stockStatus(e.message||"Gagal memuat persiapan harian.","error"); $("stockMeta").textContent="Persiapan gagal dimuat."; }
  }
  async function saveStockPreparation() {
    const user=window.currentNahyezUser;if(!user||user.role!=="OWNER"||!stockEntryGroups.length)return;
    const modal=Number($("changeFundInput").value);
    if(!Number.isSafeInteger(modal)||modal<0){stockStatus("Modal kembalian harus berupa angka Rupiah bulat minimal 0.","error");return;}
    const daftarStok=stockProducts.map(p=>({produkId:p.produkId,jumlahStokAwal:0}));
    let invalid=false;
    document.querySelectorAll("#stockEntryList .stock-entry-row").forEach(row=>{
      const group=stockEntryGroups.find(g=>g.key===row.dataset.groupKey);const qty=Number(row.querySelector("input").value);
      if(!group||!Number.isSafeInteger(qty)||qty<0){invalid=true;return;}
      // Satu nilai total cup disimpan pada satu produk representatif kategori;
      // PersiapanHarian menyimpan total kategori yang dipakai untuk saldo stok.
      const target=daftarStok.find(x=>x.produkId===group.canonical.produkId);if(target)target.jumlahStokAwal=qty;else invalid=true;
    });
    if(invalid){stockStatus("Seluruh stok harus berupa bilangan bulat 0 atau lebih.","error");return;}
    const outletId=$("stockOutletSelect").value;if(!outletId){stockStatus("Pilih outlet terlebih dahulu.","warning");return;}
    const btn=$("saveStockPreparationButton");btn.disabled=true;btn.querySelector("span").textContent="Menyimpan...";stockStatus("Menyimpan stok awal dan modal kembalian secara bersamaan...");
    try {const r=await NahyezAPI.saveDailyPreparation({outletId,modalKembalian:modal,daftarStok});stockStatus(`${r.pesan} ${r.jumlahProduk} baris produk tersimpan; stok bubur dan puding dicatat sebagai total cup.`,"success");await loadStockPreparation();}
    catch(e){stockStatus(e.message||"Gagal menyimpan persiapan.","error");}
    finally{ /* reload mengatur status kunci form */ }
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
