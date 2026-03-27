
# SecureShare — End-to-End Encrypted File & Text Sharing

## Overview
A zero-knowledge encrypted sharing app where all encryption happens client-side using Web Crypto API. The server (Supabase) only stores opaque encrypted blobs and never sees plaintext data or keys.

## Backend (Supabase Cloud)

### Database
- **`shares` table**: `id (uuid)`, `mode (text: aes|password|rsa-aes)`, `single_view (boolean)`, `created_at`, `expires_at`, `blob_path (text)` — metadata only, no plaintext
- Row-Level Security: public read by ID, public insert, auto-delete expired records

### Storage
- **`encrypted-blobs` bucket**: stores opaque encrypted binary blobs keyed by share ID
- Public read access (blobs are encrypted anyway), authenticated or anon insert

### Edge Functions
- **`upload`**: validates size/expiry, generates UUID, stores blob in storage + metadata in DB, returns `{ rid, expiresAt }`
- **`download`**: fetches blob by RID, checks expiry, enforces single-view (atomic delete-on-read), returns blob + metadata
- **`cleanup`**: scheduled/invoked to purge expired records
- **`health`**: returns status info

## Frontend Architecture

### Pages
1. **HomePage** — hero with "Share Something" and "Receive" buttons, feature highlights
2. **SendPage** — content input, encryption mode selection, encrypt & upload flow
3. **ReceivePage** (`/download/:rid`) — download, decrypt, display/download content
4. **ReceiverSetupPage** (`/receiver-setup`) — RSA key pair generation, QR code display

### Crypto Service (`src/services/crypto.ts`)
All pure TypeScript using Web Crypto API:
- **AES-GCM 256**: generate, export, import keys; encrypt/decrypt data
- **PBKDF2**: password-based key derivation (100k iterations, SHA-256, random 16-byte salt)
- **RSA-OAEP 2048**: key pair generation, hybrid encryption (RSA wraps random AES key)
- **Base64URL**: URL-safe encoding/decoding for keys and payloads

### Steganography Service (`src/services/stego.ts`)
- **PNG LSB**: embed/extract encrypted payload in least-significant bits of image R channel via Canvas API
- **WAV LSB**: embed/extract in audio sample LSBs by parsing WAV binary format
- Capacity checking before embedding

### Send Page Features
- **Tab switcher**: Text input or File(s) drag-and-drop
- **Multi-file**: auto-zip with JSZip before encryption
- **3 encryption modes** with mode cards:
  - *Random Key*: auto-generated AES key embedded in URL fragment (never sent to server)
  - *Password*: user enters shared password, PBKDF2 derives key
  - *Public Key (RSA)*: paste receiver's public key or scan QR code
- **Steganography toggle**: optionally hide encrypted data in a cover PNG/WAV
- **Expiry picker**: 1h / 6h / 24h / 72h / 7d
- **Single-view toggle**: self-destruct after first download
- **Success screen**: copyable share link, QR code (qrcode.react), expiry info

### Receive Page Features
- Parse RID from URL path, AES key from URL fragment
- Auto-detect encryption mode from payload
- Password mode: show password input form
- RSA mode: load private key from localStorage or file import
- Detect stego (PNG/WAV magic bytes) → extract before decrypt
- Display text inline or offer file download; unzip multi-file with JSZip

### QR Code Exchange
- Receiver setup page: generate RSA key pair, display public key as QR
- Send page RSA mode: scan QR with html5-qrcode camera scanner
- Export/import private key as .json file

### UI/UX
- Dark/light theme toggle (system preference default, localStorage persist)
- Responsive mobile layout
- Loading states, error boundaries, retry buttons
- Security warnings about localStorage key storage
- Tailwind CSS + Lucide React icons

### Key Hook
- `useKeyPair()`: manages RSA key pair in localStorage, auto-loads on mount, generate/clear/export/import

## Security Model
- AES key only in URL fragment (never sent in HTTP requests)
- Server stores only opaque encrypted blobs — zero knowledge
- Single-view enforced server-side with atomic delete
- No analytics, no tracking, no third-party scripts
- Rate limiting on edge functions
- Input validation on all endpoints
