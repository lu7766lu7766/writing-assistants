const SETTINGS_KEY = 'essay_helper_settings_v1';
const DRAFT_KEY = 'essay_helper_draft_v1';
const FALLBACK_HISTORY_KEY = 'essay_helper_history_fallback_v1';
const SCORE_CACHE_KEY = 'essay_helper_score_cache_v1';

const DB_NAME = 'essay_helper_db';
const DB_VERSION = 1;
const STORE_NAME = 'history';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'gemini-3.5-flash-lite',
  temperature: 0.4,
  saveHistory: true,
  privacyNoticeDismissed: false,
  availableModels: []
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      temperature:
        typeof parsed.temperature === 'number' && !Number.isNaN(parsed.temperature)
          ? Math.min(1, Math.max(0, parsed.temperature))
          : DEFAULT_SETTINGS.temperature
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(partial) {
  const merged = { ...loadSettings(), ...partial };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors
  }
  return merged;
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return { type: 'intellectual', title: '', promptText: '', content: '' };
    }
    const parsed = JSON.parse(raw);
    return {
      type: parsed.type || 'intellectual',
      title: parsed.title || '',
      promptText: parsed.promptText || '',
      content: parsed.content || ''
    };
  } catch {
    return { type: 'intellectual', title: '', promptText: '', content: '' };
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// Hash helper for caching identical essay submissions
export function makeEssayCacheKey({ type, title, promptText, content, model }) {
  const str = `${model || ''}||${type || ''}||${(title || '').trim()}||${(promptText || '').trim()}||${(content || '').trim()}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cache_${(h >>> 0).toString(16)}_${str.length}`;
}

export function getCachedResult(cacheKey) {
  try {
    const raw = sessionStorage.getItem(SCORE_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[cacheKey] || null;
  } catch {
    return null;
  }
}

export function setCachedResult(cacheKey, result) {
  try {
    const raw = sessionStorage.getItem(SCORE_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[cacheKey] = result;
    sessionStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// IndexedDB with localStorage fallback
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

function readFallbackHistory() {
  try {
    const raw = localStorage.getItem(FALLBACK_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeFallbackHistory(list) {
  try {
    localStorage.setItem(FALLBACK_HISTORY_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export async function addHistoryRecord(record) {
  const item = {
    id: record.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || Date.now(),
    type: record.type || 'intellectual',
    title: record.title || '',
    promptText: record.promptText || '',
    content: record.content || '',
    model: record.model || '',
    result: record.result
  };

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    const list = readFallbackHistory();
    const filtered = list.filter((x) => x.id !== item.id);
    filtered.unshift(item);
    writeFallbackHistory(filtered.slice(0, 100));
  }
  return item;
}

export async function listHistoryRecords() {
  try {
    const db = await openDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    const list = readFallbackHistory();
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function getHistoryRecord(id) {
  const all = await listHistoryRecords();
  return all.find((x) => x.id === id) || null;
}

export async function deleteHistoryRecord(id) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // fallback
  }
  const list = readFallbackHistory().filter((x) => x.id !== id);
  writeFallbackHistory(list);
}

export async function clearHistoryRecords() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
  writeFallbackHistory([]);
}

export async function clearAllLocalData() {
  await clearHistoryRecords();
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(FALLBACK_HISTORY_KEY);
    sessionStorage.removeItem(SCORE_CACHE_KEY);
  } catch {
    // ignore
  }
}

