import React from 'react'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

function symmetricRange(values, padding = 0.1) {
  if (!values.length) return { min: -5, max: 5 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const abs = Math.max(Math.abs(lo), Math.abs(hi))
  const padded = abs === 0 ? 1 : abs * (1 + padding)
  return { min: -padded, max: padded }
}

// Callback: darker color at zero, subtle elsewhere
function gridColor(ctx) {
  return ctx.tick.value === 0 ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'
}

export default function PointsGraph({ points, title, titleHtml }) {
  if (!points || points.length === 0) return null

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const xRange = symmetricRange(sorted.map(p => p.x))
  const yRange = symmetricRange(sorted.map(p => p.y))

  const data = {
    datasets: [
      {
        data: sorted.map(p => ({ x: p.x, y: p.y })),
        borderColor: '#4F7EFF',
        backgroundColor: 'rgba(79,126,255,0)',
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#4F7EFF',
        tension: 0.4,
        fill: false,
        borderWidth: 2.5,
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: item => `(${item.parsed.x}, ${item.parsed.y})`
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        min: xRange.min,
        max: xRange.max,
        title: { display: true, text: 'x', font: { style: 'italic', size: 12 }, color: '#374151' },
        grid: { color: gridColor, lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1 },
        ticks: { color: '#6B7280', font: { size: 11 } },
        border: { color: 'transparent' }
      },
      y: {
        type: 'linear',
        min: yRange.min,
        max: yRange.max,
        title: { display: true, text: 'y', font: { style: 'italic', size: 12 }, color: '#374151' },
        grid: { color: gridColor, lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1 },
        ticks: { color: '#6B7280', font: { size: 11 } },
        border: { color: 'transparent' }
      }
    }
  }

  return (
    <div style={{ margin: '14px 0', border: '1px solid #E5E7EB', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
      {(titleHtml || title) && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #E5E7EB', fontSize: 13, fontWeight: 600, color: '#1E3A8A' }}>
          {titleHtml
            ? <span dangerouslySetInnerHTML={{ __html: titleHtml }} />
            : title}
        </div>
      )}
      <div style={{ padding: '16px 20px' }}>
        <Line data={data} options={options} />
      </div>
    </div>
  )
}
