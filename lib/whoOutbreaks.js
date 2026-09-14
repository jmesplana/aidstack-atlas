const WHO_DONS_BASE_URL = 'https://www.who.int';
const WHO_DONS_ITEM_BASE_URL = 'https://www.who.int/emergencies/disease-outbreak-news/item';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const MAX_GEOCODE_CANDIDATES_PER_REPORT = 20;
const MAX_GEOCODE_RESULTS_PER_RESPONSE = 80;

const geocodeCache = new Map();

const COUNTRY_FALLBACK_CENTROIDS = [
  { name: 'Democratic Republic of the Congo', aliases: ['democratic republic of the congo', 'dr congo', 'drc', 'congo kinshasa'], latitude: -2.879866, longitude: 23.656378 },
  { name: 'Republic of the Congo', aliases: ['republic of the congo', 'congo brazzaville'], latitude: -0.228021, longitude: 15.827659 },
  { name: 'Uganda', aliases: ['uganda'], latitude: 1.373333, longitude: 32.290275 },
  { name: 'Rwanda', aliases: ['rwanda'], latitude: -1.940278, longitude: 29.873888 },
  { name: 'Burundi', aliases: ['burundi'], latitude: -3.373056, longitude: 29.918886 },
  { name: 'Tanzania', aliases: ['tanzania', 'united republic of tanzania'], latitude: -6.369028, longitude: 34.888822 },
  { name: 'Kenya', aliases: ['kenya'], latitude: -0.023559, longitude: 37.906193 },
  { name: 'Angola', aliases: ['angola'], latitude: -11.202692, longitude: 17.873887 },
  { name: 'Zambia', aliases: ['zambia'], latitude: -13.133897, longitude: 27.849332 },
  { name: 'South Sudan', aliases: ['south sudan'], latitude: 6.876992, longitude: 31.306979 },
  { name: 'Central African Republic', aliases: ['central african republic', 'car'], latitude: 6.611111, longitude: 20.939444 },
  { name: 'Cameroon', aliases: ['cameroon'], latitude: 7.369722, longitude: 12.354722 },
  { name: 'Nigeria', aliases: ['nigeria'], latitude: 9.081999, longitude: 8.675277 },
  { name: 'Ghana', aliases: ['ghana'], latitude: 7.946527, longitude: -1.023194 },
  { name: 'Guinea', aliases: ['guinea'], latitude: 9.945587, longitude: -9.696645 },
  { name: 'Liberia', aliases: ['liberia'], latitude: 6.428055, longitude: -9.429499 },
  { name: 'Sierra Leone', aliases: ['sierra leone'], latitude: 8.460555, longitude: -11.779889 },
  { name: 'Senegal', aliases: ['senegal'], latitude: 14.497401, longitude: -14.452362 },
  { name: 'Ethiopia', aliases: ['ethiopia'], latitude: 9.145, longitude: 40.489673 },
  { name: 'Sudan', aliases: ['sudan'], latitude: 12.862807, longitude: 30.217636 },
  { name: 'Egypt', aliases: ['egypt'], latitude: 26.820553, longitude: 30.802498 },
  { name: 'Morocco', aliases: ['morocco'], latitude: 31.791702, longitude: -7.09262 },
  { name: 'South Africa', aliases: ['south africa'], latitude: -30.559482, longitude: 22.937506 },
  { name: 'India', aliases: ['india'], latitude: 20.593684, longitude: 78.96288 },
  { name: 'Pakistan', aliases: ['pakistan'], latitude: 30.375321, longitude: 69.345116 },
  { name: 'Bangladesh', aliases: ['bangladesh'], latitude: 23.684994, longitude: 90.356331 },
  { name: 'Indonesia', aliases: ['indonesia'], latitude: -0.789275, longitude: 113.921327 },
  { name: 'Philippines', aliases: ['philippines', 'the philippines'], latitude: 12.879721, longitude: 121.774017 },
  { name: 'China', aliases: ['china'], latitude: 35.86166, longitude: 104.195397 },
  { name: 'Japan', aliases: ['japan'], latitude: 36.204824, longitude: 138.252924 },
  { name: 'United States', aliases: ['united states', 'united states of america', 'usa', 'us'], latitude: 37.09024, longitude: -95.712891 },
  { name: 'Canada', aliases: ['canada'], latitude: 56.130366, longitude: -106.346771 },
  { name: 'Mexico', aliases: ['mexico'], latitude: 23.634501, longitude: -102.552784 },
  { name: 'Brazil', aliases: ['brazil'], latitude: -14.235004, longitude: -51.92528 },
  { name: 'Argentina', aliases: ['argentina'], latitude: -38.416097, longitude: -63.616672 },
  { name: 'United Kingdom', aliases: ['united kingdom', 'uk', 'great britain'], latitude: 55.378051, longitude: -3.435973 },
  { name: 'France', aliases: ['france'], latitude: 46.227638, longitude: 2.213749 },
  { name: 'Germany', aliases: ['germany'], latitude: 51.165691, longitude: 10.451526 },
  { name: 'Spain', aliases: ['spain'], latitude: 40.463667, longitude: -3.74922 },
  { name: 'Italy', aliases: ['italy'], latitude: 41.87194, longitude: 12.56738 },
  { name: 'Turkey', aliases: ['turkey', 'turkiye', 'türkiye'], latitude: 38.963745, longitude: 35.243322 },
  { name: 'Saudi Arabia', aliases: ['saudi arabia'], latitude: 23.885942, longitude: 45.079162 },
  { name: 'Yemen', aliases: ['yemen'], latitude: 15.552727, longitude: 48.516388 }
];

