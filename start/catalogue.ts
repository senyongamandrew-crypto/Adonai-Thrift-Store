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

const DEFAULT_SNAPSHOT_URL =
  'https://raw.githubusercontent.com/senyongamandrew-crypto/Adonai-Thrift-Store/data/catalogue/catalogue.json'

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
}
