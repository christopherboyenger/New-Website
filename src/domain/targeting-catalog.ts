/**
 * Targeting catalogs for the campaign form: countries (ISO 3166-1 alpha-2)
 * and US metropolitan areas. The reference product's option catalogs were
 * never opened (reference-build-specification.md "Campaign creation"), so
 * these are this product's own published catalogs (docs/decisions/campaign-form.md).
 *
 * Stored values are stable identifiers: country codes and metro slugs. Labels
 * are derived at render time and never persisted.
 */

/** Every officially assigned ISO 3166-1 alpha-2 code (249 entries). */
export const countryCodes = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof countryCodes)[number];

/** Country whose creators the US metro filter applies to. */
export const US_COUNTRY_CODE: CountryCode = "US";

const countryCodeSet: ReadonlySet<string> = new Set(countryCodes);

export function isCountryCode(value: string): value is CountryCode {
  return countryCodeSet.has(value);
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function regionDisplayNames(locale: string): Intl.DisplayNames | null {
  if (!displayNamesCache.has(locale)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, "en"], { type: "region", fallback: "code" });
    } catch {
      names = null;
    }
    displayNamesCache.set(locale, names);
  }
  return displayNamesCache.get(locale) ?? null;
}

/** Localized country name (falls back to the code when the runtime has no region data). */
export function countryName(code: string, locale = "en"): string {
  return regionDisplayNames(locale)?.of(code) ?? code;
}

export interface CatalogOption {
  id: string;
  label: string;
  /** Extra text matched by search (e.g. the code or the full official name). */
  keywords: string;
}

