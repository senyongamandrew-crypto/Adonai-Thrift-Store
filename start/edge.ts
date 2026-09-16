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
import siteSettings from '#services/site_settings'

edge.use(migrate)

/*
| Shop details the owner can change from the hosting dashboard without editing
| a file. Templates read them as "site.whatsappNumber", "site.heroHeadline", ...
*/
edge.global('site', siteSettings)
