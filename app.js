/**
 * ==============================================================================
 * PERPUSTAKAAN MANDIRI - APPLICATION CORE JAVASCRIPT
 * Triple-Engine Architecture:
 * 1. Supabase Cloud (Vercel Production - Sync Laptop & HP 24/7 Tanpa Server Laptop)
 * 2. Local Python Server (Localhost & Wi-Fi / Cloudflare Tunnel)
 * 3. Offline IndexedDB Fallback
 * ==============================================================================
 */

// ==============================================================================
// 0. KONFIGURASI SUPABASE CLOUD (UNTUK DEPLOYMENT VERCEL)
// ==============================================================================
// Anda bisa menempelkan URL & Anon Key Supabase Anda di sini, ATAU
// mengisinya lewat tombol "Cloud Database" di navbar website!
const DEFAULT_SUPABASE_URL = "https://ocucfsglxgvgwjujncst.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWNmc2dseGd2Z3dqdWpuY3N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NzUxMTIsImV4cCI6MjEwNzE1MTExMn0.doyKumd4TaK9bfwcrMaWB-5BDBoskxt-mjJ96qu9QMw";

// Global State & Central In-Memory Cache
let currentView = 'landing';
let selectedCategory = 'all';
let currentSearchTerm = '';
let currentStatusFilter = 'all';
let currentScheduleView = 'board';
let activePdfObjectUrl = null;
let pendingPdfFile = null;
let serverInfo = null;
let isServerOnline = false;
let isSupabaseActive = false;
let supabaseClient = null;
let currentUser = null;
let isGuestMode = false;
let currentReadingStatusFilter = 'all'; // 'all', 'unread', 'completed'
let currentBookshelfLayout = 'grid'; // 'grid', 'dual'
let currentTheme = localStorage.getItem('PERPUS_THEME') || 'parchment';

// Central In-Memory Cache to ensure Mobile and Desktop render identical state
let cachedBooks = [];
let cachedSchedules = [];
let isDataLoading = false;

// ==============================================================================
// 1. DATA ACCESS LAYER (SUPABASE CLOUD + LOCAL SERVER + INDEXEDDB FALLBACK)
// ==============================================================================
const DB_NAME = 'PerpustakaanMandiriDB';
const DB_VERSION = 1;

class DataRepository {
  constructor() {
    this.idb = null;
    this.supabase = null;
    this.mode = 'local'; // 'supabase', 'server', 'indexeddb'
  }

