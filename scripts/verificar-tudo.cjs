const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('='.repeat(70));
console.log('🔍 VERIFICAÇÃO COMPLETA DO ARQUIVO .env');
console.log('='.repeat(70));
console.log('');

// PASSO 1: Verificar se arquivo existe
console.log('📋 PASSO 1: Verificando existência do arquivo...');
if (fs.existsSync(envPath)) {
  console.log('✅ Arquivo .env encontrado em:', envPath);
} else {
  console.log('❌ Arquivo .env NÃO encontrado!');
  console.log('   Criando arquivo...');
  
  const content = [
    'VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E',
    ''
  ].join('\n');
  
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('✅ Arquivo criado!');
}
console.log('');

// PASSO 2: Ler e mostrar conteúdo
console.log('📋 PASSO 2: Lendo conteúdo do arquivo...');
const content = fs.readFileSync(envPath, 'utf8');
console.log('Conteúdo do arquivo:');
console.log('-'.repeat(70));
console.log(content);
console.log('-'.repeat(70));
console.log('');

// PASSO 3: Verificar cada variável
console.log('📋 PASSO 3: Verificando variáveis...');
const vars = {
  'VITE_FAJUCAR_COLLECTION_ADDRESS': '0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E'
};

let allOk = true;
for (const [varName, expectedValue] of Object.entries(vars)) {
  const regex = new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=(${expectedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  const match = content.match(regex);
  
  if (match) {
    console.log(`✅ ${varName}: ${match[1]}`);
  } else {
    console.log(`❌ ${varName}: NÃO ENCONTRADO ou VALOR INCORRETO`);
    console.log(`   Esperado: ${expectedValue}`);
    allOk = false;
  }
}
console.log('');

// PASSO 4: Verificar formato (sem espaços extras, quebras de linha corretas)
console.log('📋 PASSO 4: Verificando formato do arquivo...');
const lines = content.split('\n').filter(line => line.trim());
if (lines.length === 1) {
  console.log('✅ Arquivo tem 1 linha (correto)');
} else {
  console.log(`⚠️  Arquivo tem ${lines.length} linhas (esperado: 1)`);
}

// Verificar se há espaços antes ou depois do =
let formatOk = true;
for (const line of lines) {
  if (line.includes(' = ') || line.startsWith(' ') || line.match(/=\s+$/)) {
    console.log(`⚠️  Linha com formato suspeito: "${line}"`);
    formatOk = false;
  }
}
if (formatOk) {
  console.log('✅ Formato do arquivo está correto');
}
console.log('');

// RESULTADO FINAL
console.log('='.repeat(70));
if (allOk && formatOk) {
  console.log('✅ TODAS AS VERIFICAÇÕES PASSARAM!');
  console.log('');
  console.log('⚠️  PRÓXIMOS PASSOS OBRIGATÓRIOS:');
  console.log('   1. Pare o servidor Vite se estiver rodando (Ctrl+C)');
  console.log('   2. Limpe o cache: Remove-Item -Recurse -Force node_modules\\.vite');
  console.log('   3. Inicie o servidor: npm run dev');
  console.log('   4. Abra http://localhost:3000');
  console.log('   5. Pressione F12 e verifique o console');
  console.log('   6. Procure por mensagens que começam com 🔍 [contracts.ts]');
  console.log('');
  console.log('💡 Lembre-se: O Vite só carrega variáveis quando o servidor é INICIADO!');
} else {
  console.log('❌ ALGUMAS VERIFICAÇÕES FALHARAM!');
  console.log('');
  console.log('🔧 Tentando corrigir...');
  
  // Recriar arquivo
  const correctContent = [
    'VITE_FAJUCAR_COLLECTION_ADDRESS=0x1499947A89Ef05B023176D31191BDC5CCF3d0B7E',
    ''
  ].join('\n');
  
  fs.writeFileSync(envPath, correctContent, 'utf8');
  console.log('✅ Arquivo recriado! Execute este script novamente para verificar.');
}
console.log('='.repeat(70));
