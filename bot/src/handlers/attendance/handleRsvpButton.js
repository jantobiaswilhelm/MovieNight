import {
  findOrCreateUser,
  toggleAttendance,
  getAttendees,
  getMovieNightForAnnouncement
} from '../../models/index.js';
import {
  buildAnnouncementEmbed,
  buildAnnouncementComponents,
  toAnnouncementView
} from '../../utils/announcementEmbed.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleRsvpButton');

/**
 * Toggle the clicker's attendance and re-render the announcement in place.
 *
 * interaction.update edits the message the button lives on, atomically, with no
 * channel fetch and no permission check. Two people clicking at once each
 * re-read the attendee list from the database first, so whoever writes last
 * still renders the truth — no lost RSVPs, worst case a redundant render.
 */
export async function handleRsvpButton(interaction) {
  try {
    const movieNightId = parseInt(interaction.customId.split('_')[1], 10);

    if (!movieNightId) {
      return interaction.reply({ content: 'Invalid RSVP button.', ephemeral: true });
    }

    const movie = await getMovieNightForAnnouncement(movieNightId);

    // Cancelled nights delete their row, but the message may still be sitting
    // in the channel with a live-looking button.
    if (!movie || movie.guild_id !== interaction.guildId) {
      return interaction.reply({
        content: 'This movie night no longer exists.',
        ephemeral: true
      });
    }

    if (movie.started_at) {
      return interaction.reply({
        content: 'This movie has already started.',
        ephemeral: true
      });
    }

    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    const nowAttending = await toggleAttendance(movieNightId, user.id);
    const attendees = await getAttendees(movieNightId);

    const view = toAnnouncementView(movie, { attendees });

    await interaction.update({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    logger.info(
      `${interaction.user.username} ${nowAttending ? 'joined' : 'left'} movie night ${movieNightId}`
    );
  } catch (err) {
    logger.error('Error handling RSVP button', err);
    const message = { content: 'There was an error updating your RSVP.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
}
