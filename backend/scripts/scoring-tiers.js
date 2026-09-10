const AUTO_FLOOR = 0.6;
const SIM_FLOOR = 0.35;

const tierOf = (score) => (score >= AUTO_FLOOR ? 'AUTO' : (score >= SIM_FLOOR ? 'SUGGEST' : 'NEW'));

module.exports = { AUTO_FLOOR, SIM_FLOOR, tierOf };
