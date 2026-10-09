import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers for smooth PDF loading
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print(" PERPUSTAKAAN MANDIRI - SERVER LOKAL BERJALAN")
        print("=" * 60)
        print(f" URL Website : {url}")
        print(f" Folder Data : {DIRECTORY}")
        print(" Tekan CTRL + C di jendela ini untuk mematikan server.")
        print("=" * 60)
        
        # Open browser automatically
        try:
            webbrowser.open(url)
        except Exception:
            pass

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer Perpustakaan Mandiri dihentikan.")
            sys.exit(0)

if __name__ == "__main__":
    main()
