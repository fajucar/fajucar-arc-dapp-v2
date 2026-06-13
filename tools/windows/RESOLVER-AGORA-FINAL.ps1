# Script PowerShell FINAL para resolver o problema
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESOLVER PROBLEMA DE .env - FINAL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar se estamos no diretório correto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ ERRO: Execute este script do diretório frontend!" -ForegroundColor Red
    exit 1
}

# 2. Criar arquivo .env
Write-Host "[1/5] Criando arquivo .env..." -ForegroundColor Yellow
$envContent = @"
VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
"@

[System.IO.File]::WriteAllText("$PWD\.env", $envContent, [System.Text.Encoding]::UTF8)
Write-Host "       ✅ Arquivo .env criado!" -ForegroundColor Green
Write-Host ""

# 3. Verificar conteúdo
Write-Host "[2/5] Verificando conteúdo..." -ForegroundColor Yellow
$content = Get-Content .env -Raw
$hasMock = $content -match "VITE_MOCK_USDC_ADDRESS=0x[0-9a-fA-F]{40}"
$hasNFT = $content -match "VITE_GIFT_CARD_NFT_ADDRESS=0x[0-9a-fA-F]{40}"
$hasMinter = $content -match "VITE_GIFT_CARD_MINTER_ADDRESS=0x[0-9a-fA-F]{40}"

if ($hasMock -and $hasNFT -and $hasMinter) {
    Write-Host "       ✅ Todas as variáveis estão corretas!" -ForegroundColor Green
} else {
    Write-Host "       ❌ Erro: Algumas variáveis estão faltando!" -ForegroundColor Red
    Write-Host "       Conteúdo do arquivo:" -ForegroundColor Gray
    Write-Host "       $content" -ForegroundColor Gray
    exit 1
}
Write-Host ""

# 4. Limpar cache do Vite
Write-Host "[3/5] Limpando cache do Vite..." -ForegroundColor Yellow
if (Test-Path "node_modules\.vite") {
    Remove-Item -Recurse -Force "node_modules\.vite" -ErrorAction SilentlyContinue
    Write-Host "       ✅ Cache removido!" -ForegroundColor Green
} else {
    Write-Host "       ℹ️  Cache já está limpo" -ForegroundColor Gray
}
Write-Host ""

# 5. Verificar se há processos do Vite rodando
Write-Host "[4/5] Verificando processos do Vite..." -ForegroundColor Yellow
$viteProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*vite*" -or $_.Path -like "*vite*"
}
if ($viteProcesses) {
    Write-Host "       ⚠️  Processos do Node/Vite encontrados!" -ForegroundColor Yellow
    Write-Host "       Certifique-se de parar o servidor (Ctrl+C) antes de continuar" -ForegroundColor Yellow
} else {
    Write-Host "       ✅ Nenhum processo do Vite rodando" -ForegroundColor Green
}
Write-Host ""

# 6. Instruções finais
Write-Host "[5/5] Próximos passos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   ⚠️  AÇÃO NECESSÁRIA:" -ForegroundColor Red
Write-Host "   1. Se o servidor Vite estiver rodando, PARE agora (Ctrl+C)" -ForegroundColor White
Write-Host "   2. Execute: npm run dev" -ForegroundColor White
Write-Host "   3. NO TERMINAL, procure por estas mensagens:" -ForegroundColor White
Write-Host "      🔍 [vite.config.ts] Variáveis de ambiente carregadas:" -ForegroundColor Cyan
Write-Host "        VITE_MOCK_USDC_ADDRESS: 0x3d77..." -ForegroundColor Cyan
Write-Host "        VITE_GIFT_CARD_NFT_ADDRESS: 0x345B..." -ForegroundColor Cyan
Write-Host "        VITE_GIFT_CARD_MINTER_ADDRESS: 0x7F6E..." -ForegroundColor Cyan
Write-Host "      ✅ Todas as variáveis foram carregadas com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "   4. Se você ver essas mensagens, as variáveis foram carregadas!" -ForegroundColor Green
Write-Host "   5. Abra: http://localhost:3000" -ForegroundColor White
Write-Host "   6. Pressione F12 → Console e procure por 🔍 [contracts.ts]" -ForegroundColor White
Write-Host "   7. Recarregue a página (F5)" -ForegroundColor White
Write-Host ""
Write-Host "   💡 O Vite só carrega variáveis quando o servidor é INICIADO!" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
