(() => {
  'use strict';

  const CASE_SCENARIO = {
    quantity: 11,
    mean: 7,
    sigma: 5,
    cost: 57
  };

  const CASE_STRATEGIES = [
    { id: 'ssp1', label: 'SSP 1', description: 'Average selling price; 20% clearance', price: 146.5, salvage: 29.3, color: '#4f79c6', custom: false },
    { id: 'ssp2', label: 'SSP 2', description: '₹150 selling price; 20% clearance', price: 150, salvage: 30, color: '#66a65c', custom: false },
    { id: 'ssp3', label: 'SSP 3', description: '₹155 selling price; 20% clearance', price: 155, salvage: 31, color: '#7d5bb1', custom: false },
    { id: 'csp1', label: 'CSP 1', description: 'Average selling price; 30% clearance', price: 146.5, salvage: 43.95, color: '#d98b2b', custom: false },
    { id: 'csp2', label: 'CSP 2', description: 'Average selling price; 40% clearance', price: 146.5, salvage: 58.6, color: '#0d7f78', custom: false }
  ];

  const CUSTOM_COLORS = ['#b84a52', '#2f8f85', '#9a6d22'];
  const MAX_CUSTOM_STRATEGIES = 3;
  const MAX_GRAPH_Q = 200;

  const state = {
    strategies: cloneCaseStrategies(),
    selectedId: 'ssp3',
    autoRange: true,
    customCounter: 0
  };

  const byId = (id) => document.getElementById(id);
  const number = (id) => Number(byId(id).value);
  const money = (value, digits = 2) => new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function cloneCaseStrategies() {
    return CASE_STRATEGIES.map((strategy) => ({ ...strategy }));
  }

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

  function lossFunction(z) {
    return normalPdf(z) - z * (1 - normalCdf(z));
  }

  function evaluateQuantity(quantity, mean, sigma, price, cost, salvage) {
    const z = (quantity - mean) / sigma;
    const loss = lossFunction(z);
    const lostSales = Math.max(0, sigma * loss);
    const expectedSales = Math.min(quantity, Math.max(0, mean - lostSales));
    const leftovers = Math.max(0, quantity - expectedSales);
    const salesRevenue = price * expectedSales;
    const clearanceRecovery = salvage * leftovers;
    const productionCost = cost * quantity;
    const expectedProfit = salesRevenue + clearanceRecovery - productionCost;

    return {
      quantity,
      z,
      loss,
      lostSales,
      expectedSales,
      leftovers,
      salesRevenue,
      clearanceRecovery,
      productionCost,
      expectedProfit
    };
  }

  function automaticMaxQuantity(mean, sigma, selectedQuantity) {
    return Math.min(
      MAX_GRAPH_Q,
      Math.max(10, selectedQuantity + 2, Math.ceil(mean + 3 * sigma))
    );
  }

  function readScenario() {
    return {
      quantity: Math.round(number('pQ')),
      mean: number('pMu'),
      sigma: number('pSigma'),
      cost: number('pCost'),
      maxQuantity: Math.round(number('pMaxQ'))
    };
  }

  function selectedStrategy() {
    return state.strategies.find((strategy) => strategy.id === state.selectedId) || state.strategies[0];
  }

  function validate(scenario) {
    const errors = [];
    const warnings = [];
    const strategy = selectedStrategy();

    if (!Number.isFinite(scenario.quantity) || scenario.quantity < 0) errors.push('Production quantity must be zero or greater.');
    if (!Number.isFinite(scenario.mean) || scenario.mean < 0) errors.push('Demand mean must be zero or greater.');
    if (!Number.isFinite(scenario.sigma) || scenario.sigma <= 0) errors.push('Demand standard deviation must be greater than zero.');
    if (!Number.isFinite(scenario.cost) || scenario.cost < 0) errors.push('Unit cost must be zero or greater.');
    if (!Number.isFinite(scenario.maxQuantity) || scenario.maxQuantity < 1) errors.push('Graph maximum quantity must be at least 1.');
    if (scenario.maxQuantity > MAX_GRAPH_Q) errors.push(`Graph maximum quantity cannot exceed ${MAX_GRAPH_Q}.`);
    if (scenario.maxQuantity < scenario.quantity) errors.push('Graph maximum quantity must be at least as large as the selected production quantity.');
    if (!strategy || !Number.isFinite(strategy.price) || strategy.price < 0) errors.push('Selling price must be zero or greater.');
    if (!strategy || !Number.isFinite(strategy.salvage) || strategy.salvage < 0) errors.push('Clearance value must be zero or greater.');

    if (strategy && strategy.salvage > strategy.price) warnings.push('The clearance value exceeds the regular selling price. Check whether this assumption is intentional.');
    if (strategy && strategy.salvage > scenario.cost) warnings.push('The clearance value exceeds unit cost, so leftover units generate a positive contribution under this assumption.');
    if (scenario.mean < 3 * scenario.sigma) warnings.push('The normal approximation assigns some probability to negative demand. Treat the result as a teaching approximation.');

    return { errors, warnings };
  }

  function setAlert(messages, type) {
    const alert = byId('validationMessage');
    if (!messages.length) {
      alert.hidden = true;
      alert.innerHTML = '';
      alert.className = 'lab-alert';
      return;
    }
    alert.hidden = false;
    alert.className = `lab-alert ${type}`;
    alert.innerHTML = messages.map((message) => `<div>${escapeHtml(message)}</div>`).join('');
  }

  function syncQuantityControls(source) {
    const quantityInput = byId('pQ');
    const quantityRange = byId('pQRange');
    const maxQuantity = Math.max(1, Math.round(number('pMaxQ')) || 1);
    quantityRange.max = String(maxQuantity);

    if (source === 'range') quantityInput.value = quantityRange.value;
    if (source === 'number') {
      const value = Math.min(MAX_GRAPH_Q, Math.max(0, Math.round(Number(quantityInput.value) || 0)));
      quantityInput.value = String(value);
      quantityRange.value = String(Math.min(value, maxQuantity));
    }
  }

  function syncSelectedStrategyFields() {
    const strategy = selectedStrategy();
    if (!strategy) return;
    byId('pStrategy').value = strategy.id;
    byId('pPrice').value = String(strategy.price);
    byId('pSalvage').value = String(strategy.salvage);
    byId('selectedStrategyName').textContent = strategy.label;
    byId('removeStrategy').disabled = !strategy.custom;
  }

  function refreshStrategySelector() {
    const select = byId('pStrategy');
    select.innerHTML = state.strategies.map((strategy) =>
      `<option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} — ${escapeHtml(strategy.description)}</option>`
    ).join('');
    if (!state.strategies.some((strategy) => strategy.id === state.selectedId)) {
      state.selectedId = state.strategies[0].id;
    }
    syncSelectedStrategyFields();
  }

  function updateSelectedStrategyFromFields() {
    const strategy = selectedStrategy();
    if (!strategy) return;
    strategy.price = Number(byId('pPrice').value);
    strategy.salvage = Number(byId('pSalvage').value);
  }

  function calculateStrategy(strategy, scenario) {
    const points = [];
    for (let quantity = 0; quantity <= scenario.maxQuantity; quantity += 1) {
      points.push(evaluateQuantity(quantity, scenario.mean, scenario.sigma, strategy.price, scenario.cost, strategy.salvage));
    }
    const optimum = points.reduce((best, point) => point.expectedProfit > best.expectedProfit ? point : best, points[0]);
    return { strategy, points, optimum };
  }

  function formatAxisMoney(value) {
    const absolute = Math.abs(value);
    if (absolute >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (absolute >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
    return `₹${Math.round(value)}`;
  }

  function renderProfitChart(computed, scenario, selectedResult) {
    const holder = byId('profitChart');
    const width = 920;
    const height = 430;
    const margin = { left: 86, right: 30, top: 30, bottom: 70 };
    const allProfits = computed.flatMap((entry) => entry.points.map((point) => point.expectedProfit));
    let yMin = Math.min(0, ...allProfits);
    let yMax = Math.max(0, ...allProfits);
    const yPadding = Math.max(1, (yMax - yMin) * 0.1);
    yMin -= yPadding;
    yMax += yPadding;

    const scaleX = (quantity) => margin.left + (quantity / Math.max(1, scenario.maxQuantity)) * (width - margin.left - margin.right);
    const scaleY = (profit) => height - margin.bottom - ((profit - yMin) / Math.max(1, yMax - yMin)) * (height - margin.top - margin.bottom);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Expected profit by production quantity">`;

    for (let index = 0; index <= 5; index += 1) {
      const value = yMin + ((yMax - yMin) * index / 5);
      const y = scaleY(value);
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e9f1" />`;
      svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#667085">${formatAxisMoney(value)}</text>`;
    }

    const xTickCount = Math.min(8, scenario.maxQuantity);
    for (let index = 0; index <= xTickCount; index += 1) {
      const quantity = Math.round(scenario.maxQuantity * index / Math.max(1, xTickCount));
      const x = scaleX(quantity);
      svg += `<line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}" stroke="#667085" />`;
      svg += `<text x="${x}" y="${height - margin.bottom + 24}" text-anchor="middle" font-size="11" fill="#667085">${quantity}</text>`;
    }

    if (yMin < 0 && yMax > 0) {
      const zeroY = scaleY(0);
      svg += `<line x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" stroke="#98a2b3" stroke-width="1.5" />`;
    }

    computed.forEach((entry) => {
      const selected = entry.strategy.id === state.selectedId;
      const points = entry.points.map((point) => `${scaleX(point.quantity)},${scaleY(point.expectedProfit)}`).join(' ');
      svg += `<polyline points="${points}" fill="none" stroke="${entry.strategy.color}" stroke-width="${selected ? 4 : 2.4}" opacity="${selected ? 1 : 0.72}" />`;
      entry.points.forEach((point) => {
        svg += `<circle cx="${scaleX(point.quantity)}" cy="${scaleY(point.expectedProfit)}" r="${selected ? 2.6 : 1.8}" fill="${entry.strategy.color}"><title>${escapeHtml(entry.strategy.label)} — Q ${point.quantity}: ₹${money(point.expectedProfit, 2)}</title></circle>`;
      });
    });

    const chosenPoint = selectedResult.points[Math.min(scenario.quantity, selectedResult.points.length - 1)];
    const chosenX = scaleX(chosenPoint.quantity);
    const chosenY = scaleY(chosenPoint.expectedProfit);
    svg += `<circle cx="${chosenX}" cy="${chosenY}" r="8" fill="#ffffff" stroke="${selectedResult.strategy.color}" stroke-width="4"><title>Selected Q ${chosenPoint.quantity}: ₹${money(chosenPoint.expectedProfit, 2)}</title></circle>`;
    svg += `<text x="${chosenX}" y="${chosenY - 14}" text-anchor="middle" font-size="11" font-weight="800" fill="#20283a">Selected Q</text>`;

    const optimum = selectedResult.optimum;
    const optimumX = scaleX(optimum.quantity);
    const optimumY = scaleY(optimum.expectedProfit);
    const diamond = `${optimumX},${optimumY - 9} ${optimumX + 9},${optimumY} ${optimumX},${optimumY + 9} ${optimumX - 9},${optimumY}`;
    svg += `<polygon points="${diamond}" fill="${selectedResult.strategy.color}" stroke="#ffffff" stroke-width="2"><title>Optimal Q ${optimum.quantity}: ₹${money(optimum.expectedProfit, 2)}</title></polygon>`;
    svg += `<text x="${optimumX}" y="${optimumY + 25}" text-anchor="middle" font-size="11" font-weight="800" fill="#20283a">Optimal Q</text>`;

    svg += `<text x="${(margin.left + width - margin.right) / 2}" y="${height - 18}" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Production quantity</text>`;
    svg += `<text x="18" y="${height / 2}" transform="rotate(-90 18 ${height / 2})" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Expected profit</text>`;
    svg += '</svg>';

    const legend = computed.map((entry) =>
      `<span class="strategy-legend-item ${entry.strategy.id === state.selectedId ? 'selected' : ''}"><i style="background:${entry.strategy.color}"></i>${escapeHtml(entry.strategy.label)}</span>`
    ).join('');

    holder.innerHTML = `${svg}<div class="strategy-legend">${legend}</div>`;
  }

  function renderStrategyTable(computed) {
    const body = byId('pricingBody');
    body.innerHTML = computed.map((entry) => {
      const strategy = entry.strategy;
      const selectedClass = strategy.id === state.selectedId ? 'best' : '';
      return `<tr class="${selectedClass}" data-strategy-id="${escapeHtml(strategy.id)}">
        <td><button class="table-select" type="button" data-select-strategy="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)}</button><small>${escapeHtml(strategy.description)}</small></td>
        <td class="r">₹${money(strategy.price, 2)}</td>
        <td class="r">₹${money(strategy.salvage, 2)}</td>
        <td class="r">${entry.optimum.quantity}</td>
        <td class="r">₹${money(entry.optimum.expectedProfit, 2)}</td>
      </tr>`;
    }).join('');

    body.querySelectorAll('[data-select-strategy]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedId = button.dataset.selectStrategy;
        syncSelectedStrategyFields();
        updateAll();
      });
    });
  }

  function renderResults(scenario, computed, selectedResult) {
    const strategy = selectedResult.strategy;
    const selectedPoint = selectedResult.points[scenario.quantity];
    const optimum = selectedResult.optimum;
    const opportunityLoss = Math.max(0, optimum.expectedProfit - selectedPoint.expectedProfit);

    byId('pq').textContent = scenario.quantity;
    byId('pz').textContent = selectedPoint.z.toFixed(2);
    byId('plost').textContent = selectedPoint.lostSales.toFixed(3);
    byId('psales').textContent = selectedPoint.expectedSales.toFixed(3);
    byId('pleft').textContent = selectedPoint.leftovers.toFixed(3);
    byId('prevenue').textContent = `₹${money(selectedPoint.salesRevenue, 2)}`;
    byId('precovery').textContent = `₹${money(selectedPoint.clearanceRecovery, 2)}`;
    byId('pcost').textContent = `₹${money(selectedPoint.productionCost, 2)}`;
    byId('pprofit').textContent = `₹${money(selectedPoint.expectedProfit, 2)}`;
    byId('optimalQ').textContent = optimum.quantity;
    byId('optimalProfit').textContent = `₹${money(optimum.expectedProfit, 2)}`;
    byId('opportunityLoss').textContent = `₹${money(opportunityLoss, 2)}`;
    byId('selectedComparison').innerHTML = scenario.quantity === optimum.quantity
      ? `<b>Your selected quantity is profit-maximising for ${escapeHtml(strategy.label)} under the current assumptions.</b>`
      : `Your selected quantity is <b>${scenario.quantity}</b>. The calculated optimum for ${escapeHtml(strategy.label)} is <b>${optimum.quantity}</b>, creating an expected opportunity loss of <b>₹${money(opportunityLoss, 2)}</b>.`;

    byId('pFormula').innerHTML =
      `z = (${scenario.quantity} − ${scenario.mean}) / ${scenario.sigma} = ${selectedPoint.z.toFixed(3)}<br>` +
      `E[lost sales] = ${scenario.sigma} × L(z) = ${selectedPoint.lostSales.toFixed(4)}<br>` +
      `E[sales] = ${scenario.mean} − ${selectedPoint.lostSales.toFixed(4)} = ${selectedPoint.expectedSales.toFixed(4)}<br>` +
      `E[leftover] = ${scenario.quantity} − ${selectedPoint.expectedSales.toFixed(4)} = ${selectedPoint.leftovers.toFixed(4)}<br>` +
      `E[profit] = ${strategy.price}×${selectedPoint.expectedSales.toFixed(4)} + ${strategy.salvage}×${selectedPoint.leftovers.toFixed(4)} − ${scenario.cost}×${scenario.quantity}<br>` +
      `E[profit] = <b>₹${money(selectedPoint.expectedProfit, 2)}</b>`;

    const bestAcrossStrategies = computed.reduce((best, entry) => entry.optimum.expectedProfit > best.optimum.expectedProfit ? entry : best, computed[0]);
    byId('bestPricing').innerHTML =
      `<b>Highest modelled expected profit across the displayed strategies:</b> ` +
      `${escapeHtml(bestAcrossStrategies.strategy.label)} at Q = ${bestAcrossStrategies.optimum.quantity}, ` +
      `with expected profit of approximately ₹${money(bestAcrossStrategies.optimum.expectedProfit, 2)}. ` +
      `This recommendation is conditional on the entered demand, cost, price and clearance assumptions.`;
  }

  function updateGraphRangeFromScenario() {
    if (!state.autoRange) return;
    const mean = number('pMu');
    const sigma = number('pSigma');
    const quantity = Math.max(0, Math.round(number('pQ')) || 0);
    if (Number.isFinite(mean) && Number.isFinite(sigma) && sigma > 0) {
      byId('pMaxQ').value = String(automaticMaxQuantity(mean, sigma, quantity));
    }
  }

  function updateAll() {
    updateSelectedStrategyFromFields();
    updateGraphRangeFromScenario();
    syncQuantityControls('number');
    const scenario = readScenario();
    const validation = validate(scenario);

    if (validation.errors.length) {
      setAlert(validation.errors, 'error');
      return;
    }
    setAlert(validation.warnings, validation.warnings.length ? 'warning' : '');

    const computed = state.strategies.map((strategy) => calculateStrategy(strategy, scenario));
    const selectedResult = computed.find((entry) => entry.strategy.id === state.selectedId) || computed[0];

    renderResults(scenario, computed, selectedResult);
    renderProfitChart(computed, scenario, selectedResult);
    renderStrategyTable(computed);
  }

  function addCustomStrategy() {
    const customStrategies = state.strategies.filter((strategy) => strategy.custom);
    if (customStrategies.length >= MAX_CUSTOM_STRATEGIES) {
      setAlert([`A maximum of ${MAX_CUSTOM_STRATEGIES} custom strategies can be compared at once.`], 'warning');
      return;
    }
    state.customCounter += 1;
    const selected = selectedStrategy();
    const index = customStrategies.length;
    const strategy = {
      id: `custom-${Date.now()}-${state.customCounter}`,
      label: `Custom ${state.customCounter}`,
      description: 'Student-defined price and clearance assumptions',
      price: Number.isFinite(selected.price) ? selected.price : 150,
      salvage: Number.isFinite(selected.salvage) ? selected.salvage : 30,
      color: CUSTOM_COLORS[index % CUSTOM_COLORS.length],
      custom: true
    };
    state.strategies.push(strategy);
    state.selectedId = strategy.id;
    refreshStrategySelector();
    updateAll();
  }

  function removeSelectedStrategy() {
    const strategy = selectedStrategy();
    if (!strategy || !strategy.custom) return;
    state.strategies = state.strategies.filter((item) => item.id !== strategy.id);
    state.selectedId = 'ssp3';
    refreshStrategySelector();
    updateAll();
  }

  function resetScenario() {
    state.strategies = cloneCaseStrategies();
    state.selectedId = 'ssp3';
    state.autoRange = true;
    state.customCounter = 0;
    byId('pQ').value = String(CASE_SCENARIO.quantity);
    byId('pQRange').value = String(CASE_SCENARIO.quantity);
    byId('pMu').value = String(CASE_SCENARIO.mean);
    byId('pSigma').value = String(CASE_SCENARIO.sigma);
    byId('pCost').value = String(CASE_SCENARIO.cost);
    byId('autoRange').checked = true;
    byId('pMaxQ').disabled = true;
    byId('pMaxQ').value = String(automaticMaxQuantity(CASE_SCENARIO.mean, CASE_SCENARIO.sigma, CASE_SCENARIO.quantity));
    refreshStrategySelector();
    updateAll();
  }

  function attachListeners() {
    byId('pStrategy').addEventListener('change', (event) => {
      state.selectedId = event.target.value;
      syncSelectedStrategyFields();
      updateAll();
    });

    ['pPrice', 'pSalvage', 'pMu', 'pSigma', 'pCost'].forEach((id) => {
      byId(id).addEventListener('input', updateAll);
    });

    byId('pQ').addEventListener('input', () => {
      syncQuantityControls('number');
      updateAll();
    });

    byId('pQRange').addEventListener('input', () => {
      syncQuantityControls('range');
      updateAll();
    });

    byId('pMaxQ').addEventListener('input', () => {
      syncQuantityControls('number');
      updateAll();
    });

    byId('autoRange').addEventListener('change', (event) => {
      state.autoRange = event.target.checked;
      byId('pMaxQ').disabled = state.autoRange;
      updateAll();
    });

    byId('resetScenario').addEventListener('click', resetScenario);
    byId('addStrategy').addEventListener('click', addCustomStrategy);
    byId('removeStrategy').addEventListener('click', removeSelectedStrategy);
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    resetScenario();
  });
})();
