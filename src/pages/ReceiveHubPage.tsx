import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import {
  Lock, Key, Camera, ScanLine, X, Download, Upload, Shield,
  RefreshCw, Trash2, Copy, Check, AlertTriangle, FileDown,
  QrCode, Eye, Link as LinkIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useKeyPair } from '@/hooks/useKeyPair';

export default function ReceiveHub() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const keyPair = useKeyPair();

  // --- Share link / manual entry ---
  const [shareLink, setShareLink] = useState('');
  const [password, setPassword] = useState('');

  // --- QR Scanner ---
  const [scanning, setScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-receiver-reader';

  // --- Key management ---
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QR Scanner logic
  const startScanner = async () => {
    setScanning(true);
    setScannedResult('');
    await new Promise(r => setTimeout(r, 150));

    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setScannedResult(decodedText);
          stopScanner();

          // Auto-navigate if it's a share link
          if (decodedText.includes('/download/')) {
            const hashPart = decodedText.split('#').slice(1).join('#');
            if (hashPart) {
              window.location.hash = hashPart;
            }
            toast({ title: 'Share link detected', description: 'Opening share…' });
          } else {
            toast({ title: 'QR scanned', description: 'Content captured.' });
          }
        },
        () => {}
      );
    } catch (err: any) {
      toast({ title: 'Camera error', description: err.message || 'Cannot access camera.', variant: 'destructive' });
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {}
    setScanning(false);
  };

  useEffect(() => {
    return () => { scannerRef.current?.stop().catch(() => {}); };
  }, []);

  // Navigate to download page
  const openShareLink = () => {
    if (!shareLink.trim()) {
      toast({ title: 'No link', description: 'Paste a share link first.', variant: 'destructive' });
      return;
    }
    // Extract hash portion from full URL
    const hashMatch = shareLink.match(/#(.+)/);
    if (hashMatch) {
      window.location.hash = hashMatch[1];
    } else {
      toast({ title: 'Invalid link', description: 'This doesn\'t look like a SecureShare link.', variant: 'destructive' });
    }
  };

  // Key management
  const handleGenerate = async () => {
    await keyPair.generate();
    toast({ title: 'Key pair generated', description: 'RSA key pair ready.' });
  };

  const handleClear = () => {
    keyPair.clear();
    toast({ title: 'Keys cleared' });
  };

  const handleExport = async () => {
    const keys = await keyPair.exportKeys();
    if (!keys) return;
    const blob = new Blob([JSON.stringify(keys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'secureshare-keypair.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Keys exported' });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.publicKeyJwk || !data.privateKeyJwk) throw new Error('Invalid');
      await keyPair.importKeys(data);
      toast({ title: 'Keys imported' });
    } catch {
      toast({ title: 'Import failed', description: 'Invalid key file.', variant: 'destructive' });
    }
  };

  const copyPublicKey = async () => {
    if (!keyPair.publicKeyBase64Url) return;
    await navigator.clipboard.writeText(keyPair.publicKeyBase64Url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Receive Securely</h1>
        <p className="text-muted-foreground">Open a share link, scan a QR code, or manage your decryption keys.</p>
      </div>

      {/* Tab layout: Open Share | QR Scanner | My Keys */}
      <Tabs defaultValue="open" className="space-y-6">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="open" className="gap-2">
            <LinkIcon className="w-4 h-4" />
            Open Share
          </TabsTrigger>
          <TabsTrigger value="scan" className="gap-2">
            <ScanLine className="w-4 h-4" />
            QR Scanner
          </TabsTrigger>
          <TabsTrigger value="keys" className="gap-2">
            <Key className="w-4 h-4" />
            My Keys
          </TabsTrigger>
        </TabsList>

        {/* ====== Tab 1: Open Share Link ====== */}
        <TabsContent value="open" className="space-y-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Paste Share Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={shareLink}
                    onChange={(e) => setShareLink(e.target.value)}
                    placeholder="https://…#/download/abc123#key…"
                    className="font-mono text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && openShareLink()}
                  />
                  <Button onClick={openShareLink} disabled={!shareLink.trim()}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  For <strong>Random Key</strong> shares, the decryption key is embedded in the link.
                </p>
              </div>

              <div className="border-t border-border/50 pt-4 space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Password (for password-protected shares)
                </Label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Enter shared password"
                />
                <p className="text-xs text-muted-foreground">
                  If the share uses password mode, you'll be prompted to enter it after opening the link.
                </p>
              </div>

              <div className="border-t border-border/50 pt-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 text-sm">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>
                    For <strong>Public Key (RSA)</strong> shares, make sure you have your private key ready
                    in the "My Keys" tab before opening the link.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab 2: QR Scanner ====== */}
        <TabsContent value="scan" className="space-y-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Camera className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">Camera Scanner</p>
                  <p className="text-xs text-muted-foreground">Scan a share QR code to open it instantly</p>
                </div>
              </div>

              {!scanning ? (
                <Button onClick={startScanner} variant="outline" className="w-full gap-2">
                  <Camera className="w-4 h-4" />
                  Open Camera
                </Button>
              ) : (
                <div className="space-y-3">
                  <div id={scannerDivId} className="rounded-lg overflow-hidden" />
                  <Button onClick={stopScanner} variant="outline" className="w-full gap-2">
                    <X className="w-4 h-4" />
                    Stop Scanner
                  </Button>
                </div>
              )}

              {scannedResult && (
                <div className="mt-4 space-y-3">
                  <Label className="text-sm">Scanned Result</Label>
                  <Textarea
                    value={scannedResult}
                    readOnly
                    className="font-mono text-xs min-h-[60px]"
                  />
                  {scannedResult.includes('/download/') ? (
                    <Button
                      onClick={() => {
                        const hashMatch = scannedResult.match(/#(.+)/);
                        if (hashMatch) window.location.hash = hashMatch[1];
                      }}
                      className="w-full gap-2"
                    >
                      <QrCode className="w-4 h-4" />
                      Open Scanned Share
                    </Button>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>Content captured. Copy it or use it as needed.</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Tab 3: Key Management ====== */}
        <TabsContent value="keys" className="space-y-6">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              {keyPair.loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading keys…</p>
                </div>
              ) : keyPair.publicKey ? (
                <div className="space-y-5">
                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Key Pair Active</p>
                      <p className="text-xs text-muted-foreground">RSA-OAEP 2048-bit · Stored in browser</p>
                    </div>
                  </div>

                  {/* Public key */}
                  <div className="space-y-2">
                    <Label className="text-sm">Your Public Key (share with senders)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={keyPair.publicKeyBase64Url || ''}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button onClick={copyPublicKey} variant="outline" size="icon">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* QR of public key */}
                  <div className="flex justify-center py-4">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG value={keyPair.publicKeyBase64Url || ''} size={180} />
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    The sender scans this QR to encrypt data only you can decrypt.
                  </p>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={handleExport} variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                      Export Keys
                    </Button>
                    <Button onClick={handleClear} variant="outline" className="gap-2 text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                      Clear Keys
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-sm">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <span>Export your keys before clearing! Lost private keys = lost access to RSA-encrypted shares.</span>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-5 py-4">
                  <Key className="w-12 h-12 mx-auto text-primary/40" />
                  <div>
                    <p className="font-medium mb-1">No Key Pair Found</p>
                    <p className="text-sm text-muted-foreground">
                      Generate a key pair to receive RSA-encrypted shares, or import an existing one.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button onClick={handleGenerate} className="gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Generate New Pair
                    </Button>
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
                      <Upload className="w-4 h-4" />
                      Import Keys
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImport}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security notes */}
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-6">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Security Notes
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Your private key never leaves this device.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Export and back up your keys regularly — browser data can be cleared.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Only share your <strong>public key</strong>. Never share your private key.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  RSA-OAEP 2048-bit with SHA-256 hashing.
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
