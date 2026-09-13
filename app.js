/* ==========================================================================
   app.js — Logic inti Portal Anime & Manga
   Semua data client-side (JSON + localStorage + IndexedDB). Tanpa iklan.
   ========================================================================== */

/* --------------------------- 1. KONSTANTA --------------------------------*/
const LS = {
  SETTINGS: "pam_settings",
  BOOKMARK_ANIME: "pam_bookmark_anime",
  BOOKMARK_MANGA: "pam_bookmark_manga",
  HISTORY_ANIME: "pam_history_anime",     // {animeId: {ep, time, ts}}
  HISTORY_MANGA: "pam_history_manga",     // {mangaId: {chapter, page, ts}}
  FOLLOW: "pam_follow",                   // [{id, type}]
  NOTIFS: "pam_notifs",                   // [{id, title, msg, ts, read}]
  SNAPSHOT: "pam_snapshot"                // {animeId: epCount, mangaId: chCount}
};

/* 50 preset warna tema (accent color) — dibangkitkan dari beberapa keluarga hue */
const THEME_PRESETS = [
  "#7C6CF5","#6C5CE7","#8E6CF5","#A16CF5","#C56CF5","#E56CF5","#F56CC0","#F56C8E",
  "#F56C6C","#F58E6C","#F5A16C","#F5C56C","#F5E56C","#D9F56C","#A1F56C","#6CF57A",
  "#6CF5A1","#6CF5C5","#6CF5E5","#6CE5F5","#6CC5F5","#6CA1F5","#6C8EF5","#4C6CF5",
  "#3B5BDB","#2F9E44","#37B24D","#0CA678","#12B886","#15AABF","#228BE6","#4263EB",
  "#7048E8","#9C36B5","#E64980","#F03E3E","#E8590C","#F08C00","#F5B400","#82C91E",
  "#40C057","#20C997","#1098AD","#1971C2","#3B5BDB","#5F3DC4","#862E9C","#C2255C",
  "#E03131","#D9480F"
];

const DEFAULT_SETTINGS = {
  accent: THEME_PRESETS[0],
  themeMode: "auto",           // auto | dark | light
  activeBgId: null,            // id background custom aktif dari IndexedDB
  anime: {
    autoplayNext: true,
    skipIntro: false,
    defaultQuality: "720p"
  },
  manga: {
    readerMode: "vertical",    // vertical | page
    direction: "ltr",          // ltr | rtl
    margin: 8,
    pageAnim: true
  },
  notif: {
    sound: true,
    desktop: true
  }
};

/* --------------------------- 2. SETTINGS ----------------------------------*/
function getSettings() {
  try {
    const raw = localStorage.getItem(LS.SETTINGS);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_SETTINGS), parsed);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}
function saveSettings(s) {
  localStorage.setItem(LS.SETTINGS, JSON.stringify(s));
}
function deepMerge(base, extra) {
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k])) {
      base[k] = deepMerge(base[k] || {}, extra[k]);
    } else {
      base[k] = extra[k];
    }
  }
  return base;
}

