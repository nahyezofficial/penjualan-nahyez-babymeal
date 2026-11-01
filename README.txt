FRONTEND PENJUALAN NAHYEZ BABY MEAL - VERSI 1

Isi:
- Login Owner (username + password)
- Login Karyawan (QR Token manual atau scan kamera jika browser mendukung BarcodeDetector)
- Pemulihan sesi dan logout
- Tampilan dashboard awal berdasarkan profil login
- Sesi disimpan di sessionStorage dan token QR tidak disimpan

PENTING:
1. File ini hanya frontend. Tidak ada password, QR Token, HMAC Secret,
   OWNER_SETUP_TOKEN, atau TEST_ACCESS_TOKEN di dalam paket.
2. API diarahkan ke Cloudflare Worker yang sudah digunakan:
   https://nahyez-penjualan-api.nahyez-babymeal.workers.dev
3. Sebelum login dari GitHub Pages, Worker perlu diperbarui dengan paket
   CORS terpisah.
4. Upload seluruh isi folder frontend ke root repository GitHub:
   penjualan-nahyez-babymeal
   Pastikan index.html berada langsung di root repository.
5. Setelah commit, tunggu GitHub Pages selesai deploy lalu buka:
   https://nahyezofficial.github.io/penjualan-nahyez-babymeal/

CATATAN:
Dashboard pada versi ini adalah kerangka awal. Modul transaksi/penjualan
belum dibuat karena alur dan kolom transaksi akan disusun pada tahap berikutnya.
