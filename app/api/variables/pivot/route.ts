import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, getPivotData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = request.nextUrl;

    const rowFields = searchParams.get('rows')?.split(',').filter(Boolean) || [];
    const columnFields = searchParams.get('columns')?.split(',').filter(Boolean) || [];
    const metric = searchParams.get('metric') || 'count';
    const aggregation = searchParams.get('agg') || 'sum';
    const filtersParam = searchParams.get('filters');
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;

    let filters: { field: string; value: string }[] = [];
    if (filtersParam) {
      try {
        filters = JSON.parse(filtersParam);
      } catch {
        filters = [];
      }
    }

    const data = await getPivotData({
      rowFields,
      columnFields,
      metric,
      aggregation,
      filters,
      dateFrom,
      dateTo,
    });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Pivot query error:', err);
    return NextResponse.json({ error: 'Failed to run pivot query' }, { status: 500 });
  }
}
