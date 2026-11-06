FRONTEND PENJUALAN NAHYEZ BABY MEAL - VERSI 2

Perubahan versi 2:
1. Logo N diganti dengan logo resmi Nahyez Baby Meal dari pengguna.
2. Headline banner login menjadi "Laporan Penjualan Harian".
3. Ilustrasi bahan makanan tersebar secara acak pada panel banner login.
4. Overlay loading dengan logo dan spinner saat proses login.
5. Istilah Karyawan diganti menjadi Crew pada UI.
6. QR kamera otomatis memproses login setelah QR terbaca, tanpa klik tombol login lagi.

Pemasangan:
- Ekstrak ZIP.
- Upload seluruh isi folder ke root repository GitHub Pages.
- Timpa file index.html, README.txt, assets/css/style.css, assets/js/app.js,
  dan tambahkan assets/images/logo-nahyez.png serta food-doodles.png.
- Pertahankan assets/js/config.js dan assets/js/api.js yang sudah ada; keduanya
  tetap disertakan dalam paket dan tidak mengubah endpoint API.
- Commit changes, tunggu GitHub Pages selesai deploy, lalu refresh halaman.

API tetap menggunakan Cloudflare Worker yang sudah diuji CORS.
Tidak ada perubahan Worker, Apps Script, sesi, maupun data akun.


PATCH V2.1:
- Label kartu JENIS AKSES untuk akun Crew ditampilkan sebagai "Karyawan"
  agar konsisten dengan istilah pada master absensi.
- ID PENGGUNA membaca properti profil idKaryawan (fallback: id).
- Perubahan hanya pada label dan pembacaan tampilan frontend.
- Tidak mengubah role internal KARYAWAN, ID karyawan, Apps Script,
  Worker, QR Token, sesi, atau data master absensi.


PATCH V2.2 — MODUL OWNER BUAT DRAFT LAPORAN
1. Menambahkan panel "Buat Laporan Harian" khusus role OWNER.
2. Daftar outlet aktif dimuat dari endpoint GET /api/outlet/aktif
   (sumber data Master Absensi).
3. Owner memilih outlet, lalu frontend memeriksa laporan hari ini melalui
   GET /api/laporan/harian/hari-ini?outletId=...
4. Owner dapat membuat Draft melalui POST /api/laporan/harian dengan outletId.
5. Jika laporan sudah ada, tombol pembuatan dinonaktifkan; backend tetap menjadi
   pengaman utama anti-duplikasi outlet + tanggal.
6. Crew tetap tidak mendapatkan panel Owner; tampilan Crew menampilkan kartu
   informasi modul yang akan dilanjutkan.

Catatan:
- Fitur ini membuat Draft Laporan Harian saja. Form input rincian penjualan,
  produk, pembayaran, biaya, stok, dan finalisasi belum ditambahkan karena
  endpoint backend untuk menyimpan rincian tersebut belum menjadi bagian
  dari versi backend yang sedang digunakan.
- Tanggal laporan selalu ditentukan backend dalam zona Asia/Jakarta (WIB).
- Tidak mengubah login, QR, sesi, CORS, konfigurasi API, atau aset logo.
- Sebelum deploy, backup file frontend lama.


PATCH V2.3 — WORKSPACE RINCIAN PRODUK (INTEGRASI FRONTEND TAHAP 2)
1. Menambahkan workspace input jumlah produk terjual dan gratis pada laporan Draft.
2. Owner membuka workspace setelah memilih outlet dan membuat Draft.
3. Crew memeriksa laporan hari ini; bila belum ada, frontend meminta backend membuat Draft untuk outlet Crew.
4. Daftar produk dan harga diambil dari GET /api/produk-harga. Untuk Owner, outletId dikirim sebagai query; untuk Crew, outlet berasal dari sesi Worker.
5. Penyimpanan menggunakan POST /api/laporan/harian/detail dengan hanya produkId, jumlahTerjual, jumlahGratis.
6. Estimasi omzet pada layar hanya pratinjau; backend menghitung ulang harga dan omzet.
7. Input gratis hanya diaktifkan di UI untuk nama produk Bubur Bayi Full Cup dan Puding 1 Cup; backend tetap memvalidasi.
8. Jika membuka Draft yang sudah ada dari sesi/halaman sebelumnya, tombol simpan dinonaktifkan. Ini langkah pengaman karena endpoint baca-detail tersimpan belum tersedia; mencegah rincian lama tertimpa oleh form kosong.
9. Pembayaran, utang, Daily Fee, biaya, stok awal, setoran tunai, dan finalisasi belum ada di frontend.

PENTING:
- Paket frontend ini membutuhkan Cloudflare Worker dan Apps Script backend Tahap 2 yang sudah disediakan sebelumnya.
- Jangan deploy sebelum backend Tahap 2 dipasang dan diuji di staging.
- Untuk membuka kembali dan mengedit rincian Draft yang sudah tersimpan, perlu endpoint baca-detail pada backend (belum termasuk patch ini).
- Backup repository aktif sebelum upload.
