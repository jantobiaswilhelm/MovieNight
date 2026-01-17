import './Commands.css';

const commands = [
  {
    name: '/announce',
    description: 'Announce a new movie night',
    usage: '/announce title:"Movie Name" datetime:"tomorrow 8pm" image:"poster-url"',
    details: 'Schedule a movie night and post an announcement with rating buttons. The image is required and will be shown in the embed.',
    category: 'Movies'
  },
  {
    name: '/rate',
    description: 'Rate a movie',
    usage: '/rate movie:"Movie Name" score:8.5',
    details: 'Rate a movie with half-point precision (1-10). Use this for ratings like 7.5 or 8.5 that aren\'t available on the buttons.',
    category: 'Movies'
  },
  {
    name: '/history',
    description: 'View movie history',
    usage: '/history',
    details: 'See all past movie nights with their average ratings and vote counts.',
    category: 'Movies'
  },
  {
    name: '/startvote',
    description: 'Start a voting session',
    usage: '/startvote datetime:"Saturday 8pm"',
    details: 'Start a new voting session with interactive buttons. Users can click "Add Suggestion" to suggest movies and vote with buttons. The message auto-updates as votes come in.',
    category: 'Voting'
  },
  {
    name: '/suggest',
    description: 'Suggest a movie for voting',
    usage: '/suggest title:"Movie Name" image:"poster-url"',
    details: 'Alternative way to add a movie suggestion. You can also use the "Add Suggestion" button on the voting message.',
    category: 'Voting'
  },
  {
    name: '/endvote',
    description: 'End voting and announce winner',
    usage: '/endvote or /endvote datetime:"Sunday 9pm"',
    details: 'Close the voting session, announce the winner, and automatically create a movie night announcement. Optionally override the planned datetime.',
    category: 'Voting'
  },
  {
    name: '/stats',
    description: 'View server statistics',
    usage: '/stats',
    details: 'See overall stats including total movies watched, top rated movies, and most active raters.',
    category: 'Stats'
  },
  {
    name: '/myratings',
    description: 'View your ratings',
    usage: '/myratings',
    details: 'See all the movies you\'ve rated and your personal average score.',
    category: 'Stats'
  },
  {
    name: '/help',
    description: 'Show help message',
    usage: '/help',
    details: 'Display all available commands in Discord.',
    category: 'Other'
  },
  {
    name: '/admin',
    description: 'Show admin controls (Admin only)',
    usage: '/admin',
    details: 'Shows delete buttons on the voting message. Only available to server admins.',
    category: 'Admin'
  },
  {
    name: '/delete',
    description: 'Delete a movie (Admin only)',
    usage: '/delete movie:"Movie Name"',
    details: 'Permanently delete a movie and all its ratings. Only available to server admins.',
    category: 'Admin'
  }
];

const Commands = () => {
  return (
    <div className="commands-page">
      <h1>Bot Commands</h1>
      <p className="commands-intro">
        Use these commands in Discord to interact with the Movie Night bot.
      </p>

      <div className="commands-list">
        {commands.map((cmd) => (
          <div key={cmd.name} className="command-card">
            <div className="command-header">
              <code className="command-name">{cmd.name}</code>
              <span className="command-desc">{cmd.description}</span>
            </div>
            <div className="command-usage">
              <span className="usage-label">Usage:</span>
              <code>{cmd.usage}</code>
            </div>
            <p className="command-details">{cmd.details}</p>
          </div>
        ))}
      </div>

      <div className="commands-tip">
        <h3>Quick Tip</h3>
        <p>
          You can also rate movies by clicking the number buttons that appear
          under movie announcements. Use the <code>/rate</code> command for
          half-point ratings like 7.5 or 8.5.
        </p>
      </div>
    </div>
  );
};

export default Commands;
