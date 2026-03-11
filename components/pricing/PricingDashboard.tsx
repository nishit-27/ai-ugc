'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { RefreshCw, Image, Video, Calendar, User, Briefcase, Clock, AlertCircle, CheckCircle2, Loader2, TrendingUp } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Summary = {
  total_requests: number;
  successful: number;
  failed: number;
  total_cost: number;
  image_cost: number;
  video_cost: number;
  image_requests: number;
  video_requests: number;
};

type DailyEntry = { date: string; image_success: number; video_success: number; failed: number; image_cost: number; video_cost: number };
type TimeseriesEntry = { ts: string; success: number; failed: number; processing: number };
type ModelEntry = { model: string; type: string; total: number; successful: number; failed: number; total_cost: number };
type UserEntry = { user_key: string; display_name: string; email: string | null; total: number; successful: number; failed: number; total_cost: number; images: number; videos: number };
type JobEntry = { job_id: string; total: number; successful: number; failed: number; total_cost: number; total_duration: number; job_name?: string; job_status?: string; model_name?: string; batch_name?: string; is_master?: boolean; job_created_by?: string };
type RecentEntry = { id: string; type: string; model: string; status: string; cost: number | null; duration_seconds: number | null; error: string | null; created_by: string | null; created_by_email: string | null; created_at: string; metadata?: Record<string, unknown> | null };
type FalPrice = { endpoint_id: string; unit_price: number; unit: string; currency: string };
type Period = '24h' | '7d' | '30d' | 'custom';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Uses app theme: primary=#d4698e, success=#22c55e, error=#ef4444, purple=#7c3aed
const requestChartConfig = {
  success: { label: 'Success', color: 'var(--success)' },
  failed: { label: 'Failed', color: 'var(--error)' },
} satisfies ChartConfig;

const costChartConfig = {
  image: { label: 'Images', color: 'var(--primary)' },
  video: { label: 'Videos', color: 'var(--purple)' },
} satisfies ChartConfig;

