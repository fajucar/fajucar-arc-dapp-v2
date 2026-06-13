// Test script to verify environment variables are being loaded
console.log('🔍 Testando carregamento de variáveis de ambiente...\n');

// Simulate Vite's import.meta.env
console.log('Variáveis de ambiente disponíveis:');
console.log('─'.repeat(60));

// Read .env file manually
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
  console.log('❌ Arquivo .env não encontrado em:', envPath);
  console.log('\n📝 Criando arquivo .env...\n');
  
  const envContent = `VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
`;
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado!\n');
}

const envContent = fs.readFileSync(envPath, 'utf8');
console.log('📄 Conteúdo do arquivo .env:');
console.log(envContent);
console.log('─'.repeat(60));

// Parse .env file
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      envVars[key] = valueParts.join('=').trim();
    }
  }
});

console.log('\n📋 Variáveis parseadas:');
Object.keys(envVars).forEach(key => {
  console.log(`  ${key} = ${envVars[key]}`);
});

console.log('\n⚠️  IMPORTANTE:');
console.log('   O Vite só carrega variáveis de ambiente quando o servidor é INICIADO.');
console.log('   Se você criou/modificou o .env com o servidor rodando:');
console.log('   1. Pare o servidor (Ctrl+C)');
console.log('   2. Execute: npm run dev');
console.log('   3. Recarregue a página no navegador\n');

