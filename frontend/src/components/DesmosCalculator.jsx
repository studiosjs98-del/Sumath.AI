import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const DESMOS_SCRIPT = 'https://www.desmos.com/api/v1.10/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6'

function loadDesmosScript() {
  return new Promise((resolve, reject) => {
    if (window.Desmos) { resolve(); return }
    const existing = document.getElementById('desmos-script')
    if (existing) {
      existing.addEventListener('load', resolve)
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.id = 'desmos-script'
    script.src = DESMOS_SCRIPT
    script.async = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function DesmosCalculator({ onClose }) {
  const containerRef = useRef(null)
  const calcRef = useRef(null)
  const dragRef = useRef(null)

  const defaultPos = () => ({
    x: Math.max(20, window.innerWidth - 440),
    y: Math.max(20, window.innerHeight - 580),
  })

  const [pos, setPos] = useState(defaultPos)

  useEffect(() => {
    let destroyed = false
    loadDesmosScript().then(() => {
      if (destroyed || !containerRef.current || !window.Desmos) return
      calcRef.current = window.Desmos.ScientificCalculator(containerRef.current, {
        keypad: true,
        language: 'ko',
      })
    }).catch(() => {})
    return () => {
      destroyed = true
      calcRef.current?.destroy()
      calcRef.current = null
    }
  }, [])

  const onMouseDown = (e) => {
    e.preventDefault()
    const startX = e.clientX - pos.x
    const startY = e.clientY - pos.y
    dragRef.current = { startX, startY }

    const onMove = (e) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 520, e.clientY - dragRef.current.startY)),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 400,
      height: 520,
      zIndex: 1000,
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Drag handle / header */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>계산기</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 2, borderRadius: 4,
          }}
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Desmos container */}
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />
    </div>
  )
}
