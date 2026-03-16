---
paths:
  - "bot/**"
---

# Bot Rules

- Commands export `data` (SlashCommandBuilder) and `execute(interaction)`, optionally `autocomplete(interaction)`
- Commands are auto-discovered from `bot/src/commands/` — just add a new file
- After adding/changing commands, run `cd bot && npm run deploy` to register with Discord
- Cron jobs go in `bot/src/jobs/` and are registered in `bot/src/index.js`
- Bot shares the same database directly — no HTTP calls to backend
- Use `interaction.reply({ ephemeral: true })` for error messages
- ESM modules throughout
