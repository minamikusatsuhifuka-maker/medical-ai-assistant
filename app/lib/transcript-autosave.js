// 書き起こし途中経過の自動保存・復元（IndexedDB）
// 充電切れ・誤クローズ対策。保存失敗が録音を止めないよう、全関数が内部でエラーを握りつぶす。

const DB_NAME = "mk_transcript_autosave";
const DB_VERSION = 1;
const STORE = "sessions";
const MAX_SESSIONS = 5;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("indexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllSessions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function pruneOldSessions() {
  const all = await getAllSessions();
  const excess = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_SESSIONS);
  if (!excess.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  excess.forEach(r => store.delete(r.sessionId));
}

export function genSessionId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return "s" + Date.now() + Math.random().toString(36).slice(2);
}

// mode更新のたびに呼ぶ。同一sessionIdなら上書き（startedAtは初回のものを維持）。
export async function saveTranscriptSession({ sessionId, mode, text, engine }) {
  try {
    const db = await openDb();
    const existing = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(sessionId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        sessionId, mode, text, engine,
        startedAt: existing?.startedAt || now,
        updatedAt: now,
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await pruneOldSessions();
  } catch (e) {
    console.error("[transcript-autosave] save error:", e);
  }
}

// 正常終了時（停止→保存/要約フロー完了、または破棄）に呼び、復元対象から外す。
export async function deleteTranscriptSession(sessionId) {
  if (!sessionId) return;
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(sessionId);
      tx.oncomplete = resolve;
      tx.onerror = () => resolve();
    });
  } catch (e) {
    console.error("[transcript-autosave] delete error:", e);
  }
}

// 起動時に復元バナー表示用に呼ぶ。新しい順で最大5件。
export async function getRecoverableSessions() {
  try {
    const all = await getAllSessions();
    return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
  } catch (e) {
    console.error("[transcript-autosave] load error:", e);
    return [];
  }
}