function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWhoSourceUrl(item = {}) {
  if (item.ItemDefaultUrl && /^https?:\/\//i.test(item.ItemDefaultUrl)) {
    return item.ItemDefaultUrl;
  }

  const slug = item.UrlName || item.DonId || String(item.ItemDefaultUrl || '').replace(/^\//, '');
  if (slug) return `${WHO_DONS_ITEM_BASE_URL}/${slug}`;

  if (item.ItemDefaultUrl) return `${WHO_DONS_BASE_URL}${item.ItemDefaultUrl}`;
  return WHO_DONS_ITEM_BASE_URL;
}

function extractDisease(title = '') {
  const parts = String(title).split(/\s*[–-]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || title || 'Unknown disease';
  return parts.slice(0, -1).join(' - ') || parts[0];
}

function buildSearchableText(item = {}) {
  return [
    item.OverrideTitle,
    item.Title,
    stripHtml(item.Summary),
    stripHtml(item.Overview),
    stripHtml(item.Epidemiology),
    stripHtml(item.Assessment),
    stripHtml(item.Response),
    stripHtml(item.Advice),
    stripHtml(item.FurtherInformation)
  ].filter(Boolean).join(' ');
}

function extractMetrics(item = {}) {
  return extractMetricsFromText(buildSearchableText(item));
}

function extractMetricsFromText(text = '') {
  const findNumber = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const value = Number(String(match[1]).replace(/,/g, ''));
        if (Number.isFinite(value)) return value;
      }
    }
    return null;
  };

  const cfrMatch = text.match(/(?:case fatality ratio|case fatality rate|CFR)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/i);

  return {
    cases: findNumber([
      /(?:total of|total|cumulative total of|has reported|reported)\s+([\d,]+)\s+(?:laboratory-confirmed\s+|confirmed\s+|suspected\s+|probable\s+)?cases/i,
      /([\d,]+)\s+(?:laboratory-confirmed\s+|confirmed\s+|suspected\s+|probable\s+)?cases(?:\s+have been|\s+were|\s+has been|\s+reported)/i
    ]),
    deaths: findNumber([
      /(?:including|with|and)\s+([\d,]+)\s+deaths/i,
      /([\d,]+)\s+(?:fatalities|deaths)\s+(?:have been|were|reported)/i
    ]),
    cfr: cfrMatch?.[1] ? Number(cfrMatch[1]) : null
  };
}

function getTitleLocationTail(title = '') {
  const parts = String(title).split(/\s*[–-]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];

  const commaParts = String(title).split(',').map((part) => part.trim()).filter(Boolean);
  return commaParts.length > 1 ? commaParts[commaParts.length - 1] : '';
}

function splitLocationList(value = '') {
  return String(value)
    .replace(/\s+(?:and|&)\s+/gi, ',')
    .split(',')
    .map((part) => cleanLocationCandidate(part))
    .filter(Boolean);
}

function normalizeCountryAlias(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(?:the|republic of|country of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const countryFallbackByAlias = COUNTRY_FALLBACK_CENTROIDS.reduce((index, country) => {
  country.aliases.forEach((alias) => {
    index.set(normalizeCountryAlias(alias), country);
  });
  return index;
}, new Map());

function cleanLocationCandidate(value = '') {
  const cleaned = String(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:province|region|district|territory|state)\b$/i, (match) => match)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '');

  if (cleaned.length < 3 || cleaned.length > 120) return '';
  if (/^(multi[-\s]?locations?|global|worldwide|unknown|not specified)$/i.test(cleaned)) return '';
  if (/\b(?:hantavirus|virus|infection|disease|outbreak|case|cases|contact|contacts|surveillance|confirmed|suspected|probable|health organization)\b/i.test(cleaned)) return '';
  if (/[.?!]/.test(cleaned)) return '';
  if (/^\d/.test(cleaned)) return '';
  return cleaned;
}

