import React, { useState, useRef, useEffect, useCallback, useContext } from 'react'
import { Send, X, HelpCircle, AlertCircle, BookOpen, Lightbulb, ChevronDown, ChevronUp, ImagePlus, Camera, PanelLeftOpen, PenLine, Calculator, ArrowUp } from 'lucide-react'
import api from '../utils/api'
import useStore from '../store/useStore'

import FunctionGraph from '../components/FunctionGraph'
import PointsGraph from '../components/PointsGraph'
import GraphComponent from '../components/GraphComponent'
import { ChatContext } from '../App'
import { PracticePanel } from '../components/PracticePanel'
import SolutionRenderer from '../components/SolutionRenderer'
import KoreanCalculator from '../components/KoreanCalculator'
import InlinePractice from '../components/InlinePractice'
import { renderInline, stripDanglingMarkdown, Inline } from '../utils/katex'
import katex from 'katex'
import { getChat, saveChat, newChatId } from '../utils/localChats'

const GREY = '#6B7280'
const MAX_SEND = 30        // messages to send to AI

function SigmaLogo() {
  return (
    <span style={{ fontSize: 52, fontWeight: 700, color: '#4F7EFF', fontFamily: 'serif', lineHeight: 1 }}>Σ</span>
  )
}

// ─── CSS ────────────────────────────────────────────────────────────────────
const STYLES = `
/* ── Welcome / empty state ── */
.chat-welcome {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
}
.chat-welcome-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 32px 24px 16px;
  animation: fadeIn 0.35s ease forwards;
}
.chat-welcome-chips {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  max-width: 620px;
}

/* ── Active chat area ── */
.chat-active {
  flex: 1; display: flex; flex-direction: column;
  min-height: 0;
  overflow: hidden;
  animation: fadeIn 0.25s ease forwards;
}
.chat-messages {
  flex: 1; min-height: 0;
  overflow-y: auto; padding: 20px;
}

/* Sidebar toggle button in top bar */
.sb-topbar-toggle {
  width: 36px; height: 36px; border-radius: 8px;
  background: transparent; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #374151;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.sb-topbar-toggle:hover { background: rgba(0,0,0,0.08); }

@keyframes msgReveal {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes thinking {
  0% { background-position: 100% center; }
  100% { background-position: -100% center; }
}
.rendered-bubble-reveal { animation: renderedFadeIn 0.4s ease both; }
@keyframes renderedFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes bounceDot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45 }
  30%            { transform: translateY(-7px); opacity: 1 }
}
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.18), 0 1px 4px rgba(0,0,0,0.07) }
  50%       { box-shadow: 0 0 0 7px rgba(37,99,235,0), 0 1px 4px rgba(0,0,0,0.07) }
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(10px) }
  to   { opacity: 1; transform: translateY(0) }
}
@keyframes kbSlide {
  from { opacity: 0; transform: translateY(10px) }
  to   { opacity: 1; transform: translateY(0) }
}
@keyframes blink {
  0%, 100% { opacity: 1 }
  50%      { opacity: 0 }
}
@keyframes ilpSlideIn {
  from { opacity: 0; transform: translateY(6px) }
  to   { opacity: 1; transform: translateY(0) }
}
@keyframes ilpFadeIn {
  from { opacity: 0 }
  to   { opacity: 1 }
}
.chat-b0 { animation: bounceDot 1.3s ease-in-out infinite 0s }
.chat-b1 { animation: bounceDot 1.3s ease-in-out infinite 0.2s }
.chat-b2 { animation: bounceDot 1.3s ease-in-out infinite 0.4s }
.chat-thinking { animation: pulseGlow 2s ease-in-out infinite }
.chat-msg { animation: msgIn 0.26s ease forwards }
.chat-kb {
  animation: kbSlide 0.2s ease forwards;
  background: #fff;
  border-radius: 18px;
  border: 1px solid #f0f0f0;
  box-shadow: 0 8px 28px rgba(0,0,0,0.10);
  padding: 12px 16px 14px;
}
.kb-tab {
  padding: 6px 14px; border: none; background: transparent;
  font-size: 13px; font-style: italic; font-weight: 500;
  color: #9ca3af; cursor: pointer; white-space: nowrap;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.15s;
}
.kb-tab-active { color: #4F7EFF; border-bottom-color: #4F7EFF; }
.kb-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 70px; height: 50px; padding: 6px 10px;
  background: #fff; border: 1px solid #ececec; border-radius: 10px;
  cursor: pointer; font-size: 15px; font-family: serif;
  transition: background 0.12s;
  line-height: 1;
}
.kb-btn:hover { background: #f7f8fa; }
.kb-btn:active { transform: scale(0.93); }
.sym-btn:active { transform: scale(0.88) }
/* ── Drop zone ── */
.dz {
  width: 100%;
  height: 70px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 0 18px;
  margin-bottom: 8px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: var(--radius-lg);
  background: var(--input-bg);
  cursor: pointer;
  transition: border-color 0.3s ease, background 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
  box-sizing: border-box;
}
.dz:hover {
  border-color: rgba(0,0,0,0.14);
  background: rgba(99, 120, 255, 0.03);
  transform: scale(1.012);
}
.dz.dz-drag {
  border-color: rgba(99, 120, 255, 0.4);
  background: rgba(99, 120, 255, 0.05);
  transform: scale(1.02);
  box-shadow: 0 0 0 2px rgba(99, 120, 255, 0.25);
}
.dz-icon {
  color: rgba(37, 99, 235, 0.5);
  display: flex;
  flex-shrink: 0;
}
.dz.dz-drag .dz-icon { color: rgba(99, 120, 255, 0.7); }
.dz-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dz-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}
.dz.dz-drag .dz-label { color: rgba(99, 120, 255, 0.8); }
.dz-hint {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}
.dz.dz-drag .dz-hint { color: rgba(99, 120, 255, 0.55); }
/* Preview zone */
.dz-preview {
  width: 100%;
  min-height: 110px;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
  padding: 0 18px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-gray);
  box-sizing: border-box;
  transition: border-color 0.3s ease;
}
.dz-preview:hover { border-color: rgba(0,0,0,0.12); }
/* Camera button — touch devices only */
.img-zone-camera { display: none !important; }
@media (hover: none) and (pointer: coarse) {
  .img-zone-camera { display: flex !important; }
}

/* ── New drop zone ── */
.dz2 {
  width: calc(100% - 40px); box-sizing: border-box; margin: 0 auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 18px 16px;
  border: 1px dashed #e5e7eb; border-radius: 20px 20px 4px 4px;
  border-bottom: none;
  background: #f9fafb; cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
  user-select: none;
}
.dz2:hover { border-color: #4F7EFF; background: rgba(79,126,255,0.03); }
.dz2.dz2-drag { border-color: #4F7EFF; background: rgba(79,126,255,0.06); box-shadow: 0 0 0 2px rgba(79,126,255,0.15); }

/* ── New ia-card v2 ── */
.ia-card2 {
  background: var(--card-bg);
  border-radius: 20px;
  border: 1.5px solid var(--border);
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 12px 12px 12px 16px;
  display: flex; flex-direction: column; gap: 8px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  margin-bottom: 8px;
}
.ia-card2:focus-within { border-color: rgba(79,126,255,0.4); box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 0 0 3px rgba(79,126,255,0.08); }

/* ── Math chip (inline live math-field) ── */
.math-chip {
  display: inline-block; vertical-align: middle;
  border: 1.5px solid #bfdbfe; border-radius: 5px;
  background: #eff6ff; padding: 2px 6px;
  line-height: 1; position: relative;
  cursor: text;
}
/* Strip all MathLive chrome — size to content only */
.math-chip math-field {
  display: inline-block !important;
  vertical-align: middle;
  font-size: 1.35em !important;
  min-height: unset !important;
  padding: 0 !important;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  --placeholder-color: transparent;
  --placeholder-opacity: 0;
  --contains-highlight-background-color: transparent;
  --smart-fence-color: transparent;
  --selection-background-color: rgba(79,126,255,0.15);
  --caret-color: #4F7EFF;
}
/* Kill browser focus ring on the shadow host — external author CSS wins over shadow :host() rules */
.math-chip math-field:focus,
.math-chip math-field:focus-within {
  outline: none !important;
  box-shadow: none !important;
}
.math-chip math-field::part(virtual-keyboard-toggle) { display: none !important; }
.math-chip math-field::part(menu-toggle) { display: none !important; }
/* contenteditable input area */
.ce-input {
  border: none; outline: none; background: transparent;
  font-size: 14px; font-family: inherit; color: var(--text-primary);
  min-height: 24px; max-height: 140px; overflow-y: auto;
  padding: 0 0 0 2px; line-height: 1.8; width: 100%;
  white-space: pre-wrap; word-break: break-word;
}
.ce-input:empty::before {
  content: attr(data-placeholder);
  color: #9ca3af; pointer-events: none;
}
.ia-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 9999px;
  border: 1px solid #e5e7eb; background: #fff;
  font-size: 13px; font-weight: 500; color: #374151;
  cursor: pointer; font-family: inherit;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ia-pill:hover { background: #f3f4f6; border-color: #d1d5db; }
.ia-pill-active { background: #f3f4f6 !important; border-color: #4F7EFF !important; color: #2563eb !important; }
.ia-pill-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 9999px;
  border: 1px solid #e5e7eb; background: #fff;
  cursor: pointer; color: #374151; flex-shrink: 0;
  transition: background 0.15s ease;
}
.ia-pill-icon:hover { background: #f3f4f6; }

button:hover:not(.ia-send-ready):not(.sym-btn) {
  background: rgba(0,0,0,0.05) !important;
}
button:active:not(.ia-send-ready):not(.sym-btn) {
  background: rgba(0,0,0,0.10) !important;
}
button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(148,163,184,0.18);
}

/* ── Premium input area ── */
.ia-outer {
  background: transparent;
  padding: 8px 16px 16px;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}
.ia-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 8px;
}
.ia-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #94A3B8;
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
}
.ia-toolbar-btn:hover {
  background: rgba(0,0,0,0.045);
}
.ia-toolbar-active {
  background: #F3F4F6 !important;
  border-color: #D1D5DB !important;
  color: #111827 !important;
}
.ia-card {
  background: var(--card-bg);
  border-radius: 16px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 10px 10px 10px 16px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  margin-bottom: 8px;
}
.ia-card:focus-within {
  border-color: rgba(79,126,255,0.4);
  box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 0 0 3px rgba(79,126,255,0.08);
}
.ia-send {
  will-change: transform;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
}
.ia-send-ready {
  background: linear-gradient(135deg, #4F7EFF, #3B5FCC) !important;
  box-shadow: 0 4px 14px rgba(79, 126, 255, 0.4);
}
.ia-send-ready:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(79, 126, 255, 0.5) !important;
}
.ia-send-ready:active:not(:disabled) {
  transform: translateY(0px);
  box-shadow: 0 4px 14px rgba(79, 126, 255, 0.4) !important;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.ia-hint {
  text-align: center;
  font-size: 11px;
  color: #b0bac6;
  margin-top: 4px;
  letter-spacing: 0.01em;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.practice-panel {
  animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
/* KaTeX error spans must never show red to students */
.katex-error { color: #374151 !important; }
`

