import React from 'react'
import { Mafs, Coordinates, Plot, Point, Line, Circle } from 'mafs'

// ── Expression compiler ────────────────────────────────────────────────────────
function compileExpr(raw) {
  const expr = raw
    .replace(/^[yY]\s*=\s*/, '')
    .trim()
    .replace(/\^/g, '**')
    .replace(/(\d)(x)/gi, '$1*x')
    .replace(/(\d)\(/g, '$1*(')
    .replace(/\)\(/g, ')*(')
    .replace(/(?<!Math\.)(?<!\w)(sin)\b/g, 'Math.sin')
    .replace(/(?<!Math\.)(?<!\w)(cos)\b/g, 'Math.cos')
    .replace(/(?<!Math\.)(?<!\w)(tan)\b/g, 'Math.tan')
    .replace(/(?<!Math\.)(?<!\w)(sqrt)\b/g, 'Math.sqrt')
    .replace(/(?<!Math\.)(?<!\w)(abs)\b/g, 'Math.abs')
    .replace(/(?<!Math\.)(?<!\w)(exp)\b/g, 'Math.exp')
    .replace(/(?<!Math\.)(?<!\w)(ln)\b/g, 'Math.log')
    .replace(/(?<!Math\.)(?<!\w)(log)\b/g, 'Math.log10')
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
  try {
    // eslint-disable-next-line no-new-func
    return new Function('x', `"use strict"; try { const r=(${expr}); return (r!==null&&isFinite(r)&&!isNaN(r))?r:NaN; } catch(e){ return NaN; }`)
  } catch {
    return () => NaN
  }
}

const COLORS = ['#4F7EFF', '#FF6B6B', '#00C49F', '#FFB347', '#A78BFA']

// ── Main component ─────────────────────────────────────────────────────────────
export default function MafsGraph({ data }) {
  if (!data) return null

  const {
    type,
    expression,
    expressions,
    equations,
    points,
    xRange = [-6, 6],
    yRange = [-5, 5],
    label,
    title,
    center,
    radius,
    point1,
    point2,
  } = data

  const displayTitle = label || title

  // Gather all function expressions (support old + new format)
  const funcExprs = expression
    ? [expression]
    : expressions || equations || []

  return (
    <div style={{
      margin: '14px 0',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
    }}>
      {displayTitle && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #E5E7EB',
          fontSize: 13,
          fontWeight: 600,
          color: '#1E3A8A',
        }}>
          {displayTitle}
        </div>
      )}
      <Mafs
        viewBox={{ x: xRange, y: yRange }}
        preserveAspectRatio={false}
        height={380}
        style={{ background: '#fff' }}
      >
        <Coordinates.Cartesian />

        {/* Function plots */}
        {(type === 'function' || (!type && funcExprs.length > 0)) &&
          funcExprs.map((expr, i) => (
            <Plot.OfX
              key={i}
              y={compileExpr(expr)}
              color={COLORS[i % COLORS.length]}
              strokeWidth={2.5}
            />
          ))
        }

        {/* Points */}
        {(type === 'points' || (type == null && points)) && points &&
          points.map((pt, i) => {
            const [px, py] = Array.isArray(pt) ? pt : [pt.x, pt.y]
            return <Point key={i} x={px} y={py} color="#4F7EFF" />
          })
        }

        {/* Circle */}
        {type === 'circle' && center && radius != null && (
          <Circle
            center={Array.isArray(center) ? center : [center.x, center.y]}
            radius={radius}
            color="#4F7EFF"
            fillOpacity={0.15}
          />
        )}

        {/* Line segment */}
        {type === 'line' && point1 && point2 && (
          <Line.Segment
            point1={Array.isArray(point1) ? point1 : [point1.x, point1.y]}
            point2={Array.isArray(point2) ? point2 : [point2.x, point2.y]}
            color="#4F7EFF"
          />
        )}
      </Mafs>
    </div>
  )
}
