const axios = require('axios')
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
  if (errStr.includes('INVALID_EMAIL')) return 'Format email tidak valid.'
  return errStr.length > 100 ? errStr.slice(0, 100) : errStr
}

// Fungsi Ekstrak OOB Code yang udah diperbaiki (Anti-gunting kode)
function getOobCode(raw) {
  if (!raw) return null
  let s = String(raw).trim().replace(/&amp;/g, '&')
  try {
    const u = new URL(s)
    let c = u.searchParams.get('oobCode')
    if (c) return c
  } catch (e) {}
  try {
    const decoded = decodeURIComponent(s)
    const u = new URL(decoded)
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
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' })

  // =========================================================
  // 🛡️ PAGAR BACKEND VIP (Anti-bypass orang iseng)
  // =========================================================
  const cookies = req.headers.cookie || '';
  
  // PENTING: Ganti 'vip_session' dengan nama cookie yang dipakai sistem login lo.
  // (Coba cek di Inspect Element > Application > Cookies pas lo lagi login VIP)
  const isVip = cookies.includes('vip_session') || cookies.includes('token') || cookies.includes('auth');
  
  if (!isVip) {
    return res.status(403).json({ 
      success: false, 
      message: 'Akses Ditolak. API ini khusus Member VIP.' 
    });
  }

  const { action, email, magicLink } = req.body

  // ==========================================
  // AKSI 1: KIRIM LINK KE EMAIL
  // ==========================================
  if (action === 'send') {
    if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'Email tidak valid.' })
    
    try {
      await axios.post(`${idt}/getOobConfirmationCode?key=${key}`, {
        requestType: 6,
        email: email.trim().toLowerCase(),
        androidInstallApp: true,
        canHandleCodeInApp: true,
        continueUrl: 'https://alightcreative.com?ui_sid=0366624874&ui_sd=0',
        iosBundleId: 'com.alightcreative.motion',
        androidPackageName: 'com.alightcreative.motion',
        androidMinimumVersion: '585',
        clientType: 'CLIENT_TYPE_ANDROID'
      }, { headers: h1 })
      return res.json({ success: true, message: 'Link terkirim.' })
    } catch (e) {
      return res.status(400).json({ success: false, message: friendlyErr(bad(e)) })
    }
  }

  // ==========================================
  // AKSI 2: VERIFIKASI LINK
  // ==========================================
  if (action === 'verify') {
    if (!email || !magicLink) return res.status(400).json({ success: false, message: 'Email & link wajib diisi.' })
    
    const c = getOobCode(magicLink)
    if (!c) return res.status(400).json({ success: false, message: 'Format link tidak valid / terpotong.' })

    try {
      // 1. Login pakai OOB Code
      const a = await axios.post(`${idt}/emailLinkSignin?key=${key}`, {
        email: email.trim().toLowerCase(), 
        oobCode: c, 
        clientType: 'CLIENT_TYPE_ANDROID'
      }, { headers: h1 })
      
      const idToken = a.data.idToken
      const uid = a.data.localId

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
      const h = {
        ...h2,
        authorization: 'Bearer ' + idToken,
        'firebase-instance-id-token': 'cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI'
      }
      
      let premiumStatus = 'INACTIVE'
      let orderId = null
      
      try {
        const p = await axios.post(vfy, b, { headers: h })
        if (p.data) {
          premiumStatus = 'ACTIVE'
          orderId = o
        }
      } catch (e) {
        console.log('Premium claim failed:', bad(e))
      }

      return res.json({
        success: true,
        data: {
          email,
          uid,
          idToken,
          orderId,
          status: premiumStatus,
          stats: { total: 150, today: 12 } // Angka statis sementara
        }
      })

    } catch (e) {
      return res.status(400).json({ success: false, message: friendlyErr(bad(e)) })
    }
  }

  return res.status(400).json({ success: false, message: 'Aksi tidak dikenal.' })
                                                           }
