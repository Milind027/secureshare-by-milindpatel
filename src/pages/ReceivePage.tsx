import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import JSZip from 'jszip';
import {
  Lock, Key, FileDown, AlertTriangle, Loader2, Check,
  Eye, Download, FileText, Image, Music, Camera, ScanLine
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useKeyPair } from '@/hooks/useKeyPair';
import {
  decryptData, decryptWithPassword, decryptHybrid,
  decodeBase64Url, importAesKey, unbundleIvCiphertext
} from '@/services/crypto';
import { extractFromPng, extractFromWav, isPng, isWav } from '@/services/stego';
import { downloadBlob } from '@/services/api';
import type { SharePayload } from '@/types/share';

type Step = 'loading' | 'password-prompt' | 'rsa-prompt' | 'decrypting' | 'display' | 'error' | 'expired';

interface DecryptedContent {
  data: Uint8Array;
  filename?: string;
  mimeType?: string;
  isZip?: boolean;
  isText?: boolean;
}

export default function ReceivePage() {
  const { rid } = useParams<{ rid: string }>();
  const location = useLocation();
  const { toast } = useToast();
  const keyPair = useKeyPair();

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [rawBlob, setRawBlob] = useState<Uint8Array | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [content, setContent] = useState<DecryptedContent | null>(null);
  const [singleView, setSingleView] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract the AES key from hash fragment (for aes mode)
  // URL format: #/download/:rid#<aesKey>
  const getAesKeyFromHash = useCallback(() => {
    const fullHash = window.location.hash;
    // Hash is like #/download/rid#key
    const parts = fullHash.split('#');
    if (parts.length >= 3) {
      return parts[2];
    }
    return null;
  }, []);

  // Step 1: Download the blob
  useEffect(() => {
    if (!rid) return;

    (async () => {
      try {
        const result = await downloadBlob(rid);
        setSingleView(result.singleView);
        setExpiresAt(result.expiresAt);

        let blobData = result.blob;

        // Detect steganography and extract
        if (isPng(blobData)) {
          blobData = await extractFromPng(blobData);
        } else if (isWav(blobData)) {
          blobData = await extractFromWav(blobData);
        }

        // Parse as JSON payload
        const payloadText = new TextDecoder().decode(blobData);
        const parsed: SharePayload = JSON.parse(payloadText);
        setPayload(parsed);
        setRawBlob(blobData);

        if (parsed.type === 'aes') {
          // Try to auto-decrypt with key from URL fragment
          const aesKeyB64 = getAesKeyFromHash();
          if (aesKeyB64) {
            await decryptAes(parsed, aesKeyB64);
          } else {
            setError('AES key not found in the URL. The link may be incomplete.');
            setStep('error');
          }
        } else if (parsed.type === 'password') {
          setStep('password-prompt');
        } else if (parsed.type === 'rsa-aes') {
          if (keyPair.privateKey) {
            await decryptRsa(parsed, keyPair.privateKey);
          } else {
            setStep('rsa-prompt');
          }
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to download';
        if (msg.includes('expired') || msg.includes('not found')) {
          setStep('expired');
        } else {
          setError(msg);
          setStep('error');
        }
      }
    })();
  }, [rid]);

  const buildContent = (data: Uint8Array, p: SharePayload): DecryptedContent => {
    const isText = p.mimeType === 'text/plain' || (!p.filename && !p.isZip);
    return {
      data,
      filename: p.filename,
      mimeType: p.mimeType,
      isZip: p.isZip,
      isText,
    };
  };

  const decryptAes = async (p: SharePayload, aesKeyB64: string) => {
    setStep('decrypting');
    try {
      const rawKey = decodeBase64Url(aesKeyB64);
      const aesKey = await importAesKey(rawKey);
      const iv = decodeBase64Url(p.iv!);
      const ciphertext = decodeBase64Url(p.ciphertext);
      const plaintext = await decryptData(aesKey, iv, ciphertext);
      setContent(buildContent(plaintext, p));
      setStep('display');
    } catch {
      setError('Decryption failed. The link or key may be invalid.');
      setStep('error');
    }
  };

  const decryptPassword = async () => {
    if (!password || !payload) return;
    setStep('decrypting');
    try {
      const ciphertextBundle = decodeBase64Url(payload.ciphertext);
      const plaintext = await decryptWithPassword(password, ciphertextBundle);
      setContent(buildContent(plaintext, payload));
      setStep('display');
    } catch {
      setError('Wrong password or corrupted data.');
      setStep('password-prompt');
      toast({ title: 'Decryption failed', description: 'Check your password and try again.', variant: 'destructive' });
    }
  };

  const decryptRsa = async (p: SharePayload, privKey: CryptoKey) => {
    setStep('decrypting');
    try {
      const encryptedAesKey = decodeBase64Url(p.encryptedAesKey!);
      const iv = decodeBase64Url(p.iv!);
      const ciphertext = decodeBase64Url(p.ciphertext);
      const plaintext = await decryptHybrid(privKey, encryptedAesKey, iv, ciphertext);
      setContent(buildContent(plaintext, p));
      setStep('display');
    } catch {
      setError('Decryption failed. Wrong private key or corrupted data.');
      setStep('error');
    }
  };

  const handleImportPrivateKey = async () => {
    if (!privateKeyFile || !payload) return;
    try {
      const text = await privateKeyFile.text();
      const data = JSON.parse(text);
      await keyPair.importKeys(data);
      // After import, the privateKey will be available
      const { importPrivateKeyJwk } = await import('@/services/crypto');
      const privKey = await importPrivateKeyJwk(data.privateKeyJwk);
      await decryptRsa(payload, privKey);
    } catch {
      toast({ title: 'Import failed', description: 'Invalid key file format.', variant: 'destructive' });
    }
  };

  const downloadFile = (data: Uint8Array, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadContent = async () => {
    if (!content) return;

    if (content.isZip) {
      // Unzip and download individual files
      try {
        const zip = await JSZip.loadAsync(content.data);
        const entries = Object.entries(zip.files);
        for (const [name, file] of entries) {
          if (!file.dir) {
            const data = await file.async('uint8array');
            downloadFile(data, name, 'application/octet-stream');
          }
        }
      } catch {
        downloadFile(content.data, content.filename || 'files.zip', 'application/zip');
      }
    } else {
      downloadFile(
        content.data,
        content.filename || 'download',
        content.mimeType || 'application/octet-stream'
      );
    }
  };

  // Expired
  if (step === 'expired') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Share Expired</h1>
        <p className="text-muted-foreground">This share has expired or has already been viewed (single-view).</p>
      </div>
    );
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Downloading…</h2>
        <p className="text-muted-foreground">Fetching encrypted data from the server.</p>
      </div>
    );
  }

  // Decrypting
  if (step === 'decrypting') {
    return (
      <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Decrypting…</h2>
        <p className="text-muted-foreground">Your data is being decrypted locally in the browser.</p>
      </div>
    );
  }

  // Error
  if (step === 'error') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Decryption Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // Password prompt
  if (step === 'password-prompt') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Password Required</h1>
          <p className="text-muted-foreground">This share is protected with a password.</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="decrypt-password">Password</Label>
              <Input
                id="decrypt-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter the shared password"
                onKeyDown={(e) => e.key === 'Enter' && decryptPassword()}
              />
            </div>
            <Button onClick={decryptPassword} className="w-full" disabled={!password}>
              <Lock className="w-4 h-4 mr-2" />
              Decrypt
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // RSA prompt
  if (step === 'rsa-prompt') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Private Key Required</h1>
          <p className="text-muted-foreground">This share was encrypted with your public key. Import your private key to decrypt.</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-6 space-y-4">
            {keyPair.publicKey && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 text-sm">
                <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Key pair found in browser storage. Attempting decryption…</span>
              </div>
            )}

            <div className="space-y-3">
              <Label>Import Key File (.json)</Label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-border rounded-lg p-6 text-center text-sm text-muted-foreground hover:border-primary/50 transition-colors"
              >
                {privateKeyFile ? (
                  <span className="flex items-center justify-center gap-2">
                    <Key className="w-4 h-4" />
                    {privateKeyFile.name}
                  </span>
                ) : (
                  <>
                    <FileDown className="w-6 h-6 mx-auto mb-2" />
                    <p>Click to select your key pair .json file</p>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setPrivateKeyFile(e.target.files[0])}
              />
            </div>

            <Button onClick={handleImportPrivateKey} className="w-full" disabled={!privateKeyFile}>
              <Key className="w-4 h-4 mr-2" />
              Import & Decrypt
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Don't have a key pair? Go to{' '}
              <a href="#/receiver-setup" className="text-primary hover:underline">Key Management</a>{' '}
              to generate one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Display decrypted content
  if (step === 'display' && content) {
    const textContent = content.isText ? new TextDecoder().decode(content.data) : null;
    const isImage = content.mimeType?.startsWith('image/');
    const isAudio = content.mimeType?.startsWith('audio/');
    const isVideo = content.mimeType?.startsWith('video/');

    let previewUrl: string | null = null;
    if (isImage || isAudio || isVideo) {
      previewUrl = URL.createObjectURL(new Blob([content.data], { type: content.mimeType }));
    }

    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Decrypted Successfully</h1>
          <p className="text-muted-foreground">
            {singleView && '⚠️ Single-view: this data has been deleted from the server. '}
            {expiresAt && `Expires ${new Date(expiresAt).toLocaleString()}`}
          </p>
        </div>

        <Card className="bg-card/50 border-border/50 mb-6">
          <CardContent className="p-6">
            {textContent && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>Text Content</span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm bg-muted/50 rounded-lg p-4 max-h-[400px] overflow-auto">
                  {textContent}
                </pre>
              </div>
            )}

            {isImage && previewUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Image className="w-4 h-4" />
                  <span>{content.filename || 'Image'}</span>
                </div>
                <img src={previewUrl} alt="Decrypted" className="rounded-lg max-w-full" />
              </div>
            )}

            {isAudio && previewUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Music className="w-4 h-4" />
                  <span>{content.filename || 'Audio'}</span>
                </div>
                <audio controls src={previewUrl} className="w-full" />
              </div>
            )}

            {isVideo && previewUrl && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  <span>{content.filename || 'Video'}</span>
                </div>
                <video controls src={previewUrl} className="rounded-lg max-w-full" />
              </div>
            )}

            {!textContent && !isImage && !isAudio && !isVideo && (
              <div className="text-center py-6">
                <FileDown className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">{content.filename || (content.isZip ? 'Multiple files (zip)' : 'Binary file')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(content.data.length / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleDownloadContent} size="lg" className="w-full text-base">
          <Download className="w-5 h-5 mr-2" />
          {content.isZip ? 'Download All Files' : `Download ${content.filename || 'File'}`}
        </Button>
      </div>
    );
  }

  return null;
}
