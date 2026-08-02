const $ = (selector) => document.querySelector(selector);
const fmt = new Intl.NumberFormat('es-CO');
const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
const money = (value) => `$${compact.format(value)}`;
const dateFmt = (value) => new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
let data;
let selectedProductType = null;

function trafficColor(index, total) {
  const palette = ['#237a3b', '#78a641', '#e0b52f', '#e47d2b', '#c83e35'];
  const position = total > 1 ? index / (total - 1) : 0;
  return palette[Math.round(position * (palette.length - 1))];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

function setKpis(kpis) {
  $('#sold').textContent = fmt.format(kpis.sold);
  $('#available').textContent = fmt.format(kpis.available);
  $('#total').textContent = fmt.format(kpis.total);
  $('#soldValue').textContent = `${money(kpis.sold_value)} COP vendidos`;
  $('#availableValue').textContent = `${money(kpis.available_value)} COP en inventario`;
  const progress = kpis.total ? kpis.sold / kpis.total * 100 : 0;
  $('#progressValue').textContent = `${progress.toFixed(1)}%`;
  $('#progressBar').style.width = `${progress}%`;
  $('#progressCaption').textContent = `${fmt.format(kpis.sold)} de ${fmt.format(kpis.total)} unidades`;
}

function barMarkup(label, value, max, suffix = '', index = 0, total = 1) {
  return `<div class="bar-row"><div class="bar-label"><span>${label}</span><strong>${fmt.format(value)}${suffix}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${max ? value / max * 100 : 0}%;background:${trafficColor(index, total)}"></div></div></div>`;
}

function renderProductMix(metric) {
  const totals = dateFilteredSoldUnits().reduce((result, unit) => {
    result[unit.type] = (result[unit.type] || 0) + (metric === 'value' ? unit.price : 1);
    return result;
  }, {});
  const ordered = Object.entries(totals).map(([type, value]) => ({type, value})).sort((a, b) => b.value - a.value);
  const total = ordered.reduce((sum, row) => sum + row.value, 0);
  const circumference = 2 * Math.PI * 72;
  let cumulative = 0;
  const slices = ordered.map((row, index) => {
    const fraction = total ? row.value / total : 0;
    const dash = fraction * circumference;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    const exactValue = metric === 'value' ? `$${fmt.format(row.value)} COP` : `${fmt.format(row.value)} unidades`;
    const stateClass = selectedProductType ? (selectedProductType === row.type ? ' is-selected' : ' is-muted') : '';
    return `<circle class="product-slice product-filter-control${stateClass}" data-index="${index}" cx="110" cy="110" r="72" fill="none" stroke="${trafficColor(index, ordered.length)}" stroke-width="36" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${offset}" transform="rotate(-90 110 110)" tabindex="0" role="button" aria-pressed="${selectedProductType === row.type}"><title>${row.type}: ${exactValue} (${(fraction * 100).toFixed(1)}%). Seleccionar para filtrar.</title></circle>`;
  }).join('');
  const centerValue = metric === 'value' ? money(total) : fmt.format(total);
  const centerLabel = metric === 'value' ? 'COP vendidos' : 'unidades vendidas';
  $('#productMixMetric').textContent = metric === 'value' ? 'Valor COP' : 'Unidades';
  $('#productMixChart').innerHTML = `<div class="product-filter-status">${selectedProductType ? `<span>Filtrando histórico por <strong>${selectedProductType}</strong></span><button id="clearProductFilter" type="button">Ver todas</button>` : '<span>Mostrando todas las tipologías</span>'}</div><div class="product-mix-layout"><svg class="product-donut-svg" viewBox="0 0 220 220" role="img" aria-label="Distribución de ventas por tipología"><circle cx="110" cy="110" r="72" fill="none" stroke="#ecece7" stroke-width="36"></circle>${slices}<text class="product-total" x="110" y="106" text-anchor="middle">${centerValue}</text><text class="product-total-label" x="110" y="126" text-anchor="middle">${centerLabel}</text></svg><div class="product-legend"><div class="product-legend-head"><span></span><span>Tipología</span><span>Participación</span><span>Resultado</span></div>${ordered.map((row, index) => { const share = total ? row.value / total * 100 : 0; const stateClass = selectedProductType ? (selectedProductType === row.type ? ' is-selected' : ' is-muted') : ''; const exactResult = metric === 'value' ? '$'+fmt.format(row.value)+' COP' : fmt.format(row.value)+' unidades'; return `<button type="button" class="product-legend-row product-filter-control${stateClass}" data-index="${index}" aria-pressed="${selectedProductType === row.type}" title="${exactResult}"><i style="background:${trafficColor(index, ordered.length)}"></i><strong>${row.type}</strong><small>${share.toFixed(1)}%</small><b>${metric === 'value' ? money(row.value) : fmt.format(row.value)}</b></button>`; }).join('')}</div></div>`;
  const toggleFilter = index => {
    const type = ordered[index].type;
    selectedProductType = selectedProductType === type ? null : type;
    renderProductMix(metric);
    renderChart(historyRows($('#periodFilter').value), metric, $('#periodFilter').value);
  };
  $('#productMixChart').querySelectorAll('.product-filter-control').forEach(control => {
    control.addEventListener('click', () => toggleFilter(Number(control.dataset.index)));
    if (control.tagName.toLowerCase() !== 'button') {
      control.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleFilter(Number(control.dataset.index)); }
      });
    }
  });
  $('#clearProductFilter')?.addEventListener('click', () => {
    selectedProductType = null;
    renderProductMix(metric);
    renderChart(historyRows($('#periodFilter').value), metric, $('#periodFilter').value);
  });
}