/* --------------------------- 3. LOCALSTORAGE HELPERS ----------------------*/
function lsGet(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* Bookmark */
function isBookmarked(type, id) {
  const list = lsGet(type === "anime" ? LS.BOOKMARK_ANIME : LS.BOOKMARK_MANGA, []);
  return list.includes(id);
}
function toggleBookmark(type, id) {
  const key = type === "anime" ? LS.BOOKMARK_ANIME : LS.BOOKMARK_MANGA;
  let list = lsGet(key, []);
  if (list.includes(id)) list = list.filter(x => x !== id);
  else list.push(id);
  lsSet(key, list);
  return list.includes(id);
}

/* Watch / read history */
function setAnimeHistory(animeId, ep) {
  const h = lsGet(LS.HISTORY_ANIME, {});
  h[animeId] = { ep, ts: Date.now() };
  lsSet(LS.HISTORY_ANIME, h);
}
function setMangaHistory(mangaId, chapter, page) {
  const h = lsGet(LS.HISTORY_MANGA, {});
  h[mangaId] = { chapter, page, ts: Date.now() };
  lsSet(LS.HISTORY_MANGA, h);
}

/* Follow */
function isFollowing(type, id) {
  const list = lsGet(LS.FOLLOW, []);
  return list.some(f => f.type === type && f.id === id);
}
function toggleFollow(type, id, title) {
  let list = lsGet(LS.FOLLOW, []);
  const exists = list.some(f => f.type === type && f.id === id);
  if (exists) {
    list = list.filter(f => !(f.type === type && f.id === id));
  } else {
    list.push({ type, id, title });
    // minta izin notifikasi browser saat pertama kali follow
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
  lsSet(LS.FOLLOW, list);
  return !exists;
}

/* --------------------------- 4. NOTIFIKASI ---------------------------------*/
function pushNotif(title, msg) {
  const list = lsGet(LS.NOTIFS, []);
  list.unshift({ id: Date.now() + Math.random(), title, msg, ts: Date.now(), read: false });
  lsSet(LS.NOTIFS, list.slice(0, 100));
  renderNotifBell();

  const settings = getSettings();
  if (settings.notif.sound) playNotifSound();
  if (settings.notif.desktop && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: msg, icon: "" }); } catch {}
  }
  showToast(`${title} — ${msg}`);
}
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.15);
  } catch {}
}
function markAllNotifRead() {
  const list = lsGet(LS.NOTIFS, []).map(n => ({ ...n, read: true }));
  lsSet(LS.NOTIFS, list);
  renderNotifBell();
}

/* Bandingkan jumlah episode/chapter sekarang vs snapshot -> munculkan notif utk yg diikuti */
async function checkForNewReleases() {
  const [animeList, mangaList] = await Promise.all([loadAnime(), loadManga()]);
  const snap = lsGet(LS.SNAPSHOT, {});
  const follow = lsGet(LS.FOLLOW, []);
  let changed = false;

  animeList.forEach(a => {
    const prev = snap["a_" + a.id];
    const now = a.episodes.length;
    if (prev !== undefined && now > prev && follow.some(f => f.type === "anime" && f.id === a.id)) {
      pushNotif("Episode Baru!", `${a.title} — Episode ${now} telah rilis`);
    }
    snap["a_" + a.id] = now;
    changed = true;
  });
  mangaList.forEach(m => {
    const prev = snap["m_" + m.id];
    const now = m.chapters.length;
    if (prev !== undefined && now > prev && follow.some(f => f.type === "manga" && f.id === m.id)) {
      pushNotif("Chapter Baru!", `${m.title} — Chapter ${now} telah rilis`);
    }
    snap["m_" + m.id] = now;
    changed = true;
  });
  if (changed) lsSet(LS.SNAPSHOT, snap);
}

/* Simulasi manual: tombol "Cek Update" pada bell akan memanggil fungsi ini
   setelah menaikkan angka acak episode/chapter di memori (karena data JSON statis). */
async function simulateNewRelease() {
  const follow = lsGet(LS.FOLLOW, []);
  if (!follow.length) {
    showToast("Belum ada anime/manga yang diikuti.");
    return;
  }
  const pick = follow[Math.floor(Math.random() * follow.length)];
  if (pick.type === "anime") {
    pushNotif("Episode Baru!", `${pick.title} — Episode baru telah rilis (simulasi)`);
  } else {
    pushNotif("Chapter Baru!", `${pick.title} — Chapter baru telah rilis (simulasi)`);
  }
}

/* --------------------------- 5. LOAD DATA JSON -----------------------------*/
let _animeCache = null, _mangaCache = null, _scheduleCache = null;
async function loadAnime() {
  if (_animeCache) return _animeCache;
  const res = await fetch("data/anime.json");
  _animeCache = await res.json();
  return _animeCache;
}
async function loadManga() {
  if (_mangaCache) return _mangaCache;
  const res = await fetch("data/manga.json");
  _mangaCache = await res.json();
  return _mangaCache;
}
async function loadSchedule() {
  if (_scheduleCache) return _scheduleCache;
  const res = await fetch("data/schedule.json");
  _scheduleCache = await res.json();
  return _scheduleCache;
}

