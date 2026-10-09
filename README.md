# 📚 Perpustakaan Mandiri (Personal Digital Library & Reading Tracker)

Selamat datang di **Perpustakaan Mandiri** — aplikasi website personal yang dirancang khusus untuk Anda yang ingin memiliki rak buku digital yang luas, rapi, dan mudah dikelola tanpa perlu repot dengan konfigurasi teknis yang rumit.

Aplikasi ini dibuat dengan pendekatan **Zero-Dependency & Offline-First**, artinya dapat langsung dijalankan di komputer Windows Anda tanpa perlu menginstal Node.js, database berat, atau dependensi tambahan.

---

## ✨ Fitur Utama

1. **🌟 Landing Page ("Perpustakaan Mandiri")**
   - Halaman depan berpenampilan hangat dan modern layaknya perpustakaan pribadi klasik.
   - Ringkasan cepat statistik koleksi buku.
   - Sorotan buku unggulan di rak.

2. **📖 Dashboard & Rak Buku Digital**
   - **Kategori Terstruktur**:
     - 🕌 **Buku Keagamaan** (Kitab, Hadits, Fiqih, Sirah, dll.)
     - 💻 **Buku Network Engineer** (Jaringan Komputer, Cisco CCNA, MikroTik, Linux, dll.)
     - 📚 Kategori Kustom / Lainnya
   - **Kartu Buku Estetis (3D Spine Effect)**: Menampilkan judul, penulis, jumlah halaman, dan persentase kemajuan baca.
   - **Pencarian & Filter Instan**: Cari berdasarkan judul/penulis atau filter berdasarkan status (*Belum Dibaca*, *Sedang Dibaca*, *Selesai*).

3. **📄 Manajemen & Pembaca PDF Terintegrasi**
   - Unggah (*upload*) berkas buku dalam format PDF.
   - Berkas PDF disimpan langsung di database peramban Anda (**IndexedDB**) sehingga tidak akan hilang saat halaman direfresh.
   - **Internal PDF Reader**: Baca langsung file PDF di dalam jendela popup, buka di tab baru, atau unduh kembali kapan saja.

4. **📊 Total Buku & Statistik Otomatis**
   - Penghitung (*counter*) real-time: Total Buku, Total Buku Keagamaan, Total Buku Network Engineer, dan Jumlah File PDF yang siap dibaca.

5. **🗓️ Jadwal Baca Ala Notion (Habit & Reading Planner)**
   - **Papan Kanban (Board View)**: Kolom *📋 Rencana Baca*, *📖 Sedang Berjalan*, dan *✅ Selesai*.
   - **Tampilan Tabel (List View)**: Ringkasan agenda membaca yang rapi.
   - Fitur checklist selesai baca, target halaman (misal: "Hal 1 - 35"), tanggal tenggat, dan catatan sesi.

6. **💾 Cadangkan & Pulihkan Data (Backup / Restore)**
   - Ekspor seluruh daftar buku dan jadwal baca ke file JSON.
   - Pulihkan data kapan saja hanya dengan sekali klik.

---

## 🚀 Cara Menjalankan Website

Anda memiliki 2 cara yang sangat mudah untuk membukanya:

### Cara 1: Menggunakan File Peluncur (Sangat Disarankan)
1. Buka folder, contoh di file yang dimiliki oleh author `c:\Users\Harits\Documents\Website_Perpustakaan Mandiri`.
2. Klik dua kali pada file **`jalankan_perpustakaan.bat`**.
3. Peramban web (Google Chrome / Edge) Anda akan langsung terbuka secara otomatis di alamat `http://localhost:8000`.

### Cara 2: Membuka Langsung File HTML
1. Buka folder proyek.
2. Klik dua kali file **`index.html`** untuk langsung membukanya di browser Anda.

---

## 📂 Struktur Berkas Proyek

```
Website_Perpustakaan Mandiri/
│
├── index.html               # Struktur antarmuka (Landing page, Dashboard, Modal PDF & Notion)
├── style.css                # Desain visual, efek 3D sampul buku, dan palet Notion
├── app.js                   # Logika aplikasi, IndexedDB storage, PDF handler & jadwal baca
├── server.py                # Server lokal Python ringan (otomatis membuka browser)
├── jalankan_perpustakaan.bat# Pintasan sekali klik untuk pengguna Windows
└── README.md                # Panduan lengkap penggunaan
```

---

## 💡 Tips untuk Pemula

- **Menambah Buku Baru**: Klik tombol **"+ Tambah Buku PDF"** di pojok kanan atas, isi judul, penulis, pilih kategori (*Keagamaan* atau *Network Engineer*), lalu pilih file PDF dari laptop Anda.
- **Membaca Buku**: Di rak buku, klik tombol **"Baca PDF"** untuk langsung membaca tanpa membuka aplikasi lain.
- **Mengatur Jadwal**: Masuk ke menu **"Jadwal Baca"**, lalu klik **"Buat Jadwal Baru"** untuk menentukan target membaca harian atau mingguan Anda.
