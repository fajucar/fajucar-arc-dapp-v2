const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('Criando arquivo .env...\n');

const lines = [
  'VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0',
  'VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823',
  'VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF',
  ''
];

try {
  // Remove arquivo antigo
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
  }
  
  // Cria novo arquivo linha por linha
  const content = lines.join('\n');
  fs.writeFileSync(envPath, content, { encoding: 'utf8', flag: 'w' });
  
  // Verifica se foi criado
  if (fs.existsSync(envPath)) {
    const readBack = fs.readFileSync(envPath, 'utf8');
    console.log('✅ Arquivo .env criado com sucesso!\n');
    console.log('Conteúdo:');
    console.log('─'.repeat(60));
    console.log(readBack);
    console.log('─'.repeat(60));
    
    // Verifica se todas as variáveis estão presentes
    const hasAll = lines.every(line => {
      if (!line.trim()) return true;
      return readBack.includes(line.trim());
    });
    
    if (hasAll) {
      console.log('\n✅ Todas as variáveis estão presentes!');
      console.log('\n⚠️  IMPORTANTE:');
      console.log('   1. Pare o servidor Vite (Ctrl+C)');
      console.log('   2. Execute: npm run dev');
      console.log('   3. Recarregue a página (F5)\n');
    } else {
      console.log('\n❌ Erro: Nem todas as variáveis foram escritas corretamente');
      process.exit(1);
    }
  } else {
    console.log('❌ Erro: Arquivo não foi criado');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
