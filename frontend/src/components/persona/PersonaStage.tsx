'use client'

import { useEffect, useRef, useState } from 'react'
import type { PersonaEngine, PersonaId, PersonaState } from './personaEngine'

export type { PersonaId, PersonaState }

export const PERSONA_COLORS: Record<PersonaId, string> = {
  core: '#bfe6ff',
  finance: '#ffc46b',
  code: '#5cf2c8',
  security: '#ff5a5f',
  research: '#b49bff',
  general: '#9fe8ff',
}

const PERSONA_NAMES: Record<PersonaId, string> = {
  core: 'ExpertsFor Core',
  finance: 'Finance Advisor',
  code: 'Code Engineer',
  security: 'Security Specialist',
  research: 'Research Assistant',
  general: 'General Assistant',
}

const STATE_LABEL: Record<PersonaState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

/** Map a ExpertsFor expert card id (or a custom agent) to a persona look. */
export function personaFromExpertId(id?: string | null): PersonaId {
  switch (id) {
    case 'finance':
    case 'code':
    case 'security':
    case 'research':
    case 'general':
      return id
    default:
      return 'core'
  }
}

interface PersonaStageProps {
  persona: PersonaId
  state: PersonaState
  /** Increment to trigger a small nod (e.g. on each keystroke). */
  nodSignal?: number
  className?: string
  showControls?: boolean
  quality?: 'high' | 'low'
}

const FOLLOW_KEY = 'expertsfor_persona_follow'

export default function PersonaStage({ persona, state, nodSignal = 0, className = '', showControls = true, quality = 'high' }: PersonaStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PersonaEngine | null>(null)
  const [follow, setFollow] = useState(true)
  const [failed, setFailed] = useState(false)
  // latest props, so the engine starts on the right persona/state once its async import finishes
  const personaRef = useRef(persona)
  const stateRef = useRef(state)

  // mount the WebGL engine on the client only
  useEffect(() => {
    let cancelled = false
    let saved = true
    try { saved = localStorage.getItem(FOLLOW_KEY) !== '0' } catch { /* storage unavailable */ }
    // localStorage only exists in the browser, so the saved choice is applied after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFollow(saved)
    ;(async () => {
      if (!canvasRef.current || !wrapRef.current) return
      try {
        const { createPersonaEngine } = await import('./personaEngine')
        if (cancelled || !canvasRef.current || !wrapRef.current) return
        const eng = createPersonaEngine(canvasRef.current, wrapRef.current, { headUrl: '/assets/persona/head.json', quality })
        engineRef.current = eng
        eng.setFollow(saved)
        eng.setPersona(personaRef.current, true)
        eng.setState(stateRef.current)
      } catch {
        setFailed(true)
      }
    })()
    return () => { cancelled = true; engineRef.current?.dispose(); engineRef.current = null }
  }, [quality])

  useEffect(() => { personaRef.current = persona; engineRef.current?.setPersona(persona) }, [persona])
  useEffect(() => { stateRef.current = state; engineRef.current?.setState(state) }, [state])
  useEffect(() => { if (nodSignal) engineRef.current?.nod() }, [nodSignal])

  const toggleFollow = () => {
    const next = !follow
    setFollow(next)
    engineRef.current?.setFollow(next)
    try { localStorage.setItem(FOLLOW_KEY, next ? '1' : '0') } catch { /* storage unavailable */ }
  }

  const color = PERSONA_COLORS[persona]

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-2xl bg-[#05060a] ${className}`}
      style={{ boxShadow: `0 0 0 1px ${color}33, 0 18px 50px -24px ${color}88`, transition: 'box-shadow .8s' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`${PERSONA_NAMES[persona]} persona, ${STATE_LABEL[state].toLowerCase()}. Drag to turn it.`}
      />
      {failed && (
        <div className="absolute inset-0 grid place-items-center text-xs text-white/50">3D persona unavailable on this device</div>
      )}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
        <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
          <div className="text-[13px] font-semibold leading-tight" style={{ color, transition: 'color .6s' }}>{PERSONA_NAMES[persona]}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/65">
            <span className={`h-1.5 w-1.5 rounded-full ${state === 'idle' ? '' : 'animate-pulse'}`} style={{ background: color }} />
            {STATE_LABEL[state]}
          </div>
        </div>
      </div>
      {showControls && (
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={follow}
          title="Let the persona follow your cursor"
          className="absolute right-3 top-3 flex min-h-[32px] items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 text-[11px] font-medium text-white/80 backdrop-blur-md transition-colors hover:text-white"
        >
          <span className="relative h-3.5 w-6 rounded-full transition-colors" style={{ background: follow ? color : 'rgba(255,255,255,.2)' }}>
            <span className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform" style={{ left: 2, transform: follow ? 'translateX(10px)' : 'none' }} />
          </span>
          Follow cursor
        </button>
      )}
    </div>
  )
}

/** Small static avatar in the persona's colour, used next to each answer and on cards. */
export function PersonaBadge({ persona, size = 36, active = false }: { persona: PersonaId; size?: number; active?: boolean }) {
  const c = PERSONA_COLORS[persona]
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full ${active ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 50% 38%, ${c}55, #05060a 70%)`, boxShadow: `0 0 0 1.5px ${c}aa, 0 0 14px -2px ${c}` }}
    >
      <svg viewBox="0 0 40 40" width={size * 0.78} height={size * 0.78}>
        <path d="M20 7c-5.6 0-9.5 4.3-9.5 10.2 0 4.2 1.7 7.2 4.2 8.9v3.4c-3.9 1.1-7.2 3.4-8.7 6.5h28c-1.5-3.1-4.8-5.4-8.7-6.5v-3.4c2.5-1.7 4.2-4.7 4.2-8.9C29.5 11.3 25.6 7 20 7z" fill={`${c}22`} stroke={c} strokeWidth="1.2" />
        <circle cx="16.6" cy="17.6" r="1.5" fill="#fff" />
        <circle cx="23.4" cy="17.6" r="1.5" fill="#fff" />
      </svg>
    </span>
  )
}
