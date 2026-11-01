const { randomBytes } = require('node:crypto');

const DOCTOR = 'Dr. Sharma';
const DAY = '2026-11-05';
function makeSlots() {
  const times = [];
  for (let minutes = 8 * 60; minutes < 19 * 60; minutes += 30) {
    if (minutes >= 12 * 60 && minutes < 13 * 60) continue;
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    const time = `${hour}${minute}`;
    times.push({
      _id: `dr-sharma-${DAY}-${time}`, doctor: DOCTOR,
      startsAt: new Date(`${DAY}T${hour}:${minute}:00.000Z`), state: 'free',
      holdToken: null, heldBy: null, holdExpiresAt: null, patientName: null, bookedAt: null
    });
  }
  return times;
}
async function seed(db) {
  const slots = db.collection('slots');
  for (const slot of makeSlots()) {
    await slots.updateOne({ _id: slot._id }, { $setOnInsert: slot }, { upsert: true });
  }
}
async function reset(db) {
  await db.collection('slots').updateMany({}, { $set: {
    state: 'free', holdToken: null, heldBy: null, holdExpiresAt: null, patientName: null, bookedAt: null
  } });
}
function publicSlot(slot, now = new Date(), viewerToken = null) {
  if (!slot) return null;
  const effectiveState = slot.state === 'held' && slot.holdExpiresAt <= now ? 'free' : slot.state;
  const result = { ...slot, state: effectiveState };
  delete result.holdToken;
  if (effectiveState === 'free') {
    result.heldBy = null;
    result.holdExpiresAt = null;
  }
  if (viewerToken && slot.holdToken === viewerToken) result.holdToken = slot.holdToken;
  return result;
}
function token() { return randomBytes(24).toString('hex'); }
module.exports = { makeSlots, seed, reset, publicSlot, token };
