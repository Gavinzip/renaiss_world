const WANTED_LEVEL_CAP = Math.max(1, Math.min(99, Number(process.env.WANTED_LEVEL_CAP || 15)));

function capWantedLevel(value = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(WANTED_LEVEL_CAP, Math.floor(num)));
}

function capWantedFloat(value = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(WANTED_LEVEL_CAP, num));
}

module.exports = {
  WANTED_LEVEL_CAP,
  capWantedLevel,
  capWantedFloat
};
