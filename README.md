# 📚 Perpustakaan Mandiri (Akses Online Publik di HP & Multi-Device)

Selamat datang di **Perpustakaan Mandiri** — website perpustakaan digital pribadi yang kini dapat diakses dari Smartphone (HP) **layaknya website internet pada umumnya**, tanpa perlu berada di jaringan Wi-Fi yang sama atau menghafal nomor IP!

---

## 💡 Mengapa Sebelumnya di HP Masih Ada File Dummy & Berbeda?

Ada 2 penyebab utama:
1. **Cache Browser di HP**: Peramban HP (Chrome / Safari) menyimpan riwayat dan skrip lama di memori internalnya. Ketika database di laptop dikosongkan, HP masih menampilkan salinan buku contoh lama dari memori HP.
2. **Jaringan Lokal (LAN vs Internet)**: Tautan IP (seperti `192.168.1.8`) adalah jaringan internal rumah. Jika HP menggunakan paket data 4G/5G, HP tidak dapat menjangkau server laptop tersebut.

---

## ✨ Solusi Baru yang Telah Diterapkan:

1. **🌐 Link Internet Publik Otomatis (Cloudflare Tunnel)**:
   - Saat Anda menjalankan server, sistem akan secara otomatis membuat **link resmi internet (HTTPS)**.
   - Link ini berakhiran `.trycloudflare.com` yang bisa dibuka langsung di HP menggunakan kuota internet apa pun (Telkomsel, Indosat, XL, dll.) dari mana saja tanpa perlu satu Wi-Fi!

2. **🧹 Pembersih Otomatis Data Dummy di HP (*Auto-Purge*)**:
   - Skrip website kini dilengkapi kode pembersih otomatis. Begitu dibuka di HP, website akan mendeteksi dan menghapus sisa-sisa buku contoh dummy yang tersimpan di HP.
   - Rak buku di HP dijamin **bersih 100% (kosong murni)** sama persis dengan laptop.

3. **Tombol "Bersihkan HP" Sekali Sentuh**:
   - Di jendela modal *"Buka di HP"*, terdapat tombol darurat merah **"Bersihkan HP"** untuk menghapus total cache HP dan memuat ulang dalam kondisi kosong bersih.

---

## 🚀 Cara Membuka di HP (Layaknya Website Biasa)

1. **Jalankan Website di Laptop**:
   - Klik dua kali file [**`jalankan_perpustakaan.bat`**](file:///c:/Users/Harits/Documents/Website_Perpustakaan%20Mandiri/jalankan_perpustakaan.bat).
   - Layar hitam akan menyiapkan server dan link internet publik Anda.

2. **Dapatkan Link untuk HP**:
   - Di navbar laptop, klik tombol **"📱 Buka di HP"**.
   - Akan muncul **Link Internet Publik** dan **QR Code**.

3. **Buka di HP**:
   - **Scan QR Code** dengan kamera HP / Google Lens Anda.
   - *(Atau ketik link internet `https://....trycloudflare.com` di browser HP Anda)*.
   - **Selesai!** HP bisa membukanya menggunakan kuota data seluler tanpa harus terhubung ke Wi-Fi laptop.

4. **Kondisi Rak**:
   - Rak di HP akan tampil **bersih dan kosong**.
   - Setiap kali Anda menambahkan buku PDF baru di laptop, buku tersebut **langsung otomatis muncul di HP**.

---

## 📂 Struktur Berkas Proyek

```
Website_Perpustakaan Mandiri/
│
├── data/
│   └── library.json         # Database utama buku & jadwal (kondisi kosong)
├── uploads/                 # Folder penyimpanan berkas PDF
├── cloudflared.exe          # Penghubung resmi ke jaringan internet publik
├── index.html               # Halaman antarmuka web (dengan proteksi anti-cache)
├── style.css                # Desain visual 3D sampul buku & palet Notion
├── app.js                   # Logika sinkronisasi & pembersih cache HP otomatis
├── server.py                # Server Python yang otomatis membuat link internet
├── jalankan_perpustakaan.bat# Pintasan sekali klik untuk menjalankan sistem
└── README.md                # Panduan lengkap
```
