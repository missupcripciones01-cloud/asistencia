const DB_NAME = 'AttendanceMasterDB';
const DB_VERSION = 1;

let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store para reuniones (cabecera por día)
            if (!db.objectStoreNames.contains('meetings')) {
                db.createObjectStore('meetings', { keyPath: 'date' });
            }

            // Store para asistentes de zoom (detalle)
            if (!db.objectStoreNames.contains('zoom_entries')) {
                const zoomStore = db.createObjectStore('zoom_entries', { keyPath: 'id', autoIncrement: true });
                zoomStore.createIndex('date', 'date', { unique: false });
            }

            // Store para nombres de asistentes (maestro para sugerencias)
            if (!db.objectStoreNames.contains('master_names')) {
                db.createObjectStore('master_names', { keyPath: 'name' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => reject('Error opening DB: ' + event.target.errorCode);
    });
}

// --- Funciones de Reunión ---
async function getMeeting(date) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['meetings'], 'readonly');
        const store = transaction.objectStore('meetings');
        const request = store.get(date);
        request.onsuccess = (e) => resolve(e.target.result);
    });
}

async function saveMeeting(meeting) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['meetings'], 'readwrite');
        const store = transaction.objectStore('meetings');
        store.put(meeting).onsuccess = () => resolve();
    });
}

async function getAllMeetings() {
    return new Promise((resolve) => {
        const transaction = db.transaction(['meetings'], 'readonly');
        const store = transaction.objectStore('meetings');
        store.getAll().onsuccess = (e) => resolve(e.target.result);
    });
}

// --- Funciones de Zoom ---
async function getZoomEntries(date) {
    return new Promise((resolve) => {
        const transaction = db.transaction(['zoom_entries'], 'readonly');
        const store = transaction.objectStore('zoom_entries');
        const index = store.index('date');
        index.getAll(IDBKeyRange.only(date)).onsuccess = (e) => resolve(e.target.result);
    });
}

async function saveZoomEntries(date, entries) {
    return new Promise(async (resolve) => {
        // Primero borramos las de ese día para sobreescribir
        const transaction = db.transaction(['zoom_entries', 'master_names'], 'readwrite');
        const zoomStore = transaction.objectStore('zoom_entries');
        const nameStore = transaction.objectStore('master_names');

        const index = zoomStore.index('date');
        const cursorRequest = index.openCursor(IDBKeyRange.only(date));

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                // Una vez borrados, añadimos los nuevos
                entries.forEach(entry => {
                    zoomStore.add(entry);
                    // También guardamos el nombre en el maestro para sugerencias
                    if (entry.name && entry.name.trim() !== "") {
                        nameStore.put({ name: entry.name.trim() });
                    }
                });
                resolve();
            }
        };
    });
}

// --- Maestro de Nombres ---
async function getMasterNames() {
    if (!db) await initDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(['master_names'], 'readonly');
        const store = transaction.objectStore('master_names');
        store.getAll().onsuccess = (e) => resolve(e.target.result);
    });
}

async function saveMasterNames(names) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['master_names'], 'readwrite');
        const store = transaction.objectStore('master_names');

        let count = 0;
        names.forEach(name => {
            store.put({ name: name });
            count++;
        });

        transaction.oncomplete = () => resolve(count);
        transaction.onerror = (e) => reject(e);
    });
}

// --- Portabilidad (Export/Import) ---
async function exportData() {
    if (!db) await initDB();
    const stores = ['meetings', 'zoom_entries', 'master_names'];
    let out = {};

    for (const sName of stores) {
        out[sName] = await new Promise((resolve) => {
            const tx = db.transaction([sName], 'readonly');
            const store = tx.objectStore(sName);
            store.getAll().onsuccess = (e) => resolve(e.target.result);
        });
    }
    return JSON.stringify(out);
}

async function importData(jsonData) {
    if (!db) await initDB();
    const data = JSON.parse(jsonData);
    const storeNames = ['meetings', 'zoom_entries', 'master_names'];

    for (const sName of storeNames) {
        if (data[sName]) {
            const tx = db.transaction([sName], 'readwrite');
            const store = tx.objectStore(sName);
            for (const item of data[sName]) {
                store.put(item);
            }
        }
    }
}
