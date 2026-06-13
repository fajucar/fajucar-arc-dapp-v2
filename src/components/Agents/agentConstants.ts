export type Personality = 'explorer' | 'trader' | 'builder' | 'social'

export type AgentLocalProfile = {
  name: string
  personality: Personality
  imageUrl: string
  /** Endereço EVM externo (MetaMask/Rabby) para saques da embedded wallet */
  withdrawalAddress?: string
}

export const PERSONALITY_OPTIONS: Array<{
  id: Personality
  emoji: string
  label: string
  desc: string
}> = [
  { id: 'explorer', emoji: '🗺️', label: 'Explorer', desc: 'Descobre novos tokens e oportunidades' },
  { id: 'trader',   emoji: '📈', label: 'Trader',   desc: 'Focado em swaps e alertas de preço' },
  { id: 'builder',  emoji: '🏗️', label: 'Builder',  desc: 'Minta NFTs e interage com contratos' },
  { id: 'social',   emoji: '🌐', label: 'Social',   desc: 'Envie pagamentos via redes sociais' },
]

export const CAPABILITIES = [
  { emoji: '💸', title: 'FajuPay',        desc: 'Envie USDC pelo handle social',      active: true  },
  { emoji: '📊', title: 'Portfolio',       desc: 'Resumo de saldo e posições',          active: false },
  { emoji: '🔔', title: 'Alertas',         desc: 'Notificações quando receber USDC',    active: false },
  { emoji: '🔄', title: 'Swap Automático', desc: 'Execute swaps por condição de preço', active: false },
  { emoji: '🌉', title: 'Bridge',          desc: 'Mova USDC entre chains',              active: false },
]

export function loadProfile(address: string): AgentLocalProfile | null {
  try {
    const raw = localStorage.getItem(`agent_${address}`)
    return raw ? (JSON.parse(raw) as AgentLocalProfile) : null
  } catch {
    return null
  }
}

export function saveProfile(address: string, profile: AgentLocalProfile) {
  try {
    localStorage.setItem(`agent_${address}`, JSON.stringify(profile))
  } catch {
    try {
      localStorage.setItem(`agent_${address}`, JSON.stringify({ ...profile, imageUrl: '' }))
    } catch { /* ignore */ }
  }
}

export function defaultAgentName(address: string) {
  return `Agente #${address.slice(-4).toUpperCase()}`
}

export function resizeImageToDataUrl(file: File, maxSize = 300, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.onload = (readerEvent) => {
      const dataUrl = readerEvent.target?.result as string
      if (!dataUrl) { reject(new Error('Arquivo vazio')); return }

      const img = new Image()
      // Se a imagem não carregar no canvas, usa o data URL direto
      img.onerror = () => resolve(dataUrl)
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
          canvas.width = Math.max(1, Math.round(img.width * scale))
          canvas.height = Math.max(1, Math.round(img.height * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(dataUrl); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          resolve(dataUrl) // fallback: retorna original sem redimensionar
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
