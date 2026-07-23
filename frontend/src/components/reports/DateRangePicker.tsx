import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toLocalISODate as toISO } from '@/lib/utils';

const PRESETS: { label: string; range: () => [string, string] }[] = [
  // Only bounds `from` — the backend defaults a missing `to` to its own
  // notion of "today" (business timezone), so we don't send one at all here.
  { label: "Aujourd'hui", range: () => [toISO(new Date()), ''] },
  { label: 'Hier', range: () => { const t = new Date(); t.setDate(t.getDate() - 1); return [toISO(t), toISO(t)]; } },
  { label: '7 derniers jours', range: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); return [toISO(from), toISO(to)]; } },
  { label: 'Mois', range: () => { const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1); return [toISO(from), toISO(now)]; } },
];

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangePicker({ dateFrom, dateTo, onChange }: DateRangePickerProps) {
  const todayISO = toISO(new Date());
  return (
    <Card className="mb-3.5 flex flex-row flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground">Du</label>
        <Input type="date" value={dateFrom} max={todayISO} onChange={(e) => onChange(e.target.value, dateTo)} className="w-auto" />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground">Au</label>
        <Input type="date" value={dateTo} max={todayISO} onChange={(e) => onChange(dateFrom, e.target.value)} className="w-auto" />
      </div>
      <div className="flex flex-wrap gap-1.5 sm:ml-auto">
        {PRESETS.map((p) => (
          <Button key={p.label} variant="outline" size="sm" onClick={() => onChange(...p.range())}>
            {p.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
