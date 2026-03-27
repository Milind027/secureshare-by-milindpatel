import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { QRCodeSVG } from 'qrcode.react';
import {
  Shield, FileText, Upload, Lock, Key, Eye, EyeOff, Clock,
  Copy, Check, AlertTriangle, Loader2, X, Image, Music
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  generateAesKey, exportAesKey, encryptData, encryptWithPassword,
  encryptHybrid, importPublicKeyBase64Url, encodeBase64Url, bundleIvCiphertext
} from '@/services/crypto';
import { uploadBlob } from '@/services/api';
import { embedInPng, embedInWav, checkPngCapacity, isPng, isWav } from '@/services/stego';
import type { EncryptionMode, SharePayload } from '@/types/share';

const EXPIRY_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
];

type Step = 'input' | 'encrypting' | 'success';

export default function SendPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('input');
  const [contentTab, setContentTab] = useState<'text' | 'files'>('text');
  const [textContent, setTextContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<EncryptionMode>('aes');
  const [password, setPassword] = useState('');
  const [receiverPublicKey, setReceiverPublicKey] = useState('');
  const [expiryHours, setExpiryHours] = useState(24);
  const [singleView, setSingleView] = useState(false);
  const [stegoEnabled, setStegoEnabled] = useState(false);
  const [stegoCoverFile, setStegoCoverFile] = useState<File | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stegoInputRef = useRef<HTMLInputElement>(null);

  const totalFileSize = files.reduce((acc, f) => acc + f.size, 0);

  const handleFiles = (newFiles: FileList | File[]) => {
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const getPlaintext = async (): Promise<{ data: Uint8Array; filename?: string; mimeType?: string; isZip?: boolean }> => {
    if (contentTab === 'text') {
      return { data: new TextEncoder().encode(textContent), mimeType: 'text/plain' };
    }

    if (files.length === 1) {
      const buf = await files[0].arrayBuffer();
      return {
        data: new Uint8Array(buf),
        filename: files[0].name,
        mimeType: files[0].type || 'application/octet-stream',
      };
    }

    // Multiple files → zip
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name, await file.arrayBuffer());
    }
    const zipBlob = await zip.generateAsync({ type: 'uint8array' });
    return { data: zipBlob, filename: 'files.zip', mimeType: 'application/zip', isZip: true };
  };

  const handleShare = async () => {
    setError('');

    // Validation
    if (contentTab === 'text' && !textContent.trim()) {
      toast({ title: 'Empty content', description: 'Enter some text to share.', variant: 'destructive' });
      return;
    }
    if (contentTab === 'files' && files.length === 0) {
      toast({ title: 'No files', description: 'Select files to share.', variant: 'destructive' });
      return;
    }
    if (mode === 'password' && !password) {
      toast({ title: 'No password', description: 'Enter a password for encryption.', variant: 'destructive' });
      return;
    }
    if (mode === 'rsa-aes' && !receiverPublicKey.trim()) {
      toast({ title: 'No public key', description: 'Enter the receiver\'s public key.', variant: 'destructive' });
      return;
    }

    setStep('encrypting');

    try {
      const { data, filename, mimeType, isZip } = await getPlaintext();

      let payload: SharePayload;
      let aesKeyBase64Url: string | undefined;

      if (mode === 'aes') {
        const aesKey = await generateAesKey();
        const { iv, ciphertext } = await encryptData(aesKey, data);
        const rawKey = await exportAesKey(aesKey);
        aesKeyBase64Url = encodeBase64Url(rawKey);
        payload = {
          type: 'aes',
          iv: encodeBase64Url(iv),
          ciphertext: encodeBase64Url(ciphertext),
          filename, mimeType, isZip,
        };
      } else if (mode === 'password') {
        const encrypted = await encryptWithPassword(password, data);
        payload = {
          type: 'password',
          ciphertext: encodeBase64Url(encrypted),
          filename, mimeType, isZip,
        };
      } else {
        // RSA hybrid
        const pubKey = await importPublicKeyBase64Url(receiverPublicKey.trim());
        const { encryptedAesKey, iv, ciphertext } = await encryptHybrid(pubKey, data);
        payload = {
          type: 'rsa-aes',
          encryptedAesKey: encodeBase64Url(encryptedAesKey),
          iv: encodeBase64Url(iv),
          ciphertext: encodeBase64Url(ciphertext),
          filename, mimeType, isZip,
        };
      }

      // Serialize payload to bytes
      let payloadBytes: Uint8Array = new Uint8Array(new TextEncoder().encode(JSON.stringify(payload)));

      // Steganography embedding
      if (stegoEnabled && stegoCoverFile) {
        const coverBytes = new Uint8Array(await stegoCoverFile.arrayBuffer());
        if (isPng(coverBytes)) {
          payloadBytes = await embedInPng(coverBytes, payloadBytes);
        } else if (isWav(coverBytes)) {
          payloadBytes = await embedInWav(coverBytes, payloadBytes);
        } else {
          throw new Error('Cover file must be PNG or WAV');
        }
      }

      // Upload
      const result = await uploadBlob(payloadBytes, { mode, expiryHours, singleView });

      // Build share link
      const baseUrl = window.location.origin + window.location.pathname;
      let link = `${baseUrl}#/download/${result.rid}`;
      if (mode === 'aes' && aesKeyBase64Url) {
        link += `#${aesKeyBase64Url}`;
      }

      setShareLink(link);
      setExpiresAt(result.expiresAt);
      setStep('success');
    } catch (err: any) {
      console.error('Share error:', err);
      setError(err.message || 'Encryption or upload failed');
      setStep('input');
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setStep('input');
    setTextContent('');
    setFiles([]);
    setPassword('');
    setReceiverPublicKey('');
    setShareLink('');
    setCopied(false);
    setError('');
    setStegoEnabled(false);
    setStegoCoverFile(null);
  };

  // Success screen
  if (step === 'success') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Shared Successfully!</h1>
          <p className="text-muted-foreground">
            Expires {new Date(expiresAt).toLocaleString()}
            {singleView && ' · Self-destructs after first view'}
          </p>
        </div>

        <Card className="bg-card/50 border-border/50 mb-6">
          <CardContent className="p-6 space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Share Link</Label>
              <div className="flex gap-2">
                <Input value={shareLink} readOnly className="font-mono text-xs" />
                <Button onClick={copyLink} variant="outline" size="icon">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex justify-center py-4">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={shareLink} size={200} />
              </div>
            </div>

            {mode === 'rsa-aes' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <span>The receiver needs their private key to decrypt this share.</span>
              </div>
            )}

            {mode === 'password' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 text-sm">
                <Lock className="w-4 h-4 text-info mt-0.5 shrink-0" />
                <span>Share the password with the receiver through a separate channel.</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={resetForm} variant="outline" className="w-full">Share Something Else</Button>
      </div>
    );
  }

  // Encrypting screen
  if (step === 'encrypting') {
    return (
      <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Encrypting & Uploading…</h2>
        <p className="text-muted-foreground">Your data is being encrypted in the browser before upload.</p>
      </div>
    );
  }

  // Input screen
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Share Securely</h1>
        <p className="text-muted-foreground">Everything is encrypted in your browser before leaving your device.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-destructive/10 text-destructive mb-6">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Content Input */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardContent className="p-6">
          <Tabs value={contentTab} onValueChange={(v) => { setContentTab(v as 'text' | 'files'); }}>
            <TabsList className="mb-4">
              <TabsTrigger value="text" className="gap-2"><FileText className="w-4 h-4" />Text</TabsTrigger>
              <TabsTrigger value="files" className="gap-2"><Upload className="w-4 h-4" />File(s)</TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Enter text to share securely…"
                className="min-h-[150px] font-mono text-sm"
              />
            </TabsContent>

            <TabsContent value="files">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Max 50MB total</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {files.length > 1 && (
                    <p className="text-xs text-muted-foreground">📦 Multiple files will be zipped before encryption</p>
                  )}
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                      <span className="truncate">{file.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)}KB</span>
                        <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {totalFileSize > 50 * 1024 * 1024 && (
                    <p className="text-xs text-destructive">⚠️ Total size exceeds 50MB limit</p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Encryption Mode */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardContent className="p-6">
          <Label className="text-sm font-medium mb-3 block">Encryption Mode</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { id: 'aes' as EncryptionMode, icon: Shield, label: 'Random Key', desc: 'Key embedded in link' },
              { id: 'password' as EncryptionMode, icon: Lock, label: 'Password', desc: 'Shared secret needed' },
              { id: 'rsa-aes' as EncryptionMode, icon: Key, label: 'Public Key', desc: 'RSA key exchange' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  mode === m.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                <m.icon className={`w-5 h-5 mb-2 ${mode === m.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </button>
            ))}
          </div>

          {mode === 'password' && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a strong password"
              />
              {password && (
                <div className="flex gap-1">
                  {[...Array(Math.min(4, Math.ceil(password.length / 3)))].map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded ${
                      i < 2 ? 'bg-destructive' : i < 3 ? 'bg-warning' : 'bg-success'
                    }`} />
                  ))}
                  {[...Array(Math.max(0, 4 - Math.min(4, Math.ceil(password.length / 3))))].map((_, i) => (
                    <div key={i + 10} className="h-1 flex-1 rounded bg-muted" />
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'rsa-aes' && (
            <div className="space-y-2">
              <Label htmlFor="pubkey" className="text-sm">Receiver's Public Key</Label>
              <Textarea
                id="pubkey"
                value={receiverPublicKey}
                onChange={(e) => setReceiverPublicKey(e.target.value)}
                placeholder="Paste base64url-encoded public key…"
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Options */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardContent className="p-6 space-y-4">
          {/* Expiry */}
          <div>
            <Label className="text-sm font-medium mb-3 block">
              <Clock className="w-4 h-4 inline mr-1" />
              Expiry
            </Label>
            <div className="flex gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  onClick={() => setExpiryHours(opt.hours)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    expiryHours === opt.hours
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Single view */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="single-view" className="text-sm">Self-destruct after first view</Label>
            </div>
            <Switch id="single-view" checked={singleView} onCheckedChange={setSingleView} />
          </div>

          {/* Steganography */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="stego" className="text-sm">Hide in cover file (steganography)</Label>
              </div>
              <Switch id="stego" checked={stegoEnabled} onCheckedChange={setStegoEnabled} />
            </div>

            {stegoEnabled && (
              <div>
                <button
                  onClick={() => stegoInputRef.current?.click()}
                  className="w-full border border-dashed border-border rounded-lg p-4 text-center text-sm text-muted-foreground hover:border-primary/50 transition-colors"
                >
                  {stegoCoverFile ? (
                    <span className="flex items-center justify-center gap-2">
                      {isPng(new Uint8Array()) ? <Image className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                      {stegoCoverFile.name}
                    </span>
                  ) : (
                    'Select cover PNG or WAV file'
                  )}
                </button>
                <input
                  ref={stegoInputRef}
                  type="file"
                  accept=".png,.wav"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setStegoCoverFile(e.target.files[0])}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Share button */}
      <Button onClick={handleShare} size="lg" className="w-full text-base">
        <Shield className="w-5 h-5 mr-2" />
        Encrypt & Share
      </Button>
    </div>
  );
}
