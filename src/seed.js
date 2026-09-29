// Seeds the two hardcoded configuration accounts on every boot so they
// always work regardless of what's in the users store (sadmin/sadmin and
// admin/admin, per the spec - used for internal configuration such as
// banning testers, independent of the approval-based tester accounts).
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');

function seedHardcodedAccounts() {
  db.update((data) => {
    const ensure = (username, password, role, email) => {
      let acct = data.users.find((u) => u.username === username && u.hardcoded);
      const hash = bcrypt.hashSync(password, 10);
      if (!acct) {
        data.users.push({
          id: uuid(),
          hardcoded: true,
          username,
          email,
          name: username === 'sadmin' ? 'Super Admin (Wisanu A.)' : 'Admin',
          role,
          status: 'approved',
          mustResetPassword: false,
          passwordHash: hash,
          createdAt: new Date().toISOString()
        });
      } else {
        // Keep credentials in sync with .env in case they were changed there.
        acct.passwordHash = hash;
        acct.email = email;
        acct.status = 'approved';
      }
    };
    ensure(process.env.SADMIN_USERNAME || 'sadmin', process.env.SADMIN_PASSWORD || 'sadmin', 'sadmin', process.env.SADMIN_EMAIL || 'wisanu.a@vasup.co.th');
    ensure(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'admin', 'admin', process.env.ADMIN_EMAIL || 'admin@vasup.co.th');
  });
}

module.exports = { seedHardcodedAccounts };
