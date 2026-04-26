// ─── PURCHASES PAGE ───────────────────────────────────────────────────────────
Pages.register('purchases', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="filters-bar">
      <input type="date" id="pur-from" onchange="loadPurchases()">
      <input type="date" id="pur-to" onchange="loadPurchases()">
      <select id="pur-match" onchange="loadPurchases()">
        <option value="">All</option><option value="pending">Pending</option>
        <option value="matched">Matched</option><option value="mismatch">Mismatch</option>
      </select>
      <div style="margin-left:auto">
        <button class="btn btn-primary" onclick="openPurchaseModal()">+ Add Purchase</button>
      </div>
    </div>
    <div id="pur-table" class="table-wrap"></div>
  </div>
  <div class="modal-overlay" id="purchase-modal">
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title">Add Purchase Invoice</div><button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('purchase-modal')" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label>Invoice No *</label><input id="pur-invno" placeholder="VND/001"></div>
          <div class="form-group"><label>Date *</label><input id="pur-date" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="form-group"><label>Vendor GSTIN</label><input id="pur-gstin" placeholder="22AAAAA0000A1Z5" oninput="this.value=this.value.toUpperCase()"></div>
          <div class="form-group"><label>Taxable Value</label><input id="pur-taxable" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="form-group"><label>CGST</label><input id="pur-cgst" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="form-group"><label>SGST</label><input id="pur-sgst" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="form-group"><label>IGST</label><input id="pur-igst" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="form-group"><label>ITC Eligible</label>
            <select id="pur-itc"><option value="1">Yes</option><option value="0">No</option></select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('purchase-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="savePurchase()">Save</button>
      </div>
    </div>
  </div>`;
  loadPurchases();
});

async function loadPurchases() {
  const bizId = App.currentBiz?.id;
  if (!bizId) return;
  try {
    const res = await API.get('/purchases', { business_id: bizId, from_date: document.getElementById('pur-from')?.value, to_date: document.getElementById('pur-to')?.value, match_status: document.getElementById('pur-match')?.value });
    const wrap = document.getElementById('pur-table');
    if (!res.data?.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-title">No purchases found</div><div class="empty-sub">Add a purchase invoice to get started.</div></div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Invoice No</th><th>Date</th><th>Vendor</th><th class="text-right">Taxable</th><th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th><th class="text-right">Total</th><th>ITC</th><th>Match</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(p=>`<tr>
      <td class="font-mono">${p.invoice_number}</td>
      <td>${fmtDate(p.invoice_date)}</td>
      <td>${p.party_name_resolved||p.party_gstin||'—'}</td>
      <td class="text-right font-mono">${fmtAmount(p.taxable_value)}</td>
      <td class="text-right font-mono">${fmtAmount(p.cgst)}</td>
      <td class="text-right font-mono">${fmtAmount(p.sgst)}</td>
      <td class="text-right font-mono">${fmtAmount(p.igst)}</td>
      <td class="text-right font-mono font-bold">${fmtAmount(p.total_amount)}</td>
      <td>${p.itc_eligible?'<span class="badge badge-green">Yes</span>':'<span class="badge badge-red">No</span>'}</td>
      <td>${statusBadge(p.match_status)}</td>
      <td>
        <button class="btn btn-xs btn-secondary" onclick="editPurchase(${JSON.stringify(p).replace(/"/g,'&quot;')})">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deletePurchase('${p._id}')">Delete</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

let editPurchaseId = null;

function openPurchaseModal(p = null) {
  editPurchaseId = p?.id || null;
  document.getElementById('pur-invno').value = p?.invoice_number || '';
  document.getElementById('pur-date').value = p ? p.invoice_date.split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('pur-gstin').value = p?.party_gstin || '';
  document.getElementById('pur-taxable').value = p?.taxable_value || '';
  document.getElementById('pur-cgst').value = p?.cgst || '';
  document.getElementById('pur-sgst').value = p?.sgst || '';
  document.getElementById('pur-igst').value = p?.igst || '';
  document.getElementById('pur-itc').value = p?.itc_eligible ? '1' : '0';
  document.querySelector('#purchase-modal .modal-title').textContent = p ? 'Edit Purchase Invoice' : 'Add Purchase Invoice';
  openModal('purchase-modal');
}

