import React, { useMemo } from 'react';
import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { chartAnimation, cssVar } from '@/lib/chart';
import type { TrendPoint } from '../types';

interface SalesTrendChartProps {
  points: TrendPoint[];
  height?: number;
}

const formatDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ points, height = 260 }) => {
  const data = useMemo(() => {
    const primary = cssVar('--erp-primary', '#147A5F');
    const primaryTint = cssVar('--erp-primary-container', '#52CBB0');
    return {
      labels: points.map((p) => formatDay(p.date)),
      datasets: [
        {
          label: 'Sales',
          data: points.map((p) => Number(p.total)),
          borderColor: primary,
          backgroundColor: `${primaryTint}33`,
          pointBackgroundColor: primary,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
        },
      ],
    };
  }, [points]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnimation(),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx: TooltipItem<'line'>) => `Rs. ${Number(ctx.parsed.y ?? 0).toLocaleString()}` },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: (value: number | string) => `${Number(value) / 1000}k` }, beginAtZero: true },
      },
    }),
    []
  );

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
};

export default SalesTrendChart;
