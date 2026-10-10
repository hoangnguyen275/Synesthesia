require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../models/User');
const setupError = message => Object.assign(new Error(message), { setupMessage: message });
let stage = 'setup';
async function main() {
  const username = process.argv[2];
  if (!username || username === 'YOUR_USERNAME' || username === 'EXISTING_USERNAME' || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    throw setupError('Replace YOUR_USERNAME with your actual signed-up username. Example: node scripts/set-moderator.js alice');
  }
  if (!process.env.MONGODB_CONNECTIONSTRING) throw setupError('MONGODB_CONNECTIONSTRING is missing from backend/.env.');
  stage = 'connect';
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING, { serverSelectionTimeoutMS: 10000 });
  stage = 'update';
  const user = await User.findOneAndUpdate({ username }, { $set: { role: 'moderator' } }, { returnDocument: 'after', runValidators: true });
  if (!user) throw setupError(`No account found for username "${username}". Use the exact username (case-sensitive), not your email, and check that the app and script use the same database.`);
  console.log(`Moderator access enabled for ${user.username}. Open Community Archive to see the review controls.`);
}
main().catch(error => {
  let message = error.setupMessage;
  if (!message && Number(error.code) === 18) message = 'MongoDB authentication failed. Check the database credentials in backend/.env.';
  if (!message && Number(error.code) === 13) message = 'MongoDB denied this operation. The database account needs permission to update users.';
  if (!message) message = stage === 'connect'
    ? 'Could not connect to MongoDB. Check MONGODB_CONNECTIONSTRING, your network connection, and the MongoDB network access settings.'
    : 'Could not update the account. Check database write permissions and that the backend database is available.';
  console.error(message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
