export interface StoredKey {
  salt: string;
  iv: string;
  ciphertext: string;
}

const STORAGE_KEY = 'cdli-chat-byom-key';
const PBKDF2_ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveAesKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptApiKey(plaintext: string, pin: string): Promise<StoredKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(pin, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

// Throws (DOMException from AES-GCM tag check) on a wrong PIN — callers treat any rejection as "wrong PIN".
export async function decryptApiKey(stored: StoredKey, pin: string): Promise<string> {
  const key = await deriveAesKey(pin, fromBase64(stored.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(stored.iv) },
    key,
    fromBase64(stored.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function saveEncryptedKey(stored: StoredKey): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function loadEncryptedKey(): StoredKey | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredKey) : null;
}

export function clearEncryptedKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
