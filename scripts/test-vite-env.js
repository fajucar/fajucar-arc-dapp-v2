// Test script to verify Vite can load environment variables
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

console.log('🔍 Testando carregamento de variáveis de ambiente...\n');

// 1. Verificar se arquivo existe
if (!existsSync(envPath)) {
  console.error('❌ Arquivo .env não encontrado em:', envPath);
  process.exit(1);
}

console.log('✅ Arquivo .env encontrado\n');

// 2. Ler conteúdo
const content = readFileSync(envPath, 'utf8');
console.log('📄 Conteúdo do arquivo:');
console.log('─'.repeat(60));
console.log(content);
console.log('─'.repeat(60));
console.log('');

// 3. Verificar variáveis
const requiredVars = [
  'VITE_MOCK_USDC_ADDRESS',
  'VITE_GIFT_CARD_NFT_ADDRESS',
  'VITE_GIFT_CARD_MINTER_ADDRESS'
];

let allOk = true;
for (const varName of requiredVars) {
  const regex = new RegExp(`${varName}=0x[0-9a-fA-F]{40}`, 'i');
  if (regex.test(content)) {
    const match = content.match(new RegExp(`${varName}=(0x[0-9a-fA-F]{40})`, 'i'));
    console.log(`✅ ${varName}: ${match[1]}`);
  } else {
    console.log(`❌ ${varName}: NÃO ENCONTRADO ou INVÁLIDO`);
    allOk = false;
  }
}

console.log('');

if (allOk) {
  console.log('✅ Todas as variáveis estão corretas!');
  console.log('');
  console.log('⚠️  PRÓXIMOS PASSOS:');
  console.log('   1. Certifique-se de que o servidor Vite está PARADO');
  console.log('   2. Limpe o cache: Remove-Item -Recurse -Force node_modules\\.vite');
  console.log('   3. Inicie o servidor: npm run dev');
  console.log('   4. Abra http://localhost:3000 e verifique o console (F12)');
} else {
  console.log('❌ Algumas variáveis estão faltando ou inválidas!');
  console.log('   Execute: npm run env:create');
  process.exit(1);
}