export default function PricingDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [customFrom, setCustomFrom] = useState(() => toDateStr(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo] = useState(() => toDateStr(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesEntry[]>([]);
  const [byModel, setByModel] = useState<ModelEntry[]>([]);
  const [byUser, setByUser] = useState<UserEntry[]>([]);
  const [byJob, setByJob] = useState<JobEntry[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [falPrices, setFalPrices] = useState<FalPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartModelFilter, setChartModelFilter] = useState<string>('all');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/pricing?period=${period}`;
      if (period === 'custom' && customFrom && customTo) url = `/api/pricing?period=custom&from=${customFrom}&to=${customTo}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setSummary(data.summary || null);
      setDaily(data.daily || []);
      setTimeseries(data.timeseries || []);
      setByModel(data.byModel || []);
      setByUser(data.byUser || []);
      setByJob(data.byJob || []);
      setRecent(data.recent || []);
      setFalPrices(data.falPrices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const successRate = summary && summary.total_requests > 0
    ? Math.round((summary.successful / summary.total_requests) * 100)
    : 100;

  // Model names for the chart filter
  const modelNames = useMemo(() => {
    const names = byModel.map(m => m.model);
    return [...new Set(names)];
  }, [byModel]);

  // Generate all dates in the selected range so charts always have a full timeline
  const dateRange = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dates: string[] = [];
    let start: Date;
    let end = new Date();
    end.setHours(0, 0, 0, 0);

    if (period === 'custom') {
      start = new Date(customFrom);
      end = new Date(customTo);
    } else {
      const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
      start = new Date(Date.now() - days * 86400000);
    }
    start.setHours(0, 0, 0, 0);

    const cur = new Date(start);
    while (cur <= end) {
      dates.push(fmt(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [period, customFrom, customTo]);

  // Build per-model timeseries from recent data, padded with zeros for full range
  const modelTimeseriesData = useMemo(() => {
    const fmt = (dateStr: string) => {
      const d = new Date(dateStr);
      if (period === '24h') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (period === 'custom') {
        const diff = (new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86400000;
        return diff <= 2
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Build a map from existing timeseries data
    const dataMap = new Map<string, { success: number; failed: number }>();

    if (chartModelFilter === 'all') {
      for (const t of timeseries) {
        dataMap.set(fmt(t.ts), { success: t.success, failed: t.failed });
      }
    } else {
      const filtered = recent.filter(r => r.model === chartModelFilter);
      for (const r of filtered) {
        const key = fmt(r.created_at);
        const b = dataMap.get(key) || { success: 0, failed: 0 };
        if (r.status === 'success') b.success++;
        else if (r.status === 'failed') b.failed++;
        dataMap.set(key, b);
      }
    }

    // For hourly periods, just return what we have (no date range padding)
    if (period === '24h') {
      return Array.from(dataMap.entries()).map(([time, v]) => ({ time, ...v }));
    }

    // Pad with zeros, but trim trailing zero-only days after the last real data point
    const padded = dateRange.map(date => ({
      time: date,
      success: dataMap.get(date)?.success || 0,
      failed: dataMap.get(date)?.failed || 0,
    }));
    const lastDataIdx = padded.findLastIndex(d => d.success > 0 || d.failed > 0);
    return lastDataIdx >= 0 ? padded.slice(0, lastDataIdx + 1) : padded;
  }, [timeseries, recent, chartModelFilter, period, customFrom, customTo, dateRange]);

  // Cost data padded with zeros for full range
  const costTimeData = useMemo(() => {
    const dataMap = new Map<string, { image: number; video: number }>();
    for (const d of daily) {
      const label = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dataMap.set(label, {
        image: Number(d.image_cost.toFixed(2)),
        video: Number(d.video_cost.toFixed(2)),
      });
    }

    if (period === '24h') {
      return Array.from(dataMap.entries()).map(([date, v]) => ({ date, ...v }));
    }

    const padded = dateRange.map(date => ({
      date,
      image: dataMap.get(date)?.image || 0,
      video: dataMap.get(date)?.video || 0,
    }));
    const lastDataIdx = padded.findLastIndex(d => d.image > 0 || d.video > 0);
    return lastDataIdx >= 0 ? padded.slice(0, lastDataIdx + 1) : padded;
  }, [daily, dateRange, period]);

  const periodLabel = period === '24h' ? 'Last 24 hours' : period === '7d' ? 'Last 7 days' : period === '30d' ? 'Last 30 days' : 'Custom range';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Generation costs and usage breakdown</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border bg-card px-1 py-0.5">
            {(['24h', '7d', '30d'] as Period[]).map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setShowDatePicker(false); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${period === p ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {p === '24h' ? '24h' : p === '7d' ? '7d' : '30d'}
              </button>
            ))}
            <button onClick={() => { if (period === 'custom') setShowDatePicker(!showDatePicker); else { setPeriod('custom'); setShowDatePicker(true); } }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${period === 'custom' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Calendar className="h-3 w-3" />
              {period === 'custom' ? `${new Date(customFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(customTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Custom'}
            </button>
          </div>
          <button onClick={fetchStats} disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {showDatePicker && period === 'custom' && (
        <Card className="py-3">
          <CardContent className="flex items-center gap-3 py-0">
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border bg-accent px-3 py-1.5 text-xs focus:border-primary focus:outline-none" />
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" value={customTo} min={customFrom} max={toDateStr(new Date())} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border bg-accent px-3 py-1.5 text-xs focus:border-primary focus:outline-none" />
            <button onClick={() => setShowDatePicker(false)}
              className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              Apply
            </button>
          </CardContent>
        </Card>
      )}

      {loading && !summary ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive font-medium">Failed to load analytics</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <button onClick={fetchStats} className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Retry</button>
          </CardContent>
        </Card>
      ) : !summary ? (
        <Card className="py-16">
          <CardContent className="text-center text-sm text-muted-foreground">
            No data yet. Costs will appear after your first generation.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Top stat cards ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="py-3 gap-1">
              <CardHeader className="px-4 py-0">
                <CardDescription className="flex items-center gap-1 text-[11px]">
                  <TrendingUp className="h-3 w-3" />
                  Total requests
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 py-0">
                <p className="text-xl font-bold leading-none">{summary.total_requests}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{successRate}% success rate</p>
              </CardContent>
            </Card>

            <Card className="py-3 gap-1">
              <CardHeader className="px-4 py-0">
                <CardDescription className="text-[11px]">Total cost</CardDescription>
              </CardHeader>
              <CardContent className="px-4 py-0">
                <p className="text-xl font-bold text-[var(--primary)] leading-none">${summary.total_cost.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">${summary.image_cost.toFixed(2)} images + ${summary.video_cost.toFixed(2)} videos</p>
              </CardContent>
            </Card>

            <Card className="py-3 gap-1">
              <CardHeader className="px-4 py-0">
                <CardDescription className="flex items-center gap-1 text-[11px]">
                  <Image className="h-3 w-3" />
                  Images
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 py-0">
                <p className="text-xl font-bold text-[var(--primary)] leading-none">{summary.image_requests}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">${summary.image_cost.toFixed(2)} spent</p>
              </CardContent>
            </Card>

            <Card className="py-3 gap-1">
              <CardHeader className="px-4 py-0">
                <CardDescription className="flex items-center gap-1 text-[11px]">
                  <Video className="h-3 w-3" />
                  Videos
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 py-0">
                <p className="text-xl font-bold text-[var(--purple)] leading-none">{summary.video_requests}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">${summary.video_cost.toFixed(2)} spent</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Request stats chart with model filter ── */}
          <Card className="pt-0">
            <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
              <div className="grid flex-1 gap-1">
                <CardTitle>Request stats</CardTitle>
                <CardDescription>
                  {chartModelFilter === 'all'
                    ? `Success and failure counts — ${periodLabel}`
                    : `Filtered by ${chartModelFilter.replace('fal-ai/', '')}`}
                </CardDescription>
              </div>
              <Select value={chartModelFilter} onValueChange={setChartModelFilter}>
                <SelectTrigger className="w-[200px] rounded-lg sm:ml-auto" aria-label="Filter by model">
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All models</SelectItem>
                  {modelNames.map((name) => (
                    <SelectItem key={name} value={name} className="rounded-lg">
                      {name.replace('fal-ai/', '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
              {modelTimeseriesData.length > 0 ? (
                <ChartContainer config={requestChartConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart accessibilityLayer data={modelTimeseriesData}>
                    <defs>
                      <linearGradient id="fillSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                    />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => value}
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="failed"
                      type="monotone"
                      fill="url(#fillFailed)"
                      stroke="var(--color-failed)"
                      stackId="a"
                    />
                    <Area
                      dataKey="success"
                      type="monotone"
                      fill="url(#fillSuccess)"
                      stroke="var(--color-success)"
                      stackId="a"
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-16">No request data for this period</p>
              )}
            </CardContent>
          </Card>

          {/* ── Cost breakdown chart ── */}
          {costTimeData.length > 0 && (
            <Card className="pt-0">
              <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
                <div className="grid flex-1 gap-1">
                  <CardTitle>Cost breakdown</CardTitle>
                  <CardDescription>Daily spending by generation type — {periodLabel}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                <ChartContainer config={costChartConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart accessibilityLayer data={costTimeData}>
                    <defs>
                      <linearGradient id="fillImage" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-image)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-image)" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="fillVideo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-video)" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="var(--color-video)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                    />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => value}
                          indicator="dot"
                        />
                      }
                    />
                    <Area
                      dataKey="video"
                      type="monotone"
                      fill="url(#fillVideo)"
                      stroke="var(--color-video)"
                      stackId="a"
                    />
                    <Area
                      dataKey="image"
                      type="monotone"
                      fill="url(#fillImage)"
                      stroke="var(--color-image)"
                      stackId="a"
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* ── Usage by user ── */}
          {byUser.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Usage by user
                </CardTitle>
                <CardDescription>Who generated how much</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Images</TableHead>
                      <TableHead className="text-right">Videos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byUser.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{u.display_name || 'Unknown'}</span>
                            {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-mono">{u.images}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-mono">{u.videos}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{u.total}</TableCell>
                        <TableCell className="text-right">
                          {u.failed > 0 ? <Badge variant="destructive" className="font-mono">{u.failed}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-[var(--primary)]">${u.total_cost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Usage by job / pipeline ── */}
          {byJob.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Usage by job
                </CardTitle>
                <CardDescription>Per-job and pipeline cost breakdown</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byJob.map((j, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{j.job_name || j.job_id?.slice(0, 8)}</span>
                            {j.job_status && (
                              <Badge variant={j.job_status === 'completed' ? 'default' : j.job_status === 'failed' ? 'destructive' : 'secondary'}
                                className="text-[10px] px-1.5 py-0">
                                {j.job_status}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {j.batch_name ? (
                            <div className="flex items-center gap-1.5">
                              {j.is_master && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600">Master</Badge>}
                              <span className="truncate max-w-[120px]">{j.batch_name}</span>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{j.model_name || '—'}</TableCell>
                        <TableCell className="text-right">{j.total}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{j.total_duration > 0 ? `${j.total_duration.toFixed(1)}s` : '—'}</TableCell>
                        <TableCell className="text-right font-medium text-[var(--primary)]">${j.total_cost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Model breakdown + Live pricing ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {byModel.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    Usage by model
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byModel.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium max-w-[180px] truncate">{row.model.replace('fal-ai/', '')}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={row.type === 'image' ? 'border-[var(--primary)]/50 text-[var(--primary)]' : 'border-[var(--purple)]/50 text-[var(--purple)]'}>
                              {row.type === 'image' ? <Image className="h-3 w-3 mr-1" /> : <Video className="h-3 w-3 mr-1" />}
                              {row.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{row.total}</TableCell>
                          <TableCell className="text-right font-medium text-[var(--primary)]">${row.total_cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {falPrices.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Live FAL pricing</CardTitle>
                  <CardDescription>Current unit prices from FAL API</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Endpoint</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {falPrices.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium max-w-[200px] truncate">{p.endpoint_id.replace('fal-ai/', '')}</TableCell>
                          <TableCell className="text-right font-medium text-[var(--primary)]">${p.unit_price.toFixed(4)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">per {p.unit.replace(/s$/, '')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Recent requests ── */}
          {recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent requests
                </CardTitle>
                <CardDescription>Latest {recent.length} generation requests</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.type === 'image' ? 'border-[var(--primary)]/50 text-[var(--primary)]' : 'border-[var(--purple)]/50 text-[var(--purple)]'}>
                            {r.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm">{r.model.replace('fal-ai/', '')}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{timeAgo(r.created_at)}</TableCell>
                        <TableCell className="text-sm">{r.created_by || r.created_by_email?.split('@')[0] || '—'}</TableCell>
                        <TableCell className="text-right text-sm">{r.cost != null ? `$${r.cost.toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-right">
                          {r.status === 'success' ? (
                            <Badge className="bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20 hover:bg-[var(--success-bg)]">
                              <CheckCircle2 className="h-3 w-3 mr-1" />200
                            </Badge>
                          ) : r.status === 'failed' ? (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />err
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />...
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
