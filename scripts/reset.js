const { MongoClient } = require('mongodb');
const { seed, reset } = require('../server/slots');
(async () => {
  const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017/seatboard');
  try { await client.connect(); const db = client.db(); await seed(db); await reset(db); console.log('All appointment slots reset to free.'); }
  finally { await client.close(); }
})().catch(error => { console.error(error); process.exit(1); });
