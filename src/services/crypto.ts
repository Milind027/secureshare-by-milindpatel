// ============================================================
// SecureShare Crypto Service — Web Crypto API only, no deps
// ============================================================

/** Convert Uint8Array to a proper ArrayBuffer (fixes TS strict typing) */
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
}

// ---- Base64URL helpers ----

export function encodeBase64Url(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---- AES-GCM 256 ----

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportAesKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBuffer(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export async function encryptData(
  key: CryptoKey,
  data: Uint8Array
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toBuffer(data))
  );
  return { iv, ciphertext };
}

export async function decryptData(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toBuffer(ciphertext));
  return new Uint8Array(plaintext);
}

/** Bundle iv + ciphertext into a single Uint8Array: [iv(12) | ciphertext] */
export function bundleIvCiphertext(iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const buf = new Uint8Array(iv.length + ciphertext.length);
  buf.set(iv, 0);
  buf.set(ciphertext, iv.length);
  return buf;
}

/** Unbundle [iv(12) | ciphertext] */
export function unbundleIvCiphertext(bundle: Uint8Array): { iv: Uint8Array; ciphertext: Uint8Array } {
  return { iv: bundle.slice(0, 12), ciphertext: bundle.slice(12) };
}

// ---- PBKDF2 Password-based ----

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', toBuffer(enc.encode(password)), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBuffer(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt with password → returns [salt(16) | iv(12) | ciphertext] */
export async function encryptWithPassword(
  password: string,
  data: Uint8Array
): Promise<Uint8Array> {
  const salt = generateSalt();
  const key = await deriveKeyFromPassword(password, salt);
  const { iv, ciphertext } = await encryptData(key, data);
  const result = new Uint8Array(16 + 12 + ciphertext.length);
  result.set(salt, 0);
  result.set(iv, 16);
  result.set(ciphertext, 28);
  return result;
}

/** Decrypt with password from [salt(16) | iv(12) | ciphertext] */
export async function decryptWithPassword(
  password: string,
  blob: Uint8Array
): Promise<Uint8Array> {
  const salt = blob.slice(0, 16);
  const iv = blob.slice(16, 28);
  const ciphertext = blob.slice(28);
  const key = await deriveKeyFromPassword(password, salt);
  return decryptData(key, iv, ciphertext);
}

// ---- RSA-OAEP 2048 + Hybrid Encryption ----

export async function generateRsaKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

export async function exportPublicKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function exportPrivateKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

export async function importPrivateKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
}

export async function exportPublicKeyBase64Url(key: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
  return encodeBase64Url(spki);
}

export async function importPublicKeyBase64Url(str: string): Promise<CryptoKey> {
  const spki = decodeBase64Url(str);
  return crypto.subtle.importKey('spki', toBuffer(spki), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

export async function encryptHybrid(
  receiverPublicKey: CryptoKey,
  data: Uint8Array
): Promise<{ encryptedAesKey: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array }> {
  const aesKey = await generateAesKey();
  const { iv, ciphertext } = await encryptData(aesKey, data);
  const rawAesKey = await exportAesKey(aesKey);
  const encryptedAesKey = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, receiverPublicKey, toBuffer(rawAesKey))
  );
  return { encryptedAesKey, iv, ciphertext };
}

export async function decryptHybrid(
  receiverPrivateKey: CryptoKey,
  encryptedAesKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const rawAesKey = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, receiverPrivateKey, toBuffer(encryptedAesKey))
  );
  const aesKey = await importAesKey(rawAesKey);
  return decryptData(aesKey, iv, ciphertext);
}
