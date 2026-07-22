import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { toLocalISODate as toISO } from '@/lib/utils';

interface WorkPeriodRow {
  num_cloture: number;
  journee: string;
  date_cloture: string;
  etat: string;
  export_compta: boolean;
}

const formatDateTime = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function WorkPeriodsPage() {
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<WorkPeriodRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: dateFrom });
      if (dateTo) params.set('to', dateTo);
      const res = await api.get(`/client/reports/work-periods?${params.toString()}`);
      setRows(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Périodes de travail</h1>
        <p className="text-sm text-muted-foreground">Clôtures de caisse sur la période sélectionnée</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      <Card>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Aucune clôture sur cette période</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Journée</TableHead>
                    <TableHead>Clôturée le</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead>Export compta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.num_cloture}>
                      <TableCell>{r.journee}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.date_cloture)}</TableCell>
                      <TableCell><Badge variant="secondary">{r.etat}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{r.export_compta ? 'Oui' : 'Non'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
