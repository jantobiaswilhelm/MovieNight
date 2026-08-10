import {
  findOrCreateUser,
  toggleAttendance,
  getAttendees,
  getMovieNightForAnnouncement,
  toggleMarathonAttendance,
  getMarathonAttendees,
  getMarathonById,
  getMarathonItemsByMarathon
} from '../../models/index.js';
import {
  buildAnnouncementEmbed,
  buildAnnouncementComponents,
  toAnnouncementView
} from '../../utils/announcementEmbed.js';
import { createBingeAnnouncementEmbed, createBingeComponents } from '../../utils/embeds.js';
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
    // Must come first: 'rsvp_binge_5'.split('_')[1] is 'binge', so the parse
    // below would reject a binge click as an invalid button.
    if (interaction.customId.startsWith('rsvp_binge_')) {
      return await handleBingeRsvp(interaction);
    }

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

/**
 * RSVP for a whole binge evening. Rebuilds the kickoff embed rather than the
 * single-film one, because a binge lists the entire lineup.
 *
 * Deliberately has no try/catch of its own — it is called from inside
 * handleRsvpButton's try block, which reports the error.
 */
async function handleBingeRsvp(interaction) {
  const marathonId = parseInt(interaction.customId.replace('rsvp_binge_', ''), 10);

  if (!marathonId) {
    return interaction.reply({ content: 'Invalid RSVP button.', ephemeral: true });
  }

  const marathon = await getMarathonById(marathonId);
  if (!marathon || marathon.guild_id !== interaction.guildId) {
    return interaction.reply({
      content: 'This marathon no longer exists.',
      ephemeral: true
    });
  }

  const user = await findOrCreateUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.avatar
  );

  const { attending, count } = await toggleMarathonAttendance(marathonId, user.id);
  const attendees = await getMarathonAttendees(marathonId);
  const items = await getMarathonItemsByMarathon(marathonId);

  await interaction.update({
    embeds: [
      createBingeAnnouncementEmbed(
        marathon.name,
        items,
        marathon.created_by_name || 'Website',
        attendees
      )
    ],
    components: createBingeComponents(marathonId, items[0])
  });

  logger.info(
    `${interaction.user.username} ${attending ? 'joined' : 'left'} marathon ${marathonId} (${count} films)`
  );
}
