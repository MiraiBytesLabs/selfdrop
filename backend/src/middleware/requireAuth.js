import { verifyToken } from '../utils/session.js';

export default function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.admin = verifyToken(token);
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message });
  }
}

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}
