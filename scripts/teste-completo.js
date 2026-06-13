// Script de teste completo para verificar se tudo está funcionando
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('='.repeat(70));
console.log('🧪 TESTE COMPLETO - VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE');
console.log('='.repeat(70));
console.log('');

const envPath = path.join(__dirname, '../.env');
let allTestsPassed = true;

// TESTE 1: Arquivo .env existe?
console.log('📋 TESTE 1: Arquivo .env existe?');
if (fs.existsSync(envPath)) {
  console.log('   ✅ Arquivo .env encontrado');
} else {
  console.log('   ❌ Arquivo .env NÃO encontrado!');
    console.log('   💡 Execute: npm run env:create');
  allTestsPassed = false;
}
console.log('');

// TESTE 2: Conteúdo do arquivo está correto?
console.log('📋 TESTE 2: Conteúdo do arquivo está correto?');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log(`   Tamanho do arquivo: ${content.length} caracteres`);
  console.log(`   Primeiros 100 caracteres: ${content.substring(0, 100)}`);
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  console.log(`   Arquivo tem ${lines.length} linhas (após filtrar vazias)`);
  
  const requiredVars = [
    'VITE_MOCK_USDC_ADDRESS',
    'VITE_GIFT_CARD_NFT_ADDRESS',
    'VITE_GIFT_CARD_MINTER_ADDRESS'
  ];
  
  for (const varName of requiredVars) {
    const regex = new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=0x[0-9a-fA-F]{40}`, 'i');
    if (regex.test(content)) {
      const match = content.match(new RegExp(`${varName}=((0x[0-9a-fA-F]{40}))`, 'i'));
      console.log(`   ✅ ${varName}: ${match[1]}`);
    } else {
      console.log(`   ❌ ${varName}: NÃO ENCONTRADO ou INVÁLIDO`);
      allTestsPassed = false;
    }
  }
} else {
  console.log('   ⏭️  Pulando (arquivo não existe)');
  allTestsPassed = false;
}
console.log('');

// TESTE 3: Cache do Vite existe?
console.log('📋 TESTE 3: Cache do Vite');
const cachePath = path.join(__dirname, '../node_modules/.vite');
if (fs.existsSync(cachePath)) {
  console.log('   ⚠️  Cache do Vite existe');
  console.log('   💡 Recomendado limpar antes de reiniciar o servidor');
  console.log('   💡 Execute: Remove-Item -Recurse -Force node_modules\\.vite');
} else {
  console.log('   ✅ Cache do Vite não existe (já está limpo)');
}
console.log('');

// TESTE 4: Verificar se o vite.config.ts está correto
console.log('📋 TESTE 4: Configuração do Vite');
const viteConfigPath = path.join(__dirname, '../vite.config.ts');
if (fs.existsSync(viteConfigPath)) {
  const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
  if (viteConfig.includes('loadEnv')) {
    console.log('   ✅ vite.config.ts usa loadEnv() para carregar variáveis');
  } else {
    console.log('   ⚠️  vite.config.ts não usa loadEnv()');
  }
  if (viteConfig.includes('console.log')) {
    console.log('   ✅ vite.config.ts tem logs de debug');
  }
} else {
  console.log('   ⚠️  vite.config.ts não encontrado');
}
console.log('');

// RESULTADO FINAL
console.log('='.repeat(70));
if (allTestsPassed) {
  console.log('✅ TODOS OS TESTES PASSARAM!');
  console.log('');
  console.log('📝 PRÓXIMOS PASSOS:');
  console.log('   1. Pare o servidor Vite se estiver rodando (Ctrl+C)');
  console.log('   2. Limpe o cache: Remove-Item -Recurse -Force node_modules\\.vite');
  console.log('   3. Inicie o servidor: npm run dev');
  console.log('   4. Verifique as mensagens no terminal');
  console.log('   5. Abra http://localhost:3000 e verifique o console (F12)');
} else {
  console.log('❌ ALGUNS TESTES FALHARAM!');
  console.log('');
  console.log('🔧 CORREÇÕES NECESSÁRIAS:');
  if (!fs.existsSync(envPath)) {
    console.log('   - Execute: npm run env:create');
  }
  console.log('   - Verifique se o arquivo .env tem as 3 variáveis corretas');
  console.log('   - Certifique-se de que os endereços são válidos (começam com 0x e têm 40 caracteres)');
}
console.log('='.repeat(70));

process.exit(allTestsPassed ? 0 : 1);
