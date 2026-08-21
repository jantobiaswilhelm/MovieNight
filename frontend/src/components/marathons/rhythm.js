// Works out the cadence a marathon is *actually* running at, by measuring the
// gaps between the films already in it.
//
// We measure rather than read a setting because the cadence interval is never
// persisted: `marathons` stores only cadence_type ('interval' | 'binge'), and
// the wizard's weekly/daily/every-N choice is used to autofill dates at build
// time and then discarded. Measuring also survives a host hand-editing dates.

const DAY_MS = 864e5;
const MIN_MS = 60000;

const median = (nums) => {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

// Most common value; ties break toward the smaller gap (a marathon that slipped
// once shouldn't have the slip become its rhythm).
const mode = (nums) => {
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};

const datedInOrder = (items) =>
  items
    .filter((it) => it.scheduled_at)
    .slice()
    .sort((a, b) => a.position - b.position);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @returns null when there isn't enough dated history to measure, else
 *   { kind, label, lastDate, nextDateFor(index, priorFilms) }
 */
export const inferRhythm = (items, cadenceType) => {
  const dated = datedInOrder(items);
  if (dated.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < dated.length; i++) {
    gaps.push(new Date(dated[i].scheduled_at) - new Date(dated[i - 1].scheduled_at));
  }
  const lastItem = dated[dated.length - 1];
  const lastDate = new Date(lastItem.scheduled_at);

  if (cadenceType === 'binge') {
    // One evening: each film starts after the previous one's runtime plus a
    // changeover break. Measure the break, not the gap — runtimes differ.
    const breaks = gaps
      .map((gap, i) => gap - (dated[i].runtime || 120) * MIN_MS)
      .filter((b) => b >= 0);
    const breakMs = median(breaks) ?? 15 * MIN_MS;
    return {
      kind: 'binge',
      label: `back-to-back, with about ${plural(Math.round(breakMs / MIN_MS), 'minute')} between films`,
      lastDate,
      // Each added film starts after the one before it finishes.
      nextDateFor: (index, priorFilms) => {
        // Never start in the past — the API refuses it, and a finished evening's
        // last film is long gone. An hour's lead keeps the proposal comfortably ahead.
        let cursor = Math.max(
          lastDate.getTime() + (lastItem.runtime || 120) * MIN_MS + breakMs,
          Date.now() + 60 * MIN_MS
        );
        for (let i = 0; i < index; i++) {
          cursor += ((priorFilms[i]?.runtime || 120) * MIN_MS) + breakMs;
        }
        return new Date(cursor);
      }
    };
  }

  // Interval: snap each gap to whole days before taking the mode, so an hour of
  // drift from a hand-edited time doesn't read as a different cadence.
  const dayGaps = gaps.map((g) => Math.max(1, Math.round(g / DAY_MS)));
  const stepDays = mode(dayGaps);
  const weekday = lastDate.toLocaleDateString(undefined, { weekday: 'long' });
  const time = lastDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const every = stepDays === 7 ? `every week, ${weekday}s at ${time}`
    : stepDays === 1 ? `daily at ${time}`
    : `every ${plural(stepDays, 'day')} at ${time}`;

  // The first slot after the last dated film — but never one that has already
  // passed. A marathon whose films have all aired would otherwise propose dates
  // the API refuses. Stepping by whole cadence steps keeps the weekday and the
  // time of day intact, which is what "the same slot every week" means to a
  // viewer: adding N * 864e5 across a daylight-saving change shifts the
  // wall-clock time by an hour, so an 8pm marathon would quietly become a 9pm
  // one in spring, while setDate keeps the time of day put.
  const firstSlot = () => {
    const d = new Date(lastDate);
    do { d.setDate(d.getDate() + stepDays); } while (d.getTime() <= Date.now());
    return d;
  };

  return {
    kind: 'interval',
    label: every,
    stepDays,
    lastDate,
    nextDateFor: (index) => {
      const next = firstSlot();
      next.setDate(next.getDate() + index * stepDays);
      return next;
    }
  };
};

// How far past the last dated film this addition sits, for the row caption.
export const offsetLabel = (rhythm, index) => {
  if (!rhythm) return null;
  if (rhythm.kind === 'binge') return 'continues the evening';
  return `+${plural(rhythm.stepDays * (index + 1), 'day')} · continues the rhythm`;
};

// Films roll out in lineup order, not date order (the bot's
// getNextPendingMarathonItem sorts by position), so a date earlier than a film
// still ahead in the queue is worth flagging rather than silently reordering.
export const findQueueJumpers = (items, additions) => {
  const pendingLater = items.filter((it) => it.scheduled_at && new Date(it.scheduled_at) > new Date());
  if (pendingLater.length === 0) return [];
  const latest = pendingLater.reduce((a, b) =>
    (new Date(a.scheduled_at) > new Date(b.scheduled_at) ? a : b));
  return additions
    .filter((a) => a.date && new Date(a.date) < new Date(latest.scheduled_at))
    .map((a) => ({ title: a.film.title, behind: latest.title }));
};