// ─── Math keyboard button definitions ────────────────────────────────────────
// Each button has:
//   insert — template inserted into chip (MathLive #? = placeholder)
//   katex  — KaTeX string rendered on the button face (\square = visual □)
const KEYBOARD_TABS = {
  '기본': [
    // Row 1
    { insert: '\\frac{#?}{#?}',               katex: '\\frac{\\square}{\\square}' },
    { insert: 'x^{#?}',                        katex: 'x^{\\square}' },
    { insert: 'x_{#?}',                        katex: 'x_{\\square}' },
    { insert: '\\sqrt{#?}',                    katex: '\\sqrt{\\square}' },
    { insert: '\\sqrt[3]{#?}',                 katex: '\\sqrt[3]{\\square}' },
    { insert: '\\log_{#?}{#?}',                katex: '\\log_{\\square}{\\square}' },
    { insert: '\\int_{#?}^{#?}{#?}',           katex: '\\int_{\\square}^{\\square}' },
    { insert: '\\sum_{#?}^{#?}',               katex: '\\sum_{\\square}^{\\square}' },
    { insert: '\\pi',                           katex: '\\pi' },
    { insert: '\\infty',                        katex: '\\infty' },
    // Row 2
    { insert: '+',                              katex: '+' },
    { insert: '-',                              katex: '-' },
    { insert: '\\times',                        katex: '\\times' },
    { insert: '\\div',                          katex: '\\div' },
    { insert: '!',                              katex: '!' },
    { insert: '\\log',                          katex: '\\log' },
    { insert: '\\ln',                           katex: '\\ln' },
    { insert: 'x^{2}',                         katex: 'x^{2}' },
    { insert: 'x^{-1}',                        katex: 'x^{-1}' },
    { insert: '\\binom{#?}{#?}',               katex: '\\binom{\\square}{\\square}' },
    // Row 3
    { insert: '\\vec{#?}',                     katex: '\\vec{\\square}' },
    { insert: 'e',                              katex: 'e' },
    { insert: 'e^{#?}',                        katex: 'e^{x}' },
    { insert: 'i',                              katex: 'i' },
    { insert: '=',                              katex: '=' },
    { insert: '\\neq',                          katex: '\\neq' },
    { insert: '\\leq',                          katex: '\\leq' },
    { insert: '\\geq',                          katex: '\\geq' },
  ],
  '삼각함수': [
    { insert: '\\sin\\left(#?\\right)',         katex: '\\sin(\\square)' },
    { insert: '\\cos\\left(#?\\right)',         katex: '\\cos(\\square)' },
    { insert: '\\tan\\left(#?\\right)',         katex: '\\tan(\\square)' },
    { insert: '\\sin^{-1}\\left(#?\\right)',    katex: '\\sin^{-1}(\\square)' },
    { insert: '\\cos^{-1}\\left(#?\\right)',    katex: '\\cos^{-1}(\\square)' },
    { insert: '\\tan^{-1}\\left(#?\\right)',    katex: '\\tan^{-1}(\\square)' },
    { insert: '\\pi',                           katex: '\\pi' },
    { insert: '\\theta',                        katex: '\\theta' },
    { insert: '\\frac{\\pi}{#?}',              katex: '\\frac{\\pi}{\\square}' },
  ],
  '미적분': [
    { insert: '\\frac{d}{dx}\\left(#?\\right)',katex: '\\frac{d}{dx}(\\square)' },
    { insert: '\\frac{d^{2}}{dx^{2}}\\left(#?\\right)', katex: '\\frac{d^2}{dx^2}(\\square)' },
    { insert: '\\int_{#?}^{#?}{#?}\\,dx',     katex: '\\int_{\\square}^{\\square}' },
    { insert: '\\int{#?}\\,dx',               katex: '\\int' },
    { insert: '\\sum_{#?}^{#?}',              katex: '\\sum_{\\square}^{\\square}' },
    { insert: '\\lim_{x\\to #?}',             katex: '\\lim_{x\\to\\square}' },
    { insert: '\\lim_{x\\to \\infty}',        katex: '\\lim_{x\\to\\infty}' },
    { insert: '\\infty',                        katex: '\\infty' },
    { insert: "f'\\left(#?\\right)",           katex: "f'(\\square)" },
  ],
  '지수/로그': [
    { insert: '\\log\\left(#?\\right)',        katex: '\\log(\\square)' },
    { insert: '\\ln\\left(#?\\right)',         katex: '\\ln(\\square)' },
    { insert: '\\log_{#?}\\left(#?\\right)',   katex: '\\log_{\\square}(\\square)' },
    { insert: 'e^{#?}',                        katex: 'e^{\\square}' },
    { insert: '10^{#?}',                       katex: '10^{\\square}' },
    { insert: 'a^{#?}',                        katex: 'a^{\\square}' },
  ],
  '그리스': [
    { insert: '\\alpha',   katex: '\\alpha' },
    { insert: '\\beta',    katex: '\\beta' },
    { insert: '\\gamma',   katex: '\\gamma' },
    { insert: '\\delta',   katex: '\\delta' },
    { insert: '\\lambda',  katex: '\\lambda' },
    { insert: '\\mu',      katex: '\\mu' },
    { insert: '\\sigma',   katex: '\\sigma' },
    { insert: '\\omega',   katex: '\\omega' },
    { insert: '\\Sigma',   katex: '\\Sigma' },
    { insert: '\\Delta',   katex: '\\Delta' },
    { insert: '\\Omega',   katex: '\\Omega' },
    { insert: '\\phi',     katex: '\\phi' },
  ],
  '집합/논리': [
    { insert: '\\in',        katex: '\\in' },
    { insert: '\\notin',     katex: '\\notin' },
    { insert: '\\subset',    katex: '\\subset' },
    { insert: '\\subseteq',  katex: '\\subseteq' },
    { insert: '\\cup',       katex: '\\cup' },
    { insert: '\\cap',       katex: '\\cap' },
    { insert: '\\emptyset',  katex: '\\emptyset' },
    { insert: '\\leq',       katex: '\\leq' },
    { insert: '\\geq',       katex: '\\geq' },
    { insert: '\\neq',       katex: '\\neq' },
    { insert: '\\approx',    katex: '\\approx' },
  ],
}
const KEYBOARD_TAB_NAMES = Object.keys(KEYBOARD_TABS)

// Pre-render KaTeX button HTML at module load (avoids per-render cost)
const KB_RENDERED = {}
for (const [tab, btns] of Object.entries(KEYBOARD_TABS)) {
  KB_RENDERED[tab] = btns.map(btn => {
    try {
      return katex.renderToString(btn.katex, { throwOnError: false, displayMode: false })
    } catch {
      return btn.katex
    }
  })
}


// ─── Math rendering + solution block parsing ──────────────────────────────────
// All rendering is centralized in utils/katex.js and components/SolutionRenderer.jsx
// Do NOT add KaTeX calls or section-parsing logic here.


// ─── Extract follow-up question [Q]...[/Q] ──────────────────────────────────
function extractFollowUp(text) {
  const m = text.match(/\[Q\]([\s\S]*?)\[\/Q\]/i)
  if (!m) return { main: text, followUp: null }
  return {
    main: text.replace(/\[Q\][\s\S]*?\[\/Q\]/gi, '').trim(),
    followUp: m[1].trim()
  }
}

// ─── Diagram components ────────────────────────────────────────────────────────
function DiagramWrapper({ caption, children }) {
  return (
    <div style={{ margin: '16px 0', textAlign: 'center' }}>
      <svg viewBox="0 0 300 280" xmlns="http://www.w3.org/2000/svg" style={{ background: '#F8FAFC', borderRadius: 12, maxWidth: '100%' }}>
        {children}
      </svg>
      {caption && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{caption}</div>}
    </div>
  )
}