  // Auto-sync credentials dari URL jika membuka via QR Code / URL parameter
  checkUrlSyncParams() {
    try {
      const urlObj = new URL(window.location.href);
      let sbUrl = urlObj.searchParams.get('sb_url');
      let sbKey = urlObj.searchParams.get('sb_key');

      if (!sbUrl && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        sbUrl = hashParams.get('sb_url');
        sbKey = hashParams.get('sb_key');
      }

      if (sbUrl && sbKey) {
        localStorage.setItem('PERPUS_SUPABASE_URL', sbUrl);
        localStorage.setItem('PERPUS_SUPABASE_KEY', sbKey);
        console.log('✓ Konfigurasi Supabase berhasil disinkronkan otomatis dari tautan/QR code!');

        // Bersihkan parameter dari URL agar address bar bersih
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.warn('Gagal membaca parameter sync URL:', e);
    }
  }

  // Buka IndexedDB secara aman dengan memastikan object stores selalu dibuat
  async openIndexedDB() {
    if (this.idb) return this.idb;
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('schedules')) {
          db.createObjectStore('schedules', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.idb = e.target.result;
        resolve(this.idb);
      };
      request.onerror = (e) => {
        console.warn('Gagal membuka IndexedDB:', e.target.error);
        resolve(null);
      };
    });
  }

  async init() {
    // 0. Auto-sync Supabase dari parameter URL jika membuka lewat scan QR dari laptop
    this.checkUrlSyncParams();

    // 1. Inisialisasi IndexedDB secara aman terlebih dahulu
    await this.openIndexedDB();
    await this.purgeLegacyLocalData();

    // 2. Cek apakah ada konfigurasi Supabase (dari variabel kode atau dari memori input)
    const storedUrl = localStorage.getItem('PERPUS_SUPABASE_URL');
    const storedKey = localStorage.getItem('PERPUS_SUPABASE_KEY');
    const supaUrl = DEFAULT_SUPABASE_URL || storedUrl;
    const supaKey = DEFAULT_SUPABASE_KEY || storedKey;

    if (supaUrl && supaKey && window.supabase) {
      try {
        this.supabase = window.supabase.createClient(supaUrl, supaKey);
        supabaseClient = this.supabase;
        // Test query sederhana untuk memastikan koneksi valid
        const { error } = await this.supabase.from('books').select('id').limit(1);
        if (!error) {
          this.mode = 'supabase';
          isSupabaseActive = true;
          this.updateCloudStatusUI(true, 'Supabase Cloud Aktif (Sinkron di Vercel)');
          console.log('⚡ Terhubung ke Supabase Cloud Database!');
          
          // Setup Realtime Sync otomatis antar-perangkat (Laptop & HP)
          this.setupRealtimeSync();

          // Sinkronkan buku lokal jika ada yang belum terunggah ke Cloud
          this.syncLocalBooksToCloud().catch(console.warn);
          return;
        } else {
          console.warn('Supabase terdeteksi tapi query error:', error.message);
        }
      } catch (err) {
        console.warn('Gagal menginisialisasi Supabase:', err);
      }
    }

    // 3. Jika Supabase belum aktif, cek apakah terhubung ke Server Python lokal
    try {
      const res = await fetch('/api/info', { cache: 'no-store' });
      if (res.ok) {
        serverInfo = await res.json();
        isServerOnline = true;
        this.mode = 'server';
        this.updateCloudStatusUI(false, 'Server Python Lokal Aktif');
        console.log('⚡ Terhubung ke Server Python Lokal:', serverInfo);
        return;
      }
    } catch {
      isServerOnline = false;
    }

    // 4. Fallback terakhir: Browser IndexedDB lokal
    this.mode = 'indexeddb';
    this.updateCloudStatusUI(false, 'Mode Lokal (Belum Terhubung Cloud)');
    await this.openIndexedDB();
  }

  // Setup Realtime Sync: mendengarkan perubahan data buku & jadwal dari device lain secara real-time
  setupRealtimeSync() {
    if (!this.supabase) return;
    try {
      this.supabase
        .channel('public:realtime_library')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, async () => {
          console.log('⚡ Sinkronisasi otomatis: Perubahan buku terdeteksi dari perangkat lain!');
          await loadAndSyncData();
          if (currentView === 'dashboard') renderDashboardView();
          if (currentView === 'landing') renderLandingView();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, async () => {
          console.log('⚡ Sinkronisasi otomatis: Perubahan jadwal terdeteksi dari perangkat lain!');
          await loadAndSyncData();
          if (currentView === 'schedule') renderScheduleView();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime sync setup warning:', e);
    }
  }

  updateCloudStatusUI(isOnline, statusText) {
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    const banner = document.getElementById('cloud-modal-status-banner');
    const bannerText = document.getElementById('cloud-modal-status-text');

    // Mobile indicators
    const mDot = document.getElementById('mobileCloudStatusDot');
    const mText = document.getElementById('mobileCloudStatusText');
    const mBadge = document.getElementById('mobileCloudBadge');
    const mMenuDot = document.getElementById('mobileMenuCloudDot');

    if (dot && text) {
      if (isOnline) {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50';
        text.textContent = 'Cloud Aktif ✓';
      } else {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
        text.textContent = 'Cloud Sync';
      }
    }

    if (mDot && mText && mBadge) {
      if (isOnline) {
        mDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
        mText.textContent = 'Cloud Aktif';
        mBadge.className = 'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold';
      } else {
        mDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
        mText.textContent = 'Lokal (HP)';
        mBadge.className = 'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold';
      }
    }

    if (mMenuDot) {
      mMenuDot.className = isOnline
        ? 'absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500'
        : 'absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    }

    if (banner && bannerText) {
      if (isOnline) {
        banner.className = 'p-3 rounded-2xl mb-4 text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-2';
        bannerText.textContent = `✓ ${statusText}`;
      } else {
        banner.className = 'p-3 rounded-2xl mb-4 text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-2';
        bannerText.textContent = `⚠️ ${statusText}. Masukkan Project URL & Anon Key di bawah ini agar Vercel otomatis tersinkron di HP!`;
      }
    }
  }

  async purgeLegacyLocalData() {
    try {
      const db = await this.openIndexedDB();
      if (!db || !db.objectStoreNames.contains('books') || !db.objectStoreNames.contains('schedules')) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(['books', 'schedules'], 'readwrite');
          const bookStore = tx.objectStore('books');
          const schedStore = tx.objectStore('schedules');

          const dummyIds = ['book-1', 'book-2', 'book-3', 'book-4', 'book-5'];
          dummyIds.forEach((id) => bookStore.delete(id));

          const dummyScheds = ['sched-1', 'sched-2', 'sched-3', 'sched-4'];
          dummyScheds.forEach((id) => schedStore.delete(id));

          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // ignore
    }
  }

  // --- IndexedDB Direct Access Helpers ---
  async getLocalIndexedDbBooks() {
    return new Promise((resolve) => {
      try {
        if (!this.idb) {
          this.openIndexedDB().then((db) => {
            if (!db || !db.objectStoreNames.contains('books')) return resolve([]);
            try {
              const tx = db.transaction('books', 'readonly');
              const req = tx.objectStore('books').getAll();
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => resolve([]);
            } catch {
              resolve([]);
            }
          });
          return;
        }
        if (!this.idb.objectStoreNames.contains('books')) return resolve([]);
        const tx = this.idb.transaction('books', 'readonly');
        const req = tx.objectStore('books').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async saveLocalIndexedDbBook(book) {
    return new Promise((resolve) => {
      try {
        if (!this.idb) {
          this.openIndexedDB().then((db) => {
            if (!db || !db.objectStoreNames.contains('books')) return resolve(book);
            try {
              const tx = db.transaction('books', 'readwrite');
              const req = tx.objectStore('books').put(book);
              req.onsuccess = () => resolve(book);
              req.onerror = () => resolve(book);
            } catch {
              resolve(book);
            }
          });
          return;
        }
        if (!this.idb.objectStoreNames.contains('books')) return resolve(book);
        const tx = this.idb.transaction('books', 'readwrite');
        const req = tx.objectStore('books').put(book);
        req.onsuccess = () => resolve(book);
        req.onerror = () => resolve(book);
      } catch {
        resolve(book);
      }
    });
  }

  // Otomatis sinkronkan buku lokal di IndexedDB ke Supabase Cloud
  async syncLocalBooksToCloud() {
    if (!this.supabase || this.mode !== 'supabase') return;
    try {
      const localBooks = await this.getLocalIndexedDbBooks();
      if (!localBooks || localBooks.length === 0) return;

      const { data: cloudBooks, error } = await this.supabase.from('books').select('id');
      if (error) return;

      const cloudIds = new Set((cloudBooks || []).map((b) => b.id));
      const unSynced = localBooks.filter((b) => !cloudIds.has(b.id));

      if (unSynced.length > 0) {
        console.log(`Mengunggah ${unSynced.length} buku lokal ke Supabase Cloud...`);
        for (const book of unSynced) {
          let finalPdfUrl = book.pdfUrl || null;
          let finalPdfFileName = book.pdfFileName || null;

          // Jika ada file PDF tersimpan di memori lokal laptop, otomatis unggah ke Supabase Storage
          if (!finalPdfUrl && book.pdfBlob) {
            try {
              const uploadRes = await this.uploadPdfFile(book.pdfBlob);
              if (uploadRes) {
                finalPdfUrl = uploadRes.url;
                finalPdfFileName = uploadRes.fileName || book.pdfFileName;
              }
            } catch (upErr) {
              console.warn('Gagal upload PDF lokal ke storage cloud:', upErr);
            }
          }

          const payload = {
            id: book.id,
            title: book.title || 'Tanpa Judul',
            author: book.author || 'Anonim',
            category: book.category || 'Lainnya',
            total_pages: Number(book.totalPages) || 100,
            current_page: Number(book.currentPage) || 0,
            status: book.status || 'Belum Dibaca',
            notes: book.notes || '',
            cover_gradient: book.coverGradient,
            pdf_url: finalPdfUrl,
            pdf_file_name: finalPdfFileName,
            created_at: book.createdAt || new Date().toISOString()
          };
          await this.supabase.from('books').upsert([payload]);
        }
        console.log('✓ Sinkronisasi buku lokal dan PDF ke Cloud berhasil!');
      }
    } catch (err) {
      console.warn('Sync local books warning:', err);
    }
  }

  // --- Books CRUD ---
  async getAllBooks() {
    // Mode Supabase Cloud (Vercel)
    if (this.mode === 'supabase' && this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('books')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((b) => ({
            id: b.id,
            title: b.title || 'Tanpa Judul',
            author: b.author || 'Anonim',
            category: b.category || 'Lainnya',
            totalPages: Number(b.total_pages) || 100,
            currentPage: Number(b.current_page) || 0,
            status: b.status || 'Belum Dibaca',
            notes: b.notes || '',
            coverGradient: b.cover_gradient,
            pdfUrl: b.pdf_url,
            pdfFileName: b.pdf_file_name,
            createdAt: b.created_at
          }));
        } else if (error) {
          console.warn('Supabase getAllBooks error:', error.message);
        }
      } catch (err) {
        console.error('Supabase fetch books error:', err);
      }
    }

    // Mode Server Python Lokal
    if (this.mode === 'server') {
      try {
        const res = await fetch('/api/books', { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (err) {
        console.error('Server fetch error:', err);
      }
    }

    // Mode IndexedDB Lokal
    return await this.getLocalIndexedDbBooks();
  }

  async getBook(id) {
    const books = await this.getAllBooks();
    return books.find((b) => b.id === id) || null;
  }

  async saveBook(book) {
    // Mode Supabase Cloud (Vercel)
    if (this.mode === 'supabase' && this.supabase) {
      const payload = {
        id: book.id,
        title: book.title || 'Tanpa Judul',
        author: book.author || 'Anonim',
        category: book.category || 'Lainnya',
        total_pages: Number(book.totalPages) || 100,
        current_page: Number(book.currentPage) || 0,
        status: book.status || 'Belum Dibaca',
        notes: book.notes || '',
        cover_gradient: book.coverGradient,
        pdf_url: book.pdfUrl || null,
        pdf_file_name: book.pdfFileName || null,
        created_at: book.createdAt || new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('books')
        .upsert([payload]);

      if (error) throw error;
      // Backup ke IndexedDB lokal
      this.saveLocalIndexedDbBook(book).catch(() => {});
      return book;
    }

    // Mode Server Python Lokal
    if (this.mode === 'server') {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book)
      });
      return await res.json();
    }

    // Mode IndexedDB Lokal
    return await this.saveLocalIndexedDbBook(book);
  }

  async deleteBook(id) {
    if (this.mode === 'supabase' && this.supabase) {
      const { error } = await this.supabase
        .from('books')
        .delete()
        .eq('id', id);
      return !error;
    }

    if (this.mode === 'server') {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
      return res.ok;
    }

    return new Promise((resolve) => {
      if (!this.idb) return resolve(true);
      const tx = this.idb.transaction('books', 'readwrite');
      const store = tx.objectStore('books');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  // --- Upload File PDF ke Cloud Storage / Server ---
  async uploadPdfFile(file) {
    // Mode Supabase Storage (Vercel)
    if (this.mode === 'supabase' && this.supabase) {
      const fileExt = file.name.split('.').pop() || 'pdf';
      const cleanBase = file.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
      const uniqueFileName = `${Date.now()}_${cleanBase}.${fileExt}`;

      const { data, error } = await this.supabase.storage
        .from('books-pdf')
        .upload(uniqueFileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        console.error('Supabase storage upload error:', error);
        throw new Error(`Gagal upload ke Supabase Storage: ${error.message}`);
      }

      const { data: publicUrlData } = this.supabase.storage
        .from('books-pdf')
        .getPublicUrl(uniqueFileName);

      return {
        url: publicUrlData.publicUrl,
        fileName: file.name
      };
    }

    // Mode Server Python Lokal
    if (this.mode === 'server') {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Filename': encodeURIComponent(file.name)
        },
        body: file
      });
      if (res.ok) {
        return await res.json();
      }
    }

    return null;
  }

  // --- Schedules CRUD ---
  async getAllSchedules() {
    if (this.mode === 'supabase' && this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('schedules')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map((s) => ({
            id: s.id,
            bookId: s.book_id,
            bookTitle: s.book_title,
            title: s.title,
            date: s.date,
            time: s.time,
            targetPages: s.target_pages,
            status: s.status || 'Rencana',
            completed: s.completed || false,
            notes: s.notes || '',
            createdAt: s.created_at
          }));
        }
      } catch (err) {
        console.error('Supabase fetch schedules error:', err);
      }
    }

    if (this.mode === 'server') {
      try {
        const res = await fetch('/api/schedules', { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (err) {
        console.error('Server schedules error:', err);
      }
    }

    return new Promise((resolve) => {
      if (!this.idb) return resolve([]);
      const tx = this.idb.transaction('schedules', 'readonly');
      const store = tx.objectStore('schedules');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async saveSchedule(schedule) {
    if (this.mode === 'supabase' && this.supabase) {
      const payload = {
        id: schedule.id,
        book_id: schedule.bookId,
        book_title: schedule.bookTitle,
        title: schedule.title,
        date: schedule.date,
        time: schedule.time,
        target_pages: schedule.targetPages,
        status: schedule.status,
        completed: schedule.completed,
        notes: schedule.notes,
        created_at: schedule.createdAt || new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('schedules')
        .upsert([payload]);

      if (error) throw error;
      return schedule;
    }

    if (this.mode === 'server') {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      return await res.json();
    }

    return new Promise((resolve, reject) => {
      if (!this.idb) return resolve(schedule);
      const tx = this.idb.transaction('schedules', 'readwrite');
      const store = tx.objectStore('schedules');
      const req = store.put(schedule);
      req.onsuccess = () => resolve(schedule);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteSchedule(id) {
    if (this.mode === 'supabase' && this.supabase) {
      const { error } = await this.supabase
        .from('schedules')
        .delete()
        .eq('id', id);
      return !error;
    }

    if (this.mode === 'server') {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      return res.ok;
    }

    return new Promise((resolve) => {
      if (!this.idb) return resolve(true);
      const tx = this.idb.transaction('schedules', 'readwrite');
      const store = tx.objectStore('schedules');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  async resetData() {
    if (this.mode === 'supabase' && this.supabase) {
      await this.supabase.from('books').delete().neq('id', '___none___');
      await this.supabase.from('schedules').delete().neq('id', '___none___');
      return true;
    }

    if (this.mode === 'server') {
      await fetch('/api/reset', { method: 'POST' });
      return true;
    }

    return new Promise((resolve) => {
      if (!this.idb) return resolve(true);
      const tx = this.idb.transaction(['books', 'schedules'], 'readwrite');
      tx.objectStore('books').clear();
      tx.objectStore('schedules').clear();
      tx.oncomplete = () => resolve(true);
    });
  }
}

const dataRepo = new DataRepository();

// ==============================================================================
// 2. CENTRAL DATA SYNCHRONIZATION CONTROLLER
// ==============================================================================
async function loadAndSyncData() {
  isDataLoading = true;
  try {
    const [books, schedules] = await Promise.all([
      dataRepo.getAllBooks(),
      dataRepo.getAllSchedules()
    ]);
    cachedBooks = books || [];
    cachedSchedules = schedules || [];
    updateStatistics(cachedBooks, cachedSchedules);
    return { books: cachedBooks, schedules: cachedSchedules };
  } catch (err) {
    console.error('Error synchronizing data:', err);
    return { books: cachedBooks, schedules: cachedSchedules };
  } finally {
    isDataLoading = false;
  }
}

async function seedDefaultDataIfEmpty() {
  // Website dibiarkan dalam kondisi bersih & kosong agar pengguna dapat menambahkan koleksi sendiri.
}

// ==============================================================================
// 3. NAVIGATION & VIEW CONTROLLER
// ==============================================================================
function navigateTo(viewName) {
  // Gate Autentikasi: Sebelum masuk ke Dashboard (Rak Buku), Jadwal Baca, atau Evaluasi, HARUS login akun terlebih dahulu (atau lewati sebagai tamu)!
  if ((viewName === 'dashboard' || viewName === 'schedule' || viewName === 'evaluation') && !currentUser && !isGuestMode) {
    showToast('Silakan masuk dengan akun Anda atau pilih lewati untuk masuk sebagai tamu.', 'info');
    viewName = 'login';
  }

  currentView = viewName;

  const views = ['landing', 'dashboard', 'schedule', 'evaluation', 'login'];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add('hidden');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  // Khusus Halaman Login (Portal Masuk Sesuai Screenshot 2):
  // Sembunyikan top navigation header dan mobile bottom dock agar bersih dan fokus seperti portal login
  const topHeader = document.querySelector('header');
  const mobileDock = document.getElementById('mobile-bottom-nav');
  if (viewName === 'login') {
    if (topHeader) topHeader.classList.add('hidden');
    if (mobileDock) mobileDock.classList.add('hidden');
  } else {
    if (topHeader) topHeader.classList.remove('hidden');
    if (mobileDock) mobileDock.classList.remove('hidden');
  }

  // Update Desktop Navigation tab buttons
  const navIds = ['dashboard', 'schedule', 'evaluation', 'landing', 'login'];
  navIds.forEach((id) => {
    const btn = document.getElementById(`nav-btn-${id}`);
    if (btn) {
      if (id === viewName) {
        btn.classList.add('active', 'bg-white', 'text-amber-900', 'shadow-xs');
        btn.classList.remove('text-slate-600');
      } else {
        btn.classList.remove('active', 'bg-white', 'text-amber-900', 'shadow-xs');
        btn.classList.add('text-slate-600');
      }
    }

    // Update Mobile Bottom Dock buttons
    const mBtn = document.getElementById(`mobile-nav-btn-${id}`);
    if (mBtn) {
      if (id === viewName) {
        mBtn.className = 'flex flex-col items-center gap-1 font-bold text-amber-900 transition-colors cursor-pointer';
      } else {
        mBtn.className = 'flex flex-col items-center gap-1 text-slate-500 hover:text-amber-900 transition-colors cursor-pointer';
      }
    }
  });

  if (viewName === 'landing') {
    renderLandingView();
  } else if (viewName === 'dashboard') {
    renderDashboardView();
  } else if (viewName === 'schedule') {
    renderScheduleView();
  } else if (viewName === 'evaluation') {
    renderEvaluationView();
  } else if (viewName === 'login') {
    renderLoginView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==============================================================================
// 4. DASHBOARD & RAK BUKU RENDERING
// ==============================================================================
async function renderDashboardView(forceRefresh = false) {
  if (forceRefresh || (cachedBooks.length === 0 && !isDataLoading)) {
    await loadAndSyncData();
  }
  updateStatistics(cachedBooks, cachedSchedules);
  updateReaderEvaluation();

  // Update Header Welcome Title & User Badge (Sesuai Screenshot 3)
  const headingTitle = document.getElementById('dashboardHeadingTitle');
  const subHeading = document.getElementById('dashboardSubHeading');
  const userBadge = document.getElementById('dashboardUserBadge');
  const userBadgeName = document.getElementById('dashboardUserBadgeName');

  if (currentUser) {
    const rawName = currentUser.user_metadata?.full_name || currentUser.name || 'Harits';
    if (headingTitle) headingTitle.innerHTML = `Selamat Datang, ${escapeHTML(rawName)}! <span class="inline-block">👋</span>`;
    if (subHeading) subHeading.textContent = 'Kelola koleksi buku fisik & digital Anda di satu rak yang rapi.';
    if (userBadge) userBadge.classList.remove('hidden');
    if (userBadgeName) userBadgeName.textContent = rawName;
  } else {
    if (headingTitle) headingTitle.textContent = 'Rak Buku & Dashboard';
    if (subHeading) subHeading.textContent = 'Mode Tamu — Kelola koleksi buku fisik & digital Anda di satu rak yang rapi.';
    if (userBadge) userBadge.classList.add('hidden');
  }

  const container = document.getElementById('bookshelf-grid');
  const emptyState = document.getElementById('empty-bookshelf');
  const dualUnreadList = document.getElementById('dual-unread-list');
  const dualCompletedList = document.getElementById('dual-completed-list');
  if (!container || !emptyState) return;

  const filtered = cachedBooks.filter((book) => {
    const bookCat = (book.category || '').toLowerCase();
    const selCat = (selectedCategory || 'all').toLowerCase();
    const matchCat = selCat === 'all' || bookCat === selCat;

    const searchLow = (currentSearchTerm || '').toLowerCase().trim();
    const matchSearch =
      !searchLow ||
      (book.title || '').toLowerCase().includes(searchLow) ||
      (book.author || '').toLowerCase().includes(searchLow) ||
      (book.notes || '').toLowerCase().includes(searchLow);

    // Reading Status Filter: 'all', 'unread' (Belum Dibaca & Sedang Dibaca), 'completed' (Selesai)
    let matchReadingStatus = true;
    if (currentReadingStatusFilter === 'unread') {
      matchReadingStatus = book.status !== 'Selesai';
    } else if (currentReadingStatusFilter === 'completed') {
      matchReadingStatus = book.status === 'Selesai';
    }

    const matchStatus =
      currentStatusFilter === 'all' || book.status === currentStatusFilter;

    return matchCat && matchSearch && matchReadingStatus && matchStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (dualUnreadList) dualUnreadList.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-dashed border-amber-200">Tidak ada buku dalam daftar ini.</p>`;
    if (dualCompletedList) dualCompletedList.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-dashed border-emerald-200">Tidak ada buku dalam daftar ini.</p>`;
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = filtered.map((book) => createBookCardHTML(book)).join('');

  // Dual Column Rendering
  if (dualUnreadList && dualCompletedList) {
    const unreadBooks = filtered.filter((b) => b.status !== 'Selesai');
    const completedBooks = filtered.filter((b) => b.status === 'Selesai');

    if (unreadBooks.length === 0) {
      dualUnreadList.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-dashed border-amber-200">Semua buku pada kategori ini telah selesai dibaca! 🎉</p>`;
    } else {
      dualUnreadList.innerHTML = unreadBooks.map((b) => createDualBookCardHTML(b)).join('');
    }

    if (completedBooks.length === 0) {
      dualCompletedList.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6 bg-white rounded-2xl border border-dashed border-emerald-200">Belum ada buku yang ditandai selesai. Selesaikan sesi membaca Anda!</p>`;
    } else {
      dualCompletedList.innerHTML = completedBooks.map((b) => createDualBookCardHTML(b)).join('');
    }
  }

  lucide.createIcons();
}

function createBookCardHTML(book) {
  const isKeagamaan = book.category === 'Keagamaan';
  const isNetwork = book.category === 'Network Engineer';
  const catBadgeColor = isKeagamaan
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : isNetwork
    ? 'bg-sky-100 text-sky-800 border-sky-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';

  const catIcon = isKeagamaan ? 'book-heart' : isNetwork ? 'server' : 'bookmark';

  const isDone = book.status === 'Selesai';
  const statusColor = isDone
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
    : book.status === 'Sedang Dibaca'
    ? 'bg-sky-50 text-sky-700 border-sky-200 font-medium'
    : 'bg-slate-100 text-slate-600 border-slate-200 font-medium';

  const total = book.totalPages || 100;
  const current = book.currentPage || 0;
  const progressPct = Math.min(100, Math.round((current / total) * 100));

  const gradient =
    book.coverGradient ||
    (isKeagamaan
      ? 'from-emerald-700 to-teal-950'
      : isNetwork
      ? 'from-sky-700 to-slate-900'
      : 'from-amber-700 to-stone-900');

  const hasPdf = !!(book.pdfUrl || book.pdfBlob);

  return `
    <div class="book-card bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-amber-300 shadow-xs transition-all group">
      <div>
        <div class="book-cover-mockup bg-gradient-to-br ${gradient} text-white p-4 h-48 flex flex-col justify-between relative shadow-md mb-4 group-hover:scale-[1.01] transition-transform">
          <div class="flex items-center justify-between text-xs z-10">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md bg-white/20 text-white border border-white/20">
              <i data-lucide="${catIcon}" class="w-3 h-3"></i> ${escapeHTML(book.category)}
            </span>
            ${hasPdf ? `
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/90 text-white flex items-center gap-1 shadow-2xs">
                <i data-lucide="file-text" class="w-2.5 h-2.5"></i> PDF
              </span>
            ` : ''}
          </div>

          <div class="z-10 pl-2">
            <h4 class="font-serif font-bold text-sm sm:text-base leading-snug line-clamp-2 text-white drop-shadow-sm">${escapeHTML(book.title)}</h4>
            <p class="text-[11px] text-white/80 mt-1 line-clamp-1 italic">${escapeHTML(book.author)}</p>
          </div>

          <div class="z-10 flex items-center justify-between text-[10px] text-white/70 pl-2 border-t border-white/15 pt-2">
            <span>${total} Halaman</span>
            <span>${progressPct}% Selesai</span>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${catBadgeColor}">
              ${escapeHTML(book.category)}
            </span>
            <span class="px-2 py-0.5 rounded text-[11px] border ${statusColor}">
              ${escapeHTML(book.status)}
            </span>
          </div>

          <h3 class="font-serif font-bold text-slate-900 text-sm line-clamp-2 leading-tight" title="${escapeHTML(book.title)}">
            ${escapeHTML(book.title)}
          </h3>
          <p class="text-xs text-slate-500 line-clamp-1">Penulis: <span class="font-medium text-slate-700">${escapeHTML(book.author)}</span></p>

          <div class="pt-1">
            <div class="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>Kemajuan: <strong class="text-slate-800">${current}</strong> / ${total} hal</span>
              <span class="font-bold text-amber-800">${progressPct}%</span>
            </div>
            <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-amber-600 to-amber-700 rounded-full transition-all duration-300" style="width: ${progressPct}%"></div>
            </div>
          </div>

          ${book.notes ? `
            <p class="text-[11px] text-slate-500 bg-amber-50/50 p-2 rounded-xl line-clamp-2 italic border border-amber-100/60 mt-2">
              "${escapeHTML(book.notes)}"
            </p>
          ` : ''}
        </div>
      </div>

      <div class="pt-3 mt-3 border-t border-slate-100 flex flex-col gap-2">
        <div class="flex items-center justify-between gap-1 text-xs">
          ${hasPdf ? `
            <button onclick="openPdfReader('${book.id}')" class="flex-1 py-2 px-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer">
              <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Baca PDF
            </button>
          ` : `
            <button onclick="openEditBookModal('${book.id}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
              <i data-lucide="file-up" class="w-3.5 h-3.5 text-amber-700"></i> Upload PDF
            </button>
          `}

          <div class="flex items-center gap-1">
            <button onclick="openEditBookModal('${book.id}')" class="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer" title="Edit Detail">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="confirmDeleteBook('${book.id}')" class="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer" title="Hapus Buku">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- 1-Click Fast Toggle Status: Selesai / Sedang Dibaca -->
        <button onclick="toggleBookReadStatus('${book.id}')" class="w-full py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isDone ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'}">
          <i data-lucide="${isDone ? 'check-check' : 'check'}" class="w-3.5 h-3.5 ${isDone ? 'text-emerald-600' : 'text-amber-700'}"></i>
          <span>${isDone ? 'Sudah Selesai Dibaca ✓' : 'Tandai Sudah Selesai ✓'}</span>
        </button>
      </div>
    </div>
  `;
}

function createDualBookCardHTML(book) {
  const isDone = book.status === 'Selesai';
  const total = book.totalPages || 100;
  const current = book.currentPage || 0;
  const progressPct = Math.min(100, Math.round((current / total) * 100));
  const hasPdf = !!(book.pdfUrl || book.pdfBlob);

  return `
    <div class="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all space-y-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'} mb-1">
            ${escapeHTML(book.category || 'Buku')}
          </span>
          <h4 class="font-serif font-bold text-sm text-slate-900 truncate" title="${escapeHTML(book.title)}">
            ${escapeHTML(book.title)}
          </h4>
          <p class="text-[11px] text-slate-500 truncate">Penulis: ${escapeHTML(book.author || '-')}</p>
        </div>
        <button onclick="toggleBookReadStatus('${book.id}')" class="shrink-0 p-1.5 rounded-xl ${isDone ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-900'} transition-colors cursor-pointer" title="${isDone ? 'Ubah ke sedang dibaca' : 'Tandai sudah selesai'}">
          <i data-lucide="${isDone ? 'check-check' : 'check'}" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between text-[10px] text-slate-500">
          <span>${current} / ${total} hal</span>
          <span class="font-bold ${isDone ? 'text-emerald-700' : 'text-amber-800'}">${progressPct}%</span>
        </div>
        <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full ${isDone ? 'bg-emerald-500' : 'bg-amber-600'} rounded-full transition-all" style="width: ${progressPct}%"></div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        ${hasPdf ? `
          <button onclick="openPdfReader('${book.id}')" class="text-[11px] font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 cursor-pointer">
            <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Baca PDF
          </button>
        ` : `
          <button onclick="openEditBookModal('${book.id}')" class="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
            <i data-lucide="file-up" class="w-3.5 h-3.5"></i> Upload PDF
          </button>
        `}
        <button onclick="toggleBookReadStatus('${book.id}')" class="text-[11px] font-semibold ${isDone ? 'text-emerald-700' : 'text-amber-800'} hover:underline cursor-pointer">
          ${isDone ? 'Sudah Dibaca ✓' : 'Tandai Selesai ✓'}
        </button>
      </div>
    </div>
  `;
}

// 5 KATA-KATA BIJAK & MAKNANYA UNTUK PEMBACA
const INSPIRATIONAL_QUOTES = [
  {
    id: 1,
    author: "Nelson Mandela",
    role: "Pejuang Kemanusiaan & Tokoh Perdamaian Dunia",
    quote: "“Pendidikan adalah senjata paling ampuh yang dapat kamu gunakan untuk mengubah dunia.”",
    explanationLabel: "Makna",
    explanation: "Ilmu dapat menjadi bekal untuk mengubah kehidupan dan memberikan manfaat kepada orang lain.",
    badge: "1",
    initials: "NM"
  },
  {
    id: 2,
    author: "Benjamin Franklin",
    role: "Polimatik, Penemu & Negarawan",
    quote: "“Investasi dalam pengetahuan memberikan bunga terbaik.”",
    explanationLabel: "Makna",
    explanation: "Waktu dan usaha yang kamu gunakan untuk belajar dapat memberikan manfaat dalam jangka panjang.",
    badge: "2",
    initials: "BF"
  },
  {
    id: 3,
    author: "Calvin Coolidge",
    role: "Presiden Amerika Serikat ke-30",
    quote: "“Nothing in this world can take the place of persistence.”",
    explanationLabel: "Artinya",
    explanation: "Tidak ada sesuatu di dunia ini yang dapat menggantikan ketekunan.",
    badge: "3",
    initials: "CC"
  },
  {
    id: 4,
    author: "Michael Jordan",
    role: "Legenda Bola Basket Dunia & Atlet Berprestasi",
    quote: "“I've failed over and over and over again in my life. And that is why I succeed.”",
    explanationLabel: "Artinya",
    explanation: "Saya telah gagal berulang kali dalam hidup saya. Itulah sebabnya saya berhasil.",
    badge: "4",
    initials: "MJ"
  },
  {
    id: 5,
    author: "James Clear",
    role: "Penulis Buku 'Atomic Habits'",
    quote: "“You do not rise to the level of your goals. You fall to the level of your systems.”",
    explanationLabel: "Artinya",
    explanation: "Kamu tidak selalu mencapai tingkat tujuanmu; kamu cenderung kembali pada tingkat sistem atau kebiasaan yang telah kamu bangun.",
    badge: "5",
    initials: "JC"
  }
];

function filterReadingStatus(statusMode) {
  currentReadingStatusFilter = statusMode;

  const pills = ['all', 'unread', 'completed'];
  pills.forEach((p) => {
    const el = document.getElementById(`status-pill-${p}`);
    if (el) {
      if (p === statusMode) {
        el.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-700 text-white shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer';
      } else {
        el.className = 'px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-amber-900 hover:bg-amber-50 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer';
      }
    }
  });

  renderDashboardView();
}

function toggleBookshelfLayout(mode) {
  currentBookshelfLayout = mode;
  const gridEl = document.getElementById('bookshelf-grid');
  const dualEl = document.getElementById('bookshelf-dual-container');
  const gridBtn = document.getElementById('layout-grid-btn');
  const dualBtn = document.getElementById('layout-dual-btn');

  if (mode === 'grid') {
    if (gridEl) gridEl.classList.remove('hidden');
    if (dualEl) dualEl.classList.add('hidden');
    if (gridBtn) {
      gridBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-800 shadow-2xs flex items-center gap-1 cursor-pointer';
    }
    if (dualBtn) {
      dualBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer';
    }
  } else {
    if (gridEl) gridEl.classList.add('hidden');
    if (dualEl) dualEl.classList.remove('hidden');
    if (dualBtn) {
      dualBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-800 shadow-2xs flex items-center gap-1 cursor-pointer';
    }
    if (gridBtn) {
      gridBtn.className = 'px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer';
    }
  }

  renderDashboardView();
}

async function toggleBookReadStatus(bookId) {
  const book = cachedBooks.find((b) => b.id === bookId);
  if (!book) return;

  const wasCompleted = book.status === 'Selesai';
  if (wasCompleted) {
    book.status = 'Sedang Dibaca';
  } else {
    book.status = 'Selesai';
    book.currentPage = book.totalPages || 100;
  }
  book.updatedAt = new Date().toISOString();

  try {
    await dataRepo.saveBook(book);
    showToast(
      wasCompleted
        ? `Buku "${book.title}" dikembalikan ke status Sedang Dibaca.`
        : `Luar biasa! Buku "${book.title}" ditandai sudah selesai dibaca! 🏆`,
      'success'
    );
    await loadAndSyncData();
    renderDashboardView();
    if (currentView === 'evaluation') {
      renderEvaluationView();
    }
  } catch (err) {
    console.error('Error toggling book status:', err);
    showToast('Gagal mengubah status buku: ' + err.message, 'error');
  }
}

function updateReaderEvaluation() {
  const total = cachedBooks.length;
  const completed = cachedBooks.filter((b) => b.status === 'Selesai').length;
  const unread = total - completed;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let totalPagesRead = 0;
  cachedBooks.forEach((b) => {
    totalPagesRead += (b.currentPage || 0);
  });

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('evalCountDone', completed);
  setText('evalCountUnread', unread);
  setText('evalPercentRatio', `${percent}%`);

  const headlineEl = document.getElementById('readerEvaluationHeadline');
  if (headlineEl) {
    headlineEl.textContent = `Kemajuan Membaca: ${percent}% Selesai (${completed} dari ${total} buku)`;
  }

  const reflectionEl = document.getElementById('readerEvaluationReflection');
  if (reflectionEl) {
    if (percent === 100 && total > 0) {
      reflectionEl.innerHTML = `<strong>Luar biasa!</strong> Seluruh buku di rak Anda telah tuntas dibaca. Seperti kata Benjamin Franklin: <em>“Investasi dalam pengetahuan memberikan bunga terbaik.”</em> Terus tambah wawasan baru!`;
    } else if (percent >= 50) {
      reflectionEl.innerHTML = `<strong>Konsistensi Hebat!</strong> Lebih dari separuh buku telah Anda tamatkan (${percent}%). Seperti kata Calvin Coolidge: <em>“Nothing in this world can take the place of persistence.”</em> Tetap tekun!`;
    } else if (completed > 0) {
      reflectionEl.innerHTML = `<strong>Awal yang Baik!</strong> Anda telah menyelesaikan ${completed} buku. Menurut James Clear: <em>“You do not rise to the level of your goals. You fall to the level of your systems.”</em> Bangun kebiasaan membaca harian secara konsisten.`;
    } else {
      reflectionEl.innerHTML = `"Pendidikan adalah senjata paling ampuh yang dapat kamu gunakan untuk mengubah dunia." — Nelson Mandela. Pilih satu buku hari ini dan mulailah membaca bab pertamanya!`;
    }
  }

  // Update Status Pill Badges
  setText('badge-count-all', total);
  setText('badge-count-unread', unread);
  setText('badge-count-completed', completed);
  setText('dual-count-unread', unread);
  setText('dual-count-completed', completed);

  // Update Full Evaluation View
  setText('evalFullPercent', `${percent}%`);
  setText('evalFullRatioText', `${completed} dari ${total} buku telah selesai dibaca`);
  setText('evalFullPages', totalPagesRead);
  setText('evalFullDiscipline', percent >= 50 ? 'Sangat Disiplin ★★★' : completed > 0 ? 'Berkembang ★★☆' : 'Membangun Kebiasaan ★☆☆');
}

function renderEvaluationView() {
  updateReaderEvaluation();
  const container = document.getElementById('quotesFullContainer');
  if (!container) return;

  container.innerHTML = INSPIRATIONAL_QUOTES.map((q) => {
    return `
      <div class="quote-card bg-white rounded-3xl p-6 border border-amber-200/80 shadow-xs flex flex-col justify-between space-y-4">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-amber-800 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                ${q.initials}
              </div>
              <div>
                <h4 class="font-bold text-sm text-slate-900">${q.author}</h4>
                <p class="text-[10px] text-slate-500">${q.role}</p>
              </div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">${q.badge}</span>
          </div>
          <blockquote class="text-sm font-serif italic text-slate-800 leading-relaxed bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
            ${q.quote}
          </blockquote>
        </div>
        <div class="pt-3 border-t border-slate-100 space-y-2">
          <p class="text-xs text-slate-600 leading-relaxed">
            <strong class="text-amber-900 font-bold">${q.explanationLabel}:</strong> ${q.explanation}
          </p>
          <button onclick="copyQuoteText('${q.quote.replace(/['"]/g, '')} — ${q.author}')" class="text-[11px] font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1.5 cursor-pointer pt-1">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i> Salin Kutipan
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function copyQuoteText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Kutipan berhasil disalin ke papan klip! ✓', 'success');
    }).catch(() => {
      showToast('Kutipan disalin.', 'info');
    });
  } else {
    showToast('Kutipan: ' + text.substring(0, 30) + '...', 'info');
  }
}

// ==============================================================================
// THEME SWITCHER LOGIC (EYE-COMFORT THEMES)
// ==============================================================================
function initTheme() {
  const saved = localStorage.getItem('PERPUS_THEME') || 'parchment';
  applyTheme(saved, false);
}

function applyTheme(themeName, showToastMsg = true) {
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('PERPUS_THEME', themeName);

  // Update checkmarks
  document.querySelectorAll('.theme-check-icon').forEach((el) => {
    if (el.getAttribute('data-theme-check') === themeName) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  // Update navbar label
  const labelEl = document.getElementById('currentThemeLabel');
  if (labelEl) {
    const labels = {
      parchment: 'Tema: Krem',
      sage: 'Tema: Sage',
      mocha: 'Tema: Kopi',
      dark: 'Tema: Gelap'
    };
    labelEl.textContent = labels[themeName] || 'Tema: Krem';
  }

  if (showToastMsg) {
    const friendlyNames = {
      parchment: 'Krem Kertas Alami (Hangat & Lembut)',
      sage: 'Hijau Sage Lembut (Teduh di Mata)',
      mocha: 'Kopi Hangat Sepia (Klasik Nyaman)',
      dark: 'Malam Teduh (OLED Dark)'
    };
    showToast(`Tema warna ${friendlyNames[themeName] || themeName} diaktifkan!`, 'info');
  }
}

function switchTheme(themeName) {
  applyTheme(themeName, true);
  const menu = document.getElementById('themeDropdownMenu');
  if (menu) menu.classList.add('hidden');
}

function toggleThemeDropdown() {
  const menu = document.getElementById('themeDropdownMenu');
  if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const container = document.getElementById('themeSwitcherContainer');
  const menu = document.getElementById('themeDropdownMenu');
  if (container && menu && !container.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function openThemeModalMobile() {
  const modal = document.getElementById('modal-theme-mobile');
  if (modal) modal.classList.remove('hidden');
}

function closeThemeModalMobile() {
  const modal = document.getElementById('modal-theme-mobile');
  if (modal) modal.classList.add('hidden');
}

// ==============================================================================
// 5. STATISTICS & COUNTERS UPDATE
// ==============================================================================
function updateStatistics(books = cachedBooks, schedules = cachedSchedules) {
  const safeBooks = Array.isArray(books) ? books : [];
  const safeSchedules = Array.isArray(schedules) ? schedules : [];

  const total = safeBooks.length;
  const keagamaanCount = safeBooks.filter((b) => (b.category || '').toLowerCase() === 'keagamaan').length;
  const networkCount = safeBooks.filter((b) => (b.category || '').toLowerCase() === 'network engineer').length;
  const othersCount = total - keagamaanCount - networkCount;

  const pdfCount = safeBooks.filter((b) => !!(b.pdfUrl || b.pdfBlob)).length;
  const completedCount = safeBooks.filter((b) => b.status === 'Selesai').length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const activeSchedules = safeSchedules.filter((s) => s.status !== 'Selesai').length;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('stat-total-books', total);
  setText('stat-keagamaan-books', keagamaanCount);
  setText('stat-network-books', networkCount);
  setText('stat-pdf-books', pdfCount);
  setText('stat-completed-percent', `${completedPct}% tuntas`);

  setText('count-cat-all', total);
  setText('count-cat-keagamaan', keagamaanCount);
  setText('count-cat-network', networkCount);
  setText('count-cat-lainnya', Math.max(0, othersCount));

  setText('landing-stat-total', total);
  setText('landing-stat-keagamaan', keagamaanCount);
  setText('landing-stat-network', networkCount);
  setText('landing-stat-schedules', activeSchedules);

  setText('badge-active-schedules', activeSchedules);

  const mBadge = document.getElementById('mobile-badge-schedules');
  if (mBadge) {
    mBadge.textContent = activeSchedules;
    if (activeSchedules > 0) {
      mBadge.classList.remove('hidden');
    } else {
      mBadge.classList.add('hidden');
    }
  }
}

// ==============================================================================
// 6. LANDING PAGE RENDERING
// ==============================================================================
async function renderLandingView(forceRefresh = false) {
  if (forceRefresh || (cachedBooks.length === 0 && !isDataLoading)) {
    await loadAndSyncData();
  }
  updateStatistics(cachedBooks, cachedSchedules);

  const previewContainer = document.getElementById('landing-books-preview');
  if (!previewContainer) return;

  const featured = cachedBooks.slice(0, 4);

  if (featured.length === 0) {
    previewContainer.innerHTML = `
      <div class="col-span-full text-center py-10 px-4 bg-white/70 rounded-2xl border border-dashed border-amber-300/80">
        <div class="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-3">
          <i data-lucide="book-open" class="w-6 h-6"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-sm font-serif">Rak Buku Masih Bersih & Kosong</h4>
        <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Belum ada buku di dalam rak. Mulai masukkan file PDF atau buku pertama Anda!</p>
        <button onclick="openAddBookModal()" class="mt-4 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs shadow-xs inline-flex items-center gap-2 transition-all">
          <i data-lucide="plus-circle" class="w-4 h-4"></i> Tambah Buku Pertama Sekarang
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  previewContainer.innerHTML = featured
    .map((book) => {
      const isKeagamaan = (book.category || '') === 'Keagamaan';
      const isNetwork = (book.category || '') === 'Network Engineer';
      const badgeClass = isKeagamaan
        ? 'bg-emerald-100 text-emerald-800'
        : isNetwork
        ? 'bg-sky-100 text-sky-800'
        : 'bg-amber-100 text-amber-800';

      const gradient =
        book.coverGradient ||
        (isKeagamaan
          ? 'from-emerald-700 to-teal-950'
          : isNetwork
          ? 'from-sky-700 to-slate-900'
          : 'from-amber-700 to-stone-900');

      return `
      <div onclick="navigateTo('dashboard')" class="bg-white rounded-2xl p-4 border border-amber-200/60 shadow-xs hover:shadow-md cursor-pointer transition-all group flex flex-col justify-between">
        <div class="book-cover-mockup bg-gradient-to-br ${gradient} text-white p-3 h-36 rounded-xl flex flex-col justify-between mb-3">
          <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-white inline-block w-fit">
            ${escapeHTML(book.category || 'Buku')}
          </span>
          <div>
            <h5 class="font-serif font-bold text-xs line-clamp-2 text-white">${escapeHTML(book.title || 'Tanpa Judul')}</h5>
            <p class="text-[10px] text-white/80 line-clamp-1 italic">${escapeHTML(book.author || 'Anonim')}</p>
          </div>
        </div>

        <div>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}">${escapeHTML(book.category || 'Lainnya')}</span>
          <h4 class="font-bold text-xs text-slate-900 mt-1 line-clamp-1">${escapeHTML(book.title || 'Tanpa Judul')}</h4>
          <p class="text-[11px] text-slate-500">${book.totalPages || 0} Halaman</p>
        </div>
      </div>
    `;
    })
    .join('');

  lucide.createIcons();
}

// ==============================================================================
// 7. NOTION-STYLE READING SCHEDULE RENDERING
// ==============================================================================
async function renderScheduleView() {
  const schedules = await dataRepo.getAllSchedules();
  const books = await dataRepo.getAllBooks();

  const bookSelect = document.getElementById('sched-book-select');
  if (bookSelect) {
    if (books.length === 0) {
      bookSelect.innerHTML = '<option value="">(Belum ada buku di rak - Tambah buku dulu)</option>';
    } else {
      bookSelect.innerHTML = books
        .map((b) => `<option value="${b.id}">${escapeHTML(b.title)} (${escapeHTML(b.category)})</option>`)
        .join('');
    }
  }

  const todoList = schedules.filter((s) => s.status === 'Rencana');
  const inProgressList = schedules.filter((s) => s.status === 'Sedang Berjalan');
  const doneList = schedules.filter((s) => s.status === 'Selesai');

  document.getElementById('sched-count-todo').textContent = `${todoList.length} Rencana`;
  document.getElementById('sched-count-inprogress').textContent = `${inProgressList.length} Berjalan`;
  document.getElementById('sched-count-done').textContent = `${doneList.length} Selesai`;

  document.getElementById('col-count-todo').textContent = todoList.length;
  document.getElementById('col-count-inprogress').textContent = inProgressList.length;
  document.getElementById('col-count-done').textContent = doneList.length;

  const todoContainer = document.getElementById('kanban-todo-list');
  const inProgressContainer = document.getElementById('kanban-inprogress-list');
  const doneContainer = document.getElementById('kanban-done-list');

  todoContainer.innerHTML =
    todoList.length > 0
      ? todoList.map((s) => createKanbanCardHTML(s)).join('')
      : '<p class="text-xs text-notion-muted italic text-center py-6">Tidak ada rencana jadwal.</p>';

  inProgressContainer.innerHTML =
    inProgressList.length > 0
      ? inProgressList.map((s) => createKanbanCardHTML(s)).join('')
      : '<p class="text-xs text-notion-muted italic text-center py-6">Tidak ada sesi aktif.</p>';

  doneContainer.innerHTML =
    doneList.length > 0
      ? doneList.map((s) => createKanbanCardHTML(s)).join('')
      : '<p class="text-xs text-notion-muted italic text-center py-6">Belum ada yang diselesaikan.</p>';

  const tableBody = document.getElementById('schedule-table-body');
  if (tableBody) {
    if (schedules.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-notion-muted">Belum ada agenda jadwal baca. Silakan klik tombol "Buat Jadwal Baru".</td></tr>`;
    } else {
      tableBody.innerHTML = schedules.map((s) => createScheduleTableRowHTML(s)).join('');
    }
  }

  lucide.createIcons();
}

function createKanbanCardHTML(s) {
  const isDone = s.status === 'Selesai';
  const tagColorClass =
    s.status === 'Rencana'
      ? 'notion-tag-orange'
      : s.status === 'Sedang Berjalan'
      ? 'notion-tag-blue'
      : 'notion-tag-green';

  return `
    <div class="notion-card bg-white rounded-xl p-3.5 border border-notion-border shadow-2xs space-y-2.5">
      <div class="flex items-start justify-between gap-2">
        <label class="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleScheduleComplete('${s.id}')" class="mt-0.5 rounded border-slate-300 text-amber-700 focus:ring-amber-500 cursor-pointer" />
          <span class="text-xs font-bold text-slate-800 ${isDone ? 'line-through text-slate-400' : ''}">${escapeHTML(s.title)}</span>
        </label>
        
        <div class="flex items-center gap-1 shrink-0">
          <button onclick="confirmDeleteSchedule('${s.id}')" class="text-slate-300 hover:text-red-500 p-0.5 rounded" title="Hapus Jadwal">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="flex items-center gap-1.5 text-[11px] text-slate-600 bg-notion-sidebar px-2 py-1 rounded-lg border border-notion-border/70 truncate">
        <i data-lucide="book" class="w-3 h-3 text-amber-700 shrink-0"></i>
        <span class="truncate font-medium">${escapeHTML(s.bookTitle || 'Buku')}</span>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-notion-muted pt-1">
        <div class="flex items-center gap-1">
          <i data-lucide="calendar" class="w-3 h-3"></i>
          <span>${formatDateId(s.date)} ${s.time ? `• ${s.time}` : ''}</span>
        </div>
        ${s.targetPages ? `
          <div class="flex items-center gap-1 font-semibold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded">
            <i data-lucide="bookmark" class="w-2.5 h-2.5"></i>
            <span>${escapeHTML(s.targetPages)}</span>
          </div>
        ` : ''}
      </div>

      ${s.notes ? `
        <p class="text-[11px] text-slate-500 italic bg-amber-50/30 p-2 rounded-lg border border-amber-100/50">
          ${escapeHTML(s.notes)}
        </p>
      ` : ''}

      <div class="pt-2 border-t border-notion-border flex items-center justify-between text-[10px]">
        <span class="px-2 py-0.5 rounded font-semibold ${tagColorClass}">${escapeHTML(s.status)}</span>
        
        <div class="flex items-center gap-1">
          ${s.status !== 'Rencana' ? `
            <button onclick="moveScheduleStatus('${s.id}', 'Rencana')" class="hover:bg-slate-100 px-1.5 py-0.5 rounded text-slate-500" title="Pindah ke Rencana">← Rencana</button>
          ` : ''}
          ${s.status !== 'Sedang Berjalan' ? `
            <button onclick="moveScheduleStatus('${s.id}', 'Sedang Berjalan')" class="hover:bg-sky-50 px-1.5 py-0.5 rounded text-sky-700 font-medium" title="Jalankan Sesi">▶ Berjalan</button>
          ` : ''}
          ${s.status !== 'Selesai' ? `
            <button onclick="moveScheduleStatus('${s.id}', 'Selesai')" class="hover:bg-emerald-50 px-1.5 py-0.5 rounded text-emerald-700 font-medium" title="Selesaikan">✓ Selesai</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function createScheduleTableRowHTML(s) {
  const isDone = s.status === 'Selesai';
  const tagColor =
    s.status === 'Rencana'
      ? 'bg-amber-100 text-amber-800'
      : s.status === 'Sedang Berjalan'
      ? 'bg-sky-100 text-sky-800'
      : 'bg-emerald-100 text-emerald-800';

  return `
    <tr class="hover:bg-notion-sidebar/60 transition-colors">
      <td class="p-3 text-center">
        <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleScheduleComplete('${s.id}')" class="rounded border-slate-300 text-amber-700 focus:ring-amber-500 cursor-pointer" />
      </td>
      <td class="p-3 font-semibold text-slate-900 ${isDone ? 'line-through text-slate-400' : ''}">
        ${escapeHTML(s.title)}
      </td>
      <td class="p-3 text-slate-600 font-medium truncate max-w-xs">
        <div class="flex items-center gap-1.5">
          <i data-lucide="book" class="w-3.5 h-3.5 text-amber-700"></i>
          <span>${escapeHTML(s.bookTitle || '-')}</span>
        </div>
      </td>
      <td class="p-3 text-slate-500 whitespace-nowrap">
        ${formatDateId(s.date)} ${s.time ? `• ${s.time}` : ''}
      </td>
      <td class="p-3 text-slate-700 font-semibold">
        ${escapeHTML(s.targetPages || '-')}
      </td>
      <td class="p-3 text-right whitespace-nowrap">
        <span class="px-2 py-0.5 rounded font-bold text-[10px] ${tagColor} mr-2">${escapeHTML(s.status)}</span>
        <button onclick="confirmDeleteSchedule('${s.id}')" class="p-1 rounded text-slate-400 hover:text-red-600">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `;
}

function toggleScheduleView(view) {
  currentScheduleView = view;
  const boardEl = document.getElementById('schedule-board-container');
  const tableEl = document.getElementById('schedule-table-container');
  const boardBtn = document.getElementById('sched-view-board-btn');
  const tableBtn = document.getElementById('sched-view-table-btn');

  if (view === 'board') {
    boardEl.classList.remove('hidden');
    tableEl.classList.add('hidden');
    boardBtn.classList.add('bg-notion-sidebar', 'text-notion-text');
    tableBtn.classList.remove('bg-notion-sidebar', 'text-notion-text');
  } else {
    boardEl.classList.add('hidden');
    tableEl.classList.remove('hidden');
    tableBtn.classList.add('bg-notion-sidebar', 'text-notion-text');
    boardBtn.classList.remove('bg-notion-sidebar', 'text-notion-text');
  }
}

// ==============================================================================
// 8. SCHEDULE ACTIONS & MODAL
// ==============================================================================
function openAddScheduleModal(defaultStatus = 'Rencana') {
  if (!currentUser && !isGuestMode) {
    showToast('Silakan masuk dengan Akun Google atau masuk sebagai tamu!', 'warning');
    navigateTo('login');
    return;
  }

  document.getElementById('sched-edit-id').value = '';
  document.getElementById('sched-title-input').value = '';
  document.getElementById('sched-date-input').value = new Date().toISOString().split('T')[0];
  document.getElementById('sched-time-input').value = '19:00';
  document.getElementById('sched-target-pages').value = '';
  document.getElementById('sched-status-select').value = defaultStatus;
  document.getElementById('sched-notes-input').value = '';

  document.getElementById('modal-sched-title').textContent = 'Buat Jadwal Baca Baru';
  document.getElementById('modal-schedule').classList.remove('hidden');
}

function closeScheduleModal() {
  document.getElementById('modal-schedule').classList.add('hidden');
}

async function handleSaveSchedule(e) {
  e.preventDefault();

  const id = document.getElementById('sched-edit-id').value || `sched-${Date.now()}`;
  const title = document.getElementById('sched-title-input').value.trim();
  const bookId = document.getElementById('sched-book-select').value;
  const date = document.getElementById('sched-date-input').value;
  const time = document.getElementById('sched-time-input').value;
  const targetPages = document.getElementById('sched-target-pages').value.trim();
  const status = document.getElementById('sched-status-select').value;
  const notes = document.getElementById('sched-notes-input').value.trim();

  let bookTitle = 'Buku';
  if (bookId) {
    const book = await dataRepo.getBook(bookId);
    if (book) bookTitle = book.title;
  }

  const scheduleObj = {
    id,
    bookId,
    bookTitle,
    title,
    date,
    time,
    targetPages,
    status,
    completed: status === 'Selesai',
    notes,
    createdAt: new Date().toISOString()
  };

  await dataRepo.saveSchedule(scheduleObj);
  closeScheduleModal();
  showToast('Jadwal baca berhasil disimpan!', 'success');
  await loadAndSyncData();
  renderScheduleView();
}

async function moveScheduleStatus(id, newStatus) {
  const item = cachedSchedules.find((s) => s.id === id) || (await dataRepo.getAllSchedules()).find((s) => s.id === id);
  if (item) {
    item.status = newStatus;
    item.completed = newStatus === 'Selesai';
    await dataRepo.saveSchedule(item);
    await loadAndSyncData();
    renderScheduleView();
  }
}

async function toggleScheduleComplete(id) {
  const item = cachedSchedules.find((s) => s.id === id) || (await dataRepo.getAllSchedules()).find((s) => s.id === id);
  if (item) {
    if (item.status === 'Selesai') {
      item.status = 'Sedang Berjalan';
      item.completed = false;
    } else {
      item.status = 'Selesai';
      item.completed = true;
    }
    await dataRepo.saveSchedule(item);
    await loadAndSyncData();
    renderScheduleView();
  }
}

async function confirmDeleteSchedule(id) {
  if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
    await dataRepo.deleteSchedule(id);
    showToast('Jadwal berhasil dihapus', 'info');
    await loadAndSyncData();
    renderScheduleView();
  }
}

// ==============================================================================
// 9. BOOK MANAGEMENT & UPLOAD PDF
// ==============================================================================
function openAddBookModal() {
  if (!currentUser && !isGuestMode) {
    showToast('Silakan masuk dengan Akun Google terlebih dahulu untuk menambah buku!', 'warning');
    navigateTo('login');
    return;
  }

  document.getElementById('book-edit-id').value = '';
  document.getElementById('book-title-input').value = '';
  document.getElementById('book-author-input').value = '';
  document.getElementById('book-category-select').value = 'Keagamaan';
  document.getElementById('book-status-select').value = 'Belum Dibaca';
  document.getElementById('book-total-pages').value = '150';
  document.getElementById('book-current-page').value = '0';
  document.getElementById('book-notes-input').value = '';

  pendingPdfFile = null;
  document.getElementById('book-pdf-input').value = '';
  document.getElementById('pdf-selected-badge').classList.add('hidden');
  document.getElementById('pdf-upload-info').classList.remove('hidden');
  document.getElementById('pdf-existing-info').classList.add('hidden');

  document.getElementById('modal-book-title').textContent = 'Tambah Buku ke Rak';
  document.getElementById('modal-book').classList.remove('hidden');
}

async function openEditBookModal(bookId) {
  const book = await dataRepo.getBook(bookId);
  if (!book) return;

  document.getElementById('book-edit-id').value = book.id;
  document.getElementById('book-title-input').value = book.title;
  document.getElementById('book-author-input').value = book.author;
  document.getElementById('book-category-select').value = book.category;
  document.getElementById('book-status-select').value = book.status;
  document.getElementById('book-total-pages').value = book.totalPages || 100;
  document.getElementById('book-current-page').value = book.currentPage || 0;
  document.getElementById('book-notes-input').value = book.notes || '';

  pendingPdfFile = null;
  document.getElementById('book-pdf-input').value = '';

  if (book.pdfFileName || book.pdfUrl) {
    document.getElementById('pdf-selected-badge').classList.remove('hidden');
    document.getElementById('pdf-upload-info').classList.add('hidden');
    document.getElementById('pdf-filename-label').textContent = `Tersimpan: ${book.pdfFileName || 'Berkas PDF'}`;
    document.getElementById('pdf-existing-info').textContent =
      'Buku ini sudah memiliki file PDF di cloud/server. Unggah lagi jika ingin menggantinya.';
    document.getElementById('pdf-existing-info').classList.remove('hidden');
  } else {
    document.getElementById('pdf-selected-badge').classList.add('hidden');
    document.getElementById('pdf-upload-info').classList.remove('hidden');
    document.getElementById('pdf-existing-info').classList.add('hidden');
  }

  document.getElementById('modal-book-title').textContent = 'Edit Data Buku';
  document.getElementById('modal-book').classList.remove('hidden');
}

function closeBookModal() {
  document.getElementById('modal-book').classList.add('hidden');
}

function handlePdfSelected(event) {
  const file = event.target.files[0];
  if (file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Silakan pilih berkas format PDF!');
      event.target.value = '';
      return;
    }
    pendingPdfFile = file;
    document.getElementById('pdf-filename-label').textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    document.getElementById('pdf-selected-badge').classList.remove('hidden');
    document.getElementById('pdf-upload-info').classList.add('hidden');
  }
}

async function handleSaveBook(e) {
  e.preventDefault();

  const editId = document.getElementById('book-edit-id').value;
  const isEdit = !!editId;
  const id = isEdit ? editId : `book-${Date.now()}`;

  const title = document.getElementById('book-title-input').value.trim();
  const author = document.getElementById('book-author-input').value.trim();
  const category = document.getElementById('book-category-select').value;
  const status = document.getElementById('book-status-select').value;
  const totalPages = parseInt(document.getElementById('book-total-pages').value) || 100;
  const currentPage = parseInt(document.getElementById('book-current-page').value) || 0;
  const notes = document.getElementById('book-notes-input').value.trim();

  let existingBook = null;
  if (isEdit) {
    existingBook = await dataRepo.getBook(id);
  }

  const coverGradient =
    existingBook?.coverGradient ||
    (category === 'Keagamaan'
      ? 'from-emerald-700 to-teal-950'
      : category === 'Network Engineer'
      ? 'from-sky-700 to-slate-900'
      : 'from-amber-700 to-stone-900');

  let pdfUrl = existingBook ? existingBook.pdfUrl : null;
  let pdfFileName = existingBook ? existingBook.pdfFileName : null;
  let pdfBlob = existingBook ? existingBook.pdfBlob : null;

  // Handle PDF upload
  if (pendingPdfFile) {
    pdfFileName = pendingPdfFile.name;
    if (dataRepo.mode === 'supabase' && dataRepo.supabase) {
      showToast('Mengunggah file PDF ke Cloud Database...', 'info');
      try {
        const uploadRes = await dataRepo.uploadPdfFile(pendingPdfFile);
        if (uploadRes) {
          pdfUrl = uploadRes.url;
          pdfFileName = uploadRes.fileName || pendingPdfFile.name;
          pdfBlob = null;
        }
      } catch (uploadErr) {
        console.error(uploadErr);
        showToast(`Upload gagal: ${uploadErr.message}`, 'error');
        return;
      }
    } else {
      // Mode offline/lokal: simpan PDF ke IndexedDB lokal laptop
      pdfBlob = pendingPdfFile;
      pdfUrl = null;
    }
  }

  const bookData = {
    id,
    title,
    author,
    category,
    status,
    totalPages,
    currentPage,
    notes,
    coverGradient,
    pdfUrl,
    pdfFileName,
    pdfBlob,
    createdAt: existingBook ? existingBook.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await dataRepo.saveBook(bookData);
    closeBookModal();
    if (dataRepo.mode === 'supabase') {
      showToast(`Buku "${title}" berhasil disimpan di Cloud! Tersinkron di semua HP & PC.`, 'success');
    } else {
      showToast(`Buku "${title}" tersimpan di memori laptop. Hubungkan "Cloud Sync" di atas agar buku muncul di HP!`, 'warning');
    }

    await loadAndSyncData();
    if (currentView === 'dashboard') {
      renderDashboardView();
    } else if (currentView === 'landing') {
      renderLandingView();
    }
  } catch (saveErr) {
    console.error(saveErr);
    showToast(`Gagal menyimpan: ${saveErr.message}`, 'error');
  }
}

async function confirmDeleteBook(id) {
  const book = await dataRepo.getBook(id);
  const title = book ? book.title : 'buku ini';

  if (confirm(`Apakah Anda yakin ingin menghapus "${title}" dari rak perpustakaan?`)) {
    await dataRepo.deleteBook(id);
    showToast('Buku telah dihapus dari perpustakaan.', 'info');
    await loadAndSyncData();
    renderDashboardView();
  }
}

// ==============================================================================
// 10. PDF VIEWER / READER MODAL (INTERNAL)
// ==============================================================================
async function openPdfReader(bookId) {
  if (!currentUser && !isGuestMode) {
    showToast('Silakan masuk dengan Akun Google terlebih dahulu untuk membaca buku!', 'warning');
    navigateTo('login');
    return;
  }

  const book = await dataRepo.getBook(bookId);
  if (!book || (!book.pdfUrl && !book.pdfBlob)) {
    showToast('Berkas PDF tidak ditemukan pada buku ini.', 'warning');
    return;
  }

  let finalPdfUrl = book.pdfUrl;

  if (!finalPdfUrl && book.pdfBlob) {
    if (activePdfObjectUrl) {
      URL.revokeObjectURL(activePdfObjectUrl);
    }
    activePdfObjectUrl = URL.createObjectURL(book.pdfBlob);
    finalPdfUrl = activePdfObjectUrl;
  }

  document.getElementById('pdf-modal-title').textContent = book.title;
  document.getElementById('pdf-modal-author').textContent = `Penulis: ${book.author} • ${book.category}`;

  const dlBtn = document.getElementById('pdf-download-btn');
  dlBtn.href = finalPdfUrl;
  dlBtn.download = book.pdfFileName || `${book.title}.pdf`;

  const openTabBtn = document.getElementById('pdf-open-tab-btn');
  openTabBtn.href = finalPdfUrl;

  const fallbackLink = document.getElementById('pdf-fallback-link');
  fallbackLink.href = finalPdfUrl;

  const iframe = document.getElementById('pdf-frame');
  iframe.src = finalPdfUrl;

  document.getElementById('modal-pdf-reader').classList.remove('hidden');
}

function closePdfReader() {
  const modal = document.getElementById('modal-pdf-reader');
  modal.classList.add('hidden');

  const iframe = document.getElementById('pdf-frame');
  iframe.src = '';

  if (activePdfObjectUrl) {
    URL.revokeObjectURL(activePdfObjectUrl);
    activePdfObjectUrl = null;
  }
}

// ==============================================================================
// 11. SUPABASE CLOUD CONFIGURATION MODAL
// ==============================================================================
function openCloudConfigModal() {
  const storedUrl = localStorage.getItem('PERPUS_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  const storedKey = localStorage.getItem('PERPUS_SUPABASE_KEY') || DEFAULT_SUPABASE_KEY;

  document.getElementById('cloud-supabase-url').value = storedUrl || '';
  document.getElementById('cloud-supabase-key').value = storedKey || '';

  dataRepo.updateCloudStatusUI(
    isSupabaseActive,
    isSupabaseActive
      ? 'Supabase Cloud Aktif (Sinkron di Vercel)'
      : 'Belum Terhubung ke Supabase Cloud'
  );

  document.getElementById('modal-cloud-config').classList.remove('hidden');
}

function closeCloudConfigModal() {
  document.getElementById('modal-cloud-config').classList.add('hidden');
}

async function handleSaveCloudConfig(e) {
  e.preventDefault();
  const url = document.getElementById('cloud-supabase-url').value.trim();
  const key = document.getElementById('cloud-supabase-key').value.trim();

  if (!url || !key) {
    alert('Harap isi Project URL dan Anon Key Supabase Anda!');
    return;
  }

  showToast('Menguji koneksi ke Supabase Cloud...', 'info');

  try {
    const testClient = window.supabase.createClient(url, key);
    const { error } = await testClient.from('books').select('id').limit(1);

    if (error) {
      alert(`Gagal terhubung ke Supabase: ${error.message}\n\nPastikan Anda sudah menjalankan script SQL tabel di menu SQL Editor Supabase!`);
      return;
    }

    localStorage.setItem('PERPUS_SUPABASE_URL', url);
    localStorage.setItem('PERPUS_SUPABASE_KEY', key);

    dataRepo.supabase = testClient;
    dataRepo.mode = 'supabase';
    isSupabaseActive = true;
    supabaseClient = testClient;

    dataRepo.updateCloudStatusUI(true, 'Supabase Cloud Aktif (Sinkron di Vercel)');
    closeCloudConfigModal();
    showToast('Berhasil terhubung ke Supabase Cloud! Data sekarang otomatis tersinkron di HP & PC.', 'success');

    // Sinkronkan buku lokal di IndexedDB jika ada yang belum terunggah ke Cloud
    await dataRepo.syncLocalBooksToCloud();

    // Reload tampilan dengan data cloud dan inisialisasi autentikasi
    await loadAndSyncData();
    await initAuth();
    renderDashboardView();
    renderLandingView();
    renderScheduleView();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function handleDisconnectCloud() {
  if (confirm('Putuskan koneksi dari Supabase Cloud dan kembali ke penyimpanan lokal?')) {
    localStorage.removeItem('PERPUS_SUPABASE_URL');
    localStorage.removeItem('PERPUS_SUPABASE_KEY');
    dataRepo.mode = 'indexeddb';
    isSupabaseActive = false;
    supabaseClient = null;
    updateAuthUI();
    dataRepo.updateCloudStatusUI(false, 'Mode Lokal (Belum Terhubung Cloud)');
    closeCloudConfigModal();
    showToast('Koneksi Cloud diputuskan. Beralih ke penyimpanan lokal.', 'info');
    loadAndSyncData().then(() => {
      renderDashboardView();
      renderLandingView();
      renderScheduleView();
    });
  }
}

function copySupabaseSQLScript() {
  const sql = `-- ==========================================
-- SCRIPT TABEL PERPUSTAKAAN MANDIRI (SUPABASE)
-- Jalankan di SQL Editor Supabase Dashboard
-- ==========================================

-- 1. Tabel Buku
create table if not exists books (
  id text primary key,
  title text not null,
  author text not null,
  category text not null,
  total_pages int default 100,
  current_page int default 0,
  status text default 'Belum Dibaca',
  notes text,
  cover_gradient text,
  pdf_url text,
  pdf_file_name text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Tabel Jadwal Baca (Notion)
create table if not exists schedules (
  id text primary key,
  book_id text,
  book_title text,
  title text not null,
  date text,
  time text,
  target_pages text,
  status text default 'Rencana',
  completed boolean default false,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Kebijakan Keamanan (Izinkan Baca & Tulis Bebas)
alter table books enable row level security;
alter table schedules enable row level security;

create policy "Akses bebas tabel books" on books for all using (true) with check (true);
create policy "Akses bebas tabel schedules" on schedules for all using (true) with check (true);

-- 4. Buat Storage Bucket untuk File PDF
insert into storage.buckets (id, name, public) 
values ('books-pdf', 'books-pdf', true)
on conflict (id) do nothing;

create policy "Akses publik upload file PDF" on storage.objects 
for all using (bucket_id = 'books-pdf') with check (bucket_id = 'books-pdf');
`;

  navigator.clipboard.writeText(sql).then(() => {
    const btnText = document.getElementById('copy-sql-btn-text');
    btnText.textContent = 'Tersalin! ✓';
    setTimeout(() => {
      btnText.textContent = 'Salin SQL';
    }, 2000);
    showToast('Script SQL berhasil disalin! Buka menu SQL Editor di Supabase lalu paste & RUN.', 'success');
  });
}

// ==============================================================================
// 12. MOBILE SYNC MODAL & QR CODE
// ==============================================================================
function toggleMobileActionMenu() {
  const menu = document.getElementById('mobileActionDropdown');
  if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('mobileActionMenuBtn');
  const menu = document.getElementById('mobileActionDropdown');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

async function openMobileSyncModal() {
  const supaUrl = DEFAULT_SUPABASE_URL || localStorage.getItem('PERPUS_SUPABASE_URL');
  const supaKey = DEFAULT_SUPABASE_KEY || localStorage.getItem('PERPUS_SUPABASE_KEY');

  let targetUrl = window.location.href;
  const isCloud = isSupabaseActive && supaUrl && supaKey;

  if (isCloud) {
    try {
      const urlObj = new URL(window.location.origin + window.location.pathname);
      urlObj.searchParams.set('sb_url', supaUrl);
      urlObj.searchParams.set('sb_key', supaKey);
      targetUrl = urlObj.href;
    } catch {
      targetUrl = window.location.href;
    }
  } else if (serverInfo && serverInfo.publicUrl) {
    targetUrl = serverInfo.publicUrl;
  }

  const inputEl = document.getElementById('mobile-url-input');
  if (inputEl) inputEl.value = targetUrl;

  const badgeText = document.getElementById('mobile-sync-badge-text');
  const badgePill = document.getElementById('mobile-sync-mode-pill');
  if (badgeText && badgePill) {
    if (isCloud) {
      badgeText.textContent = 'Terhubung via Supabase Cloud (Otomatis Sinkron di HP & PC)';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mb-3';
    } else if (serverInfo && serverInfo.publicUrl) {
      badgeText.textContent = 'Link Internet Publik Cloudflare Aktif';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mb-3';
    } else {
      badgeText.textContent = 'Tips: Hubungkan ke Supabase agar data Vercel otomatis sinkron!';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 mb-3';
    }
  }

  const qrImg = document.getElementById('qr-code-img');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}&margin=10`;
  }

  document.getElementById('modal-mobile-sync').classList.remove('hidden');
}

function closeMobileSyncModal() {
  document.getElementById('modal-mobile-sync').classList.add('hidden');
}

function copyMobileUrl() {
  const input = document.getElementById('mobile-url-input');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    const btnText = document.getElementById('copy-btn-text');
    btnText.textContent = 'Tersalin! ✓';
    setTimeout(() => {
      btnText.textContent = 'Salin';
    }, 2000);
    showToast('Tautan berhasil disalin ke papan klip!', 'success');
  });
}

async function cleanMobileCacheAndReload() {
  if (confirm('Bersihkan seluruh memori dan cache di HP ini? Halaman akan dimuat ulang dalam kondisi kosong bersih.')) {
    try {
      if (window.indexedDB) {
        indexedDB.deleteDatabase(DB_NAME);
      }
      localStorage.removeItem('PERPUS_SUPABASE_URL');
      localStorage.removeItem('PERPUS_SUPABASE_KEY');
      sessionStorage.clear();
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    } catch (e) {
      console.warn(e);
    }
    showToast('Cache HP telah dibersihkan! Memuat ulang...', 'success');
    setTimeout(() => {
      window.location.reload(true);
    }, 500);
  }
}

// ==============================================================================
// 13. FILTER & SEARCH HANDLERS
// ==============================================================================
function filterCategory(cat) {
  selectedCategory = cat;

  const pills = ['all', 'keagamaan', 'network', 'lainnya'];
  pills.forEach((p) => {
    const el = document.getElementById(`tab-cat-${p}`);
    if (el) {
      if (
        (cat === 'all' && p === 'all') ||
        (cat === 'Keagamaan' && p === 'keagamaan') ||
        (cat === 'Network Engineer' && p === 'network') ||
        (cat === 'Lainnya' && p === 'lainnya')
      ) {
        el.className =
          'cat-pill active px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap bg-amber-700 text-white';
      } else {
        el.className =
          'cat-pill px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5 whitespace-nowrap';
      }
    }
  });

  renderDashboardView();
}

function handleBookSearch() {
  currentSearchTerm = document.getElementById('bookSearchInput').value;
  currentStatusFilter = document.getElementById('statusFilterSelect').value;
  renderDashboardView();
}

// ==============================================================================
// 14. BACKUP, EXPORT & RESTORE DATA
// ==============================================================================
function toggleDataMenu() {
  const menu = document.getElementById('dataMenuDropdown');
  menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('dataMenuBtn');
  const menu = document.getElementById('dataMenuDropdown');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

async function exportLibraryData() {
  toggleDataMenu();
  const books = await dataRepo.getAllBooks();
  const schedules = await dataRepo.getAllSchedules();

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    appName: 'Perpustakaan Mandiri',
    books: books,
    schedules: schedules
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Backup_Perpustakaan_Mandiri_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Cadangan data berhasil diunduh (JSON).', 'success');
}

async function importLibraryData(event) {
  toggleDataMenu();
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.books && Array.isArray(data.books)) {
      for (const b of data.books) {
        await dataRepo.saveBook(b);
      }
    }

    if (data.schedules && Array.isArray(data.schedules)) {
      for (const s of data.schedules) {
        await dataRepo.saveSchedule(s);
      }
    }

    showToast('Data perpustakaan berhasil dipulihkan!', 'success');
    await loadAndSyncData();
    renderDashboardView();
    renderLandingView();
    renderScheduleView();
  } catch (err) {
    console.error('Import error:', err);
    showToast('Gagal memuat file. Format tidak valid.', 'error');
  } finally {
    event.target.value = '';
  }
}

async function confirmResetData() {
  toggleDataMenu();
  if (confirm('Apakah Anda yakin ingin mengosongkan seluruh data buku dan jadwal baca? Database akan kembali kosong bersih.')) {
    await dataRepo.resetData();
    showToast('Seluruh data perpustakaan telah dikosongkan.', 'info');
    await loadAndSyncData();
    renderDashboardView();
    renderLandingView();
    renderScheduleView();
  }
}

// ==============================================================================
// 15. TOAST NOTIFICATION UTILITY
// ==============================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const typeStyles = {
    success: 'bg-emerald-900/95 text-emerald-100 border-emerald-700',
    warning: 'bg-amber-900/95 text-amber-100 border-amber-700',
    error: 'bg-red-900/95 text-red-100 border-red-700',
    info: 'bg-slate-900/95 text-slate-100 border-slate-700'
  };

  const icons = {
    success: 'check-circle-2',
    warning: 'alert-triangle',
    error: 'x-circle',
    info: 'info'
  };

  toast.className = `toast-item px-4 py-3 rounded-2xl border shadow-xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md ${typeStyles[type] || typeStyles.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================================================================
// 16. UTILITIES (DATE FORMATTER & ESCAPING)
// ==============================================================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateId(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// ==============================================================================
// 17. AUTHENTICATION & GOOGLE LOGIN (SUPABASE OAUTH & DEMO MODE)
// ==============================================================================

function renderLoginView() {
  updateAuthUI();
  lucide.createIcons();
}

async function initAuth() {
  const activeSession = sessionStorage.getItem('PERPUS_ACTIVE_SESSION');
  const storedDemoUser = localStorage.getItem('PERPUS_DEMO_USER');
  let savedName = 'Harits';

  if (storedDemoUser) {
    try {
      const parsed = JSON.parse(storedDemoUser);
      savedName = parsed.user_metadata?.full_name || parsed.name || 'Harits';
      if (activeSession === 'true') {
        currentUser = parsed;
        isGuestMode = false;
      }
    } catch {
      currentUser = null;
    }
  } else if (activeSession === 'guest') {
    isGuestMode = true;
    currentUser = null;
  }

  // Pre-fill input form login dengan nama yang tersimpan
  const accountInput = document.getElementById('loginAccountInput');
  if (accountInput && savedName) {
    accountInput.value = savedName;
  }

  // 2. Jika Supabase client aktif dan ada sesi aktif resmi
  if (supabaseClient && activeSession === 'true') {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        currentUser = session.user;
        localStorage.removeItem('PERPUS_DEMO_USER');
      }

      // Pasang listener status autentikasi real-time Supabase
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        console.log('Supabase Auth Change Event:', event);
        if (session && session.user) {
          currentUser = session.user;
          sessionStorage.setItem('PERPUS_ACTIVE_SESSION', 'true');
          localStorage.removeItem('PERPUS_DEMO_USER');
          showToast(`Selamat datang, ${currentUser.user_metadata?.full_name || currentUser.email}!`, 'success');
          updateAuthUI();
          if (currentView === 'login') {
            navigateTo('dashboard');
          }
        } else if (event === 'SIGNED_OUT') {
          currentUser = null;
          sessionStorage.removeItem('PERPUS_ACTIVE_SESSION');
          localStorage.removeItem('PERPUS_DEMO_USER');
          updateAuthUI();
        }
      });
    } catch (err) {
      console.warn('Auth getSession error:', err);
    }
  }

  // 3. Cek apakah ada error di URL hash dari proses redirect OAuth
  if (window.location.hash && window.location.hash.includes('error=')) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const errorMsg = hashParams.get('error_description') || hashParams.get('error');
      if (errorMsg) {
        console.warn('OAuth URL redirect notice:', errorMsg);
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {
      console.warn('OAuth URL error parsing:', e);
    }
  }

  updateAuthUI();
}

function updateAuthUI() {
  const isAuth = !!currentUser;

  // Nama, avatar, email pengguna
  let userName = 'Pengguna';
  let userEmail = 'pengguna@gmail.com';
  let userAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

  if (currentUser) {
    userName = currentUser.user_metadata?.full_name || 
               currentUser.user_metadata?.name || 
               (currentUser.email ? currentUser.email.split('@')[0] : 'Pengguna');
    userEmail = currentUser.email || 'pengguna@gmail.com';
    userAvatar = currentUser.user_metadata?.avatar_url || 
                 currentUser.user_metadata?.picture || 
                 `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=ea4335&color=fff&bold=true`;
  }

  // 0. Dashboard Header Account Display (Tampilkan nama HANYA jika login, sembunyikan jika Guest/Lewati)
  const dashboardUserBadge = document.getElementById('dashboardUserBadge');
  const dashboardUserBadgeName = document.getElementById('dashboardUserBadgeName');
  const dashboardSubHeading = document.getElementById('dashboardSubHeading');

  if (isAuth && currentUser) {
    if (dashboardUserBadge) {
      dashboardUserBadge.classList.remove('hidden');
      dashboardUserBadge.classList.add('inline-flex');
    }
    if (dashboardUserBadgeName) {
      dashboardUserBadgeName.textContent = userName;
    }
    if (dashboardSubHeading) {
      dashboardSubHeading.textContent = `Selamat datang, ${userName}! Kelola koleksi buku fisik & digital Anda di satu rak yang rapi.`;
    }
  } else {
    // Mode Guest / Lewati / Belum Login: TIDAK ADA NAMA AKUN DI DASHBOARD
    if (dashboardUserBadge) {
      dashboardUserBadge.classList.add('hidden');
      dashboardUserBadge.classList.remove('inline-flex');
    }
    if (dashboardSubHeading) {
      dashboardSubHeading.textContent = 'Kelola koleksi buku fisik & digital Anda di satu rak yang rapi.';
    }
  }

  // 1. Desktop Navbar Tab Text
  const navLoginText = document.getElementById('nav-login-text');
  if (navLoginText) {
    navLoginText.textContent = isAuth ? userName.split(' ')[0] : 'Akun Google';
  }

  // 2. Desktop Header Buttons
  const desktopLoginBtn = document.getElementById('desktopLoginBtn');
  const desktopUserPill = document.getElementById('desktopUserPill');
  const desktopUserAvatar = document.getElementById('desktopUserAvatar');
  const desktopUserName = document.getElementById('desktopUserName');
  const dropdownUserFullName = document.getElementById('dropdownUserFullName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');

  if (desktopLoginBtn && desktopUserPill) {
    if (isAuth) {
      desktopLoginBtn.classList.add('hidden');
      desktopUserPill.classList.remove('hidden');
      if (desktopUserAvatar) desktopUserAvatar.src = userAvatar;
      if (desktopUserName) desktopUserName.textContent = userName.split(' ')[0];
      if (dropdownUserFullName) dropdownUserFullName.textContent = userName;
      if (dropdownUserEmail) dropdownUserEmail.textContent = userEmail;
    } else {
      desktopLoginBtn.classList.remove('hidden');
      desktopUserPill.classList.add('hidden');
    }
  }

  // 3. Mobile Dropdown Menu
  const mobileLoggedOut = document.getElementById('mobileLoggedOutContainer');
  const mobileLoggedIn = document.getElementById('mobileLoggedInContainer');
  const mobileUserAvatar = document.getElementById('mobileUserAvatar');
  const mobileUserName = document.getElementById('mobileUserName');
  const mobileUserEmail = document.getElementById('mobileUserEmail');

  if (mobileLoggedOut && mobileLoggedIn) {
    if (isAuth) {
      mobileLoggedOut.classList.add('hidden');
      mobileLoggedIn.classList.remove('hidden');
      if (mobileUserAvatar) mobileUserAvatar.src = userAvatar;
      if (mobileUserName) mobileUserName.textContent = userName;
      if (mobileUserEmail) mobileUserEmail.textContent = userEmail;
    } else {
      mobileLoggedOut.classList.remove('hidden');
      mobileLoggedIn.classList.add('hidden');
    }
  }

  // 4. Mobile Bottom Dock Label
  const mobileDockLabel = document.getElementById('mobile-nav-login-label');
  if (mobileDockLabel) {
    mobileDockLabel.textContent = isAuth ? (userName.split(' ')[0] || 'Akun') : 'Akun';
  }

  // 5. Dedicated View Login Page
  const viewLoggedOut = document.getElementById('login-view-logged-out');
  const viewLoggedIn = document.getElementById('login-view-logged-in');
  const loginProfileAvatar = document.getElementById('loginProfileAvatar');
  const loginProfileName = document.getElementById('loginProfileName');
  const loginProfileEmailText = document.getElementById('loginProfileEmailText');
  const userStatTotalBooks = document.getElementById('userStatTotalBooks');
  const userStatTotalSchedules = document.getElementById('userStatTotalSchedules');
  const loginProfileSyncStatus = document.getElementById('loginProfileSyncStatus');

  if (viewLoggedOut && viewLoggedIn) {
    if (isAuth) {
      viewLoggedOut.classList.add('hidden');
      viewLoggedIn.classList.remove('hidden');
      if (loginProfileAvatar) loginProfileAvatar.src = userAvatar;
      if (loginProfileName) loginProfileName.textContent = userName;
      if (loginProfileEmailText) loginProfileEmailText.textContent = userEmail;
      if (userStatTotalBooks) userStatTotalBooks.textContent = cachedBooks.length;
      if (userStatTotalSchedules) userStatTotalSchedules.textContent = cachedSchedules.length;
      if (loginProfileSyncStatus) {
        loginProfileSyncStatus.textContent = isSupabaseActive 
          ? 'Cloud Supabase Aktif' 
          : 'Penyimpanan Lokal Aktif';
      }
    } else {
      viewLoggedOut.classList.remove('hidden');
      viewLoggedIn.classList.add('hidden');
    }
  }

  lucide.createIcons();
}

function openGoogleInputModal() {
  const modal = document.getElementById('modal-google-input');
  if (modal) modal.classList.remove('hidden');
}

function closeGoogleInputModal() {
  const modal = document.getElementById('modal-google-input');
  if (modal) modal.classList.add('hidden');
}

async function signInWithGoogle() {
  openGoogleInputModal();
}

function selectQuickGoogleAccount(name = 'Harits', email = 'harits.mandiri@gmail.com') {
  currentUser = {
    id: 'google-user-' + Date.now(),
    email: email,
    user_metadata: {
      full_name: name,
      name: name,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ea4335&color=fff&bold=true`
    },
    app_metadata: {
      provider: 'google'
    }
  };
  isGuestMode = false;
  localStorage.setItem('PERPUS_DEMO_USER', JSON.stringify(currentUser));
  localStorage.removeItem('PERPUS_GUEST_MODE');
  closeGoogleInputModal();
  closeAuthModal();
  updateAuthUI();
  showToast(`Selamat datang, ${name}!`, 'success');
  navigateTo('dashboard');
}

function handleCustomGoogleSignIn(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('customGoogleNameInput');
  const emailInput = document.getElementById('customGoogleEmailInput');
  const name = (nameInput && nameInput.value.trim()) || 'Harits';
  const email = (emailInput && emailInput.value.trim()) || 'harits.mandiri@gmail.com';
  selectQuickGoogleAccount(name, email);
}

function toggleLoginPasswordVisibility() {
  const passInput = document.getElementById('loginPasswordInput');
  const eyeIcon = document.getElementById('loginPasswordEyeIcon');
  if (!passInput) return;
  if (passInput.type === 'password') {
    passInput.type = 'text';
    if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye-off');
  } else {
    passInput.type = 'password';
    if (eyeIcon) eyeIcon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

function handleAccountPasswordLogin(e) {
  if (e) e.preventDefault();
  const accountInput = document.getElementById('loginAccountInput');
  const passInput = document.getElementById('loginPasswordInput');
  
  const rawAccount = (accountInput && accountInput.value.trim()) || 'Harits';
  const password = passInput ? passInput.value : '';

  currentUser = {
    id: 'user-' + Date.now(),
    email: rawAccount.includes('@') ? rawAccount : `${rawAccount.toLowerCase().replace(/\s+/g, '.')}@mandiri.local`,
    user_metadata: {
      full_name: rawAccount,
      name: rawAccount,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(rawAccount)}&background=845136&color=fff&bold=true`
    },
    app_metadata: {
      provider: 'account'
    }
  };
  isGuestMode = false;
  sessionStorage.setItem('PERPUS_ACTIVE_SESSION', 'true');
  localStorage.setItem('PERPUS_DEMO_USER', JSON.stringify(currentUser));
  localStorage.removeItem('PERPUS_GUEST_MODE');
  closeAuthModal();
  updateAuthUI();
  showToast(`Selamat datang, ${rawAccount}! Berhasil masuk ke dashboard.`, 'success');
  navigateTo('dashboard');
}

function skipLoginToDashboard() {
  currentUser = null;
  isGuestMode = true;
  sessionStorage.setItem('PERPUS_ACTIVE_SESSION', 'guest');
  localStorage.setItem('PERPUS_GUEST_MODE', 'true');
  localStorage.removeItem('PERPUS_DEMO_USER');
  closeGoogleInputModal();
  closeAuthModal();
  updateAuthUI();
  showToast('Masuk sebagai Tamu (tanpa nama akun).', 'info');
  navigateTo('dashboard');
}

async function signOutUser() {
  if (confirm('Apakah Anda yakin ingin keluar dari akun?')) {
    sessionStorage.removeItem('PERPUS_ACTIVE_SESSION');
    localStorage.removeItem('PERPUS_DEMO_USER');
    localStorage.removeItem('PERPUS_GUEST_MODE');
    if (supabaseClient) {
      try {
        await supabaseClient.auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }
    currentUser = null;
    isGuestMode = false;
    updateAuthUI();
    showToast('Berhasil keluar dari akun.', 'info');
    navigateTo('login');
  }
}

function toggleUserDropdown() {
  const menu = document.getElementById('desktopUserDropdown');
  if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('desktopUserBtn');
  const menu = document.getElementById('desktopUserDropdown');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function openAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (modal) modal.classList.add('hidden');
}

// ==============================================================================
// 18. INITIALIZATION ON PAGE LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    initTheme();
    await dataRepo.init();
    await seedDefaultDataIfEmpty();
    await loadAndSyncData();
    await initAuth();
    
    // Portal Masuk: Wajib buka halaman Login terlebih dahulu sebelum masuk ke dashboard!
    // Hanya jika ada sesi aktif yang sudah login atau memilih tamu pada tab peramban ini yang langsung ke dashboard
    const activeSession = sessionStorage.getItem('PERPUS_ACTIVE_SESSION');
    if (activeSession === 'true' && currentUser) {
      navigateTo('dashboard');
    } else if (activeSession === 'guest' && isGuestMode) {
      navigateTo('dashboard');
    } else {
      navigateTo('login');
    }
    lucide.createIcons();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Gagal memuat sistem perpustakaan.', 'error');
  }
});
