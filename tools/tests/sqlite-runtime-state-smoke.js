const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createSqliteMirroredObjectRepository,
  createSqliteMirroredSingletonStore
} = require('../../modules/systems/data/sqlite-mirrored-state');

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-sqlite-state-'));
  const objectMirror = path.join(tempDir, 'wallets.json');
  const singletonMirror = path.join(tempDir, 'scratch.json');
  const objectNamespace = `smoke_wallets_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const singletonNamespace = `smoke_scratch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    fs.writeFileSync(objectMirror, JSON.stringify({
      u1: { walletAddress: '0xabc', pendingRNS: 7 }
    }, null, 2), 'utf8');
    fs.writeFileSync(singletonMirror, JSON.stringify({
      jackpotPool: 100,
      plays: 2,
      wins: 1,
      losses: 1
    }, null, 2), 'utf8');

    const objectRepo = createSqliteMirroredObjectRepository({
      namespace: objectNamespace,
      mirrorFilePath: objectMirror,
      normalizeAll: (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {},
      normalizeEntry: (entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? {
        ...entry,
        walletAddress: String(entry.walletAddress || '').toLowerCase().trim()
      } : null
    });
    const singletonStore = createSqliteMirroredSingletonStore({
      namespace: singletonNamespace,
      mirrorFilePath: singletonMirror,
      defaultValueFactory: () => ({ jackpotPool: 0, plays: 0, wins: 0, losses: 0 }),
      normalize: (value) => ({
        jackpotPool: Math.max(0, Number(value?.jackpotPool || 0)),
        plays: Math.max(0, Number(value?.plays || 0)),
        wins: Math.max(0, Number(value?.wins || 0)),
        losses: Math.max(0, Number(value?.losses || 0))
      })
    });

    const seededWallet = objectRepo.getEntry('u1');
    if (!seededWallet || seededWallet.walletAddress !== '0xabc' || seededWallet.pendingRNS !== 7) {
      throw new Error('object repo failed to import legacy JSON mirror');
    }

    objectRepo.setEntry('u2', { walletAddress: '0xDEF', pendingRNS: 11 });
    objectRepo.updateEntry('u1', (draft) => ({
      ...draft,
      pendingRNS: 9
    }));
    objectRepo.deleteEntry('missing');
    await objectRepo.flush();

    const objectMirrorSaved = JSON.parse(fs.readFileSync(objectMirror, 'utf8'));
    if (objectMirrorSaved.u2?.walletAddress !== '0xdef') {
      throw new Error('object repo did not normalize or mirror sqlite write');
    }
    if (objectMirrorSaved.u1?.pendingRNS !== 9) {
      throw new Error('object repo update did not persist to mirror');
    }

    const seededScratch = singletonStore.read();
    if (seededScratch.jackpotPool !== 100 || seededScratch.plays !== 2) {
      throw new Error('singleton store failed to import legacy JSON mirror');
    }

    singletonStore.update((state) => ({
      ...state,
      jackpotPool: state.jackpotPool + 50,
      plays: state.plays + 1
    }));
    await singletonStore.flush();

    const singletonMirrorSaved = JSON.parse(fs.readFileSync(singletonMirror, 'utf8'));
    if (singletonMirrorSaved.jackpotPool !== 150 || singletonMirrorSaved.plays !== 3) {
      throw new Error('singleton store did not persist to mirror');
    }

    console.log('OK sqlite-runtime-state-smoke');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
