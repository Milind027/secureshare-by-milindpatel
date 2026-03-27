import { Link } from 'react-router-dom';
import { Shield, Lock, Key, Eye, EyeOff, Zap, FileText, Image, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Lock,
    title: 'AES-256 Encryption',
    description: 'Military-grade encryption happens entirely in your browser. Keys never touch the server.',
  },
  {
    icon: Key,
    title: 'RSA Key Exchange',
    description: 'Generate RSA-2048 key pairs for secure public-key encryption with QR code sharing.',
  },
  {
    icon: EyeOff,
    title: 'Zero Knowledge',
    description: 'The server stores only opaque encrypted blobs. No plaintext, no keys, no metadata leaks.',
  },
  {
    icon: Eye,
    title: 'Self-Destructing',
    description: 'Single-view mode deletes data after first access. Set expiry from 1 hour to 7 days.',
  },
  {
    icon: Image,
    title: 'Steganography',
    description: 'Hide encrypted data inside PNG images or WAV audio files using LSB embedding.',
  },
  {
    icon: Zap,
    title: 'No Sign-Up Required',
    description: 'Share instantly — no accounts, no tracking, no analytics. Pure privacy.',
  },
];

export default function HomePage() {
  return (
    <div className="container mx-auto px-4">
      {/* Hero */}
      <section className="py-20 md:py-32 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
          <Shield className="w-4 h-4" />
          End-to-end encrypted
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Share secrets,{' '}
          <span className="text-primary">not trust</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          Send files and text with client-side encryption. 
          The server never sees your data — zero knowledge by design.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" className="text-base px-8" asChild>
            <Link to="/send">
              <FileText className="w-5 h-5 mr-2" />
              Send
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="text-base px-8" asChild>
            <Link to="/receive">
              <Download className="w-5 h-5 mr-2" />
              Receive
            </Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="pb-20 md:pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Card key={feature.title} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Security note */}
      <section className="pb-20 text-center">
        <div className="inline-block p-6 rounded-xl bg-card border border-border/50 max-w-lg">
          <p className="text-sm text-muted-foreground font-mono">
            🔒 All encryption uses the Web Crypto API — no external libraries.
            AES keys are embedded in URL fragments and never sent to the server.
          </p>
        </div>
      </section>
    </div>
  );
}
