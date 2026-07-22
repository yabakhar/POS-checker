import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { toLocalISODate as toISO } from '@/lib/utils';

interface PaymentMethodRow {
  method: string;
  amount: number;
  pct_of_total: number;
}

const formatMAD = (v: number) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function PaymentMethodsPage() {
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom });
      if (dateTo) params.set('to', dateTo);
      const res = await api.get(`/client/reports/payment-methods?${params.toString()}`);
      setRows(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Mode de paiement</h1>
        <p className="text-sm text-muted-foreground">Répartition des encaissements par mode de règlement</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      <Card>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Aucun encaissement sur cette période</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mode de paiement</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.method}>
                      <TableCell>{r.method}</TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMAD(r.amount)}</TableCell>
                      <TableCell className="font-mono tabular-nums text-muted-foreground">{r.pct_of_total.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="font-mono tabular-nums">{formatMAD(total)}</TableCell>
                    <TableCell className="font-mono tabular-nums text-muted-foreground">100%</TableCell>
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
