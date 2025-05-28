import { Rss } from 'lucide-react';
import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-sidebar-foreground hover:text-sidebar-primary transition-colors">
      <Rss className="h-6 w-6 text-sidebar-primary" />
      <span>aldaGel Platform</span>
    </Link>
  );
}
