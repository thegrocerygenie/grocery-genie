// Run every test in a time zone that observes DST, so a date bug that only
// shows on a 23- or 25-hour day fails on every machine and in CI, not just on
// a developer's laptop. Set JEST_TZ to run the suite in another zone.
module.exports = () => {
  process.env.TZ = process.env.JEST_TZ || 'America/New_York';
};
