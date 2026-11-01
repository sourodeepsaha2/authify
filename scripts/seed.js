const { MongoClient } = require('mongodb');
const { seed } = require('../server/slots');
(async () => {
  const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017/seatboard');
  try { await client.connect(); await seed(client.db()); console.log('Seeded 20 appointment slots (existing slots preserved).'); }
  finally { await client.close(); }
})().catch(error => { console.error(error); process.exit(1); });
