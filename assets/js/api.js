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
        LOGIN_KARYAWAN_GAGAL: "Login karyawan gagal. Coba kembali."
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
    logout: () => request("/logout", { method: "POST" }),
    saveToken: token => sessionStorage.setItem(TOKEN_KEY, token),
    clearToken: () => sessionStorage.removeItem(TOKEN_KEY),
    hasToken: () => Boolean(sessionStorage.getItem(TOKEN_KEY))
  };
})();
