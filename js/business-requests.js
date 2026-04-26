// ── Business Request Module ──────────────────────────────────────────────────
const BusinessRequestModule = {
  pendingRequest: null,

  // Check if user has a pending request
  async checkPendingStatus() {
    try {
      const res = await API.get('/business-requests/pending-status');
      this.pendingRequest = res.hasPending ? res.request : null;
      return res.hasPending;
    } catch(e) {
      console.error('Failed to check pending status:', e);
      return false;
    }
  },

  // Open request modal
  async openRequestModal() {
    // Check if user already has a pending request
    const hasPending = await this.checkPendingStatus();
    
    if (hasPending) {
      toast('You already have a pending business access request', 'info');
      return;
    }
    
    // Clear form
    document.getElementById('br-business-name').value = '';
    document.getElementById('br-gstin').value = '';
    document.getElementById('br-message').value = '';
    document.getElementById('business-request-error').classList.add('hidden');
    
    openModal('business-request-modal');
  },

  // Submit business access request
  async submitRequest() {
    const businessName = document.getElementById('br-business-name').value.trim();
    const gstin = document.getElementById('br-gstin').value.trim();
    const message = document.getElementById('br-message').value.trim();
    const btn = document.getElementById('submit-business-request-btn');
    const err = document.getElementById('business-request-error');
    
    err.classList.add('hidden');
    
    if (!businessName) {
      err.textContent = 'Business name is required';
      err.classList.remove('hidden');
      return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> Submitting...';
    
    try {
      const res = await API.post('/business-requests/request', {
        business_name: businessName,
        gstin,
        message
      });
      
      toast(res.message || 'Request submitted successfully', 'success');
      closeModal('business-request-modal');
      
      // Store pending request
      this.pendingRequest = res.request;
      
      // Refresh the current page to show updated UI
      if (Pages.current) {
        Pages.navigate(Pages.current);
      }
    } catch(e) {
      err.textContent = e.message || 'Failed to submit request';
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  },

  // Open chat with admin
  openAdminChat() {
    // Check if ChatModule exists and is initialized
    if (typeof ChatModule !== 'undefined' && ChatModule.open) {
      ChatModule.open();
      
      // Just focus the input, don't pre-fill message
      setTimeout(() => {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
          chatInput.focus();
        }
      }, 300);
    } else {
      // Fallback: show toast with instructions
      toast('Please contact your administrator at admin@gst.local for business access', 'info');
    }
  },

  // Contact support
  contactSupport() {
    this.showSupportTicketModal();
  },

  // Show support ticket modal
  showSupportTicketModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-header">
          <div class="modal-title">Contact Support</div>
          <button class="btn btn-sm btn-secondary btn-icon" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div id="supportAlert" class="alert alert-error hidden"></div>
          <form id="supportTicketForm">
            <div class="form-group">
              <label>Subject *</label>
              <input type="text" id="supportSubject" required placeholder="Brief description of your issue">
            </div>
            <div class="form-group">
              <label>Priority</label>
              <select id="supportPriority">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div class="form-group">
              <label>Description *</label>
              <textarea id="supportDescription" rows="5" required placeholder="Please describe your issue in detail..."></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" id="submitSupportBtn">Submit Ticket</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const form = modal.querySelector('#supportTicketForm');
    const alertBox = modal.querySelector('#supportAlert');
    const submitBtn = modal.querySelector('#submitSupportBtn');

    const showAlert = (message, type) => {
      alertBox.textContent = message;
      alertBox.classList.remove('hidden');
      alertBox.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
    };

    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const subject = document.getElementById('supportSubject').value.trim();
      const priority = document.getElementById('supportPriority').value;
      const description = document.getElementById('supportDescription').value.trim();

      if (!subject || !description) {
        showAlert('Please fill in all required fields', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      alertBox.classList.add('hidden');

      try {
        const response = await API.post('/tickets', { subject, priority, description });

        if (response.success) {
          toast(`Ticket #${response.data.ticketId} created successfully!`, 'success');
          showAlert(`Ticket #${response.data.ticketId} created successfully! Our team will respond soon.`, 'success');
          form.reset();
          setTimeout(() => modal.remove(), 2500);
        } else {
          showAlert(response.message || 'Failed to create ticket', 'error');
        }
      } catch (error) {
        showAlert(error.message || 'Failed to create ticket. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Ticket';
      }
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },

  // Render no-business UI with interactive options
  renderNoBusiness(container) {
    const isAdmin = RBAC.isAdmin();
    
    if (isAdmin) {
      // Admin view - simple add business button
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
    
    // User view - interactive options
    const hasPending = this.pendingRequest !== null;
    
    container.innerHTML = `
      <div class="empty-state-full">
        <div class="empty-state-icon" style="background:var(--amber-bg);border-color:rgba(245,158,11,0.25)">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <h2 class="empty-state-heading">No Business Assigned</h2>
        <p class="empty-state-desc">
          You don't have access to any business yet. Request access from an administrator to start managing GST filings and invoices.
        </p>
        
        ${hasPending ? `
          <div class="alert alert-info" style="max-width:400px;margin:0 auto 24px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <div>
              <strong>Request Pending</strong><br>
              Your business access request for "<strong>${escHtml(this.pendingRequest.business_name)}</strong>" is being reviewed by an administrator.
            </div>
          </div>
        ` : ''}
        
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:24px">
          ${!hasPending ? `
            <button class="btn btn-primary btn-md" onclick="BusinessRequestModule.openRequestModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              Request Business Access
            </button>
          ` : ''}
          
          <button class="btn btn-secondary btn-md" onclick="BusinessRequestModule.openAdminChat()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat with Admin
          </button>
          
          <button class="btn btn-secondary btn-md" onclick="BusinessRequestModule.contactSupport()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Contact Support
          </button>
        </div>
        
        <div style="margin-top:32px;font-size:0.82rem;color:var(--text3);max-width:500px;margin-left:auto;margin-right:auto">
          <strong>Need help?</strong> Contact your administrator or use the chat feature to request business access. Once approved, you'll be able to access all GST management features.
        </div>
      </div>`;
  }
};

// Initialize on app load
document.addEventListener('DOMContentLoaded', () => {
  // Check pending status when app loads
  if (App.user && !App.currentBiz) {
    BusinessRequestModule.checkPendingStatus();
  }
});

// Expose module to window for onclick handlers
window.BusinessRequestModule = BusinessRequestModule;
