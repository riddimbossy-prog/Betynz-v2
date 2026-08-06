export function hasVenueStats(stats) {
  return Boolean(stats?.homeSplit || stats?.awaySplit);
}

export function mergeMissingPrimaryFirst(primary, secondary) {
  if (primary === undefined || primary === null || primary === '') return secondary;
  if (Array.isArray(primary)) return primary.length ? primary : (Array.isArray(secondary) ? secondary : primary);
  if (primary && typeof primary === 'object' && !Array.isArray(primary)) {
    const output = { ...primary };
    if (secondary && typeof secondary === 'object' && !Array.isArray(secondary)) {
      for (const [key, value] of Object.entries(secondary)) {
        output[key] = mergeMissingPrimaryFirst(primary[key], value);
      }
    }
    return output;
  }
  return primary;
}

export function combinePrimaryAndSecondaryStats(primaryStats, secondaryStats) {
  const primaryAvailable = hasVenueStats(primaryStats);
  const secondaryAvailable = hasVenueStats(secondaryStats);
  const combined = mergeMissingPrimaryFirst(primaryStats || null, secondaryStats || null);
  if (!combined) return null;
  return {
    ...combined,
    source: primaryAvailable ? 'SPORTYBET_CUSTOM_API' : secondaryAvailable ? 'API_FOOTBALL_FALLBACK' : null,
    primarySource: 'SPORTYBET_CUSTOM_API',
    enrichmentSource: secondaryAvailable ? 'API_FOOTBALL' : null,
    primaryAvailable,
    enrichmentAvailable: secondaryAvailable,
    sourcePriority: ['SPORTYBET_CUSTOM_API', 'API_FOOTBALL']
  };
}
