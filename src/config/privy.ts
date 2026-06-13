import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arcTestnet } from '@/config/chains'

export const PRIVY_APP_ID = 'cmp0dlx5n026d0djsdyf4b3p3'

export { arcTestnet }

/**
 * FajuARC — Estratégia de autenticação (TAREFA 3):
 *
 * UMA conta Privy = UMA embedded wallet, compartilhada por TODAS as redes.
 *
 * Fluxo correto:
 *   1. Usuário faz login com UMA rede social → Privy cria a embedded wallet.
 *   2. Outras redes são VINCULADAS via linkGoogle/linkDiscord/linkTwitter
 *      (usePrivy) — nunca como logins separados.
 *   3. createOnLogin: 'users-without-wallets' garante que um segundo login
 *      na mesma conta não cria uma nova wallet.
 *
 * Se cada rede criou uma conta Privy separada (user.id diferente — ver log
 * do PrivyEmbeddedWalletBootstrapper), o Privy NÃO funde retroativamente.
 * Estratégia testnet: manter a conta que tem os saldos e relinkar as redes.
 */
export const privyConfig: PrivyClientConfig = {
  loginMethods: ['google', 'twitter', 'discord', 'telegram', 'wallet'],

  defaultChain: arcTestnet,
  supportedChains: [arcTestnet],

  embeddedWallets: {
    ethereum: {
      // Cria wallet SOMENTE se o usuário ainda não tem uma.
      // Impede que um segundo login social crie uma segunda embedded wallet.
      createOnLogin: 'users-without-wallets',
    },
  },

  externalWallets: {
    coinbaseWallet: {
      config: {
        preference: { options: 'smartWalletOnly' },
      },
    },
  },

  appearance: {
    theme: 'dark' as const,
    accentColor: '#00d4ff',
    logo: undefined,
    landingHeader: 'FajuARC',
    loginMessage: 'Entre para continuar',
    // Exibe social logins antes das wallets caso o modal padrão do Privy seja aberto.
    // O modal customizado (WalletModal + SocialLoginSection) é o caminho principal —
    // o Privy não oferece prop para forçar componente externo no lugar do modal padrão.
    showWalletLoginFirst: false,
  },
}
