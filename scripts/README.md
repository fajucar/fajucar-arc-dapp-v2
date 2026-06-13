# Scripts de Configuração

Scripts utilitários para configurar e verificar o ambiente do projeto.

## Comandos Disponíveis

### Criar arquivo .env

Cria um arquivo `.env` com as variáveis de ambiente necessárias:

```bash
npm run env:create
```

Ou diretamente:

```bash
node scripts/create-env-simple.cjs
```

### Verificar variáveis de ambiente

Verifica se as variáveis obrigatórias estão configuradas corretamente:

```bash
npm run check:env
```

Ou diretamente:

```bash
node scripts/check-vite-env.mjs
```

### Testar configuração

Testa se o arquivo `.env` está sendo carregado corretamente:

```bash
npm run env:test
```

### Verificar tudo

Executa verificação completa do arquivo `.env`:

```bash
npm run verify:env
```

### Corrigir arquivo .env

Recria o arquivo `.env` com valores padrão:

```bash
npm run fix:env
```

### Verificar contratos Arc

Verifica os contratos on-chain na Arc Testnet:

```bash
npm run arc:check
```

## ⚠️ Importante

**Após criar ou modificar o arquivo `.env`, você DEVE reiniciar o servidor Vite:**

1. Pare o servidor (pressione `Ctrl+C` no terminal)
2. Execute: `npm run dev`
3. Recarregue a página no navegador (`F5`)

O Vite só carrega variáveis de ambiente quando o servidor é **iniciado**. Mudanças no `.env` não são aplicadas automaticamente em servidores já rodando.

## Variáveis Obrigatórias

- `VITE_GIFT_CARD_MINTER_ADDRESS` - Endereço do contrato minter (obrigatório)
- `VITE_GIFT_CARD_NFT_ADDRESS` - Endereço do contrato NFT (opcional)
- `VITE_ARC_CHAIN_ID` - Chain ID da Arc Network (opcional)

## Formato de Endereços

Endereços Ethereum devem:
- Começar com `0x`
- Ter exatamente 42 caracteres (incluindo `0x`)
- Exemplo: `0x7F6E8905e03D4CC7e93ABa24bCA569E142Bd88dF`
