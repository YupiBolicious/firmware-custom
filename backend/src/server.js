const app = require('./app');
const semanticStore = require('./services/semanticStore');

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Firmware Custom backend running on port ${PORT}`);
//app.listen(PORT, () => {
  //console.log(`Firmware Custom backend running on http://localhost:${PORT}`);
  // Warm the semantic pipeline (load embed model + build KB matrix) so the first
  // user analyze never pays the ~10s cold start. Fire-and-forget; errors are
  // swallowed because shadowSemantic/assist already degrade gracefully.
  if (process.env.SEMANTIC_ENABLED !== '0') {
    semanticStore.getMatrix().catch(() => {});
  }
});
