/*
|--------------------------------------------------------------------------
| VineJS configuration
|--------------------------------------------------------------------------
|
| The "VineDate" transform converts every validated date to a Luxon
| DateTime instance so the application never handles raw JS dates.
|
*/

import { DateTime } from 'luxon'
import { VineDate } from '@vinejs/vine'

/**
 * VineJS types the transform callback as returning a native Date, while the
 * AdonisJS ecosystem works with Luxon DateTime instances. The cast keeps both
 * the runtime value and the compiler happy.
 */
VineDate.transform((value) => DateTime.fromJSDate(value) as unknown as Date)
