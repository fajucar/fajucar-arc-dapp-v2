/**
 * Circle Entity Secret Setup
 * Run once: node scripts/circle-setup-entity-secret.mjs
 *
 * This script:
 * 1. Reads CIRCLE_API_KEY from .env
 * 2. Generates a random 32-byte Entity Secret
 * 3. Encrypts and registers it with Circle
 * 4. Appends CIRCLE_ENTITY_SECRET to .env
 */

import { randomBytes, publicEncrypt, constants } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const ENV_FILE = resolve(ROOT, '.env')

// ── 1. Ler API Key do .env ────────────────────────────────────────────────
function readEnv() {
  if (!existsSync(ENV_FILE)) throw new Error('.env não encontrado em ' + ENV_FILE)
  const lines = readFileSync(ENV_FILE, 'utf-8').split('\n')
  const vars = {}
  for (const line of lines) {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
    if (match) vars[match[1]] = match[2].trim()
  }
  return vars
}

const env = readEnv()
// process.env takes priority (set via PowerShell $env:CIRCLE_API_KEY)
const API_KEY = (process.env.CIRCLE_API_KEY || env.CIRCLE_API_KEY || '').trim()

if (!API_KEY || API_KEY.length < 10) {
  console.error('\n❌ CIRCLE_API_KEY não encontrado ou muito curto.')
  console.error('   Valor lido: "' + API_KEY.slice(0, 20) + '..."')
  process.exit(1)
}
console.log('✅ API Key carregada: ' + API_KEY.slice(0, 16) + '...')

console.log('\n🔵 Circle Entity Secret Setup')
console.log('─'.repeat(45))

// ── 2. Verificar se já está configurado ───────────────────────────────────
if (env.CIRCLE_ENTITY_SECRET && env.CIRCLE_ENTITY_SECRET.length === 64) {
  console.log('\n⚠️  CIRCLE_ENTITY_SECRET já existe no .env.')
  console.log('   Se quiser gerar um novo, remova a linha do .env e rode novamente.')
  process.exit(0)
}

// ── 3. Gerar Entity Secret (32 bytes aleatórios) ──────────────────────────
const entitySecret = randomBytes(32).toString('hex')
console.log('\n✅ Entity Secret gerado (guarda em lugar seguro):')
console.log('   ' + entitySecret)

// ── 4. Buscar chave pública do Circle ─────────────────────────────────────
console.log('\n📡 Buscando chave pública do Circle...')

const pkRes = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
})

const pkData = await pkRes.json()

if (!pkRes.ok || !pkData.data?.publicKey) {
  console.error('\n❌ Erro ao buscar chave pública:', JSON.stringify(pkData, null, 2))
  console.error('\n   Verifique se o CIRCLE_API_KEY no .env está correto.')
  process.exit(1)
}

const publicKeyPem = pkData.data.publicKey
console.log('✅ Chave pública obtida.')

// ── 5. Encriptar Entity Secret com RSA-OAEP ───────────────────────────────
const entitySecretBuffer = Buffer.from(entitySecret, 'hex')
const encrypted = publicEncrypt(
  { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  entitySecretBuffer
)
const ciphertext = encrypted.toString('base64')

// ── 6. Registrar no Circle ────────────────────────────────────────────────
console.log('\n📡 Registrando no Circle...')

const regRes = await fetch('https://api.circle.com/v1/w3s/config/entity/secretCiphertext', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ entitySecretCiphertext: ciphertext }),
})

const regData = await regRes.json()

if (!regRes.ok) {
  // 409 = already registered (ok, just use existing secret)
  if (regRes.status === 409) {
    console.log('\n⚠️  Entity Secret já estava registrado no Circle.')
    console.log('   Se você não tem o valor original, será necessário criar um novo projeto.')
  } else {
    console.error('\n❌ Erro ao registrar:', JSON.stringify(regData, null, 2))
    process.exit(1)
  }
} else {
  console.log('✅ Entity Secret registrado com sucesso!')
}

// ── 7. Salvar no .env ─────────────────────────────────────────────────────
let envContent = readFileSync(ENV_FILE, 'utf-8')

// Remove linha existente se houver
envContent = envContent.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, '')

// Adiciona as variáveis Circle no final
const circleBlock = `
# Circle Developer Controlled Wallets
CIRCLE_ENTITY_SECRET=${entitySecret}
CIRCLE_WALLET_SET_ID=
`

if (!envContent.includes('CIRCLE_ENTITY_SECRET')) {
  envContent = envContent.trimEnd() + '\n' + circleBlock
}

writeFileSync(ENV_FILE, envContent, 'utf-8')

console.log('\n✅ CIRCLE_ENTITY_SECRET salvo no .env')
console.log('\n─'.repeat(45))
console.log('🎯 Próximo passo: criar o Wallet Set no Console Circle')
console.log('   Console → Wallets → Wallet Sets → Create')
console.log('   Copie o ID e adicione no .env como CIRCLE_WALLET_SET_ID=...')
console.log('─'.repeat(45) + '\n')
