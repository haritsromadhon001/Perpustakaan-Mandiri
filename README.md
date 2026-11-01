# 📚 Perpustakaan Mandiri — Ruang Baca & Koleksi Buku Digital

[![Deploy with Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://perpustakaan-mandiri.vercel.app)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20Cloud-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Theme](https://img.shields.io/badge/Theme-Monochrome%20%7C%20Notion%20Aesthetic-black?style=flat)](#-tema-warna-eye-comfort)
[![WhatsApp Help](https://img.shields.io/badge/Support-WhatsApp%20085711092611-25D366?style=flat&logo=whatsapp)](https://wa.me/6285711092611)

Selamat datang di **Perpustakaan Mandiri** — platform perpustakaan digital pribadi modern yang dirancang untuk mengelola koleksi buku fisik maupun buku digital (PDF), membundel buku berseri ke dalam folder interaktif di semua bidang, mengatur jadwal membaca ala Notion, serta tersinkronisasi otomatis secara **real-time** antara Laptop dan Smartphone (HP) tanpa perlu menjalankan server lokal.

🌐 **Website Live / Production:** [https://perpustakaan-mandiri.vercel.app](https://perpustakaan-mandiri.vercel.app)

---

## 🌟 Fitur Utama Website

### 1. 📁 Folder & Seri Koleksi Buku Universal (Semua Bidang)
Mengelompokkan buku bersambung, buku berjilid, materi multi-volume, atau seri tutorial ke dalam satu kartu folder elegan sehingga rak buku tetap bersih dan rapi tanpa perlu mencari satu per satu lewat kolom pencarian:
- **Universal untuk Semua Kategori**:
  - 💻 **Network Engineer**: Membundel materi sertifikasi & teknis seperti *Cisco CCNA Official Guide Vol 1 & Vol 2*, seri *CompTIA Network+*, panduan *Linux Administration Part 1–3*, dsb. Menggunakan aksen biru modern safir dan penomoran otomatis `Vol`.
  - 🕌 **Keagamaan**: Mengelompokkan kitab berjilid-jilid tebal seperti *Shahih Al-Bukhari Jilid 1–5*, *Tafsir Ibnu Katsir*, *Fathul Bari*, *Riyadhus Shalihin*, dsb. Menggunakan aksen hijau zamrud dan penomoran otomatis `Jilid`.
  - 📚 **Lainnya**: Cocok untuk novel berseri (*Harry Potter*, *Bumi Manusia*), ensiklopedia, atau buku umum. Menggunakan aksen amber/warm dan penomoran `Buku/Vol`.
- **Navigasi Folder Terpadu**: Klik kartu folder untuk membuka tampilan khusus berisi daftar volume yang tersusun rapi secara berurutan, statistik persentase kelulusan baca koleksi, total halaman, serta tombol **`+ Tambah Vol/Jilid Baru`** yang langsung mengisi nama folder dan nomor volume berikutnya secara otomatis.
- **Pencarian Pintar**: Kotak pencarian di rak buku dapat menemukan buku baik melalui judul, penulis, nama seri/folder, maupun urutan jilid/vol.

---

### 2. 📖 Rak Buku & Pembaca PDF Internal
- **Pilihan Tampilan Rak Fleksibel**:
  - **Rak Grid**: Tata letak kartu buku 3D yang estetik dengan simulasi tumpukan (*stack layer*).
  - **Dua Kolom (Belum vs Sudah Selesai)**: Memisahkan buku/folder yang sedang dibaca dan yang telah selesai secara berdampingan.
- **Filter Kategori Instan**: Tombol filter cepat untuk *Semua*, *Network Engineer*, *Keagamaan*, dan *Lainnya* disertai indikator jumlah koleksi aktif.
- **Pembaca PDF Bawaan (Internal Reader)**: Membaca file PDF langsung di dalam peramban tanpa aplikasi pihak ketiga, didukung opsi layar penuh, unduh berkas, dan buka di tab baru.
- **Pelacak Kemajuan Membaca**: Bilah progres (*Progress Bar*), input nomor halaman terakhir yang sedang dibaca, serta tombol sekali klik untuk menandai buku telah selesai dibaca.
- **Formulir Responsif & Nyaman**: Jendela modal tambah/edit buku didesain dengan navigasi gulir (*scrolling*) adaptif pada smartphone dan laptop, memastikan tombol aksi di bagian bawah selalu mudah dijangkau.

---

### 3. 🔐 Portal Login & Manajemen Akun
Sebelum masuk ke dashboard, pengguna disajikan halaman portal login yang bersih dan intuitif:
- **Akun Google (Email) & Password:** Input kredensial yang bersih tanpa nilai bawaan (*hardcoded*).
- **Continue to Google:** Tombol akses cepat satu klik dengan integrasi akun Google.
- **Lewati & Masuk tanpa Akun (Mode Tamu):** Pengunjung dapat melewati login untuk langsung membaca koleksi, di mana nama akun tidak akan ditampilkan di dashboard.
- **Pencatatan Otomatis ke Spreadsheet Cloud (`accounts_spreadsheet.csv`):** Setiap akun dan kata sandi yang digunakan secara otomatis dicatat ke file spreadsheet CSV di Supabase Storage publik. Jika pengguna lupa akun/password, admin dapat membuka file tersebut untuk mengirimkan ulang data akun.
- **Bantuan WhatsApp Admin (`085711092611`):** Tautan langsung yang membuka WhatsApp admin dengan template pesan pemulihan akun otomatis.
- **Logout (Keluar Akun):** Tombol keluar akun yang mudah diakses di header laptop, dropdown profil HP, dan bilah navigasi.

---

### 4. ⚡ Sinkronisasi Real-Time Otomatis (Laptop & HP)
- Berjalan di atas **Supabase Cloud Database & Storage**.
- **Tanpa Tombol Sinkronisasi Manual:** Setiap kali Anda menambahkan buku PDF, memperbarui nomor halaman, atau menyusun jadwal membaca di laptop, perubahan tersebut **langsung otomatis muncul di smartphone (HP)** secara bersamaan (*real-time postgres changes*), layaknya aplikasi cloud modern.
- File PDF diunggah ke *storage bucket* cloud dengan tautan publik yang aman dan dapat diakses cepat dari berbagai perangkat.
- **Fallback Triple-Engine:** Jika koneksi jaringan mengalami gangguan, aplikasi tetap berfungsi lancar memanfaatkan IndexedDB lokal di browser.

---

### 5. 🎨 Tema Warna Eye-Comfort & Notion Aesthetic
Secara bawaan (*default*), tampilan website menggunakan tema **Hitam dan Putih (Monokrom)** yang minimalis, tajam, dan elegan:
- **Hitam & Putih (Default):** Estetika Notion monokromatis bersih dengan kontras tinggi.
- **Malam Teduh (OLED Dark):** Mengurangi emisi cahaya biru untuk kenyamanan membaca di malam hari.
- **Krem Kertas Alami (Parchment Warm):** Nuansa hangat menyerupai tekstur kertas buku fisik klasik.
- **Hijau Sage Lembut (Sage Calm):** Menyejukkan dan mencegah kelelahan mata pada sesi membaca panjang.
- **Kopi Hangat (Warm Mocha):** Nuansa sepia klasik yang hangat dan tenang.

---

### 6. 📅 Jadwal & Target Baca Buku Ala Notion
- Papan Kanban interaktif dengan 3 kolom status: **Rencana**, **Sedang Berjalan**, dan **Selesai**.
- Pengaturan target halaman per sesi, tanggal, jam pengingat, dan catatan penting.
- Tampilan responsif dan ringkas di smartphone.

---

### 7. 💬 Evaluasi & Kutipan Motivasi Pembaca
Tersedia ruang refleksi yang memuat kutipan-kutipan inspiratif dari tokoh dunia beserta makna mendalamnya:
1. **Nelson Mandela** — *“Pendidikan adalah senjata paling ampuh yang dapat kamu gunakan untuk mengubah dunia.”*
2. **Benjamin Franklin** — *“Investasi dalam pengetahuan memberikan bunga terbaik.”*
3. **Calvin Coolidge** — *“Nothing in this world can take the place of persistence.”*
4. **Michael Jordan** — *“I've failed over and over and over again in my life. And that is why I succeed.”*
5. **James Clear** — *“You do not rise to the level of your goals. You fall to the level of your systems.”*

---

## 🛠️ Arsitektur Teknologi

| Komponen | Teknologi yang Digunakan |
| :--- | :--- |
| **Hosting & Deployment** | [Vercel](https://vercel.com) (Serverless & Global Edge CDN) |
| **Cloud Database** | [Supabase](https://supabase.com) (PostgreSQL Database) |
| **Cloud Storage** | Supabase Storage (`books-pdf` bucket) |
| **Realtime Engine** | Supabase Realtime Channels (`postgres_changes`) |
| **Frontend Framework** | Vanilla JavaScript (ES6+), HTML5, CSS3 Variables |
| **Styling & Icons** | Tailwind CSS, Lucide Icons, Google Fonts (*Plus Jakarta Sans* & *Merriweather*) |
| **Offline Fallback** | IndexedDB Browser API (Bekerja otomatis saat luring) |

---

## 📂 Struktur Berkas Proyek

```text
Website_Perpustakaan Mandiri/
│
├── index.html               # Halaman antarmuka utama (Portal Login, Dashboard, Rak Buku, Modal Folder, Jadwal, Evaluasi)
├── style.css                # Sistem tema warna (Monokrom, Dark, Krem, Sage, Mocha) & efek 3D kartu buku/folder
├── app.js                   # Inti logika aplikasi, Supabase Realtime, Universal Folder Engine, & PDF Reader
├── favicon.svg              # Ikon logo resmi aplikasi Perpustakaan Mandiri
├── vercel.json              # Konfigurasi routing & header cache-control deployment Vercel
├── README.md                # Dokumentasi resmi proyek
│
├── data/
│   └── library.json         # Cadangan skema data lokal
└── uploads/                 # Direktori penyimpanan berkas PDF lokal
```

---

## 📱 Akses Multi-Device (Laptop & Smartphone)

1. Buka tautan resmi: **[https://perpustakaan-mandiri.vercel.app](https://perpustakaan-mandiri.vercel.app)** pada peramban Laptop atau HP Anda.
2. Masukkan **Akun Google (Email)** dan kata sandi Anda, atau klik tombol **Continue to Google**.
3. Bagi pengunjung yang ingin mencoba langsung, klik **Lewati & Masuk tanpa Akun**.
4. Semua penambahan buku PDF, pengelompokan folder, perubahan halaman, atau jadwal baca yang Anda lakukan di satu perangkat akan langsung tersinkronisasi di perangkat lainnya dalam hitungan detik.

---

## 📞 Kontak & Bantuan

Jika Anda lupa akun, kata sandi, atau memerlukan bantuan teknis:
- **Admin:** Harits Romadhon
- **WhatsApp:** [085711092611](https://wa.me/6285711092611?text=Halo%20Admin%20Perpustakaan%20Mandiri%2C%20saya%20ingin%20menanyakan%20akun%20saya.)
- **Repository:** [github.com/haritsromadhon001/Perpustakaan-Mandiri](https://github.com/haritsromadhon001/Perpustakaan-Mandiri)
