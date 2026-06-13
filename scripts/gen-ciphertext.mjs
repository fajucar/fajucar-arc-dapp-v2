import { randomBytes, publicEncrypt, constants } from 'node:crypto'

const API_KEY = (process.env.CIRCLE_API_KEY || '').trim()

const res = await fetch('https://api.circle.com/v1/w3s/config/entity/publicKey', {
  headers: { Authorization: 'Bearer ' + API_KEY }
})
const { data } = await res.json()

const secret = randomBytes(32).toString('hex')
const enc = publicEncrypt(
  { key: data.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from(secret, 'hex')
)
const cipher = enc.toString('base64')

console.log('ENTITY_SECRET=' + secret)
console.log('---CIPHERTEXT-START---')
console.log(cipher)
console.log('---CIPHERTEXT-END---')
console.log('Tamanho:', cipher.length, 'chars')
