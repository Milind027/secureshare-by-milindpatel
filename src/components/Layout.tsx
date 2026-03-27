import { Link, Outlet } from 'react-router-dom';
import { Shield, Sun, Moon, Github } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';

export default function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">SecureShare</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/send">Share</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/receiver-setup">Keys</Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} className="ml-2">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/50 py-6">
        <div className="container mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>SecureShare — Zero-knowledge encrypted sharing</span>
          <span className="font-mono text-xs">E2EE · AES-256 · RSA-2048</span>
        </div>
      </footer>
    </div>
  );
}
