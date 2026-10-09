/**
 * ==============================================================================
 * PERPUSTAKAAN MANDIRI - APPLICATION CORE JAVASCRIPT
 * Engineered with high-standard Vanilla JS & HTML5 IndexedDB Storage
 * ==============================================================================
 */

// Global State
let currentView = 'landing';
let selectedCategory = 'all';
let currentSearchTerm = '';
let currentStatusFilter = 'all';
let currentScheduleView = 'board';
let activePdfObjectUrl = null;
let pendingPdfFile = null;

// ==============================================================================
// 1. DATABASE LAYER (INDEXEDDB WRAPPER)
// ==============================================================================
const DB_NAME = 'PerpustakaanMandiriDB';
const DB_VERSION = 1;

class LibraryDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Books Store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('category', 'category', { unique: false });
          bookStore.createIndex('status', 'status', { unique: false });
          bookStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Notion-like Schedules Store
        if (!db.objectStoreNames.contains('schedules')) {
          const scheduleStore = db.createObjectStore('schedules', { keyPath: 'id' });
          scheduleStore.createIndex('bookId', 'bookId', { unique: false });
          scheduleStore.createIndex('status', 'status', { unique: false });
          scheduleStore.createIndex('date', 'date', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB Error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // --- Books CRUD ---
  async getAllBooks() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getBook(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveBook(book) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readwrite');
      const store = tx.objectStore('books');
      const request = store.put(book);
      request.onsuccess = () => resolve(book);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBook(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readwrite');
      const store = tx.objectStore('books');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Schedules CRUD ---
  async getAllSchedules() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('schedules', 'readonly');
      const store = tx.objectStore('schedules');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSchedule(schedule) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('schedules', 'readwrite');
      const store = tx.objectStore('schedules');
      const request = store.put(schedule);
      request.onsuccess = () => resolve(schedule);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSchedule(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('schedules', 'readwrite');
      const store = tx.objectStore('schedules');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['books', 'schedules'], 'readwrite');
      tx.objectStore('books').clear();
      tx.objectStore('schedules').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

const db = new LibraryDatabase();

// ==============================================================================
// 2. HELPER TO CREATE MINIMAL VALID PDF (FOR SEEDING & PREVIEW)
// ==============================================================================
function createSamplePdfBlob(title, author, category) {
  // Generates a valid standard PDF 1.4 binary file with basic text stream
  const content = `BT /F1 18 Tf 50 720 Td (${title}) Tj ET ` +
                  `BT /F1 12 Tf 50 690 Td (Penulis: ${author}) Tj ET ` +
                  `BT /F1 12 Tf 50 670 Td (Kategori: ${category}) Tj ET ` +
                  `BT /F1 11 Tf 50 630 Td (Selamat datang di Perpustakaan Mandiri.) Tj ET ` +
                  `BT /F1 11 Tf 50 610 Td (Dokumen ini adalah contoh file PDF internal perpustakaan.) Tj ET ` +
                  `BT /F1 11 Tf 50 590 Td (Anda dapat mengunggah file PDF asli Anda kapan saja.) Tj ET`;

  const streamLength = content.length;
  const pdfString = 
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
377
%%EOF`;

  return new Blob([pdfString], { type: 'application/pdf' });
}

// ==============================================================================
// 3. SEED INITIAL SAMPLE DATA
// ==============================================================================
async function seedDefaultDataIfEmpty() {
  const books = await db.getAllBooks();
  if (books.length > 0) return; // Already initialized

  showToast('Memuat rak buku perdana...', 'info');

  const sampleBooks = [
    {
      id: 'book-1',
      title: 'Riyadhus Shalihin: Panduan Akhlak & Amal Shalih',
      author: 'Imam An-Nawawi',
      category: 'Keagamaan',
      totalPages: 420,
      currentPage: 85,
      status: 'Sedang Dibaca',
      notes: 'Kitab rujukan adab, hadits-hadits fadhilah amal, dan pensucian jiwa.',
      coverGradient: 'from-emerald-700 to-teal-900',
      pdfFileName: 'Riyadhus_Shalihin_Ringkasan.pdf',
      pdfBlob: createSamplePdfBlob('Riyadhus Shalihin', 'Imam An-Nawawi', 'Keagamaan'),
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'book-2',
      title: 'Fiqih Sunnah: Ibadah, Muamalah & Adab Harian',
      author: 'Sayyid Sabiq',
      category: 'Keagamaan',
      totalPages: 380,
      currentPage: 380,
      status: 'Selesai',
      notes: 'Penjelasan dalil fiqih praktis yang mudah dipahami untuk kehidupan sehari-hari.',
      coverGradient: 'from-amber-700 to-amber-950',
      pdfFileName: 'Fiqih_Sunnah_Praktis.pdf',
      pdfBlob: createSamplePdfBlob('Fiqih Sunnah', 'Sayyid Sabiq', 'Keagamaan'),
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString()
    },
    {
      id: 'book-3',
      title: 'Fundamental Jaringan Komputer, Subnetting & TCP/IP',
      author: 'Andrew S. Tanenbaum & Tim Jaringan',
      category: 'Network Engineer',
      totalPages: 310,
      currentPage: 120,
      status: 'Sedang Dibaca',
      notes: 'Dasar OSI Layer, perhitungan subnetting VLSM/CIDR, dan protokol TCP/IP.',
      coverGradient: 'from-sky-700 to-indigo-950',
      pdfFileName: 'Networking_Fundamentals_TCP_IP.pdf',
      pdfBlob: createSamplePdfBlob('Fundamental Jaringan Komputer', 'Andrew S. Tanenbaum', 'Network Engineer'),
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      id: 'book-4',
      title: 'Panduan Praktis Cisco CCNA: Routing & Switching Lengkap',
      author: 'Todd Lammle',
      category: 'Network Engineer',
      totalPages: 520,
      currentPage: 45,
      status: 'Sedang Dibaca',
      notes: 'Konfigurasi router Cisco, VLAN, Inter-VLAN routing, OSPF, dan Access Control List.',
      coverGradient: 'from-blue-800 to-slate-900',
      pdfFileName: 'Cisco_CCNA_Routing_Switching.pdf',
      pdfBlob: createSamplePdfBlob('Panduan Cisco CCNA', 'Todd Lammle', 'Network Engineer'),
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 'book-5',
      title: 'MikroTik Certified Network Associate (MTCNA) Handbook',
      author: 'Rendra Towidjojo',
      category: 'Network Engineer',
      totalPages: 240,
      currentPage: 0,
      status: 'Belum Dibaca',
      notes: 'Panduan konfigurasi RouterOS MikroTik, Firewall NAT, Bandwidth Queue, dan Wireless.',
      coverGradient: 'from-cyan-800 to-slate-900',
      pdfFileName: 'MikroTik_MTCNA_Handbook.pdf',
      pdfBlob: createSamplePdfBlob('MikroTik MTCNA Handbook', 'Rendra Towidjojo', 'Network Engineer'),
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
    }
  ];

  for (const book of sampleBooks) {
    await db.saveBook(book);
  }

  // Sample Notion Schedules
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const sampleSchedules = [
    {
      id: 'sched-1',
      bookId: 'book-3',
      bookTitle: 'Fundamental Jaringan Komputer, Subnetting & TCP/IP',
      title: 'Latihan Menghitung Subnet VLSM /26 dan /28',
      date: todayStr,
      time: '19:30',
      targetPages: 'Hal 120 - 145',
      status: 'Sedang Berjalan',
      completed: false,
      notes: 'Pastikan paham cara menghitung host valid dan broadcast address.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sched-2',
      bookId: 'book-1',
      bookTitle: 'Riyadhus Shalihin: Panduan Akhlak & Amal Shalih',
      title: 'Kajian Bab Keutamaan Sabar & Shadaqah',
      date: todayStr,
      time: '06:00',
      targetPages: 'Hal 85 - 100',
      status: 'Sedang Berjalan',
      completed: false,
      notes: 'Fokus pada faedah hadits dan aplikasi di kehidupan sehari-hari.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sched-3',
      bookId: 'book-4',
      bookTitle: 'Panduan Praktis Cisco CCNA: Routing & Switching Lengkap',
      title: 'Konfigurasi OSPF Single Area di Cisco Packet Tracer',
      date: tomorrow,
      time: '20:00',
      targetPages: 'Hal 45 - 70',
      status: 'Rencana',
      completed: false,
      notes: 'Praktik langsung di simulator Cisco Packet Tracer.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'sched-4',
      bookId: 'book-2',
      bookTitle: 'Fiqih Sunnah: Ibadah, Muamalah & Adab Harian',
      title: 'Tuntas Membaca Bab Thaharah & Rukun Shalat',
      date: yesterday,
      time: '05:30',
      targetPages: 'Hal 350 - 380',
      status: 'Selesai',
      completed: true,
      notes: 'Alhamdulillah selesai satu juz pembahasan fiqih ibadah.',
      createdAt: new Date().toISOString()
    }
  ];

  for (const s of sampleSchedules) {
    await db.saveSchedule(s);
  }
}

// ==============================================================================
// 4. NAVIGATION & VIEW CONTROLLER
// ==============================================================================
function navigateTo(viewName) {
  currentView = viewName;

  // View sections
  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-schedule').classList.add('hidden');

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.classList.remove('hidden');

  // Update nav button active states
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

  // Re-render corresponding views
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
// 5. DASHBOARD & RAK BUKU RENDERING
// ==============================================================================
async function renderDashboardView() {
  const books = await db.getAllBooks();
  updateStatistics(books);

  const container = document.getElementById('bookshelf-grid');
  const emptyState = document.getElementById('empty-bookshelf');

  // Filter books
  let filtered = books.filter((book) => {
    // Category filter
    const matchCat =
      selectedCategory === 'all' ||
      book.category.toLowerCase() === selectedCategory.toLowerCase();

    // Search input match
    const searchLow = currentSearchTerm.toLowerCase();
    const matchSearch =
      !currentSearchTerm ||
      book.title.toLowerCase().includes(searchLow) ||
      book.author.toLowerCase().includes(searchLow) ||
      (book.notes && book.notes.toLowerCase().includes(searchLow));

    // Status filter
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

  // Render cards
  container.innerHTML = filtered.map((book) => createBookCardHTML(book)).join('');
  lucide.createIcons();
}

function createBookCardHTML(book) {
  // Category styles
  const isKeagamaan = book.category === 'Keagamaan';
  const isNetwork = book.category === 'Network Engineer';
  const catBadgeColor = isKeagamaan
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : isNetwork
    ? 'bg-sky-100 text-sky-800 border-sky-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';

  const catIcon = isKeagamaan ? 'book-heart' : isNetwork ? 'server' : 'bookmark';

  // Status styles
  const statusColor =
    book.status === 'Selesai'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : book.status === 'Sedang Dibaca'
      ? 'bg-sky-50 text-sky-700 border-sky-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

  // Progress percentage
  const total = book.totalPages || 100;
  const current = book.currentPage || 0;
  const progressPct = Math.min(100, Math.round((current / total) * 100));

  // Cover gradient fallback
  const gradient =
    book.coverGradient ||
    (isKeagamaan
      ? 'from-emerald-700 to-teal-950'
      : isNetwork
      ? 'from-sky-700 to-slate-900'
      : 'from-amber-700 to-stone-900');

  const hasPdf = !!book.pdfBlob;

  return `
    <div class="book-card bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-amber-300 shadow-xs transition-all group">
      
      <div>
        <!-- Book Mockup Cover -->
        <div class="book-cover-mockup bg-gradient-to-br ${gradient} text-white p-4 h-48 flex flex-col justify-between relative shadow-md mb-4 group-hover:scale-[1.01] transition-transform">
          <div class="flex items-center justify-between text-xs z-10">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md bg-white/20 text-white border border-white/20">
              <i data-lucide="${catIcon}" class="w-3 h-3"></i> ${book.category}
            </span>
            ${hasPdf ? `
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/90 text-white flex items-center gap-1">
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

        <!-- Book Metadata -->
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${catBadgeColor}">
              ${escapeHTML(book.category)}
            </span>
            <span class="px-2 py-0.5 rounded text-[11px] font-medium border ${statusColor}">
              ${escapeHTML(book.status)}
            </span>
          </div>

          <h3 class="font-serif font-bold text-slate-900 text-sm line-clamp-2 title-tooltip leading-tight" title="${escapeHTML(book.title)}">
            ${escapeHTML(book.title)}
          </h3>
          <p class="text-xs text-slate-500 line-clamp-1">Penulis: <span class="font-medium text-slate-700">${escapeHTML(book.author)}</span></p>

          <!-- Reading Progress Bar -->
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

      <!-- Action Buttons -->
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
// 6. STATISTICS & COUNTERS UPDATE
// ==============================================================================
async function updateStatistics(books) {
  if (!books) books = await db.getAllBooks();
  const schedules = await db.getAllSchedules();

  const total = books.length;
  const keagamaanCount = books.filter((b) => b.category === 'Keagamaan').length;
  const networkCount = books.filter((b) => b.category === 'Network Engineer').length;
  const othersCount = total - keagamaanCount - networkCount;

  const pdfCount = books.filter((b) => !!b.pdfBlob).length;
  const completedCount = books.filter((b) => b.status === 'Selesai').length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const activeSchedules = schedules.filter((s) => s.status !== 'Selesai').length;

  // Update Dashboard numbers
  document.getElementById('stat-total-books').textContent = total;
  document.getElementById('stat-keagamaan-books').textContent = keagamaanCount;
  document.getElementById('stat-network-books').textContent = networkCount;
  document.getElementById('stat-pdf-books').textContent = pdfCount;
  document.getElementById('stat-completed-percent').textContent = `${completedPct}% tuntas`;

  // Update Category tab pill counts
  document.getElementById('count-cat-all').textContent = total;
  document.getElementById('count-cat-keagamaan').textContent = keagamaanCount;
  document.getElementById('count-cat-network').textContent = networkCount;
  document.getElementById('count-cat-lainnya').textContent = Math.max(0, othersCount);

  // Update Landing page numbers
  document.getElementById('landing-stat-total').textContent = total;
  document.getElementById('landing-stat-keagamaan').textContent = keagamaanCount;
  document.getElementById('landing-stat-network').textContent = networkCount;
  document.getElementById('landing-stat-schedules').textContent = activeSchedules;

  // Nav badge
  document.getElementById('badge-active-schedules').textContent = activeSchedules;
}

// ==============================================================================
// 7. LANDING PAGE RENDERING
// ==============================================================================
async function renderLandingView() {
  const books = await db.getAllBooks();
  updateStatistics(books);

  const previewContainer = document.getElementById('landing-books-preview');
  if (!previewContainer) return;

  // Pick 4 featured books
  const featured = books.slice(0, 4);

  if (featured.length === 0) {
    previewContainer.innerHTML = `
      <div class="col-span-full text-center py-6 text-slate-400 text-xs">
        Belum ada koleksi buku. Silakan klik tombol "Buka Rak Buku" untuk menambahkan buku.
      </div>
    `;
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
// 8. NOTION-STYLE READING SCHEDULE RENDERING
// ==============================================================================
async function renderScheduleView() {
  const schedules = await db.getAllSchedules();
  const books = await db.getAllBooks();

  // Populate Book select dropdown in the modal
  const bookSelect = document.getElementById('sched-book-select');
  if (bookSelect) {
    if (books.length === 0) {
      bookSelect.innerHTML = '<option value="">(Belum ada buku di rak - Tambah buku dulu)</option>';
    } else {
      bookSelect.innerHTML = books
        .map((b) => `<option value="${b.id}">${escapeHTML(b.title)} (${b.category})</option>`)
        .join('');
    }
  }

  // Count by status
  const todoList = schedules.filter((s) => s.status === 'Rencana');
  const inProgressList = schedules.filter((s) => s.status === 'Sedang Berjalan');
  const doneList = schedules.filter((s) => s.status === 'Selesai');

  // Update header counters
  document.getElementById('sched-count-todo').textContent = `${todoList.length} Rencana`;
  document.getElementById('sched-count-inprogress').textContent = `${inProgressList.length} Berjalan`;
  document.getElementById('sched-count-done').textContent = `${doneList.length} Selesai`;

  document.getElementById('col-count-todo').textContent = todoList.length;
  document.getElementById('col-count-inprogress').textContent = inProgressList.length;
  document.getElementById('col-count-done').textContent = doneList.length;

  // Render Kanban Board Columns
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

  // Render Table View
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
      
      <!-- Top Title & Quick Check -->
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

      <!-- Book Reference Pill -->
      <div class="flex items-center gap-1.5 text-[11px] text-slate-600 bg-notion-sidebar px-2 py-1 rounded-lg border border-notion-border/70 truncate">
        <i data-lucide="book" class="w-3 h-3 text-amber-700 shrink-0"></i>
        <span class="truncate font-medium">${escapeHTML(s.bookTitle || 'Buku')}</span>
      </div>

      <!-- Details: Date & Target Pages -->
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

      <!-- Notion Status Selector / Move Column -->
      <div class="pt-2 border-t border-notion-border flex items-center justify-between text-[10px]">
        <span class="px-2 py-0.5 rounded font-semibold ${tagColorClass}">${escapeHTML(s.status)}</span>
        
        <div class="flex items-center gap-1">
          ${s.status !== 'Rencana' ? `
            <button onclick="moveScheduleStatus('${s.id}', 'Rencana')" class="hover:bg-slate-100 px-1.5 py-0.5 rounded text-slate-500" title="Pindah ke Rencana">← Rencana</button>
          ` : ''}
          ${s.status !== 'Sedang Berjalan' ? `
            <button onclick="moveScheduleStatus('${s.id}', 'Sedang Berjalan')" class="hover:bg-sky-50 px-1.5 py-0.5 rounded text-sky-700 font-medium" title="Jalankan Sesi">▶ Sedang Berjalan</button>
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
// 9. SCHEDULE ACTIONS & MODAL
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
    const book = await db.getBook(bookId);
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

  await db.saveSchedule(scheduleObj);
  closeScheduleModal();
  showToast('Jadwal baca berhasil disimpan!', 'success');
  renderScheduleView();
  updateStatistics();
}

async function moveScheduleStatus(id, newStatus) {
  const schedules = await db.getAllSchedules();
  const item = schedules.find((s) => s.id === id);
  if (item) {
    item.status = newStatus;
    item.completed = newStatus === 'Selesai';
    await db.saveSchedule(item);
    renderScheduleView();
    updateStatistics();
  }
}

async function toggleScheduleComplete(id) {
  const schedules = await db.getAllSchedules();
  const item = schedules.find((s) => s.id === id);
  if (item) {
    if (item.status === 'Selesai') {
      item.status = 'Sedang Berjalan';
      item.completed = false;
    } else {
      item.status = 'Selesai';
      item.completed = true;
    }
    await db.saveSchedule(item);
    renderScheduleView();
    updateStatistics();
  }
}

async function confirmDeleteSchedule(id) {
  if (confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) {
    await db.deleteSchedule(id);
    showToast('Jadwal berhasil dihapus', 'info');
    renderScheduleView();
    updateStatistics();
  }
}

// ==============================================================================
// 10. BOOK MANAGEMENT MODAL & CRUD
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

  // Reset file upload state
  pendingPdfFile = null;
  document.getElementById('book-pdf-input').value = '';
  document.getElementById('pdf-selected-badge').classList.add('hidden');
  document.getElementById('pdf-upload-info').classList.remove('hidden');
  document.getElementById('pdf-existing-info').classList.add('hidden');

  document.getElementById('modal-book-title').textContent = 'Tambah Buku ke Rak';
  document.getElementById('modal-book').classList.remove('hidden');
}

async function openEditBookModal(bookId) {
  const book = await db.getBook(bookId);
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

  if (book.pdfFileName) {
    document.getElementById('pdf-selected-badge').classList.remove('hidden');
    document.getElementById('pdf-upload-info').classList.add('hidden');
    document.getElementById('pdf-filename-label').textContent = `Tersimpan: ${book.pdfFileName}`;
    document.getElementById('pdf-existing-info').textContent =
      'Buku ini sudah memiliki file PDF. Unggah lagi jika ingin menggantinya.';
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
    existingBook = await db.getBook(id);
  }

  // Cover gradient assignment based on category
  const coverGradient =
    existingBook?.coverGradient ||
    (category === 'Keagamaan'
      ? 'from-emerald-700 to-teal-950'
      : category === 'Network Engineer'
      ? 'from-sky-700 to-slate-900'
      : 'from-amber-700 to-stone-900');

  let pdfBlob = existingBook ? existingBook.pdfBlob : null;
  let pdfFileName = existingBook ? existingBook.pdfFileName : null;
  let pdfSize = existingBook ? existingBook.pdfSize : 0;

  // If a new PDF was selected
  if (pendingPdfFile) {
    pdfBlob = pendingPdfFile;
    pdfFileName = pendingPdfFile.name;
    pdfSize = pendingPdfFile.size;
  } else if (!isEdit && !pdfBlob) {
    // Generate sample PDF document so user can test reader immediately
    pdfBlob = createSamplePdfBlob(title, author, category);
    pdfFileName = `${title.replace(/\s+/g, '_')}_Preview.pdf`;
    pdfSize = pdfBlob.size;
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
    pdfBlob,
    pdfFileName,
    pdfSize,
    createdAt: existingBook ? existingBook.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await db.saveBook(bookData);
  closeBookModal();
  showToast(`Buku "${title}" berhasil disimpan di rak!`, 'success');

  if (currentView === 'dashboard') {
    renderDashboardView();
  } else if (currentView === 'landing') {
    renderLandingView();
  }
  updateStatistics();
}

async function confirmDeleteBook(id) {
  const book = await db.getBook(id);
  const title = book ? book.title : 'buku ini';

  if (confirm(`Apakah Anda yakin ingin menghapus "${title}" dari rak perpustakaan?`)) {
    await db.deleteBook(id);
    showToast('Buku telah dihapus dari rak.', 'info');
    renderDashboardView();
    updateStatistics();
  }
}

// ==============================================================================
// 11. PDF VIEWER / READER MODAL (INTERNAL)
// ==============================================================================
async function openPdfReader(bookId) {
  const book = await db.getBook(bookId);
  if (!book || !book.pdfBlob) {
    showToast('Berkas PDF tidak ditemukan pada buku ini.', 'warning');
    return;
  }

  // Cleanup old object URL to prevent memory leaks
  if (activePdfObjectUrl) {
    URL.revokeObjectURL(activePdfObjectUrl);
  }

  activePdfObjectUrl = URL.createObjectURL(book.pdfBlob);

  document.getElementById('pdf-modal-title').textContent = book.title;
  document.getElementById('pdf-modal-author').textContent = `Penulis: ${book.author} • ${book.category}`;

  // Download & Open In New Tab Links
  const dlBtn = document.getElementById('pdf-download-btn');
  dlBtn.href = activePdfObjectUrl;
  dlBtn.download = book.pdfFileName || `${book.title}.pdf`;

  const openTabBtn = document.getElementById('pdf-open-tab-btn');
  openTabBtn.href = activePdfObjectUrl;

  const fallbackLink = document.getElementById('pdf-fallback-link');
  fallbackLink.href = activePdfObjectUrl;

  // Iframe Viewer
  const iframe = document.getElementById('pdf-frame');
  iframe.src = activePdfObjectUrl;

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
// 12. FILTER & SEARCH HANDLERS
// ==============================================================================
function filterCategory(cat) {
  selectedCategory = cat;

  // Update tabs active state
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
// 13. BACKUP, EXPORT & RESTORE DATA (SENIOR ENGINEER SAFEGUARD)
// ==============================================================================
function toggleDataMenu() {
  const menu = document.getElementById('dataMenuDropdown');
  menu.classList.toggle('hidden');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const btn = document.getElementById('dataMenuBtn');
  const menu = document.getElementById('dataMenuDropdown');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

async function exportLibraryData() {
  toggleDataMenu();
  const books = await db.getAllBooks();
  const schedules = await db.getAllSchedules();

  // Export metadata without huge blobs for light JSON backup
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    appName: 'Perpustakaan Mandiri',
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      totalPages: b.totalPages,
      currentPage: b.currentPage,
      status: b.status,
      notes: b.notes,
      coverGradient: b.coverGradient,
      pdfFileName: b.pdfFileName,
      createdAt: b.createdAt
    })),
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
        // preserve sample PDF if none
        b.pdfBlob = createSamplePdfBlob(b.title, b.author, b.category);
        await db.saveBook(b);
      }
    }

    if (data.schedules && Array.isArray(data.schedules)) {
      for (const s of data.schedules) {
        await db.saveSchedule(s);
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
  if (confirm('Apakah Anda yakin ingin mengatur ulang data ke contoh awal? Semua buku & jadwal buatan Anda akan diganti ke contoh awal.')) {
    await db.clearAll();
    await seedDefaultDataIfEmpty();
    showToast('Perpustakaan direset ke data contoh.', 'info');
    navigateTo('landing');
  }
}

// ==============================================================================
// 14. TOAST NOTIFICATION UTILITY
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
// 15. UTILITIES (DATE FORMATTER & ESCAPING)
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
// 16. INITIALIZATION ON PAGE LOAD
// ==============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await db.init();
    await seedDefaultDataIfEmpty();
    renderLandingView();
    updateStatistics();
    lucide.createIcons();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Gagal menginisialisasi penyimpanan lokal.', 'error');
  }
});
