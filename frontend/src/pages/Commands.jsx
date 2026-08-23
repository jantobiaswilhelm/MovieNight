import { PageHeader, SectionHead, Chip } from '../components/ui';
import './Commands.css';

const commands = [
  { name: '/announce',   description: 'Announce a new movie night',       usage: '/announce title:"Movie Name" datetime:"tomorrow 8pm" image:"poster-url"', details: 'Schedule a movie night and post an announcement with rating buttons. The image is required and will be shown in the embed.', category: 'Movies' },
  { name: '/rate',       description: 'Rate a movie',                     usage: '/rate movie:"Movie Name" score:8.5', details: "Rate a movie with half-point precision (1-10). Use this for ratings like 7.5 or 8.5 that aren't available on the buttons.", category: 'Movies' },
  { name: '/next',       description: "See what's coming up",              usage: '/next count:5', details: 'Upcoming movie nights with runtime, RSVPs and marathon progress. Buttons switch the board to a month calendar or to the marathons still running.', category: 'Movies' },
  { name: '/history',    description: 'View movie history',               usage: '/history', details: 'See all past movie nights with their average ratings and vote counts.', category: 'Movies' },
  { name: '/stats',      description: 'View server statistics',           usage: '/stats', details: 'See overall stats including total movies watched, top rated movies, and most active raters.', category: 'Stats' },
  { name: '/myratings',  description: 'View your ratings',                usage: '/myratings', details: "See all the movies you've rated and your personal average score.", category: 'Stats' },
  { name: '/top10',      description: 'View your top 10',                 usage: '/top10', details: 'Your ten highest-rated films, ranked.', category: 'Stats' },
  { name: '/help',       description: 'Show help message',                usage: '/help', details: 'Display all available commands in Discord.', category: 'Other' },
  { name: '/delete',     description: 'Delete a movie (Admin only)',      usage: '/delete movie:"Movie Name"', details: 'Permanently delete a movie and all its ratings. Only available to server admins.', category: 'Admin' },
  { name: '/start',      description: 'Manually start a movie night (Admin only)', usage: '/start movie:"Movie Name"', details: 'Manually trigger the "starting now" announcement for a movie. Movies normally start automatically at their scheduled time.', category: 'Admin' },
  { name: '/reschedule', description: 'Reschedule a movie night (Admin only)',      usage: '/reschedule movie:"Movie Name" datetime:"new time"', details: "Change the scheduled time for a movie that hasn't started yet. Only available to server admins.", category: 'Admin' }
];

const CATEGORY_ORDER = ['Movies', 'Stats', 'Other', 'Admin'];
const CATEGORY_NUMS = { Movies: '01', Stats: '02', Other: '03', Admin: '04' };

const Commands = () => {
  const grouped = CATEGORY_ORDER.map(cat => ({
    name: cat,
    items: commands.filter(c => c.category === cat)
  })).filter(g => g.items.length > 0);

  return (
    <div className="cmd-page">
      <PageHeader
        eyebrow="Discord commands"
        title={<>The <em>bot.</em></>}
        meta={[`${commands.length} slash commands`, 'for the server']}
      />

      <p className="cmd-intro">
        Every command runs inside the Discord server. Type a slash, pick one,
        fill the arguments in the autocomplete. The web app and the bot share
        the same database — anything you do here shows up there, and vice versa.
      </p>

      {grouped.map(group => (
        <section key={group.name}>
          <SectionHead
            num={CATEGORY_NUMS[group.name] || '06'}
            title={group.name}
            meta={`${group.items.length} command${group.items.length !== 1 ? 's' : ''}`}
          />
          <div className="cmd-list">
            {group.items.map((cmd) => (
              <article key={cmd.name} className="cmd-card">
                <header className="cmd-head">
                  <code className="cmd-name">{cmd.name}</code>
                  {cmd.category === 'Admin' && <Chip variant="accent">Admin</Chip>}
                </header>
                <p className="cmd-desc">{cmd.description}</p>
                <pre className="cmd-usage"><code>{cmd.usage}</code></pre>
                <p className="cmd-details">{cmd.details}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="cmd-tip">
        <SectionHead num="¶" title="A pointer" meta="For raters" />
        <p>
          You can rate movies by tapping the number buttons beneath a screening
          announcement in Discord. The <code>/rate</code> command is for
          half-point verdicts like <em>7.5</em> or <em>8.5</em>.
        </p>
      </section>
    </div>
  );
};

export default Commands;
