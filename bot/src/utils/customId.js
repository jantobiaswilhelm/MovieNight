// Every interactive surface this bot renders carries its whole request in the
// customId — which view, which page, which sort. Nothing is held in memory, so
// a button pressed days later still works, and it survives a restart. That is
// only safe if both ends agree on the format, so both ends live here.
//
// Discord caps a customId at 100 characters and will happily deliver a stale one
// from an older deploy, so parseId treats its input as hostile: it returns null
// for anything it does not recognise and never throws.

const PREFIX = 'mn';
const SEP = ':';

export const MAX_CUSTOM_ID = 100;

// The allow-list is the contract. A view not named here cannot be built or
// parsed, which keeps a typo from silently producing a dead button.
export const VIEWS = [
  'next',
  'calendar',
  'marathons',
  'history',
  'stats',
  'myratings',
  'top10',
  'board',
  'boardvote',
  'wishlist',
  'wishpick',
  'marathon',
  'hub'
];

const KNOWN = new Set(VIEWS);

export const buildId = (view, ...args) => {
  if (!KNOWN.has(view)) throw new Error(`Unknown view: ${view}`);

  for (const arg of args) {
    if (String(arg).includes(SEP)) {
      throw new Error(`Argument "${arg}" contains the separator and would reparse wrongly`);
    }
  }

  const id = [PREFIX, view, ...args].join(SEP);
  if (id.length > MAX_CUSTOM_ID) {
    throw new Error(`customId "${id}" is too long (${id.length} > ${MAX_CUSTOM_ID})`);
  }
  return id;
};

export const parseId = (customId) => {
  if (typeof customId !== 'string') return null;

  const [prefix, view, ...args] = customId.split(SEP);
  if (prefix !== PREFIX) return null;
  if (!KNOWN.has(view)) return null;

  return { view, args };
};
