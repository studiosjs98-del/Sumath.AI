const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'sumath-secret-key';

function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.studentId = decoded.studentId;
    next();
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

module.exports = { authenticate };
