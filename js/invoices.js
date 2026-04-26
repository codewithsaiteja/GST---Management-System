// ─── INVOICES PAGE ────────────────────────────────────────────────────────────
let invoicePage = 1;

Pages.register('invoices', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="filters-bar">
      <input type="text" id="inv-search" placeholder="Search party name..." style="max-width:200px" oninput="debounce(()=>loadInvoices(),400)()">
      <input type="date" id="inv-from" onchange="loadInvoices()">
      <input type="date" id="inv-to" onchange="loadInvoices()">
      <select id="inv-status" onchange="loadInvoices()">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="confirmed">Confirmed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select id="inv-type" onchange="loadInvoices()">
        <option value="">All Types</option>
        <option value="B2B">B2B</option>
        <option value="B2C">B2C</option>
        <option value="EXPWP">Export with payment</option>
        <option value="EXPWOP">Export without payment</option>
      </select>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="exportInvoicesExcel()">Export Excel</button>
        <button class="btn btn-primary" onclick="openInvoiceModal()">+ New Invoice</button>
      </div>
    </div>
    <div id="inv-table-wrap" class="table-wrap">
      <div class="empty-state"><div class="spinner" style="margin:0 auto;width:28px;height:28px"></div></div>
    </div>
    <div id="inv-pagination" style="display:flex;gap:6px;padding:12px 20px;justify-content:flex-end"></div>
  </div>
  ${invoiceModalHTML()}`;
  loadInvoices();
});

async function loadInvoices(page = 1) {
  invoicePage = page;
  const bizId = App.currentBiz?.id;
  if (!bizId) return;
  const params = {
    business_id: bizId,
    page,
    limit: 30,
    search: document.getElementById('inv-search')?.value,
    from_date: document.getElementById('inv-from')?.value,
    to_date: document.getElementById('inv-to')?.value,
    status: document.getElementById('inv-status')?.value,
    invoice_type: document.getElementById('inv-type')?.value,
  };
  try {
    const res = await API.get('/invoices', params);
    const wrap = document.getElementById('inv-table-wrap');
    if (!res.data?.length) { wrap.innerHTML = `<div class="empty-state"><div class="empty-title">No invoices found</div><div class="empty-sub">Create your first invoice using the button above.</div></div>`; return; }
    
    // Ensure all invoices have proper ID field
    res.data.forEach(inv => {
      if (!inv.id && inv._id) inv.id = String(inv._id);
    });
    
    wrap.innerHTML = `<table>
      <thead><tr>
        <th>Invoice No</th><th>Date</th><th>Party</th><th>GSTIN</th><th>Type</th>
        <th class="text-right">Taxable</th><th class="text-right">Tax</th><th class="text-right">Total</th>
        <th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${res.data.map(inv => `<tr>
          <td class="font-mono">${escHtml(inv.invoice_number)}</td>
          <td>${fmtDate(inv.invoice_date)}</td>
          <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(inv.party_name||inv.party_name_resolved||'—')}</td>
          <td class="font-mono text-xs">${escHtml(inv.party_gstin||'—')}</td>
          <td><span class="badge badge-blue">${escHtml(inv.invoice_type)}</span></td>
          <td class="text-right amount">${fmtAmount(inv.taxable_value)}</td>
          <td class="text-right amount">${fmtAmount((inv.cgst||0)+(inv.sgst||0)+(inv.igst||0))}</td>
          <td class="text-right amount font-bold">${fmtAmount(inv.total_amount)}</td>
          <td>${statusBadge(inv.status)}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn-xs btn-secondary" onclick="viewInvoice('${inv.id}')">View</button>
              ${inv.status==='draft' && RBAC.canWrite() ? `<button class="btn btn-xs btn-secondary" onclick="editInvoice('${inv.id}')">Edit</button>` : ''}
              ${inv.status==='draft' && RBAC.canWrite() ? `<button class="btn btn-xs btn-success" onclick="confirmInvoice('${inv.id}')">Confirm</button>` : ''}
              <button class="btn btn-xs btn-secondary" onclick="downloadInvoicePDF('${inv.id}','${escHtml(inv.invoice_number)}')">PDF</button>
              ${inv.status!=='confirmed' && RBAC.canWrite() ? `<button class="btn btn-xs btn-danger" onclick="deleteInvoice('${inv.id}')">Delete</button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
    renderPagination(document.getElementById('inv-pagination'), page, res.pages, loadInvoices);
  } catch(e) { toast(e.message, 'error'); }
}

function invoiceModalHTML() {
  return `
  <div class="modal-overlay" id="invoice-modal">
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title" id="inv-modal-title">New Invoice</div>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('invoice-modal')" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group">
            <label>Invoice Number <span class="req">*</span></label>
            <input id="inv-number" placeholder="INV-001" required>
          </div>
          <div class="form-group">
            <label>Invoice Date <span class="req">*</span></label>
            <input id="inv-date" type="date" required value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Invoice Type</label>
            <select id="inv-itype">
              <option value="B2B">B2B (Registered)</option>
              <option value="B2C">B2C (Unregistered)</option>
              <option value="EXPWP">Export with Payment</option>
              <option value="EXPWOP">Export without Payment</option>
            </select>
          </div>
          <div class="form-group">
            <label>Supply Type</label>
            <select id="inv-supply" onchange="recalcInvoice()">
              <option value="intra">Intra-State (CGST+SGST)</option>
              <option value="inter">Inter-State (IGST)</option>
            </select>
          </div>
        </div>
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group">
            <label>Party / Customer</label>
            <input id="inv-party-search" placeholder="Type to search parties..." oninput="searchParties(this.value)">
            <div id="party-dropdown" style="position:relative;z-index:100"></div>
            <input id="inv-party-id" type="hidden">
          </div>
          <div class="form-group">
            <label>Party GSTIN</label>
            <input id="inv-party-gstin" placeholder="22AAAAA0000A1Z5" oninput="this.value=this.value.toUpperCase()">
          </div>
          <div class="form-group">
            <label>Party State Code</label>
            <select id="inv-party-state" onchange="recalcInvoice()">
              <option value="">Select state</option>
              ${Object.entries(STATE_CODES).map(([k,v])=>`<option value="${k}">${k} - ${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Place of Supply</label>
            <select id="inv-pos">
              <option value="">Same as party state</option>
              ${Object.entries(STATE_CODES).map(([k,v])=>`<option value="${k}">${k} - ${v}</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="card-title">Invoice Items</div>
          <button class="btn btn-sm btn-secondary" onclick="addInvoiceItem()">+ Add Item</button>
        </div>
        <div class="items-table-wrap">
          <table class="items-table">
            <thead><tr>
              <th style="width:180px">Description</th>
              <th style="width:90px">HSN/SAC</th>
              <th style="width:60px">Qty</th>
              <th style="width:90px">Rate (₹)</th>
              <th style="width:60px">Disc%</th>
              <th style="width:90px">Taxable</th>
              <th style="width:70px">GST%</th>
              <th style="width:80px">Tax Amt</th>
              <th style="width:90px">Total</th>
              <th style="width:36px"></th>
            </tr></thead>
            <tbody id="inv-items-body"></tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:16px">
          <div class="card" style="min-width:280px">
            <div class="card-body" style="padding:12px 16px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem"><span class="text-muted">Taxable Value</span><span id="sum-taxable" class="font-mono">₹ 0.00</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem"><span class="text-muted">CGST</span><span id="sum-cgst" class="font-mono">₹ 0.00</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem"><span class="text-muted">SGST</span><span id="sum-sgst" class="font-mono">₹ 0.00</span></div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem"><span class="text-muted">IGST</span><span id="sum-igst" class="font-mono">₹ 0.00</span></div>
              <div class="divider" style="margin:8px 0"></div>
              <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700"><span>Grand Total</span><span id="sum-total" class="font-mono text-accent">₹ 0.00</span></div>
            </div>
          </div>
        </div>
        <div class="form-group mt-3">
          <label>Notes</label>
          <textarea id="inv-notes" rows="2" placeholder="Optional notes"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('invoice-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveInvoice()">Save Invoice</button>
      </div>
    </div>
  </div>`;
}

let invItems = [];
let editInvoiceId = null;

function openInvoiceModal(inv = null) {
  editInvoiceId = inv?.id || null;
  invItems = inv?.items || [{ description:'', hsn_sac:'', quantity:1, unit_price:0, discount:0, gst_rate:18, cess_rate:0 }];
  document.getElementById('inv-number').value = inv?.invoice_number || '';
  document.getElementById('inv-date').value = inv ? inv.invoice_date.split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('inv-itype').value = inv?.invoice_type || 'B2B';
  document.getElementById('inv-supply').value = inv?.supply_type || 'intra';
  document.getElementById('inv-party-search').value = inv?.party_name || '';
  document.getElementById('inv-party-id').value = inv?.party_id || '';
  document.getElementById('inv-party-gstin').value = inv?.party_gstin || '';
  document.getElementById('inv-party-state').value = inv?.party_state_code || '';
  document.getElementById('inv-notes').value = inv?.notes || '';
  document.querySelector('#invoice-modal .modal-title').textContent = inv ? 'Edit Invoice' : 'New Invoice';
  renderInvItems();
  openModal('invoice-modal');
}

async function editInvoice(id) {
  try {
    const bizId = App.currentBiz?.id;
    if (!bizId) {
      toast('No business selected', 'error');
      return;
    }
    const res = await API.get(`/invoices/${id}`, { business_id: bizId });
    if (res.data) {
      // Ensure ID is properly set
      if (!res.data.id && res.data._id) res.data.id = String(res.data._id);
      openInvoiceModal(res.data);
    }
  } catch(e) { 
    console.error('Edit invoice error:', e);
    toast(e.message || 'Failed to load invoice', 'error'); 
  }
}

function renderInvItems() {
  const body = document.getElementById('inv-items-body');
  body.innerHTML = invItems.map((item, i) => `
    <tr>
      <td><input value="${item.description||''}" onchange="invItems[${i}].description=this.value" placeholder="Description" style="min-width:160px"></td>
      <td><input value="${item.hsn_sac||''}" onchange="invItems[${i}].hsn_sac=this.value;lookupHSN(this.value,${i})" placeholder="HSN"></td>
      <td><input type="number" value="${item.quantity||1}" min="0.01" step="0.01" onchange="invItems[${i}].quantity=+this.value;recalcInvoice()" style="width:60px"></td>
      <td><input type="number" value="${item.unit_price||0}" min="0" step="0.01" onchange="invItems[${i}].unit_price=+this.value;recalcInvoice()"></td>
      <td><input type="number" value="${item.discount||0}" min="0" max="100" step="0.1" onchange="invItems[${i}].discount=+this.value;recalcInvoice()" style="width:60px"></td>
      <td class="font-mono text-muted" id="itv-${i}">${fmtAmount(item.taxable_value||0,'')}</td>
      <td><select onchange="invItems[${i}].gst_rate=+this.value;recalcInvoice()" style="width:70px">
        ${[0,0.1,0.25,1,1.5,3,5,6,7.5,12,18,28].map(r=>`<option ${item.gst_rate==r?'selected':''}>${r}</option>`).join('')}
      </select></td>
      <td class="font-mono text-muted" id="itax-${i}">${fmtAmount(((item.cgst||0)+(item.sgst||0)+(item.igst||0)),'')}</td>
      <td class="font-mono font-bold" id="itot-${i}">${fmtAmount(item.total||0,'')}</td>
      <td><button class="btn btn-xs btn-danger btn-icon" onclick="removeInvItem(${i})" aria-label="Remove item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>
    </tr>
  `).join('');
  recalcInvoice();
}

function addInvoiceItem() {
  invItems.push({ description:'', hsn_sac:'', quantity:1, unit_price:0, discount:0, gst_rate:18, cess_rate:0 });
  renderInvItems();
}

function removeInvItem(i) {
  invItems.splice(i, 1);
  renderInvItems();
}

function recalcInvoice() {
  const supplyType = document.getElementById('inv-supply')?.value || 'intra';
  const bizState = App.currentBiz?.state_code;
  const partyState = document.getElementById('inv-party-state')?.value;
  let totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  invItems = invItems.map((item, i) => {
    const c = calcItemTax(item, supplyType, bizState, partyState);
    const tv = document.getElementById(`itv-${i}`); if (tv) tv.textContent = fmtAmount(c.taxable_value, '');
    const tt = document.getElementById(`itax-${i}`); if (tt) tt.textContent = fmtAmount(c.cgst+c.sgst+c.igst, '');
    const tot = document.getElementById(`itot-${i}`); if (tot) tot.textContent = fmtAmount(c.total, '');
    totals.taxable += c.taxable_value; totals.cgst += c.cgst; totals.sgst += c.sgst; totals.igst += c.igst; totals.total += c.total;
    return c;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtAmount(v); };
  set('sum-taxable', totals.taxable); set('sum-cgst', totals.cgst); set('sum-sgst', totals.sgst); set('sum-igst', totals.igst); set('sum-total', totals.total);
}

async function searchParties(val) {
  const dd = document.getElementById('party-dropdown');
  if (!val || val.length < 2) { dd.innerHTML = ''; return; }
  try {
    const res = await API.get('/parties', { business_id: App.currentBiz?.id, search: val, type: 'customer' });
    dd.innerHTML = res.data?.length ? `<div style="position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);width:100%;z-index:200;box-shadow:var(--shadow);max-height:200px;overflow-y:auto">
      ${res.data.map(p => `<div style="padding:8px 12px;cursor:pointer;font-size:0.85rem;border-bottom:1px solid var(--border)" onmousedown="selectParty(${p.id},'${p.name?.replace(/'/g,"\\'")}','${p.gstin||''}','${p.state_code||''}')">${p.name} ${p.gstin?`<span class="text-xs font-mono text-muted">${p.gstin}</span>`:''}</div>`).join('')}
    </div>` : '';
  } catch(e) {}
}

function selectParty(id, name, gstin, state) {
  document.getElementById('inv-party-search').value = name;
  document.getElementById('inv-party-id').value = id;
  document.getElementById('inv-party-gstin').value = gstin;
  document.getElementById('inv-party-state').value = state;
  document.getElementById('party-dropdown').innerHTML = '';
  recalcInvoice();
}

async function lookupHSN(code, idx) {
  if (!code || code.length < 4) return;
  try {
    const res = await API.get(`/hsn/rate/${code}`);
    if (res.data) { invItems[idx].gst_rate = res.data.gst_rate; renderInvItems(); }
  } catch(e) {}
}

async function saveInvoice() {
  const bizId = App.currentBiz?.id;
  const invoiceNumber = document.getElementById('inv-number').value.trim();
  if (!invoiceNumber) { toast('Invoice number is required', 'error'); return; }
  if (!invItems.length) { toast('Add at least one item', 'error'); return; }

  const body = {
    business_id: bizId,
    invoice_number: invoiceNumber,
    invoice_date: document.getElementById('inv-date').value,
    invoice_type: document.getElementById('inv-itype').value,
    supply_type: document.getElementById('inv-supply').value,
    party_id: document.getElementById('inv-party-id').value || null,
    party_name: document.getElementById('inv-party-search').value,
    party_gstin: document.getElementById('inv-party-gstin').value,
    party_state_code: document.getElementById('inv-party-state').value,
    notes: document.getElementById('inv-notes').value,
    items: invItems,
  };

  try {
    if (editInvoiceId) {
      await API.put(`/invoices/${editInvoiceId}`, body);
      toast('Invoice updated successfully', 'success');
    } else {
      await API.post('/invoices', body);
      toast('Invoice saved successfully', 'success');
    }
    closeModal('invoice-modal');
    loadInvoices(invoicePage);
  } catch(e) { toast(e.message, 'error'); }
}

async function confirmInvoice(id) {
  if (!RBAC.canWrite()) {
    toast('You do not have permission to confirm invoices', 'error');
    return;
  }
  
  confirmModal('Confirm Invoice', 'This will generate an IRN and the invoice cannot be edited. Continue?', async () => {
    try {
      const bizId = App.currentBiz?.id;
      if (!bizId) {
        toast('No business selected', 'error');
        return;
      }
      const res = await API.patch(`/invoices/${id}/confirm`, { business_id: bizId });
      toast(`Invoice confirmed successfully. IRN: ${res.data?.irn?.substring(0,16)}...`, 'success');
      
      // Refresh dashboard data after confirming invoice
      if (typeof Pages !== 'undefined' && Pages.current === 'dashboard') {
        // If we're on dashboard, refresh it
        Pages.navigate('dashboard');
      }
      
      loadInvoices(invoicePage);
    } catch(e) { 
      console.error('Confirm invoice error:', e);
      toast(e.message || 'Failed to confirm invoice', 'error'); 
    }
  });
}

async function viewInvoice(id) {
  try {
    const bizId = App.currentBiz?.id;
    if (!bizId) {
      toast('No business selected', 'error');
      return;
    }
    const res = await API.get(`/invoices/${id}`, { business_id: bizId });
    const inv = res.data;
    if (!inv) {
      toast('Invoice not found', 'error');
      return;
    }
    
    // Ensure ID is properly set
    if (!inv.id && inv._id) inv.id = String(inv._id);
    
    const biz = App.currentBiz;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.innerHTML = `<div class="modal" style="max-width:680px">
      <div class="modal-header"><div class="modal-title">Invoice: ${escHtml(inv.invoice_number)}</div><button class="btn btn-sm btn-secondary btn-icon" onclick="this.closest('.modal-overlay').remove()" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
          <div class="card"><div class="card-body" style="padding:12px">
            <div class="text-xs text-muted mb-2">Seller</div>
            <div class="font-bold">${escHtml(biz?.legal_name||'')}</div>
            <div class="text-sm font-mono text-muted">${escHtml(biz?.gstin||'')}</div>
          </div></div>
          <div class="card"><div class="card-body" style="padding:12px">
            <div class="text-xs text-muted mb-2">Buyer</div>
            <div class="font-bold">${escHtml(inv.party_name||'—')}</div>
            <div class="text-sm font-mono text-muted">${escHtml(inv.party_gstin||'—')}</div>
          </div></div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
          <div><span class="text-muted text-xs">Date</span><div class="font-bold">${fmtDate(inv.invoice_date)}</div></div>
          <div><span class="text-muted text-xs">Type</span><div><span class="badge badge-blue">${escHtml(inv.invoice_type)}</span></div></div>
          <div><span class="text-muted text-xs">Supply</span><div class="font-bold">${escHtml(inv.supply_type)}</div></div>
          <div><span class="text-muted text-xs">Status</span><div>${statusBadge(inv.status)}</div></div>
          ${inv.irn?`<div><span class="text-muted text-xs">IRN</span><div class="font-mono text-xs">${escHtml(inv.irn?.substring(0,24))}...</div></div>`:''}
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Description</th><th>HSN</th><th>Qty</th><th class="text-right">Rate</th><th class="text-right">Taxable</th><th class="text-right">Tax</th><th class="text-right">Total</th></tr></thead>
          <tbody>${inv.items?.map(it=>`<tr><td>${escHtml(it.description)}</td><td class="font-mono text-xs">${escHtml(it.hsn_sac||'—')}</td><td>${it.quantity}</td><td class="text-right font-mono">${fmtAmount(it.unit_price)}</td><td class="text-right font-mono">${fmtAmount(it.taxable_value)}</td><td class="text-right font-mono">${fmtAmount((it.cgst||0)+(it.sgst||0)+(it.igst||0))}</td><td class="text-right font-mono font-bold">${fmtAmount(it.total)}</td></tr>`).join('')}</tbody>
        </table></div>
        <div style="text-align:right;margin-top:12px">
          <div class="text-sm text-muted">Taxable: <span class="font-mono">${fmtAmount(inv.taxable_value)}</span></div>
          ${inv.cgst>0?`<div class="text-sm text-muted">CGST: <span class="font-mono">${fmtAmount(inv.cgst)}</span></div>`:''}
          ${inv.sgst>0?`<div class="text-sm text-muted">SGST: <span class="font-mono">${fmtAmount(inv.sgst)}</span></div>`:''}
          ${inv.igst>0?`<div class="text-sm text-muted">IGST: <span class="font-mono">${fmtAmount(inv.igst)}</span></div>`:''}
          <div class="font-bold" style="font-size:1.1rem;margin-top:4px">Total: <span class="font-mono text-accent">${fmtAmount(inv.total_amount)}</span></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="downloadInvoicePDF('${inv.id}','${escHtml(inv.invoice_number)}')">Download PDF</button>
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { 
    console.error('View invoice error:', e);
    toast(e.message || 'Failed to load invoice', 'error'); 
  }
}

async function deleteInvoice(id) {
  if (!RBAC.canWrite()) {
    toast('You do not have permission to delete invoices', 'error');
    return;
  }
  
  confirmModal('Delete Invoice', 'This action cannot be undone. Are you sure?', async () => {
    try {
      const bizId = App.currentBiz?.id;
      if (!bizId) {
        toast('No business selected', 'error');
        return;
      }
      await API.delete(`/invoices/${id}`, { business_id: bizId });
      toast('Invoice deleted successfully', 'success');
      loadInvoices(invoicePage);
    } catch(e) { 
      console.error('Delete invoice error:', e);
      toast(e.message || 'Failed to delete invoice', 'error'); 
    }
  });
}

async function downloadInvoicePDF(id, num) {
  try {
    const bizId = App.currentBiz?.id;
    if (!bizId) {
      toast('No business selected', 'error');
      return;
    }
    const token = API.token();
    if (!token) {
      toast('Authentication required', 'error');
      return;
    }
    window.open(API_BASE + `/export/invoice/${id}/pdf?business_id=${bizId}&token=${token}`, '_blank');
  } catch(e) {
    console.error('Download PDF error:', e);
    toast('Failed to download PDF', 'error');
  }
}

async function exportInvoicesExcel() {
  const from = document.getElementById('inv-from')?.value;
  const to = document.getElementById('inv-to')?.value;
  const url = API_BASE + `/export/invoices/excel?business_id=${App.currentBiz?.id}${from?'&from_date='+from:''}${to?'&to_date='+to:''}`;
  const a = document.createElement('a'); a.href = url; a.download = 'invoices.xlsx';
  const headers = new Headers({ 'Authorization': 'Bearer ' + API.token() });
  const res = await fetch(url, { headers });
  const blob = await res.blob();
  a.href = URL.createObjectURL(blob); a.click();
}
