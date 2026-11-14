const crypto = require('crypto')

const key = 'AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0'
const idt = 'https://www.googleapis.com/identitytoolkit/v3/relyingparty'
const vfy = 'https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase'

const h1 = {
  'content-type': 'application/json',
  'x-android-package': 'com.alightcreative.motion',
  'x-android-cert': 'ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8',
  'user-agent': 'dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)'
}

const h2 = {
  'content-type': 'application/json; charset=utf-8',
  'user-agent': 'okhttp/3.12.1',
  'accept-encoding': 'gzip'
}

const bad = e => {
  const d = e.response?.data
  return d ? (typeof d === 'object' ? JSON.stringify(d) : String(d)) : e.message
}

const friendlyErr = errStr => {
  if (!errStr) return 'Terjadi kesalahan autentikasi.'
  if (errStr.includes('INVALID_OOB_CODE')) return 'Kode magic link tidak valid atau sudah pernah digunakan.'
  if (errStr.includes('EXPIRED_OOB_CODE')) return 'Magic link telah kadaluarsa. Kirim ulang tautan baru.'
  return errStr.length > 100 ? errStr.slice(0, 100) : errStr
}

function getOobCode(raw) {
  if (!raw) return null
  let s = String(raw).trim().replace(/&amp;/g, '&')
  try {
    const u = new URL(s)
    let c = u.searchParams.get('oobCode')
    if (c) return c
  } catch (e) {}
  const m = s.match(/[?&]oobCode=([^&]+)/i)
  if (m) {
    let c = m[1]
    try { c = decodeURIComponent(c) } catch(e){}
    return c
  }
  if (/^[a-zA-Z0-9_\-.]+$/.test(s) && !s.includes('://')) return s
  return null
}

module.exports = async (req, res) => {
  // CORS Header biar aman
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' })

  // 🛡️ PAGAR VIP: Ngecek semua kemungkinan nama cookie
  const cookies = req.headers.cookie || '';
  const isVip = cookies.includes('vip_session') || cookies.includes('token') || cookies.includes('auth') || cookies.includes('vip_key') || cookies.includes('kunci');
  
  if (!isVip) {
    return res.status(403).json({ success: false, message: 'Akses Ditolak. API ini khusus Member VIP.' });
  }

  const { action, email, magicLink } = req.body

  if (action === 'send') {
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'Email tidak valid.' })
    
    try {
      const r = await fetch(`${idt}/getOobConfirmationCode?key=${key}`, {
        method: 'POST',
        headers: h1,
        body: JSON.stringify({
          requestType: 6,
          email: email.trim().toLowerCase(),
          androidInstallApp: true,
          canHandleCodeInApp: true,
          continueUrl: 'https://alightcreative.com?ui_sid=0366624874&ui_sd=0',
          iosBundleId: 'com.alightcreative.motion',
          androidPackageName: 'com.alightcreative.motion',
          androidMinimumVersion: '585',
          clientType: 'CLIENT_TYPE_ANDROID'
        })
      });
      const data = await r.json();
      if (!r.ok) throw { response: { data } }; // Lempar error kalau Firebase nolak
      
      return res.json({ success: true, message: 'Link terkirim.' })
    } catch (e) {
      return res.status(400).json({ success: false, message: friendlyErr(bad(e)) })
    }
  }

  if (action === 'verify') {
    if (!email || !magicLink) return res.status(400).json({ success: false, message: 'Email & link wajib diisi.' })
    
    const c = getOobCode(magicLink)
    if (!c) return res.status(400).json({ success: false, message: 'Format link tidak valid / terpotong.' })

    try {
      // 1. Login pakai OOB Code
      const aRes = await fetch(`${idt}/emailLinkSignin?key=${key}`, {
        method: 'POST',
        headers: h1,
        body: JSON.stringify({
          email: email.trim().toLowerCase(), 
          oobCode: c, 
          clientType: 'CLIENT_TYPE_ANDROID'
        })
      });
      const aData = await aRes.json();
      if (!aRes.ok) throw { response: { data: aData } };
      
      const idToken = aData.idToken
      const uid = aData.localId

      // 2. Klaim Premium
      const o = 'ningen-' + crypto.randomBytes(6).toString('hex')
      const b = {
        data: {
          productId: 'am.full.sub.annual.19q4',
          token: 'mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw',
          skuType: 'subs',
          orderId: o
        }
      }
      const hVip = {
        ...h2,
        authorization: 'Bearer ' + idToken,
        'firebase-instance-id-token': 'cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI'
      }
      
      let premiumStatus = 'INACTIVE'
      let orderId = null
      
      try {
        const pRes = await fetch(vfy, {
          method: 'POST',
          headers: hVip,
          body: JSON.stringify(b)
        });
        if (pRes.ok) {
          premiumStatus = 'ACTIVE'
          orderId = o
        }
      } catch (e) { console.log('Premium fail:', e) }

      return res.json({
        success: true,
        data: { email, uid, idToken, orderId, status: premiumStatus }
      })

    } catch (e) {
      return res.status(400).json({ success: false, message: friendlyErr(bad(e)) })
    }
  }

  return res.status(400).json({ success: false, message: 'Aksi tidak dikenal.' })
        }
