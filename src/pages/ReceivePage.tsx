import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export default function ReceivePage() {
  const { rid } = useParams<{ rid: string }>();

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Receive Securely</h1>
        <p className="text-muted-foreground">Decrypting share <span className="font-mono text-xs">{rid?.slice(0, 8)}…</span></p>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Lock className="w-12 h-12 mx-auto mb-4 text-primary/40" />
          <p>Receive page — download, decrypt, and display flow coming next.</p>
        </CardContent>
      </Card>
    </div>
  );
}
