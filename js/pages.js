// Pages router
const Pages = {
  current: null,
  pages: {},

  register(name, fn) { this.pages[name] = fn; },

  navigate(name) {
    const page = name || 'dashboard';

    // Settings is now inside the Profile panel — redirect gracefully
    if (page === 'settings') {
      if (typeof ProfilePanel !== 'undefined') {
        ProfilePanel.open();
        ProfilePanel.switchTab('settings');
      }
      return;
    }

    // RBAC guard — block unauthorized navigation
    if (typeof RBAC !== 'undefined' && !RBAC.canAccess(page)) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.getElementById('page-title').textContent = PAGE_TITLES[page] || 'GST System';

      const messages = {
        businesses: 'You do not have permission to manage businesses. Only administrators can add or modify business entities.',
        users:      'You do not have permission to manage users. Contact your administrator to request access.',
        audit:      'Audit trail access is restricted to administrators.',
      };

      document.getElementById('page-content').innerHTML = `
        <div class="access-denied-wrap">
          <div class="access-denied-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div class="access-denied-body">
            <h2 class="access-denied-title">Access Restricted</h2>
            <p class="access-denied-msg">${messages[page] || 'You do not have permission to view this page.'}</p>
            <p class="access-denied-sub">Please contact your administrator if you require access.</p>
            <button class="btn btn-primary btn-md" onclick="Pages.navigate('dashboard')">Go to Dashboard</button>
          </div>
        </div>`;
      return;
    }

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    document.getElementById('page-title').textContent = PAGE_TITLES[page] || 'GST System';
    location.hash = page;
    this.current = page;
    const fn = this.pages[page];
    if (fn) {
      document.getElementById('page-content').innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto 12px;width:32px;height:32px"></div></div>';
      fn();
    }
  }
};

