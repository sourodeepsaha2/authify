const express = require('express');
const { MongoClient } = require('mongodb');
const { seed, reset, publicSlot, token } = require('./slots');

const app = express();
app.use(express.json());
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/seatboard';
const ttlSeconds = Number(process.env.HOLD_TTL_SECONDS || 90);
let client;
let slots;
let db;
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/slots', async (_req, res, next) => {
  try {
    const now = new Date();
    const records = await slots.find({}).sort({ startsAt: 1 }).toArray();
    res.json({ slots: records.map(slot => publicSlot(slot, now)), serverTime: now });
  } catch (error) { next(error); }
});
app.post('/api/slots/:id/hold', async (req, res, next) => {
  try {
    const heldBy = typeof req.body?.heldBy === 'string' ? req.body.heldBy.trim() : '';
    if (!heldBy || heldBy.length > 40) return res.status(400).json({ error: 'heldBy_required' });
    const now = new Date();
    const holdToken = token();
    // The conditional update is MongoDB's single-document arbiter: only one caller can change a free/expired slot.
    const slot = await slots.findOneAndUpdate(
      { _id: req.params.id, $or: [{ state: 'free' }, { state: 'held', holdExpiresAt: { $lte: now } }] },
      { $set: { state: 'held', holdToken, heldBy, holdExpiresAt: new Date(now.getTime() + ttlSeconds * 1000) } },
      { returnDocument: 'after' }
    );
    if (slot) return res.json({ slot: publicSlot(slot, now, holdToken), holdToken });
    const current = await slots.findOne({ _id: req.params.id });
    if (!current) return res.status(404).json({ error: 'slot_not_found' });
    return res.status(409).json({ error: 'slot_taken', slot: publicSlot(current, new Date()) });
  } catch (error) { next(error); }
});
app.post('/api/slots/:id/confirm', async (req, res, next) => {
  try {
    const holdToken = req.body?.holdToken;
    const patientName = typeof req.body?.patientName === 'string' ? req.body.patientName.trim() : '';
    if (typeof holdToken !== 'string' || !holdToken || !patientName || patientName.length > 100)
      return res.status(400).json({ error: 'holdToken_and_patientName_required' });
    const now = new Date();
    const slot = await slots.findOneAndUpdate(
      { _id: req.params.id, state: 'held', holdToken, holdExpiresAt: { $gt: now } },
      { $set: { state: 'booked', patientName, bookedAt: now, holdToken: null, holdExpiresAt: null } },
      { returnDocument: 'after' }
    );
    if (slot) return res.json({ slot: publicSlot(slot) });
    return res.status(409).json(await conflictReason(req.params.id, holdToken));
  } catch (error) { next(error); }
});
app.post('/api/slots/:id/release', async (req, res, next) => {
  try {
    const holdToken = req.body?.holdToken;
    if (typeof holdToken !== 'string' || !holdToken) return res.status(400).json({ error: 'holdToken_required' });
    const slot = await slots.findOneAndUpdate(
      { _id: req.params.id, state: 'held', holdToken },
      { $set: { state: 'free', holdToken: null, heldBy: null, holdExpiresAt: null } },
      { returnDocument: 'after' }
    );
    if (slot) return res.json({ slot: publicSlot(slot) });
    return res.status(409).json(await conflictReason(req.params.id, holdToken));
  } catch (error) { next(error); }
});
async function conflictReason(id, holdToken) {
  const slot = await slots.findOne({ _id: id });
  if (!slot) return { error: 'slot_not_found', reason: 'slot_not_found' };
  if (slot.state === 'booked') return { error: 'slot_conflict', reason: 'already_booked', slot: publicSlot(slot) };
  if (slot.state === 'held' && slot.holdExpiresAt <= new Date()) return { error: 'slot_conflict', reason: 'hold_expired', slot: publicSlot(slot) };
  if (slot.state === 'held' && slot.holdToken !== holdToken) return { error: 'slot_conflict', reason: 'not_your_hold', slot: publicSlot(slot) };
  return { error: 'slot_conflict', reason: 'hold_unavailable', slot: publicSlot(slot) };
}
app.post('/api/test/reset/:id', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.sendStatus(404);
  try {
    const result = await slots.updateOne({ _id: req.params.id }, { $set: {
      state: 'free', holdToken: null, heldBy: null, holdExpiresAt: null, patientName: null, bookedAt: null
    } });
    if (!result.matchedCount) return res.status(404).json({ error: 'slot_not_found' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.post('/api/naive/slots/:id/hold', async (req, res, next) => {
  if (process.env.ENABLE_NAIVE !== 'true') return res.sendStatus(404);
  try {
    const before = await slots.findOne({ _id: req.params.id });
    if (!before) return res.status(404).json({ error: 'slot_not_found' });
    const now = new Date();
    if (!(before.state === 'free' || (before.state === 'held' && before.holdExpiresAt <= now)))
      return res.status(409).json({ error: 'slot_taken', slot: publicSlot(before, now) });
    await new Promise(resolve => setTimeout(resolve, 20));
    const holdToken = token();
    const slot = await slots.findOneAndUpdate({ _id: req.params.id }, { $set: {
      state: 'held', holdToken, heldBy: String(req.body?.heldBy || 'Desk').slice(0, 40),
      holdExpiresAt: new Date(now.getTime() + ttlSeconds * 1000)
    } }, { returnDocument: 'after' });
    res.json({ slot: publicSlot(slot, now, holdToken), holdToken });
  } catch (error) { next(error); }
});
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'internal_error' });
});
async function start() {
  client = new MongoClient(mongoUrl);
  await client.connect();
  db = client.db(); slots = db.collection('slots');
  await seed(db);
  const sweep = async () => {
    const now = new Date();
    await slots.updateMany({ state: 'held', holdExpiresAt: { $lte: now } }, { $set: {
      state: 'free', holdToken: null, heldBy: null, holdExpiresAt: null
    } });
  };
  setInterval(() => sweep().catch(error => console.error('Expiry sweep failed:', error)), 5000).unref();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`Seat-Hold API listening on ${port}`));
}
if (require.main === module) start().catch(error => { console.error(error); process.exit(1); });
module.exports = { app, start };
