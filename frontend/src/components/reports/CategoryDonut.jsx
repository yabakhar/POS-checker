import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ChartContainer } from '@/components/ui/chart';

// Fixed categorical order (never cycled/reassigned per data) — shares the same
// --chart-1..5 CSS variables defined in index.css (validated palette, see the
// dataviz skill's references/palette.md for the CVD/contrast checks).
const CHART_VARS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const formatMAD = (v) => `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DH`;

export default function CategoryDonut({ data, height = 260 }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">Aucune donnée à afficher</div>;
  }
  return (
    <ChartContainer config={{}} className="mx-auto aspect-auto" style={{ height }}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="category_name"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((_, i) => <Cell key={i} fill={CHART_VARS[i % CHART_VARS.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }}
          formatter={(value) => formatMAD(value)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartContainer>
  );
}
