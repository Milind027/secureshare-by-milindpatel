import { Card, CardContent } from '@/components/ui/card';
import { Key } from 'lucide-react';

export default function ReceiverSetupPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Key Management</h1>
        <p className="text-muted-foreground">Generate and manage your RSA key pair for public-key encryption.</p>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Key className="w-12 h-12 mx-auto mb-4 text-primary/40" />
          <p>Key pair generation, QR code display, and import/export coming next.</p>
        </CardContent>
      </Card>
    </div>
  );
}
