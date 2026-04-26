// ── PAYMENTS & P&L PAGE ───────────────────────────────────────────────────────
Pages.register('payments', async () => {
  const bizId = App.currentBiz?.id || App.currentBiz?._id;
  if (!bizId) { document.getElementById('page-content').innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><div class="empty-title">No business selected</div></div>`; return; }

  document.getElementById('page-content').innerHTML = `
    <div class="tabs" style="margin-bottom:20px">
      <div class="tab active" onclick="switchPayTab('summary',this)">Summary</div>
      <div class="tab" onclick="switchPayTab('receivable',this)">Receivable</div>
      <div class="tab" onclick="switchPayTab('payable',this)">Payable</div>
      <div class="tab" onclick="switchPayTab('pnl',this)">P&L</div>
      <div class="tab" onclick="switchPayTab('overdue',this)">Overdue</div>
    </div>
    <div id="pay-tab-content"></div>
    <div class="modal-overlay" id="pay-modal">
      <div class="modal modal-sm">
        <div class="modal-header"><div class="modal-title" id="pay-modal-title">Record Payment</div><button class="btn btn-sm btn-secondary" onclick="closeModal('pay-modal')">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group"><label>Amount Paid *</label><input id="pay-amount" type="number" step="0.01" placeholder="0.00"></div>
            <div class="form-group"><label>Payment Method</label>
              <select id="pay-method">
                <option value="">Select</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div class="form-group"><label>Payment Date</label><input id="pay-date" type="date"></div>
            <div class="form-group"><label>Due Date</label><input id="pay-due-date" type="date"></div>
            <div class="form-group full"><label>Notes</label><input id="pay-notes" placeholder="Optional notes"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('pay-modal')">Cancel</button>
          <button class="btn btn-primary" onclick="savePayment()">Save Payment</button>
        </div>
      </div>
    </div>`;

  window._payTab = 'summary';
  loadPaySummary(bizId);
});

async function switchPayTab(tab, el) {
  window._payTab = tab;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const bizId = App.currentBiz?.id || App.currentBiz?._id;
  if (tab === 'summary')    loadPaySummary(bizId);
  if (tab === 'receivable') loadReceivable(bizId);
  if (tab === 'payable')    loadPayable(bizId);
  if (tab === 'pnl')        loadPnL(bizId);
  if (tab === 'overdue')    loadOverdue(bizId);
}

async function loadPaySummary(bizId) {
  const el = document.getElementById('pay-tab-content');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const res = await API.get('/payments/summary', { business_id: bizId });
    const { receivable: r, payable: p } = res.data;
    el.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card green">
          <div class="stat-label">Total Receivable</div>
          <div class="stat-value">${fmtAmount(r.total)}</div>
          <div class="stat-sub">${r.paid} paid · ${r.partial} partial · ${r.unpaid} unpaid</div>
          <div class="stat-icon">📥</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Amount Received</div>
          <div class="stat-value">${fmtAmount(r.received)}</div>
          <div class="stat-sub">Outstanding: ${fmtAmount(r.outstanding)}</div>
          <div class="stat-icon">✅</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-label">Total Payable</div>
          <div class="stat-value">${fmtAmount(p.total)}</div>
          <div class="stat-sub">${p.unpaid} unpaid bills</div>
          <div class="stat-icon">📤</div>
        </div>
        <div class="stat-card ${p.outstanding > 0 ? 'red' : 'teal'}">
          <div class="stat-label">Outstanding Payable</div>
          <div class="stat-value">${fmtAmount(p.outstanding)}</div>
          <div class="stat-sub">Paid: ${fmtAmount(p.paid)}</div>
          <div class="stat-icon">⚖️</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card">
          <div class="card-header"><div class="card-title">Receivables Breakdown</div></div>
          <div class="card-body">
            ${payStatusBar('Paid', r.paid, r.total, 'green')}
            ${payStatusBar('Partial', r.received - (r.paid > 0 ? r.total * (r.paid / (r.paid + r.partial + r.unpaid)) : 0), r.total, 'amber')}
            ${payStatusBar('Outstanding', r.outstanding, r.total, 'red')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Payables Breakdown</div></div>
          <div class="card-body">
            ${payStatusBar('Paid', p.paid, p.total, 'green')}
            ${payStatusBar('Outstanding', p.outstanding, p.total, 'red')}
          </div>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function payStatusBar(label, amount, total, color) {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100).toFixed(1) : 0;
  return `<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:0.82rem;color:var(--text2)">${label}</span>
      <span style="font-size:0.82rem;font-family:var(--mono)">${fmtAmount(amount)} (${pct}%)</span>
    </div>
    <div class="progress"><div class="progress-bar" style="width:${pct}%;background:var(--${color})"></div></div>
  </div>`;
}

async function loadReceivable(bizId) {
  const el = document.getElementById('pay-tab-content');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const res = await API.get('/invoices', { business_id: bizId, limit: 100 });
    const rows = res.data.filter(i => i.status !== 'cancelled');
    el.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Sales Invoices — Payment Status</div></div>
        <div class="table-wrap">
          <table><thead><tr><th>Invoice</th><th>Date</th><th>Party</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows.map(inv => {
            const bal = (inv.total_amount||0) - (inv.amount_paid||0);
            const ps = inv.payment_status || 'unpaid';
            return `<tr>
              <td class="font-mono">${inv.invoice_number}</td>
              <td>${fmtDate(inv.invoice_date)}</td>
              <td>${inv.party_name||'—'}</td>
              <td class="font-mono">${fmtAmount(inv.total_amount)}</td>
              <td class="font-mono text-green">${fmtAmount(inv.amount_paid||0)}</td>
              <td class="font-mono ${bal>0?'text-red':''}">${fmtAmount(bal)}</td>
              <td>${inv.payment_due_date ? fmtDate(inv.payment_due_date) : '—'}</td>
              <td>${payBadge(ps)}</td>
              <td><button class="btn btn-xs btn-primary" onclick="openPayModal('invoice','${inv._id}','${inv.invoice_number}',${inv.total_amount},${inv.amount_paid||0},'${inv.payment_due_date||''}')">💳 Pay</button></td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

async function loadPayable(bizId) {
  const el = document.getElementById('pay-tab-content');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const res = await API.get('/purchases', { business_id: bizId });
    el.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">Purchase Invoices — Payment Status</div></div>
        <div class="table-wrap">
          <table><thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${res.data.map(pur => {
            const bal = (pur.total_amount||0) - (pur.amount_paid||0);
            const ps = pur.payment_status || 'unpaid';
            return `<tr>
              <td class="font-mono">${pur.invoice_number}</td>
              <td>${fmtDate(pur.invoice_date)}</td>
              <td>${pur.supplier_name||pur.party_name_resolved||'—'}</td>
              <td class="font-mono">${fmtAmount(pur.total_amount)}</td>
              <td class="font-mono text-green">${fmtAmount(pur.amount_paid||0)}</td>
              <td class="font-mono ${bal>0?'text-red':''}">${fmtAmount(bal)}</td>
              <td>${pur.payment_due_date ? fmtDate(pur.payment_due_date) : '—'}</td>
              <td>${payBadge(ps)}</td>
              <td><button class="btn btn-xs btn-primary" onclick="openPayModal('purchase','${pur._id}','${pur.invoice_number}',${pur.total_amount},${pur.amount_paid||0},'${pur.payment_due_date||''}')">💳 Pay</button></td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

async function loadPnL(bizId) {
  const el = document.getElementById('pay-tab-content');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const res = await API.get('/payments/pnl', { business_id: bizId });
    const d = res.data;
    const profitColor = d.net_profit >= 0 ? 'green' : 'red';
    el.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card blue">
          <div class="stat-label">Gross Revenue</div>
          <div class="stat-value">${fmtAmount(d.revenue.taxable)}</div>
          <div class="stat-sub">Tax collected: ${fmtAmount(d.revenue.tax_collected)}</div>
          <div class="stat-icon">📈</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-label">Total Expenses</div>
          <div class="stat-value">${fmtAmount(d.expenses.taxable)}</div>
          <div class="stat-sub">Tax paid: ${fmtAmount(d.expenses.tax_paid)}</div>
          <div class="stat-icon">📉</div>
        </div>
        <div class="stat-card ${profitColor}">
          <div class="stat-label">Gross Profit</div>
          <div class="stat-value">${fmtAmount(d.gross_profit)}</div>
          <div class="stat-sub">Margin: ${d.profit_margin}%</div>
          <div class="stat-icon">${d.gross_profit >= 0 ? '✅' : '⚠️'}</div>
        </div>
        <div class="stat-card ${profitColor}">
          <div class="stat-label">Net Profit</div>
          <div class="stat-value">${fmtAmount(d.net_profit)}</div>
          <div class="stat-sub">Period: ${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}</div>
          <div class="stat-icon">💰</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Monthly P&L Breakdown</div></div>
        <div class="card-body"><div class="chart-wrap"><canvas id="pnl-chart"></canvas></div></div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-header"><div class="card-title">Monthly Detail</div></div>
        <div class="table-wrap">
          <table><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>${d.monthly.map(m => {
            const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const margin = m.revenue > 0 ? ((m.profit/m.revenue)*100).toFixed(1) : '0.0';
            return `<tr>
              <td>${months[parseInt(m.m)]} ${m.y}</td>
              <td class="font-mono text-green">${fmtAmount(m.revenue)}</td>
              <td class="font-mono text-red">${fmtAmount(m.expenses)}</td>
              <td class="font-mono ${m.profit>=0?'text-green':'text-red'}">${fmtAmount(m.profit)}</td>
              <td><span class="badge ${m.profit>=0?'badge-green':'badge-red'}">${margin}%</span></td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;

    if (d.monthly.length && window.Chart) {
      const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels = d.monthly.map(m => `${months[parseInt(m.m)]} ${m.y.slice(-2)}`);
      new Chart(document.getElementById('pnl-chart'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Revenue', data: d.monthly.map(m=>m.revenue), backgroundColor: 'rgba(34,197,94,0.5)', borderColor: '#22c55e', borderWidth: 1.5 },
            { label: 'Expenses', data: d.monthly.map(m=>m.expenses), backgroundColor: 'rgba(239,68,68,0.5)', borderColor: '#ef4444', borderWidth: 1.5 },
            { label: 'Profit', data: d.monthly.map(m=>m.profit), type: 'line', borderColor: '#4f7ef8', backgroundColor: 'rgba(79,126,248,0.1)', borderWidth: 2, fill: true, tension: 0.4 },
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ba3c4', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#9ba3c4' }, grid: { color: 'rgba(46,53,84,0.6)' } }, y: { ticks: { color: '#9ba3c4' }, grid: { color: 'rgba(46,53,84,0.6)' } } } }
      });
    }
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

async function loadOverdue(bizId) {
  const el = document.getElementById('pay-tab-content');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const res = await API.get('/payments/overdue', { business_id: bizId });
    if (!res.data.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No overdue payments</div><div class="empty-sub">All invoices are on track</div></div>`;
      return;
    }
    const today = new Date();
    el.innerHTML = `
      <div class="alert alert-danger" style="margin-bottom:16px"><span>⚠️</span><span>${res.data.length} overdue invoice(s) require immediate attention</span></div>
      <div class="card">
        <div class="table-wrap">
          <table><thead><tr><th>Invoice</th><th>Party</th><th>Total</th><th>Balance</th><th>Due Date</th><th>Days Overdue</th><th>Action</th></tr></thead>
          <tbody>${res.data.map(inv => {
            const bal = (inv.total_amount||0) - (inv.amount_paid||0);
            const daysOverdue = Math.floor((today - new Date(inv.payment_due_date)) / (1000*60*60*24));
            return `<tr>
              <td class="font-mono">${inv.invoice_number}</td>
              <td>${inv.party_name||'—'}</td>
              <td class="font-mono">${fmtAmount(inv.total_amount)}</td>
              <td class="font-mono text-red">${fmtAmount(bal)}</td>
              <td class="text-red">${fmtDate(inv.payment_due_date)}</td>
              <td><span class="badge badge-red">${daysOverdue}d</span></td>
              <td><button class="btn btn-xs btn-primary" onclick="openPayModal('invoice','${inv._id}','${inv.invoice_number}',${inv.total_amount},${inv.amount_paid||0},'${inv.payment_due_date||''}')">💳 Pay</button></td>
            </tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function payBadge(status) {
  const map = { paid: 'badge-green', partial: 'badge-amber', unpaid: 'badge-red' };
  return `<span class="badge ${map[status]||'badge-gray'}">${status}</span>`;
}

window._payContext = {};
function openPayModal(type, id, number, total, paid, dueDate) {
  window._payContext = { type, id };
  document.getElementById('pay-modal-title').textContent = `Record Payment — ${number}`;
  document.getElementById('pay-amount').value = (total - paid).toFixed(2);
  document.getElementById('pay-method').value = '';
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('pay-due-date').value = dueDate || '';
  document.getElementById('pay-notes').value = '';
  openModal('pay-modal');
}

async function savePayment() {
  const { type, id } = window._payContext;
  const amount_paid    = parseFloat(document.getElementById('pay-amount').value) || 0;
  const payment_method = document.getElementById('pay-method').value;
  const payment_date   = document.getElementById('pay-date').value;
  const payment_due_date = document.getElementById('pay-due-date').value;
  const payment_notes  = document.getElementById('pay-notes').value;
  try {
    await API.patch(`/payments/${type}/${id}`, { amount_paid, payment_method, payment_date, payment_due_date, payment_notes });
    toast('Payment recorded', 'success');
    closeModal('pay-modal');
    // Reload current tab
    const bizId = App.currentBiz?.id || App.currentBiz?._id;
    if (window._payTab === 'receivable') loadReceivable(bizId);
    else if (window._payTab === 'payable') loadPayable(bizId);
    else if (window._payTab === 'overdue') loadOverdue(bizId);
    else loadPaySummary(bizId);
  } catch(e) { toast(e.message, 'error'); }
}
