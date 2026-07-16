import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, parseUnits, type WalletClient } from 'viem'
import { arcTestnet } from '@/config/chains'
import { arcTestnet as privyArcTestnet } from '@/config/privy'
import { CONSTANTS } from '@/config/constants'
import { usePersistedPrivyWalletAddress } from './usePersistedPrivyWalletAddress'

const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export type AuthMethod = 'wallet' | 'social' | 'none'

export interface ArcWalletState {
  /** Endereço exibido (Privy embedded ou wagmi) */
  address: `0x${string}` | undefined
  /** Endereço Privy para assinar transações */
  signingAddress: `0x${string}` | undefined
  isConnected: boolean
  /** Mantido para compatibilidade — sempre false (auth é Privy-only) */
  hasBackendSession: boolean
  authMethod: AuthMethod
  isGoogleLogin: boolean
  pendingGoogleWallet: boolean
  hasEmbeddedWallet: boolean
  ready: boolean
  socialLabel: string | undefined
  socialAvatar: string | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  txHash: `0x${string}` | undefined
  error: Error | null
  getWalletClient: () => Promise<WalletClient | null>
  sendUsdc: (to: string, amountUsdc: string) => Promise<void>
  resetTx: () => void
}

/**
 * Identifica a embedded wallet do Privy (carteira operacional do agente).
 *
 * DESIGN: uma conta Privy = uma embedded wallet, sempre.
 * Outras redes sociais (Google, Discord, Twitter) devem ser VINCULADAS
 * via linkGoogle/linkDiscord/linkTwitter (usePrivy) — nunca como logins
 * separados, pois isso cria contas Privy distintas com wallets distintas.
 *
 * Se o diagnóstico (PrivyEmbeddedWalletBootstrapper) mostrar user.id
 * diferente por rede social, são CONTAS SEPARADAS — o Privy não as funde
 * retroativamente. Nesse caso (testnet), manter a conta de
 * 0xd4de2458b99D029EF7ca75F3087CAD28E17e20A2 e relinkar as redes nela.
 */
function isPrivyEmbeddedWallet(wallet: { walletClientType?: string; connectorType?: string }) {
  return (
    wallet.walletClientType === 'privy' ||
    wallet.walletClientType === 'privy-v2' ||
    wallet.connectorType === 'embedded'
  )
}

