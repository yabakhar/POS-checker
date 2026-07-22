import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { toLocalISODate as toISO } from '@/lib/utils';

interface TaxRow {
  vat_rate: number;
  ticket_count: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
}

interface TaxesReport {
  rows: TaxRow[];
  totals: { total_ht: number; total_tva: number; total_ttc: number };
}

const formatMAD = (v: number) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`;

export default function TaxesPage() {
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState('');
  const [report, setReport] = useState<TaxesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom });
      if (dateTo) params.set('to', dateTo);
      const res = await api.get(`/client/reports/taxes?${params.toString()}`);
      setReport(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Taxes</h1>
        <p className="text-sm text-muted-foreground">TVA collectée par taux, sur la période sélectionnée</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      <Card>
        <CardContent>
          {loading || !report ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
          ) : report.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Aucune vente sur cette période</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Taux TVA</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Montant HT</TableHead>
                    <TableHead>Montant TVA</TableHead>
                    <TableHead>Montant TTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.vat_rate}>
                      <TableCell>{r.vat_rate.toLocaleString('fr-FR')}%</TableCell>
                      <TableCell className="font-mono tabular-nums text-muted-foreground">{r.ticket_count}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMAD(r.total_ht)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMAD(r.total_tva)}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMAD(r.total_ttc)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell className="font-mono tabular-nums">{formatMAD(report.totals.total_ht)}</TableCell>
                    <TableCell className="font-mono tabular-nums">{formatMAD(report.totals.total_tva)}</TableCell>
                    <TableCell className="font-mono tabular-nums">{formatMAD(report.totals.total_ttc)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
