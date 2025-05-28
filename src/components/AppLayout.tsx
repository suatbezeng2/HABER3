
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Settings, ScanLine } from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import { Toaster } from "@/components/ui/toaster";

const navItems = [
  { href: '/', label: 'Kontrol Paneli', icon: Home },
  { href: '/sites', label: 'Siteleri Yönet', icon: Settings },
  { href: '/bulk-scrape', label: 'Toplu Tara', icon: ScanLine },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider defaultOpen>
      <Sidebar>
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <Logo />
            <SidebarTrigger className="md:hidden" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu className="p-2">
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={{children: item.label, className: "text-xs"}}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        {/* <SidebarFooter className="p-4 border-t border-sidebar-border">
          Footer content if any
        </SidebarFooter> */}
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 py-3 md:py-4">
          <SidebarTrigger className="sm:hidden" />
          {/* Breadcrumbs or page title can go here */}
        </header>
        {/* Removed p-4 sm:px-6 sm:py-0 from main, pages will handle their own padding */}
        <main className="flex-1 space-y-4"> 
          {children}
        </main>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
