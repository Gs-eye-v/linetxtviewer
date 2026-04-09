const DB_NAME = "LineChatManager";
const DB_VERSION = 2;
const STORE_NAME = "chats";

class LineChatDB {
    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject("IndexedDB Error");
            request.onsuccess = (e) => resolve(e.target.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                }
                // V11: Add index for title-based lookup (for merging)
                const store = e.currentTarget.transaction.objectStore(STORE_NAME);
                if (!store.indexNames.contains("title")) {
                    store.createIndex("title", "title", { unique: false });
                }
            };
        });
    }

    static async saveChat(chat) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(chat);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Save failed");
        });
    }

    static async updateChat(chat) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(chat);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Update failed");
        });
    }

    static async getAllChats() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Fetch failed");
        });
    }

    static async getChatById(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Fetch failed");
        });
    }

    static async getChatByTitle(title) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index("title");
            const request = index.get(title);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject("Fetch by title failed");
        });
    }

    // V8: Deletion logic
    static async deleteChat(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject("Delete failed");
        });
    }
}
