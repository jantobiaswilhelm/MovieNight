// Admin Discord IDs that can delete content
const ADMIN_IDS = ['255041448028667904'];

export const isAdmin = (discordId) => {
  return ADMIN_IDS.includes(discordId);
};
