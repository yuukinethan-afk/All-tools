const auth = require('../lib/auth'); // Asumsi lo taruh auth.js di folder lib/
const { friendlyFirebaseError } = require('../lib/errors');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Email wajib diisi.' });
  }

  const result = await auth.link(email.trim().toLowerCase());
  if (!result.ok) {
    return res.status(400).json({ 
      success: false, 
      message: friendlyFirebaseError(result.why) 
    });
  }

  res.json({ success: true, message: 'Link terkirim, cek email.' });
};
