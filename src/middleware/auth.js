function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['admin', 'sadmin'].includes(req.session.user.role)) {
    return res.status(403).render('error', { message: 'Admin access only.' });
  }
  next();
}

function requireSadmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'sadmin') {
    return res.status(403).render('error', { message: 'Super-admin access only.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSadmin };
