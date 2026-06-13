export interface GiftCardNFT {
  id: number | string;
  name: string;
  description: string;
  imageURI: string;
  priceRaw?: string; // Even if contract returns price, we visually enforce 0.5 USDC
}

export type Web3Status = 'disconnected' | 'connecting' | 'connected' | 'wrong_network';

export interface WalletState {
  address: string | null;
  status: Web3Status;
  chainId: number | null;
}