/* --------------------------- 6. TEMA & BACKGROUND --------------------------*/
function applyTheme(settings) {
  const root = document.documentElement;
  root.style.setProperty("--accent", settings.accent);
  root.style.setProperty("--accent-rgb", hexToRgb(settings.accent));

  let mode = settings.themeMode;
  if (mode === "auto") {
    mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", mode);

  applyActiveBackground(settings);
}
function hexToRgb(hex) {
  const m = hex.replace("#","").match(/.{1,2}/g);
  return m.map(x => parseInt(x,16)).join(",");
}
async function applyActiveBackground(settings) {
  const layer = document.getElementById("bg-layer");
  if (!layer) return;
  if (settings.activeBgId) {
    try {
      const bg = await PamDB.getBackground(settings.activeBgId);
      if (bg) {
        layer.style.backgroundImage = `url(${bg.data})`;
        layer.classList.add("has-bg");
        return;
      }
    } catch {}
  }
  layer.style.backgroundImage = "none";
  layer.classList.remove("has-bg");
}

/* --------------------------- 7. TOAST --------------------------------------*/
function showToast(msg) {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

/* --------------------------- 8. NAVBAR --------------------------------------*/
function renderNavbar(active) {
  const root = document.getElementById("navbar-root");
  if (!root) return;
  root.innerHTML = `
  <div id="bg-layer"></div>
  <header class="navbar">
    <div class="nav-inner">
      <a href="index.html" class="brand">
        <span class="brand-mark">遊</span>
        <span class="brand-text">Kuronime<b>.</b></span>
      </a>
      <nav class="nav-links">
        <a href="index.html" class="${active==='home'?'active':''}">Beranda</a>
        <a href="anime.html" class="${active==='anime'?'active':''}">Anime</a>
        <a href="manga.html" class="${active==='manga'?'active':''}">Manga</a>
        <a href="schedule.html" class="${active==='schedule'?'active':''}">Jadwal Rilis</a>
      </nav>
      <div class="nav-actions">
        <button class="icon-btn" id="btn-bell" title="Notifikasi">
          🔔<span class="badge" id="bell-badge" hidden>0</span>
        </button>
        <button class="icon-btn" id="btn-settings" title="Pengaturan">⚙️</button>
        <button class="icon-btn nav-burger" id="btn-burger" title="Menu">☰</button>
      </div>
    </div>
    <nav class="nav-links-mobile" id="mobile-nav">
      <a href="index.html">Beranda</a>
      <a href="anime.html">Anime</a>
      <a href="manga.html">Manga</a>
      <a href="schedule.html">Jadwal Rilis</a>
    </nav>
  </header>

  <div class="dropdown-panel" id="notif-panel">
    <div class="dp-head">
      <span>Notifikasi</span>
      <div class="dp-head-actions">
        <button id="notif-sim" class="mini-btn">Cek Update</button>
        <button id="notif-read" class="mini-btn">Tandai dibaca</button>
      </div>
    </div>
    <div id="notif-list" class="dp-list"></div>
  </div>

  ${renderSettingsModalHTML()}
  `;

  document.getElementById("btn-burger").onclick = () =>
    document.getElementById("mobile-nav").classList.toggle("open");

  const bell = document.getElementById("btn-bell");
  const panel = document.getElementById("notif-panel");
  bell.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
    document.getElementById("settings-modal").classList.remove("open");
    renderNotifList();
  };
  document.getElementById("notif-sim").onclick = simulateNewRelease;
  document.getElementById("notif-read").onclick = markAllNotifRead;

  document.getElementById("btn-settings").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("settings-modal").classList.toggle("open");
    panel.classList.remove("open");
  };

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target)) panel.classList.remove("open");
  });

  wireSettingsModal();
  renderNotifBell();
}

