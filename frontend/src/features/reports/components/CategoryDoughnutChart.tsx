import React, { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { chartAnimation, cssVar } from '@/lib/chart';
import type { CategoryTotal } from '../types';

const PALETTE_VARS = [
  ['--erp-primary', '#147A5F'],
  ['--erp-primary-container', '#52CBB0'],
  ['--erp-primary-fixed', '#A8F0DC'],
  ['--erp-tertiary', '#7c4d00'],
  ['--erp-tertiary-container', '#8a5600'],
  ['--erp-outline', '#5a7a6e'],
] as const;

interface CategoryDoughnutChartProps {
  rows: CategoryTotal[];
  height?: number;
}

export const CategoryDoughnutChart: React.FC<CategoryDoughnutChartProps> = ({ rows, height = 260 }) => {
  const data = useMemo(() => {
    const colors = PALETTE_VARS.map(([name, fallback]) => cssVar(name, fallback));
    return {
      labels: rows.map((r) => r.category),
      datasets: [
        {
          data: rows.map((r) => Number(r.total)),
          backgroundColor: rows.map((_, i) => colors[i % colors.length]),
          borderWidth: 2,
          borderColor: cssVar('--erp-surface-container-lowest', '#ffffff'),
        },
      ],
    };
  }, [rows]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: chartAnimation(),
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' as const, labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: { label: (ctx: { label?: string; parsed: number }) => `${ctx.label}: Rs. ${ctx.parsed.toLocaleString()}` },
        },
      },
    }),
    []
  );

  if (rows.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center text-outline font-body-sm text-body-sm">No sales in this period.</div>;
  }

  return (
    <div style={{ height }}>
      <Doughnut data={data} options={options} />
    </div>
  );
};

export default CategoryDoughnutChart;
