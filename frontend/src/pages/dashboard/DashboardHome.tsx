import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '../../api/axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import DateRangePicker from '../../components/reports/DateRangePicker';
import KpiCard from '../../components/reports/KpiCard';
import CategoryDonut from '../../components/reports/CategoryDonut';
import { toLocalISODate as toISO } from '@/lib/utils';

interface Summary {
  kpis: { total_revenue: number; ticket_count: number; avg_ticket: number };
  daily_revenue: { date: string; revenue: number }[];
  revenue_by_weekday: { weekday: string; revenue: number }[];
  revenue_by_category: { category_name: string; revenue: number }[];
}


const formatMAD = (v: number) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function DashboardHome() {
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom });
      if (dateTo) params.set('to', dateTo);
      const res = await api.get(`/client/reports/summary?${params.toString()}`);
      setSummary(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const onRangeChange = (from: string, to: string) => { setDateFrom(from); setDateTo(to); };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Vue d'ensemble des ventes sur la période sélectionnée</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={onRangeChange} />

      {loading || !summary ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <KpiCard label="Chiffre d'affaires" value={formatMAD(summary.kpis.total_revenue)} sub="Période sélectionnée" />
            <KpiCard label="Nombre de tickets" value={summary.kpis.ticket_count.toLocaleString('fr-FR')} sub="Tickets encaissés" />
            <KpiCard label="Panier moyen" value={formatMAD(summary.kpis.avg_ticket)} sub="CA / nombre de tickets" />
          </div>

          <Card className="mb-3.5">
            <CardHeader>
              <CardTitle>Évolution des ventes</CardTitle>
              <CardDescription>Chiffre d'affaires par jour</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.daily_revenue.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune vente sur cette période</div>
              ) : (
                <ChartContainer config={{}} className="aspect-auto h-[260px] w-full">
                  <AreaChart data={summary.daily_revenue} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }}
                      formatter={(v: any) => formatMAD(Number(v))}
                    />
                    <Area type="monotone" dataKey="revenue" name="CA" stroke="var(--primary)" strokeWidth={2} fill="url(#revenueFill)" />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>C.A. par jour</CardTitle>
                <CardDescription>Chiffre d'affaires cumulé par jour de la semaine</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="aspect-auto h-[240px] w-full">
                  <BarChart data={summary.revenue_by_weekday} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }}
                      formatter={(v: any) => formatMAD(Number(v))}
                    />
                    <Bar dataKey="revenue" name="CA" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ventes par catégorie</CardTitle>
                <CardDescription>Répartition du chiffre d'affaires</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryDonut data={summary.revenue_by_category} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
