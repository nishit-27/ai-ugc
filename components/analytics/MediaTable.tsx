'use client';

import { useState, useMemo, ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import { FaTiktok, FaInstagram, FaYoutube } from 'react-icons/fa6';
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
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const PLATFORM_META: Record<string, { icon: ReactNode; color: string }> = {
  tiktok:    { icon: <FaTiktok className="h-3 w-3" />,    color: '#00f2ea' },
  instagram: { icon: <FaInstagram className="h-3 w-3" />, color: '#E1306C' },
  youtube:   { icon: <FaYoutube className="h-3 w-3" />,   color: '#FF0000' },
};

export default function MediaTable({
  items,
  accounts,
  platformFilter,
  accountFilter,
  sortBy,
  onPlatformChange,
  onAccountChange,
  onSortChange,
}: {
  items: AnalyticsMediaItem[];
  accounts: AnalyticsAccount[];
  platformFilter: string;
  accountFilter: string;
  sortBy: string;
  onPlatformChange: (v: string) => void;
  onAccountChange: (v: string) => void;
  onSortChange: (v: string) => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(() => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [items, page]);

  // Reset to first page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setPage(0);
    setter(v);
  };

  return (
    <Card className="border-[var(--border)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm">All Content</CardTitle>
          <div className="flex gap-2">
            <Select value={platformFilter} onValueChange={handleFilterChange(onPlatformChange)}>
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
            <Select value={accountFilter} onValueChange={handleFilterChange(onAccountChange)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sortBy.split('-')[0]}
              onValueChange={(field) => {
                const dir = sortBy.split('-')[1] || 'desc';
                handleFilterChange(onSortChange)(`${field}-${dir}`);
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
              value={sortBy.split('-')[1] || 'desc'}
              onValueChange={(dir) => {
                const field = sortBy.split('-')[0];
                handleFilterChange(onSortChange)(`${field}-${dir}`);
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
