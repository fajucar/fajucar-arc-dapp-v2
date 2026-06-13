const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('🔧 Criando/Atualizando arquivo .env...\n');

const envContent = `VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
`;

try {
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado/atualizado com sucesso!\n');
  console.log('📄 Conteúdo:');
  console.log('─'.repeat(60));
  console.log(envContent);
  console.log('─'.repeat(60));
  console.log('\n⚠️  IMPORTANTE:');
  console.log('   O servidor Vite precisa ser REINICIADO para carregar as variáveis!');
  console.log('   1. Pare o servidor (Ctrl+C)');
  console.log('   2. Execute: npm run dev');
  console.log('   3. Recarregue a página no navegador\n');
} catch (error) {
  console.error('❌ Erro ao criar arquivo .env:', error.message);
  process.exit(1);
}

