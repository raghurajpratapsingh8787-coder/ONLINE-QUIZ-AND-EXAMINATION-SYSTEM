import { store } from '../repositories/store';
import { buildSeedState } from './seedData';

async function main() {
  await store.init();
  const seed = await buildSeedState();
  await store.resetAndSeed(seed);
  console.log(`[Seed] Seeded ${seed.users.length} users, ${seed.exams.length} exams, ${seed.questions.length} questions in ${store.mode} mode.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
