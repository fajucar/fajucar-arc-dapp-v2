const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

const envContent = `VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
`;

try {
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado com sucesso!');
  console.log('\nEndereços configurados:');
  console.log('VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0');
  console.log('VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823');
  console.log('VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF');
} catch (error) {
  console.error('❌ Erro ao criar arquivo .env:', error.message);
  process.exit(1);
}

