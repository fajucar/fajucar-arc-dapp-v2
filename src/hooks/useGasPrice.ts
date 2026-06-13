import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'

export function useGasPrice() {
  const publicClient = usePublicClient()

  return useQuery({
    queryKey: ['gasPrice'],
    queryFn: async () => {
      if (!publicClient) throw new Error('Client not ready')
      const price = await publicClient.getGasPrice()
      return {
        wei: price,
        usdc: formatUnits(price, 6), // USDC tem 6 decimais
        formatted: `$${(Number(formatUnits(price, 6))).toFixed(4)}`,
      }
    },
    refetchInterval: 10000, // 10s
    enabled: !!publicClient,
  })
}

