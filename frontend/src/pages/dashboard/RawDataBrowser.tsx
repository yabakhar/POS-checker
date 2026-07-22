import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { RefreshCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import KpiCard from '../../components/reports/KpiCard';

interface PosDataRecord {
  id: string;
  received_at: string;
  data?: { type?: string; data?: unknown };
}

interface TableInfo {
  table_name: string;
  sync_count: number;
  total_rows: number;
  last_update: string | null;
}

interface TimelinePoint {
  date: string;
  interactions: number;
  rows_synced: number;
}

const tableLabel = (type?: string) => (type || '').replace(/^table_sync:/, '') || 'Données';

const loadSelectedTables = (): string[] => {
  try { return JSON.parse(localStorage.getItem('selectedTables') || '[]'); }
  catch { return []; }
};

const formatCellValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return String(v);
};

// Renders an array of row-objects as a real table instead of raw JSON;
// falls back to raw JSON when the shape isn't a plain object array.
function DataRowsTable({ rows }: { rows: unknown }) {
  const isRenderable = Array.isArray(rows) && rows.length > 0
    && typeof rows[0] === 'object' && rows[0] !== null && !Array.isArray(rows[0]);

  if (!isRenderable) {
    return (
      <pre className="overflow-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        {JSON.stringify(rows, null, 2)}
      </pre>
    );
  }

  const dataRows = rows as Record<string, unknown>[];
  const columns = Object.keys(dataRows[0]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dataRows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
                  {formatCellValue(row[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function RawDataBrowser() {
  const [stats, setStats] = useState({ total_records: 0, today_records: 0, last_sync: null as string | null });
  const [records, setRecords] = useState<PosDataRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 20;

  // Which tables to show — configured in Settings, just read here.
  const [selectedTables] = useState<string[]>(loadSelectedTables);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await api.get('/client/tables');
      setTables(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setTablesLoading(false); }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (selectedTables.length > 0) params.set('tables', selectedTables.join(','));
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);

      const [statsRes, dataRes] = await Promise.all([
        api.get('/client/stats'),
        api.get(`/client/dashboard?${params.toString()}`),
      ]);
      setStats(statsRes.data);
      setRecords(dataRes.data.data);
      setTotal(dataRes.data.total);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [selectedTables, dateFrom, dateTo]);

  useEffect(() => { loadData(page); }, [page, loadData]);

  // Date changes reset to page 1 (loadData above re-runs via the loadData/page effect)
  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTables.length > 0) params.set('tables', selectedTables.join(','));
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999`);
      const res = await api.get(`/client/timeline?${params.toString()}`);
      setTimeline(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setTimelineLoading(false); }
  }, [selectedTables, dateFrom, dateTo]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const chartTables = selectedTables.length > 0
    ? tables.filter((t) => selectedTables.includes(t.table_name))
    : [...tables].sort((a, b) => b.sync_count - a.sync_count).slice(0, 12);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Données brutes</h1>
        <p className="text-sm text-muted-foreground">Toutes les tables remontées par votre agent POS, telles quelles</p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <KpiCard label="Total enregistrements" value={stats.total_records.toLocaleString()} sub="Toutes périodes" />
        <KpiCard label="Aujourd'hui" value={stats.today_records.toLocaleString()} sub="Données reçues ce jour" />
        <KpiCard label="Dernière synchronisation" value={stats.last_sync ? formatDate(stats.last_sync) : '—'} sub={stats.last_sync ? '' : 'Aucune donnée reçue'} small />
      </div>

      <Card className="mb-3.5 flex flex-row flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Réinitialiser</Button>
        )}
        {selectedTables.length > 0 && (
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {selectedTables.length} table{selectedTables.length > 1 ? 's' : ''} filtrée{selectedTables.length > 1 ? 's' : ''} (voir Paramètres)
          </span>
        )}
      </Card>

      <Card className="py-0 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3.5">
          <span className="text-sm font-semibold">Données POS reçues</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border bg-muted p-0.5">
              {[{ key: 'table' as const, label: 'Tableau' }, { key: 'chart' as const, label: 'Graphique' }].map((m) => (
                <Button
                  key={m.key}
                  size="sm"
                  variant={viewMode === m.key ? 'default' : 'ghost'}
                  className="h-7 px-3 text-xs"
                  onClick={() => setViewMode(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => { loadData(page); loadTables(); loadTimeline(); }}>
              <RefreshCw /> Actualiser
            </Button>
          </div>
        </div>

        {viewMode === 'chart' ? (
          <CardContent className="pt-4">
            <div className="mb-6">
              <div className="mb-1 text-sm font-semibold">Interactions par table</div>
              <div className="mb-3 text-xs text-muted-foreground">
                {selectedTables.length > 0 ? 'Tables sélectionnées' : 'Top 12 des tables les plus actives'}
              </div>
              {tablesLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Chargement...</div>
              ) : chartTables.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune donnée à afficher</div>
              ) : (
                <ChartContainer config={{}} className="aspect-auto h-[280px] w-full">
                  <BarChart data={chartTables} margin={{ top: 5, right: 10, left: 0, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="table_name" angle={-45} textAnchor="end" interval={0} height={90} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }} />
                    <Bar dataKey="sync_count" name="Interactions" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold">Interactions par jour</div>
              <div className="mb-3 text-xs text-muted-foreground">Nombre de synchronisations reçues par jour</div>
              {timelineLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Chargement...</div>
              ) : timeline.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune donnée à afficher</div>
              ) : (
                <ChartContainer config={{}} className="aspect-auto h-[260px] w-full">
                  <LineChart data={timeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }} />
                    <Line type="monotone" dataKey="interactions" name="Interactions" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          </CardContent>
        ) : loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : records.length === 0 ? (
          <div className="py-18 text-center">
            <Inbox className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" />
            <div className="mb-1.5 text-sm text-muted-foreground">Aucune donnée reçue pour le moment</div>
            <div className="text-xs text-muted-foreground/70">L'agent enverra les données ici une fois configuré (voir Paramètres).</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead className="whitespace-nowrap">Reçu le</TableHead>
                    <TableHead>Aperçu des données</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r, i) => {
                    const name = tableLabel(r.data?.type);
                    const rowCount = Array.isArray(r.data?.data) ? r.data.data.length : null;
                    return (
                      <React.Fragment key={r.id}>
                        <TableRow>
                          <TableCell className="text-muted-foreground">{(page - 1) * limit + i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.received_at)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{name}</Badge>
                              {rowCount !== null && (
                                <span className="text-xs text-muted-foreground">{rowCount} ligne{rowCount !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-auto p-0 text-primary hover:text-primary" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                              {expanded === r.id ? <><ChevronUp /> Masquer</> : <><ChevronDown /> Voir</>}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expanded === r.id && (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-muted/40">
                              <DataRowsTable rows={r.data?.data} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {total} enregistrement{total !== 1 ? 's' : ''} — page {page} / {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft /> Précédent
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Suivant <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
