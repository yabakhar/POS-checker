import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import DateRangePicker from '../../components/reports/DateRangePicker';
import CategoryDonut from '../../components/reports/CategoryDonut';

const toISO = (d) => d.toISOString().slice(0, 10);
const defaultFrom = () => { const d = new Date(); d.setDate(d.getDate() - 20); return toISO(d); };
const formatMAD = (v) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function SalesByCategoryPage() {
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(() => toISO(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/client/reports/sales-by-category?from=${dateFrom}&to=${dateTo}`);
      setRows(res.data);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">Ventes par catégorie</h1>
        <p className="text-sm text-muted-foreground">Répartition du chiffre d'affaires par famille d'articles</p>
      </div>

      <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardContent>
              <CategoryDonut data={rows} height={280} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              {rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucune vente sur cette période</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Qté</TableHead>
                        <TableHead>CA</TableHead>
                        <TableHead>%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.category_name}>
                          <TableCell>{r.category_name}</TableCell>
                          <TableCell className="font-mono tabular-nums text-muted-foreground">{r.qty}</TableCell>
                          <TableCell className="font-mono tabular-nums">{formatMAD(r.revenue)}</TableCell>
                          <TableCell className="font-mono tabular-nums text-muted-foreground">{r.pct_of_total.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