export function useArcWallet(): ArcWalletState {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount()
  const { writeContractAsync, isPending: wagmiPending, error: wagmiError, reset: wagmiReset } = useWriteContract()

  const { authenticated, user, ready } = usePrivy()
  const { wallets } = useWallets()
  const persistedPrivyAddress = usePersistedPrivyWalletAddress()

  const embeddedWallet = wallets.find(isPrivyEmbeddedWallet)
  const externalPrivyWallet = wallets.find((w) => !isPrivyEmbeddedWallet(w) && w.address)
  const signingPrivyWallet = externalPrivyWallet ?? embeddedWallet

  // @privy-io/wagmi's WagmiProvider syncs EVERY Privy wallet — including the embedded wallet
  // created for social/email logins — into wagmi as its own connector, then calls reconnect().
  // That means wagmiConnected can be true even when the user has no external wallet at all, and
  // (because reconnect() restores whichever connector wagmi's storage last marked "current")
  // it can end up pointing at a STALE connector from an earlier session — e.g. a real MetaMask
  // connection — instead of the embedded wallet's own provider. That mismatch is exactly what
  // pops a MetaMask prompt for a user who logged in via Google and never touched MetaMask.
  // Fix: only trust wagmi's connected address/connector when Privy itself reports a genuine
  // EXTERNAL wallet (one the user explicitly linked, not Privy-managed). Otherwise resolve the
  // address/signing method from Privy's own wallet list, which reflects the real session
  // regardless of wagmi's connector-reconciliation timing.
  const hasExternalWallet = !!externalPrivyWallet?.address
  const useWagmiForSigning = wagmiConnected && hasExternalWallet

  // Privy v3: user.google tem `email` e `name` (tipados), mas NÃO `picture`.
  // Google profile pictures não são expostos pela API do Privy v3.27.x.
  const googleAccount = user?.linkedAccounts?.find((a) => a.type === 'google_oauth') as
    | { email?: string; name?: string }
    | undefined

  const signingAddress = useWagmiForSigning
    ? wagmiAddress
    : signingPrivyWallet?.address
    ? (signingPrivyWallet.address as `0x${string}`)
    : persistedPrivyAddress
    ? persistedPrivyAddress
    : undefined

  const address: `0x${string}` | undefined = useWagmiForSigning
    ? wagmiAddress
    : (embeddedWallet?.address as `0x${string}` | undefined) ??
      persistedPrivyAddress ??
      signingAddress ??
      (user?.wallet?.address as `0x${string}` | undefined)

  const isConnected = wagmiConnected || authenticated
  const hasEmbeddedWallet = !!embeddedWallet?.address
  const authMethod: AuthMethod = authenticated
    ? (hasExternalWallet ? 'wallet' : 'social')
    : (wagmiConnected ? 'wallet' : 'none')
  const pendingGoogleWallet = authenticated && !hasEmbeddedWallet && !wagmiConnected
  const isGoogleLogin = authMethod === 'social' && !!googleAccount

  const twitterAccount  = user?.linkedAccounts?.find((a) => a.type === 'twitter_oauth')
  const discordAccount  = user?.linkedAccounts?.find((a) => a.type === 'discord_oauth')
  const telegramAccount = user?.linkedAccounts?.find((a) => a.type === 'telegram')

  // user.google.name e user.google.email são os campos tipados corretos no Privy v3
  const socialLabel =
    authMethod === 'social'
      ? (user?.google?.name ??
          googleAccount?.email ??
          (user as { email?: { address?: string } })?.email?.address ??
          user?.twitter?.name ??
          ((twitterAccount as { username?: string })?.username
            ? `@${(twitterAccount as { username?: string }).username}`
            : undefined) ??
          ((telegramAccount as { username?: string })?.username
            ? `@${(telegramAccount as { username?: string }).username}`
            : undefined))
      : undefined

  const socialAvatar =
    authMethod === 'social'
      ? (// Google: Privy v3 não expõe foto — campos disponíveis são só email e name
         // Twitter / Discord / Telegram têm profilePictureUrl / avatarUrl / photoUrl
         (twitterAccount  as { profilePictureUrl?: string })?.profilePictureUrl ??
         (discordAccount  as { avatarUrl?: string })?.avatarUrl ??
         (telegramAccount as { photoUrl?: string })?.photoUrl ??
         undefined)
      : undefined

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [privyPending, setPrivyPending] = useState(false)
  const [privyError, setPrivyError] = useState<Error | null>(null)

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, query: { enabled: !!txHash } })

  const isPending = authMethod === 'wallet' ? wagmiPending : privyPending
  const error = authMethod === 'wallet' ? wagmiError : privyError

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    const wallet = useWagmiForSigning ? null : signingPrivyWallet
    if (!wallet?.address) return null
    try {
      await wallet.switchChain(privyArcTestnet.id)
      const provider = await wallet.getEthereumProvider()
      return createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: arcTestnet,
        transport: custom(provider),
      })
    } catch (err) {
      console.warn('[Privy] getWalletClient:', err)
      return null
    }
  }, [useWagmiForSigning, signingPrivyWallet])

  const signWithPrivy = async (
    fn: (client: WalletClient, account: `0x${string}`) => Promise<`0x${string}`>
  ) => {
    const wallet = signingPrivyWallet
    if (!wallet?.address) {
      throw new Error('Signing wallet not ready. Wait for the Privy wallet to finish setting up.')
    }
    setPrivyPending(true)
    setPrivyError(null)
    try {
      await wallet.switchChain(privyArcTestnet.id)
      const provider = await wallet.getEthereumProvider()
      const client = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: arcTestnet,
        transport: custom(provider),
      })
      const hash = await fn(client, wallet.address as `0x${string}`)
      setTxHash(hash)
      return hash
    } catch (err) {
      setPrivyError(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      setPrivyPending(false)
    }
  }

  const sendUsdc = async (to: string, amountUsdc: string) => {
    if (!CONSTANTS.USDC_ADDRESS || CONSTANTS.USDC_ADDRESS === '0x0000000000000000000000000000000000000000') {
      throw new Error('USDC contract address not configured')
    }

    const amount = parseUnits(amountUsdc, 6)

    if (authMethod === 'wallet' && wagmiAddress) {
      const hash = await writeContractAsync({
        address: CONSTANTS.USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [to as `0x${string}`, amount],
      })
      setTxHash(hash)
    } else if (signingPrivyWallet) {
      await signWithPrivy((client, account) =>
        client.writeContract({
          address: CONSTANTS.USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'transfer',
          args: [to as `0x${string}`, amount],
          account,
          chain: arcTestnet,
        })
      )
    } else {
      throw new Error('No wallet connected')
    }
  }

  const resetTx = () => {
    setTxHash(undefined)
    setPrivyError(null)
    if (authMethod === 'wallet') wagmiReset()
  }

  return {
    address,
    signingAddress,
    isConnected,
    hasBackendSession: false,
    authMethod,
    isGoogleLogin,
    pendingGoogleWallet,
    hasEmbeddedWallet,
    ready,
    socialLabel,
    socialAvatar,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error: error ?? null,
    getWalletClient,
    sendUsdc,
    resetTx,
  }
}