/** Countries sorted by localized name, for pickers. */
export function countryOptions(locale = "en"): CatalogOption[] {
  const collator = new Intl.Collator(locale);
  return countryCodes
    .map((code) => ({ id: code, label: countryName(code, locale), keywords: code }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

export interface UsMetroArea {
  /** Stable slug stored on campaigns. Never change an existing ID. */
  id: string;
  /** Short label for chips and summaries. */
  shortName: string;
  /** Metropolitan Statistical Area title as published by the U.S. Census Bureau. */
  name: string;
}

/**
 * The 50 most populous US Metropolitan Statistical Areas, using U.S. Census
 * Bureau Vintage 2023 population estimates and the 2023 OMB delineation
 * titles, listed in approximately descending population. Refresh against the
 * latest Census release before launch; IDs stay stable when titles change.
 */
export const usMetroAreas: readonly UsMetroArea[] = [
  { id: "new-york", shortName: "New York", name: "New York-Newark-Jersey City, NY-NJ" },
  { id: "los-angeles", shortName: "Los Angeles", name: "Los Angeles-Long Beach-Anaheim, CA" },
  { id: "chicago", shortName: "Chicago", name: "Chicago-Naperville-Elgin, IL-IN" },
  { id: "dallas-fort-worth", shortName: "Dallas–Fort Worth", name: "Dallas-Fort Worth-Arlington, TX" },
  { id: "houston", shortName: "Houston", name: "Houston-Pasadena-The Woodlands, TX" },
  { id: "atlanta", shortName: "Atlanta", name: "Atlanta-Sandy Springs-Roswell, GA" },
  { id: "washington-dc", shortName: "Washington, DC", name: "Washington-Arlington-Alexandria, DC-VA-MD-WV" },
  { id: "philadelphia", shortName: "Philadelphia", name: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD" },
  { id: "miami", shortName: "Miami", name: "Miami-Fort Lauderdale-West Palm Beach, FL" },
  { id: "phoenix", shortName: "Phoenix", name: "Phoenix-Mesa-Chandler, AZ" },
  { id: "boston", shortName: "Boston", name: "Boston-Cambridge-Newton, MA-NH" },
  { id: "riverside-san-bernardino", shortName: "Riverside–San Bernardino", name: "Riverside-San Bernardino-Ontario, CA" },
  { id: "san-francisco-oakland", shortName: "San Francisco–Oakland", name: "San Francisco-Oakland-Fremont, CA" },
  { id: "detroit", shortName: "Detroit", name: "Detroit-Warren-Dearborn, MI" },
  { id: "seattle", shortName: "Seattle", name: "Seattle-Tacoma-Bellevue, WA" },
  { id: "minneapolis-st-paul", shortName: "Minneapolis–St. Paul", name: "Minneapolis-St. Paul-Bloomington, MN-WI" },
  { id: "tampa", shortName: "Tampa", name: "Tampa-St. Petersburg-Clearwater, FL" },
  { id: "san-diego", shortName: "San Diego", name: "San Diego-Chula Vista-Carlsbad, CA" },
  { id: "denver", shortName: "Denver", name: "Denver-Aurora-Centennial, CO" },
  { id: "baltimore", shortName: "Baltimore", name: "Baltimore-Columbia-Towson, MD" },
  { id: "orlando", shortName: "Orlando", name: "Orlando-Kissimmee-Sanford, FL" },
  { id: "charlotte", shortName: "Charlotte", name: "Charlotte-Concord-Gastonia, NC-SC" },
  { id: "st-louis", shortName: "St. Louis", name: "St. Louis, MO-IL" },
  { id: "san-antonio", shortName: "San Antonio", name: "San Antonio-New Braunfels, TX" },
  { id: "portland-or", shortName: "Portland, OR", name: "Portland-Vancouver-Hillsboro, OR-WA" },
  { id: "austin", shortName: "Austin", name: "Austin-Round Rock-San Marcos, TX" },
  { id: "pittsburgh", shortName: "Pittsburgh", name: "Pittsburgh, PA" },
  { id: "sacramento", shortName: "Sacramento", name: "Sacramento-Roseville-Folsom, CA" },
  { id: "las-vegas", shortName: "Las Vegas", name: "Las Vegas-Henderson-North Las Vegas, NV" },
  { id: "cincinnati", shortName: "Cincinnati", name: "Cincinnati, OH-KY-IN" },
  { id: "kansas-city", shortName: "Kansas City", name: "Kansas City, MO-KS" },
  { id: "columbus-oh", shortName: "Columbus, OH", name: "Columbus, OH" },
  { id: "cleveland", shortName: "Cleveland", name: "Cleveland, OH" },
  { id: "indianapolis", shortName: "Indianapolis", name: "Indianapolis-Carmel-Greenwood, IN" },
  { id: "nashville", shortName: "Nashville", name: "Nashville-Davidson--Murfreesboro--Franklin, TN" },
  { id: "san-jose", shortName: "San Jose", name: "San Jose-Sunnyvale-Santa Clara, CA" },
  { id: "virginia-beach", shortName: "Virginia Beach", name: "Virginia Beach-Chesapeake-Norfolk, VA-NC" },
  { id: "jacksonville-fl", shortName: "Jacksonville, FL", name: "Jacksonville, FL" },
  { id: "providence", shortName: "Providence", name: "Providence-Warwick, RI-MA" },
  { id: "milwaukee", shortName: "Milwaukee", name: "Milwaukee-Waukesha, WI" },
  { id: "raleigh", shortName: "Raleigh", name: "Raleigh-Cary, NC" },
  { id: "oklahoma-city", shortName: "Oklahoma City", name: "Oklahoma City, OK" },
  { id: "louisville", shortName: "Louisville", name: "Louisville/Jefferson County, KY-IN" },
  { id: "richmond-va", shortName: "Richmond, VA", name: "Richmond, VA" },
  { id: "memphis", shortName: "Memphis", name: "Memphis, TN-MS-AR" },
  { id: "salt-lake-city", shortName: "Salt Lake City", name: "Salt Lake City-Murray, UT" },
  { id: "birmingham-al", shortName: "Birmingham, AL", name: "Birmingham, AL" },
  { id: "fresno", shortName: "Fresno", name: "Fresno, CA" },
  { id: "buffalo", shortName: "Buffalo", name: "Buffalo-Cheektowaga, NY" },
  { id: "hartford", shortName: "Hartford", name: "Hartford-West Hartford-East Hartford, CT" },
];

const metroById: ReadonlyMap<string, UsMetroArea> = new Map(usMetroAreas.map((m) => [m.id, m]));

export function isUsMetroId(value: string): boolean {
  return metroById.has(value);
}

export function usMetroArea(id: string): UsMetroArea | null {
  return metroById.get(id) ?? null;
}

/** Short label for a stored metro ID (the raw ID if it is no longer in the catalog). */
export function usMetroLabel(id: string): string {
  return metroById.get(id)?.shortName ?? id;
}

/** Metros sorted by short name, searchable by their full Census title. */
export function usMetroOptions(): CatalogOption[] {
  return [...usMetroAreas]
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "en"))
    .map((m) => ({ id: m.id, label: m.shortName, keywords: m.name }));
}

/**
 * The US metro filter only means something when US creators are in scope:
 * no country filter (all countries) or a country filter that includes the US.
 */
export function metroTargetingApplies(countries: readonly string[]): boolean {
  return countries.length === 0 || countries.includes(US_COUNTRY_CODE);
}

/** Case- and accent-insensitive match of a search query against an option. */
export function matchesCatalogQuery(option: CatalogOption, query: string): boolean {
  const q = foldForSearch(query.trim());
  if (!q) return true;
  return foldForSearch(`${option.label} ${option.keywords}`).includes(q);
}

function foldForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