function addCandidate(candidates, phrase, context = '', source = 'text') {
  const cleanPhrase = cleanLocationCandidate(phrase);
  if (!cleanPhrase) return;

  const cleanContext = cleanLocationCandidate(context);
  const query = cleanContext && !cleanPhrase.toLowerCase().includes(cleanContext.toLowerCase())
    ? `${cleanPhrase}, ${cleanContext}`
    : cleanPhrase;
  const key = query.toLowerCase();

  if (!candidates.some((candidate) => candidate.key === key)) {
    candidates.push({
      key,
      query,
      phrase: cleanPhrase,
      source
    });
  }
}

function getCountryFallbackForCandidate(candidate = {}) {
  const values = [
    candidate.phrase,
    candidate.query,
    candidate.country,
    candidate.locationName
  ].filter(Boolean);

  for (const value of values) {
    const parts = splitLocationList(value);
    for (const part of parts.length ? parts : [value]) {
      const normalized = normalizeCountryAlias(part);
      const country = countryFallbackByAlias.get(normalized);
      if (!country) continue;

      return {
        name: country.name,
        type: 'country',
        country: country.name,
        admin1: null,
        latitude: country.latitude,
        longitude: country.longitude,
        confidence: 'country-fallback',
        source: 'country_fallback',
        geocoderDisplayName: country.name,
        geocoderClass: 'fallback',
        geocoderType: 'country',
        query: candidate.query || country.name,
        phrase: candidate.phrase || country.name
      };
    }
  }

  return null;
}

function buildCountryFallbackLocations(candidates = []) {
  const locations = [];
  const seenCountries = new Set();

  candidates.forEach((candidate) => {
    const location = getCountryFallbackForCandidate(candidate);
    if (!location || seenCountries.has(location.country)) return;
    seenCountries.add(location.country);
    locations.push(location);
  });

  return locations;
}

function extractLocationCandidates(item = {}) {
  const title = item.OverrideTitle || item.Title || '';
  const titleTail = getTitleLocationTail(title);
  const text = buildSearchableText(item);
  const candidates = [];
  const titleContexts = splitLocationList(titleTail);

  titleContexts.forEach((part) => addCandidate(candidates, part, '', 'title'));

  if (Array.isArray(item.AiLocationCandidates)) {
    item.AiLocationCandidates.forEach((candidate) => {
      const location = [
        candidate.locationName,
        candidate.admin2,
        candidate.admin1,
        candidate.country
      ].filter(Boolean).join(', ');
      addCandidate(candidates, location, '', 'ai');
    });
  }

  const sharedAdminListPattern = /\b(?:in|from|across|within|concentrated in|reported from)\s+([^.;:()]{3,180}?)\s+(provinces|regions|districts|territories|states|health zones)\b/g;
  for (const match of text.matchAll(sharedAdminListPattern)) {
    const suffix = match[2].replace(/s$/i, '');
    const names = match[1]
      .replace(/\bas well as\b/gi, ',')
      .replace(/\band\b/gi, ',')
      .split(',')
      .map((part) => cleanLocationCandidate(part))
      .filter(Boolean);
    const contexts = titleContexts.length > 0 ? titleContexts : [''];

    names.forEach((name) => {
      contexts.forEach((titleContext) => {
        addCandidate(candidates, `${name} ${suffix}`, titleContext, 'body');
        addCandidate(candidates, name, titleContext, 'body');
      });
    });
  }

  const adminPairPattern = /([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,5}),\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,5})\s+(Province|Region|District|Territory|State|Health Zone)\b/g;
  for (const match of text.matchAll(adminPairPattern)) {
    const context = `${match[2]} ${match[3]}`;
    const contexts = titleContexts.length > 0 ? titleContexts : [''];
    contexts.forEach((titleContext) => {
      addCandidate(candidates, match[1], [context, titleContext].filter(Boolean).join(', '), 'body');
      addCandidate(candidates, context, titleContext, 'body');
    });
  }

  const adminPattern = /\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,5})\s+(Province|Region|District|Territory|State|Health Zone)\b/g;
  for (const match of text.matchAll(adminPattern)) {
    const contexts = titleContexts.length > 0 ? titleContexts : [''];
    contexts.forEach((titleContext) => {
      addCandidate(candidates, `${match[1]} ${match[2]}`, titleContext, 'body');
      if (!/^state$/i.test(match[2])) {
        addCandidate(candidates, match[1], titleContext, 'body');
      }
    });
  }

  const nestedAdminPattern = /\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,3})\s+in\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,4})\s+(Province|Region|District|Territory|State|Health Zone)\b/g;
  for (const match of text.matchAll(nestedAdminPattern)) {
    const contexts = titleContexts.length > 0 ? titleContexts : [''];
    contexts.forEach((titleContext) => {
      addCandidate(candidates, match[1], [`${match[2]} ${match[3]}`, titleContext].filter(Boolean).join(', '), 'body');
    });
  }

  const namedAdminPattern = /\b(?:city|town|village|province|region|district|territory|state)\s+of\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,4})\b/g;
  for (const match of text.matchAll(namedAdminPattern)) {
    const contexts = titleContexts.length > 0 ? titleContexts : [''];
    contexts.forEach((titleContext) => {
      addCandidate(candidates, match[1], titleContext, 'body');
    });
  }

  return candidates.slice(0, MAX_GEOCODE_CANDIDATES_PER_REPORT);
}

