// ─── HSN LOOKUP PAGE ──────────────────────────────────────────────────────────
Pages.register('hsn', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card" style="max-width:680px">
    <div class="card-header"><div><div class="card-title">HSN / SAC Rate Lookup</div><div class="card-sub">Search by code or description</div></div></div>
    <div class="card-body">
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <input id="hsn-q" placeholder="Enter code or keyword (e.g. 8471 or computer)..." style="flex:1" oninput="searchHSN(this.value)">
        <select id="hsn-filter" onchange="searchHSN(document.getElementById('hsn-q').value)">
          <option value="">All</option><option value="HSN">HSN (Goods)</option><option value="SAC">SAC (Services)</option>
        </select>
      </div>
      <div id="hsn-results">
        <div class="empty-state" style="padding:32px"><div class="empty-title">Enter a code or keyword to search</div><div class="empty-sub">Search by HSN/SAC code or description</div></div>
      </div>
    </div>
  </div>`;
});

const searchHSN = debounce(async (q) => {
  if (!q || q.length < 2) return;
  const type = document.getElementById('hsn-filter')?.value;
  const el = document.getElementById('hsn-results');
  el.innerHTML = '<div class="empty-state" style="padding:32px"><div class="spinner" style="margin:0 auto"></div><div class="empty-sub mt-2">Searching...</div></div>';
  try {
    const res = await API.get('/hsn', { search: q, type });
    if (!res.data?.length) { el.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-sub">No results found</div></div>'; return; }
    el.innerHTML = `<table><thead><tr><th>Code</th><th>Type</th><th>Description</th><th class="text-right">GST Rate</th><th class="text-right">CESS</th></tr></thead>
    <tbody>${res.data.map(h=>`<tr>
      <td class="font-mono font-bold">${h.code}</td>
      <td><span class="badge ${h.type==='SAC'?'badge-purple':'badge-teal'}">${h.type}</span></td>
      <td>${h.description}</td>
      <td class="text-right"><span class="badge badge-amber">${h.gst_rate}%</span></td>
      <td class="text-right">${h.cess_rate>0?`<span class="badge badge-red">${h.cess_rate}%</span>`:'—'}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) { 
    if (e.message?.includes('429')) el.innerHTML = '<div class="alert alert-warning">Too many requests. Please wait a moment.</div>';
    else el.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}, 500);

// ─── COMPLIANCE CALENDAR PAGE ─────────────────────────────────────────────────
Pages.register('compliance', async () => {
  document.getElementById('page-content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="card-header"><div><div class="card-title">Compliance Calendar</div><div class="card-sub">Filing deadlines & status</div></div>
        <select id="comp-year" onchange="loadCompliance()" style="width:auto;padding:6px 10px">
          ${[2024,2025,2026].map(y=>`<option value="${y}" ${y===new Date().getFullYear()?'selected':''}>${y}</option>`).join('')}
        </select>
      </div>
      <div id="comp-list"></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Upcoming & Overdue</div></div>
      <div id="comp-alerts"></div>
    </div>
  </div>`;
  loadCompliance();
});

async function loadCompliance() {
  const bizId = App.currentBiz?.id;
  const year = document.getElementById('comp-year')?.value;
  try {
    const res = await API.get('/compliance', { business_id: bizId, year });
    const list = document.getElementById('comp-list');
    const alerts = document.getElementById('comp-alerts');
    const today = new Date().toISOString().split('T')[0];

    list.innerHTML = res.data?.length ? res.data.map(c=>`
      <div class="cal-item" style="justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="cal-date">${fmtDate(c.due_date)}</div>
          <div class="cal-info">
            <div class="cal-return">${c.return_type}</div>
            <div class="cal-period">${periodLabel(c.period)||c.period}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${statusBadge(c.status)}
          ${c.status==='pending'?`<button class="btn btn-xs btn-success" onclick="markFiled(${c.id})">Mark Filed</button>`:''}
        </div>
      </div>`).join('') : '<div class="empty-state" style="padding:32px"><div class="empty-sub">No compliance entries. Add a business to generate calendar.</div></div>';

    const overdue = res.data?.filter(c=>c.status==='overdue')||[];
    const upcoming = res.data?.filter(c=>c.status==='pending'&&c.due_date>=today)||[];

    alerts.innerHTML = [
      ...overdue.map(c=>`<div class="cal-item"><div style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0"></div><div class="cal-info flex-1"><div class="cal-return text-red">${c.return_type} — OVERDUE</div><div class="cal-period">Due: ${fmtDate(c.due_date)}</div></div></div>`),
      ...upcoming.slice(0,6).map(c=>`<div class="cal-item"><div style="width:8px;height:8px;border-radius:50%;background:var(--amber);flex-shrink:0"></div><div class="cal-info flex-1"><div class="cal-return">${c.return_type}</div><div class="cal-period">Due: ${fmtDate(c.due_date)} · ${periodLabel(c.period)}</div></div></div>`)
    ].join('') || '<div class="empty-state" style="padding:32px"><div class="empty-sub">No upcoming or overdue filings.</div></div>';
  } catch(e) { toast(e.message, 'error'); }
}

async function markFiled(id) {
  try { await API.patch(`/compliance/${id}/filed`); toast('Marked as filed', 'success'); loadCompliance(); }
  catch(e) { toast(e.message, 'error'); }
}

// ─── TDS / TCS PAGE ───────────────────────────────────────────────────────────
Pages.register('tds', async () => {
  document.getElementById('page-content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">Add TDS / TCS Entry</div></div>
      <div class="card-body">
        <div class="form-grid form-grid-2">
          <div class="form-group full"><label>Party *</label>
            <select id="tds-party"><option value="">Select Party</option></select>
          </div>
          <div class="form-group"><label>Type</label>
            <select id="tds-type"><option value="TDS">TDS</option><option value="TCS">TCS</option></select>
          </div>
          <div class="form-group"><label>Section</label><input id="tds-section" placeholder="194C, 194J..."></div>
          <div class="form-group"><label>Base Amount</label><input id="tds-base" type="number" min="0" step="0.01" oninput="calcTDS()"></div>
          <div class="form-group"><label>Rate (%)</label><input id="tds-rate" type="number" min="0" max="100" step="0.01" value="1" oninput="calcTDS()"></div>
          <div class="form-group"><label>Amount (auto)</label><input id="tds-amount" readonly style="background:var(--bg3)"></div>
          <div class="form-group"><label>Period (MMYYYY)</label><input id="tds-period" value="${currentPeriod()}"></div>
        </div>
        <div class="alert alert-info mt-3">TDS amount is calculated automatically as: Base Amount × Rate / 100.</div>
        <button class="btn btn-primary w-full mt-3" onclick="saveTDS()">Save Entry</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">TDS / TCS Summary</div></div>
      <div id="tds-summary"></div>
    </div>
  </div>
  <div class="card mt-4">
    <div class="card-header"><div class="card-title">All Entries</div></div>
    <div id="tds-table" class="table-wrap"></div>
  </div>`;
  loadTDS(); loadTDSSummary(); loadTDSParties();
});

async function loadTDSParties() {
  const res = await API.get('/parties', { business_id: App.currentBiz?.id });
  const sel = document.getElementById('tds-party');
  if (sel && res.data) {
    sel.innerHTML = '<option value="">Select Party</option>' + 
      res.data.map(p => `<option value="${p._id}">${p.name} (${p.party_type})</option>`).join('');
  }
}

function calcTDS() {
  const base = +document.getElementById('tds-base').value || 0;
  const rate = +document.getElementById('tds-rate').value || 0;
  document.getElementById('tds-amount').value = ((base * rate) / 100).toFixed(2);
}

async function saveTDS() {
  const partyId = document.getElementById('tds-party').value;
  if (!partyId) { toast('Please select a party', 'error'); return; }
  try {
    await API.post('/tds', {
      business_id: App.currentBiz?.id,
      party_id: partyId,
      entry_type: document.getElementById('tds-type').value,
      section: document.getElementById('tds-section').value,
      base_amount: +document.getElementById('tds-base').value,
      rate: +document.getElementById('tds-rate').value,
      period: document.getElementById('tds-period').value,
    });
    toast('Entry saved', 'success');
    loadTDS(); loadTDSSummary();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadTDS() {
  const res = await API.get('/tds', { business_id: App.currentBiz?.id });
  const el = document.getElementById('tds-table');
  if (!res.data?.length) { el.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-sub">No TDS/TCS entries</div></div>'; return; }
  el.innerHTML = `<table><thead><tr><th>Type</th><th>Section</th><th>Party</th><th>Period</th><th class="text-right">Base</th><th class="text-right">Rate</th><th class="text-right">Amount</th><th>Actions</th></tr></thead>
  <tbody>${res.data.map(t=>`<tr>
    <td><span class="badge ${t.entry_type==='TDS'?'badge-blue':'badge-purple'}">${t.entry_type}</span></td>
    <td class="font-mono">${t.section||'—'}</td>
    <td>${t.party_name||'—'}</td>
    <td class="font-mono">${t.period}</td>
    <td class="text-right font-mono">${fmtAmount(t.base_amount)}</td>
    <td class="text-right">${t.rate}%</td>
    <td class="text-right font-mono font-bold">${fmtAmount(t.amount)}</td>
    <td><button class="btn btn-xs btn-danger" onclick="deleteTDS('${t._id}')">Delete</button></td>
  </tr>`).join('')}</tbody></table>`;
}

async function loadTDSSummary() {
  const res = await API.get('/tds/summary', { business_id: App.currentBiz?.id });
  const el = document.getElementById('tds-summary');
  if (!res.data?.length) { el.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-sub">No data</div></div>'; return; }
  el.innerHTML = res.data.map(r=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)">
      <div><div class="font-bold">${r.entry_type} — ${r.section||'General'}</div><div class="text-xs text-muted">${r.entries} entries</div></div>
      <div class="text-right"><div class="font-mono text-amber">${fmtAmount(r.tds_tcs)}</div><div class="text-xs text-muted">on ${fmtAmount(r.base)}</div></div>
    </div>`).join('');
}

async function deleteTDS(id) {
  confirmModal('Delete Entry', 'Delete this TDS/TCS entry?', async () => {
    try { await API.delete(`/tds/${id}`); toast('Deleted', 'success'); loadTDS(); loadTDSSummary(); }
    catch(e) { toast(e.message, 'error'); }
  });
}
// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────
Pages.register('analytics', async () => {
  document.getElementById('page-content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">Tax Trend (12 months)</div></div>
      <div class="card-body"><div class="chart-wrap"><canvas id="tax-trend-chart"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">ITC Summary</div></div>
      <div class="card-body" id="itc-summary-detail"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">Month-by-Month Breakdown</div></div>
    <div id="analytics-monthly" class="table-wrap"></div>
  </div>`;
  loadAnalytics();
});

async function loadAnalytics() {
  const bizId = App.currentBiz?.id;
  try {
    const [trend, itc, dash] = await Promise.all([
      API.get('/analytics/tax-trend', { business_id: bizId }),
      API.get('/analytics/itc-summary', { business_id: bizId }),
      API.get('/analytics/dashboard', { business_id: bizId })
    ]);

    if (trend.data?.length && window.Chart) {
      new Chart(document.getElementById('tax-trend-chart'), {
        type: 'line',
        data: {
          labels: trend.data.map(r => r.period),
          datasets: [
            { label: 'CGST', data: trend.data.map(r=>r.cgst), borderColor: '#4f7ef8', backgroundColor: 'rgba(79,126,248,0.1)', tension: 0.4, fill: true },
            { label: 'SGST', data: trend.data.map(r=>r.sgst), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.4, fill: true },
            { label: 'IGST', data: trend.data.map(r=>r.igst), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.4, fill: true },
          ]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#9ba3c4'}}}, scales:{ x:{ticks:{color:'#9ba3c4'},grid:{color:'rgba(46,53,84,0.6)'}}, y:{ticks:{color:'#9ba3c4'},grid:{color:'rgba(46,53,84,0.6)'}} } }
      });
    }

    const itcEl = document.getElementById('itc-summary-detail');
    if (itcEl && itc.data) {
      const total = (itc.data.cgst||0) + (itc.data.sgst||0) + (itc.data.igst||0);
      itcEl.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:1fr 1fr">
          <div class="stat-card"><div class="stat-label">CGST ITC</div><div class="stat-value" style="font-size:1.2rem">${fmtAmount(itc.data.cgst)}</div></div>
          <div class="stat-card"><div class="stat-label">SGST ITC</div><div class="stat-value" style="font-size:1.2rem">${fmtAmount(itc.data.sgst)}</div></div>
          <div class="stat-card"><div class="stat-label">IGST ITC</div><div class="stat-value" style="font-size:1.2rem">${fmtAmount(itc.data.igst)}</div></div>
          <div class="stat-card teal"><div class="stat-label">Total ITC</div><div class="stat-value" style="font-size:1.2rem">${fmtAmount(total)}</div></div>
        </div>
        <div class="alert alert-info mt-3">ITC available from ${itc.data.bills||0} purchase bills.</div>`;
    }

    const monthly = dash.data?.monthly;
    const mTable = document.getElementById('analytics-monthly');
    if (mTable && monthly?.length) {
      mTable.innerHTML = `<table><thead><tr><th>Period</th><th class="text-right">Taxable</th><th class="text-right">Tax</th><th class="text-right">Invoices</th></tr></thead>
      <tbody>${monthly.map(r=>`<tr>
        <td>${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(r.m)]} ${r.y}</td>
        <td class="text-right font-mono">${fmtAmount(r.taxable)}</td>
        <td class="text-right font-mono">${fmtAmount(r.tax)}</td>
        <td class="text-right">${r.count}</td>
      </tr>`).join('')}</tbody></table>`;
    }
  } catch(e) { toast(e.message, 'error'); }
}

// ─── AUDIT TRAIL PAGE ─────────────────────────────────────────────────────────
Pages.register('audit', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="filters-bar">
      <select id="aud-entity" onchange="loadAudit()">
        <option value="">All Actions</option><option value="invoice">Invoices</option><option value="purchase">Purchases</option>
      </select>
      <div style="margin-left:auto;font-size:0.82rem;color:var(--text2)">Showing last 100 actions</div>
    </div>
    <div id="audit-table" class="table-wrap"></div>
  </div>`;
  loadAudit();
});

async function loadAudit() {
  try {
    const res = await API.get('/audit', { business_id: App.currentBiz?.id, entity_type: document.getElementById('aud-entity')?.value });
    const el = document.getElementById('audit-table');
    if (!res.data?.length) { el.innerHTML = '<div class="empty-state" style="padding:32px"><div class="empty-title">No audit logs found</div><div class="empty-sub">Actions on invoices and purchases will appear here.</div></div>'; return; }
    el.innerHTML = `<table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
    <tbody>${res.data.map(a=>`<tr>
      <td class="font-mono text-xs">${fmtDate(a.created_at)}</td>
      <td>${a.user_name||'—'}<br><span class="text-xs text-muted">${a.user_email||''}</span></td>
      <td><span class="badge badge-blue">${a.action}</span></td>
      <td>${a.entity_type||'—'} ${a.entity_id?`#${a.entity_id}`:''}</td>
      <td class="text-xs font-mono text-muted" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.new_data?.substring(0,60)||'—'}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}
