// Admin Discord IDs - configurable via ADMIN_IDS env var (comma-separated)
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => id.trim())
  : ['255041448028667904'];

export const isAdmin = (discordId) => {
  return ADMIN_IDS.includes(discordId);
};
