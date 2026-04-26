// API client
const API = {
  base: '/api',
  token: () => localStorage.getItem('gst_token'),
  bizId: () => localStorage.getItem('gst_biz_id'),

  async req(method, path, body, params) {
    let url = this.base + path;
    if (params) {
      const p = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.append(k, v); });
      const s = p.toString(); if (s) url += '?' + s;
    }
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const t = this.token(); if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({ success: false, message: 'Server error' }));
    if (r.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('gst_token');
      localStorage.removeItem('gst_biz_id');
      toast('Session expired — please log in again', 'error');
      setTimeout(() => {
        document.getElementById('app').classList.remove('visible');
        document.getElementById('auth-screen').style.display = 'flex';
      }, 1200);
      throw new Error('Session expired');
    }
    if (!r.ok && !data.success) throw new Error(data.message || 'Request failed');
    return data;
  },

  get: (path, params) => API.req('GET', path, null, params),
  post: (path, body) => API.req('POST', path, body),
  put: (path, body) => API.req('PUT', path, body),
  patch: (path, body) => API.req('PATCH', path, body),
  delete: (path, params) => API.req('DELETE', path, null, params),
};

// HTML escape helper — prevents XSS when injecting user/API data into innerHTML
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Toast
function toast(msg, type = 'info', dur = 3500) {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, dur);
}

// Currency config
const CURRENCY = {
  current: 'INR',
  rates: { INR: 1, USD: 0.012, EUR: 0.011 },
  symbols: { INR: '₹', USD: '$', EUR: '€' },
};

// Format helpers
function fmtAmount(n) {
  const val = (parseFloat(n) || 0) * CURRENCY.rates[CURRENCY.current];
  const sym = CURRENCY.symbols[CURRENCY.current];
  return sym + ' ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtNum(n) { return (parseFloat(n) || 0).toLocaleString('en-IN'); }

function statusBadge(s) {
  const map = {
    draft: 'badge-gray', confirmed: 'badge-green', cancelled: 'badge-red', amended: 'badge-amber',
    filed: 'badge-green', prepared: 'badge-blue', pending: 'badge-amber', overdue: 'badge-red',
    matched: 'badge-green', mismatch: 'badge-red', missing: 'badge-amber',
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${s}</span>`;
}

// Modal helpers
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function confirmModal(title, msg, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-btn').onclick = () => { closeModal('confirm-modal'); onConfirm(); };
  openModal('confirm-modal');
}

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// GST calculation helpers (mirror backend)
const STATE_CODES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh', '97': 'Other Territory', '99': 'Centre'
};

function validateGSTIN(g) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test((g || '').toUpperCase());
}

function calcItemTax(item, supplyType, sellerState, buyerState) {
  const tv = parseFloat(((item.quantity * item.unit_price) * (1 - (item.discount || 0) / 100)).toFixed(2));
  const taxAmt = parseFloat(((tv * item.gst_rate) / 100).toFixed(2));
  const isInter = supplyType === 'inter' || sellerState !== buyerState;
  const cess = parseFloat(((tv * (item.cess_rate || 0)) / 100).toFixed(2));
  const cgst = isInter ? 0 : parseFloat((taxAmt / 2).toFixed(2));
  const sgst = isInter ? 0 : parseFloat((taxAmt / 2).toFixed(2));
  const igst = isInter ? taxAmt : 0;
  return { ...item, taxable_value: tv, cgst_rate: isInter ? 0 : item.gst_rate / 2, sgst_rate: isInter ? 0 : item.gst_rate / 2, igst_rate: isInter ? item.gst_rate : 0, cgst, sgst, igst, cess, total: parseFloat((tv + cgst + sgst + igst + cess).toFixed(2)) };
}

// Period helpers
function currentPeriod() {
  const now = new Date();
  return String(now.getMonth() + 1).padStart(2, '0') + now.getFullYear();
}
function periodLabel(p) {
  if (!p) return '';
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = parseInt(p.substring(0, 2)), y = p.substring(2);
  return `${months[m]} ${y}`;
}

// Table pagination helper
function renderPagination(container, current, total, onChange) {
  if (!container) return;
  container.innerHTML = '';
  if (total <= 1) return;
  const makeBtn = (label, page, disabled, active) => {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`;
    b.textContent = label; b.disabled = disabled;
    b.onclick = () => onChange(page);
    return b;
  };
  container.appendChild(makeBtn('«', 1, current === 1, false));
  container.appendChild(makeBtn('‹', current - 1, current === 1, false));
  for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) {
    container.appendChild(makeBtn(i, i, false, i === current));
  }
  container.appendChild(makeBtn('›', current + 1, current === total, false));
  container.appendChild(makeBtn('»', total, current === total, false));
}

