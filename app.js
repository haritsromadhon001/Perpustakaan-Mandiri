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
const DEFAULT_SUPABASE_URL = "";  // Contoh: "https://xyzproject.supabase.co"
const DEFAULT_SUPABASE_KEY = "";  // Contoh: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Global State
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

  async init() {
    // 1. Selalu bersihkan buku dummy lawas di memori HP jika ada
    await this.purgeLegacyLocalData();

    // 2. Cek apakah ada konfigurasi Supabase (dari variabel kode atau dari memori input)
    const storedUrl = localStorage.getItem('PERPUS_SUPABASE_URL');
    const storedKey = localStorage.getItem('PERPUS_SUPABASE_KEY');
    const supaUrl = DEFAULT_SUPABASE_URL || storedUrl;
    const supaKey = DEFAULT_SUPABASE_KEY || storedKey;

    if (supaUrl && supaKey && window.supabase) {
      try {
        this.supabase = window.supabase.createClient(supaUrl, supaKey);
        // Test query sederhana untuk memastikan koneksi valid
        const { error } = await this.supabase.from('books').select('id').limit(1);
        if (!error) {
          this.mode = 'supabase';
          isSupabaseActive = true;
          supabaseClient = this.supabase;
          this.updateCloudStatusUI(true, 'Supabase Cloud Aktif (Sinkron di Vercel)');
          console.log('⚡ Terhubung ke Supabase Cloud Database!');
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
      // Server lokal tidak aktif (misal dibuka langsung di Vercel tanpa Supabase)
      isServerOnline = false;
    }

    // 4. Fallback terakhir: Browser IndexedDB lokal
    this.mode = 'indexeddb';
    this.updateCloudStatusUI(false, 'Mode Lokal (Belum Terhubung Cloud)');
    return new Promise((resolve, reject) => {
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
        resolve();
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  updateCloudStatusUI(isOnline, statusText) {
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    const banner = document.getElementById('cloud-modal-status-banner');
    const bannerText = document.getElementById('cloud-modal-status-text');

    if (dot && text) {
      if (isOnline) {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50';
        text.textContent = 'Cloud Aktif ✓';
      } else {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
        text.textContent = 'Cloud Sync';
      }
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
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve();
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('books')) return resolve();
          const tx = db.transaction(['books', 'schedules'], 'readwrite');
          const bookStore = tx.objectStore('books');
          const schedStore = tx.objectStore('schedules');

          const dummyIds = ['book-1', 'book-2', 'book-3', 'book-4', 'book-5'];
          dummyIds.forEach((id) => bookStore.delete(id));

          const dummyScheds = ['sched-1', 'sched-2', 'sched-3', 'sched-4'];
          dummyScheds.forEach((id) => schedStore.delete(id));

          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
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
            title: b.title,
            author: b.author,
            category: b.category,
            totalPages: b.total_pages || 100,
            currentPage: b.current_page || 0,
            status: b.status || 'Belum Dibaca',
            notes: b.notes || '',
            coverGradient: b.cover_gradient,
            pdfUrl: b.pdf_url,
            pdfFileName: b.pdf_file_name,
            createdAt: b.created_at
          }));
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
    return new Promise((resolve) => {
      if (!this.idb) return resolve([]);
      const tx = this.idb.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
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
        title: book.title,
        author: book.author,
        category: book.category,
        total_pages: book.totalPages,
        current_page: book.currentPage,
        status: book.status,
        notes: book.notes,
        cover_gradient: book.coverGradient,
        pdf_url: book.pdfUrl,
        pdf_file_name: book.pdfFileName,
        created_at: book.createdAt || new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('books')
        .upsert([payload]);

      if (error) throw error;
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
    return new Promise((resolve, reject) => {
      if (!this.idb) return resolve(book);
      const tx = this.idb.transaction('books', 'readwrite');
      const store = tx.objectStore('books');
      const req = store.put(book);
      req.onsuccess = () => resolve(book);
      req.onerror = () => reject(req.error);
    });
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
// 2. INITIALIZATION HELPER (STARTS COMPLETELY EMPTY)
// ==============================================================================
async function seedDefaultDataIfEmpty() {
  // Website dibiarkan dalam kondisi bersih & kosong agar pengguna dapat menambahkan koleksi sendiri.
}

// ==============================================================================
// 3. NAVIGATION & VIEW CONTROLLER
// ==============================================================================
function navigateTo(viewName) {
  currentView = viewName;

  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-schedule').classList.add('hidden');

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  const navIds = ['landing', 'dashboard', 'schedule'];
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
  });

  if (viewName === 'landing') {
    renderLandingView();
  } else if (viewName === 'dashboard') {
    renderDashboardView();
  } else if (viewName === 'schedule') {
    renderScheduleView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==============================================================================
// 4. DASHBOARD & RAK BUKU RENDERING
// ==============================================================================
async function renderDashboardView() {
  const books = await dataRepo.getAllBooks();
  updateStatistics(books);

  const container = document.getElementById('bookshelf-grid');
  const emptyState = document.getElementById('empty-bookshelf');

  let filtered = books.filter((book) => {
    const matchCat =
      selectedCategory === 'all' ||
      book.category.toLowerCase() === selectedCategory.toLowerCase();

    const searchLow = currentSearchTerm.toLowerCase();
    const matchSearch =
      !currentSearchTerm ||
      book.title.toLowerCase().includes(searchLow) ||
      book.author.toLowerCase().includes(searchLow) ||
      (book.notes && book.notes.toLowerCase().includes(searchLow));

    const matchStatus =
      currentStatusFilter === 'all' || book.status === currentStatusFilter;

    return matchCat && matchSearch && matchStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  container.innerHTML = filtered.map((book) => createBookCardHTML(book)).join('');
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

  const statusColor =
    book.status === 'Selesai'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : book.status === 'Sedang Dibaca'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

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
            <span class="px-2 py-0.5 rounded text-[11px] font-medium border ${statusColor}">
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

      <div class="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
        ${hasPdf ? `
          <button onclick="openPdfReader('${book.id}')" class="flex-1 py-2 px-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors">
            <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Baca PDF
          </button>
        ` : `
          <button onclick="openEditBookModal('${book.id}')" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition-colors">
            <i data-lucide="file-up" class="w-3.5 h-3.5 text-amber-700"></i> Upload PDF
          </button>
        `}

        <div class="flex items-center gap-1">
          <button onclick="openEditBookModal('${book.id}')" class="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="Edit Detail">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="confirmDeleteBook('${book.id}')" class="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Hapus Buku">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==============================================================================
// 5. STATISTICS & COUNTERS UPDATE
// ==============================================================================
async function updateStatistics(books) {
  if (!books) books = await dataRepo.getAllBooks();
  const schedules = await dataRepo.getAllSchedules();

  const total = books.length;
  const keagamaanCount = books.filter((b) => b.category === 'Keagamaan').length;
  const networkCount = books.filter((b) => b.category === 'Network Engineer').length;
  const othersCount = total - keagamaanCount - networkCount;

  const pdfCount = books.filter((b) => !!(b.pdfUrl || b.pdfBlob)).length;
  const completedCount = books.filter((b) => b.status === 'Selesai').length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const activeSchedules = schedules.filter((s) => s.status !== 'Selesai').length;

  document.getElementById('stat-total-books').textContent = total;
  document.getElementById('stat-keagamaan-books').textContent = keagamaanCount;
  document.getElementById('stat-network-books').textContent = networkCount;
  document.getElementById('stat-pdf-books').textContent = pdfCount;
  document.getElementById('stat-completed-percent').textContent = `${completedPct}% tuntas`;

  document.getElementById('count-cat-all').textContent = total;
  document.getElementById('count-cat-keagamaan').textContent = keagamaanCount;
  document.getElementById('count-cat-network').textContent = networkCount;
  document.getElementById('count-cat-lainnya').textContent = Math.max(0, othersCount);

  document.getElementById('landing-stat-total').textContent = total;
  document.getElementById('landing-stat-keagamaan').textContent = keagamaanCount;
  document.getElementById('landing-stat-network').textContent = networkCount;
  document.getElementById('landing-stat-schedules').textContent = activeSchedules;

  document.getElementById('badge-active-schedules').textContent = activeSchedules;
}

// ==============================================================================
// 6. LANDING PAGE RENDERING
// ==============================================================================
async function renderLandingView() {
  const books = await dataRepo.getAllBooks();
  updateStatistics(books);

  const previewContainer = document.getElementById('landing-books-preview');
  if (!previewContainer) return;

  const featured = books.slice(0, 4);

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
      const isKeagamaan = book.category === 'Keagamaan';
      const isNetwork = book.category === 'Network Engineer';
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
            ${escapeHTML(book.category)}
          </span>
          <div>
            <h5 class="font-serif font-bold text-xs line-clamp-2 text-white">${escapeHTML(book.title)}</h5>
            <p class="text-[10px] text-white/80 line-clamp-1 italic">${escapeHTML(book.author)}</p>
          </div>
        </div>

        <div>
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}">${escapeHTML(book.category)}</span>
          <h4 class="font-bold text-xs text-slate-900 mt-1 line-clamp-1">${escapeHTML(book.title)}</h4>
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
  renderScheduleView();
  updateStatistics();
}

async function moveScheduleStatus(id, newStatus) {
  const schedules = await dataRepo.getAllSchedules();
  const item = schedules.find((s) => s.id === id);
  if (item) {
    item.status = newStatus;
    item.completed = newStatus === 'Selesai';
    await dataRepo.saveSchedule(item);
    renderScheduleView();
    updateStatistics();
  }
}

async function toggleScheduleComplete(id) {
  const schedules = await dataRepo.getAllSchedules();
  const item = schedules.find((s) => s.id === id);
  if (item) {
    if (item.status === 'Selesai') {
      item.status = 'Sedang Berjalan';
      item.completed = false;
    } else {
      item.status = 'Selesai';
      item.completed = true;
    }
    await dataRepo.saveSchedule(item);
    renderScheduleView();
    updateStatistics();
  }
}

async function confirmDeleteSchedule(id) {
  if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
    await dataRepo.deleteSchedule(id);
    showToast('Jadwal berhasil dihapus', 'info');
    renderScheduleView();
    updateStatistics();
  }
}

// ==============================================================================
// 9. BOOK MANAGEMENT & UPLOAD PDF
// ==============================================================================
function openAddBookModal() {
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
    showToast(`Buku "${title}" berhasil disimpan di Cloud! Tersinkron di semua HP & PC.`, 'success');

    if (currentView === 'dashboard') {
      renderDashboardView();
    } else if (currentView === 'landing') {
      renderLandingView();
    }
    updateStatistics();
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
    showToast('Buku telah dihapus dari cloud.', 'info');
    renderDashboardView();
    updateStatistics();
  }
}

// ==============================================================================
// 10. PDF VIEWER / READER MODAL (INTERNAL)
// ==============================================================================
async function openPdfReader(bookId) {
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

    // Reload tampilan dengan data cloud
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
    dataRepo.updateCloudStatusUI(false, 'Mode Lokal (Belum Terhubung Cloud)');
    closeCloudConfigModal();
    showToast('Koneksi Cloud diputuskan.', 'info');
    renderDashboardView();
    renderLandingView();
    renderScheduleView();
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
async function openMobileSyncModal() {
  let targetUrl = window.location.href;
  let isCloud = isSupabaseActive;

  document.getElementById('mobile-url-input').value = targetUrl;

  const badgeText = document.getElementById('mobile-sync-badge-text');
  const badgePill = document.getElementById('mobile-sync-mode-pill');
  if (badgeText && badgePill) {
    if (isCloud) {
      badgeText.textContent = 'Terhubung via Supabase Cloud (Otomatis Sinkron di Vercel)';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mb-3';
    } else if (serverInfo && serverInfo.publicUrl) {
      targetUrl = serverInfo.publicUrl;
      document.getElementById('mobile-url-input').value = targetUrl;
      badgeText.textContent = 'Link Internet Publik Cloudflare Aktif';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 mb-3';
    } else {
      badgeText.textContent = 'Tips: Hubungkan ke Supabase agar data Vercel otomatis sinkron!';
      badgePill.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 mb-3';
    }
  }

  const qrImg = document.getElementById('qr-code-img');
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}&margin=10`;

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
    renderDashboardView();
    renderLandingView();
    renderScheduleView();
  } catch (err) {
    console.error('Import error:', err);
    showToast('Gagal memulihkan file. Format tidak valid.', 'error');
  } finally {
    event.target.value = '';
  }
}

async function confirmResetData() {
  toggleDataMenu();
  if (confirm('Apakah Anda yakin ingin mengosongkan seluruh data buku dan jadwal baca? Database akan kembali kosong bersih.')) {
    await dataRepo.resetData();
    showToast('Seluruh data perpustakaan telah dikosongkan.', 'info');
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
// 17. INITIALIZATION ON PAGE LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await dataRepo.init();
    await seedDefaultDataIfEmpty();
    renderLandingView();
    updateStatistics();
    lucide.createIcons();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Gagal memuat sistem perpustakaan.', 'error');
  }
});
