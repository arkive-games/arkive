import { dataUrl } from './urls'

// Merchant catalog (merchants.json), emitted by tools/palworld/merchants.py.
// Ids share the item id space (product.item == item id; currency == item id).

export interface MerchantProduct {
  item: string
  /** Price in the merchant's `currency` (base item Price unless overridden). */
  price: number
  /** Quantity sold per purchase; omitted when 1. */
  num?: number
  /** Finite per-restock buy limit (DT_ItemShopCreateData Stock > 0); omitted for
   *  unlimited/default stock. */
  stock?: number
  /** One-time-only purchase (ProductType OnlyPurchaseOne). */
  onceOnly?: boolean
}

export interface MerchantEntry {
  /** Shop-group id (e.g. `Village_Shop_1`); the Caravan aggregate is `Caravan`. */
  id: string
  /** Chance (%) a wandering vendor's stock rolls this group (multi-group
   *  lottery tables only — fixed-stock merchants omit it). */
  rollPct?: number
  /** Vendor-type slug for the display name (`merchant.name.<nameKey>`). */
  nameKey: string
  /** Currency item id (`Money` = gold, or `DogCoin` / `BountyProof_1` / …). */
  currency: string
  /** Vendor NPC BP class stem, for a future map-location join (unused in UI). */
  vendor?: string
  products: MerchantProduct[]
}

export interface MerchantsBundle {
  merchants: MerchantEntry[]
  byId: Map<string, MerchantEntry>
}

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

const cache = new Map<string, Promise<MerchantsBundle>>()

async function fetchMerchants(): Promise<MerchantsBundle> {
  const file = await j<{ merchants: MerchantEntry[] }>(dataUrl('merchants.json'))
  return {
    merchants: file.merchants,
    byId: new Map(file.merchants.map((m) => [m.id, m])),
  }
}

/** Load (and cache) the merchant catalog. Language-independent — merchant names
 *  are app-side i18n labels keyed by `nameKey`, so there's no per-locale file. */
export function loadMerchants(): Promise<MerchantsBundle> {
  let p = cache.get('_')
  if (!p) {
    p = fetchMerchants()
    cache.set('_', p)
  }
  return p
}