function localIso(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function datasetDateBounds() {
  const dates = data.sold_units.map(unit => unit.sale_date).sort();
  return {min: dates[0], max: dates.at(-1)};
}

function activeDateBounds() {
  const bounds = datasetDateBounds();
  return {
    min: $('#startDateFilter').value || bounds.min,
    max: $('#endDateFilter').value || bounds.max
  };
}

function dateFilteredSoldUnits() {
  const bounds = activeDateBounds();
  return data.sold_units.filter(unit => unit.sale_date >= bounds.min && unit.sale_date <= bounds.max);
}

function setupDateFilters() {
  const bounds = datasetDateBounds();
  const start = $('#startDateFilter');
  const end = $('#endDateFilter');
  const previousDatasetMax = end.max;
  const previousStart = start.value;
  const previousEnd = end.value;
  for (const input of [start, end]) { input.min = bounds.min; input.max = bounds.max; }
  start.value = !previousStart || previousStart < bounds.min || previousStart > bounds.max ? bounds.min : previousStart;
  end.value = !previousEnd || previousEnd === previousDatasetMax || previousEnd < bounds.min || previousEnd > bounds.max ? bounds.max : previousEnd;
}

function periodStart(value, granularity) {
  const result = new Date(`${value}T12:00:00`);
  if (granularity === 'week') result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  if (granularity === 'month') result.setDate(1);
  if (granularity === 'quarter') { result.setMonth(Math.floor(result.getMonth() / 3) * 3, 1); }
  return result;
}

function formatPeriod(value, granularity, short = false) {
  const date = new Date(`${value}T12:00:00`);
  if (granularity === 'quarter') return `T${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  if (granularity === 'month') return new Intl.DateTimeFormat('es-CO', {month: short ? 'short' : 'long', year:'numeric'}).format(date);
  return short ? dateFmt(value) : `Semana del ${new Intl.DateTimeFormat('es-CO', {dateStyle:'medium'}).format(date)}`;
}

function historyRows(granularity) {
  if (!data.sold_units.length) return [];
  const bounds = activeDateBounds();
  const first = periodStart(bounds.min, granularity);
  const last = periodStart(bounds.max, granularity);
  const periods = new Map();
  for (const cursor = new Date(first); cursor <= last;) {
    const period = localIso(cursor);
    periods.set(period, {period, count: 0, value: 0});
    if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + (granularity === 'quarter' ? 3 : 1));
  }
  dateFilteredSoldUnits().filter(unit => !selectedProductType || unit.type === selectedProductType).forEach(unit => {
    const period = localIso(periodStart(unit.sale_date, granularity));
    if (!periods.has(period)) periods.set(period, {period, count: 0, value: 0});
    periods.get(period).count += 1;
    periods.get(period).value += unit.price;
  });
  return [...periods.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function renderAreaDetail(units) {
  const definitions = [
    {label:'Menos de 50 m²', test:value=>value<50},
    {label:'50–69 m²', test:value=>value>=50&&value<70},
    {label:'70–99 m²', test:value=>value>=70&&value<100},
    {label:'100 m² o más', test:value=>value>=100}
  ];
  const ordered = definitions.map(definition => ({
    label: definition.label,
    sold: units.filter(unit => definition.test(unit.area)).length
  })).sort((a, b) => b.sold - a.sold);
  const max = Math.max(...ordered.map(row => row.sold), 1);
  $('#areaRangeCountBadge').textContent = `${ordered.length} rangos`;
  $('#areaDetailChart').innerHTML = ordered.map((row, index) => {
    const share = units.length ? row.sold / units.length * 100 : 0;
    return `<div class="area-rank-row" style="--traffic:${trafficColor(index, ordered.length)}"><div class="area-rank-meta"><span class="area-rank-number">${String(index + 1).padStart(2, '0')}</span><strong>${row.label}</strong><b>${fmt.format(row.sold)} unidades</b><small>${share.toFixed(1)}%</small></div><div class="area-rank-track"><i style="width:${row.sold / max * 100}%"></i></div></div>`;
  }).join('');
}

function renderPeriodComparison(rows, metric, granularity) {
  const current = rows.at(-1);
  const previous = rows.at(-2);
  const formatValue = value => metric === 'value' ? `${money(value)} COP` : `${fmt.format(value)} unidades`;
  $('#currentPeriodLabel').textContent = current ? formatPeriod(current.period, granularity) : 'Sin datos';
  $('#previousPeriodLabel').textContent = previous ? formatPeriod(previous.period, granularity) : 'Sin período anterior';
  $('#currentPeriodValue').textContent = current ? formatValue(current[metric]) : '—';
  $('#previousPeriodValue').textContent = previous ? formatValue(previous[metric]) : '—';
  const change = $('#periodChange');
  change.className = 'period-change neutral';
  if (!current || !previous || previous[metric] === 0) {
    $('#periodDelta').textContent = 'Sin base comparable';
  } else {
    const delta = (current[metric] - previous[metric]) / previous[metric] * 100;
    $('#periodDelta').textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
    change.className = `period-change ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}`;
  }
  const bounds = activeDateBounds();
  $('#periodComparisonNote').textContent = `Rango seleccionado: ${new Intl.DateTimeFormat('es-CO', {dateStyle:'medium'}).format(new Date(`${bounds.min}T12:00:00`))} – ${new Intl.DateTimeFormat('es-CO', {dateStyle:'medium'}).format(new Date(`${bounds.max}T12:00:00`))}. El último período puede estar incompleto.`;
}

function renderChart(rows, metric, granularity) {
  const root = $('#weeklyChart');
  renderPeriodComparison(rows, metric, granularity);
  if (!rows.length) { root.innerHTML = '<div class="chart-empty">Sin ventas para el filtro seleccionado</div>'; return; }
  const width = 900, height = 300, left = 54, right = 18, top = 20, bottom = 40;
  const values = rows.map(row => Number(row[metric]));
  const rankedValues = [...values].sort((a, b) => b - a);
  const max = Math.max(...values, 1);
  const x = (index) => left + index * (width - left - right) / Math.max(rows.length - 1, 1);
  const y = (value) => top + (max - value) * (height - top - bottom) / max;
  const points = rows.map((row, index) => `${x(index)},${y(values[index])}`).join(' ');
  const area = `${left},${height - bottom} ${points} ${x(rows.length - 1)},${height - bottom}`;
  const ticks = [0, .25, .5, .75, 1];
  const every = Math.max(1, Math.ceil(rows.length / 7));
  root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5da44f" stop-opacity=".25"/><stop offset="1" stop-color="#5da44f" stop-opacity="0"/></linearGradient></defs>${ticks.map(t => `<line class="axis-line" x1="${left}" y1="${y(max*t)}" x2="${width-right}" y2="${y(max*t)}"/><text class="axis-label" x="${left-10}" y="${y(max*t)+4}" text-anchor="end">${metric === 'value' ? money(max*t) : Math.round(max*t)}</text>`).join('')}<polygon class="area" points="${area}"/><polyline class="plot-line" points="${points}"/>${rows.map((row,i) => `<circle class="dot" data-index="${i}" tabindex="0" role="img" aria-label="${formatPeriod(row.period, granularity)}: ${metric === 'value' ? fmt.format(values[i])+' pesos vendidos' : values[i]+' unidades vendidas'}" cx="${x(i)}" cy="${y(values[i])}" r="4" style="stroke:${trafficColor(rankedValues.indexOf(values[i]), rankedValues.length)}"></circle>`).join('')}${rows.map((row,i) => i % every === 0 || i === rows.length-1 ? `<text class="axis-label" x="${x(i)}" y="${height-14}" text-anchor="middle">${formatPeriod(row.period, granularity, true)}</text>` : '').join('')}</svg><div class="chart-tooltip" id="weeklyTooltip" hidden><span></span><strong></strong></div>`;
  const tooltip = $('#weeklyTooltip');
  const showTooltip = dot => {
    const index = Number(dot.dataset.index);
    const dotBounds = dot.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    tooltip.querySelector('span').textContent = formatPeriod(rows[index].period, granularity);
    tooltip.querySelector('strong').textContent = metric === 'value' ? `$${fmt.format(values[index])} COP` : `${fmt.format(values[index])} unidades vendidas`;
    const rawLeft = dotBounds.left + dotBounds.width / 2 - rootBounds.left;
    tooltip.style.top = `${dotBounds.top - rootBounds.top - 8}px`;
    tooltip.hidden = false;
    const halfWidth = tooltip.offsetWidth / 2;
    const safeLeft = Math.max(halfWidth + 4, Math.min(rootBounds.width - halfWidth - 4, rawLeft));
    tooltip.style.left = `${safeLeft}px`;
    tooltip.style.setProperty('--arrow-left', `${rawLeft - safeLeft + halfWidth}px`);
  };
  root.querySelectorAll('.dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => showTooltip(dot));
    dot.addEventListener('focus', () => showTooltip(dot));
    dot.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    dot.addEventListener('blur', () => { tooltip.hidden = true; });
  });
  const metricLabel = metric === 'value' ? 'Valor vendido (COP)' : 'Apartamentos vendidos';
  const periodLabel = {quarter:'trimestral', month:'mensual', week:'semanal'}[granularity];
  $('#chartLegend').textContent = `${metricLabel} · ${periodLabel}${selectedProductType ? ` · ${selectedProductType}` : ''}`;
}

