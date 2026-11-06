NAHYEZ BABY MEAL FRONTEND V2.6 — PENGATURAN TARIF OPERASIONAL

Isi paket ini berbasis Frontend V2.5 Sidebar Foundation. Perubahan:
- Menambahkan tampilan Pengaturan > Tarif Operasional.
- Owner dapat membaca dan menyimpan tarif bensin per outlet melalui GET/POST /api/pengaturan/bensin-outlet.
- Owner dapat membaca dan menyimpan tarif enam rute melalui GET/POST /api/pengaturan/rute.
- Nama outlet dicocokkan dari endpoint Master Absensi.
- Crew tidak melihat menu Pengaturan.
- Nilai kosong ditampilkan sebagai belum dikonfigurasi; penyimpanan mewajibkan semua baris diisi angka Rupiah bulat >= 0.

PERSYARATAN:
Backend Tahap 6B harus sudah terpasang di Apps Script dan Cloudflare Worker. API_BASE_URL pada assets/js/config.js harus tetap menunjuk Worker produksi yang benar.

PEMASANGAN:
1. Backup repository frontend aktif.
2. Ekstrak ZIP dan unggah seluruh isi folder v26 ke repository GitHub Pages (pertahankan struktur assets).
3. Pastikan config.js tetap memakai URL Worker yang sekarang.
4. Login sebagai Owner > Pengaturan.
5. Uji muat tarif, isi nominal, simpan, refresh halaman, dan pastikan nilai tetap terbaca.
6. Login sebagai Crew untuk memastikan menu Pengaturan tidak tampil.

CATATAN:
Paket ini hanya mengaktifkan UI pengaturan tarif. Belum mengintegrasikan tarif ke perhitungan Daily Fee/Submit Draft terpadu. Perubahan tarif belum otomatis membuat snapshot pada laporan; snapshot akan diimplementasikan pada tahap transaksi. Belum ada deployment atau pengujian langsung terhadap akun produksi.
