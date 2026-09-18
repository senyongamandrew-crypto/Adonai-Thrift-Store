/*
|--------------------------------------------------------------------------
| Catalogue cold-start recovery
|--------------------------------------------------------------------------
|
| The free hosting tiers hand the service a fresh, empty disk whenever it is
| restarted, so a catalogue that only lived on that disk would disappear.
|
| On boot, when the catalogue is empty, it is restored from the published JSON
| snapshot of the same catalogue (see .github/workflows/catalogue-snapshot.yml,
| which refreshes that file every fifteen minutes). Nothing happens when the
| shop runs a separate POS API, or when the snapshot does not exist yet.
|
*/

import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { getBuiltInCatalogue, usesExternalPosApi } from '#services/storefront_services'
import { imageFileExists } from '#services/media_store'

const DEFAULT_SNAPSHOT_URL =
  'https://raw.githubusercontent.com/senyongamandrew-crypto/Adonai-Thrift-Store/data/catalogue/catalogue.json'

/**
 * Product photos are not part of the snapshot: they are large binary files, and
 * copying them into the repository every fifteen minutes would bloat it. They
 * live on the same temporary disk as everything else, so a restart can take them
 * away while the catalogue itself comes back.
 *
 * Left alone, that would leave the storefront showing a broken picture for every
 * piece. Instead, a listing that points at a photo which is no longer there is
 * trimmed back to "no photo yet", which the storefront already knows how to
 * display. The piece itself, its price and its description all survive.
 */
function forgetMissingPhotos(catalogue: ReturnType<typeof getBuiltInCatalogue>): number {
  let cleared = 0

  for (const product of catalogue.allProducts()) {
    const references = [product.image, ...(product.gallery ?? [])].filter(
      (entry): entry is string => typeof entry === 'string' && entry.startsWith('/media/')
    )
    if (references.length === 0) continue

    const missing = references.some((entry) => !imageFileExists(entry))
    if (!missing) continue

    catalogue.updateProduct(product.id, { image: null, gallery: null })
    cleared += 1
  }

  return cleared
}

if (!usesExternalPosApi()) {
  const catalogue = getBuiltInCatalogue()
  const snapshotUrl = (env.get('CATALOGUE_SNAPSHOT_URL') || DEFAULT_SNAPSHOT_URL).trim()

  const existing = catalogue.allProducts().length
  if (existing === 0 && snapshotUrl) {
    const restored = await catalogue.seedFromSnapshot(snapshotUrl)
    if (restored > 0) {
      logger.info({ count: restored }, 'catalogue restored from the published snapshot')
    }
  }

  const trimmed = forgetMissingPhotos(catalogue)
  if (trimmed > 0) {
    logger.info(
      { count: trimmed },
      'listings whose photos did not survive the restart now show a placeholder'
    )
  }
}
