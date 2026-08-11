import { DEFAULT_REGION, type Region } from './ftcScout'

/**
 * Where the person probably is, so the registration guide opens on their own
 * region instead of on a dropdown they have to go hunting through.
 *
 * Read from the browser's own timezone and language. No permission prompt, no
 * network call, works with the radio off, and no location data is collected —
 * which matters more than usual here, because the users are minors.
 *
 * The honest limitation: a timezone identifies a country reliably but a US
 * state only sometimes. `America/Phoenix` is Arizona and nowhere else, while
 * `America/New_York` covers about twenty states. So this returns a state only
 * where the zone is unambiguous, and otherwise falls back to the country
 * group and lets the person pick.
 *
 * That is the whole design rule: never assert a state we are not sure of. A
 * confidently wrong region is worse than an unset one, because the person
 * reads the wrong registration deadlines and does not think to check.
 */

/** Timezones that identify exactly one FTC region. */
const ZONE_TO_REGION: Record<string, Region> = {
  // US — states with their own zone.
  'America/Anchorage': 'USAK',
  'America/Juneau': 'USAK',
  'America/Nome': 'USAK',
  'America/Sitka': 'USAK',
  'Pacific/Honolulu': 'USHI',
  'America/Phoenix': 'USAZ',
  'America/Boise': 'USID',
  'America/Detroit': 'USMI',
  'America/Indiana/Indianapolis': 'USIN',
  'America/Indiana/Vincennes': 'USIN',
  'America/Indiana/Winamac': 'USIN',
  'America/Indiana/Tell_City': 'USIN',
  'America/Indiana/Petersburg': 'USIN',
  'America/Indiana/Knox': 'USIN',
  'America/Indiana/Marengo': 'USIN',
  'America/Indiana/Vevay': 'USIN',
  'America/Kentucky/Louisville': 'USKY',
  'America/Kentucky/Monticello': 'USKY',

  // Canada — the four provinces the API models.
  'America/Toronto': 'CAON',
  'America/Vancouver': 'CABC',
  'America/Edmonton': 'CAAB',
  'America/Montreal': 'CAQC',

  // International, where the zone is the country.
  'Europe/London': 'GB',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL',
  'Europe/Bucharest': 'RO',
  'Europe/Moscow': 'RU',
  'Asia/Jerusalem': 'IL',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Taipei': 'TW',
  'Asia/Bangkok': 'TH',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Qatar': 'QA',
  'Asia/Riyadh': 'SA',
  'Asia/Nicosia': 'CY',
  'Asia/Almaty': 'KZ',
  'Africa/Cairo': 'EG',
  'Africa/Tripoli': 'LY',
  'Africa/Lagos': 'NG',
  'Africa/Johannesburg': 'ZA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Jamaica': 'JM',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
}

/** Country code → region, for when the zone is ambiguous but the country is not. */
const COUNTRY_TO_REGION: Record<string, Region> = {
  US: 'UnitedStates',
  CA: 'International',
  GB: 'GB',
  DE: 'DE',
  FR: 'FR',
  ES: 'ES',
  NL: 'NL',
  RO: 'RO',
  RU: 'RU',
  IL: 'IL',
  KR: 'KR',
  CN: 'CN',
  TW: 'TW',
  TH: 'TH',
  IN: 'IN',
  QA: 'QA',
  SA: 'SA',
  CY: 'CY',
  KZ: 'KZ',
  EG: 'EG',
  LY: 'LY',
  NG: 'NG',
  ZA: 'ZA',
  MX: 'MX',
  BR: 'BR',
  JM: 'JM',
  AU: 'AU',
  NZ: 'NZ',
}

export interface RegionGuess {
  region: Region
  /**
   * `exact` — the timezone named one region, so it is safe to preselect and
   * say so. `country` — we know the country but not the state, so the person
   * still has to choose. `none` — no idea; this is the plain default.
   */
  confidence: 'exact' | 'country' | 'none'
}

export function inferRegion(): RegionGuess {
  if (typeof Intl === 'undefined') return { region: DEFAULT_REGION, confidence: 'none' }

  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const exact = zone ? ZONE_TO_REGION[zone] : undefined
    if (exact) return { region: exact, confidence: 'exact' }

    // Zone was ambiguous (America/New_York and friends). Fall back to the
    // country, which the zone prefix or the locale still tells us.
    const locale = typeof navigator !== 'undefined' ? navigator.language : ''
    const fromLocale = locale.split('-')[1]?.toUpperCase()
    const country = fromLocale && COUNTRY_TO_REGION[fromLocale] ? fromLocale : undefined
    if (country) return { region: COUNTRY_TO_REGION[country], confidence: 'country' }

    // America/* with an unhelpful locale is still overwhelmingly the US.
    if (zone?.startsWith('America/')) {
      return { region: 'UnitedStates', confidence: 'country' }
    }
  } catch {
    // Intl can throw on very old engines. Fall through to the default.
  }

  return { region: DEFAULT_REGION, confidence: 'none' }
}