function AutoDiagram({ text, graphs = [] }) {
  const lower = text.toLowerCase()
  console.log('AutoDiagram called, lower includes p(a):', lower.includes('p(a'))
  if (graphs.length > 0) return null // already have a graph from [GRAPH] tag

  // VENN DIAGRAM for probability
  if (lower.includes('p(a') || lower.includes('p(b') || lower.includes('합집합') || lower.includes('벤')) {
    const paMatch = text.match(/p\(a\)\s*[=＝]\s*([\d.]+)/i)
    const pbMatch = text.match(/p\(b\)\s*[=＝]\s*([\d.]+)/i)
    const pabMatch = text.match(/p\(a\s*∩\s*b\)\s*[=＝]\s*([\d.]+)/i) || text.match(/p\(a\\cap\s*b\)\s*[=＝]\s*([\d.]+)/i)

    const pa = paMatch ? paMatch[1] : ''
    const pb = pbMatch ? pbMatch[1] : ''
    const pab = pabMatch ? pabMatch[1] : ''

    const svgHtml = `<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" style="background:#F8FAFC;border-radius:12px;border:1px solid #E5E7EB">
      <circle cx="120" cy="120" r="75" fill="#BFDBFE" fill-opacity="0.6" stroke="#2563EB" stroke-width="2"/>
      <circle cx="180" cy="120" r="75" fill="#FEF3C7" fill-opacity="0.6" stroke="#F59E0B" stroke-width="2"/>
      <text x="75" y="110" fill="#1E3A8A" font-size="16" font-weight="bold" text-anchor="middle">A</text>
      <text x="225" y="110" fill="#92400E" font-size="16" font-weight="bold" text-anchor="middle">B</text>
      <text x="150" y="105" fill="#374151" font-size="11" text-anchor="middle">A∩B</text>
      ${pa ? `<text x="75" y="130" fill="#1E3A8A" font-size="12" text-anchor="middle">${pa}</text>` : ''}
      ${pb ? `<text x="225" y="130" fill="#92400E" font-size="12" text-anchor="middle">${pb}</text>` : ''}
      ${pab ? `<text x="150" y="125" fill="#374151" font-size="12" text-anchor="middle">${pab}</text>` : ''}
      <text x="150" y="25" fill="#374151" font-size="13" font-weight="600" text-anchor="middle">벤 다이어그램</text>
    </svg>`

    return (
      <div style={{ textAlign: 'center', margin: '20px 0' }}>
        <div dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ display: 'inline-block' }} />
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
          {pa && pb ? `P(A)=${pa}, P(B)=${pb}${pab ? `, P(A∩B)=${pab}` : ''}` : '벤 다이어그램: A와 B의 관계'}
        </div>
      </div>
    )
  }

  // AUTO-DETECT function equations and generate graph
  // Only show trig graph if the problem explicitly asks to graph/draw the function
  const hasGraphKeyword = lower.includes('그래프') || lower.includes('그려') || lower.includes('함수의 그래프') || lower.includes('plot') || lower.includes('sketch')
  if (hasGraphKeyword && (lower.includes('sin') || lower.includes('cos') || lower.includes('tan'))) {
    let eq = 'y=Math.sin(x)'
    if (lower.includes('cos') && !lower.includes('sin')) eq = 'y=Math.cos(x)'
    if (lower.includes('tan') && !lower.includes('sin') && !lower.includes('cos')) eq = 'y=Math.tan(x)'

    // Try to extract the actual equation
    const sinMatch = text.match(/y\s*=\s*([^,\n]+(?:sin|cos|tan)[^,\n]+)/i)
    if (sinMatch) {
      eq = 'y=' + sinMatch[1].trim()
        .replace(/sin/g, 'Math.sin')
        .replace(/cos/g, 'Math.cos')
        .replace(/tan/g, 'Math.tan')
        .replace(/π/g, 'Math.PI')
        .replace(/(\d)x/g, '$1*x')
        .replace(/\^(\d)/g, '**$1')
    }

    return (
      <div style={{ margin: '16px 0' }}>
        <GraphComponent equations={[eq]} title="삼각함수 그래프" />
      </div>
    )
  }

  return null
}

// ─── Strip incomplete (unclosed) tag blocks from streaming text ─────────────
function stripOpenTags(text) {
  return text
    .replace(/\[GRAPH\](?:(?!\[\/GRAPH\])[\s\S])*$/i, '')
    .replace(/\[DESMOS\](?:(?!\[\/DESMOS\])[\s\S])*$/i, '')
    .replace(/\[DIAGRAM\](?:(?!\[\/DIAGRAM\])[\s\S])*$/i, '')
}

// ─── Extract graph blocks [GRAPH]...[/GRAPH] and [DESMOS]...[/DESMOS] ─────────
function extractGraphs(text) {
  const graphs = []
  const diagrams = []
  const tagRe = /\[(GRAPH|DESMOS)\]([\s\S]*?)\[\/(?:GRAPH|DESMOS)\]/gi
  let clean = text.replace(tagRe, (_, _tag, json) => {
    try {
      const data = JSON.parse(json.trim())
      if (data.equations) graphs.push({ kind: 'equations', ...data })
      else if (data.expressions) graphs.push({ kind: 'equations', equations: data.expressions, title: data.title })
      else if (data.func) graphs.push({ kind: 'func', ...data })
      else if (data.points) {
        const normalizedPoints = data.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p)
        graphs.push({ kind: 'points', ...data, points: normalizedPoints })
      }
    } catch {}
    return ''
  }).trim()
  const diagramRe = /\[DIAGRAM\]([\s\S]*?)\[\/DIAGRAM\]/gi
  clean = clean.replace(diagramRe, (_, json) => {
    try {
      const data = JSON.parse(json.trim())
      if (data.svg) diagrams.push({ kind: 'diagram', svg: data.svg, caption: data.caption || '' })
    } catch(e) {
      console.log('diagram parse error', e, json.slice(0, 100))
    }
    return ''
  }).trim()
  return { clean, graphs, diagrams }
}


// ─── Image drop zone ──────────────────────────────────────────────────────────
function ImageDropZone({ onFile, pendingImage, onClear, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [pdfNotice, setPdfNotice] = useState(false)
  const fileRef = useRef(null)
  const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf'

  const handleFile = (file) => {
    if (!file) return
    if (file.type === 'application/pdf') {
      setPdfNotice(true)
      setTimeout(() => setPdfNotice(false), 3000)
      return
    }
    if (file.type.startsWith('image/')) onFile(file)
  }

  const handleFileChange = (e) => {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const onDragOver = (e) => { e.preventDefault(); if (!disabled) setDragging(true) }
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }
  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    if (disabled) return
    handleFile(e.dataTransfer.files?.[0])
  }

  if (pendingImage) {
    return (
      <div className="dz-preview">
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img src={pendingImage.preview} alt="미리보기" style={{ height: 72, width: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }} />
          <button onClick={onClear} title="이미지 제거" style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#EF4444', color: '#fff', border: '2px solid #fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
            <X size={10} strokeWidth={3} />
          </button>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>이미지 첨부됨</div>
          <button onClick={() => !disabled && fileRef.current?.click()} disabled={disabled} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}>이미지 교체</button>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver} onDragEnter={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      onClick={() => !disabled && fileRef.current?.click()}
      className={`dz2${dragging ? ' dz2-drag' : ''}`}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <ImagePlus size={20} strokeWidth={1.5} color="#9ca3af" />
      {pdfNotice ? (
        <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 500 }}>PDF 지원은 곧 출시됩니다</span>
      ) : (
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          {dragging ? '여기에 놓으세요!' : <>드래그 또는 <span style={{ color: '#4F7EFF', fontWeight: 500 }}>클릭</span>하여 이미지나 PDF 추가</>}
        </span>
      )}
      <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  )
}

