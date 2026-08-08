import { normalizeName } from './utils.mjs';

const text = value => String(value ?? '').trim();
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;

export function canonicalFixtureKey(fixture = {}) {
  const providerId = text(fixture?.sourceId || fixture?.id);
  if (providerId) return `FIXTURE:${providerId}`;
  const date = text(fixture?.kickoff || fixture?.date).slice(0, 10);
  return `FIXTURE:${date}:${normalizeName(fixture?.home?.name)}:${normalizeName(fixture?.away?.name)}`;
}

export function canonicalTeamKey(team = {}, fallbackName = '') {
  const id = text(team?.id);
  if (id) return `TEAM:${id}`;
  return `TEAM:${normalizeName(team?.name || fallbackName)}`;
}

export function providerFixtureIdentityRow({ fixture = {}, provider = '', providerFixtureId = null, confidence = 0, verified = false, metadata = {} } = {}) {
  return {
    canonical_key: canonicalFixtureKey(fixture),
    entity_type: 'FIXTURE',
    provider: text(provider).toUpperCase(),
    provider_entity_id: providerFixtureId == null ? null : text(providerFixtureId),
    mapping_confidence: num(confidence),
    verified: Boolean(verified),
    canonical_name: `${text(fixture?.home?.name)} vs ${text(fixture?.away?.name)}`.trim(),
    metadata,
    updated_at: new Date().toISOString()
  };
}

export function providerTeamIdentityRows({ fixture = {}, provider = '', homeProviderId = null, awayProviderId = null, confidence = 0, verified = false, metadata = {} } = {}) {
  const rows = [];
  const pairs = [
    [fixture?.home, homeProviderId, 'HOME'],
    [fixture?.away, awayProviderId, 'AWAY']
  ];
  for (const [team, providerId, side] of pairs) {
    if (!team?.name || providerId == null) continue;
    rows.push({
      canonical_key: canonicalTeamKey(team, team.name),
      entity_type: 'TEAM',
      provider: text(provider).toUpperCase(),
      provider_entity_id: text(providerId),
      mapping_confidence: num(confidence),
      verified: Boolean(verified),
      canonical_name: text(team.name),
      metadata: { ...metadata, side },
      updated_at: new Date().toISOString()
    });
  }
  return rows;
}
