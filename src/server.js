require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const { seedHardcodedAccounts } = require('./seed');
const authRoutes = require('./routes/auth');
const portalRoutes = require('./routes/portal');
const adminRoutes = require('./routes/admin');
const manualRoutes = require('./routes/manual');

seedHardcodedAccounts();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 3600 * 1000 }
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.get('/', (req, res) => res.redirect(req.session.user ? '/portal' : '/login'));

app.use(authRoutes);
app.use(portalRoutes);
app.use(adminRoutes);
app.use(manualRoutes);

app.use((req, res) => res.status(404).render('error', { message: 'Page not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong: ' + err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VASUP-Testdata running at http://localhost:${PORT}`);
  console.log(`SMTP configured: ${Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)}`);
  console.log(`Anthropic API configured: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
});
