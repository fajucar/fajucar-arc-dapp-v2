import type { CSSProperties } from 'react'

export const TOKEN_BG: Record<string, string> = {
  USDC:   'rgba(78,163,255,0.22)',
  EURC:   'rgba(99,102,241,0.22)',
  FAJU:   'rgba(249,115,22,0.22)',
  ARCX:   'rgba(177,76,255,0.22)',
  QCAD:   'rgba(34,211,238,0.22)',
  cirBTC: 'rgba(247,147,26,0.22)',
}

export const TOKEN_COLOR: Record<string, string> = {
  USDC:   '#4ea3ff',
  EURC:   '#818cf8',
  FAJU:   '#f97316',
  ARCX:   '#b14cff',
  QCAD:   '#22d3ee',
  cirBTC: '#f7931a',
}

export const glassCard: CSSProperties = {
  background:
    'linear-gradient(rgba(15,8,32,0.88), rgba(15,8,32,0.88)) padding-box,' +
    'linear-gradient(135deg, rgba(78,163,255,0.38), rgba(177,76,255,0.38)) border-box',
  border: '1px solid transparent',
  borderRadius: 20,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  padding: 20,
}

export const innerCell: CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(78,163,255,0.12)',
  borderRadius: 12,
  padding: '12px 14px',
}

export const cellLabel: CSSProperties = {
  color: '#475569', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7,
}

export const cellValue: CSSProperties = {
  color: '#f0f4ff', fontSize: 15, fontWeight: 700,
}

export function TokenPairIcons({ sym0, sym1 }: { sym0: string; sym1: string }) {
  const col0 = TOKEN_COLOR[sym0] ?? '#4ea3ff'
  const col1 = TOKEN_COLOR[sym1] ?? '#b14cff'
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: TOKEN_BG[sym0] ?? 'rgba(78,163,255,0.2)',
        border: `2px solid ${col0}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: col0,
        zIndex: 2, position: 'relative',
        boxShadow: `0 0 10px ${col0}35`,
      }}>
        {sym0[0]}
      </div>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: TOKEN_BG[sym1] ?? 'rgba(177,76,255,0.2)',
        border: `2px solid ${col1}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: col1,
        marginLeft: -10, zIndex: 1, position: 'relative',
        boxShadow: `0 0 10px ${col1}35`,
      }}>
        {sym1[0]}
      </div>
    </div>
  )
}