function renderPayment(units) {
  const credit = units.filter(unit => unit.payment === 'Crédito').length;
  const cash = units.length - credit;
  const rows = [['Crédito', credit], ['Contado', cash]].sort((a, b) => b[1] - a[1]);
  const share = units.length ? rows[0][1] / units.length * 100 : 0;
  $('#paymentDonut').style.background = `conic-gradient(var(--green) 0 ${share}%, var(--coral) ${share}% 100%)`;
  $('#creditUnitShare').textContent = `${share.toFixed(1)}%`;
  $('#paymentLeadLabel').textContent = rows[0][0].toLowerCase();
  $('#paymentLegend').innerHTML = rows.map(([label, value], index) => `<div class="legend-row"><i style="background:${trafficColor(index, rows.length)}"></i><strong>${label}</strong><b>${fmt.format(value)}</b><small>${units.length ? (value / units.length * 100).toFixed(1) : '0.0'}% de las unidades</small></div>`).join('');
}

function renderCashComposition(units) {
  const credit = units.reduce((sum, unit) => sum + unit.credit_amount, 0);
  const cash = units.reduce((sum, unit) => sum + unit.cash_amount, 0);
  const total = credit + cash;
  const rows = [['Contado', cash], ['Financiado', credit]].sort((a, b) => b[1] - a[1]);
  $('#cashComposition').innerHTML = rows.map(([label, value], index) => `<div class="cash-row"><span>${label}</span><div class="cash-track"><div class="cash-fill" style="width:${total ? value / total * 100 : 0}%;background:${trafficColor(index, rows.length)}"></div></div><strong>${money(value)} · ${total ? (value / total * 100).toFixed(1) : '0.0'}%</strong></div>`).join('');
}

