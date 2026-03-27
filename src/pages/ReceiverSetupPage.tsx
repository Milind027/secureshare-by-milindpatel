import { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Key, RefreshCw, Download, Upload, Trash2, Copy, Check,
  Camera, AlertTriangle, Shield, ScanLine, X, QrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useKeyPair } from '@/hooks/useKeyPair';

export default function ReceiverSetupPage() {
  const { toast } = useToast();
  const keyPair = useKeyPair();
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedKey, setScannedKey] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-reader';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    await keyPair.generate();
    toast({ title: 'Key pair generated', description: 'Your new RSA key pair is ready and stored in the browser.' });
  };

  const handleClear = () => {
    keyPair.clear();
    toast({ title: 'Keys cleared', description: 'Your key pair has been removed from the browser.' });
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
    toast({ title: 'Keys exported', description: 'Your key pair has been downloaded as a .json file.' });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.publicKeyJwk || !data.privateKeyJwk) {
        throw new Error('Invalid key file');
      }
      await keyPair.importKeys(data);
      toast({ title: 'Keys imported', description: 'Your key pair has been loaded successfully.' });
    } catch {
      toast({ title: 'Import failed', description: 'Invalid key file format.', variant: 'destructive' });
    }
  };

  const copyPublicKey = async () => {
    if (!keyPair.publicKeyBase64Url) return;
    await navigator.clipboard.writeText(keyPair.publicKeyBase64Url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // QR Scanner
  const startScanner = async () => {
    setScanning(true);
    setScannedKey('');

    // Wait for DOM element
    await new Promise(r => setTimeout(r, 100));

    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setScannedKey(decodedText);
          stopScanner();
          toast({ title: 'QR Code scanned', description: 'Public key captured successfully.' });
        },
        () => {} // ignore scan failures
      );
    } catch (err: any) {
      toast({ title: 'Camera error', description: err.message || 'Could not access camera.', variant: 'destructive' });
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

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  if (keyPair.loading) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading keys…</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Key Management</h1>
        <p className="text-muted-foreground">Generate and manage your RSA key pair for public-key encryption.</p>
      </div>

      {/* Key Pair Status */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardContent className="p-6">
          {keyPair.publicKey ? (
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

              {/* Public key display */}
              <div className="space-y-2">
                <Label className="text-sm">Your Public Key</Label>
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

              {/* QR Code of public key */}
              <div className="flex justify-center py-4">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG value={keyPair.publicKeyBase64Url || ''} size={200} />
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Share this QR code with senders so they can encrypt data for you.
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
                <span>
                  Export your keys before clearing! If you lose your private key, you won't be able to decrypt
                  any messages encrypted with your public key.
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-5">
              <div className="py-4">
                <Key className="w-12 h-12 mx-auto mb-3 text-primary/40" />
                <p className="font-medium mb-1">No Key Pair Found</p>
                <p className="text-sm text-muted-foreground">
                  Generate a new key pair or import an existing one to receive encrypted shares.
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

      {/* QR Code Scanner */}
      <Card className="bg-card/50 border-border/50 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <ScanLine className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium">QR Code Scanner</p>
              <p className="text-xs text-muted-foreground">Scan a sender's share link or a public key QR code</p>
            </div>
          </div>

          {!scanning ? (
            <Button onClick={startScanner} variant="outline" className="w-full gap-2">
              <Camera className="w-4 h-4" />
              Open Camera Scanner
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

          {scannedKey && (
            <div className="mt-4 space-y-2">
              <Label className="text-sm">Scanned Result</Label>
              <Textarea
                value={scannedKey}
                readOnly
                className="font-mono text-xs min-h-[80px]"
              />
              {scannedKey.includes('/download/') ? (
                <Button
                  onClick={() => { window.location.hash = scannedKey.includes('#') ? scannedKey.split('#').slice(1).join('#') : ''; }}
                  className="w-full gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Open Share Link
                </Button>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 text-sm">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>Public key captured. Use this on the Share page in RSA mode.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Info */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-6">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Security Notes
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Your private key never leaves this device — it stays in browser storage.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Export and back up your keys regularly. Browser data can be cleared.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Only share your <strong>public key</strong>. Never share your private key.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Keys are RSA-OAEP 2048-bit with SHA-256 hashing.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