function editPurchase(p) { openPurchaseModal(typeof p === 'string' ? JSON.parse(p) : p); }

async function savePurchase() {
  const invoiceNo = document.getElementById('pur-invno').value.trim();
  const invoiceDate = document.getElementById('pur-date').value;
  if (!invoiceNo) { toast('Invoice number is required', 'error'); return; }
  if (!invoiceDate) { toast('Invoice date is required', 'error'); return; }
  const taxable = +document.getElementById('pur-taxable').value || 0;
  if (taxable <= 0) { toast('Taxable value must be greater than zero', 'error'); return; }
  try {
    const body = {
      business_id: App.currentBiz?.id,
      invoice_number: invoiceNo,
      invoice_date: invoiceDate,
      party_gstin: document.getElementById('pur-gstin').value,
      taxable_value: taxable,
      cgst: +document.getElementById('pur-cgst').value || 0,
      sgst: +document.getElementById('pur-sgst').value || 0,
      igst: +document.getElementById('pur-igst').value || 0,
      itc_eligible: +document.getElementById('pur-itc').value,
    };
    if (editPurchaseId) {
      await API.put(`/purchases/${editPurchaseId}`, body);
      toast('Purchase updated', 'success');
    } else {
      await API.post('/purchases', body);
      toast('Purchase saved', 'success');
    }
    closeModal('purchase-modal');
    loadPurchases();
  } catch(e) { toast(e.message, 'error'); }
}

async function deletePurchase(id) {
  confirmModal('Delete Purchase', 'Delete this purchase invoice?', async () => {
    try { await API.delete(`/purchases/${id}`); toast('Deleted', 'success'); loadPurchases(); }
    catch(e) { toast(e.message, 'error'); }
  });
}

