/**
 * Middleware to validate that named route params are positive integers.
 * Usage: router.get('/:id', validateIntParams('id'), handler)
 */
export const validateIntParams = (...paramNames) => (req, res, next) => {
  for (const name of paramNames) {
    const value = parseInt(req.params[name]);
    if (isNaN(value) || value < 1) {
      return res.status(400).json({ error: `Invalid ${name}` });
    }
    req.params[name] = String(value); // normalize to clean integer string
  }
  next();
};

/**
 * Middleware to validate guild_id from query string or request body.
 * Checks req.query.guild_id first, then req.body.guild_id.
 * Sets req.guildId for downstream use.
 * Returns 400 if missing or empty.
 *
 * Usage: router.get('/', validateGuildId, handler)
 */
export const validateGuildId = (req, res, next) => {
  const guildId = req.query.guild_id || (req.body && req.body.guild_id);
  if (!guildId || typeof guildId !== 'string' || guildId.trim() === '') {
    return res.status(400).json({ error: 'guild_id is required' });
  }
  req.guildId = guildId;
  next();
};

/**
 * Middleware to parse and normalize pagination params from query string.
 * Extracts limit and offset, caps limit at 100 (min 1, default 20),
 * ensures offset >= 0 (default 0).
 * Sets req.pagination = { limit, offset } for downstream use.
 *
 * Usage: router.get('/', parsePagination, handler)
 */
export const parsePagination = (req, res, next) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  req.pagination = { limit, offset };
  next();
};

/**
 * Factory that returns middleware validating a specific request field
 * contains a valid date. Checks req.body[field] by default.
 * Accepts YYYY-MM-DD or any format parseable by Date constructor.
 * Sets req.validatedDates[field] to the parsed Date object.
 *
 * Options:
 *   source: 'body' (default) or 'query'
 *   required: true (default) — returns 400 if missing
 *
 * Usage: router.post('/', validateDate('scheduled_at'), handler)
 *        router.get('/', validateDate('date', { source: 'query', required: false }), handler)
 */
export const validateDate = (field, options = {}) => {
  const { source = 'body', required = true } = options;

  return (req, res, next) => {
    const container = source === 'query' ? req.query : req.body;
    const value = container && container[field];

    if (!value) {
      if (required) {
        return res.status(400).json({ error: `${field} is required` });
      }
      return next();
    }

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: `Invalid ${field} date` });
    }

    if (!req.validatedDates) {
      req.validatedDates = {};
    }
    req.validatedDates[field] = parsed;
    next();
  };
};
