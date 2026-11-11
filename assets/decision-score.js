// Dynamic scoring for the Integrated Decision page.
// Selective hybrid score = (8.5 × efficiency weight + 8.0 × responsiveness weight + 7.5 × empowerment weight) / total weight.
window.initDecision = function initDecision() {
  const byId = (id) => document.getElementById(id);
  if (!byId('wEfficiency')) return;

  const options = {
    consolidation: { label: 'Consolidation', e: 9, r: 5, m: 4 },
    capacity: { label: 'Capacity building', e: 5, r: 9, m: 9 },
    hybrid: { label: 'Selective hybrid', e: 8.5, r: 8.0, m: 7.5 }
  };

  const update = () => {
    const weights = {
      e: Number(byId('wEfficiency').value),
      r: Number(byId('wResponsiveness').value),
      m: Number(byId('wEmpowerment').value)
    };
    const totalWeight = weights.e + weights.r + weights.m || 1;

    byId('ve').textContent = weights.e;
    byId('vr').textContent = weights.r;
    byId('vm').textContent = weights.m;

    const rows = Object.entries(options).map(([id, option]) => ({
      id,
      ...option,
      score: (
        option.e * weights.e +
        option.r * weights.r +
        option.m * weights.m
      ) / totalWeight
    }));

    rows.forEach((row) => {
      byId(`fill-${row.id}`).style.width = `${row.score * 10}%`;
      byId(`score-${row.id}`).textContent = row.score.toFixed(2);
    });

    const best = rows.reduce((current, candidate) =>
      candidate.score > current.score ? candidate : current
    );

    byId('decisionText').innerHTML =
      `With these weights, <b>${best.label}</b> scores highest ` +
      `(${best.score.toFixed(2)}/10). ` +
      `The Selective Hybrid score uses ` +
      `<b>(8.5 × Efficiency + 8.0 × Responsiveness + 7.5 × Empowerment) ÷ total weight</b>. ` +
      `Treat the result as a transparent discussion aid, not a universal prescription.`;
  };

  ['wEfficiency', 'wResponsiveness', 'wEmpowerment'].forEach((id) =>
    byId(id).addEventListener('input', update)
  );
  update();
};