const PAGE_TITLES = {
  dashboard: 'Dashboard', invoices: 'Sales Invoices', purchases: 'Purchase Register',
  returns: 'GST Returns', reconcile: 'Reconciliation', parties: 'Parties',
  compliance: 'Compliance Calendar', tds: 'TDS / TCS', analytics: 'Analytics',
  hsn: 'HSN / SAC Lookup', audit: 'Audit Trail', users: 'User Management',
  businesses: 'Businesses', profile: 'Profile', settings: 'Settings',

};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
Pages.register('dashboard', async () => {
  const bizId = App.currentBiz?.id;
  if (!bizId) {
    const container = document.getElementById('page-content');
    
    // Use BusinessRequestModule for non-admin users
    if (!RBAC.isAdmin() && typeof BusinessRequestModule !== 'undefined') {
      await BusinessRequestModule.checkPendingStatus();
      BusinessRequestModule.renderNoBusiness(container);
      return;
    }
    
    // Admin fallback
    container.innerHTML = `
      <div class="empty-state-full">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <h2 class="empty-state-heading">No Business Selected</h2>
        <p class="empty-state-desc">Add your first business to start managing GST filings, invoices, and compliance tracking.</p>
        <button class="btn btn-primary btn-md" onclick="Pages.navigate('businesses')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Business
        </button>
      </div>`;
    return;
  }

  try {
    const [dash, compliance] = await Promise.all([
      API.get('/analytics/dashboard', { business_id: bizId }),
      API.get('/compliance', { business_id: bizId })
    ]);
    const d = dash.data;
    const s = d.summary;

    document.getElementById('page-content').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-secondary" onclick="downloadDashboardReport()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download Report
      </button>
    </div>
    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-label">Total Sales (FY)</div>
        <div class="stat-value">${fmtAmount(s.total_sales)}</div>
        <div class="stat-sub">${fmtNum(s.total_invoices)} invoices</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Total Tax Collected</div>
        <div class="stat-value">${fmtAmount(s.total_tax)}</div>
        <div class="stat-sub">Total GST (FY)</div>
      </div>
      <div class="stat-card teal">
        <div class="stat-label">ITC Available</div>
        <div class="stat-value">${fmtAmount(s.itc_eligible)}</div>
        <div class="stat-sub">From purchases</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-label">Net Tax Liability</div>
        <div class="stat-value">${fmtAmount(s.net_liability)}</div>
        <div class="stat-sub">After ITC adjustment</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Taxable Turnover</div>
        <div class="stat-value">${fmtAmount(s.total_taxable)}</div>
        <div class="stat-sub">FY ${s.financial_year}</div>
      </div>
      <div class="stat-card ${d.compliance.overdue > 0 ? 'red' : 'green'}">
        <div class="stat-label">Compliance Status</div>
        <div class="stat-value">${d.compliance.overdue > 0 ? d.compliance.overdue + ' Overdue' : 'On Track'}</div>
        <div class="stat-sub">${d.compliance.pending_upcoming} due this week</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div class="card-header"><div><div class="card-title">Monthly Sales & Tax</div><div class="card-sub">Current financial year</div></div></div>
        <div class="card-body"><div class="chart-wrap"><canvas id="monthly-chart"></canvas></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><div class="card-title">Supply Type Breakdown</div><div class="card-sub">Intra vs Inter-state</div></div></div>
        <div class="card-body"><div class="chart-wrap"><canvas id="supply-chart"></canvas></div></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Upcoming Deadlines</div><div class="card-sub">Next 7 days</div></div>
          <button class="btn btn-sm btn-secondary" onclick="Pages.navigate('compliance')">View All</button>
        </div>
        <div id="upcoming-deadlines">
          ${compliance.upcoming?.length ? compliance.upcoming.map(c => `
            <div class="cal-item">
              <div class="cal-date">${fmtDate(c.due_date)}</div>
              <div class="cal-info">
                <div class="cal-return">${c.return_type}</div>
                <div class="cal-period">${periodLabel(c.period)}</div>
              </div>
              ${statusBadge(c.status)}
            </div>
          `).join('') : '<div class="empty-state" style="padding:24px"><div class="empty-sub">No upcoming deadlines</div></div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Top Customers</div><div class="card-sub">By sales value (FY)</div></div>
        </div>
        <div class="card-body" style="padding:0">
          ${d.top_customers?.length ? d.top_customers.slice(0,8).map(c => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
              <div style="flex:1;font-size:0.85rem;font-weight:600">${c.party_name||'Unknown'}</div>
              <div style="font-family:var(--mono);font-size:0.82rem;color:var(--accent2)">${fmtAmount(c.total)}</div>
              <div style="font-size:0.72rem;color:var(--text3)">${c.invoices} inv</div>
            </div>
          `).join('') : '<div class="empty-state" style="padding:24px"><div class="empty-sub">No sales data yet</div></div>'}
        </div>
      </div>
    </div>`;

    // Monthly chart
    if (d.monthly?.length && window.Chart) {
      const labels = d.monthly.map(r => `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(r.m)]} ${r.y.slice(-2)}`);
      new Chart(document.getElementById('monthly-chart'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Taxable Value', data: d.monthly.map(r=>r.taxable), backgroundColor: 'rgba(79,126,248,0.5)', borderColor: '#4f7ef8', borderWidth: 1.5 },
            { label: 'Tax Collected', data: d.monthly.map(r=>r.tax), backgroundColor: 'rgba(34,197,94,0.5)', borderColor: '#22c55e', borderWidth: 1.5 }
          ]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#9ba3c4',font:{size:11}}}}, scales:{ x:{ticks:{color:'#9ba3c4',font:{size:10}},grid:{color:'rgba(46,53,84,0.6)'}}, y:{ticks:{color:'#9ba3c4',font:{size:10}},grid:{color:'rgba(46,53,84,0.6)'}} } }
      });
    }

    // Supply type donut
    if (d.by_supply_type?.length && window.Chart) {
      const colors = ['#4f7ef8','#22c55e','#f59e0b','#ef4444','#a78bfa'];
      new Chart(document.getElementById('supply-chart'), {
        type: 'doughnut',
        data: {
          labels: d.by_supply_type.map(r=>r.supply_type?.toUpperCase()),
          datasets: [{ data: d.by_supply_type.map(r=>r.taxable), backgroundColor: colors, borderWidth: 0 }]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{color:'#9ba3c4',font:{size:11}} } } }
      });
    }
  } catch(e) {
    document.getElementById('page-content').innerHTML = `<div class="alert alert-danger">Failed to load dashboard: ${escHtml(e.message)}</div>`;
  }
});

// Dashboard PDF download
function downloadDashboardReport() {
  const bizId = App.currentBiz?.id;
  if (!bizId) { toast('No business selected', 'error'); return; }
  const token = localStorage.getItem('gst_token');
  const url = API_BASE + `/export/dashboard-report?business_id=${bizId}&token=${token}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dashboard_report.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Downloading report...', 'info');
}

// Helper: open support chat for "Contact Administrator" button
Pages._contactAdmin = function() {
  if (typeof ChatModule !== 'undefined' && ChatModule.open) {
    ChatModule.open();
  } else {
    // Fallback: open profile panel
    if (typeof ProfilePanel !== 'undefined') ProfilePanel.open();
  }
};

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
Pages.register('profile', async () => {
  try {
    const res = await fetch('/html/profile.html');
    const html = await res.text();
    document.getElementById('page-content').innerHTML = html;
    
    // Load profile data
    await ProfilePage.load();
    
    // Initialize with profile tab active
    ProfilePage.switchTab('profile');
  } catch(e) {
    document.getElementById('page-content').innerHTML = `<div class="alert alert-danger">Failed to load profile page: ${escHtml(e.message)}</div>`;
  }
});