function renderNotifBell() {
  const badge = document.getElementById("bell-badge");
  if (!badge) return;
  const unread = lsGet(LS.NOTIFS, []).filter(n => !n.read).length;
  badge.hidden = unread === 0;
  badge.textContent = unread > 99 ? "99+" : unread;
}
function renderNotifList() {
  const box = document.getElementById("notif-list");
  const list = lsGet(LS.NOTIFS, []);
  if (!list.length) {
    box.innerHTML = `<div class="empty-state">Belum ada notifikasi.</div>`;
    return;
  }
  box.innerHTML = list.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}">
      <div class="notif-title">${n.title}</div>
      <div class="notif-msg">${n.msg}</div>
      <div class="notif-time">${timeAgo(n.ts)}</div>
    </div>`).join("");
  markAllNotifRead();
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Baru saja";
  if (s < 3600) return Math.floor(s / 60) + " menit lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return Math.floor(s / 86400) + " hari lalu";
}

/* --------------------------- 9. SETTINGS MODAL ------------------------------*/
function renderSettingsModalHTML() {
  const swatches = THEME_PRESETS.map(c =>
    `<button class="swatch" data-color="${c}" style="background:${c}"></button>`).join("");

  return `
  <div class="modal-backdrop" id="settings-modal">
    <div class="modal-card">
      <div class="modal-head">
        <h3>Pengaturan</h3>
        <button class="icon-btn" id="settings-close">✕</button>
      </div>
      <div class="modal-tabs">
        <button class="tab-btn active" data-tab="tema">Tema</button>
        <button class="tab-btn" data-tab="bg">Background</button>
        <button class="tab-btn" data-tab="anime">Anime</button>
        <button class="tab-btn" data-tab="manga">Manga</button>
        <button class="tab-btn" data-tab="notif">Notifikasi</button>
        <button class="tab-btn" data-tab="data">Data</button>
      </div>

      <div class="tab-panel active" data-panel="tema">
        <p class="panel-desc">Pilih salah satu dari 50 warna aksen tema.</p>
        <div class="swatch-grid">${swatches}</div>
        <div class="field-row">
          <label>Mode Tampilan</label>
          <select id="set-theme-mode">
            <option value="auto">Ikuti Sistem (Auto)</option>
            <option value="dark">Gelap</option>
            <option value="light">Terang</option>
          </select>
        </div>
      </div>

      <div class="tab-panel" data-panel="bg">
        <p class="panel-desc">Upload gambar sebagai background situs (maks 5000 tersimpan di IndexedDB).</p>
        <input type="file" id="bg-upload" accept="image/*" />
        <button id="bg-clear-active" class="mini-btn">Hapus Background Aktif</button>
        <div class="bg-gallery" id="bg-gallery"></div>
      </div>

      <div class="tab-panel" data-panel="anime">
        <div class="field-row">
          <label>Autoplay Episode Selanjutnya</label>
          <input type="checkbox" id="set-autoplay" />
        </div>
        <div class="field-row">
          <label>Skip Intro Otomatis</label>
          <input type="checkbox" id="set-skipintro" />
        </div>
        <div class="field-row">
          <label>Kualitas Default</label>
          <select id="set-quality">
            <option value="360p">360p</option>
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>
      </div>

      <div class="tab-panel" data-panel="manga">
        <div class="field-row">
          <label>Mode Baca Default</label>
          <select id="set-readermode">
            <option value="vertical">Vertikal Scroll</option>
            <option value="page">Per Halaman Klik</option>
          </select>
        </div>
        <div class="field-row">
          <label>Arah Baca</label>
          <select id="set-direction">
            <option value="ltr">Kiri ke Kanan</option>
            <option value="rtl">Kanan ke Kiri</option>
          </select>
        </div>
        <div class="field-row">
          <label>Margin Halaman (px)</label>
          <input type="range" id="set-margin" min="0" max="40" step="2" />
        </div>
        <div class="field-row">
          <label>Animasi Ganti Halaman</label>
          <input type="checkbox" id="set-pageanim" />
        </div>
      </div>

      <div class="tab-panel" data-panel="notif">
        <div class="field-row">
          <label>Suara Notifikasi</label>
          <input type="checkbox" id="set-sound" />
        </div>
        <div class="field-row">
          <label>Notifikasi Desktop</label>
          <input type="checkbox" id="set-desktop" />
        </div>
      </div>

      <div class="tab-panel" data-panel="data">
        <p class="panel-desc">Export atau import seluruh bookmark, riwayat dan pengaturan.</p>
        <div class="field-row-btns">
          <button id="btn-export" class="mini-btn primary">Export Data (.json)</button>
          <label class="mini-btn" for="import-file">Import Data</label>
          <input type="file" id="import-file" accept="application/json" hidden />
        </div>
      </div>
    </div>
  </div>`;
}

function wireSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const settings = getSettings();

  document.getElementById("settings-close").onclick = () => modal.classList.remove("open");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("open"); };

  // Tabs
  modal.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      modal.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      modal.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    };
  });

  // Theme swatches
  modal.querySelectorAll(".swatch").forEach(sw => {
    if (sw.dataset.color === settings.accent) sw.classList.add("selected");
    sw.onclick = () => {
      modal.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
      sw.classList.add("selected");
      const s = getSettings();
      s.accent = sw.dataset.color;
      saveSettings(s);
      applyTheme(s);
    };
  });

  const themeMode = document.getElementById("set-theme-mode");
  themeMode.value = settings.themeMode;
  themeMode.onchange = () => {
    const s = getSettings(); s.themeMode = themeMode.value; saveSettings(s); applyTheme(s);
  };

  // Anime settings
  const autoplay = document.getElementById("set-autoplay");
  autoplay.checked = settings.anime.autoplayNext;
  autoplay.onchange = () => { const s = getSettings(); s.anime.autoplayNext = autoplay.checked; saveSettings(s); };

  const skipintro = document.getElementById("set-skipintro");
  skipintro.checked = settings.anime.skipIntro;
  skipintro.onchange = () => { const s = getSettings(); s.anime.skipIntro = skipintro.checked; saveSettings(s); };

  const quality = document.getElementById("set-quality");
  quality.value = settings.anime.defaultQuality;
  quality.onchange = () => { const s = getSettings(); s.anime.defaultQuality = quality.value; saveSettings(s); };

  // Manga settings
  const readerMode = document.getElementById("set-readermode");
  readerMode.value = settings.manga.readerMode;
  readerMode.onchange = () => { const s = getSettings(); s.manga.readerMode = readerMode.value; saveSettings(s); };

  const direction = document.getElementById("set-direction");
  direction.value = settings.manga.direction;
  direction.onchange = () => { const s = getSettings(); s.manga.direction = direction.value; saveSettings(s); };

  const margin = document.getElementById("set-margin");
  margin.value = settings.manga.margin;
  margin.onchange = () => { const s = getSettings(); s.manga.margin = +margin.value; saveSettings(s); };

  const pageanim = document.getElementById("set-pageanim");
  pageanim.checked = settings.manga.pageAnim;
  pageanim.onchange = () => { const s = getSettings(); s.manga.pageAnim = pageanim.checked; saveSettings(s); };

  // Notif settings
  const sound = document.getElementById("set-sound");
  sound.checked = settings.notif.sound;
  sound.onchange = () => { const s = getSettings(); s.notif.sound = sound.checked; saveSettings(s); };

  const desktop = document.getElementById("set-desktop");
  desktop.checked = settings.notif.desktop;
  desktop.onchange = () => {
    const s = getSettings(); s.notif.desktop = desktop.checked; saveSettings(s);
    if (desktop.checked && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  // Background upload & gallery
  document.getElementById("bg-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const id = await PamDB.addBackground(file.name, dataUrl);
      const s = getSettings(); s.activeBgId = id; saveSettings(s);
      applyTheme(s);
      await renderBgGallery();
      showToast("Background berhasil diupload & diaktifkan.");
    } catch (err) {
      showToast("Gagal upload: " + err.message);
    }
    e.target.value = "";
  };
  document.getElementById("bg-clear-active").onclick = () => {
    const s = getSettings(); s.activeBgId = null; saveSettings(s); applyTheme(s);
    renderBgGallery();
  };
  renderBgGallery();

  // Import / export
  document.getElementById("btn-export").onclick = exportAllData;
  document.getElementById("import-file").onchange = importAllData;
}

async function renderBgGallery() {
  const gallery = document.getElementById("bg-gallery");
  if (!gallery) return;
  const list = await PamDB.getAllBackgrounds();
  const settings = getSettings();
  if (!list.length) {
    gallery.innerHTML = `<div class="empty-state">Belum ada background tersimpan.</div>`;
    return;
  }
  gallery.innerHTML = list.slice().reverse().map(bg => `
    <div class="bg-thumb ${settings.activeBgId === bg.id ? 'active' : ''}" data-id="${bg.id}">
      <img src="${bg.data}" alt="${bg.name}" />
      <div class="bg-thumb-actions">
        <button class="mini-btn use-bg" data-id="${bg.id}">Pakai</button>
        <button class="mini-btn danger del-bg" data-id="${bg.id}">Hapus</button>
      </div>
    </div>`).join("");

  gallery.querySelectorAll(".use-bg").forEach(btn => btn.onclick = () => {
    const s = getSettings(); s.activeBgId = +btn.dataset.id; saveSettings(s); applyTheme(s); renderBgGallery();
  });
  gallery.querySelectorAll(".del-bg").forEach(btn => btn.onclick = async () => {
    await PamDB.deleteBackground(+btn.dataset.id);
    const s = getSettings();
    if (s.activeBgId === +btn.dataset.id) { s.activeBgId = null; saveSettings(s); applyTheme(s); }
    renderBgGallery();
  });
}

/* --------------------------- 10. IMPORT / EXPORT ----------------------------*/
function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    bookmarkAnime: lsGet(LS.BOOKMARK_ANIME, []),
    bookmarkManga: lsGet(LS.BOOKMARK_MANGA, []),
    historyAnime: lsGet(LS.HISTORY_ANIME, {}),
    historyManga: lsGet(LS.HISTORY_MANGA, {}),
    follow: lsGet(LS.FOLLOW, []),
    notifs: lsGet(LS.NOTIFS, [])
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portal-anime-manga-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Data berhasil diexport.");
}
function importAllData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data.settings) saveSettings(data.settings);
      if (data.bookmarkAnime) lsSet(LS.BOOKMARK_ANIME, data.bookmarkAnime);
      if (data.bookmarkManga) lsSet(LS.BOOKMARK_MANGA, data.bookmarkManga);
      if (data.historyAnime) lsSet(LS.HISTORY_ANIME, data.historyAnime);
      if (data.historyManga) lsSet(LS.HISTORY_MANGA, data.historyManga);
      if (data.follow) lsSet(LS.FOLLOW, data.follow);
      if (data.notifs) lsSet(LS.NOTIFS, data.notifs);
      showToast("Data berhasil diimport. Memuat ulang halaman...");
      setTimeout(() => location.reload(), 1200);
    } catch {
      showToast("File tidak valid.");
    }
  };
  reader.readAsText(file);
}

/* --------------------------- 11. SKELETON LOADER ----------------------------*/
function skeletonCards(n = 8) {
  return Array.from({ length: n }).map(() => `
    <div class="card skeleton">
      <div class="skeleton-box cover-ratio"></div>
      <div class="skeleton-box line"></div>
      <div class="skeleton-box line short"></div>
    </div>`).join("");
}

/* --------------------------- 12. INIT ---------------------------------------*/
document.addEventListener("DOMContentLoaded", () => {
  const settings = getSettings();
  applyTheme(settings);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const s = getSettings();
    if (s.themeMode === "auto") applyTheme(s);
  });

  const page = document.body.dataset.page || "";
  renderNavbar(page);
  checkForNewReleases();
});
