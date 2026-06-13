const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('🔧 Corrigindo arquivo .env...\n');

const envContent = `VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E
`;

try {
  // Remove arquivo antigo se existir
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
    console.log('🗑️  Arquivo .env antigo removido');
  }
  
  // Remove qualquer arquivo com nome incorreto
  const dir = path.dirname(envPath);
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (file.startsWith('VITE_') && file !== '.env') {
      const wrongFile = path.join(dir, file);
      try {
        fs.unlinkSync(wrongFile);
        console.log(`🗑️  Arquivo incorreto removido: ${file}`);
      } catch (e) {
        // Ignore errors
      }
    }
  });
  
  // Cria novo arquivo
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado com sucesso!\n');
  
  console.log('📄 Conteúdo do arquivo:');
  console.log('─'.repeat(60));
  console.log(envContent);
  console.log('─'.repeat(60));
  
  // Verifica se foi criado corretamente
  const verifyContent = fs.readFileSync(envPath, 'utf8');
  if (verifyContent.includes('VITE_FAJUCAR_COLLECTION_ADDRESS')) {
    console.log('\n✅ Arquivo .env verificado e está correto!');
  } else {
    console.log('\n❌ Erro: Arquivo .env não contém VITE_FAJUCAR_COLLECTION_ADDRESS');
    process.exit(1);
  }
  
  console.log('\n⚠️  AÇÃO NECESSÁRIA:');
  console.log('   O servidor Vite PRECISA ser REINICIADO para carregar as variáveis!');
  console.log('\n   Siga estes passos:');
  console.log('   1. Pare o servidor Vite (pressione Ctrl+C no terminal onde está rodando)');
  console.log('   2. Execute: npm run dev');
  console.log('   3. Recarregue a página no navegador (F5)');
  console.log('\n   ⚠️  IMPORTANTE: O Vite só carrega variáveis de ambiente quando o servidor é INICIADO!');
  console.log('   Se você não reiniciar o servidor, as variáveis continuarão vazias.\n');
  
} catch (error) {
  console.error('❌ Erro ao criar arquivo .env:', error.message);
  process.exit(1);
}
