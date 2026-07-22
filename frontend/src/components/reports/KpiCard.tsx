import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  small?: boolean;
}

// One consistent accent (the dashed "receipt tear" top edge) across every stat tile —
// restraint on purpose, so nothing competes with it.
export default function KpiCard({ label, value, sub, small }: KpiCardProps) {
  return (
    <Card className="gap-2 border-t-2 border-t-primary border-dashed py-4">
      <CardHeader className="px-4">
        <CardTitle className="font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className={cn('font-mono font-semibold tracking-tight tabular-nums', small ? 'text-base' : 'text-2xl')}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground/80">{sub}</div>}
      </CardContent>
    </Card>
  );
}