// ─── Image resize ─────────────────────────────────────────────────────────────
function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1024
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else { width = Math.round(width * MAX / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.82).split(',')[1], mimeType: 'image/jpeg' })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── Floating math symbol keyboard ───────────────────────────────────────────
function MathKeyboard({ onInsertChip }) {
  const [activeTab, setActiveTab] = useState(KEYBOARD_TAB_NAMES[0])
  const buttons = KEYBOARD_TABS[activeTab] || []
  const rendered = KB_RENDERED[activeTab] || []

  return (
    <div className="chat-kb">
      {/* ── Category tabs ── */}
      <div style={{
        display: 'flex', overflowX: 'auto', borderBottom: '1px solid #f3f4f6',
        marginBottom: 10, scrollbarWidth: 'none', gap: 2,
      }}>
        {KEYBOARD_TAB_NAMES.map(name => (
          <button
            key={name}
            onClick={() => setActiveTab(name)}
            className={`kb-tab${activeTab === name ? ' kb-tab-active' : ''}`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* ── Button grid ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {buttons.map((btn, i) => (
          <button
            key={i}
            className="kb-btn"
            onMouseDown={e => { e.preventDefault(); onInsertChip(btn.insert) }}
            dangerouslySetInnerHTML={{ __html: rendered[i] || btn.katex }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Conversation summary ──────────────────────────────────────────────────────
function ConversationSummary({ messages }) {
  if (messages.length < 10) return null
  const first = messages.find(m => m.role === 'user')
  if (!first) return null
  const topic = first.content.length > 36 ? first.content.slice(0, 36) + '…' : first.content
  return (
    <div style={{
      background: '#EFF6FF', borderBottom: '1px solid #BFDBFE',
      padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0
    }}>
      <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 700 }}>현재 대화</span>
      <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {topic}
      </span>
      <span style={{ fontSize: 11, color: GREY }}>{messages.length}개 메시지</span>
    </div>
  )
}

// Error boundary is now inside SolutionRenderer (components/SolutionRenderer.jsx)

// ─── Math chip helpers (Option A: inline math-field chips) ───────────────────

// Build an inline chip containing a live <math-field>.
// The wrapper has contenteditable="false" so the parent contenteditable treats
// it as an atomic node; MathLive's shadow-DOM handles its own focus/input.
function makeChip(latex, syncInputFn, editorEl) {
  const chip = document.createElement('span')
  chip.className = 'math-chip'
  chip.contentEditable = 'false'
  chip.dataset.latex = latex

  const mf = document.createElement('math-field')
  mf.setAttribute('math-virtual-keyboard-policy', 'manual')
  // menuItems = [] removes the context menu so menu-toggle never renders
  requestAnimationFrame(() => { try { mf.menuItems = [] } catch {} })

  chip.appendChild(mf)

  // Sync chip latex → parent input state on every keystroke inside the chip
  mf.addEventListener('input', () => {
    chip.dataset.latex = mf.value || ''
    syncInputFn()
  })

  // Arrow-key / Tab exit — or Backspace on empty chip
  mf.addEventListener('move-out', (e) => {
    if (!editorEl) return
    const dir = e.detail?.direction
    const backward = dir === 'backward' || dir === 'upward'

    // Backspace on empty chip → delete the chip entirely
    if (backward && !mf.value?.trim()) {
      chip.remove()
      syncInputFn()
      editorEl.focus()
      return
    }

    const range = document.createRange()
    const sel = window.getSelection()
    if (dir === 'forward' || dir === 'downward') {
      range.setStartAfter(chip)
    } else {
      range.setStartBefore(chip)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    editorEl.focus()
  })

  return { chip, mf }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AiChatPage() {
  const student   = useStore(s => s.student)
  const addToast  = useStore(s => s.addToast)
  const { activeChatId, setActiveChatId, setChats, sidebarCollapsed, toggleSidebar } = useContext(ChatContext)

  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [pendingImage, setPendingImage]   = useState(null)
  const [loading, setLoading]             = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)
  const [fadeInLast, setFadeInLast]       = useState(false)
  const [showKeyboard, setShowKeyboard]   = useState(false)
  const [showCalc, setShowCalc]           = useState(false)
  const [liveWeakTopics, setLiveWeakTopics] = useState([])
  const [totalWrong, setTotalWrong]        = useState(0)
  const [recentWrong]                     = useState([])
  const [practiceQuestions, setPracticeQuestions] = useState([])
  const [practiceLoading, setPracticeLoading]     = useState(false)
  const [practiceError, setPracticeError]         = useState(null)
  const [practiceAnswers, setPracticeAnswers]     = useState({})
  const [practiceRevealed, setPracticeRevealed]   = useState({})
  const [practiceCurrentQ, setPracticeCurrentQ]   = useState(0)
  const [practiceShowSteps, setPracticeShowSteps] = useState({})
  const [openSteps, setOpenSteps] = useState(new Set())
  const [practiceScore, setPracticeScore] = useState({ correct: 0, wrong: 0 })
  const [practiceMessageIndex, setPracticeMessageIndex] = useState(null)
  const toggleStep = (i) => {
    setOpenSteps(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  const [streamError, setStreamError] = useState(null)  // { type, lastQuestion } | null
  const [isOffline, setIsOffline]     = useState(false)

  // ── Adaptive inline practice loop ──────────────────────────────────────────
  // inlinePractice: null | { concept, difficulty, q1, q2, q3 }
  const [inlinePractice, setInlinePractice] = useState(null)
  // Session memory: concept → { attempts, wrong, weight }
  // Never shown to student; used to pick the next concept silently.
  const sessionMemoryRef = useRef({})

  const bottomRef          = useRef(null)
  const textareaRef        = useRef(null)   // kept for compat; editor uses editorRef
  const editorRef          = useRef(null)   // contenteditable div
  const savedRangeRef      = useRef(null)   // last saved selection range
  const sendMessageRef     = useRef(null)   // stable ref to sendMessage (avoids stale closure)
  const messagesRef        = useRef(null)
  const abortControllerRef  = useRef(null)
  const tokenTimeoutRef     = useRef(null)
  const abortReasonRef      = useRef(null)
  const lastQuestionRef     = useRef(null)
  // Throttle streaming re-renders to one per animation frame (~60fps max).
  // Without this, fast models emit 30-50 tokens/s, each triggering a full
  // parseBlocks + KaTeX render cycle that backs up the React render queue
  // and makes the browser appear completely frozen.
  const streamRafRef        = useRef(null)
  const pendingStreamRef    = useRef('')

  // Shared retry wrapper: calls /ai-chat/practice-test up to 3 attempts,
  // returning only when we have ≥3 valid questions or all attempts are exhausted.
  const fetchPracticeWithRetry = async (body) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await api.post('/ai-chat/practice-test', body)
        const qs = res.data?.questions || []
        if (qs.length >= 3) return qs
        console.warn(`[PRACTICE] attempt ${attempt}: got ${qs.length} questions, retrying…`)
      } catch (e) {
        console.error(`[PRACTICE] attempt ${attempt} error:`, e)
      }
    }
    return []
  }

  // ── Concept detection (synchronous — no API call) ──────────────────────────
  const detectConcept = (userQuestion, aiSolution) => {
    const t = (userQuestion + ' ' + aiSolution).toLowerCase()
    const mem = sessionMemoryRef.current

    const CONCEPTS = [
      { name: '이차방정식', kw: ['이차방정식', '근의 공식', '판별식', 'ax²', 'ax^2', '이차함수의 근'] },
      { name: '삼각함수',   kw: ['sin', 'cos', 'tan', '삼각함수', '삼각비', '라디안', '호도법'] },
      { name: '미분',       kw: ['미분', '도함수', '극값', '극대', '극소', '접선', "f'(x)", 'f\''] },
      { name: '적분',       kw: ['적분', '부정적분', '정적분', '넓이', '∫'] },
      { name: '수열',       kw: ['수열', '등차수열', '등비수열', '일반항', 'a_n', '귀납법'] },
      { name: '로그',       kw: ['로그', '\\log', 'log', '지수함수', '자연로그', 'ln'] },
      { name: '확률',       kw: ['확률', 'p(a', 'p(b', '경우의 수', '순열', '조합', '여사건', '독립사건'] },
      { name: '벡터',       kw: ['벡터', '내적', '방향벡터', '법선벡터'] },
      { name: '행렬',       kw: ['행렬', '역행렬', '행렬식', '연립방정식'] },
      { name: '함수의 극한', kw: ['극한', 'lim', '연속', '불연속', '발산'] },
      { name: '이차곡선',   kw: ['포물선', '타원', '쌍곡선', '이차곡선', '초점'] },
      { name: '집합',       kw: ['집합', '합집합', '교집합', '부분집합', '여집합'] },
    ]

    // Score each concept: keyword match + session memory boost
    let best = null, bestScore = -1
    for (const c of CONCEPTS) {
      const hits = c.kw.filter(kw => t.includes(kw)).length
      if (hits === 0) continue
      const memWeight = mem[c.name]?.weight || 0
      const score = hits + memWeight * 0.5
      if (score > bestScore) { bestScore = score; best = c.name }
    }
    return best || '수학'
  }

  const detectDifficulty = (aiSolution) => {
    const len = (aiSolution || '').length
    if (len > 2200) return 'hard'
    if (len > 900)  return 'medium'
    return 'easy'
  }

  // Called when student gets a practice question wrong — boosts concept weight
  const recordConceptWrong = (concept) => {
    const mem = sessionMemoryRef.current
    const prev = mem[concept] || { attempts: 0, wrong: 0, weight: 0 }
    mem[concept] = {
      attempts: prev.attempts + 1,
      wrong:    prev.wrong + 1,
      weight:   Math.min(prev.weight + 1.2, 5), // cap at 5
    }
  }

  // Fire-and-forget: fetch a practice question and inject it into the chat.
  // Called right after a solution finishes streaming.
  const triggerInlinePractice = async (userQuestion, aiSolution) => {
    setInlinePractice(null) // clear any previous
    const concept    = detectConcept(userQuestion, aiSolution)
    const difficulty = detectDifficulty(aiSolution)
    try {
      const res = await api.post('/ai-chat/inline-practice', {
        concept,
        difficulty,
        userQuestion:      (userQuestion || '').slice(0, 500),
        aiSolutionSnippet: (aiSolution   || '').slice(0, 600),
        grade:    student?.grade_level || '고1',
        language: 'ko',
      })
      if (res.data?.ok && res.data.q1) {
        setInlinePractice(res.data)
      }
    } catch (e) {
      // Fail silently — practice is non-critical
    }
  }

  const resetPracticeState = () => {
    setPracticeQuestions([])
    setPracticeAnswers({})
    setPracticeRevealed({})
    setPracticeCurrentQ(0)
    setPracticeShowSteps({})
    setPracticeScore({ correct: 0, wrong: 0 })
    setPracticeError(null)
  }

  const generateInsightPractice = async () => {
    const topic = liveWeakTopics[0]?.topic
    if (!topic) return

    setPracticeMessageIndex(-1)
    setPracticeLoading(true)
    resetPracticeState()

    const body = {
      userQuestion: `${topic} 단원 연습 문제를 풀고 싶어요. ${topic} 개념을 연습할 수 있는 문제를 만들어줘.`,
      assistantAnswer: `${topic} 단원에서 자주 틀리고 있어서 집중 연습이 필요합니다. ${topic} 관련 문제를 드리겠습니다.`,
      count: 3,
      language: 'ko',
      grade: student?.grade_level || '고1'
    }
    const questions = await fetchPracticeWithRetry(body)
    if (questions.length >= 3) {
      setPracticeQuestions(questions)
    } else {
      setPracticeError('문제를 불러오지 못했어요. 버튼을 다시 눌러주세요.')
    }
    setPracticeLoading(false)
  }

  const generatePracticeTest = async (msgIndex) => {
    const assistantMsg = messages[msgIndex]
    const userMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user')
    if (!assistantMsg) return

    const questionText = userMsg?.content?.trim() || ''
    const answerText = assistantMsg.content?.trim() || ''
    console.log('[PRACTICE] generatePracticeTest called — i:', msgIndex, '| questionText:', questionText, '| answerText length:', answerText.length, '| current practiceMessageIndex:', practiceMessageIndex)

    console.log('[PRACTICE] checking guard — questionText:', JSON.stringify(questionText), '| length:', questionText.trim().length, '| fails guard?', !questionText || questionText.trim().length < 5)
    if (!questionText || questionText.trim().length < 5) {
      console.error('No original problem context available')
      return
    }

    setPracticeMessageIndex(msgIndex)
    setPracticeLoading(true)
    resetPracticeState()

    const body = {
      userQuestion: questionText,
      assistantAnswer: answerText,
      count: 3,
      language: 'ko',
      grade: student?.grade_level || '고1'
    }
    let questions = []
    try {
      questions = await fetchPracticeWithRetry(body)
      console.log('[PRACTICE] fetch resolved — questions received:', questions.length, '| data:', questions)
    } catch (err) {
      console.error('[PRACTICE] fetch error:', err)
    }
    if (questions.length >= 3) {
      setPracticeQuestions(questions)
    } else {
      setPracticeError('문제를 불러오지 못했어요. 버튼을 다시 눌러주세요.')
    }
    setPracticeLoading(false)
  }


  useEffect(() => {
    setLoading(false)
    setIsStreaming(false)
    setStreamingContent('')
    setStreamError(null)
    if (activeChatId === null) {
      const onboardingGrade = localStorage.getItem('onboarding_grade')
      if (onboardingGrade) {
        const isMiddle = onboardingGrade.startsWith('중')
        const greeting = isMiddle
          ? '중학교 수학 문제를 사진으로 찍어서 올려봐. 아니면 문제를 직접 입력해도 돼!'
          : '수능 수학 문제를 사진으로 찍어서 올려봐. 아니면 개념이 헷갈리는 거 물어봐도 돼!'
        setMessages([{ role: 'assistant', content: greeting }])
        localStorage.removeItem('onboarding_grade')
      } else {
        setMessages([])
      }
    } else if (String(activeChatId).startsWith('local_')) {
      const chat = getChat(activeChatId)
      const hydrated = (chat?.messages || []).map(msg => {
        if (msg.imageBase64 && !msg.imagePreview) {
          return { ...msg, imagePreview: `data:${msg.imageMimeType || 'image/jpeg'};base64,${msg.imageBase64}` }
        }
        return msg
      })
      setMessages(hydrated)
    } else {
      api.get(`/chat-histories/${activeChatId}`)
        .then(r => {
          const hydrated = (r.data.messages || []).map(msg => {
            if (msg.imageBase64 && !msg.imagePreview) {
              return { ...msg, imagePreview: `data:${msg.imageMimeType || 'image/jpeg'};base64,${msg.imageBase64}` }
            }
            return msg
          })
          setMessages(hydrated)
        })
        .catch(() => {})
    }
  }, [activeChatId])

  // Fetch weak topics for insight bar + starter chips
  useEffect(() => {
    if (!student?.id) return;
    api.get(`/analysis/${student.id}`)
      .then(r => {
        const wt = r.data?.weakTopics || [];
        console.log('weakTopics', wt);
        setLiveWeakTopics(wt);
        if (r.data?.totalWrong) setTotalWrong(r.data.totalWrong);
      })
      .catch(() => {})
  }, [student?.id])

  useEffect(() => {
    if (!isStreaming) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, isStreaming])

  useEffect(() => {
    if (isStreaming && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [streamingContent, isStreaming])

  // ── Connection loss detection ──────────────────────────────────────────────
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true)
      // Abort in-flight stream so the catch block can handle recovery
      if (abortControllerRef.current) {
        abortReasonRef.current = 'offline'
        abortControllerRef.current.abort()
      }
    }
    const handleOnline = () => setIsOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(tokenTimeoutRef.current)
      if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [])

  // ── Pick up message typed in the landing page hero chat ────────────────────
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingChatMessage')
    if (!pending) return
    sessionStorage.removeItem('pendingChatMessage')
    const timer = setTimeout(() => sendMessageRef.current?.(pending), 650)
    return () => clearTimeout(timer)
  }, [])

  const autoResize = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }

  // ── Serialize contenteditable → plain string with $latex$ chips ──────────────
  const serializeEditor = useCallback(() => {
    const el = editorRef.current
    if (!el) return input
    let out = ''
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('math-chip')) {
          const latex = node.dataset.latex || ''
          out += `$${latex}$`
        } else {
          // br or other inline — treat as newline/space
          out += node.tagName === 'BR' ? '\n' : node.textContent
        }
      }
    })
    return out.trim()
  }, [input])

  // ── Save selection before focus leaves editor ──────────────────────────────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const el = editorRef.current
      if (el && el.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }
  }, [])

  // ── Restore saved selection ─────────────────────────────────────────────────
  const restoreSelection = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
  }, [])

  // ── Sync contenteditable → input state ─────────────────────────────────────
  const syncInput = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    let out = ''
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('math-chip')) {
          // Prefer live math-field value over dataset (stays current while typing)
          const mf = node.querySelector('math-field')
          const latex = (mf?.value) || node.dataset.latex || ''
          out += `$${latex}$`
        } else {
          out += node.tagName === 'BR' ? '\n' : node.textContent
        }
      }
    })
    setInput(out)
  }, [])

  // ── Load mathlive on mount so chips are ready immediately ────────────────────
  useEffect(() => { import('mathlive').catch(() => {}) }, [])

  // ── Insert a live math-field chip at the saved/current cursor ────────────────
  const insertChipAtCursor = useCallback((latex) => {
    const el = editorRef.current
    if (!el) return

    // ── Case 1: cursor is inside a chip's math-field → insert into it ────────
    const active = document.activeElement
    if (active?.tagName === 'MATH-FIELD') {
      const activeChip = active.closest?.('.math-chip')
      if (activeChip && el.contains(activeChip)) {
        active.executeCommand(['insert', latex, { selectionMode: 'placeholder' }])
        activeChip.dataset.latex = active.value || ''
        syncInput()
        return
      }
    }

    // ── Case 2: cursor immediately after a chip in the parent → insert into it ─
    const sel = window.getSelection()
    if (sel?.rangeCount > 0) {
      const { anchorNode, anchorOffset } = sel
      let adjChip = null
      if (anchorNode?.nodeType === Node.TEXT_NODE && anchorOffset === 0) {
        const prev = anchorNode.previousSibling
        if (prev?.classList?.contains('math-chip')) adjChip = prev
      }
      if (!adjChip && anchorNode === el && anchorOffset > 0) {
        const prev = el.childNodes[anchorOffset - 1]
        if (prev?.classList?.contains('math-chip')) adjChip = prev
      }
      if (adjChip) {
        const adjMf = adjChip.querySelector('math-field')
        if (adjMf) {
          adjMf.focus()
          adjMf.executeCommand('moveToMathfieldEnd')
          adjMf.executeCommand(['insert', latex, { selectionMode: 'placeholder' }])
          adjChip.dataset.latex = adjMf.value || ''
          syncInput()
          return
        }
      }
    }

    // ── Case 3: create a new chip ─────────────────────────────────────────────
    const { chip, mf } = makeChip(latex, syncInput, el)

    restoreSelection()
    const sel2 = window.getSelection()
    if (sel2?.rangeCount > 0) {
      const range = sel2.getRangeAt(0)
      if (el.contains(range.commonAncestorContainer) || range.commonAncestorContainer === el) {
        range.deleteContents()
        range.insertNode(chip)
      } else {
        el.appendChild(chip)
      }
    } else {
      el.appendChild(chip)
    }

    syncInput()

    requestAnimationFrame(() => {
      mf.focus()
      mf.executeCommand(['insert', latex, { selectionMode: 'placeholder', insertionMode: 'replaceAll' }])
      chip.dataset.latex = mf.value || latex
      syncInput()
    })
  }, [restoreSelection, syncInput])

  // Inserts plain text at the textarea cursor position (legacy, kept for compat)
  const handleMathInsert = useCallback((text) => {
    const ta = textareaRef.current
    if (!ta) { setInput(prev => prev + text); return }
    const start = ta.selectionStart ?? ta.value.length
    const end   = ta.selectionEnd   ?? ta.value.length
    const next  = ta.value.slice(0, start) + text + ta.value.slice(end)
    setInput(next)
    const cursor = start + text.length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(cursor, cursor) })
  }, [])

  const starters = React.useMemo(() => {
    const grade = student?.grade_level || '고1'
    const list = []

    if (liveWeakTopics.length > 0) {
      list.push({ text: `내 약점인 ${liveWeakTopics[0].topic} 개념 설명해줘`, Icon: AlertCircle, tag: '개인화' })
    }
    if (recentWrong.length > 0) {
      list.push({ text: '오늘 틀린 문제 분석해줘', Icon: BookOpen, tag: '개인화' })
    }
    if (liveWeakTopics.length > 1) {
      list.push({ text: `수능에서 자주 나오는 ${liveWeakTopics[1].topic} 유형 알려줘`, Icon: HelpCircle, tag: '수능' })
    }
    list.push({ text: `문제 하나 내줘 — 내 수준에 맞게`, Icon: Lightbulb })

    const defaults = [
      { text: '이 문제 풀어줘', Icon: HelpCircle },
      { text: `${grade} 수학 핵심 개념 정리해줘`, Icon: BookOpen },
      { text: '이 개념 쉽게 설명해줘', Icon: Lightbulb },
    ]
    for (const d of defaults) {
      if (list.length >= 4) break
      if (!list.some(s => s.text === d.text)) list.push(d)
    }
    return list.slice(0, 4)
  }, [liveWeakTopics, recentWrong, student])

  const buildStarterText = (text) => {
    if (text.includes('오늘 틀린 문제') && recentWrong.length > 0) {
      const w = recentWrong[0]
      return `최근에 ${w.topic} 단원에서 틀린 문제를 분석해주세요: ${w.question_latex}`
    }
    return text
  }

  // ── Inner stream runner (called by sendMessage; retried silently once) ──────
  // NOT wrapped in useCallback — doing so would capture stale state values
  // (activeChatId, student, liveWeakTopics) in the closure for the duration
  // of a long stream, causing incorrect saves. A plain async function always
  // reads the values that were current when sendMessage was invoked.
  const runStream = async (next, history, msgText, attempt) => {
    // Cancel any previous in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    abortReasonRef.current = null

    let accumulated = ''

    // Hard 120-second total limit — fires regardless of keep-alive traffic
    const hardTimeoutId = setTimeout(() => {
      abortReasonRef.current = 'timeout'
      controller.abort()
    }, 120000)

    try {
      const token = api.defaults.headers.common['Authorization'] || ''
      const response = await fetch('/api/ai-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({
          messages: history,
          grade: student?.grade_level,
          weakTopics: liveWeakTopics.slice(0, 3),
          language: 'ko'
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorBody = {}
        try { errorBody = await response.json() } catch (_) {}
        console.error('[AI API Error]', response.status, errorBody)
        throw new Error(errorBody.error?.message || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let firstChunk = true

      // Stall detection: abort if no new tokens arrive for 10 seconds.
      // Server keep-alive comments (": keep-alive") reset the timer without
      // contributing to content, so only genuine silence triggers the timeout.
      const resetTokenTimeout = () => {
        clearTimeout(tokenTimeoutRef.current)
        tokenTimeoutRef.current = setTimeout(() => {
          abortReasonRef.current = 'timeout'
          controller.abort()
        }, 20000)
      }
      resetTokenTimeout()

      while (true) {
        const { done, value } = await reader.read()
        if (done) { clearTimeout(tokenTimeoutRef.current); break }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (line.startsWith(': ')) { resetTokenTimeout(); continue } // keep-alive
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.chunk) {
              if (firstChunk) {
                // Diagnostic: log raw content of first chunk to confirm
                // whether the AI is sending newlines at the source.
                console.log('[stream] raw first chunk:', JSON.stringify(parsed.chunk.slice(0, 500)))
                setLoading(false)
                setIsStreaming(true)
                firstChunk = false
              }
              accumulated += parsed.chunk
              resetTokenTimeout()

              // Ensure equations get spacing as each token arrives,
              // before the postprocessor in parseBlocks sees the text.
              // These three patterns are the most common ways the AI
              // places $$ directly against Korean text with no separation.
              accumulated = accumulated
                .replace(/(\$\$[^$\n]+\$\$)/g, '\n\n$1\n\n')
                .replace(/([가-힣])(\$)/g, '$1\n\n$2')
                .replace(/(\$)([가-힣])/g, '$1\n\n$2')
                .replace(/\n{3,}/g, '\n\n')

              // Throttle UI updates to one per animation frame.
              // Every token still lands in `accumulated` immediately for
              // correct final content — only the render is deferred.
              pendingStreamRef.current = accumulated
              if (!streamRafRef.current) {
                streamRafRef.current = requestAnimationFrame(() => {
                  streamRafRef.current = null
                  setStreamingContent(pendingStreamRef.current)
                })
              }
            }
          } catch (e) {
            if (e.message && !e.message.startsWith('JSON')) throw e
          }
        }
      }

      // ── Clean completion ──────────────────────────────────────────────────
      // Cancel any pending RAF — we're about to commit the full final content
      if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
      setIsStreaming(false)

      // Detect if the response was cut off before a natural ending
      const completedContent = accumulated.trim()
      const isIncomplete = completedContent.length > 200 &&
        !/[.?!。]$|\[\/ANSWER\]$|괜찮아\?$|됐어\?$|헷갈렸어\?$/.test(completedContent)
      if (isIncomplete) {
        setStreamError({ type: 'incomplete', lastQuestion: msgText, hasPartial: false })
      }

      setStreamingContent('')
      setFadeInLast(true)
      setTimeout(() => setFadeInLast(false), 600)
      if (accumulated) {
        const finalContent = accumulated.trim()
        const finalMessages = [...next, { role: 'assistant', content: finalContent }]
        setMessages(finalMessages)

        // ── Adaptive inline practice ─────────────────────────────────────────
        // Identify the student's question (the last user message before this response)
        const lastUserMsg = [...next].reverse().find(m => m.role === 'user')
        // Fire in background — question will appear when API responds (typically 1-2s)
        triggerInlinePractice(lastUserMsg?.content || '', finalContent)

        const toSave = finalMessages.map(m => ({
          role: m.role,
          content: m.content,
          imageBase64: m.imageBase64,
          imageMimeType: m.imageMimeType,
        }))

        if (!activeChatId) {
          const firstUser = next.find(m => m.role === 'user')
          const rawText = firstUser?.content?.trim()
          const hasImage = !!firstUser?.imageBase64
          let title = (rawText && rawText !== '(이미지)') ? rawText.slice(0, 15) : '수학 문제'
          try {
            const titleRes = await api.post('/ai-chat/generate-title', hasImage
              ? { imageBase64: firstUser.imageBase64, imageMimeType: firstUser.imageMimeType }
              : { text: rawText })
            if (titleRes.data?.title) title = titleRes.data.title
          } catch {}

          const localId = newChatId()
          saveChat(localId, title, toSave)
          setActiveChatId(localId)
          setChats(prev => [{ id: localId, title, updated_at: new Date().toISOString() }, ...prev])
          // Best-effort server backup for logged-in users
          if (student) {
            api.post('/chat-histories', { title, messages: toSave }).catch(() => {})
          }
        } else {
          const existing = getChat(activeChatId)
          saveChat(activeChatId, existing?.title || '수학 문제', toSave)
          setChats(prev => prev.map(c =>
            c.id === activeChatId ? { ...c, updated_at: new Date().toISOString() } : c
          ))
          // Update server for logged-in users with server-side IDs
          if (student && !String(activeChatId).startsWith('local_')) {
            api.put(`/chat-histories/${activeChatId}`, { messages: toSave }).catch(() => {})
          }
        }
      }

    } catch (err) {
      clearTimeout(tokenTimeoutRef.current)
      if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
      console.error('[Stream failed]', err.message)

      // Deliberate user-initiated abort (clearChat / new message) — silent
      if (err.name === 'AbortError' && abortReasonRef.current === null) return

      // Stop button pressed — keep whatever was streamed, no error banner
      if (err.name === 'AbortError' && abortReasonRef.current === 'user') {
        setLoading(false)
        setIsStreaming(false)
        const partial = accumulated.trim()
        if (partial) {
          setStreamingContent('')
          setMessages(prev => [...prev, { role: 'assistant', content: stripDanglingMarkdown(partial) }])
        } else {
          setStreamingContent('')
        }
        return
      }

      const isOfflineErr = abortReasonRef.current === 'offline' || !navigator.onLine
      const isTimeout    = abortReasonRef.current === 'timeout'
      const hasPartial   = accumulated.trim().length > 0

      // ── Silent auto-retry on first clean failure ──────────────────────────
      // Don't retry: offline errors (no connection), or if partial content
      // was already streamed (retrying would duplicate content and confuse).
      if (attempt === 0 && !isOfflineErr && !hasPartial) {
        console.warn('[stream] attempt 0 failed, silently retrying…', err.message)
        // Keep the loading indicator up — student sees nothing wrong yet
        await new Promise(r => setTimeout(r, 800))
        // Check the abort wasn't triggered by the user in the meantime
        if (abortReasonRef.current === null) {
          setLoading(true)
          setIsStreaming(false)
          await runStream(next, history, msgText, 1)
          return
        }
      }

      // ── Show error state ──────────────────────────────────────────────────
      setLoading(false)
      setIsStreaming(false)
      setStreamingContent('')

      if (hasPartial) {
        // Preserve whatever was streamed; strip dangling markdown artifacts
        const cleaned = stripDanglingMarkdown(accumulated.trim())
        const finalContent = cleaned
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: finalContent, _partialError: true },
        ])
        setStreamError({
          type: isOfflineErr ? 'offline' : isTimeout ? 'timeout' : 'partial',
          lastQuestion: msgText,
          hasPartial: true,
        })
      } else {
        setStreamError({
          type: isOfflineErr ? 'offline' : isTimeout ? 'timeout' : 'network',
          lastQuestion: msgText,
          hasPartial: false,
        })
      }
    } finally {
      clearTimeout(hardTimeoutId)
    }
  }

  const sendMessage = async (text) => {
    const msgText = text !== undefined ? text : serializeEditor()
    if (!msgText && !pendingImage) return

    // Store for retry
    lastQuestionRef.current = { text: msgText, image: pendingImage }

    const userMsg = {
      role: 'user',
      content: msgText || '(이미지)',
      ...(pendingImage ? {
        imageBase64: pendingImage.base64,
        imageMimeType: pendingImage.mimeType,
        imagePreview: pendingImage.preview
      } : {})
    }

    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    if (editorRef.current) editorRef.current.innerHTML = ''
    savedRangeRef.current = null
    setShowKeyboard(false)
    setPendingImage(null)
    setInlinePractice(null) // clear practice loop when student asks a new question
    setLoading(true)
    setStreamingContent('')
    setIsStreaming(false)
    setStreamError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const history = next.slice(-MAX_SEND).map(m => ({
      role: m.role,
      content: m.content,
      imageBase64: m.imageBase64,
      imageMimeType: m.imageMimeType,
    }))

    await runStream(next, history, msgText, 0)
  }
  // Stable ref so the textarea keydown handler always calls the latest sendMessage
  sendMessageRef.current = sendMessage

  const retryLastQuestion = () => {
    const last = lastQuestionRef.current
    if (!last) return
    setStreamError(null)
    // Remove the last assistant message if it was a partial (to avoid duplicate)
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1]
      return (lastMsg?.role === 'assistant' && lastMsg?._partialError) ? prev.slice(0, -1) : prev
    })
    if (last.image) setPendingImage(last.image)
    sendMessage(last.text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleStop = () => {
    abortReasonRef.current = 'user'
    abortControllerRef.current?.abort()
  }

  const clearChat = () => {
    // Abort any in-flight stream cleanly (abortReason stays null → catch will bail silently)
    if (abortControllerRef.current) abortControllerRef.current.abort()
    clearTimeout(tokenTimeoutRef.current)
    if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null }
    setMessages([])
    setPendingImage(null)
    setInput('')
    setLoading(false)
    setIsStreaming(false)
    setStreamingContent('')
    setStreamError(null)
    if (activeChatId !== null) setActiveChatId(null)
  }

  const processImageFile = async (file) => {
    if (!file) return
    const { base64, mimeType } = await resizeImage(file)
    setPendingImage({ base64, mimeType, preview: URL.createObjectURL(file) })
  }

  const isEmpty = messages.length === 0 && !isStreaming
  const sidebarLeft = sidebarCollapsed ? 0 : 240

  const inputControls = (maxWidth) => (
    <div style={{ maxWidth, margin: '0 auto' }}>
      {/* Section 1 — Drop zone */}
      <ImageDropZone
        onFile={processImageFile}
        pendingImage={pendingImage}
        onClear={() => setPendingImage(null)}
        disabled={loading || isStreaming}
      />

      {/* Section 2 — Input card */}
      <div className="ia-card2">
        {/* Contenteditable input — supports Korean text + inline math chips */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="ce-input"
          data-placeholder="수학 문제나 궁금한 개념을 물어보세요..."
          onInput={syncInput}
          onBlur={saveSelection}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }

            // Backspace: delete preceding chip when cursor is immediately after one
            if (e.key === 'Backspace') {
              const sel = window.getSelection()
              if (sel?.rangeCount > 0 && sel.isCollapsed) {
                const { anchorNode, anchorOffset } = sel
                let chipToDelete = null
                // cursor at start of a text node whose previous sibling is a chip
                if (anchorNode?.nodeType === Node.TEXT_NODE && anchorOffset === 0) {
                  const prev = anchorNode.previousSibling
                  if (prev?.classList?.contains('math-chip')) chipToDelete = prev
                }
                // cursor at position N in editor and child N-1 is a chip
                if (!chipToDelete && anchorNode === editorRef.current && anchorOffset > 0) {
                  const prev = anchorNode.childNodes[anchorOffset - 1]
                  if (prev?.classList?.contains('math-chip')) chipToDelete = prev
                }
                if (chipToDelete) {
                  e.preventDefault()
                  chipToDelete.remove()
                  syncInput()
                }
              }
            }

            // Delete: delete following chip when cursor is immediately before one
            if (e.key === 'Delete') {
              const sel = window.getSelection()
              if (sel?.rangeCount > 0 && sel.isCollapsed) {
                const { anchorNode, anchorOffset } = sel
                let chipToDelete = null
                if (anchorNode?.nodeType === Node.TEXT_NODE && anchorOffset === anchorNode.textContent.length) {
                  const next = anchorNode.nextSibling
                  if (next?.classList?.contains('math-chip')) chipToDelete = next
                }
                if (!chipToDelete && anchorNode === editorRef.current) {
                  const next = anchorNode.childNodes[anchorOffset]
                  if (next?.classList?.contains('math-chip')) chipToDelete = next
                }
                if (chipToDelete) {
                  e.preventDefault()
                  chipToDelete.remove()
                  syncInput()
                }
              }
            }
          }}
          style={{ minHeight: 24, maxHeight: 140, overflowY: 'auto' }}
        />

        {/* Bottom row: pills left, send right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Calculator icon pill */}
          <button className="ia-pill-icon" title="계산기" style={{ border: '1px solid #e5e7eb', background: '#fff' }} onClick={() => setShowCalc(v => !v)}>
            <Calculator size={16} strokeWidth={1.8} />
          </button>

          {/* Math Input pill */}
          <button
            onClick={() => setShowKeyboard(v => !v)}
            className={`ia-pill${showKeyboard ? ' ia-pill-active' : ''}`}
          >
            <span style={{ fontFamily: 'serif', fontSize: 15, lineHeight: 1 }}>Σ</span>
            Math Input
            {showKeyboard ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>

          {/* Send button — right */}
          <div style={{ marginLeft: 'auto' }}>
            {isStreaming ? (
              <button
                onClick={handleStop}
                style={{ width: 38, height: 38, borderRadius: '50%', background: '#1f2937', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <div style={{ width: 12, height: 12, background: '#fff', borderRadius: 2 }} />
              </button>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={loading || (!input.trim() && !pendingImage)}
                className={`ia-send${!loading && (input.trim() || pendingImage) ? ' ia-send-ready' : ''}`}
                style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, background: !loading && (input.trim() || pendingImage) ? undefined : '#e5e7eb', color: '#fff', cursor: !loading && (input.trim() || pendingImage) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ia-hint">Enter로 전송 · 이미지 첨부 가능</div>
    </div>
  )

  const practiceQ = practiceQuestions[practiceCurrentQ]
  const practiceSelected = practiceAnswers[practiceCurrentQ]
  const practiceRevealing = practiceRevealed[practiceCurrentQ]
  const practiceStepsVisible = practiceShowSteps[practiceCurrentQ]
  const practiceTotal = practiceQuestions.length

  return (
    <div autoComplete="off" data-form-type="other" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }} onSubmit={e => e.preventDefault()}>
      <input type="text" style={{ display: 'none' }} autoComplete="off" readOnly />
      <style>{STYLES}</style>

      {showCalc && <KoreanCalculator onClose={() => setShowCalc(false)} />}

      {/* Offline banner */}
      {isOffline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#1f2937', color: '#f9fafb',
          padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontSize: 13, fontWeight: 500,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          인터넷 연결이 끊겼어. 연결이 복구되면 자동으로 다시 사용할 수 있어.
          {streamError?.type === 'offline' && lastQuestionRef.current && (
            <button
              onClick={() => { if (navigator.onLine) retryLastQuestion() }}
              style={{
                padding: '4px 12px', borderRadius: 6, border: '1px solid #4b5563',
                background: '#374151', color: '#f9fafb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              연결되면 다시 시도
            </button>
          )}
        </div>
      )}

      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          title="사이드바 열기"
          style={{
            position: 'fixed', top: 14, left: 14, zIndex: 900,
            width: 32, height: 32, borderRadius: 6,
            background: '#fff', border: '1px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#374151',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            transition: 'background 0.15s ease',
          }}
          onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseOut={e => e.currentTarget.style.background = '#fff'}
        >
          <PanelLeftOpen size={16} strokeWidth={1.75} />
        </button>
      )}

      {isEmpty ? (
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 24px 32px', boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <SigmaLogo />
            <h2 style={{ fontSize: 52, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              수학이에게 물어보세요
            </h2>
          </div>
          <p style={{ color: GREY, fontSize: 14, marginBottom: 28, textAlign: 'center', lineHeight: 1.6 }}>
            수학 문제 풀이, 개념 설명, 사진 전송 모두 가능해요!
          </p>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', width: '100%', position: 'relative' }}>
            {showKeyboard && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 10px)',
                left: '50%', transform: 'translateX(-50%)',
                width: '100%', maxWidth: 860, zIndex: 201,
              }}>
                <MathKeyboard onInsertChip={insertChipAtCursor} />
              </div>
            )}
            <div className="ia-outer" style={{ padding: '0 24px' }}>
              {inputControls('100%')}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Chat column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div className="chat-active">
            <ConversationSummary messages={messages} />
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              ref={messagesRef}
              className="chat-messages"
              style={{ paddingBottom: 140 }}
            >
              <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px', width: '100%' }}>

                {messages.map((msg, i) => {
                  const isFading = fadeInLast && i === messages.length - 1

                  if (msg.role === 'assistant') {
                    const { clean: clean1, graphs, diagrams } = extractGraphs(msg.content)
                    const { main, followUp } = extractFollowUp(clean1)
                    return (
                      <div key={i} className={isFading ? 'rendered-bubble-reveal' : ''} style={{ marginBottom: 20 }}>
                        <div className="chat-msg" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: '#2563EB', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', marginTop: 2
                          }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'serif', lineHeight: 1 }}>Σ</span>
                          </div>
                          <div style={{ maxWidth: 820, flex: 1, fontSize: 16, lineHeight: 1.8, position: 'relative' }}>
                            {diagrams.map((d, di) => (
                              <div key={di} style={{ margin: '16px 0', textAlign: 'center' }}>
                                <div dangerouslySetInnerHTML={{ __html: d.svg }} style={{ display: 'inline-block', maxWidth: '100%', borderRadius: 12, overflow: 'hidden' }} />
                                {d.caption && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{d.caption}</div>}
                              </div>
                            ))}
                            <AutoDiagram text={main} graphs={graphs} />
                            <SolutionRenderer text={main} />
                            {graphs.map((g, gi) => (
                              g.kind === 'equations'
                                ? <GraphComponent key={gi} equations={g.equations} titleHtml={g.title ? renderInline(g.title) : undefined} />
                                : g.kind === 'points'
                                ? <PointsGraph key={gi} points={g.points} titleHtml={g.title ? renderInline(g.title) : undefined} type={g.type} />
                                : <FunctionGraph key={gi} func={g.func} xMin={g.xMin ?? -5} xMax={g.xMax ?? 5} label={g.label} />
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, marginBottom: 4 }}>
                              {liveWeakTopics.length > 0 && (
                                <>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>분석</span>
                                  <span style={{ fontSize: '0.82rem', color: '#555', fontStyle: 'italic', marginLeft: 8 }}>
                                    {liveWeakTopics[0].topic}에서 자주 틀리고 있어 (최근 {totalWrong}문제 중 {liveWeakTopics[0].count}개)
                                  </span>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginLeft: 20 }}>연습</span>
                                </>
                              )}
                              <button
                                onClick={() => generatePracticeTest(i)}
                                style={{
                                  border: '1px solid #4F7EFF', color: '#4F7EFF', background: '#fff',
                                  borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem',
                                  marginLeft: liveWeakTopics.length > 0 ? 8 : 0, cursor: 'pointer', lineHeight: 1.6
                                }}
                              >
                                비슷한 문제 3개 풀기
                              </button>
                            </div>
                          </div>
                        </div>
                        {followUp && (
                          <div className="chat-msg" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8, paddingLeft: 42 }}>
                            <div style={{
                              maxWidth: '84%', background: '#EFF6FF', border: '1.5px solid #93C5FD',
                              borderRadius: '8px 18px 18px 8px', padding: '12px 16px',
                              fontSize: 14, lineHeight: 1.6, color: '#1E40AF', fontStyle: 'italic'
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: '#2563EB', letterSpacing: 0.8, marginBottom: 5, fontStyle: 'normal', textTransform: 'uppercase' }}>
                                확인 질문
                              </div>
                              <Inline text={followUp} />
                            </div>
                          </div>
                        )}
                        {msg._partialError && i === messages.length - 1 && streamError && (
                          <div style={{ paddingLeft: 44, marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>— 응답이 중간에 끊겼어</span>
                            <button
                              onClick={retryLastQuestion}
                              style={{
                                padding: '3px 10px', borderRadius: 6, border: '1px solid #D1D5DB',
                                background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              이어서 받기
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div key={i} className="chat-msg" style={{
                      display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-start',
                      gap: 10, marginBottom: 16
                    }}>
                      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        {(() => {
                          const imageSrc = msg.imagePreview || (msg.imageBase64 && (msg.imageBase64.startsWith('data:')
                            ? msg.imageBase64
                            : `data:${msg.imageMimeType || 'image/jpeg'};base64,${msg.imageBase64}`
                          ))
                          return (
                            <>
                              {imageSrc && (
                                <img
                                  src={imageSrc}
                                  alt="내 이미지"
                                  style={{ width: '100%', borderRadius: 14, objectFit: 'cover', maxHeight: 260, marginBottom: 14 }}
                                />
                              )}
                              {msg.content && msg.content !== '(이미지)' && (
                                <div style={{
                                  background: '#F3F4F6', color: '#111827',
                                  borderRadius: '18px 18px 4px 18px', padding: '13px 18px',
                                  fontSize: 16, lineHeight: 1.7, boxShadow: 'var(--shadow)',
                                  whiteSpace: 'pre-wrap', overflow: 'hidden'
                                }}>
                                  {msg.content}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}

                {(loading || isStreaming) && (
                  <div className="chat-msg" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: '#2563EB', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', marginTop: 2
                    }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'serif', lineHeight: 1 }}>Σ</span>
                    </div>
                    <div style={{ maxWidth: 820, flex: 1, fontSize: 16, lineHeight: 1.8, position: 'relative' }}>
                      {loading && !streamingContent && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                          <span style={{
                            fontSize: 15,
                            fontWeight: 400,
                            color: 'transparent',
                            background: 'linear-gradient(90deg, #9ca3af 0%, #111827 40%, #9ca3af 80%)',
                            backgroundSize: '300% auto',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            animation: 'thinking 2.5s ease-in-out infinite',
                            letterSpacing: '0.01em',
                          }}>
                            생각 중...
                          </span>
                        </div>
                      )}
                      {streamingContent && (() => {
                        const safeText = stripOpenTags(streamingContent)
                        const { clean, graphs, diagrams } = extractGraphs(safeText)
                        const { main: rawMain } = extractFollowUp(clean)
                        const main = rawMain
                        return (
                          <>
                            {diagrams.map((d, di) => (
                              <div key={di} style={{ margin: '16px 0', textAlign: 'center' }}>
                                <div dangerouslySetInnerHTML={{ __html: d.svg }} style={{ display: 'inline-block', maxWidth: '100%', borderRadius: 12, overflow: 'hidden' }} />
                                {d.caption && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{d.caption}</div>}
                              </div>
                            ))}
                            <SolutionRenderer text={main} />
                            {graphs.map((g, gi) => (
                              g.kind === 'equations'
                                ? <GraphComponent key={gi} equations={g.equations} titleHtml={g.title ? renderInline(g.title) : undefined} />
                                : g.kind === 'points'
                                ? <PointsGraph key={gi} points={g.points} titleHtml={g.title ? renderInline(g.title) : undefined} type={g.type} />
                                : <FunctionGraph key={gi} func={g.func} xMin={g.xMin ?? -5} xMax={g.xMax ?? 5} label={g.label} />
                            ))}
                          </>
                        )
                      })()}
                      {isStreaming && (
                        <span style={{
                          display: 'inline-block', width: 2, height: '1em',
                          background: '#2563EB', marginLeft: 2,
                          animation: 'blink 1s step-end infinite',
                          verticalAlign: 'text-bottom'
                        }} />
                      )}
                    </div>
                  </div>
                )}

                {/* Stream error / partial recovery UI */}
                {streamError && !loading && !isStreaming && (() => {
                  const msgs = {
                    network:    '응답을 불러오는 중 문제가 생겼어. 다시 시도해볼게.',
                    timeout:    '응답이 너무 오래 걸려서 중단됐어. 다시 시도해줄래?',
                    offline:    '인터넷 연결이 끊겼어. 연결이 복구되면 다시 시도해봐.',
                    partial:    '응답 중간에 연결이 끊겼어. 지금까지의 풀이는 저장됐으니까, 이어서 보고 싶으면 다시 시도해봐.',
                    incomplete: '풀이가 완성되지 않은 것 같아. 이어서 받을 수 있어.',
                  }
                  const msg = msgs[streamError.type] || msgs.network
                  const isIncomplete = streamError.type === 'incomplete'
                  return (
                    <div className="chat-msg" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: '#9CA3AF', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', marginTop: 2
                      }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'serif', lineHeight: 1 }}>Σ</span>
                      </div>
                      <div style={{
                        maxWidth: 480, background: '#F9FAFB',
                        border: '1px solid #E5E7EB', borderRadius: '4px 16px 16px 16px',
                        padding: '12px 16px',
                      }}>
                        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 10 }}>{msg}</div>
                        {isIncomplete && (
                          <button
                            onClick={() => { setStreamError(null); sendMessage('이어서 풀어줘') }}
                            style={{
                              padding: '6px 14px', borderRadius: 8, border: 'none',
                              background: '#2563EB', color: '#fff',
                              fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            이어서 풀기
                          </button>
                        )}
                        {!isIncomplete && streamError.type !== 'offline' && (
                          <button
                            onClick={retryLastQuestion}
                            style={{
                              padding: '6px 14px', borderRadius: 8, border: 'none',
                              background: '#2563EB', color: '#fff',
                              fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            다시 시도
                          </button>
                        )}
                        {streamError.type === 'offline' && (
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                            연결이 복구되면 아래 입력창에 질문을 다시 보내줘.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── Adaptive inline practice loop ── */}
                {inlinePractice && !loading && !isStreaming && (
                  <div style={{ maxWidth: 820, margin: '0 auto 16px', padding: '0 24px' }}>
                    <InlinePractice
                      practice={inlinePractice}
                      onConceptWrong={recordConceptWrong}
                      onDismiss={() => setInlinePractice(null)}
                    />
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>
            </div>
          </div>

          <div style={{
            position: 'sticky', bottom: 0,
            zIndex: 200, background: 'transparent',
            borderTop: 'none',
          }}>
            {/* Floating math keyboard — absolute above input, never shifts layout */}
            {showKeyboard && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 10px)',
                left: '50%', transform: 'translateX(-50%)',
                width: '100%', maxWidth: 860, zIndex: 201,
              }}>
                <MathKeyboard onInsertChip={insertChipAtCursor} />
              </div>
            )}
            <div className="ia-outer" style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px', width: '100%' }}>
              {inputControls(860)}
            </div>
          </div>
          </div>{/* end chat column */}

          {/* Practice split-screen column */}
          {practiceMessageIndex !== null && (
            <div style={{
              flex: 1, minWidth: 0,
              borderLeft: '1px solid #E5E7EB',
              display: 'flex', flexDirection: 'column',
              overflowY: 'auto',
              background: '#fff',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', borderBottom: '1px solid #E5E7EB', flexShrink: 0,
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>연습 문제</span>
                <button
                  onClick={() => { setPracticeMessageIndex(null); setPracticeQuestions([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}
                >
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              {practiceError && !practiceLoading ? (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>{practiceError}</div>
                  <button
                    onClick={generateInsightPractice}
                    style={{
                      padding: '8px 20px', borderRadius: 8, border: 'none',
                      background: '#2563EB', color: '#fff', fontSize: 13,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    다시 시도
                  </button>
                </div>
              ) : (
                <PracticePanel
                  questions={practiceQuestions}
                  loading={practiceLoading}
                  onClose={() => { setPracticeMessageIndex(null); setPracticeQuestions([]) }}
                  onWrongAnswer={(data) => api.post('/analysis/wrong-questions', data).catch(() => {})}
                />
              )}
            </div>
          )}


        </div>
      )}

    </div>
  )
}
