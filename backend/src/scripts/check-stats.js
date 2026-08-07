// Ad-hoc verification for the new stats queries.
// Usage: node backend/src/scripts/check-stats.js <guildId>
// Requires DATABASE_URL in the environment (use the Railway DB if local Postgres is down).
import 'dotenv/config';
import * as db from '../models/index.js';

const guildId = process.argv[2] || process.env.GUILD_ID;
if (!guildId) {
  console.error('Provide a guildId: node backend/src/scripts/check-stats.js <guildId>');
  process.exit(1);
}

const run = async () => {
  const [topHosts, bestTaste, extremes, loyal, divisive, signature, cadence] = await Promise.all([
    db.getTopHosts(guildId, 5),
    db.getBestTasteHosts(guildId, 5, 3),
    db.getRaterExtremes(guildId, 5),
    db.getMostLoyalAttendees(guildId, 5),
    db.getMostDivisiveFilm(guildId, 3),
    db.getSignatureGenreAndDecade(guildId),
    db.getCadence(guildId)
  ]);
  console.log(JSON.stringify(
    { topHosts, bestTaste, extremes, loyal, divisive, signature, cadence },
    null, 2
  ));
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
