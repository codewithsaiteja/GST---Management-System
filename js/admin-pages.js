// ─── USERS PAGE ───────────────────────────────────────────────────────────────
Pages.register('users', async () => {
  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="card-header">
      <div><div class="card-title">User Management</div><div class="card-sub">Manage access and roles</div></div>
      <button class="btn btn-primary" onclick="openUserModal()">+ Add User</button>
    </div>
    <div id="users-table" class="table-wrap"></div>
  </div>
  <div class="modal-overlay" id="user-modal">
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title" id="user-modal-title">Add User</div><button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('user-modal')" aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full"><label>Full Name *</label><input id="usr-name" placeholder="John Doe"></div>
          <div class="form-group full"><label>Email *</label><input id="usr-email" type="email" placeholder="user@company.gstin"></div>
          <div class="form-group"><label>Password *</label><input id="usr-password" type="password" placeholder="Min 6 chars"></div>
          <div class="form-group"><label>Role *</label>
            <select id="usr-role">
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div class="alert alert-info mt-3"><b>Admin:</b> Full system access &nbsp;|&nbsp; <b>Accountant:</b> Create and edit records &nbsp;|&nbsp; <b>Viewer:</b> Read-only access</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('user-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">Create User</button>
      </div>
    </div>
  </div>`;
  loadUsers();
});

async function loadUsers() {
  try {
    const res = await API.get('/users');
    const el = document.getElementById('users-table');
    el.innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(u => `<tr>
      <td class="font-bold">${escHtml(u.name)}</td>
      <td>${escHtml(u.email)}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-red' : u.role === 'accountant' ? 'badge-blue' : 'badge-gray'}">${u.role}</span></td>
      <td>${u.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>${String(u._id || u.id) !== String(App.user?.id) ? `<button class="btn btn-xs btn-danger" onclick="deactivateUser('${u._id || u.id}')">Deactivate</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function openUserModal() {
  document.getElementById('usr-name').value = '';
  document.getElementById('usr-email').value = '';
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-role').value = 'accountant';
  openModal('user-modal');
}

async function saveUser() {
  const name = document.getElementById('usr-name').value.trim();
  const email = document.getElementById('usr-email').value.trim();
  const password = document.getElementById('usr-password').value;
  const role = document.getElementById('usr-role').value;
  if (!name || !email || !password) { toast('All fields required', 'error'); return; }
  try {
    await API.post('/users', { name, email, password, role });
    toast('User created', 'success');
    closeModal('user-modal');
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deactivateUser(id) {
  confirmModal('Deactivate User', 'This user will lose access.', async () => {
    try { await API.delete(`/users/${id}`); toast('User deactivated', 'success'); loadUsers(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

// ─── BUSINESSES PAGE ──────────────────────────────────────────────────────────
window._bizForm = {};
window._allUsers = [];

Pages.register('businesses', async () => {
  window._bizForm = {};

  if (!RBAC.isAdmin()) {
    Pages.navigate('businesses');
    return;
  }

  document.getElementById('page-content').innerHTML = `
  <div class="card">
    <div class="card-header">
      <div><div class="card-title">Businesses</div><div class="card-sub">Manage GSTINs and entities</div></div>
      <button class="btn btn-primary" onclick="openBizModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Business
      </button>
    </div>
    <div id="biz-table" class="table-wrap"></div>
  </div>

  <!-- Business Create/Edit Modal -->
  <div class="modal-overlay" id="biz-modal">
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <div class="modal-title" id="biz-modal-title">Add Business</div>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('biz-modal')" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group full">
            <label>GSTIN <span class="req">*</span></label>
            <input id="biz-gstin" placeholder="29AAAPL1234F1Z5"
              oninput="this.value=this.value.toUpperCase(); window._bizForm.gstin=this.value; validateBizGSTIN()">
            <div id="biz-gstin-msg" class="text-xs mt-2"></div>
          </div>
          <div class="form-group full">
            <label>Legal Name <span class="req">*</span></label>
            <input id="biz-legal" placeholder="ABC Private Limited"
              oninput="window._bizForm.legal_name=this.value">
          </div>
          <div class="form-group full">
            <label>Trade Name</label>
            <input id="biz-trade" placeholder="ABC Corp"
              oninput="window._bizForm.trade_name=this.value">
          </div>
          <div class="form-group">
            <label>State <span class="req">*</span></label>
            <select id="biz-state" onchange="window._bizForm.state_code=this.value">
              <option value="">Select state</option>
              ${Object.entries(STATE_CODES).map(([k, v]) => `<option value="${k}">${k} - ${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Registration Type</label>
            <select id="biz-regtype" onchange="window._bizForm.registration_type=this.value">
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="QRMP">QRMP</option>
            </select>
          </div>
          <div class="form-group">
            <label>PAN</label>
            <input id="biz-pan" placeholder="AAAPL1234F"
              oninput="this.value=this.value.toUpperCase(); window._bizForm.pan=this.value">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input id="biz-email" type="email" placeholder="info@company.com"
              oninput="window._bizForm.email=this.value">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input id="biz-phone" placeholder="+91 9999999999"
              oninput="window._bizForm.phone=this.value">
          </div>
          <div class="form-group full">
            <label>Address</label>
            <textarea id="biz-address" rows="2"
              oninput="window._bizForm.address=this.value"></textarea>
          </div>
          <div class="form-group full" id="biz-assign-wrap">
            <label>Assign Users <span style="font-weight:400;color:var(--text3)">(optional)</span></label>
            <div id="biz-user-checklist" style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px">
              <div class="empty-sub" style="padding:8px">Loading users...</div>
            </div>
            <div class="text-xs mt-2" style="color:var(--text3)">Selected users will be able to access this business after login.</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('biz-modal')">Cancel</button>
        <button class="btn btn-primary" id="biz-save-btn" onclick="saveBusiness()">Save Business</button>
      </div>
    </div>
  </div>

  <!-- Assign Users Modal (for existing businesses) -->
  <div class="modal-overlay" id="assign-modal">
    <div class="modal modal-sm">
      <div class="modal-header">
        <div class="modal-title">Assign Users</div>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('assign-modal')" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div id="assign-biz-name" style="font-weight:600;margin-bottom:12px;color:var(--text1)"></div>
        <div id="assign-user-checklist" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px">
          <div class="empty-sub" style="padding:8px">Loading...</div>
        </div>
        <div class="text-xs mt-2" style="color:var(--text3)">Check users who should have access to this business.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('assign-modal')">Cancel</button>
        <button class="btn btn-primary" id="assign-save-btn" onclick="saveAssignments()">Save Assignments</button>
      </div>
    </div>
  </div>`;

  window._bizForm = { registration_type: 'Regular' };
  window._loadedBusinesses = [];
  window._assignBizId = null;

  // Pre-load users for the checklist
  try {
    const ur = await API.get('/users');
    window._allUsers = (ur.data || []).filter(u => u.active && u.role !== 'admin');
  } catch(e) { window._allUsers = []; }

  loadBusinesses();
});

async function loadBusinesses() {
  try {
    const res = await API.get('/businesses');
    const el = document.getElementById('biz-table');
    if (!res.data?.length) {
      el.innerHTML = '<div class="empty-state" style="padding:32px"><div class="empty-title">No businesses registered</div><div class="empty-sub">Add your first business to get started.</div></div>';
      return;
    }
    window._loadedBusinesses = res.data;
    el.innerHTML = `<table><thead><tr><th>GSTIN</th><th>Legal Name</th><th>Trade Name</th><th>State</th><th>Type</th><th>Actions</th></tr></thead>
    <tbody>${res.data.map(b => `<tr>
      <td class="font-mono">${escHtml(b.gstin)}</td>
      <td class="font-bold">${escHtml(b.legal_name)}</td>
      <td>${escHtml(b.trade_name || '—')}</td>
      <td>${escHtml(STATE_CODES[b.state_code] || b.state_code)}</td>
      <td><span class="badge badge-blue">${escHtml(b.registration_type)}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-xs btn-secondary" onclick="switchBusiness('${b.id}')">Switch</button>
        <button class="btn btn-xs btn-secondary" onclick="openBizModalById('${b.id}')">Edit</button>
        <button class="btn btn-xs btn-primary" onclick="openAssignModal('${b.id}')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          Assign Users
        </button>
      </td>
    </tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

function _renderUserChecklist(containerId, allUsers, selectedIds) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!allUsers.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:8px">No users available</div>';
    return;
  }
  el.innerHTML = allUsers.map(u => {
    const uid = String(u._id || u.id);
    const checked = selectedIds.includes(uid) ? 'checked' : '';
    const roleLabel = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'User';
    return `<label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:4px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${uid}" ${checked} style="width:15px;height:15px;cursor:pointer">
      <div>
        <div style="font-size:0.85rem;font-weight:600;color:var(--text1)">${escHtml(u.name)}</div>
        <div style="font-size:0.75rem;color:var(--text3)"><span class="badge badge-gray" style="font-size:0.68rem;padding:1px 5px">${escHtml(roleLabel)}</span></div>
      </div>
    </label>`;
  }).join('');
}

function _getCheckedUserIds(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return Array.from(el.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
}

function openBizModalById(id) {
  const b = window._loadedBusinesses.find(x => String(x.id || x._id) === String(id));
  if (b) openBizModal(b);
}

function openBizModal(biz = null) {
  window._bizForm = biz ? { ...biz } : { registration_type: 'Regular' };

  document.getElementById('biz-modal-title').textContent = biz ? 'Edit Business' : 'Add New Business';
  document.getElementById('biz-gstin').value = window._bizForm.gstin || '';
  document.getElementById('biz-legal').value = window._bizForm.legal_name || '';
  document.getElementById('biz-trade').value = window._bizForm.trade_name || '';
  document.getElementById('biz-state').value = window._bizForm.state_code || '';
  document.getElementById('biz-regtype').value = window._bizForm.registration_type || 'Regular';
  document.getElementById('biz-pan').value = window._bizForm.pan || '';
  document.getElementById('biz-email').value = window._bizForm.email || '';
  document.getElementById('biz-phone').value = window._bizForm.phone || '';
  document.getElementById('biz-address').value = window._bizForm.address || '';

  const msg = document.getElementById('biz-gstin-msg');
  if (msg) { msg.textContent = ''; msg.className = 'text-xs mt-2'; }
  if (biz) validateBizGSTIN();

  const btn = document.getElementById('biz-save-btn');
  if (btn) { btn.disabled = false; btn.textContent = biz ? 'Update Business' : 'Save Business'; }

  // Render user checklist
  const listEl = document.getElementById('biz-user-checklist');
  if (listEl) listEl.innerHTML = '<div class="empty-sub" style="padding:8px">Loading...</div>';

  openModal('biz-modal');

  (async () => {
    try {
      console.log('Fetching users API...');
      const ur = await API.get('/users');
      console.log('Users API success:', ur);
      window._allUsers = (ur.data || []).filter(u => u.active !== false);
      
      let assignedIds = [];
      if (biz) {
         try {
           const r = await API.get(`/businesses/${biz.id || biz._id}/users`);
           assignedIds = (r.data || []).map(u => String(u._id || u.id));
         } catch (e) {
           console.error('Failed to load assigned users', e);
         }
      }
      _renderUserChecklist('biz-user-checklist', window._allUsers, assignedIds);
    } catch (e) {
      console.error('Users API error:', e);
      if (listEl) listEl.innerHTML = `<div class="empty-sub" style="padding:8px;color:red">Failed to load users: ${escHtml(e.message)}</div>`;
    }
  })();
}

function validateBizGSTIN() {
  const v = (window._bizForm.gstin || '').toUpperCase();
  const msg = document.getElementById('biz-gstin-msg');
  if (!msg) return;
  if (!v) { msg.textContent = ''; return; }
  if (validateGSTIN(v)) {
    const sc = v.substring(0, 2);
    msg.textContent = 'Valid GSTIN — State: ' + (STATE_CODES[sc] || sc);
    msg.className = 'text-xs mt-2 text-green';
    window._bizForm.state_code = sc;
    const sel = document.getElementById('biz-state');
    if (sel) sel.value = sc;
  } else {
    msg.textContent = 'Invalid GSTIN — expected format: 29AAAPL1234F1Z5';
    msg.className = 'text-xs mt-2 text-red';
  }
}

async function saveBusiness() {
  const f = window._bizForm || {};
  const gstin = (f.gstin || document.getElementById('biz-gstin')?.value || '').trim().toUpperCase();
  const legal_name = (f.legal_name || document.getElementById('biz-legal')?.value || '').trim();
  const state_code = f.state_code || document.getElementById('biz-state')?.value || '';
  const registration_type = f.registration_type || document.getElementById('biz-regtype')?.value || 'Regular';
  const trade_name = (f.trade_name || document.getElementById('biz-trade')?.value || '').trim();
  const pan = (f.pan || document.getElementById('biz-pan')?.value || '').trim();
  const email = (f.email || document.getElementById('biz-email')?.value || '').trim();
  const phone = (f.phone || document.getElementById('biz-phone')?.value || '').trim();
  const address = (f.address || document.getElementById('biz-address')?.value || '').trim();

  if (!gstin) { toast('GSTIN is required', 'error'); return; }
  if (!validateGSTIN(gstin)) { toast('Invalid GSTIN format — use e.g. 29AAAPL1234F1Z5', 'error'); return; }
  if (!legal_name) { toast('Legal Name is required', 'error'); return; }
  if (!state_code) {
    const autoState = gstin.substring(0, 2);
    if (!STATE_CODES[autoState]) { toast('Please select a State', 'error'); return; }
    window._bizForm.state_code = autoState;
  }

  const finalState = state_code || gstin.substring(0, 2);
  const assignedUserIds = _getCheckedUserIds('biz-user-checklist');

  const btn = document.getElementById('biz-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const payload = { gstin, legal_name, trade_name, state_code: finalState, registration_type, pan, email, phone, address };
    if (f.id) {
      await API.put(`/businesses/${f.id}`, payload);
      // Update assignments for existing business
      await API.put(`/businesses/${f.id}/users`, { userIds: assignedUserIds });
      toast('Business updated successfully', 'success');
    } else {
      payload.assignedUserIds = assignedUserIds;
      await API.post('/businesses', payload);
      toast('Business added successfully', 'success');
    }
    closeModal('biz-modal');
    window._bizForm = {};

    try {
      const me = await API.get('/auth/me');
      App.businesses = me.businesses || [];
      if (!App.currentBiz && App.businesses.length > 0) {
        App.currentBiz = App.businesses[0];
        localStorage.setItem('gst_biz_id', String(App.currentBiz.id || App.currentBiz._id));
      }
      if (App.currentBiz && f.id && String(App.currentBiz.id || App.currentBiz._id) === String(f.id)) {
        App.currentBiz = App.businesses.find(b => String(b.id || b._id) === String(f.id)) || App.currentBiz;
        localStorage.setItem('gst_biz_id', String(App.currentBiz.id || App.currentBiz._id));
      }
      App.renderSidebar();
      BizSwitcher.update();
    } catch (e) { /* non-fatal */ }

    loadBusinesses();
  } catch (e) {
    toast(e.message || 'Failed to save business', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = f.id ? 'Update Business' : 'Save Business'; }
  }
}

// ── Assign Users Modal (standalone, for existing businesses) ──────────────────
async function openAssignModal(bizId) {
  window._assignBizId = bizId;
  const biz = window._loadedBusinesses.find(b => String(b.id || b._id) === String(bizId));
  const nameEl = document.getElementById('assign-biz-name');
  if (nameEl) nameEl.textContent = biz ? (biz.trade_name || biz.legal_name) : 'Business';

  const listEl = document.getElementById('assign-user-checklist');
  if (listEl) listEl.innerHTML = '<div class="empty-sub" style="padding:8px">Loading...</div>';

  openModal('assign-modal');

  try {
    console.log('Fetching users API for assign modal...');
    const [usersRes, assignedRes] = await Promise.all([
      API.get('/users'),
      API.get(`/businesses/${bizId}/users`)
    ]);
    console.log('Users API success:', usersRes);
    const assignableUsers = (usersRes.data || []).filter(u => u.active !== false);
    const assignedIds = (assignedRes.data || []).map(u => String(u._id || u.id));
    _renderUserChecklist('assign-user-checklist', assignableUsers, assignedIds);
  } catch(e) {
    console.error('Users API error:', e);
    if (listEl) listEl.innerHTML = `<div class="empty-sub" style="padding:8px;color:red">Failed to load users: ${escHtml(e.message)}</div>`;
  }
}

async function saveAssignments() {
  const bizId = window._assignBizId;
  if (!bizId) return;
  const userIds = _getCheckedUserIds('assign-user-checklist');
  const btn = document.getElementById('assign-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    await API.put(`/businesses/${bizId}/users`, { userIds });
    toast('User assignments saved', 'success');
    closeModal('assign-modal');
  } catch(e) {
    toast(e.message || 'Failed to save assignments', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Assignments'; }
  }
}

async function switchBusiness(id) {
  try {
    const sid = String(id);
    App.currentBiz = App.businesses.find(b => String(b.id || b._id) === sid)
      || (await API.get(`/businesses/${sid}`)).data;
    localStorage.setItem('gst_biz_id', sid);
    App.renderSidebar();
    BizSwitcher.update();
    toast(`Switched to ${App.currentBiz.trade_name || App.currentBiz.legal_name}`, 'success');
    Pages.navigate('dashboard');
  } catch (e) { toast(e.message, 'error'); }
}



Pages.register('business-requests', async () => {
  if (!RBAC.isAdmin()) {
    toast('Admin access required', 'error');
    Pages.navigate('dashboard');
    return;
  }

  document.getElementById('page-content').innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Business Access Requests</div>
          <div class="card-sub">Review and manage user access requests</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn ${window._brFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" onclick="filterBusinessRequests('pending')">
            Pending
          </button>
          <button class="btn ${window._brFilter === 'approved' ? 'btn-primary' : 'btn-secondary'}" onclick="filterBusinessRequests('approved')">
            Approved
          </button>
          <button class="btn ${window._brFilter === 'rejected' ? 'btn-primary' : 'btn-secondary'}" onclick="filterBusinessRequests('rejected')">
            Rejected
          </button>
          <button class="btn ${!window._brFilter ? 'btn-primary' : 'btn-secondary'}" onclick="filterBusinessRequests('')">
            All
          </button>
        </div>
      </div>
      <div id="business-requests-table" class="table-wrap"></div>
    </div>
    
    <!-- Approve Modal -->
    <div class="modal-overlay" id="approve-request-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <div class="modal-title">Approve Business Access</div>
          <button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('approve-request-modal')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="alert alert-error hidden" id="approve-error"></div>
          <div class="form-group">
            <label>Select Business *</label>
            <select id="approve-business-id" class="form-control">
              <option value="">-- Select Business --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Admin Notes (Optional)</label>
            <textarea id="approve-notes" class="form-control" rows="3" placeholder="Add any notes for this approval..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('approve-request-modal')">Cancel</button>
          <button class="btn btn-primary" id="approve-submit-btn" onclick="submitApproval()">Approve Request</button>
        </div>
      </div>
    </div>
    
    <!-- Reject Modal -->
    <div class="modal-overlay" id="reject-request-modal">
      <div class="modal modal-sm">
        <div class="modal-header">
          <div class="modal-title">Reject Business Access</div>
          <button class="btn btn-sm btn-secondary btn-icon" onclick="closeModal('reject-request-modal')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="alert alert-error hidden" id="reject-error"></div>
          <div class="form-group">
            <label>Reason for Rejection (Optional)</label>
            <textarea id="reject-notes" class="form-control" rows="3" placeholder="Explain why this request is being rejected..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('reject-request-modal')">Cancel</button>
          <button class="btn btn-danger" id="reject-submit-btn" onclick="submitRejection()">Reject Request</button>
        </div>
      </div>
    </div>
  `;
  
  window._brFilter = 'pending';
  await loadBusinessRequests();
});

window._brFilter = 'pending';
window._currentRequestId = null;

async function filterBusinessRequests(status) {
  window._brFilter = status;
  await loadBusinessRequests();
  // Update button states without re-rendering the entire page
  const buttons = document.querySelectorAll('#page-content .card-header button');
  buttons.forEach(btn => {
    const btnText = btn.textContent.trim().toLowerCase();
    if ((status === 'pending' && btnText === 'pending') ||
        (status === 'approved' && btnText === 'approved') ||
        (status === 'rejected' && btnText === 'rejected') ||
        (status === '' && btnText === 'all')) {
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
    } else {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    }
  });
}

async function loadBusinessRequests() {
  try {
    const url = window._brFilter ? `/business-requests/all?status=${window._brFilter}` : '/business-requests/all';
    const res = await API.get(url);
    const el = document.getElementById('business-requests-table');
    
    if (!res.data || res.data.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h3>No ${window._brFilter || ''} requests found</h3>
          <p>There are no business access requests to display.</p>
        </div>
      `;
      return;
    }
    
    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Business Name</th>
            <th>GSTIN</th>
            <th>Message</th>
            <th>Status</th>
            <th>Requested</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${res.data.map(req => `
            <tr>
              <td>
                <div class="font-bold">${escHtml(req.user_name)}</div>
                <div class="text-xs text-muted">${escHtml(req.user_email)}</div>
              </td>
              <td class="font-bold">${escHtml(req.business_name)}</td>
              <td>${req.gstin ? escHtml(req.gstin) : '<span class="text-muted">—</span>'}</td>
              <td>${req.message ? escHtml(req.message).substring(0, 50) + (req.message.length > 50 ? '...' : '') : '<span class="text-muted">—</span>'}</td>
              <td>
                ${req.status === 'pending' ? '<span class="badge badge-amber">Pending</span>' : ''}
                ${req.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : ''}
                ${req.status === 'rejected' ? '<span class="badge badge-red">Rejected</span>' : ''}
              </td>
              <td>${fmtDate(req.created_at)}</td>
              <td>
                ${req.status === 'pending' ? `
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-xs btn-primary" onclick="openApproveModal('${req._id}')">Approve</button>
                    <button class="btn btn-xs btn-danger" onclick="openRejectModal('${req._id}')">Reject</button>
                  </div>
                ` : '<span class="text-muted">—</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    toast(e.message || 'Failed to load requests', 'error');
  }
}

async function openApproveModal(requestId) {
  window._currentRequestId = requestId;
  
  // Load businesses for dropdown
  try {
    const res = await API.get('/businesses');
    const select = document.getElementById('approve-business-id');
    select.innerHTML = '<option value="">-- Select Business --</option>' + 
      res.data.map(b => `<option value="${b._id}">${escHtml(b.trade_name || b.legal_name)} (${escHtml(b.gstin)})</option>`).join('');
    
    document.getElementById('approve-notes').value = '';
    document.getElementById('approve-error').classList.add('hidden');
    openModal('approve-request-modal');
  } catch (e) {
    toast('Failed to load businesses', 'error');
  }
}

async function submitApproval() {
  const businessId = document.getElementById('approve-business-id').value;
  const notes = document.getElementById('approve-notes').value.trim();
  const btn = document.getElementById('approve-submit-btn');
  const err = document.getElementById('approve-error');
  
  err.classList.add('hidden');
  
  if (!businessId) {
    err.textContent = 'Please select a business';
    err.classList.remove('hidden');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Approving...';
  
  try {
    await API.post(`/business-requests/approve/${window._currentRequestId}`, {
      business_id: businessId,
      admin_notes: notes
    });
    
    toast('Request approved successfully', 'success');
    closeModal('approve-request-modal');
    await loadBusinessRequests();
  } catch (e) {
    err.textContent = e.message || 'Failed to approve request';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Approve Request';
  }
}

async function openRejectModal(requestId) {
  window._currentRequestId = requestId;
  document.getElementById('reject-notes').value = '';
  document.getElementById('reject-error').classList.add('hidden');
  openModal('reject-request-modal');
}

async function submitRejection() {
  const notes = document.getElementById('reject-notes').value.trim();
  const btn = document.getElementById('reject-submit-btn');
  const err = document.getElementById('reject-error');
  
  err.classList.add('hidden');
  
  btn.disabled = true;
  btn.textContent = 'Rejecting...';
  
  try {
    await API.post(`/business-requests/reject/${window._currentRequestId}`, {
      admin_notes: notes
    });
    
    toast('Request rejected', 'success');
    closeModal('reject-request-modal');
    await loadBusinessRequests();
  } catch (e) {
    err.textContent = e.message || 'Failed to reject request';
    err.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reject Request';
  }
}

// Expose functions globally
window.filterBusinessRequests = filterBusinessRequests;
window.openApproveModal = openApproveModal;
window.submitApproval = submitApproval;
window.openRejectModal = openRejectModal;
window.submitRejection = submitRejection;
