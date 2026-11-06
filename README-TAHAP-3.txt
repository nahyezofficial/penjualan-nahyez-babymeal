NAHYEZ BABY MEAL - FRONTEND V2.4
Perubahan dari V2.3:
- Menambahkan pemanggilan GET /api/laporan/harian/detail.
- Ketika membuka Draft yang sudah ada, form memuat kembali jumlah terjual dan gratis yang tersimpan.
- Tombol simpan dapat digunakan untuk memperbarui detail Draft setelah data lama berhasil dimuat.
- Harga dan validasi omzet tetap ditangani backend.

KOMPATIBILITAS
Frontend ini memerlukan backend Tahap 3 yang menyediakan endpoint baca detail:
GET /api/laporan/harian/detail?laporanId=<LaporanID>

Jangan pasang frontend V2.4 sebelum backend Tahap 3 dideploy. Simpan backup versi frontend sebelumnya.
