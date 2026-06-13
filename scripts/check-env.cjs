const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('🔍 Verificando configuração do .env...\n');

if (!fs.existsSync(envPath)) {
  console.log('❌ Arquivo .env NÃO encontrado em:', envPath);
  console.log('\n📝 Criando arquivo .env...\n');
  
  const envContent = `VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E
`;
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('✅ Arquivo .env criado!\n');
} else {
  console.log('✅ Arquivo .env encontrado!\n');
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

console.log('📋 Variáveis encontradas:\n');
console.log('─'.repeat(60));

let hasErrors = false;

const requiredVars = [
  'VITE_FAJUCAR_COLLECTION_ADDRESS'
];

requiredVars.forEach(varName => {
  const line = lines.find(l => l.startsWith(varName + '='));
  if (line) {
    const value = line.split('=')[1]?.trim();
    if (value && value.startsWith('0x') && value.length === 42) {
      console.log(`✅ ${varName}=${value}`);
    } else {
      console.log(`❌ ${varName}=${value || 'VAZIO'} (formato inválido)`);
      hasErrors = true;
    }
  } else {
    console.log(`❌ ${varName} (NÃO ENCONTRADO)`);
    hasErrors = true;
  }
});

console.log('─'.repeat(60));

if (hasErrors) {
  console.log('\n❌ Erros encontrados! Corrija o arquivo .env');
  process.exit(1);
} else {
  console.log('\n✅ Todas as variáveis estão configuradas corretamente!');
}
