const { MongoClient } = require('mongodb');
const rounds = Number(process.env.ROUNDS || 300);
const contenders = Number(process.env.CONTENDERS || 2);
const api = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/seatboard';
const slotId = 'dr-sharma-2026-11-05-0800';
async function waitForAPI() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const response = await fetch(`${api}/health`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`API did not become ready at ${api}`);
}
async function post(path, body) {
  const response = await fetch(`${api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
(async () => {
  await waitForAPI();
  const dbClient = new MongoClient(mongoUrl);
  await dbClient.connect();
  const slots = dbClient.db().collection('slots');
  let violations = 0;
  const distribution = {};
  for (let i = 0; i < rounds; i++) {
    await post(`/api/test/reset/${slotId}`, {});
    const results = await Promise.all(Array.from({ length: contenders }, (_, j) => post(`/api/${process.env.NAIVE === 'true' ? 'naive/' : ''}slots/${slotId}/hold`, { heldBy: `Round-${i}-Desk-${j}` })));
    const wins = results.filter(result => result.status === 200).length;
    distribution[wins] = (distribution[wins] || 0) + 1;
    if (wins !== 1 || results.filter(result => result.status === 409).length !== contenders - 1) violations++;
    // Confirm contention: the real token can book once; a competing token can never book.
    const winner = results.find(result => result.status === 200);
    if (winner) {
      const confirmResults = await Promise.all([
        post(`/api/slots/${slotId}/confirm`, { holdToken: winner.body.holdToken, patientName: `Patient ${i}` }),
        post(`/api/slots/${slotId}/confirm`, { holdToken: 'not-the-hold-token', patientName: 'Wrong party' })
      ]);
      if (confirmResults.filter(result => result.status === 200).length !== 1 || confirmResults.filter(result => result.status === 409).length !== 1) violations++;
      const finalSlot = await slots.findOne({ _id: slotId });
      if (finalSlot.state !== 'booked' || !finalSlot.bookedAt) violations++;
    }
  }
  const all = await slots.find({}).toArray();
  const invalid = all.filter(slot => (slot.state === 'booked' && slot.holdToken) || (slot.state === 'held' && !slot.holdExpiresAt)).length;
  const duplicateBookings = all.filter(slot => slot.state === 'booked' && (!slot.patientName || !slot.bookedAt)).length;
  violations += invalid + duplicateBookings;
  console.log(`Rounds: ${rounds}; contenders: ${contenders}`);
  console.log(`Winners per round distribution: ${JSON.stringify(distribution)}`);
  console.log(`Invariant violations: ${violations}`);
  console.log(`${violations ? 'FAIL' : 'PASS'}`);
  await dbClient.close();
  if (violations) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
