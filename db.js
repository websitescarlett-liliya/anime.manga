/* ==========================================================================
   db.js — IndexedDB layer
   Menyimpan:
   - "backgrounds": custom background yang diupload user (maks 5000)
   - "imgcache"    : cache gambar (dataURL) supaya loading lebih cepat
   ========================================================================== */

const PAM_DB_NAME = "portal_anime_manga_db";
const PAM_DB_VERSION = 1;
const MAX_BACKGROUNDS = 5000;

let _pamDbPromise = null;

function openPamDB() {
  if (_pamDbPromise) return _pamDbPromise;
  _pamDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PAM_DB_NAME, PAM_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("backgrounds")) {
        const store = db.createObjectStore("backgrounds", { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("imgcache")) {
        db.createObjectStore("imgcache", { keyPath: "url" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _pamDbPromise;
}

const PamDB = {
  // ---- Backgrounds ----
  async addBackground(name, dataUrl) {
    const db = await openPamDB();
    const count = await this.countBackgrounds();
    if (count >= MAX_BACKGROUNDS) {
      throw new Error(`Batas maksimal ${MAX_BACKGROUNDS} background tercapai.`);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readwrite");
      const store = tx.objectStore("backgrounds");
      const req = store.add({ name, data: dataUrl, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllBackgrounds() {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readonly");
      const store = tx.objectStore("backgrounds");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async countBackgrounds() {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readonly");
      const req = tx.objectStore("backgrounds").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async deleteBackground(id) {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readwrite");
      const req = tx.objectStore("backgrounds").delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async getBackground(id) {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readonly");
      const req = tx.objectStore("backgrounds").get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // ---- Image cache (untuk preload reader) ----
  async cacheImage(url, dataUrl) {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("imgcache", "readwrite");
      const req = tx.objectStore("imgcache").put({ url, data: dataUrl, ts: Date.now() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async getCachedImage(url) {
    const db = await openPamDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("imgcache", "readonly");
      const req = tx.objectStore("imgcache").get(url);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }
};

// Helper: convert File -> dataURL
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
