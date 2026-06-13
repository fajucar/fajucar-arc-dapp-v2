const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

const envContent = `VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E
`;

try {
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado com sucesso!');
  console.log('\nEndereço configurado:');
  console.log('VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E');
} catch (error) {
  console.error('❌ Erro ao criar arquivo .env:', error.message);
  process.exit(1);
}
