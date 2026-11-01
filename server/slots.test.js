const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');
const { seed, reset } = require('./slots');
const url = process.env.MONGO_URL || 'mongodb://localhost:27017/seatboard_test';

test('expired holds are reclaimable and booked slots cannot be held, released, or swept', async t => {
  const client = new MongoClient(url);
  try { await client.connect(); } catch (error) { t.skip(`MongoDB unavailable: ${error.message}`); return; }
  try {
    const db = client.db(); const slots = db.collection('slots'); await seed(db); await reset(db);
    const id = 'dr-sharma-2026-11-05-0800';
    await slots.updateOne({ _id: id }, { $set: { state: 'held', holdToken: 'expired', heldBy: 'Desk-A', holdExpiresAt: new Date(Date.now() - 1000) } });
    const now = new Date();
    const reclaimed = await slots.findOneAndUpdate({ _id: id, $or: [{ state: 'free' }, { state: 'held', holdExpiresAt: { $lte: now } }] }, { $set: { state: 'held', holdToken: 'fresh', heldBy: 'Desk-B', holdExpiresAt: new Date(Date.now() + 30000) } }, { returnDocument: 'after' });
    assert.equal(reclaimed.holdToken, 'fresh');
    await slots.updateOne({ _id: id }, { $set: { state: 'booked', holdToken: null, heldBy: null, holdExpiresAt: null, patientName: 'A Patient', bookedAt: new Date() } });
    await slots.updateMany({ state: 'held', holdExpiresAt: { $lte: new Date(Date.now() + 100000) } }, { $set: { state: 'free', holdToken: null, heldBy: null, holdExpiresAt: null } });
    const holdAttempt = await slots.findOneAndUpdate({ _id: id, $or: [{ state: 'free' }, { state: 'held', holdExpiresAt: { $lte: new Date() } }] }, { $set: { state: 'held' } });
    const releaseAttempt = await slots.findOneAndUpdate({ _id: id, state: 'held', holdToken: 'fresh' }, { $set: { state: 'free' } });
    assert.equal(holdAttempt, null); assert.equal(releaseAttempt, null);
    assert.equal((await slots.findOne({ _id: id })).state, 'booked');
  } finally { await client.close(); }
});