function renderDistribution(target, units, definitions, getter) {
  const rows = definitions.map(definition => ({label: definition.label, value: units.filter(unit => definition.test(getter(unit))).length})).sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map(row => row.value), 1);
  $(target).innerHTML = rows.map((row, index) => barMarkup(row.label, row.value, max, '', index, rows.length)).join('');
}

function filteredUnits() {
  const type = $('#typeFilter').value;
  const minArea = Number($('#minArea').value);
  const maxArea = Number($('#maxArea').value);
  return dateFilteredSoldUnits().filter(unit => (type === 'all' || unit.type === type) && unit.area >= minArea && unit.area <= maxArea);
}

function renderSalesAnalysis() {
  const units = filteredUnits();
  const totalValue = units.reduce((sum, unit) => sum + unit.price, 0);
  const avgTicket = units.length ? totalValue / units.length : 0;
  const avgArea = units.length ? units.reduce((sum, unit) => sum + unit.area, 0) / units.length : 0;
  $('#minAreaLabel').textContent = $('#minArea').value;
  $('#maxAreaLabel').textContent = $('#maxArea').value;
  $('#filteredUnits').textContent = fmt.format(units.length);
  const dateRangeUnits = dateFilteredSoldUnits();
  $('#filteredShare').textContent = `${dateRangeUnits.length ? (units.length / dateRangeUnits.length * 100).toFixed(1) : '0.0'}% de las ventas del período`;
  $('#filteredValue').textContent = money(totalValue);
  $('#avgTicket').textContent = money(avgTicket);
  $('#avgArea').textContent = avgArea.toFixed(1);
  const typeCounts = Object.entries(units.reduce((acc, unit) => ({...acc, [unit.type]:(acc[unit.type] || 0) + 1}), {})).sort((a,b) => b[1]-a[1]);
  $('#filterResult').textContent = units.length ? `${fmt.format(units.length)} ventas coinciden. Mayor demanda en la selección: ${typeCounts[0][0]} (${typeCounts[0][1]} unidades).` : 'No hay ventas que coincidan con estos filtros.';
  renderPayment(units);
  renderCashComposition(units);
  renderDistribution('#creditBuckets', units, [
    {label:'0% · contado',test:v=>v===0},{label:'1–40%',test:v=>v>0&&v<=40},{label:'41–60%',test:v=>v>40&&v<=60},{label:'61–80%',test:v=>v>60&&v<=80},{label:'81–100%',test:v=>v>80}
  ], unit => unit.credit_pct);
  renderDistribution('#areaBuckets', units, [
    {label:'Menos de 50 m²',test:v=>v<50},{label:'50–69 m²',test:v=>v>=50&&v<70},{label:'70–99 m²',test:v=>v>=70&&v<100},{label:'100 m² o más',test:v=>v>=100}
  ], unit => unit.area);
}