function getLocationSnippet(text, phrase, radius = 220) {
  if (!phrase) return '';
  const index = text.toLowerCase().indexOf(String(phrase).toLowerCase());
  if (index < 0) return '';
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + phrase.length + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function inferLocationType(result = {}) {
  const address = result.address || {};
  if (address.city || address.town || address.village || address.hamlet || address.municipality) return 'city';
  if (address.county || address.district || address.suburb) return 'district';
  if (address.state || address.region || address.province) return 'admin1';
  if (address.country) return 'country';
  return result.type || result.class || 'place';
}

function displayNameFromResult(result = {}, fallback = '') {
  const address = result.address || {};
  return address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    address.county ||
    address.district ||
    address.state ||
    address.region ||
    address.province ||
    address.country ||
    result.name ||
    fallback;
}

function getResultClass(result = {}) {
  return result.category || result.class || '';
}

function scoreGeocodeResult(result = {}) {
  const address = result.address || {};
  let score = Number(result.importance) || 0;
  const resultClass = getResultClass(result);

  if (resultClass === 'boundary') score += 4;
  if (resultClass === 'place') score += 3;
  if (address.city || address.town || address.village || address.hamlet || address.municipality) score += 2.5;
  if (address.county || address.district || address.state || address.region || address.province) score += 2;
  if (address.country) score += 1;
  if (result.type === 'administrative') score += 1;

  return score;
}

function selectBestGeocodeResult(results = []) {
  return [...results]
    .filter((entry) => ['boundary', 'place'].includes(getResultClass(entry)))
    .sort((a, b) => {
      const scoreDiff = scoreGeocodeResult(b) - scoreGeocodeResult(a);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''));
    })[0] || null;
}

