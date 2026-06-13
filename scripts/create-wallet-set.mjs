import { randomBytes, publicEncrypt, constants, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = resolve(ROOT, '.env')

function readEnv() {
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf-8').split('\n')
      .map(l => l.match(/^([^#=\s]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map(m => [m[1], m[2].trim()])
  )
}

const env = readEnv()
const API_KEY     = (process.env.CIRCLE_API_KEY     || env.CIRCLE_API_KEY     || '').trim()
const ENTITY_SEC  = (process.env.CIRCLE_ENTITY_SECRET || env.CIRCLE_ENTITY_SECRET || '').trim()

if (!API_KEY)    { console.error('❌ CIRCLE_API_KEY não encontrado'); process.exit(1) }
if (!ENTITY_SEC) { console.error('❌ CIRCLE_ENTITY_SECRET não encontrado no .env'); process.exit(1) }

// 1. Buscar chave pública do Circle
console.log('📡 Buscando chave pública...')
const pkRes = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: { Authorization: `Bearer ${API_KEY}` }
})
const { data: pkData } = await pkRes.json()

// 2. Encriptar entity secret
const encrypted = publicEncrypt(
  { key: pkData.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(ENTITY_SEC, 'hex')
)
const entitySecretCiphertext = encrypted.toString('base64')

// 3. Criar Wallet Set
console.log('📡 Criando Wallet Set...')
const res = await fetch('https://api.circle.com/v1/w3s/developer/walletSets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    idempotencyKey: randomUUID(),
    entitySecretCiphertext,
    name: 'FajuARC Wallets',
  }),
})

const data = await res.json()

if (!res.ok) {
  console.error('❌ Erro:', JSON.stringify(data, null, 2))
  process.exit(1)
}

const walletSetId = data.data?.walletSet?.id
console.log('✅ Wallet Set criado! ID:', walletSetId)

// 4. Salvar no .env
let envContent = readFileSync(ENV_FILE, 'utf-8')
envContent = envContent.replace(/^CIRCLE_WALLET_SET_ID=.*$/m, '').trimEnd()
envContent += '\nCIRCLE_WALLET_SET_ID=' + walletSetId + '\n'
writeFileSync(ENV_FILE, envContent, 'utf-8')
console.log('✅ CIRCLE_WALLET_SET_ID salvo no .env')
