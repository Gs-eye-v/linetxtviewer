/**
 * Ark-ive Crypto Utility
 * Web Crypto API (AES-GCM + PBKDF2)
 */
const ArkiveCrypto = {
    // PBKDF2 settings
    PBKDF2_ITERATIONS: 100000,
    SALT_LEN: 16,
    IV_LEN: 12,

    /**
     * Derive a CryptoKey from a password and salt.
     */
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: this.PBKDF2_ITERATIONS,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    /**
     * Encrypt a string or object
     */
    async encrypt(data, key) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_LEN));
        const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(plaintext)
        );

        // Combine IV and Ciphertext into a single Base64 string
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        
        return this.uint8ArrayToBase64(combined);
    },

    /**
     * Decrypt a Base64 string
     */
    async decrypt(combinedBase64, key) {
        const combined = this.base64ToUint8Array(combinedBase64);
        const iv = combined.slice(0, this.IV_LEN);
        const ciphertext = combined.slice(this.IV_LEN);
        
        const dec = new TextDecoder();
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            ciphertext
        );
        
        const decoded = dec.decode(plaintext);
        try {
            return JSON.parse(decoded);
        } catch(e) {
            return decoded;
        }
    },

    /**
     * Helper to generate a random salt
     */
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(this.SALT_LEN));
    },

    /**
     * Convert salt to Base64 for storage
     */
    saltToBase64(salt) {
        return this.uint8ArrayToBase64(salt);
    },

    /**
     * Convert Base64 back to salt
     */
    base64ToSalt(base64) {
        return this.base64ToUint8Array(base64);
    },

    /**
     * [V18 Helper] Safe Uint8Array to Base64 (avoid stack overflow)
     */
    uint8ArrayToBase64(uint8) {
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        return btoa(binary);
    },

    /**
     * [V18 Helper] Safe Base64 to Uint8Array (avoid large array map overhead)
     */
    base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
};