const auth = require('../lib/auth');
const { friendlyFirebaseError } = require('../lib/errors');
const { incrementStats, getStats } = require('../lib/stats');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { email, magicLink } = req.body;
  if (!email || !magicLink) {
    return res.status(400).json({ success: false, message: 'Email dan link wajib diisi.' });
  }

  const em = email.trim().toLowerCase();
  const v = await auth.auth(em, magicLink.trim());

  if (!v.ok) {
    return res.status(400).json({ 
      success: false, 
      message: friendlyFirebaseError(v.why) 
    });
  }

  // Proses premium (opsional, sesuaikan dengan kebutuhan)
  const premium = await auth.pro(v.id);
  const stats = premium.ok ? incrementStats() : getStats();

  return res.json({
    success: true,
    data: {
      uid: v.uid,
      email: v.user?.email || em,
      idToken: v.id,
      refreshToken: v.ref,
      orderId: premium.order || null,
      premiumStatus: premium.ok ? 'ACTIVE' : 'INACTIVE',
      stats
    }
  });
};
