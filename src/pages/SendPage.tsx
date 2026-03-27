import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function SendPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Share Securely</h1>
        <p className="text-muted-foreground">Your data is encrypted in the browser before it leaves your device.</p>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-4 text-primary/40" />
          <p>Send page — content input, encryption modes, and upload flow coming next.</p>
        </CardContent>
      </Card>
    </div>
  );
}
