/**
 * Arc Collection Gallery
 * 
 * Static collection array for Fajucar NFTs (factory model)
 * Each mint creates a new contract, so we use static images by index
 */

import fajucar1 from "@/assets/NFTs/fajucar-1.png";
import fajucar2 from "@/assets/NFTs/fajucar-2.png";
import fajucar3 from "@/assets/NFTs/fajucar-3.png";

export interface ArcCollectionItem {
  name: string
  image: string
}

export const ARC_COLLECTION: ArcCollectionItem[] = [
  {
    name: 'Fajucar!1',
    image: fajucar1,
  },
  {
    name: 'Fajucar!2',
    image: fajucar2,
  },
  {
    name: 'Fajucar!3',
    image: fajucar3,
  },
]
