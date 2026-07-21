import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import DateRangePicker from '../../components/reports/DateRangePicker';
import KpiCard from '../../components/reports/KpiCard';

const toISO = (d) => d.toISOString().slice(0, 10);
const defaultFrom = () => { const d = new Date(); d.setDate(d.getDate() - 20); return toISO(d); };
const formatMAD = (v) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function SalesRecapPage() {
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(() => toISO(new Date()));
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/client/reports/sales-recap?from=${dateFrom}&to=${dateTo}`);
      setRecap(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Récapitulatif des ventes</h1>
        <p className="text-sm text-muted-foreground">Synthèse des ventes sur la période sélectionnée</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading || !recap ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Chiffre d'affaires" value={formatMAD(recap.total_revenue)} />
            <KpiCard label="Nombre de tickets" value={recap.ticket_count.toLocaleString('fr-FR')} />
            <KpiCard label="Panier moyen" value={formatMAD(recap.avg_ticket)} />
            <KpiCard label="Articles vendus" value={recap.total_qty.toLocaleString('fr-FR')} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Détail par jour</CardTitle>
            </CardHeader>
            <CardContent>
              {recap.by_day.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune vente sur cette période</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>CA</TableHead>
                        <TableHead>Tickets</TableHead>
                        <TableHead>Articles</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recap.by_day.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell className="font-mono tabular-nums">{formatMAD(row.revenue)}</TableCell>
                          <TableCell className="font-mono tabular-nums text-muted-foreground">{row.ticket_count}</TableCell>
                          <TableCell className="font-mono tabular-nums text-muted-foreground">{row.qty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
