'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, UserCircle, Package, FileText, Link2, ListVideo, LayoutTemplate, ClipboardList, ImageIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import ThemeToggle from '@/components/ui/ThemeToggle';

const createItems = [
 
  { href: '/templates', label: 'Pipelines', icon: LayoutTemplate },
   { href: '/generate', label: 'Generate', icon: Sparkles },
];

const contentItems = [
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/queue', label: 'Queue', icon: ListVideo },
  { href: '/batches', label: 'Batches', icon: Package },
  { href: '/posts', label: 'Posts', icon: FileText },
  { href: '/images', label: 'Images', icon: ImageIcon },
];

const settingsItems = [
  { href: '/models', label: 'Models', icon: UserCircle },
  { href: '/connections', label: 'Connections', icon: Link2 },
];

export default function AppSidebar() {
  const pathname = usePathname();

  const renderGroup = (items: typeof createItems) =>
    items.map((item) => {
      const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
      const Icon = item.icon;
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} size="default">
            <Link href={item.href}>
              <Icon className="h-[18px] w-[18px]" />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon">
      {/* Header — branding when expanded, toggle when collapsed */}
      <SidebarHeader className="h-14 flex-row items-center justify-between border-b border-[var(--sidebar-border)] px-3">
        <Link href="/generate" className="group-data-[collapsible=icon]:hidden inline-flex items-start">
          <span style={{ fontFamily: "'Syne', sans-serif" }} className="text-base font-extrabold tracking-tight leading-none">
            Runable
          </span>
          <span className="ml-1 -mt-0.5 text-[7px] font-bold tracking-[0.15em] uppercase text-[var(--primary)] leading-none">
            AI UGC
          </span>
        </Link>
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent className="pt-2">
        {/* Create */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Create</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {renderGroup(createItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Content */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {renderGroup(contentItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {renderGroup(settingsItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — theme toggle + collapse trigger */}
      <SidebarFooter className="border-t border-[var(--sidebar-border)] p-3">
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <ThemeToggle />
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
