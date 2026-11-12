(() => {
  'use strict';

  const DEFAULTS = {
    quantity: 12,
    mean: 7,
    sigma: 5,
    price: 146.5,
    cost: 57,
    ordinary: 29.3,
    corporate: 58.6,
    cap: 5,
    rho: 0.75,
    maxQuantity: 27
  };

  const COLORS = {
    baseline: '#7b8496',
    capped: '#0d7f78',
    probabilistic: '#5b3f8c',
    cost: '#b84a52',
    effective: '#d98b2b'
  };

  const MAX_Q = 200;
  const byId = (id) => document.getElementById(id);
  const readNumber = (id) => Number(byId(id).value);
  const money = (value, digits = 2) => new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);

  let autoRange = true;

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

  function expectedPositivePart(x, mean, sigma) {
    const z = (x - mean) / sigma;
    return (x - mean) * normalCdf(z) + sigma * normalPdf(z);
  }

  function expectedOperations(quantity, mean, sigma) {
    const z = (quantity - mean) / sigma;
    const lostSales = Math.max(0, sigma * lossFunction(z));
    const expectedSales = Math.min(quantity, Math.max(0, mean - lostSales));
    const leftovers = Math.max(0, quantity - expectedSales);
    return { z, lostSales, expectedSales, leftovers };
  }

  function evaluateBaseline(quantity, scenario) {
    const operations = expectedOperations(quantity, scenario.mean, scenario.sigma);
    const expectedProfit =
      scenario.price * operations.expectedSales +
      scenario.ordinary * operations.leftovers -
      scenario.cost * quantity;
    return { quantity, ...operations, expectedProfit };
  }

  function evaluateCapped(quantity, scenario) {
    const operations = expectedOperations(quantity, scenario.mean, scenario.sigma);
    let overflow = 0;
    if (quantity > scenario.cap) {
      overflow = expectedPositivePart(quantity - scenario.cap, scenario.mean, scenario.sigma);
    }
    overflow = Math.min(operations.leftovers, Math.max(0, overflow));
    const covered = Math.max(0, operations.leftovers - overflow);
    const expectedProfit =
      scenario.price * operations.expectedSales +
      scenario.corporate * covered +
      scenario.ordinary * overflow -
      scenario.cost * quantity;
    return { quantity, ...operations, covered, overflow, expectedProfit };
  }

  function evaluateProbabilistic(quantity, scenario, rho = scenario.rho) {
    const operations = expectedOperations(quantity, scenario.mean, scenario.sigma);
    const effectiveValue = rho * scenario.corporate + (1 - rho) * scenario.ordinary;
    const expectedProfit =
      scenario.price * operations.expectedSales +
      effectiveValue * operations.leftovers -
      scenario.cost * quantity;
    return { quantity, ...operations, effectiveValue, expectedProfit };
  }

  function readScenario() {
    return {
      quantity: Math.round(readNumber('bbQ')),
      mean: readNumber('bbMu'),
      sigma: readNumber('bbSigma'),
      price: readNumber('bbPrice'),
      cost: readNumber('bbCost'),
      ordinary: readNumber('bbOrdinary'),
      corporate: readNumber('bbCorporate'),
      cap: Math.round(readNumber('bbCap')),
      rho: readNumber('bbRho') / 100,
      maxQuantity: Math.round(readNumber('bbMaxQ'))
    };
  }

  function automaticMaxQuantity(scenario) {
    return Math.min(
      MAX_Q,
      Math.max(
        15,
        scenario.quantity + 4,
        scenario.cap + 5,
        Math.ceil(scenario.mean + 4 * scenario.sigma)
      )
    );
  }

  function validate(scenario) {
    const errors = [];
    const warnings = [];
    if (!Number.isFinite(scenario.quantity) || scenario.quantity < 1) errors.push('Production quantity must be at least 1.');
    if (!Number.isFinite(scenario.mean) || scenario.mean < 0) errors.push('Demand mean must be zero or greater.');
    if (!Number.isFinite(scenario.sigma) || scenario.sigma <= 0) errors.push('Demand standard deviation must be greater than zero.');
    ['price', 'cost', 'ordinary', 'corporate'].forEach((key) => {
      if (!Number.isFinite(scenario[key]) || scenario[key] < 0) errors.push(`${key[0].toUpperCase() + key.slice(1)} must be zero or greater.`);
    });
    if (!Number.isFinite(scenario.cap) || scenario.cap < 0) errors.push('The buyback cap must be zero or greater.');
    if (!Number.isFinite(scenario.maxQuantity) || scenario.maxQuantity < 5 || scenario.maxQuantity > MAX_Q) errors.push(`Maximum Q must be between 5 and ${MAX_Q}.`);
    if (scenario.maxQuantity < scenario.quantity) errors.push('Maximum Q must be at least as large as the selected production quantity.');
    if (scenario.corporate < scenario.ordinary) warnings.push('The corporate value is below the ordinary clearance value; the proposed corporate plan does not improve recovery.');
    if (scenario.ordinary >= scenario.cost) warnings.push('Ordinary clearance value is at least unit cost. Even inventory beyond the capped commitment may not impose a downside, so a finite optimum may not exist.');
    if (scenario.mean < 3 * scenario.sigma) warnings.push('The normal approximation assigns some probability to negative demand. Treat this as a classroom approximation and test alternative distributions.');
    return { errors, warnings };
  }

  function setValidation(messages, type) {
    const holder = byId('bbValidation');
    if (!messages.length) {
      holder.hidden = true;
      holder.innerHTML = '';
      holder.className = 'bb-alert';
      return;
    }
    holder.hidden = false;
    holder.className = `bb-alert ${type}`;
    holder.innerHTML = messages.map((message) => `<div>${message}</div>`).join('');
  }

  function syncQuantity(source) {
    const input = byId('bbQ');
    const range = byId('bbQRange');
    const maxQ = Math.max(5, Math.round(readNumber('bbMaxQ')) || 5);
    range.max = String(maxQ);
    if (source === 'range') input.value = range.value;
    if (source === 'number') {
      const value = Math.min(MAX_Q, Math.max(1, Math.round(Number(input.value) || 1)));
      input.value = String(value);
      range.value = String(Math.min(value, maxQ));
    }
    byId('bbQValue').textContent = input.value;
  }

  function buildSeries(evaluator, scenario, rho) {
    const points = [];
    for (let quantity = 1; quantity <= scenario.maxQuantity; quantity += 1) {
      points.push(rho === undefined ? evaluator(quantity, scenario) : evaluator(quantity, scenario, rho));
    }
    const optimum = points.reduce((best, point) =>
      point.expectedProfit > best.expectedProfit ? point : best
    , points[0]);
    return { points, optimum };
  }

  function boundaryStatus(series, scenario, type) {
    const atBoundary = series.optimum.quantity === scenario.maxQuantity;
    if (type === 'probabilistic') {
      const effective = scenario.rho * scenario.corporate + (1 - scenario.rho) * scenario.ordinary;
      if (effective >= scenario.cost) return { unbounded: true, atBoundary: true };
    }
    if (type === 'baseline' && scenario.ordinary >= scenario.cost) return { unbounded: true, atBoundary: true };
    if (type === 'capped' && scenario.ordinary >= scenario.cost) return { unbounded: true, atBoundary: true };
    return { unbounded: false, atBoundary };
  }

  function reliabilityThreshold(scenario) {
    const denominator = scenario.corporate - scenario.ordinary;
    if (Math.abs(denominator) < 1e-9) return null;
    return (scenario.cost - scenario.ordinary) / denominator;
  }

  function axisMoney(value) {
    const absolute = Math.abs(value);
    if (absolute >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (absolute >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
    return `₹${Math.round(value)}`;
  }

  function renderProfitChart(scenario, baseline, capped, probabilistic) {
    const holder = byId('bbProfitChart');
    const width = 940;
    const height = 440;
    const margin = { left: 86, right: 28, top: 28, bottom: 70 };
    const all = [...baseline.points, ...capped.points, ...probabilistic.points];
    let yMin = Math.min(0, ...all.map((point) => point.expectedProfit));
    let yMax = Math.max(0, ...all.map((point) => point.expectedProfit));
    const padding = Math.max(1, (yMax - yMin) * 0.1);
    yMin -= padding;
    yMax += padding;

    const scaleX = (q) => margin.left + ((q - 1) / Math.max(1, scenario.maxQuantity - 1)) * (width - margin.left - margin.right);
    const scaleY = (value) => height - margin.bottom - ((value - yMin) / Math.max(1, yMax - yMin)) * (height - margin.top - margin.bottom);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Expected profit comparison for ordinary clearance, capped buyback and probabilistic commitment">`;

    for (let i = 0; i <= 5; i += 1) {
      const value = yMin + (yMax - yMin) * i / 5;
      const y = scaleY(value);
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e9f1"/>`;
      svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#667085">${axisMoney(value)}</text>`;
    }

    const ticks = Math.min(8, scenario.maxQuantity - 1);
    for (let i = 0; i <= ticks; i += 1) {
      const q = Math.max(1, Math.round(1 + (scenario.maxQuantity - 1) * i / Math.max(1, ticks)));
      const x = scaleX(q);
      svg += `<line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}" stroke="#667085"/>`;
      svg += `<text x="${x}" y="${height - margin.bottom + 23}" text-anchor="middle" font-size="11" fill="#667085">${q}</text>`;
    }

    if (yMin < 0 && yMax > 0) {
      const y0 = scaleY(0);
      svg += `<line x1="${margin.left}" y1="${y0}" x2="${width - margin.right}" y2="${y0}" stroke="#98a2b3" stroke-width="1.5"/>`;
    }

    const series = [
      { name: 'Ordinary clearance', data: baseline, color: COLORS.baseline },
      { name: 'Capped buyback', data: capped, color: COLORS.capped },
      { name: `Probabilistic commitment (${Math.round(scenario.rho * 100)}%)`, data: probabilistic, color: COLORS.probabilistic }
    ];

    series.forEach((entry) => {
      const polyline = entry.data.points.map((point) => `${scaleX(point.quantity)},${scaleY(point.expectedProfit)}`).join(' ');
      svg += `<polyline points="${polyline}" fill="none" stroke="${entry.color}" stroke-width="3"/>`;
      entry.data.points.forEach((point) => {
        svg += `<circle cx="${scaleX(point.quantity)}" cy="${scaleY(point.expectedProfit)}" r="2.2" fill="${entry.color}"><title>${entry.name} — Q ${point.quantity}: ₹${money(point.expectedProfit)}</title></circle>`;
      });
      const selected = entry.data.points[scenario.quantity - 1];
      svg += `<circle cx="${scaleX(selected.quantity)}" cy="${scaleY(selected.expectedProfit)}" r="6.5" fill="#fff" stroke="${entry.color}" stroke-width="3"><title>${entry.name}, selected Q ${selected.quantity}: ₹${money(selected.expectedProfit)}</title></circle>`;
      const optimum = entry.data.optimum;
      const x = scaleX(optimum.quantity);
      const y = scaleY(optimum.expectedProfit);
      const diamond = `${x},${y - 8} ${x + 8},${y} ${x},${y + 8} ${x - 8},${y}`;
      svg += `<polygon points="${diamond}" fill="${entry.color}" stroke="#fff" stroke-width="1.5"><title>${entry.name}, graph maximum at Q ${optimum.quantity}: ₹${money(optimum.expectedProfit)}</title></polygon>`;
    });

    svg += `<text x="${(margin.left + width - margin.right) / 2}" y="${height - 18}" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Production quantity</text>`;
    svg += `<text x="18" y="${height / 2}" transform="rotate(-90 18 ${height / 2})" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Expected profit</text>`;
    svg += '</svg>';

    const legend = series.map((entry) => `<span><i style="background:${entry.color}"></i>${entry.name}</span>`).join('');
    holder.innerHTML = `${svg}<div class="strategy-legend">${legend}</div>`;
  }

  function renderValueSensitivity(scenario) {
    const holder = byId('bbValueSensitivity');
    const width = 760;
    const height = 330;
    const margin = { left: 72, right: 24, top: 26, bottom: 58 };
    const values = Array.from({ length: 101 }, (_, index) =>
      scenario.ordinary + (scenario.corporate - scenario.ordinary) * index / 100
    );
    let yMin = Math.min(0, scenario.ordinary, scenario.corporate, scenario.cost);
    let yMax = Math.max(scenario.ordinary, scenario.corporate, scenario.cost);
    const padding = Math.max(1, (yMax - yMin) * 0.12);
    yMin -= padding;
    yMax += padding;
    const scaleX = (rho) => margin.left + rho * (width - margin.left - margin.right);
    const scaleY = (value) => height - margin.bottom - ((value - yMin) / Math.max(1, yMax - yMin)) * (height - margin.top - margin.bottom);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Effective clearance value by corporate acceptance probability">`;
    for (let i = 0; i <= 5; i += 1) {
      const value = yMin + (yMax - yMin) * i / 5;
      const y = scaleY(value);
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e9f1"/>`;
      svg += `<text x="${margin.left - 9}" y="${y + 4}" text-anchor="end" font-size="11" fill="#667085">₹${value.toFixed(0)}</text>`;
    }
    for (let i = 0; i <= 4; i += 1) {
      const rho = i / 4;
      const x = scaleX(rho);
      svg += `<text x="${x}" y="${height - margin.bottom + 23}" text-anchor="middle" font-size="11" fill="#667085">${Math.round(rho * 100)}%</text>`;
    }
    const points = values.map((value, index) => `${scaleX(index / 100)},${scaleY(value)}`).join(' ');
    svg += `<polyline points="${points}" fill="none" stroke="${COLORS.effective}" stroke-width="4"/>`;
    const costY = scaleY(scenario.cost);
    svg += `<line x1="${margin.left}" y1="${costY}" x2="${width - margin.right}" y2="${costY}" stroke="${COLORS.cost}" stroke-width="2.5" stroke-dasharray="8 6"/>`;
    svg += `<text x="${width - margin.right}" y="${costY - 8}" text-anchor="end" font-size="11" font-weight="700" fill="${COLORS.cost}">Unit cost ₹${money(scenario.cost)}</text>`;

    const threshold = reliabilityThreshold(scenario);
    if (threshold !== null && threshold >= 0 && threshold <= 1) {
      const x = scaleX(threshold);
      svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}" stroke="#344054" stroke-width="1.5" stroke-dasharray="4 5"/>`;
      svg += `<text x="${x}" y="${margin.top + 12}" text-anchor="middle" font-size="11" font-weight="700" fill="#344054">ρ* ${(threshold * 100).toFixed(1)}%</text>`;
    }

    const currentValue = scenario.rho * scenario.corporate + (1 - scenario.rho) * scenario.ordinary;
    const currentX = scaleX(scenario.rho);
    const currentY = scaleY(currentValue);
    svg += `<circle cx="${currentX}" cy="${currentY}" r="7" fill="#fff" stroke="${COLORS.probabilistic}" stroke-width="3"><title>Current ρ ${Math.round(scenario.rho * 100)}%: effective value ₹${money(currentValue)}</title></circle>`;
    svg += `<text x="${(margin.left + width - margin.right) / 2}" y="${height - 15}" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Corporate acceptance probability ρ</text>`;
    svg += `<text x="17" y="${height / 2}" transform="rotate(-90 17 ${height / 2})" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Effective leftover value</text>`;
    svg += '</svg>';
    holder.innerHTML = `${svg}<div class="strategy-legend"><span><i style="background:${COLORS.effective}"></i>Effective clearance value</span><span><i style="background:${COLORS.cost}"></i>Unit cost</span></div>`;
  }

  function renderQuantitySensitivity(scenario) {
    const holder = byId('bbQuantitySensitivity');
    const width = 760;
    const height = 330;
    const margin = { left: 62, right: 24, top: 26, bottom: 58 };
    const points = [];
    for (let index = 0; index <= 100; index += 2) {
      const rho = index / 100;
      const series = buildSeries(evaluateProbabilistic, scenario, rho);
      points.push({ rho, q: series.optimum.quantity });
    }
    const scaleX = (rho) => margin.left + rho * (width - margin.left - margin.right);
    const scaleY = (q) => height - margin.bottom - ((q - 1) / Math.max(1, scenario.maxQuantity - 1)) * (height - margin.top - margin.bottom);

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Modelled optimal production quantity by corporate acceptance probability">`;
    for (let i = 0; i <= 5; i += 1) {
      const q = Math.round(1 + (scenario.maxQuantity - 1) * i / 5);
      const y = scaleY(q);
      svg += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e9f1"/>`;
      svg += `<text x="${margin.left - 9}" y="${y + 4}" text-anchor="end" font-size="11" fill="#667085">${q}</text>`;
    }
    for (let i = 0; i <= 4; i += 1) {
      const rho = i / 4;
      const x = scaleX(rho);
      svg += `<text x="${x}" y="${height - margin.bottom + 23}" text-anchor="middle" font-size="11" fill="#667085">${Math.round(rho * 100)}%</text>`;
    }
    const polyline = points.map((point) => `${scaleX(point.rho)},${scaleY(point.q)}`).join(' ');
    svg += `<polyline points="${polyline}" fill="none" stroke="${COLORS.probabilistic}" stroke-width="4"/>`;
    points.forEach((point) => {
      svg += `<circle cx="${scaleX(point.rho)}" cy="${scaleY(point.q)}" r="2.3" fill="${COLORS.probabilistic}"><title>ρ ${Math.round(point.rho * 100)}%: graph-optimal Q ${point.q}</title></circle>`;
    });
    const currentSeries = buildSeries(evaluateProbabilistic, scenario, scenario.rho);
    svg += `<circle cx="${scaleX(scenario.rho)}" cy="${scaleY(currentSeries.optimum.quantity)}" r="7" fill="#fff" stroke="${COLORS.probabilistic}" stroke-width="3"/>`;
    svg += `<text x="${(margin.left + width - margin.right) / 2}" y="${height - 15}" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Corporate acceptance probability ρ</text>`;
    svg += `<text x="17" y="${height / 2}" transform="rotate(-90 17 ${height / 2})" text-anchor="middle" font-size="12" font-weight="700" fill="#505a6c">Graph-optimal production Q</text>`;
    svg += '</svg>';
    holder.innerHTML = `${svg}<div class="boundary-note">When the line reaches the graph maximum, expand the range and check whether the result is a boundary effect rather than a finite optimum.</div>`;
  }

  function renderTable(scenario, baseline, capped, probabilistic) {
    const selectedIndex = scenario.quantity - 1;
    const baselineStatus = boundaryStatus(baseline, scenario, 'baseline');
    const cappedStatus = boundaryStatus(capped, scenario, 'capped');
    const probStatus = boundaryStatus(probabilistic, scenario, 'probabilistic');

    const rows = [
      {
        name: 'Ordinary clearance only',
        selected: baseline.points[selectedIndex].expectedProfit,
        series: baseline,
        status: baselineStatus,
        interpretation: 'SARTHAK bears all leftover-inventory risk at the ordinary clearance value.'
      },
      {
        name: `Guaranteed capped buyback (B=${scenario.cap})`,
        selected: capped.points[selectedIndex].expectedProfit,
        series: capped,
        status: cappedStatus,
        interpretation: 'The partner absorbs the first capped units of leftover risk; SARTHAK bears the excess.'
      },
      {
        name: `Probabilistic commitment (ρ=${Math.round(scenario.rho * 100)}%)`,
        selected: probabilistic.points[selectedIndex].expectedProfit,
        series: probabilistic,
        status: probStatus,
        interpretation: 'All leftovers receive the higher value only in expectation; contract-reliability risk remains with SARTHAK.'
      }
    ];

    byId('bbComparisonBody').innerHTML = rows.map((row) => {
      const qText = row.status.unbounded ? `≥ ${scenario.maxQuantity}*` : `${row.series.optimum.quantity}${row.status.atBoundary ? '*' : ''}`;
      const profitText = row.status.unbounded ? `₹${money(row.series.optimum.expectedProfit)}*` : `₹${money(row.series.optimum.expectedProfit)}`;
      return `<tr>
        <td><b>${row.name}</b></td>
        <td class="r">₹${money(row.selected)}</td>
        <td class="r">${qText}</td>
        <td class="r">${profitText}</td>
        <td>${row.interpretation}</td>
      </tr>`;
    }).join('');
  }

  function renderResults(scenario, baseline, capped, probabilistic) {
    const selectedIndex = scenario.quantity - 1;
    const capSelected = capped.points[selectedIndex];
    const probSelected = probabilistic.points[selectedIndex];
    const threshold = reliabilityThreshold(scenario);
    const probStatus = boundaryStatus(probabilistic, scenario, 'probabilistic');
    const capStatus = boundaryStatus(capped, scenario, 'capped');

    byId('bbSales').textContent = capSelected.expectedSales.toFixed(3);
    byId('bbLeftovers').textContent = capSelected.leftovers.toFixed(3);
    byId('bbEffective').textContent = `₹${money(probSelected.effectiveValue)}`;
    if (threshold === null) {
      byId('bbThreshold').textContent = 'No reliability effect';
    } else if (threshold <= 0) {
      byId('bbThreshold').textContent = '0% or lower';
    } else if (threshold > 1) {
      byId('bbThreshold').textContent = 'Above 100%';
    } else {
      byId('bbThreshold').textContent = `${(threshold * 100).toFixed(1)}%`;
    }

    byId('bbCovered').textContent = capSelected.covered.toFixed(3);
    byId('bbOverflow').textContent = capSelected.overflow.toFixed(3);
    byId('bbCapSelectedProfit').textContent = `₹${money(capSelected.expectedProfit)}`;
    byId('bbCapOptimalQ').textContent = capStatus.unbounded ? 'No finite optimum' : `${capped.optimum.quantity}${capStatus.atBoundary ? '*' : ''}`;
    byId('bbCapOptimalProfit').textContent = `₹${money(capped.optimum.expectedProfit)}${capStatus.atBoundary ? '*' : ''}`;

    byId('bbProbRho').textContent = `${Math.round(scenario.rho * 100)}%`;
    byId('bbProbSelectedProfit').textContent = `₹${money(probSelected.expectedProfit)}`;
    byId('bbProbOptimalQ').textContent = probStatus.unbounded ? 'No finite optimum' : `${probabilistic.optimum.quantity}${probStatus.atBoundary ? '*' : ''}`;
    byId('bbProbOptimalProfit').textContent = `₹${money(probabilistic.optimum.expectedProfit)}${probStatus.atBoundary ? '*' : ''}`;

    const statusHolder = byId('bbProbStatus');
    if (probStatus.unbounded) {
      statusHolder.textContent = 'Unbounded under current assumptions';
      statusHolder.className = 'status-risk';
    } else if (probStatus.atBoundary) {
      statusHolder.textContent = 'Graph-boundary result';
      statusHolder.className = 'status-warn';
    } else {
      statusHolder.textContent = 'Finite model optimum';
      statusHolder.className = 'status-good';
    }

    let recommendation = '';
    if (probStatus.unbounded) {
      recommendation = `<b>Managerial warning:</b> at ρ = ${Math.round(scenario.rho * 100)}%, the effective leftover value is ₹${money(probSelected.effectiveValue)}, which is at least the unit cost of ₹${money(scenario.cost)}. An unrestricted probabilistic commitment therefore removes the downside from additional leftovers and does not yield a meaningful finite production optimum. Add a quantity cap, acceptance ceiling, or net handling cost.`;
    } else {
      const preferred = capped.optimum.expectedProfit >= probabilistic.optimum.expectedProfit ? 'capped buyback' : 'probabilistic commitment';
      recommendation = `<b>Model comparison:</b> within the current graph range, the ${preferred} produces the higher maximum expected profit. The recommendation remains conditional on the corporate partner’s legal commitment, quality acceptance, payment timing and the evidence supporting ρ.`;
    }
    byId('bbRecommendation').innerHTML = recommendation;

    byId('bbCapFormula').innerHTML =
      `L = max(Q − D, 0)<br>` +
      `E[sales] = ${capSelected.expectedSales.toFixed(4)}<br>` +
      `E[leftovers] = ${capSelected.leftovers.toFixed(4)}<br>` +
      `E[min(L,B)] = ${capSelected.covered.toFixed(4)}<br>` +
      `E[max(L−B,0)] = ${capSelected.overflow.toFixed(4)}<br>` +
      `E[π<sub>cap</sub>] = ${scenario.price}×${capSelected.expectedSales.toFixed(4)} + ${scenario.corporate}×${capSelected.covered.toFixed(4)} + ${scenario.ordinary}×${capSelected.overflow.toFixed(4)} − ${scenario.cost}×${scenario.quantity}<br>` +
      `E[π<sub>cap</sub>] = <b>₹${money(capSelected.expectedProfit)}</b>`;

    byId('bbProbFormula').innerHTML =
      `v<sub>effective</sub> = ${scenario.rho.toFixed(2)}×${scenario.corporate} + ${(1 - scenario.rho).toFixed(2)}×${scenario.ordinary} = ₹${money(probSelected.effectiveValue)}<br>` +
      `E[sales] = ${probSelected.expectedSales.toFixed(4)}<br>` +
      `E[leftovers] = ${probSelected.leftovers.toFixed(4)}<br>` +
      `E[π<sub>prob</sub>] = ${scenario.price}×${probSelected.expectedSales.toFixed(4)} + ${probSelected.effectiveValue.toFixed(2)}×${probSelected.leftovers.toFixed(4)} − ${scenario.cost}×${scenario.quantity}<br>` +
      `E[π<sub>prob</sub>] = <b>₹${money(probSelected.expectedProfit)}</b>`;

    renderTable(scenario, baseline, capped, probabilistic);
  }

  function updateAll() {
    const preliminary = readScenario();
    if (autoRange && Number.isFinite(preliminary.mean) && Number.isFinite(preliminary.sigma) && preliminary.sigma > 0) {
      byId('bbMaxQ').value = String(automaticMaxQuantity(preliminary));
    }
    syncQuantity('number');
    const scenario = readScenario();
    byId('bbRhoValue').textContent = `${Math.round(scenario.rho * 100)}%`;

    const validation = validate(scenario);
    if (validation.errors.length) {
      setValidation(validation.errors, 'error');
      return;
    }
    setValidation(validation.warnings, validation.warnings.length ? 'warning' : '');

    const baseline = buildSeries(evaluateBaseline, scenario);
    const capped = buildSeries(evaluateCapped, scenario);
    const probabilistic = buildSeries(evaluateProbabilistic, scenario, scenario.rho);

    renderResults(scenario, baseline, capped, probabilistic);
    renderProfitChart(scenario, baseline, capped, probabilistic);
    renderValueSensitivity(scenario);
    renderQuantitySensitivity(scenario);
  }

  function reset() {
    byId('bbQ').value = DEFAULTS.quantity;
    byId('bbQRange').value = DEFAULTS.quantity;
    byId('bbMu').value = DEFAULTS.mean;
    byId('bbSigma').value = DEFAULTS.sigma;
    byId('bbPrice').value = DEFAULTS.price;
    byId('bbCost').value = DEFAULTS.cost;
    byId('bbOrdinary').value = DEFAULTS.ordinary;
    byId('bbCorporate').value = DEFAULTS.corporate;
    byId('bbCap').value = DEFAULTS.cap;
    byId('bbRho').value = Math.round(DEFAULTS.rho * 100);
    byId('bbMaxQ').value = DEFAULTS.maxQuantity;
    byId('bbAutoRange').checked = true;
    byId('bbMaxQ').disabled = true;
    autoRange = true;
    updateAll();
  }

  function attachListeners() {
    ['bbMu', 'bbSigma', 'bbPrice', 'bbCost', 'bbOrdinary', 'bbCorporate', 'bbCap', 'bbRho'].forEach((id) => {
      byId(id).addEventListener('input', updateAll);
    });

    byId('bbQ').addEventListener('input', () => {
      syncQuantity('number');
      updateAll();
    });
    byId('bbQRange').addEventListener('input', () => {
      syncQuantity('range');
      updateAll();
    });
    byId('bbMaxQ').addEventListener('input', () => {
      syncQuantity('number');
      updateAll();
    });
    byId('bbAutoRange').addEventListener('change', (event) => {
      autoRange = event.target.checked;
      byId('bbMaxQ').disabled = autoRange;
      updateAll();
    });
    byId('bbReset').addEventListener('click', reset);
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    reset();
  });
})();