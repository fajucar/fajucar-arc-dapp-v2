#!/usr/bin/env node
/**
 * Verificador de variáveis de ambiente Vite
 * 
 * Verifica se as variáveis obrigatórias estão configuradas no .env
 * e se têm formato válido (endereços Ethereum começam com 0x e têm 42 caracteres)
 * 
 * Uso:
 *   node scripts/check-vite-env.mjs
 *   npm run check:env
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

console.log('🔍 Verificando variáveis de ambiente Vite...\n');

// Verificar se arquivo .env existe
if (!existsSync(envPath)) {
  console.log('❌ Arquivo .env não encontrado em:', envPath);
  console.log('\n💡 Execute: npm run env:create');
  process.exit(1);
}

// Ler e parsear arquivo .env
let envContent;
try {
  envContent = readFileSync(envPath, 'utf8');
} catch (error) {
  console.error('❌ Erro ao ler arquivo .env:', error.message);
  process.exit(1);
}

// Parsear linhas KEY=VALUE (ignorar comentários e linhas vazias)
const envVars = {};
const lines = envContent.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  // Ignorar linhas vazias e comentários
  if (!trimmed || trimmed.startsWith('#')) {
    continue;
  }
  
  // Parsear KEY=VALUE
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    envVars[key] = value;
  }
}

// Variáveis obrigatórias para verificar
const requiredVars = [
  {
    key: 'VITE_FAJUCAR_COLLECTION_ADDRESS',
    name: 'Fajucar Collection',
    required: true,
  },
  {
    key: 'VITE_RPC_URL',
    name: 'RPC URL',
    required: false,
  },
  {
    key: 'VITE_CHAIN_ID',
    name: 'Chain ID',
    required: false,
  },
];

console.log('📋 Resultados da verificação:\n');
console.log('─'.repeat(70));

let hasErrors = false;
let hasWarnings = false;

for (const { key, name, required } of requiredVars) {
  const value = envVars[key];
  
  if (!value || value === '') {
    if (required) {
      console.log(`❌ ${key} (${name}): MISSING`);
      hasErrors = true;
    } else {
      console.log(`⚠️  ${key} (${name}): MISSING (opcional)`);
      hasWarnings = true;
    }
    continue;
  }
  
  // Validar formato de endereço Ethereum (se começa com 0x)
  if (value.startsWith('0x')) {
    if (value.length === 42) {
      console.log(`✅ ${key} (${name}): ${value.slice(0, 10)}...${value.slice(-8)}`);
    } else {
      console.log(`❌ ${key} (${name}): INVALID (deve ter 42 caracteres, encontrado: ${value.length})`);
      console.log(`   Valor: ${value}`);
      if (required) {
        hasErrors = true;
      } else {
        hasWarnings = true;
      }
    }
  } else {
    // Não é endereço Ethereum, apenas mostrar o valor
    console.log(`✅ ${key} (${name}): ${value}`);
  }
}

console.log('─'.repeat(70));

// Resultado final
console.log('');
if (hasErrors) {
  console.log('❌ ERROS ENCONTRADOS!');
  console.log('\n💡 Para corrigir:');
  console.log('   1. Execute: npm run env:create');
  console.log('   2. Ou edite manualmente o arquivo .env');
  console.log('   3. Reinicie o servidor Vite (Ctrl+C e npm run dev)');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️  Algumas variáveis opcionais estão faltando (não crítico)');
  console.log('\n✅ Variáveis obrigatórias estão configuradas!');
  process.exit(0);
} else {
  console.log('✅ Todas as variáveis estão configuradas corretamente!');
  console.log('\n💡 Lembre-se:');
  console.log('   - Reinicie o servidor Vite após mudanças no .env');
  console.log('   - O Vite só carrega variáveis quando o servidor é iniciado');
  process.exit(0);
}