async function geocodeLocationCandidate(candidate, fetchImpl = fetch) {
  const cacheKey = candidate.query.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', candidate.query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'en');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Aidstack/1.0 (WHO outbreak geocoding; contact: https://github.com/jmesplana/aidstack-atlas)'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const results = await response.json();
    const result = Array.isArray(results) ? selectBestGeocodeResult(results) : null;
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const address = result.address || {};
    const geocoded = {
      name: displayNameFromResult(result, candidate.phrase),
      type: inferLocationType(result),
      country: address.country || null,
      admin1: address.state || address.region || address.province || null,
      latitude,
      longitude,
      confidence: result.importance ? `geocoder:${Number(result.importance).toFixed(2)}` : 'geocoder',
      source: 'nominatim',
      geocoderDisplayName: result.display_name || candidate.query,
      geocoderClass: getResultClass(result) || null,
      geocoderType: result.type || null,
      query: candidate.query,
      phrase: candidate.phrase
    };
    geocodeCache.set(cacheKey, geocoded);
    return geocoded;
  } catch (error) {
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

function dedupeLocations(locations = []) {
  const byKey = new Map();
  locations.forEach((location) => {
    const key = [
      Number(location.latitude).toFixed(4),
      Number(location.longitude).toFixed(4),
      location.name || '',
      location.country || ''
    ].join('|').toLowerCase();
    if (!byKey.has(key)) byKey.set(key, location);
  });
  return Array.from(byKey.values());
}

async function geocodeOutbreakLocations(item = {}, options = {}) {
  const candidates = extractLocationCandidates(item)
    .filter((candidate) => !options.candidateSource || candidate.source === options.candidateSource);
  const text = buildSearchableText(item);
  const fetchImpl = options.fetchImpl || fetch;
  const locations = [];

  for (const candidate of candidates) {
    if (options.geocodeBudget && options.geocodeBudget.remaining <= 0) break;
    if (options.geocodeBudget) options.geocodeBudget.remaining -= 1;

    const location = await geocodeLocationCandidate(candidate, fetchImpl);
    if (!location) continue;

    const snippet = getLocationSnippet(text, candidate.phrase);
    locations.push({
      ...location,
      snippet,
      metrics: snippet ? extractMetricsFromText(snippet) : {}
    });
  }

  if (locations.length === 0) {
    buildCountryFallbackLocations(candidates).forEach((location) => {
      const snippet = getLocationSnippet(text, location.phrase);
      locations.push({
        ...location,
        snippet,
        metrics: snippet ? extractMetricsFromText(snippet) : {}
      });
    });
  }

  return dedupeLocations(locations);
}

async function normalizeWhoOutbreakItem(item = {}, options = {}) {
  const reportDate = item.PublicationDateAndTime || item.PublicationDate || item.DateCreated || null;
  const updatedDate = item.LastModified || null;
  const filterDate = reportDate || updatedDate;
  const title = item.OverrideTitle || item.Title || 'WHO Disease Outbreak News';
  const metrics = extractMetrics(item);
  const locations = options.locations || await geocodeOutbreakLocations(item, options);
  const countries = Array.from(new Set(locations.map((location) => location.country).filter(Boolean)));

  return {
    id: item.DonId || item.Id || item.UrlName || title,
    source: 'WHO DONS',
    sourceUrl: buildWhoSourceUrl(item),
    title,
    disease: extractDisease(title),
    reportDate,
    updatedDate,
    filterDate,
    countries,
    locations,
    metrics,
    summary: stripHtml(item.Summary || item.Overview || '').slice(0, 600),
    raw: item
  };
}

function expandOutbreakMapFeatures(report = {}) {
  return (report.locations || []).map((location, index) => ({
    id: `${report.id}-${location.query || location.name || index}`,
    reportId: report.id,
    source: report.source,
    sourceUrl: report.sourceUrl,
    title: report.title,
    disease: report.disease,
    reportDate: report.reportDate,
    updatedDate: report.updatedDate,
    filterDate: report.filterDate || report.updatedDate || report.reportDate,
    country: location.country,
    locationName: location.name || location.country,
    locationType: location.type || location.confidence,
    admin1: location.admin1 || null,
    latitude: location.latitude,
    longitude: location.longitude,
    locationConfidence: location.confidence,
    locationSource: location.source || 'unknown',
    locationSnippet: location.snippet || '',
    geocoderDisplayName: location.geocoderDisplayName || '',
    affectedCountries: report.countries || [],
    metrics: Object.values(location.metrics || {}).some((value) => value !== null && value !== undefined)
      ? location.metrics
      : report.metrics || {},
    reportMetrics: report.metrics || {},
    summary: report.summary || ''
  }));
}

async function normalizeWhoOutbreakResponse(data = {}, options = {}) {
  const geocodeBudget = {
    remaining: Number.isFinite(options.maxGeocodeQueries)
      ? options.maxGeocodeQueries
      : MAX_GEOCODE_RESULTS_PER_RESPONSE
  };
  const reports = [];

  if (Array.isArray(data.value)) {
    const reportDrafts = data.value.map((item) => ({
      item,
      titleLocations: [],
      aiLocations: [],
      detailLocations: []
    }));

    for (const draft of reportDrafts) {
      draft.titleLocations = await geocodeOutbreakLocations(draft.item, {
        ...options,
        geocodeBudget,
        candidateSource: 'title'
      });
    }

    for (const draft of reportDrafts) {
      draft.aiLocations = await geocodeOutbreakLocations(draft.item, {
        ...options,
        geocodeBudget,
        candidateSource: 'ai'
      });
    }

    if (options.includeDetailLocations !== false) {
      for (const draft of reportDrafts) {
        draft.detailLocations = await geocodeOutbreakLocations(draft.item, {
          ...options,
          geocodeBudget,
          candidateSource: 'body'
        });
      }
    }

    for (const draft of reportDrafts) {
      reports.push(await normalizeWhoOutbreakItem(draft.item, {
        ...options,
        locations: dedupeLocations([
          ...draft.titleLocations,
          ...draft.aiLocations,
          ...draft.detailLocations
        ])
      }));
    }
  }

  const mapFeatures = reports.flatMap(expandOutbreakMapFeatures);
  return { reports, mapFeatures };
}

export {
  WHO_DONS_BASE_URL,
  extractLocationCandidates,
  normalizeWhoOutbreakItem,
  normalizeWhoOutbreakResponse,
  expandOutbreakMapFeatures
};
