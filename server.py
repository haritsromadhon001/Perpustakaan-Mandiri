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

def initialize_database():
    """Ensure database file exists in a clean, empty state ready for user input."""
    if not os.path.exists(DB_FILE):
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump({"books": [], "schedules": []}, f, indent=2, ensure_ascii=False)

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

        # API: Reset Database to Empty
        if path == "/api/reset":
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump({"books": [], "schedules": []}, f, indent=2, ensure_ascii=False)
            # Remove all files from uploads folder
            for fname in os.listdir(UPLOADS_DIR):
                fpath = os.path.join(UPLOADS_DIR, fname)
                if os.path.isfile(fpath):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass
            return self.send_json({"success": True, "message": "Database berhasil dikosongkan"})

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
