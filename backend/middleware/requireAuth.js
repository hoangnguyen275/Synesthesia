
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }

  const token = authorization.slice(7).trim();

  if (!token || !process.env.JWT_ACCESS_SECRET) {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.',
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET,
      { algorithms: ['HS256'] }
    );

    if (
      typeof payload !== 'object' ||
      typeof payload.userId !== 'string'
    ) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload.',
      });
    }

    req.userId = payload.userId;

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token is invalid or expired.',
    });
  }
}

module.exports = requireAuth;
