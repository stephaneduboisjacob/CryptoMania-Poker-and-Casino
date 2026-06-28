// Blind structure: doubles every 5 minutes
const BLIND_LEVELS = [
  { level: 1, small: 50,   big: 100   },
  { level: 2, small: 100,  big: 200   },
  { level: 3, small: 200,  big: 400   },
  { level: 4, small: 400,  big: 800   },
  { level: 5, small: 800,  big: 1600  },
  { level: 6, small: 1600, big: 3200  },
  { level: 7, small: 3200, big: 6400  },
  { level: 8, small: 6400, big: 12800 },
];

const LEVEL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function getCurrentBlindLevel(startTime) {
  const elapsed = Date.now() - new Date(startTime).getTime();
  const levelIndex = Math.min(Math.floor(elapsed / LEVEL_DURATION_MS), BLIND_LEVELS.length - 1);
  return BLIND_LEVELS[levelIndex];
}

function getTimeToNextLevel(startTime) {
  const elapsed = Date.now() - new Date(startTime).getTime();
  const levelIndex = Math.floor(elapsed / LEVEL_DURATION_MS);
  if (levelIndex >= BLIND_LEVELS.length - 1) return 0;
  return LEVEL_DURATION_MS - (elapsed % LEVEL_DURATION_MS);
}

module.exports = { BLIND_LEVELS, getCurrentBlindLevel, getTimeToNextLevel };