// Debounce
function debounce(fn, ms = 300) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── RBAC helpers ─────────────────────────────────────────────────────────────
const RBAC = {
  // Pages only admins can access
  adminOnly: ['users', 'audit', 'businesses'],

  isAdmin() { return App.user?.role === 'admin'; },
  isAccountant() { return App.user?.role === 'accountant'; },
  isViewer() { return App.user?.role === 'viewer'; },

  canAccess(page) {
    if (this.adminOnly.includes(page)) return this.isAdmin();
    return true;
  },

  canWrite() {
    return this.isAdmin() || this.isAccountant();
  },

  // Apply visibility to sidebar nav items based on role
  applyToSidebar() {
    if (!App.user) return;
    const isAdm = this.isAdmin();
    // Hide specific nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      const page = el.dataset.page;
      el.style.display = (this.adminOnly.includes(page) && !isAdm) ? 'none' : '';
    });
    // Hide entire sectors (like Admin section)
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdm ? '' : 'none';
    });
    // Hide the biz-switcher "add business" affordance for non-admins
    const switcher = document.getElementById('sidebar-biz-switcher');
    if (switcher) switcher.style.cursor = isAdm ? 'pointer' : 'default';
  }
};

// App state
const App = {
  user: null,
  businesses: [],
  currentBiz: null,

  async init() {
    const token = localStorage.getItem('gst_token');
    if (!token) { this.showAuth(); return; }
    try {
      const res = await API.get('/auth/me');
      this.user = res.user;
      this.businesses = res.businesses || [];
      const savedBiz = localStorage.getItem('gst_biz_id');
      this.currentBiz = this.businesses.find(b => String(b.id || b._id) === String(savedBiz)) || this.businesses[0];
      if (this.currentBiz) localStorage.setItem('gst_biz_id', String(this.currentBiz.id || this.currentBiz._id));
      this.showApp();
      Pages.navigate(location.hash.replace('#', '') || 'dashboard');
    } catch (e) {
      localStorage.removeItem('gst_token');
      this.showAuth();
    }
  },

  showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').classList.remove('visible');
  },

  showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    this.renderSidebar();
    RBAC.applyToSidebar();
    this.initTheme();
    this.checkComplianceAlerts();
    this.loadNotifications();
    // Restore currency
    const savedCur = localStorage.getItem('gst_currency');
    if (savedCur) { CURRENCY.current = savedCur; const sel = document.getElementById('currency-select'); if (sel) sel.value = savedCur; }
    // Init live chat widget (only once)
    if (window.ChatModule && !window.ChatModule._started) {
      window.ChatModule._started = true;
      window.ChatModule.init(this.user);
    }
    // Init chat
    if (typeof ChatModule !== 'undefined') ChatModule.init(this.user);
    // Check for pending business requests if no business assigned
    if (!this.currentBiz && this.user.role !== 'admin' && typeof BusinessRequestModule !== 'undefined') {
      BusinessRequestModule.checkPendingStatus();
    }
  },

  renderSidebar() {
    if (this.user) {
      document.getElementById('user-name').textContent = this.user.name;
      const isAdm = this.user.role === 'admin';
      document.getElementById('user-role').textContent = isAdm ? 'Admin' : 'Accountant';
      document.getElementById('user-avatar').textContent = this.user.name.charAt(0).toUpperCase();
      // Topbar role badge
      const roleBadge = document.getElementById('topbar-role');
      if (roleBadge) {
        const isAdm = this.user.role === 'admin';
        roleBadge.textContent = isAdm ? 'Admin' : 'Accountant';
        roleBadge.className = `role-badge ${isAdm ? 'admin' : this.user.role === 'viewer' ? 'viewer' : 'user'}`;
        roleBadge.classList.remove('hidden');
      }
      // Biz-switcher: only clickable for admins
      const switcher = document.getElementById('sidebar-biz-switcher');
      if (switcher) {
        const isAdmin = RBAC.isAdmin();
        switcher.style.cursor = isAdmin ? 'pointer' : 'default';
        switcher.title = isAdmin ? 'Manage businesses' : '';
        // BUG-14: only apply hover highlight for admins
        switcher.classList.toggle('admin-clickable', isAdmin);
      }
    }
    if (this.currentBiz) {
      document.getElementById('biz-name').textContent = this.currentBiz.trade_name || this.currentBiz.legal_name;
      document.getElementById('biz-gstin').textContent = this.currentBiz.gstin;
      // BUG-18: populate topbar business indicator
      const topbarBiz = document.getElementById('topbar-biz');
      if (topbarBiz) topbarBiz.textContent = this.currentBiz.gstin || '';
    } else {
      document.getElementById('biz-name').textContent = 'No business selected';
      document.getElementById('biz-gstin').textContent = '—';
      const topbarBiz = document.getElementById('topbar-biz');
      if (topbarBiz) topbarBiz.textContent = '';
    }
  },

  // ─── Theme Toggle ──────────────────────────────────────────
  initTheme() {
    let theme = localStorage.getItem('gst_theme');
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', theme);
    this._applyThemeIcon(theme);
  },

  _applyThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (theme === 'light') {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    } else {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gst_theme', next);
    this._applyThemeIcon(next);
    toast(`Switched to ${next} mode`, 'info');
  },

  // ─── Sidebar Toggle (mobile) ───────────────────────────────
  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  },

  // ─── Notifications ─────────────────────────────────────────
  toggleNotifications() {
    const dd = document.getElementById('notif-dropdown');
    dd.classList.toggle('open');
  },

  async loadNotifications() {
    if (!this.currentBiz) return;
    try {
      const res = await API.get('/compliance', { business_id: this.currentBiz.id });
      const items = [];
      const overdue = res.data?.filter(c => c.status === 'overdue') || [];
      const today = new Date().toISOString().split('T')[0];
      const upcoming = res.data?.filter(c => c.status === 'pending' && c.due_date >= today) || [];

      overdue.forEach(c => items.push({ type: 'red', title: `${c.return_type} — OVERDUE`, sub: `Due: ${fmtDate(c.due_date)}` }));
      upcoming.slice(0, 5).forEach(c => items.push({ type: 'amber', title: `${c.return_type} due soon`, sub: `Due: ${fmtDate(c.due_date)} · ${periodLabel(c.period)}` }));

      const countEl = document.getElementById('notif-count');
      const total = overdue.length + upcoming.length;
      if (countEl) { countEl.textContent = total; countEl.classList.toggle('hidden', total === 0); }

      const list = document.getElementById('notif-list');
      if (list) {
        list.innerHTML = items.length ? items.map(i =>
          `<div class="notif-item" onclick="Pages.navigate('compliance');App.toggleNotifications()">
            <div class="notif-dot ${i.type}"></div>
            <div class="notif-info"><div class="notif-title">${i.title}</div><div class="notif-sub">${i.sub}</div></div>
          </div>`
        ).join('') : '<div class="notif-empty">No pending compliance items</div>';
      }

      // Browser notification for overdue items
      if (overdue.length > 0 && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      if (overdue.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('GST Compliance Alert', { body: `${overdue.length} overdue filing(s)! Check your compliance calendar.`, icon: '⚠️' });
      }

      // Also update sidebar badge
      const badge = document.getElementById('compliance-badge');
      if (badge) { badge.textContent = total; badge.classList.toggle('hidden', total === 0); }
    } catch (e) { }
  },

  async checkComplianceAlerts() {
    // Handled by loadNotifications now
  },

  // ─── Currency ──────────────────────────────────────────────
  setCurrency(cur) {
    CURRENCY.current = cur;
    localStorage.setItem('gst_currency', cur);
    // Keep profile panel currency selector in sync if open
    const sel = document.getElementById('currency-select');
    if (sel) sel.value = cur;
    // Re-render current page to reflect currency change
    const page = Pages.current || 'dashboard';
    if (page !== 'settings') Pages.navigate(page);
    toast(`Currency: ${CURRENCY.symbols[cur]} ${cur}`, 'info');
  },

  async logout() {
    // Clear all auth data
    localStorage.removeItem('gst_token');
    localStorage.removeItem('gst_biz_id');
    sessionStorage.clear();
    this.user = null;
    this.currentBiz = null;
    this.businesses = [];
    // Show auth screen instead of redirecting to landing page
    this.showAuth();
    toast('Logged out successfully', 'info');
  }
};

