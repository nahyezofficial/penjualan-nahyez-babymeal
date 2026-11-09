(() => {
  const base = window.NAHYEZ_CONFIG.API_BASE_URL.replace(/\/+$/, "");
  const TOKEN_KEY = "nahyez_penjualan_session";

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token && options.auth !== false) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${base}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store"
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("Respons server tidak dapat dibaca."); }
    if (!response.ok || data.success !== true) {
      const messages = {
        LOGIN_GAGAL: "Username atau password tidak sesuai.",
        QR_TIDAK_DITEMUKAN: "QR Token tidak ditemukan atau sudah tidak aktif.",
        QR_TIDAK_VALID: "Format QR Token tidak valid.",
        SESI_TIDAK_VALID_ATAU_KEDALUWARSA: "Sesi berakhir. Silakan masuk kembali.",
        LOGIN_KARYAWAN_GAGAL: "Login karyawan gagal. Coba kembali.",
        PERSIAPAN_HARIAN_WAJIB_DIISI: "Stok awal dan modal kembalian outlet harus disimpan Owner sebelum laporan dapat dikirim.",
        TARIF_BENSIN_OUTLET_BELUM_DIKONFIGURASI: "Tarif bensin outlet belum dikonfigurasi Owner.",
        TARIF_RUTE_BELUM_DIKONFIGURASI: "Tarif rute transfer belum dikonfigurasi Owner.",
        MAKSIMAL_DUA_TRANSFER_PER_HARI: "Maksimal dua transfer stok per outlet per hari.",
        LAPORAN_SUDAH_DIKIRIM: "Laporan ini sudah disubmit. Pengiriman kedua ditolak untuk mencegah data ganda.",
        STOK_TIDAK_CUKUP_BUBUR: "Stok bubur tidak mencukupi. Periksa stok awal dan pengambilan stok.",
        STOK_TIDAK_CUKUP_PUDING: "Stok puding tidak mencukupi. Periksa stok awal dan pengambilan stok.",
        STOK_TIDAK_CUKUP_NASITIM: "Stok nasi tim tidak mencukupi. Periksa stok awal dan pengambilan stok.",
        STOK_TIDAK_CUKUP_OATMEAL: "Stok oatmeal tidak mencukupi. Periksa stok awal dan pengambilan stok.",
        STOK_TIDAK_CUKUP_ABON: "Stok abon tidak mencukupi. Periksa stok awal dan pengambilan stok."
      };
      throw new Error(messages[data.error] || data.pesan || data.error || "Permintaan gagal.");
    }
    return data;
  }

  window.NahyezAPI = {
    loginOwner: (username, password) => request("/login-owner", {
      method: "POST", auth: false, body: { username, password }
    }),
    loginStaff: qrToken => request("/login-karyawan", {
      method: "POST", auth: false, body: { qrToken }
    }),
    getSession: () => request("/session"),
    getActiveOutlets: () => request("/api/outlet/aktif"),
    getDailyPreparation: outletId => request(`/api/persiapan-harian${outletId ? `?outletId=${encodeURIComponent(outletId)}` : ""}`),
    saveDailyPreparation: data => request("/api/persiapan-harian", { method: "POST", body: data }),
    getOutletFuelSettings: () => request("/api/pengaturan/bensin-outlet"),
    saveOutletFuelSettings: daftarTarif => request("/api/pengaturan/bensin-outlet", { method: "POST", body: { daftarTarif } }),
    getRouteFuelSettings: () => request("/api/pengaturan/rute"),
    saveRouteFuelSettings: daftarTarif => request("/api/pengaturan/rute", { method: "POST", body: { daftarTarif } }),
    getProductPrices: outletId => request(`/api/produk-harga${outletId ? `?outletId=${encodeURIComponent(outletId)}` : ""}`),
    getTransactionReference: outletId => request(`/api/transaksi/referensi${outletId ? `?outletId=${encodeURIComponent(outletId)}` : ""}`),
    addTransactionCustomer: data => request("/api/transaksi/pelanggan", {method:"POST",body:data}),
    previewIntegratedReport: data => request("/api/laporan/harian/terpadu/preview", { method:"POST", body:data }),
    submitIntegratedReport: data => request("/api/laporan/harian/terpadu/submit", { method:"POST", body:data }),
    getReportDetails: laporanId => request(`/api/laporan/harian/detail?laporanId=${encodeURIComponent(laporanId)}`),
    saveReportDetails: (laporanId, daftarProduk) => request("/api/laporan/harian/detail", {
      method: "POST", body: { laporanId, daftarProduk }
    }),
    getTodayReport: outletId => request(`/api/laporan/harian/hari-ini?outletId=${encodeURIComponent(outletId)}`),
    createDailyReport: outletId => request("/api/laporan/harian", {
      method: "POST", body: { outletId }
    }),
    logout: () => request("/logout", { method: "POST" }),
    saveToken: token => sessionStorage.setItem(TOKEN_KEY, token),
    clearToken: () => sessionStorage.removeItem(TOKEN_KEY),
    hasToken: () => Boolean(sessionStorage.getItem(TOKEN_KEY))
  };
})();
