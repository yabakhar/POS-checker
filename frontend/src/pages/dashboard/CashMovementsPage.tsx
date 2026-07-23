import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import DateRangePicker from '../../components/reports/DateRangePicker';
import KpiCard from '../../components/reports/KpiCard';
import { toLocalISODate as toISO } from '@/lib/utils';

interface Movement {
  num_auto: number;
  chp_date: string;
  employee_name: string;
  reason: string;
  amount: number;
  balance: number;
}

interface ReasonTotal {
  reason: string;
  amount: number;
}

interface CashMovementsData {
  movements: Movement[];
  totals_by_reason: ReasonTotal[];
  net_movement: number;
  ending_balance: number;
}

const formatMAD = (v: number) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function CashMovementsPage() {
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<CashMovementsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom });
      if (dateTo) params.set('to', dateTo);
      const res = await api.get(`/client/reports/cash-movements?${params.toString()}`);
      setData(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Mouvements de caisse</h1>
        <p className="text-sm text-muted-foreground">
          Fonds de caisse, entrées et sorties — solde théorique, sans comptage physique indépendant à comparer
        </p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading || !data ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <KpiCard label="Mouvement net" value={formatMAD(data.net_movement)} sub="Sur la période sélectionnée" />
            <KpiCard label="Solde théorique" value={formatMAD(data.ending_balance)} sub="Cumul depuis le premier mouvement enregistré" />
            <KpiCard
              label="Répartition par raison"
              small
              value={
                data.totals_by_reason.length === 0
                  ? '—'
                  : data.totals_by_reason.map((r) => `${r.reason}: ${formatMAD(r.amount)}`).join(' · ')
              }
            />
          </div>

          <Card>
            <CardContent>
              {data.movements.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucun mouvement sur cette période</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employé</TableHead>
                        <TableHead>Raison</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Solde théorique</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.movements.map((m) => (
                        <TableRow key={m.num_auto}>
                          <TableCell className="text-muted-foreground">{m.chp_date}</TableCell>
                          <TableCell>{m.employee_name}</TableCell>
                          <TableCell><Badge variant="secondary">{m.reason}</Badge></TableCell>
                          <TableCell className={`font-mono tabular-nums ${m.amount < 0 ? 'text-destructive' : ''}`}>
                            {m.amount >= 0 ? '+' : ''}{formatMAD(m.amount)}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums text-muted-foreground">{formatMAD(m.balance)}</TableCell>
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
