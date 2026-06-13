const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('🔍 Verificando configuração do .env...\n');

if (!fs.existsSync(envPath)) {
  console.log('❌ Arquivo .env NÃO encontrado em:', envPath);
  console.log('\n📝 Criando arquivo .env...\n');
  
  const envContent = `VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
`;
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado!\n');
} else {
  console.log('✅ Arquivo .env encontrado!\n');
}

const envContent = fs.readFileSync(envPath, 'utf8');
console.log('📄 Conteúdo do arquivo .env:');
console.log('─'.repeat(60));
console.log(envContent);
console.log('─'.repeat(60));

// Verificar se todas as variáveis estão presentes
const requiredVars = [
  'VITE_MOCK_USDC_ADDRESS',
  'VITE_GIFT_CARD_NFT_ADDRESS',
  'VITE_GIFT_CARD_MINTER_ADDRESS'
];

console.log('\n🔎 Verificando variáveis obrigatórias:\n');

let allPresent = true;
requiredVars.forEach(varName => {
  if (envContent.includes(varName)) {
    const match = envContent.match(new RegExp(`${varName}=(.+)`));
    if (match && match[1] && match[1].trim() !== '0x...' && match[1].trim() !== '') {
      console.log(`  ✅ ${varName}: ${match[1].trim().substring(0, 20)}...`);
    } else {
      console.log(`  ⚠️  ${varName}: valor não configurado`);
      allPresent = false;
    }
  } else {
    console.log(`  ❌ ${varName}: não encontrada`);
    allPresent = false;
  }
});

if (allPresent) {
  console.log('\n✅ Todas as variáveis estão configuradas!');
  console.log('\n⚠️  IMPORTANTE: Se o servidor Vite já está rodando, você precisa:');
  console.log('   1. Parar o servidor (Ctrl+C)');
  console.log('   2. Reiniciar com: npm run dev');
  console.log('   Isso é necessário para o Vite carregar as variáveis de ambiente.\n');
} else {
  console.log('\n❌ Algumas variáveis estão faltando ou não configuradas.\n');
  process.exit(1);
}

