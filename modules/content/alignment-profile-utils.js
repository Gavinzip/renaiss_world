function clampNumber(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function clampInt(value, min, max, fallback = min) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeLocationName(raw = '') {
  return String(raw || '').trim().slice(0, 40);
}

const GOOD_SECRET_REALM_THRESHOLD = clampInt(process.env.GOOD_SECRET_REALM_THRESHOLD, 50, 95, 72);
const SECRET_REALM_BAD_CAP = clampInt(process.env.SECRET_REALM_BAD_CAP, 10, 70, 48);
const BAD_PERSISTENT_HUNT_THRESHOLD = clampInt(process.env.BAD_PERSISTENT_HUNT_THRESHOLD, 45, 95, 62);

function buildDefaultProfile() {
  return {
    goodScore: 50,
    badScore: 50,
    alignmentBias: 0,
    localWanted: 0,
    localPressure: 0,
    wantedBoost: 0,
    wantedFloor: 0,
    secretRealmEligible: false,
    badPersistentHunt: false,
    thresholds: {
      goodSecretRealm: GOOD_SECRET_REALM_THRESHOLD,
      badSecretRealmCap: SECRET_REALM_BAD_CAP,
      badPersistentHunt: BAD_PERSISTENT_HUNT_THRESHOLD
    }
  };
}

function computeAlignmentProfileFromDynamicState(dynamicWorld = {}, location = '') {
  const profile = buildDefaultProfile();
  if (!dynamicWorld || typeof dynamicWorld !== 'object') return profile;

  const loc = normalizeLocationName(location || '');
  const rep = dynamicWorld.factionRep && typeof dynamicWorld.factionRep === 'object'
    ? dynamicWorld.factionRep
    : {};
  const axes = dynamicWorld.moralityAxes && typeof dynamicWorld.moralityAxes === 'object'
    ? dynamicWorld.moralityAxes
    : {};
  const wantedByLocation = dynamicWorld.wantedByLocation && typeof dynamicWorld.wantedByLocation === 'object'
    ? dynamicWorld.wantedByLocation
    : {};
  const pressureByLocation = dynamicWorld.pressureByLocation && typeof dynamicWorld.pressureByLocation === 'object'
    ? dynamicWorld.pressureByLocation
    : {};

  const law = clampNumber(axes.law, -120, 120, 0);
  const harm = clampNumber(axes.harm, -120, 120, 0);
  const trust = clampNumber(axes.trust, -120, 120, 0);
  const selfInterest = clampNumber(axes.selfInterest, -120, 120, 0);

  const beacon = clampNumber(rep.beacon, -120, 120, 0);
  const gray = clampNumber(rep.gray, -120, 120, 0);
  const digital = clampNumber(rep.digital, -120, 120, 0);
  const civic = clampNumber(rep.civic, -120, 120, 0);

  const localWanted = loc ? clampNumber(wantedByLocation[loc], 0, 12, 0) : 0;
  const localPressure = loc ? clampNumber(pressureByLocation[loc], 0, 24, 0) : 0;

  const goodRaw =
    law * 0.18 +
    trust * 0.2 +
    Math.max(0, -harm) * 0.2 +
    Math.max(0, -selfInterest) * 0.14 +
    beacon * 0.12 +
    civic * 0.12 +
    Math.max(0, -digital) * 0.1 +
    Math.max(0, -gray) * 0.06;

  const badRaw =
    Math.max(0, -law) * 0.16 +
    Math.max(0, harm) * 0.22 +
    Math.max(0, -trust) * 0.12 +
    Math.max(0, selfInterest) * 0.18 +
    Math.max(0, digital) * 0.14 +
    Math.max(0, gray) * 0.08 +
    localWanted * 3.6 +
    localPressure * 1.2;

  const goodScore = clampInt(50 + goodRaw, 0, 100, 50);
  const badScore = clampInt(50 + badRaw, 0, 100, 50);

  const wantedBoost = badScore >= 85
    ? 3
    : (badScore >= 74
      ? 2
      : (badScore >= BAD_PERSISTENT_HUNT_THRESHOLD ? 1 : 0));

  const wantedFloor = badScore >= 88
    ? 4
    : (badScore >= 76
      ? 3
      : (badScore >= BAD_PERSISTENT_HUNT_THRESHOLD ? 2 : 0));

  profile.goodScore = goodScore;
  profile.badScore = badScore;
  profile.alignmentBias = goodScore - badScore;
  profile.localWanted = Number(localWanted.toFixed(2));
  profile.localPressure = Number(localPressure.toFixed(2));
  profile.wantedBoost = wantedBoost;
  profile.wantedFloor = wantedFloor;
  profile.secretRealmEligible = (
    goodScore >= GOOD_SECRET_REALM_THRESHOLD &&
    badScore <= SECRET_REALM_BAD_CAP &&
    localWanted <= 2.5 &&
    localPressure <= 8
  );
  profile.badPersistentHunt = badScore >= BAD_PERSISTENT_HUNT_THRESHOLD;
  return profile;
}

function computeAlignmentProfileFromPlayer(player = null, location = '') {
  if (!player || typeof player !== 'object') return buildDefaultProfile();
  const loc = normalizeLocationName(location || player.location || '');
  const dynamicWorld = player.dynamicWorld && typeof player.dynamicWorld === 'object'
    ? player.dynamicWorld
    : {};
  return computeAlignmentProfileFromDynamicState(dynamicWorld, loc);
}

module.exports = {
  GOOD_SECRET_REALM_THRESHOLD,
  SECRET_REALM_BAD_CAP,
  BAD_PERSISTENT_HUNT_THRESHOLD,
  computeAlignmentProfileFromDynamicState,
  computeAlignmentProfileFromPlayer
};
