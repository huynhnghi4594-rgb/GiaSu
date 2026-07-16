const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'demo_jwt_secret_key_for_testing_2026';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  
  if (!header) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }
  
  const token = header.split(' ')[1];
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    next();
  };
}

module.exports = { 
  authenticate, 
  requireRole,
  JWT_SECRET
};
