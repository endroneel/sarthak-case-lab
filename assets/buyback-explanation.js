(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const valueOf = (id) => Number(byId(id)?.value);
  const money = (value, digits = 2) => `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)}`;

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const absolute = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * absolute);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absolute * absolute);
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  function normalPdf(z) {
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  }

  function normalLoss(z) {
    return normalPdf(z) - z * (1 - normalCdf(z));
  }

  function operations(quantity, mean, sigma) {
    const z = (quantity - mean) / sigma;
    const lostSales = Math.max(0, sigma * normalLoss(z));
    const expectedSales = Math.min(quantity, Math.max(0, mean - lostSales));
    const leftovers = Math.max(0, quantity - expectedSales);
    return { z, lostSales, expectedSales, leftovers };
  }

  function expectedProfit(quantity, scenario, leftoverValue) {
    const result = operations(quantity, scenario.mean, scenario.sigma);
    return {
      ...result,
      quantity,
      profit: scenario.price * result.expectedSales + leftoverValue * result.leftovers - scenario.cost * quantity
    };
  }

  function readScenario() {
    return {
      quantity: Math.max(1, Math.round(valueOf('bbQ'))),
      mean: valueOf('bbMu'),
      sigma: valueOf('bbSigma'),
      price: valueOf('bbPrice'),
      cost: valueOf('bbCost'),
      ordinary: valueOf('bbOrdinary'),
      corporate: valueOf('bbCorporate'),
      rho: valueOf('bbRho') / 100,
      maxQuantity: Math.max(1, Math.round(valueOf('bbMaxQ')))
    };
  }

  function isValid(scenario) {
    return Object.values(scenario).every(Number.isFinite) &&
      scenario.quantity >= 1 && scenario.mean >= 0 && scenario.sigma > 0 &&
      scenario.price >= 0 && scenario.cost >= 0 && scenario.ordinary >= 0 &&
      scenario.corporate >= 0 && scenario.rho >= 0 && scenario.rho <= 1 &&
      scenario.maxQuantity >= scenario.quantity;
  }

  function reliabilityThreshold(scenario) {
    const denominator = scenario.corporate - scenario.ordinary;
    if (Math.abs(denominator) < 1e-9) return null;
    return (scenario.cost - scenario.ordinary) / denominator;
  }

  function updateExplanation() {
    const section = byId('probExplanation');
    if (!section) return;

    const scenario = readScenario();
    if (!isValid(scenario)) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    const effectiveValue = scenario.rho * scenario.corporate + (1 - scenario.rho) * scenario.ordinary;
    const selected = expectedProfit(scenario.quantity, scenario, effectiveValue);
    const candidates = [];
    for (let quantity = 1; quantity <= scenario.maxQuantity; quantity += 1) {
      candidates.push(expectedProfit(quantity, scenario, effectiveValue));
    }
    const optimum = candidates.reduce((best, candidate) => candidate.profit > best.profit ? candidate : best, candidates[0]);
    const previous = candidates[Math.max(0, optimum.quantity - 2)];
    const incrementalGain = optimum.quantity > 1 ? optimum.profit - previous.profit : 0;
    const accepted = expectedProfit(optimum.quantity, scenario, scenario.corporate);
    const rejected = expectedProfit(optimum.quantity, scenario, scenario.ordinary);
    const threshold = reliabilityThreshold(scenario);
    const unbounded = effectiveValue >= scenario.cost;
    const atBoundary = optimum.quantity === scenario.maxQuantity;
    const rhoPercent = Math.round(scenario.rho * 100);
    const rejectionPercent = 100 - rhoPercent;

    byId('probRhoSummary').textContent = `${rhoPercent}%`;
    byId('probEffectiveSummary').textContent = money(effectiveValue);
    byId('probSelectedSummary').textContent = `Q ${scenario.quantity} · ${money(selected.profit)}`;
    byId('probOptimalSummary').textContent = unbounded ? 'No finite optimum' : `Q ${optimum.quantity} · ${money(optimum.profit)}`;

    byId('probExpectedValueText').innerHTML =
      `The partner accepts all eligible leftovers at <strong>${money(scenario.corporate)}</strong> with probability ` +
      `<strong>${rhoPercent}%</strong>. With probability <strong>${rejectionPercent}%</strong>, SARTHAK receives only the ordinary clearance value of ` +
      `<strong>${money(scenario.ordinary)}</strong>. The probability-weighted leftover value is therefore ` +
      `<strong>${money(effectiveValue)}</strong>. This is an expected value—not a price that SARTHAK actually receives in a single selling cycle.`;

    byId('probSelectedText').innerHTML =
      `At the selected production quantity <strong>Q = ${scenario.quantity}</strong>, expected regular sales are ` +
      `<strong>${selected.expectedSales.toFixed(3)}</strong> units and expected leftovers are ` +
      `<strong>${selected.leftovers.toFixed(3)}</strong> units. Applying the effective leftover value gives an expected profit of ` +
      `<strong>${money(selected.profit)}</strong>.`;

    if (unbounded) {
      byId('probOptimalText').innerHTML =
        `At the current reliability level, the effective leftover value of <strong>${money(effectiveValue)}</strong> is at least the unit cost of ` +
        `<strong>${money(scenario.cost)}</strong>. Additional unsold units therefore do not create the usual expected downside. The graph maximum at ` +
        `<strong>Q = ${optimum.quantity}</strong> is a boundary result, not a meaningful finite optimum.`;
    } else {
      byId('probOptimalText').innerHTML =
        `The model compares whole-number quantities from 1 to ${scenario.maxQuantity}. Expected profit is highest at ` +
        `<strong>Q = ${optimum.quantity}</strong>, where it reaches <strong>${money(optimum.profit)}</strong>. ` +
        `The gain over Q = ${previous.quantity} is only <strong>${money(incrementalGain)}</strong>, showing that the profit curve is relatively flat near the optimum.`;
    }

    byId('probRiskText').innerHTML =
      `At the modelled optimum, expected profit would be <strong>${money(accepted.profit)}</strong> if the partner accepts the leftovers, but only ` +
      `<strong>${money(rejected.profit)}</strong> if it rejects them. The reported expected profit combines these outcomes as ` +
      `<strong>${rhoPercent}% × ${money(accepted.profit)} + ${rejectionPercent}% × ${money(rejected.profit)} = ${money(optimum.profit)}</strong>. ` +
      `SARTHAK pays the production cost before knowing which outcome will occur, so contract-reliability risk remains with SARTHAK.`;

    byId('probAcceptedProfit').textContent = money(accepted.profit);
    byId('probRejectedProfit').textContent = money(rejected.profit);
    byId('probAcceptedLabel').textContent = `Partner accepts (${rhoPercent}% probability)`;
    byId('probRejectedLabel').textContent = `Partner rejects (${rejectionPercent}% probability)`;

    byId('probFormulaBox').innerHTML =
      `<span class="muted">Effective leftover value</span><br>` +
      `v<sub>effective</sub> = ${scenario.rho.toFixed(2)}(${scenario.corporate.toFixed(2)}) + ${(1 - scenario.rho).toFixed(2)}(${scenario.ordinary.toFixed(2)})<br>` +
      `v<sub>effective</sub> = <b>${money(effectiveValue)}</b><br><br>` +
      `<span class="muted">Expected profit at selected Q</span><br>` +
      `E[π(${scenario.quantity})] = ${scenario.price.toFixed(2)}(${selected.expectedSales.toFixed(4)}) + ` +
      `${effectiveValue.toFixed(3)}(${selected.leftovers.toFixed(4)}) − ${scenario.cost.toFixed(2)}(${scenario.quantity})<br>` +
      `E[π(${scenario.quantity})] = <b>${money(selected.profit)}</b>`;

    const note = byId('probManagerialNote');
    if (unbounded || atBoundary) {
      note.className = 'prob-managerial-note risk';
      note.innerHTML = `<b>Managerial implication</b><p>The displayed result is not a safe production target. Negotiate a quantity cap, a firm purchase order, a net recovery value after handling costs, or a staged production rule before increasing output.</p>`;
    } else {
      note.className = 'prob-managerial-note';
      const stagedQuantity = Math.max(1, optimum.quantity - 1);
      note.innerHTML = `<b>Managerial implication</b><p>The mathematical optimum is Q = ${optimum.quantity}, but the incremental expected gain over Q = ${stagedQuantity} is only ${money(incrementalGain)}. Because acceptance is uncertain, SARTHAK could commit to ${stagedQuantity} units and release the final unit only after stronger demand evidence or written confirmation from the partner.</p>`;
    }

    byId('probThresholdText').textContent = threshold !== null && threshold >= 0 && threshold <= 1
      ? `The current ${rhoPercent}% reliability is ${scenario.rho < threshold ? 'below' : 'at or above'} the break-even reliability threshold of ${(threshold * 100).toFixed(1)}%.`
      : 'No economically meaningful break-even reliability threshold lies between 0% and 100% under the current values.';
  }

  function scheduleUpdate() {
    window.requestAnimationFrame(updateExplanation);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['bbQ', 'bbQRange', 'bbMu', 'bbSigma', 'bbPrice', 'bbCost', 'bbOrdinary', 'bbCorporate', 'bbCap', 'bbRho', 'bbMaxQ', 'bbAutoRange'];
    inputs.forEach((id) => {
      const element = byId(id);
      if (!element) return;
      element.addEventListener('input', scheduleUpdate);
      element.addEventListener('change', scheduleUpdate);
    });
    byId('bbReset')?.addEventListener('click', () => window.setTimeout(updateExplanation, 0));
    window.setTimeout(updateExplanation, 0);
  });
})();