function setupSalesFilters() {
  $('#typeFilter').innerHTML = '<option value="all">Todas las tipologías</option>';
  [...new Set(data.sold_units.map(unit => unit.type))].sort().forEach(type => $('#typeFilter').insertAdjacentHTML('beforeend', `<option value="${type}">${type}</option>`));
  const areas = data.sold_units.map(unit => unit.area);
  const min = Math.floor(Math.min(...areas));
  const max = Math.ceil(Math.max(...areas));
  for (const selector of ['#minArea', '#maxArea']) { $(selector).min = min; $(selector).max = max; }
  $('#minArea').value = min;
  $('#maxArea').value = max;
  ['#typeFilter','#minArea','#maxArea'].forEach(selector => $(selector).oninput = () => {
    if (Number($('#minArea').value) > Number($('#maxArea').value)) {
      if (selector === '#minArea') $('#maxArea').value = $('#minArea').value;
      else $('#minArea').value = $('#maxArea').value;
    }
    renderSalesAnalysis();
  });
  $('#resetFilters').onclick = () => { $('#typeFilter').value='all'; $('#minArea').value=min; $('#maxArea').value=max; renderSalesAnalysis(); };
  renderSalesAnalysis();
}

function renderQuality(quality) {
  const hasWarnings = quality.warnings > 0;
  $('#qualityPanel').classList.toggle('warning', hasWarnings);
  $('#qualityTitle').textContent = quality.errors ? `${quality.errors} errores requieren atención` : 'Validaciones críticas superadas';
  $('#qualityText').textContent = `${quality.errors} errores · ${quality.warnings} advertencias. Se detectaron ${quality.duplicate_apartment_names} nombres de apartamento repetidos; se conservaron porque los ID son únicos y el enunciado declara 457 registros.`;
  $('#qualityDialogSummary').textContent = `${quality.errors} errores y ${quality.warnings} advertencias encontrados durante la última actualización.`;
  const issues = [...quality.issues].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1) || (a.row || 0) - (b.row || 0));
  $('#qualityDetails').innerHTML = issues.slice(0, 120).map(item => `<tr><td><span class="severity severity-${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></td><td><strong>${escapeHtml(item.field)}</strong></td><td>${item.row ? fmt.format(item.row) : 'General'}</td><td>${escapeHtml(item.message)}</td></tr>`).join('') || '<tr><td colspan="4" class="quality-empty">No se encontraron errores ni advertencias.</td></tr>';
}

