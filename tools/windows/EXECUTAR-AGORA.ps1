# Script PowerShell para resolver o problema das variáveis de ambiente
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESOLVER PROBLEMA DE .env" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Criar arquivo .env
Write-Host "[1/4] Criando arquivo .env..." -ForegroundColor Yellow
$envContent = @"
VITE_MOCK_USDC_ADDRESS=0x3d77FAb8568F9c50C034311AA22088Cd045a30A0
VITE_GIFT_CARD_NFT_ADDRESS=0x345BE458b089C9747a4251BB39250F180a55D823
VITE_GIFT_CARD_MINTER_ADDRESS=0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF
"@

[System.IO.File]::WriteAllText("$PWD\.env", $envContent, [System.Text.Encoding]::UTF8)
Write-Host "       ✅ Arquivo .env criado!" -ForegroundColor Green
Write-Host ""

# 2. Verificar conteúdo
Write-Host "[2/4] Verificando conteúdo..." -ForegroundColor Yellow
if (Test-Path .env) {
    $content = Get-Content .env -Raw
    Write-Host "       Conteúdo do arquivo:" -ForegroundColor Gray
    Write-Host "       $($content -replace "`n", "`n       ")" -ForegroundColor Gray
    
    $hasMock = $content -match "VITE_MOCK_USDC_ADDRESS=0x[0-9a-fA-F]{40}"
    $hasNFT = $content -match "VITE_GIFT_CARD_NFT_ADDRESS=0x[0-9a-fA-F]{40}"
    $hasMinter = $content -match "VITE_GIFT_CARD_MINTER_ADDRESS=0x[0-9a-fA-F]{40}"
    
    if ($hasMock -and $hasNFT -and $hasMinter) {
        Write-Host "       ✅ Todas as variáveis estão corretas!" -ForegroundColor Green
    } else {
        Write-Host "       ❌ Algumas variáveis estão faltando!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "       ❌ Arquivo não foi criado!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 3. Limpar cache do Vite
Write-Host "[3/4] Limpando cache do Vite..." -ForegroundColor Yellow
if (Test-Path "node_modules\.vite") {
    Remove-Item -Recurse -Force "node_modules\.vite" -ErrorAction SilentlyContinue
    Write-Host "       ✅ Cache removido!" -ForegroundColor Green
} else {
    Write-Host "       ℹ️  Cache já está limpo" -ForegroundColor Gray
}
Write-Host ""

# 4. Instruções finais
Write-Host "[4/4] Próximos passos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   ⚠️  IMPORTANTE:" -ForegroundColor Red
Write-Host "   1. Pare o servidor Vite se estiver rodando (Ctrl+C)" -ForegroundColor White
Write-Host "   2. Execute: npm run dev" -ForegroundColor White
Write-Host "   3. Abra: http://localhost:3000" -ForegroundColor White
Write-Host "   4. Pressione F12 e verifique o console" -ForegroundColor White
Write-Host "   5. Procure por mensagens que começam com 🔍 [contracts.ts]" -ForegroundColor White
Write-Host ""
Write-Host "   💡 O Vite só carrega variáveis quando o servidor é INICIADO!" -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