// ─── RETURNS PAGE ─────────────────────────────────────────────────────────────
Pages.register('returns', async () => {
  document.getElementById('page-content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="card-header"><div class="card-title">Prepare Return</div></div>
      <div class="card-body">
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label>Return Type</label>
            <select id="ret-type">
              <option value="GSTR1">GSTR-1 (Sales)</option>
              <option value="GSTR3B">GSTR-3B (Summary)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Period (MMYYYY)</label>
            <input id="ret-period" value="${currentPeriod()}" placeholder="032024">
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary w-full" onclick="prepareReturn()">Prepare Return</button>
        </div>
        <div id="ret-result" style="margin-top:16px"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Filed Returns</div></div>
      <div id="ret-history" class="table-wrap"></div>
    </div>
  </div>`;
  loadReturnHistory();
});

async function prepareReturn() {
  const bizId = App.currentBiz?.id;
  const returnType = document.getElementById('ret-type').value;
  const period = document.getElementById('ret-period').value;
  const el = document.getElementById('ret-result');
  el.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto;width:24px;height:24px"></div></div>';
  try {
    const res = await API.post('/returns/prepare', { business_id: bizId, return_type: returnType, period });
    const d = res.data;
    el.innerHTML = `<div class="alert alert-success" style="margin:0">Return prepared successfully!</div>
    <div class="card mt-3"><div class="card-body" style="padding:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="text-muted text-sm">Taxable Value</span><span class="font-mono">${fmtAmount(d.total_taxable)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="text-muted text-sm">CGST</span><span class="font-mono">${fmtAmount(d.total_cgst)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="text-muted text-sm">SGST</span><span class="font-mono">${fmtAmount(d.total_sgst)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="text-muted text-sm">IGST</span><span class="font-mono">${fmtAmount(d.total_igst)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span class="text-muted text-sm">ITC Claimed</span><span class="font-mono text-green">${fmtAmount(d.itc_claimed)}</span></div>
      <div class="divider" style="margin:8px 0"></div>
      <div style="display:flex;justify-content:space-between"><span class="font-bold">Net Liability</span><span class="font-mono font-bold text-accent">${fmtAmount(d.net_liability)}</span></div>
    </div></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-success flex-1" onclick="fileReturn(this)">File Return</button>
    </div>`;
    toast('Return prepared', 'success');
    loadReturnHistory();
  } catch(e) { el.innerHTML = `<div class="alert alert-danger">${escHtml(e.message)}</div>`; }
}

async function loadReturnHistory() {
  const bizId = App.currentBiz?.id;
  if (!bizId) return;
  try {
    const res = await API.get('/returns', { business_id: bizId });
    const el = document.getElementById('ret-history');
    if (!el) return;
    if (!res.data?.length) { el.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-sub">No returns filed yet</div></div>'; return; }
    el.innerHTML = `<table><thead><tr><th>Type</th><th>Period</th><th>Taxable</th><th>Liability</th><th>Status</th></tr></thead>
    <tbody>${res.data.map(r=>`<tr>
      <td class="font-bold">${r.return_type}</td>
      <td>${periodLabel(r.period)}</td>
      <td class="font-mono">${fmtAmount(r.total_taxable)}</td>
      <td class="font-mono">${fmtAmount(r.net_liability)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) {}
}

async function fileReturn(btn) {
  const bizId = App.currentBiz?.id;
  const returnType = document.getElementById('ret-type')?.value;
  const period = document.getElementById('ret-period')?.value;
  try {
    const rets = await API.get('/returns', { business_id: bizId, return_type: returnType, period });
    const ret = rets.data?.[0];
    if (!ret) { toast('Prepare the return first', 'error'); return; }
    const retId = ret.id || String(ret._id);
    await API.patch(`/returns/${retId}/file`);
    toast('Return filed successfully', 'success');
    loadReturnHistory();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── RECONCILE PAGE ───────────────────────────────────────────────────────────
Pages.register('reconcile', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card mb-4">
    <div class="card-header"><div class="card-title">2A/2B Reconciliation</div></div>
    <div class="filters-bar">
      <label>Period (MMYYYY)</label>
      <input id="rec-period" value="${currentPeriod()}" placeholder="032024" style="max-width:120px">
      <button class="btn btn-primary" onclick="loadReconcile()">Reconcile</button>
    </div>
  </div>
  <div id="rec-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px"></div>
  <div class="card" id="rec-table-card" style="display:none">
    <div class="card-header">
      <div class="card-title">Mismatched Invoices</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-success" onclick="bulkMatch('matched')">Mark Matched</button>
        <button class="btn btn-sm btn-warning" onclick="bulkMatch('mismatch')">Mark Mismatch</button>
      </div>
    </div>
    <div id="rec-table" class="table-wrap"></div>
  </div>`;
});

let selectedRecIds = [];

async function loadReconcile() {
  const period = document.getElementById('rec-period').value;
  if (!period) { toast('Enter period', 'error'); return; }
  try {
    const res = await API.get('/reconcile', { business_id: App.currentBiz?.id, period });
    const d = res.data;
    document.getElementById('rec-stats').innerHTML = `
      <div class="stat-card"><div class="stat-label">Total Bills</div><div class="stat-value">${d.purchases?.length||0}</div></div>
      <div class="stat-card green"><div class="stat-label">Matched</div><div class="stat-value">${d.matched}</div></div>
      <div class="stat-card red"><div class="stat-label">Mismatch</div><div class="stat-value">${d.mismatched}</div></div>
      <div class="stat-card teal"><div class="stat-label">ITC Eligible</div><div class="stat-value">${fmtAmount(d.total_itc_eligible)}</div></div>`;

    if (d.pending_invoices?.length) {
      document.getElementById('rec-table-card').style.display = '';
      selectedRecIds = [];
      document.getElementById('rec-table').innerHTML = `<table><thead><tr>
        <th><input type="checkbox" onchange="toggleAllRec(this)"></th>
        <th>Invoice No</th><th>Vendor</th><th>Date</th><th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th><th>Status</th>
      </tr></thead><tbody>${d.pending_invoices.map(p=>`<tr>
        <td><input type="checkbox" class="rec-check" value="${p.id}" onchange="toggleRec('${p.id}',this.checked)"></td>
        <td class="font-mono">${p.invoice_number}</td>
        <td>${p.vendor||p.party_gstin||'—'}</td>
        <td>${fmtDate(p.invoice_date)}</td>
        <td class="text-right font-mono">${fmtAmount(p.cgst)}</td>
        <td class="text-right font-mono">${fmtAmount(p.sgst)}</td>
        <td class="text-right font-mono">${fmtAmount(p.igst)}</td>
        <td>${statusBadge(p.match_status)}</td>
      </tr>`).join('')}</tbody></table>`;
    } else {
      document.getElementById('rec-table-card').style.display = 'none';
    }
  } catch(e) { toast(e.message, 'error'); }
}

function toggleRec(id, checked) { 
  const idStr = String(id); // Ensure string format
  if (checked) {
    if (!selectedRecIds.includes(idStr)) selectedRecIds.push(idStr);
  } else {
    selectedRecIds = selectedRecIds.filter(x => x !== idStr);
  }
}
function toggleAllRec(cb) { 
  selectedRecIds = []; // Clear first
  document.querySelectorAll('.rec-check').forEach(c => {
    c.checked = cb.checked; 
    if (cb.checked) {
      const idStr = String(c.value);
      if (!selectedRecIds.includes(idStr)) selectedRecIds.push(idStr);
    }
  }); 
}

async function bulkMatch(status) {
  if (!selectedRecIds.length) { toast('Select invoices first', 'error'); return; }
  try { 
    await API.post('/reconcile/match', { 
      ids: selectedRecIds, 
      status, 
      business_id: App.currentBiz?.id 
    }); 
    toast(`${selectedRecIds.length} invoices updated to ${status}`, 'success'); 
    selectedRecIds = []; // Clear selection
    loadReconcile(); 
  }
  catch(e) { toast(e.message, 'error'); }
}

// ─── PARTIES PAGE ─────────────────────────────────────────────────────────────
Pages.register('parties', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="filters-bar">
      <input type="text" id="par-search" placeholder="Search name or GSTIN..." oninput="loadParties()">
      <select id="par-type" onchange="loadParties()">
        <option value="">All</option><option value="customer">Customers</option><option value="vendor">Vendors</option>
      </select>
      <div style="margin-left:auto">
        <button class="btn btn-primary" onclick="openPartyModal()">+ Add Party</button>
      </div>
    </div>
    <div id="par-table" class="table-wrap"></div>
  </div>
  <div class="modal-overlay" id="party-modal">
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title" id="par-modal-title">Add Party</div><button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('party-modal')" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full"><label>Name *</label><input id="par-name" placeholder="Party name"></div>
          <div class="form-group">
            <label>GSTIN</label>
            <input id="par-gstin" placeholder="22AAAAA0000A1Z5" oninput="this.value=this.value.toUpperCase();validateGSTINInput(this)">
            <div id="par-gstin-msg" class="text-xs mt-2"></div>
          </div>
          <div class="form-group"><label>PAN</label><input id="par-pan" placeholder="AAAAA0000A" oninput="this.value=this.value.toUpperCase()"></div>
          <div class="form-group"><label>Party Type *</label>
            <select id="par-type2"><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="both">Both</option></select>
          </div>
          <div class="form-group"><label>State</label>
            <select id="par-state"><option value="">Select</option>${Object.entries(STATE_CODES).map(([k,v])=>`<option value="${k}">${k} - ${v}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>Phone</label><input id="par-phone" placeholder="+91 9999999999"></div>
          <div class="form-group"><label>Email</label><input id="par-email" type="email" placeholder="contact@company.gstin"></div>
          <div class="form-group full"><label>Address</label><textarea id="par-address" rows="2"></textarea></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('party-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveParty()">Save</button>
      </div>
    </div>
  </div>`;
  loadParties();
});

let editPartyId = null;

async function loadParties() {
  const bizId = App.currentBiz?.id;
  try {
    const res = await API.get('/parties', { business_id: bizId, search: document.getElementById('par-search')?.value, type: document.getElementById('par-type')?.value });
    const wrap = document.getElementById('par-table');
    if (!res.data?.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-title">No parties found</div><div class="empty-sub">Add customers and vendors to get started.</div></div>'; return; }
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>GSTIN</th><th>Type</th><th>State</th><th>Phone</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(p=>`<tr>
      <td class="font-bold">${p.name}</td>
      <td class="font-mono text-xs">${p.gstin||'—'}</td>
      <td><span class="badge badge-blue">${p.party_type}</span></td>
      <td>${p.state_code?STATE_CODES[p.state_code]||p.state_code:'—'}</td>
      <td>${p.phone||'—'}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-xs btn-secondary" onclick="editParty(${JSON.stringify(p).replace(/"/g,'&quot;')})">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="deleteParty('${p._id}')">Delete</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

function openPartyModal(p = null) {
  editPartyId = p?.id || null;
  document.getElementById('par-modal-title').textContent = p ? 'Edit Party' : 'Add Party';
  document.getElementById('par-name').value = p?.name || '';
  document.getElementById('par-gstin').value = p?.gstin || '';
  document.getElementById('par-pan').value = p?.pan || '';
  document.getElementById('par-type2').value = p?.party_type || 'customer';
  document.getElementById('par-state').value = p?.state_code || '';
  document.getElementById('par-phone').value = p?.phone || '';
  document.getElementById('par-email').value = p?.email || '';
  document.getElementById('par-address').value = p?.address || '';
  openModal('party-modal');
}

function editParty(p) { openPartyModal(typeof p === 'string' ? JSON.parse(p) : p); }

function validateGSTINInput(el) {
  const msg = document.getElementById('par-gstin-msg');
  if (!el.value) { msg.textContent = ''; return; }
  if (validateGSTIN(el.value)) {
    msg.textContent = 'Valid GSTIN format';
    msg.className = 'text-xs mt-2 text-green';
  } else {
    msg.textContent = 'Invalid GSTIN format — expected format: 22AAAAA0000A1Z5';
    msg.className = 'text-xs mt-2 text-red';
  }
}

async function saveParty() {
  const body = {
    business_id: App.currentBiz?.id,
    name: document.getElementById('par-name').value.trim(),
    gstin: document.getElementById('par-gstin').value.trim(),
    pan: document.getElementById('par-pan').value.trim(),
    party_type: document.getElementById('par-type2').value,
    state_code: document.getElementById('par-state').value,
    phone: document.getElementById('par-phone').value,
    email: document.getElementById('par-email').value,
    address: document.getElementById('par-address').value,
  };
  if (!body.name) { toast('Name is required', 'error'); return; }
  try {
    if (editPartyId) await API.put(`/parties/${editPartyId}`, body);
    else await API.post('/parties', body);
    toast('Party saved', 'success');
    closeModal('party-modal');
    loadParties();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteParty(id) {
  confirmModal('Delete Party', 'Delete this party?', async () => {
    try { await API.delete(`/parties/${id}`); toast('Deleted', 'success'); loadParties(); }
    catch(e) { toast(e.message, 'error'); }
  });
}
