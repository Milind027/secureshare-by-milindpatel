export type EncryptionMode = 'aes' | 'password' | 'rsa-aes';

export interface UploadOptions {
  mode: EncryptionMode;
  expiryHours: number;
  singleView: boolean;
}

export interface SharePayload {
  type: EncryptionMode;
  iv?: string; // base64url, AES mode
  encryptedAesKey?: string; // base64url, RSA mode
  ciphertext: string; // base64url
  filename?: string;
  mimeType?: string;
  isZip?: boolean;
}

export interface ShareResult {
  rid: string;
  expiresAt: string;
}

export interface DownloadResult {
  blob: Uint8Array;
  mode: EncryptionMode;
  expiresAt: string;
  singleView: boolean;
}

export interface StorageRecord {
  blob: string; // base64
  mode: EncryptionMode;
  singleView: boolean;
  createdAt: string;
  expiresAt: string;
}
