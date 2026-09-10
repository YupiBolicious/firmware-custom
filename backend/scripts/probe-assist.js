const semanticAssist = require('../src/services/semanticAssist');

const weak = { status: 'CODER_REVIEW', classification_method: 'MANUAL', match_score: 0 };

(async () => {
  for (const t of ['AX-200 controller', 'Motorized Sash Window', 'glass panel', 'Merge Point']) {
    const r = await semanticAssist.assistWithSemantic(
      { title: t, description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 },
      weak, { marginFloor: 0 }
    );
    console.log(`"${t}": ` + (r ? `ASSIST kb=${r.kb_item_id} score=${r.match_score.toFixed(3)} margin=${r.semantic_margin.toFixed(3)}` : 'null'));
  }
  await require('../src/services/embedder').shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