// Close notification dropdown on outside click
document.addEventListener('click', e => {
  const wrap = document.querySelector('.notification-wrap');
  const dd = document.getElementById('notif-dropdown');
  if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('open');
});

// ─── Business Switcher ────────────────────────────────────────────────────────
// Shows a dropdown in the topbar when a non-admin user has multiple businesses.
const BizSwitcher = {
  update() {
    const wrap = document.getElementById('biz-switcher-wrap');
    if (!wrap) return;
    const businesses = App.businesses || [];
    const isAdmin = App.user?.role === 'admin';

    // Admins manage businesses via the sidebar; single-biz users need no dropdown
    if (businesses.length <= 1 || isAdmin) {
      wrap.style.display = 'none';
      return;
    }

    // Multiple businesses — show the select dropdown
    wrap.style.display = 'flex';
    const sel = document.getElementById('biz-switcher-select');
    if (!sel) return;

    const currentId = String(App.currentBiz?.id || App.currentBiz?._id || '');
    sel.innerHTML = businesses.map(b => {
      const id = String(b.id || b._id);
      const label = escHtml(b.trade_name || b.legal_name);
      return `<option value="${id}" ${id === currentId ? 'selected' : ''}>${label}</option>`;
    }).join('');
  },

  async select(id) {
    const biz = App.businesses.find(b => String(b.id || b._id) === String(id));
    if (!biz) return;
    App.currentBiz = biz;
    localStorage.setItem('gst_biz_id', String(id));
    App.renderSidebar();
    App.loadNotifications();
    toast('Switched to ' + escHtml(biz.trade_name || biz.legal_name), 'success');
    Pages.navigate(Pages.current || 'dashboard');
  }
};


// Global helper for switching business from profile page
function switchBusiness(id) {
  BizSwitcher.select(id);
}
