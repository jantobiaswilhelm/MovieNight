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
