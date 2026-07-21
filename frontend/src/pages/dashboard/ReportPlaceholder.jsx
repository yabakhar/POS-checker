import React from 'react';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function ReportPlaceholder({ title }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Rapports et analyses</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-18 text-center">
          <Clock className="mb-3 h-8 w-8 text-muted-foreground/60" />
          <div className="mb-1.5 text-sm text-muted-foreground">Bientôt disponible</div>
          <div className="text-xs text-muted-foreground/70">Ce rapport n'est pas encore disponible dans cette version.</div>
        </CardContent>
      </Card>
    </div>
  );
}
