'use strict';
// Binary media stays in IndexedDB; small snapshots and the outbox stay in localStorage.
// All keys include the authenticated UID. Blob URLs are recreated after a reload.
window.MagicLocal = (() => {
  let dbPromise;
  function db() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('magic-local-media-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('media', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { dbPromise = null; reject(request.error); };
    });
  }
  async function run(mode, action) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('media', mode);
      const request = action(tx.objectStore('media'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Локальное сохранение прервано.'));
    });
  }
  const key = (uid, id) => `${uid}/${id}`;
  const get = (uid, id) => run('readonly', store => store.get(key(uid, id)));
  const put = (uid, id, value) => run('readwrite', store => store.put({ ...value, key: key(uid, id), uid, id }));
  const remove = (uid, id) => run('readwrite', store => store.delete(key(uid, id)));
  return { get, put, remove };
})();
