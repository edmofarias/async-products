import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container mx-auto flex h-14 items-center gap-6 px-4">
          <span className="font-semibold">Async Products</span>
          <Link
            to="/"
            className={cn(
              'text-sm transition-colors hover:text-foreground',
              pathname === '/' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            Upload
          </Link>
          <Link
            to="/products"
            className={cn(
              'text-sm transition-colors hover:text-foreground',
              pathname === '/products' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            Produtos
          </Link>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
