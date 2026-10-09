import http.server
import socketserver
import webbrowser
import os
import sys
import json
import socket
import urllib.parse
import uuid
import re

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DB_FILE = os.path.join(DATA_DIR, "library.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

def get_local_ip():
    """Detect local LAN IP for HP / mobile access."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def create_sample_pdf(title, author, category, filename):
    """Generate a clean valid minimal PDF 1.4 file for sample books."""
    filepath = os.path.join(UPLOADS_DIR, filename)
    if os.path.exists(filepath):
        return
    content = (
        f"BT /F1 18 Tf 50 720 Td ({title}) Tj ET "
        f"BT /F1 12 Tf 50 690 Td (Penulis: {author}) Tj ET "
        f"BT /F1 12 Tf 50 670 Td (Kategori: {category}) Tj ET "
        f"BT /F1 11 Tf 50 630 Td (Perpustakaan Mandiri - Berkas Koleksi Buku Digital) Tj ET "
        f"BT /F1 11 Tf 50 610 Td (Buku ini dapat dibaca langsung dari Laptop maupun Smartphone HP Anda.) Tj ET"
    )
    stream_len = len(content.encode("utf-8"))
    part1 = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    part2 = f"4 0 obj\n<< /Length {stream_len} >>\nstream\n{content}\nendstream\nendobj\n".encode("utf-8")
    part3 = b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000224 00000 n \n0000000300 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n377\n%%EOF"
    pdf_data = part1 + part2 + part3
    with open(filepath, "wb") as f:
        f.write(pdf_data)

def initialize_database():
    """Seed initial books & schedules if database is empty."""
    if os.path.exists(DB_FILE):
        return

    create_sample_pdf("Riyadhus Shalihin", "Imam An-Nawawi", "Keagamaan", "Riyadhus_Shalihin_Ringkasan.pdf")
    create_sample_pdf("Fiqih Sunnah", "Sayyid Sabiq", "Keagamaan", "Fiqih_Sunnah_Praktis.pdf")
    create_sample_pdf("Fundamental Jaringan Komputer", "Andrew S. Tanenbaum", "Network Engineer", "Networking_Fundamentals_TCP_IP.pdf")
    create_sample_pdf("Panduan Cisco CCNA", "Todd Lammle", "Network Engineer", "Cisco_CCNA_Routing_Switching.pdf")
    create_sample_pdf("MikroTik MTCNA Handbook", "Rendra Towidjojo", "Network Engineer", "MikroTik_MTCNA_Handbook.pdf")

    initial_data = {
        "books": [
            {
                "id": "book-1",
                "title": "Riyadhus Shalihin: Panduan Akhlak & Amal Shalih",
                "author": "Imam An-Nawawi",
                "category": "Keagamaan",
                "totalPages": 420,
                "currentPage": 85,
                "status": "Sedang Dibaca",
                "notes": "Kitab rujukan adab, hadits-hadits fadhilah amal, dan pensucian jiwa.",
                "coverGradient": "from-emerald-700 to-teal-950",
                "pdfFileName": "Riyadhus_Shalihin_Ringkasan.pdf",
                "pdfUrl": "/uploads/Riyadhus_Shalihin_Ringkasan.pdf",
                "createdAt": "2026-10-01T08:00:00.000Z"
            },
            {
                "id": "book-2",
                "title": "Fiqih Sunnah: Ibadah, Muamalah & Adab Harian",
                "author": "Sayyid Sabiq",
                "category": "Keagamaan",
                "totalPages": 380,
                "currentPage": 380,
                "status": "Selesai",
                "notes": "Penjelasan dalil fiqih praktis yang mudah dipahami untuk kehidupan sehari-hari.",
                "coverGradient": "from-amber-700 to-amber-950",
                "pdfFileName": "Fiqih_Sunnah_Praktis.pdf",
                "pdfUrl": "/uploads/Fiqih_Sunnah_Praktis.pdf",
                "createdAt": "2026-10-02T08:00:00.000Z"
            },
            {
                "id": "book-3",
                "title": "Fundamental Jaringan Komputer, Subnetting & TCP/IP",
                "author": "Andrew S. Tanenbaum & Tim Jaringan",
                "category": "Network Engineer",
                "totalPages": 310,
                "currentPage": 120,
                "status": "Sedang Dibaca",
                "notes": "Dasar OSI Layer, perhitungan subnetting VLSM/CIDR, dan protokol TCP/IP.",
                "coverGradient": "from-sky-700 to-indigo-950",
                "pdfFileName": "Networking_Fundamentals_TCP_IP.pdf",
                "pdfUrl": "/uploads/Networking_Fundamentals_TCP_IP.pdf",
                "createdAt": "2026-10-03T08:00:00.000Z"
            },
            {
                "id": "book-4",
                "title": "Panduan Praktis Cisco CCNA: Routing & Switching Lengkap",
                "author": "Todd Lammle",
                "category": "Network Engineer",
                "totalPages": 520,
                "currentPage": 45,
                "status": "Sedang Dibaca",
                "notes": "Konfigurasi router Cisco, VLAN, Inter-VLAN routing, OSPF, dan Access Control List.",
                "coverGradient": "from-blue-800 to-slate-900",
                "pdfFileName": "Cisco_CCNA_Routing_Switching.pdf",
                "pdfUrl": "/uploads/Cisco_CCNA_Routing_Switching.pdf",
                "createdAt": "2026-10-04T08:00:00.000Z"
            },
            {
                "id": "book-5",
                "title": "MikroTik Certified Network Associate (MTCNA) Handbook",
                "author": "Rendra Towidjojo",
                "category": "Network Engineer",
                "totalPages": 240,
                "currentPage": 0,
                "status": "Belum Dibaca",
                "notes": "Panduan konfigurasi RouterOS MikroTik, Firewall NAT, Bandwidth Queue, dan Wireless.",
                "coverGradient": "from-cyan-800 to-slate-900",
                "pdfFileName": "MikroTik_MTCNA_Handbook.pdf",
                "pdfUrl": "/uploads/MikroTik_MTCNA_Handbook.pdf",
                "createdAt": "2026-10-05T08:00:00.000Z"
            }
        ],
        "schedules": [
            {
                "id": "sched-1",
                "bookId": "book-3",
                "bookTitle": "Fundamental Jaringan Komputer, Subnetting & TCP/IP",
                "title": "Latihan Menghitung Subnet VLSM /26 dan /28",
                "date": "2026-10-10",
                "time": "19:30",
                "targetPages": "Hal 120 - 145",
                "status": "Sedang Berjalan",
                "completed": False,
                "notes": "Pastikan paham cara menghitung host valid dan broadcast address.",
                "createdAt": "2026-10-09T08:00:00.000Z"
            },
            {
                "id": "sched-2",
                "bookId": "book-1",
                "bookTitle": "Riyadhus Shalihin: Panduan Akhlak & Amal Shalih",
                "title": "Kajian Bab Keutamaan Sabar & Shadaqah",
                "date": "2026-10-10",
                "time": "06:00",
                "targetPages": "Hal 85 - 100",
                "status": "Sedang Berjalan",
                "completed": False,
                "notes": "Fokus pada faedah hadits dan aplikasi di kehidupan sehari-hari.",
                "createdAt": "2026-10-09T08:00:00.000Z"
            },
            {
                "id": "sched-3",
                "bookId": "book-4",
                "bookTitle": "Panduan Praktis Cisco CCNA: Routing & Switching Lengkap",
                "title": "Konfigurasi OSPF Single Area di Cisco Packet Tracer",
                "date": "2026-10-11",
                "time": "20:00",
                "targetPages": "Hal 45 - 70",
                "status": "Rencana",
                "completed": False,
                "notes": "Praktik langsung di simulator Cisco Packet Tracer.",
                "createdAt": "2026-10-09T08:00:00.000Z"
            },
            {
                "id": "sched-4",
                "bookId": "book-2",
                "bookTitle": "Fiqih Sunnah: Ibadah, Muamalah & Adab Harian",
                "title": "Tuntas Membaca Bab Thaharah & Rukun Shalat",
                "date": "2026-10-08",
                "time": "05:30",
                "targetPages": "Hal 350 - 380",
                "status": "Selesai",
                "completed": True,
                "notes": "Alhamdulillah selesai satu juz pembahasan fiqih ibadah.",
                "createdAt": "2026-10-09T08:00:00.000Z"
            }
        ]
    }
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(initial_data, f, indent=2, ensure_ascii=False)

def load_db():
    initialize_database()
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"books": [], "schedules": []}

def save_db(data):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

class LibraryRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Allow cross-origin and mobile devices to access smoothly
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status_code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Info server (detect IP for HP)
        if path == "/api/info":
            local_ip = get_local_ip()
            return self.send_json({
                "appName": "Perpustakaan Mandiri",
                "serverIp": local_ip,
                "port": PORT,
                "url": f"http://{local_ip}:{PORT}"
            })

        # API: Get Books
        if path == "/api/books":
            db = load_db()
            return self.send_json(db.get("books", []))

        # API: Get Schedules
        if path == "/api/schedules":
            db = load_db()
            return self.send_json(db.get("schedules", []))

        # Serving static files (index.html, style.css, uploads, etc.)
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))

        # API: Upload PDF file
        if path == "/api/upload":
            raw_filename = self.headers.get("X-Filename", "document.pdf")
            raw_filename = urllib.parse.unquote(raw_filename)
            
            # Clean filename
            safe_basename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', os.path.basename(raw_filename))
            if not safe_basename.lower().endswith('.pdf'):
                safe_basename += '.pdf'
                
            unique_name = f"{uuid.uuid4().hex[:8]}_{safe_basename}"
            dest_path = os.path.join(UPLOADS_DIR, unique_name)

            # Stream read in chunks to handle files of any size without RAM issues
            remaining = content_length
            with open(dest_path, "wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, 65536))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)

            return self.send_json({
                "success": True,
                "fileName": raw_filename,
                "storedName": unique_name,
                "url": f"/uploads/{unique_name}",
                "size": os.path.getsize(dest_path)
            })

        # API: Save or Update Book
        if path == "/api/books":
            body = self.rfile.read(content_length).decode("utf-8")
            book_item = json.loads(body)
            db = load_db()
            books = db.get("books", [])

            # Check if book already exists (update)
            existing_idx = next((i for i, b in enumerate(books) if b.get("id") == book_item.get("id")), -1)
            if existing_idx >= 0:
                books[existing_idx] = book_item
            else:
                books.insert(0, book_item)

            db["books"] = books
            save_db(db)
            return self.send_json({"success": True, "book": book_item})

        # API: Save or Update Schedule
        if path == "/api/schedules":
            body = self.rfile.read(content_length).decode("utf-8")
            sched_item = json.loads(body)
            db = load_db()
            schedules = db.get("schedules", [])

            existing_idx = next((i for i, s in enumerate(schedules) if s.get("id") == sched_item.get("id")), -1)
            if existing_idx >= 0:
                schedules[existing_idx] = sched_item
            else:
                schedules.append(sched_item)

            db["schedules"] = schedules
            save_db(db)
            return self.send_json({"success": True, "schedule": sched_item})

        # API: Reset Database to Default
        if path == "/api/reset":
            if os.path.exists(DB_FILE):
                os.remove(DB_FILE)
            initialize_database()
            return self.send_json({"success": True, "message": "Database direset ke default"})

        self.send_error(404, "Endpoint not found")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Delete Book -> /api/books/<id>
        if path.startswith("/api/books/"):
            book_id = path.replace("/api/books/", "")
            db = load_db()
            books = db.get("books", [])
            target = next((b for b in books if b.get("id") == book_id), None)
            if target:
                books = [b for b in books if b.get("id") != book_id]
                db["books"] = books
                save_db(db)
                # Remove file if it's in uploads
                if target.get("pdfUrl") and target.get("pdfUrl").startswith("/uploads/"):
                    fname = os.path.basename(target["pdfUrl"])
                    fpath = os.path.join(UPLOADS_DIR, fname)
                    if os.path.exists(fpath):
                        try:
                            os.remove(fpath)
                        except Exception:
                            pass
                return self.send_json({"success": True})
            return self.send_json({"success": False, "message": "Buku tidak ditemukan"}, status_code=404)

        # API: Delete Schedule -> /api/schedules/<id>
        if path.startswith("/api/schedules/"):
            sched_id = path.replace("/api/schedules/", "")
            db = load_db()
            schedules = db.get("schedules", [])
            db["schedules"] = [s for s in schedules if s.get("id") != sched_id]
            save_db(db)
            return self.send_json({"success": True})

        self.send_error(404, "Endpoint not found")

def main():
    os.chdir(BASE_DIR)
    initialize_database()
    local_ip = get_local_ip()
    local_url = f"http://localhost:{PORT}"
    network_url = f"http://{local_ip}:{PORT}"

    print("\n" + "=" * 65)
    print("      🚀 SERVER PERPUSTAKAAN MANDIRI (TERKONEKSI KE HP)")
    print("=" * 65)
    print(f" 💻 Akses di Laptop/PC : {local_url}")
    print(f" 📱 Akses di HP/Mobile  : {network_url}")
    print("-" * 65)
    print(" 💡 TIPS AKSES DI HP:")
    print(f" 1. Pastikan HP dan Laptop terhubung ke Wi-Fi yang sama.")
    print(f" 2. Buka browser HP (Chrome/Safari), ketik: {network_url}")
    print(" 3. Semua buku PDF & jadwal yang dimasukkan di laptop")
    print("    akan LANGSUNG MUNCUL di HP secara otomatis!")
    print("=" * 65)
    print(" Tekan CTRL + C untuk menghentikan server.\n")

    # Open local browser
    try:
        webbrowser.open(local_url)
    except Exception:
        pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LibraryRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer Perpustakaan Mandiri dihentikan.")
            sys.exit(0)

if __name__ == "__main__":
    main()
