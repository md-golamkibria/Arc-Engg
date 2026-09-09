import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User } from '../../../Model/User.js';
import { VerificationRequest } from '../../../Model/VerificationRequest.js';
import { Rating } from '../../../Model/Rating.js';

const router = express.Router();

// File upload setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.user.id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

// Get my profile
router.get('/me', async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// Update profile (displayName and/or password)
router.patch('/me', async (req, res) => {
  const { displayName, password } = req.body;
  const update = {};
  if (typeof displayName === 'string') update.displayName = displayName;
  if (typeof password === 'string' && password.length > 0) {
    update.passwordHash = await bcrypt.hash(password, 10);
  }
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-passwordHash');
  res.json(user);
});

// Upload avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const publicUrl = `/uploads/${req.file.filename}`;
  const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: publicUrl }, { new: true }).select('-passwordHash');
  res.json(user);
});

export default router;

// Search users by role with optional domain filter (architecture/engineering)
// GET /api/user/search?q=alice&domains=architecture,engineering
// - Clients can only find providers
// - Providers can only find providers
router.get('/search', async (req, res) => {
  try{
    const meRole = req.user.role
    const q = (req.query.q || '').toString().trim()
    const rawDomains = (req.query.domains || '').toString()
    const domains = rawDomains.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)

    // role restriction: clients search providers; providers also search providers
    let targetRole = 'provider'
    if (meRole === 'client') targetRole = 'provider'
    if (meRole === 'provider') targetRole = 'provider'
    if (meRole === 'admin') {
      const want = (req.query.role || '').toString().toLowerCase()
      if (want === 'client' || want === 'provider') targetRole = want
    }
    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })
    const match = { role: targetRole }
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      match.$or = [ { username: re }, { displayName: re } ]
    }
    const users = await User.find(match).select('username displayName role avatarUrl verified verifiedType ratingAvg ratingCount')

    // Map provider to latest approved verification request (if any)
    const ids = users.map(u=>u._id)
    const vrs = await VerificationRequest.aggregate([
      { $match: { userId: { $in: ids }, status: 'approved' } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', category: { $first: '$category' }, subtype: { $first: '$subtype' } } }
    ])
    const vrMap = new Map(vrs.map(v=>[v._id.toString(), { category: v.category, subtype: (v.subtype||'').toLowerCase() }]))

    function userDomains(info){
      // provider_individual subtype architect => architecture, engineer => engineering
      // provider_company => both
      if (!info) return []
      if (info.category === 'provider_company') return ['architecture','engineering']
      if (info.subtype === 'architect') return ['architecture']
      if (info.subtype === 'engineer') return ['engineering']
      return []
    }

    function responseShape(u){
      const info = vrMap.get(u._id.toString())
      const ds = userDomains(info)
      return {
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        avatarUrl: u.avatarUrl,
        verified: !!u.verified,
        verifiedType: u.verifiedType || info?.category || null,
        verifiedCategory: info?.category || null,
        verifiedSubtype: info?.subtype || null,
        domains: ds,
        ratingAvg: u.ratingAvg || 0,
        ratingCount: u.ratingCount || 0,
      }
    }

    if (domains.length === 0 || targetRole !== 'provider'){
      return res.json(users.map(responseShape))
    }

    const wanted = new Set(domains)
    const filtered = users.filter(u => {
      const d = userDomains(vrMap.get(u._id.toString()))
      if (d.length === 0) return false // unknown domain, exclude when filter provided
      return d.some(x => wanted.has(x))
    }).map(responseShape)
    res.json(filtered)
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Client: list my favorite providers
router.get('/favorites', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me?.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Client: add a provider to favorites
router.post('/favorites/:username', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const { username } = req.params
    const target = await User.findOne({ username, role: 'provider' }).select('username')
    if (!target) return res.status(404).json({ message: 'Provider not found' })
    await User.updateOne({ _id: req.user.id }, { $addToSet: { favoriteProviders: username } })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// Client: remove a provider from favorites
router.delete('/favorites/:username', async (req, res) => {
  try{
    if (req.user.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    const { username } = req.params
    await User.updateOne({ _id: req.user.id }, { $pull: { favoriteProviders: username } })
    const me = await User.findById(req.user.id).select('favoriteProviders')
    res.json({ providers: me.favoriteProviders || [] })
  }catch(e){ res.status(500).json({ message: 'Server error' }) }
})

// List ratings/comments for a user (role-based visibility)
router.get('/:username/ratings', async (req, res) => {
  try{
    const meRole = req.user.role
    const { username } = req.params
    const limit = Math.min(50, Math.max(1, Number(req.query.limit)||20))

    const toUser = await User.findOne({ username }).select('role username')
    if (!toUser) return res.status(404).json({ message: 'User not found' })

    // Visibility rules: client views provider comments; provider views client comments; admin views all
    if (meRole === 'client' && toUser.role !== 'provider') return res.status(403).json({ message: 'Forbidden' })
    if (meRole === 'provider' && toUser.role !== 'client') return res.status(403).json({ message: 'Forbidden' })
    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })

    const [items, total] = await Promise.all([
      Rating.find({ toUserId: toUser._id }).sort({ createdAt: -1 }).limit(limit).select('fromUsername fromRole stars comment createdAt'),
      Rating.countDocuments({ toUserId: toUser._id })
    ])
    res.json({ items, total })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})

// Submit or update a rating for a user by username
router.post('/:username/rate', async (req, res) => {
  try{
    const meId = req.user.id
    const meRole = req.user.role
    const { username } = req.params
    const { stars, comment } = req.body || {}
    const s = Number(stars)
    if (!(s >= 1 && s <= 5)) return res.status(400).json({ message: 'Stars must be 1-5' })

    const toUser = await User.findOne({ username })
    if (!toUser) return res.status(404).json({ message: 'User not found' })

    if (meRole === 'client' && toUser.role !== 'provider') return res.status(403).json({ message: 'Clients can rate providers only' })
    if (meRole === 'provider' && toUser.role !== 'client') return res.status(403).json({ message: 'Providers can rate clients only' })
    if (!['client','provider','admin'].includes(meRole)) return res.status(403).json({ message: 'Forbidden' })

    const meUser = await User.findById(meId).select('username role')

    await Rating.findOneAndUpdate(
      { fromUserId: meId, toUserId: toUser._id },
      { fromUserId: meId, fromUsername: meUser.username, fromRole: meUser.role, toUserId: toUser._id, toUsername: toUser.username, toRole: toUser.role, stars: s, comment: (comment||'') },
      { upsert: true, new: true }
    )

    const agg = await Rating.aggregate([
      { $match: { toUserId: toUser._id } },
      { $group: { _id: '$toUserId', avg: { $avg: '$stars' }, cnt: { $count: {} } } }
    ])
    const avg = agg[0]?.avg || 0
    const cnt = agg[0]?.cnt || 0
    await User.findByIdAndUpdate(toUser._id, { ratingAvg: avg, ratingCount: cnt })

    res.json({ message: 'Rated', ratingAvg: avg, ratingCount: cnt })
  }catch(e){
    console.error(e)
    res.status(500).json({ message: 'Server error' })
  }
})
