/*
|--------------------------------------------------------------------------
| Edge.js configuration
|--------------------------------------------------------------------------
|
| The storefront views use the Edge 5 template inheritance syntax
| (@layout, @section, @super) that ships with this project. Edge 6 moved to
| components with slots and provides an official migration plugin, which is
| registered here so the existing views keep working unchanged.
|
| New views can still be written with the Edge 6 @component/@slot syntax.
|
*/

import edge from 'edge.js'
import { migrate } from 'edge.js/plugins/migrate'

edge.use(migrate)
