'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { QueryResult } from '@/lib/db';
import {
  formatAxisLabel,
  formatCell,
  formatCompact,
  isMoneyColumn,
  toText,
} from '@/lib/format';
import type { ChartSpec } from '@/lib/tools';

interface Props {
  chart: ChartSpec;
  result: QueryResult;
}

function ChartTooltip({
  active,
  payload,
  label,
  yKey,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: unknown;
  yKey: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="bg-popover rounded-md border px-2.5 py-1.5 text-xs shadow-sm">
      <div className="text-muted-foreground">{toText(label)}</div>
      <div className="font-medium tabular-nums">
        {typeof value === 'number' ? formatCell(yKey, value) : ''}
      </div>
    </div>
  );
}

export function ResultChart({ chart, result }: Props) {
  const data = result.rows.map((row) => ({
    ...row,
    [chart.xKey]: formatAxisLabel(row[chart.xKey]),
  }));
  const color = 'var(--chart-1)';
  const unit = isMoneyColumn(chart.yKey) ? ' (RD$)' : '';

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey={chart.xKey}
        tickLine={false}
        axisLine={false}
        interval="preserveStartEnd"
        minTickGap={16}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={(v: number) => formatCompact(v)}
      />
      <Tooltip
        cursor={{ fill: 'var(--muted)', stroke: 'var(--border)' }}
        content={<ChartTooltip yKey={chart.yKey} />}
      />
    </>
  );

  return (
    <figure className="rounded-lg border p-3">
      <figcaption className="mb-2 text-sm font-medium">
        {chart.title}
        <span className="text-muted-foreground font-normal">{unit}</span>
      </figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0 }}>
              {axes}
              <Line
                type="monotone"
                dataKey={chart.yKey}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0 }}>
              {axes}
              <Bar
                dataKey={chart.yKey}
                fill={color}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
