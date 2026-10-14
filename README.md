# 📚 Perpustakaan Mandiri — Ruang Baca & Koleksi Buku Digital

[![Deploy with Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://perpustakaan-mandiri.vercel.app)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20Cloud-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Theme](https://img.shields.io/badge/Theme-Monochrome%20%7C%20Notion%20Aesthetic-black?style=flat)](#-tema-warna-eye-comfort)
[![WhatsApp Help](https://img.shields.io/badge/Support-WhatsApp%20085711092611-25D366?style=flat&logo=whatsapp)](https://wa.me/6285711092611)

Selamat datang di **Perpustakaan Mandiri** — platform perpustakaan digital pribadi modern yang dirancang untuk mengelola koleksi buku fisik maupun buku digital (PDF), mengatur jadwal membaca ala Notion, serta tersinkronisasi otomatis secara **real-time** antara Laptop dan Smartphone (HP) tanpa perlu menjalankan server lokal.

🌐 **Website Live / Production:** [https://perpustakaan-mandiri.vercel.app](https://perpustakaan-mandiri.vercel.app)

---

## 🌟 Fitur Utama Website

### 1. 🔐 Portal Login & Manajemen Akun
Sebelum masuk ke dashboard, pengguna disajikan halaman portal login yang bersih dan intuitif:
- **Akun Google (Email) & Password:** Input kredensial yang bersih tanpa nilai bawaan (*hardcoded*).
- **Continue to Google:** Tombol akses cepat satu klik dengan integrasi akun Google.
- **Lewati & Masuk tanpa Akun (Mode Tamu):** Pengunjung dapat melewati login untuk langsung membaca koleksi, di mana nama akun tidak akan ditampilkan di dashboard.
- **Pencatatan Otomatis ke Spreadsheet Cloud (`accounts_spreadsheet.csv`):** Setiap akun dan kata sandi yang digunakan secara otomatis dicatat ke file spreadsheet CSV di Supabase Storage publik. Jika pengguna lupa akun/password, admin dapat membuka file tersebut untuk mengirimkan ulang data akun.
- **Bantuan WhatsApp Admin (`085711092611`):** Tautan langsung yang membuka WhatsApp admin dengan template pesan pemulihan akun otomatis.
- **Logout (Keluar Akun):** Tombol keluar akun yang mudah diakses di header laptop, dropdown profil HP, dan bilah navigasi.

### 2. ⚡ Sinkronisasi Real-Time Otomatis (Laptop & HP)
- Berjalan di atas **Supabase Cloud Database & Storage**.
- **Tanpa Tombol Sinkronisasi Manual:** Setiap kali Anda menambahkan buku PDF atau jadwal membaca di laptop, buku tersebut **langsung otomatis muncul di HP** secara bersamaan (*real-time postgres changes*), layaknya website internet modern pada umumnya.
- File PDF diunggah ke *storage bucket* cloud dengan tautan publik yang dapat dibaca di semua perangkat.

### 3. 🎨 Tema Hitam & Putih (Monokrom / Notion Aesthetic)
Secara bawaan (*default*), tampilan website menggunakan tema **Hitam dan Putih (Monokrom)** yang minimalis, tajam, dan elegan:
- **Hitam & Putih (Default):** Estetika Notion monokromatis bersih dengan kontras tinggi.
- **Malam Teduh (OLED Dark):** Mengurangi emisi cahaya biru untuk membaca malam hari.
- **Krem Kertas Alami (Parchment Warm):** Nuansa hangat menyerupai kertas buku fisik.
- **Hijau Sage Lembut (Sage Calm):** Menyejukkan dan mencegah mata cepat lelah.
- **Kopi Hangat (Warm Mocha):** Nuansa sepia klasik yang nyaman untuk sesi membaca panjang.

### 4. 📖 Rak Buku & Pembaca PDF Internal
- Tampilan kartu buku 3D dengan visual sampul buku dan kategori (*Keagamaan*, *Network Engineer*, *Lainnya*).
- **Pembaca PDF Bawaan:** Membaca file PDF langsung di dalam website tanpa perlu aplikasi pihak ketiga, lengkap dengan opsi unduh dan buka tab baru.
- Pelacak halaman membaca (*Progress Bar*) dan penanda status (Belum Dibaca, Sedang Dibaca, Selesai).

### 5. 📅 Jadwal & Target Baca Buku Ala Notion
- Papan Kanban interaktif dengan 3 kolom status: **Rencana**, **Sedang Berjalan**, dan **Selesai**.
- Pengaturan target halaman per sesi, tanggal, jam pengingat, dan catatan penting.
- Tampilan responsif dan ringkas di smartphone.

### 6. 💬 Evaluasi & Kutipan Motivasi Pembaca
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
├── index.html               # Halaman antarmuka utama (Portal Login, Dashboard, Rak Buku, Jadwal, Evaluasi)
├── style.css                # Sistem tema warna (Monokrom, Dark, Krem, Sage, Mocha) & gaya kartu 3D
├── app.js                   # Inti aplikasi, logika sinkronisasi Supabase Realtime, autentikasi, & PDF Reader
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
4. Semua penambahan buku PDF, perubahan halaman, atau jadwal baca yang Anda lakukan di satu perangkat akan langsung tersinkronisasi di perangkat lainnya dalam hitungan detik.

---

## 📞 Kontak & Bantuan

Jika Anda lupa akun, kata sandi, atau memerlukan bantuan teknis:
- **Admin:** Harits Romadhon
- **WhatsApp:** [085711092611](https://wa.me/6285711092611?text=Halo%20Admin%20Perpustakaan%20Mandiri%2C%20saya%20ingin%20menanyakan%20akun%20saya.)
- **Repository:** [github.com/haritsromadhon001/Perpustakaan-Mandiri](https://github.com/haritsromadhon001/Perpustakaan-Mandiri)
