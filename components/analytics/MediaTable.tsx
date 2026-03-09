'use client';

import { useState, useMemo, useCallback, useRef, useEffect, ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
import { ChevronDown, Search, Check } from 'lucide-react';
import type { AnalyticsMediaItem, AnalyticsAccount } from '@/types';

const PAGE_SIZE = 20;

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (Math.trunc((n / 1_000_000) * 100) / 100).toFixed(2) + 'M';
  if (n >= 1_000) return (Math.trunc((n / 1_000) * 100) / 100).toFixed(2) + 'K';
  return n.toLocaleString();
}

const PLATFORM_META: Record<string, { icon: ReactNode; color: string }> = {
  tiktok:    { icon: <FaTiktok className="h-3 w-3" />,    color: '#00f2ea' },
  instagram: { icon: <FaInstagram className="h-3 w-3" />, color: '#E1306C' },
  youtube:   { icon: <FaYoutube className="h-3 w-3" />,   color: '#FF0000' },
};

function SearchableAccountSelect({
  value,
  accounts,
  onChange,
}: {
  value: string;
  accounts: AnalyticsAccount[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.trim().toLowerCase();
    return accounts.filter(a =>
      a.username.toLowerCase().includes(q) ||
      (a.displayName || '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const selectedLabel = value === 'all'
    ? 'All Accounts'
    : accounts.find(a => a.id === value)?.username
      ? `@${accounts.find(a => a.id === value)!.username}`
      : 'All Accounts';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-[150px] items-center justify-between rounded-md border border-[var(--border)] bg-transparent px-3 text-xs shadow-xs transition-colors hover:bg-[var(--muted)]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 w-[200px] rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-md">
          <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="h-5 w-full bg-transparent text-xs text-[var(--foreground)] placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            <button
              onClick={() => { onChange('all'); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-[var(--accent)]"
            >
              {value === 'all' && <Check className="h-3 w-3 shrink-0" />}
              <span className={value === 'all' ? '' : 'pl-5'}>All Accounts</span>
            </button>
            {filtered.map(a => (
              <button
                key={a.id}
                onClick={() => { onChange(a.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-[var(--accent)]"
              >
                {value === a.id && <Check className="h-3 w-3 shrink-0" />}
                <span className={value === a.id ? 'truncate' : 'truncate pl-5'}>@{a.username}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-[11px] text-[var(--text-muted)]">No accounts found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MediaTable({
  items,
  accounts,
  platformFilter,
  accountFilter,
  sortBy,
  sortBy2,
  dateFilter,
  onPlatformChange,
  onAccountChange,
  onSortChange,
  onSort2Change,
  onDateChange,
}: {
  items: AnalyticsMediaItem[];
  accounts: AnalyticsAccount[];
  platformFilter: string;
  accountFilter: string;
  sortBy: string;
  sortBy2: string;
  dateFilter: string;
  onPlatformChange: (v: string) => void;
  onAccountChange: (v: string) => void;
  onSortChange: (v: string) => void;
  onSort2Change: (v: string) => void;
  onDateChange: (v: string) => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(() => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [items, page]);

  // Reset to first page when filters change
  const handleChange = useCallback((setter: (v: string) => void, v: string) => {
    setPage(0);
    setter(v);
  }, []);

  return (
    <Card className="border-[var(--border)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm">All Content</CardTitle>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFilter}
                onChange={e => { setPage(0); onDateChange(e.target.value); }}
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              />
              {dateFilter && (
                <button
                  onClick={() => { setPage(0); onDateChange(''); }}
                  className="ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={platformFilter} onValueChange={v => handleChange(onPlatformChange, v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
              </SelectContent>
            </Select>
            <SearchableAccountSelect
              value={accountFilter}
              accounts={accounts}
              onChange={v => handleChange(onAccountChange, v)}
            />
            <Select
              key={`sort1-field-${sortBy}`}
              value={sortBy.split('-')[0]}
              onValueChange={(field) => {
                const dir = sortBy.split('-')[1] || 'desc';
                handleChange(onSortChange, `${field}-${dir}`);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="views">Views</SelectItem>
                <SelectItem value="likes">Likes</SelectItem>
                <SelectItem value="comments">Comments</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            <Select
              key={`sort1-dir-${sortBy}`}
              value={sortBy.split('-')[1] || 'desc'}
              onValueChange={(dir) => {
                const field = sortBy.split('-')[0];
                handleChange(onSortChange, `${field}-${dir}`);
              }}
            >
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Desc ↑</SelectItem>
                <SelectItem value="asc">Asc ↓</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-[var(--text-muted)]">then</span>
            <Select
              key={`sort2-field-${sortBy2}`}
              value={sortBy2.split('-')[0]}
              onValueChange={(field) => {
                const dir = sortBy2.split('-')[1] || 'desc';
                handleChange(onSort2Change, `${field}-${dir}`);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Then by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="views">Views</SelectItem>
                <SelectItem value="likes">Likes</SelectItem>
                <SelectItem value="comments">Comments</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            {sortBy2.split('-')[0] !== 'none' && (
              <Select
                key={`sort2-dir-${sortBy2}`}
                value={sortBy2.split('-')[1] || 'desc'}
                onValueChange={(dir) => {
                  const field = sortBy2.split('-')[0];
                  handleChange(onSort2Change, `${field}-${dir}`);
                }}
              >
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Desc ↑</SelectItem>
                  <SelectItem value="asc">Asc ↓</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No content found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">Video</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead className="text-right">Eng.</TableHead>
                    <TableHead className="text-right">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((item) => {
                    const meta = PLATFORM_META[item.platform];
                    return (
                      <TableRow key={item.id} className="cursor-pointer hover:bg-[var(--muted)]" onClick={() => item.url && window.open(item.url, '_blank')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {item.thumbnailUrl && (
                              <img src={item.thumbnailUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                            )}
                            <span className="max-w-[200px] truncate text-sm">
                              {item.title || item.caption?.slice(0, 60) || 'Untitled'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span style={{ color: meta?.color || '#9ca3af' }}>{meta?.icon}</span>
                        </TableCell>
                        <TableCell className="text-sm text-[var(--text-muted)]">@{item.accountUsername || '—'}</TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(item.views)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.likes)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.comments)}</TableCell>
                        <TableCell className="text-right">{item.engagementRate.toFixed(1)}%</TableCell>
                        <TableCell className="text-right text-xs text-[var(--text-muted)]">
                          {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination className="mt-4 border-t border-[var(--border)] pt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.max(0, p - 1)); }}
                      className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {getPageNumbers(page + 1, totalPages).map((p, i) =>
                    p === '...' ? (
                      <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={page + 1 === p}
                          onClick={(e) => { e.preventDefault(); setPage((p as number) - 1); }}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages - 1, p + 1)); }}
                      className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
