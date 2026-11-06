NAHYEZ BABY MEAL — FRONTEND V2.5 (SIDEBAR FOUNDATION)

ISI PAKET
- index.html
- assets/css/style.css
- assets/js/app.js
- assets/js/api.js
- assets/js/config.js
- assets/images/*

PERUBAHAN
1. Menambahkan kerangka sidebar dengan urutan menu:
   Dashboard
   Input Stok Awal & Modal Kembalian
   Input Laporan
   Resume Laporan
   Pengaturan
2. Navigasi halaman berfungsi pada desktop dan mobile.
3. Modul yang belum mempunyai API ditandai jelas sebagai BELUM AKTIF.
4. Login Owner/Crew dan API existing dipertahankan.
5. Area input laporan lama dipindahkan ke menu Input Laporan.
6. Area komponen pembayaran/piutang disediakan sebagai placeholder nonaktif.

PENTING
Ini adalah paket fondasi navigasi UI, BUKAN versi produksi formulir laporan terpadu.
Jangan deploy sebagai pengganti frontend aktif untuk operasional harian.
Alasan: backend saat ini baru mendukung pembuatan/pembacaan Draft dan simpan/baca rincian produk. Belum tersedia API tervalidasi untuk transaksi QRIS/transfer, piutang, pembayaran piutang, stok awal, modal kembalian, transfer stok, perhitungan sisa stok, dan finalisasi.

Tidak ada perubahan pada backend, spreadsheet, data harga, atau riwayat laporan.

VALIDASI
- app.js: node --check lulus
- api.js: node --check lulus
- index.html: parsing dasar lulus

LANGKAH BERIKUTNYA
Bangun endpoint backend terpadu sesuai header sheet aktif yang sudah diverifikasi, lalu hubungkan satu tombol Submit Draft. Finalisasi tetap nonaktif sampai semua komponen dan validasi server tersedia.
