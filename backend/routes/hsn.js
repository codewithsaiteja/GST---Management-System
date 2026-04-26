const router = require('express').Router();
const { Hsn } = require('../utils/db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { search, type } = req.query;
    if (!search || search.length < 2) return res.json({ success: true, data: [] });
    const filter = { $or: [{ code: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }] };
    if (type) filter.type = type.toUpperCase();
    const data = await Hsn.find(filter).limit(20).lean();
    // sort: code starts with search first
    data.sort((a,b) => {
      const aStarts = a.code.startsWith(search) ? 0 : 1;
      const bStarts = b.code.startsWith(search) ? 0 : 1;
      return aStarts - bStarts || a.code.localeCompare(b.code);
    });
    res.json({ success: true, data });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/rate/:code', auth, async (req, res) => {
  const r = await Hsn.findOne({ code: req.params.code }).lean();
  res.json({ success: !!r, data: r || null });
});

module.exports = router;
