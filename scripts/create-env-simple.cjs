const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('Criando arquivo .env...\n');

const lines = [
  'VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E',
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