async function loadDashboard() {
  try {
    const response = await fetch(`data/summary.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se encontró el resumen. Ejecuta python run.py.');
    data = await response.json();
    setKpis(data.kpis);
    setupDateFilters();
    if (selectedProductType && !data.sold_units.some(unit => unit.type === selectedProductType)) selectedProductType = null;
    renderProductMix($('#metricFilter').value);
    renderAreaDetail(dateFilteredSoldUnits());
    renderChart(historyRows($('#periodFilter').value), $('#metricFilter').value, $('#periodFilter').value);
    renderQuality(data.quality);
    setupSalesFilters();
    $('#updated').textContent = `Actualizado ${new Intl.DateTimeFormat('es-CO', {dateStyle:'medium',timeStyle:'short'}).format(new Date(data.generated_at))}`;
    return true;
  } catch (error) {
    $('#refreshStatus').textContent = error.message;
    $('#refreshStatus').classList.add('error');
    return false;
  }
}

async function refreshData() {
  const button = $('#refreshBtn');
  const status = $('#refreshStatus');
  button.disabled = true;
  button.textContent = 'Actualizando…';
  status.textContent = 'Procesando CSV…';
  status.classList.remove('error');
  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('El servidor abierto no permite actualizar. Deténlo y vuelve a iniciar el proyecto con python run.py.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No fue posible actualizar los datos.');
    if (await loadDashboard()) status.textContent = `${fmt.format(result.rows)} filas actualizadas`;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Actualizar datos';
  }
}

$('#metricFilter').addEventListener('change', () => {
  if (!data) return;
  const metric = $('#metricFilter').value;
  renderChart(historyRows($('#periodFilter').value), metric, $('#periodFilter').value);
  renderProductMix(metric);
});
$('#periodFilter').addEventListener('change', () => {
  if (!data) return;
  renderChart(historyRows($('#periodFilter').value), $('#metricFilter').value, $('#periodFilter').value);
});
function renderDateSensitiveViews() {
  const metric = $('#metricFilter').value;
  const granularity = $('#periodFilter').value;
  renderProductMix(metric);
  renderAreaDetail(dateFilteredSoldUnits());
  renderChart(historyRows(granularity), metric, granularity);
  renderSalesAnalysis();
}
$('#startDateFilter').addEventListener('change', () => {
  if (!data) return;
  if ($('#startDateFilter').value > $('#endDateFilter').value) $('#endDateFilter').value = $('#startDateFilter').value;
  renderDateSensitiveViews();
});
$('#endDateFilter').addEventListener('change', () => {
  if (!data) return;
  if ($('#endDateFilter').value < $('#startDateFilter').value) $('#startDateFilter').value = $('#endDateFilter').value;
  renderDateSensitiveViews();
});
$('#resetDateFilter').addEventListener('click', () => {
  if (!data) return;
  const bounds = datasetDateBounds();
  $('#startDateFilter').value = bounds.min;
  $('#endDateFilter').value = bounds.max;
  renderDateSensitiveViews();
});
$('#printBtn').addEventListener('click', () => window.print());
$('#refreshBtn').addEventListener('click', refreshData);
const qualityDialog = $('#qualityDialog');
$('#qualityToggle').addEventListener('click', () => qualityDialog.showModal());
$('#qualityClose').addEventListener('click', () => qualityDialog.close());
$('#qualityCloseBottom').addEventListener('click', () => qualityDialog.close());
qualityDialog.addEventListener('click', event => { if (event.target === qualityDialog) qualityDialog.close(); });
loadDashboard();
