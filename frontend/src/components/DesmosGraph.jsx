import React, { useEffect, useRef } from 'react'

const DESMOS_SRC = 'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fac6'

function toDesmos(eq) {
  return eq
    .replace(/Math\.sin/g, '\\sin')
    .replace(/Math\.cos/g, '\\cos')
    .replace(/Math\.tan/g, '\\tan')
    .replace(/Math\.sqrt/g, '\\sqrt')
    .replace(/Math\.abs/g, '\\left|')
    .replace(/Math\.log/g, '\\ln')
    .replace(/Math\.PI/g, '\\pi')
    .replace(/Math\.E/g, 'e')
    .replace(/\*\*/g, '^')
    .replace(/\*/g, '')
    .replace(/y=/, 'y=')
}

function initCalculator(container, expressions) {
  const calc = window.Desmos.GraphingCalculator(container, {
    keypad: true,
    settingsMenu: false,
    expressionsCollapsed: false,
    lockViewport: false,
    zoomButtons: true,
    showResetButtonOnGraphpaper: true,
    images: false,
    folders: false,
    notes: false,
    sliders: true,
    links: false,
    distributions: false,
    pasteTableData: true,
    invertedColors: false,
  })
  expressions.forEach((latex, i) => {
    calc.setExpression({ id: 'expr' + i, latex: toDesmos(latex) })
  })
  return calc
}

export default function DesmosGraph({ expressions = [], title }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let calc = null
    let timer = null

    const run = () => {
      timer = setTimeout(() => {
        if (window.Desmos && containerRef.current) {
          calc = initCalculator(containerRef.current, expressions)
        }
      }, 100)
    }

    if (window.Desmos) {
      run()
    } else {
      // Script not yet loaded — inject it then run
      const existing = document.querySelector(`script[src="${DESMOS_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', run)
      } else {
        const script = document.createElement('script')
        script.src = DESMOS_SRC
        script.onload = run
        document.head.appendChild(script)
      }
    }

    return () => {
      clearTimeout(timer)
      if (calc) calc.destroy()
    }
  }, [])

  return (
    <div style={{ margin: '14px 0', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {title && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid #E5E7EB',
          fontSize: 13, fontWeight: 600, color: '#1E3A8A',
        }}>
          {title}
        </div>
      )}
      <style>{`.dcg-header-container { display: none !important }`}</style>
      <div ref={containerRef} style={{ width: '100%', height: '480px' }} />
    </div>
  )
}
