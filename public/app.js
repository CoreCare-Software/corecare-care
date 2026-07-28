const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const loginView = $('#login-view');
const appView = $('#app-view');
const loginForm = $('#login-form');
const loginError = $('#login-error');
const sidebar = $('.sidebar');
const menuButton = $('#menu-button');
const pageTitle = $('#page-title');
const pageKicker = $('#page-kicker');
const pages = $$('.page');
const clientDialog = $('#client-dialog');
const clientForm = $('#client-form');
const clientTableBody = $('#client-table-body');
const clientEmpty = $('#client-empty');
const clientSearch = $('#client-search');
const clientStatusFilter = $('#client-status-filter');
const passwordDialog = $('#password-dialog');
const passwordForm = $('#password-form');
const userDialog = $('#user-dialog');
const userForm = $('#user-form');
const staffDialog = $('#staff-dialog');
const staffForm = $('#staff-form');
const quickAddDialog = $('#quick-add-dialog');
let staff = [];
let carePlans = [];
let clientRisks = [];
let clientDocuments = [];

const labels = {
  family: ['Family portal', 'Secure family access, updates and messaging will be introduced in a later milestone.'],
  care: ['Care plans', 'Person-centred care plans, risks, goals, outcomes and reviews will be managed here.'],
  medication: ['Medication', 'Medication profiles, electronic MAR and administration records will be built here.'],
  visits: ['Visits', 'Live visits, daily notes, outcomes and evidence of care will be managed here.'],
  rota: ['Rota', 'Scheduling, recurring calls, assignments, travel and availability will be managed here.'],
  tasks: ['Tasks', 'Operational tasks, reminders, ownership and escalation will be managed here.'],
  incidents: ['Incidents', 'Incident reporting, investigation, actions and audit history will be managed here.'],
  finance: ['Finance', 'Invoices, rates, funding arrangements and payment tracking will be built here.'],
  reports: ['Reports', 'Operational, quality, compliance and management reporting will be built here.']
};

let clients = [];
let currentUser = null;
let users = [];
let selectedClientId = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (response.status === 401) {
    showLogin('Your session has expired. Sign in again.');
    throw new Error('Your session has expired.');
  }
  if (!response.ok) throw new Error(payload?.error?.message || 'CoreCare could not complete the request.');
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function setDate() {
  pageKicker.textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

function initialsFromName(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CC';
}

function roleLabel(role) {
  return ({ owner: 'Organisation owner', manager: 'Manager', carer: 'Carer', auditor: 'Read-only auditor' })[role] || 'CoreCare user';
}

function updateIdentity() {
  const name = currentUser?.displayName || 'CoreCare user';
  pageTitle.textContent = `Good afternoon, ${name.split(' ')[0]}`;
  $('#user-name').textContent = name;
  $('#user-role').textContent = roleLabel(currentUser?.role);
  $('#user-avatar').textContent = initialsFromName(name);
  $('#organisation-name').textContent = currentUser?.organisationName || 'Organisation';
}

async function showApplication(user) {
  currentUser = user || currentUser;
  loginView.hidden = true;
  appView.hidden = false;
  setDate();
  updateIdentity();
  await Promise.all([loadClients(), loadStaff(), loadDashboard()]);
  renderClients();
  renderStaff();
  await loadDevelopmentStatus();
  $('#main-content').focus();
  if (currentUser?.mustChangePassword) setTimeout(() => openPasswordDialog(true), 100);
}

function showLogin(message = '') {
  currentUser = null;
  appView.hidden = true;
  loginView.hidden = false;
  if (message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }
  $('#email').focus();
}

async function restoreSession() {
  try {
    const payload = await api('/api/auth/session');
    await showApplication(payload.user);
  } catch {
    showLogin();
  }
}

function activatePage(id) {
  pages.forEach(page => page.classList.remove('active-page'));
  $(id).classList.add('active-page');
}

function showPage(page) {
  selectedClientId = page === 'client-profile' ? selectedClientId : null;
  if (page === 'dashboard') {
    activatePage('#dashboard-page');
    setDate();
    updateIdentity();
    loadDashboard().catch(showToastError);
    return;
  }
  if (page === 'clients') {
    activatePage('#clients-page');
    pageKicker.textContent = 'People';
    pageTitle.textContent = 'Clients';
    loadClients().then(renderClients).catch(showToastError);
    return;
  }
  if (page === 'staff') {
    activatePage('#staff-page');
    pageKicker.textContent = 'Workforce';
    pageTitle.textContent = 'Staff';
    loadStaff().then(renderStaff).catch(showToastError);
    return;
  }
  if (page === 'settings') {
    activatePage('#settings-page');
    pageKicker.textContent = 'Administration';
    pageTitle.textContent = 'Settings';
    loadSettings();
    return;
  }
  activatePage('#placeholder-page');
  const [title, copy] = labels[page] || ['Module', 'This CoreCare module is planned for a future build.'];
  $('#placeholder-title').textContent = title;
  $('#placeholder-copy').textContent = copy;
  pageKicker.textContent = 'CoreCare module';
  pageTitle.textContent = title;
}

async function loadDevelopmentStatus() {
  try {
    const status = await api('/api/development/status');
    $('#dev-db').textContent = status.database.connected ? 'Connected' : 'Not connected';
    $('#dev-auth').textContent = status.authentication.mode;
    $('#dev-user').textContent = status.user.email;
    $('#dev-org').textContent = status.organisation.name;
    $('#dev-version').textContent = `v${status.deployment.version}`;
    $('#dev-checked').textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(status.deployment.checkedAt));
  } catch {
    $('#dev-db').textContent = 'Unavailable';
  }
}

async function loadClients() {
  const payload = await api('/api/clients?includeArchived=true');
  clients = Array.isArray(payload.clients) ? payload.clients : [];
}


async function loadDashboard() {
  const payload = await api('/api/dashboard');
  const m = payload.metrics || {};
  $('#dash-active-clients').textContent = m.activeClients ?? 0;
  $('#dash-reviews-due').textContent = m.reviewsDue ?? 0;
  $('#dash-high-risk').textContent = `${m.highRisk ?? 0} high risk`;
  $('#dash-active-staff').textContent = m.activeStaff ?? 0;
  $('#dash-total-staff').textContent = m.totalStaff ?? 0;
  $('#dash-compliance-due').textContent = m.complianceDue ?? 0;
  $('#dash-care-plans-due').textContent = m.carePlansDue ?? 0;
  $('#dash-active-risks').textContent = m.activeRisks ?? 0;
  const activity = payload.activity || [];
  $('#dashboard-activity').innerHTML = activity.length ? activity.map(event => {
    const when = new Date(event.created_at);
    const label = String(event.action || '').replaceAll('.', ' ');
    return `<div><span>${new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(when)}</span><i class="timeline-dot"></i><p><strong>${escapeHtml(label)}</strong>${event.user_name ? ` by ${escapeHtml(event.user_name)}` : ''}.</p></div>`;
  }).join('') : '<div><p>No recorded activity yet.</p></div>';
}

async function loadStaff() {
  const payload = await api('/api/staff?includeInactive=true');
  staff = Array.isArray(payload.staff) ? payload.staff : [];
}
function isPast(value){ return Boolean(value) && new Date(`${value}T23:59:59`) < new Date(); }
function staffName(item){ return `${item.firstName || ''} ${item.lastName || ''}`.trim(); }
function renderStaff() {
  const term = ($('#staff-search')?.value || '').trim().toLowerCase();
  const status = $('#staff-status-filter')?.value || 'all';
  const filtered = staff.filter(item => {
    const haystack = `${item.firstName} ${item.lastName} ${item.preferredName} ${item.jobTitle} ${item.phone} ${item.email}`.toLowerCase();
    return (!term || haystack.includes(term)) && (status === 'all' || item.status === status);
  });
  $('#staff-table-body').innerHTML = filtered.map(item => `<tr><td><div class="client-person"><span class="person-avatar">${initialsFromName(staffName(item))}</span><div><strong>${escapeHtml(staffName(item))}</strong><span>${escapeHtml(item.preferredName ? `Known as ${item.preferredName}` : item.employmentType)}</span></div></div></td><td>${escapeHtml(item.jobTitle)}</td><td>${escapeHtml(item.phone || item.email || 'Not recorded')}</td><td class="${isPast(item.dbsExpiry) ? 'date-overdue' : ''}">${formatDate(item.dbsExpiry)}${isPast(item.dbsExpiry) ? ' · overdue' : ''}</td><td class="${isPast(item.trainingExpiry) ? 'date-overdue' : ''}">${formatDate(item.trainingExpiry)}${isPast(item.trainingExpiry) ? ' · overdue' : ''}</td><td><span class="badge ${item.status === 'Active' ? 'success' : 'neutral'}">${escapeHtml(item.status)}</span></td><td><button class="row-action" data-edit-staff="${escapeHtml(item.id)}">Edit</button></td></tr>`).join('');
  $('#staff-empty').hidden = filtered.length > 0;
  $('#staff-active-count').textContent = staff.filter(x => x.status === 'Active').length;
  $('#staff-dbs-count').textContent = staff.filter(x => x.status === 'Active' && isPast(x.dbsExpiry)).length;
  $('#staff-training-count').textContent = staff.filter(x => x.status === 'Active' && isPast(x.trainingExpiry)).length;
  $$('[data-edit-staff]').forEach(button => button.addEventListener('click', () => openStaffDialog(button.dataset.editStaff)));
}
function openStaffDialog(id = '') {
  staffForm.reset(); $('#staff-form-error').hidden = true; staffForm.elements.id.value = id;
  $('#staff-dialog-title').textContent = id ? 'Edit staff' : 'Add staff';
  const item = staff.find(x => x.id === id);
  if (item) Object.entries(item).forEach(([key,value]) => { const field=staffForm.elements.namedItem(key); if(field) field.value=value ?? ''; });
  staffDialog.showModal();
}
async function saveStaff(event) {
  event.preventDefault(); const data=Object.fromEntries(new FormData(staffForm)); const error=$('#staff-form-error'); error.hidden=true;
  const submit=staffForm.querySelector('[type="submit"]'); submit.disabled=true; submit.textContent='Saving…';
  try { const id=data.id; await api(id ? `/api/staff/${encodeURIComponent(id)}` : '/api/staff',{method:id?'PUT':'POST',body:JSON.stringify(data)}); await loadStaff(); renderStaff(); await loadDashboard(); staffDialog.close(); }
  catch(exception){ error.textContent=exception.message; error.hidden=false; }
  finally{ submit.disabled=false; submit.textContent='Save staff member'; }
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function reviewDue(client) {
  return client.status === 'Active' && new Date(`${client.nextReview}T23:59:59`) < new Date();
}

function clientDisplayName(client) {
  const full = `${client.firstName || ''} ${client.lastName || ''}`.trim();
  return client.preferredName ? `${full} (${client.preferredName})` : full;
}

function renderClients() {
  const term = clientSearch.value.trim().toLowerCase();
  const status = clientStatusFilter.value;
  const filtered = clients.filter(client => {
    const haystack = `${client.firstName} ${client.lastName} ${client.preferredName} ${client.town} ${client.postcode} ${client.nhsNumber}`.toLowerCase();
    const matchesStatus = status === 'all' ? client.status !== 'Archived' : client.status === status;
    return (!term || haystack.includes(term)) && matchesStatus;
  });

  clientTableBody.innerHTML = filtered.map(client => `
    <tr>
      <td><button class="client-link" data-view-client="${escapeHtml(client.id)}"><span class="person-avatar">${initialsFromName(`${client.firstName} ${client.lastName}`)}</span><span><strong>${escapeHtml(clientDisplayName(client))}</strong><small>DOB ${formatDate(client.dateOfBirth)} · NHS ${escapeHtml(client.nhsNumber || 'Not recorded')}</small></span></button></td>
      <td>${escapeHtml([client.town, client.postcode].filter(Boolean).join(', ') || 'Not recorded')}</td>
      <td>${escapeHtml(client.carePackage || 'Not set')}</td>
      <td><span class="review-date ${reviewDue(client) ? 'overdue' : ''}">${formatDate(client.nextReview)}${reviewDue(client) ? ' · overdue' : ''}</span></td>
      <td><span class="badge ${client.status === 'Active' ? 'success' : client.status === 'Paused' ? 'active' : 'neutral'}">${escapeHtml(client.status)}</span>${client.risk === 'High' ? '<span class="risk-tag">High risk</span>' : ''}</td>
      <td><button class="row-action" data-edit-client="${escapeHtml(client.id)}">Edit</button></td>
    </tr>`).join('');

  clientEmpty.hidden = filtered.length > 0;
  $('#client-active-count').textContent = clients.filter(client => client.status === 'Active').length;
  $('#client-review-count').textContent = clients.filter(reviewDue).length;
  $('#client-risk-count').textContent = clients.filter(client => client.status === 'Active' && client.risk === 'High').length;

  $$('[data-view-client]').forEach(button => button.addEventListener('click', () => openClientProfile(button.dataset.viewClient)));
  $$('[data-edit-client]').forEach(button => button.addEventListener('click', () => openClientDialog(button.dataset.editClient)));
}

function openClientDialog(id = '') {
  clientForm.reset();
  $('#client-form-error').hidden = true;
  $('#client-id').value = '';
  $('#client-dialog-title').textContent = id ? 'Edit client' : 'Add client';
  if (id) {
    const client = clients.find(item => item.id === id);
    if (client) {
      Object.entries(client).forEach(([key, value]) => {
        const field = clientForm.elements.namedItem(key);
        if (field) field.value = value ?? '';
      });
    }
  }
  clientDialog.showModal();
}

async function saveClient(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(clientForm));
  const error = $('#client-form-error');
  error.hidden = true;
  if (!data.firstName.trim() || !data.lastName.trim() || !data.town.trim() || !data.dateOfBirth || !data.nextReview) {
    error.textContent = 'Complete all required fields before saving.';
    error.hidden = false;
    return;
  }
  const submit = clientForm.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    const id = data.id;
    const payload = await api(id ? `/api/clients/${encodeURIComponent(id)}` : '/api/clients', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    await loadClients();
    renderClients();
    clientDialog.close();
    if (selectedClientId === payload.client.id) renderClientProfile(payload.client);
  } catch (saveError) {
    error.textContent = saveError.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Save client';
  }
}

async function openClientProfile(id) {
  selectedClientId = id;
  try {
    const payload = await api(`/api/clients/${encodeURIComponent(id)}`);
    renderClientProfile(payload.client);
    await loadClientWorkspace(id);
    showClientTab('overview');
    activatePage('#client-profile-page');
    pageKicker.textContent = 'Client record';
    pageTitle.textContent = clientDisplayName(payload.client);
  } catch (error) {
    showToastError(error);
  }
}

function detailRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not recorded')}</dd></div>`;
}

function noteCard(label, value, alert = false) {
  return `<section class="note-card ${alert ? 'alert-note' : ''}"><span>${escapeHtml(label)}</span><p>${escapeHtml(value || 'Nothing recorded')}</p></section>`;
}

function renderClientProfile(client) {
  selectedClientId = client.id;
  $('#profile-avatar').textContent = initialsFromName(`${client.firstName} ${client.lastName}`);
  $('#profile-name').textContent = clientDisplayName(client);
  $('#profile-subtitle').textContent = client.carePackage || 'Care package not yet recorded';
  $('#profile-badges').innerHTML = `<span class="badge ${client.status === 'Active' ? 'success' : client.status === 'Paused' ? 'active' : 'neutral'}">${escapeHtml(client.status)}</span><span class="badge neutral">NHS ${escapeHtml(client.nhsNumber || 'not recorded')}</span>`;
  $('#profile-review').textContent = `${formatDate(client.nextReview)}${reviewDue(client) ? ' · overdue' : ''}`;
  $('#profile-risk').textContent = client.risk;
  $('#profile-personal').innerHTML = [
    detailRow('Full name', `${client.firstName} ${client.lastName}`),
    detailRow('Preferred name', client.preferredName),
    detailRow('Date of birth', formatDate(client.dateOfBirth)),
    detailRow('NHS number', client.nhsNumber),
    detailRow('Status', client.status)
  ].join('');
  $('#profile-contact').innerHTML = [
    detailRow('Address', [client.addressLine1, client.addressLine2, client.town, client.postcode].filter(Boolean).join(', ')),
    detailRow('Phone', client.phone),
    detailRow('Email', client.email)
  ].join('');
  $('#profile-people').innerHTML = [
    detailRow('GP', [client.gpName, client.gpPractice].filter(Boolean).join(' · ')),
    detailRow('GP phone', client.gpPhone),
    detailRow('Next of kin', [client.nextOfKinName, client.nextOfKinRelationship].filter(Boolean).join(' · ')),
    detailRow('Next of kin phone', client.nextOfKinPhone),
    detailRow('Emergency contact', client.emergencyContactName),
    detailRow('Emergency phone', client.emergencyContactPhone)
  ].join('');
  $('#profile-care').innerHTML = [
    noteCard('Allergies', client.allergies, Boolean(client.allergies)),
    noteCard('Communication needs', client.communicationNeeds),
    noteCard('Capacity notes', client.capacityNotes),
    noteCard('Important notes', client.importantNotes)
  ].join('');
  $('#archive-profile-client').hidden = client.status === 'Archived' || !['owner', 'manager'].includes(currentUser?.role);
}


function showClientTab(name){
  $$('[data-client-tab]').forEach(b=>b.classList.toggle('active',b.dataset.clientTab===name));
  $$('.client-tab-panel').forEach(p=>p.classList.remove('active-tab-panel'));
  $(`#client-tab-${name}`)?.classList.add('active-tab-panel');
}
async function loadClientWorkspace(id){
  const encoded=encodeURIComponent(id);
  const [plans,risks,documents]=await Promise.all([api(`/api/clients/${encoded}/care-plans`),api(`/api/clients/${encoded}/risks`),api(`/api/clients/${encoded}/documents`)]);
  carePlans=plans.carePlans||[]; clientRisks=risks.risks||[]; clientDocuments=documents.documents||[];
  renderCarePlans(); renderRisks(); renderDocuments();
}
function dueClass(date){return date && new Date(`${date}T23:59:59`)<new Date()?'date-overdue':'';}
function renderCarePlans(){
 const el=$('#care-plan-list'); if(!el)return;
 el.innerHTML=carePlans.length?carePlans.map(p=>`<article class="record-card"><header><div><p class="eyebrow">Version ${p.version}</p><h3>${escapeHtml(p.title)}</h3></div><span class="badge ${p.status==='Active'?'success':p.status==='Draft'?'active':'neutral'}">${escapeHtml(p.status)}</span></header><div class="record-meta"><span>Review: <strong class="${dueClass(p.reviewDate)}">${formatDate(p.reviewDate)}</strong></span><span>Author: ${escapeHtml(p.authorName||'Not recorded')}</span></div><p>${escapeHtml(p.desiredOutcomes||p.personalDetails||'No plan summary recorded.')}</p><div class="record-actions"><button class="row-action" data-edit-plan="${escapeHtml(p.id)}">Open / edit</button></div></article>`).join(''):'<div class="empty-records">No care plans have been created for this client.</div>';
 $$('[data-edit-plan]').forEach(b=>b.addEventListener('click',()=>openCarePlanDialog(b.dataset.editPlan)));
}
function openCarePlanDialog(id=''){const form=$('#care-plan-form');form.reset();form.elements.id.value=id;$('#care-plan-error').hidden=true;const item=carePlans.find(x=>x.id===id);$('#care-plan-dialog-title').textContent=id?'Edit care plan':'Add care plan';if(item)Object.entries(item).forEach(([k,v])=>{const f=form.elements.namedItem(k);if(f)f.value=v??'';});$('#care-plan-dialog').showModal();}
async function saveCarePlan(e){e.preventDefault();const form=e.currentTarget,data=Object.fromEntries(new FormData(form)),error=$('#care-plan-error');error.hidden=true;try{await api(data.id?`/api/care-plans/${encodeURIComponent(data.id)}`:`/api/clients/${encodeURIComponent(selectedClientId)}/care-plans`,{method:data.id?'PUT':'POST',body:JSON.stringify(data)});$('#care-plan-dialog').close();await loadClientWorkspace(selectedClientId);await loadDashboard();}catch(x){error.textContent=x.message;error.hidden=false;}}
function renderRisks(){const el=$('#risk-list');if(!el)return;el.innerHTML=clientRisks.length?clientRisks.map(r=>`<article class="record-card risk-${r.severity.toLowerCase()}"><header><div><p class="eyebrow">${escapeHtml(r.category)}</p><h3>${escapeHtml(r.title)}</h3></div><span class="badge ${r.severity==='High'?'danger':r.severity==='Medium'?'active':'success'}">${escapeHtml(r.severity)}</span></header><div class="record-meta"><span>${escapeHtml(r.likelihood)} likelihood</span><span class="${dueClass(r.reviewDate)}">Review ${formatDate(r.reviewDate)}</span><span>${escapeHtml(r.status)}</span></div><p><strong>Controls:</strong> ${escapeHtml(r.controls||'None recorded')}</p><div class="record-actions"><button class="row-action" data-edit-risk="${escapeHtml(r.id)}">Edit</button></div></article>`).join(''):'<div class="empty-records">No risk assessments have been recorded.</div>';$$('[data-edit-risk]').forEach(b=>b.addEventListener('click',()=>openRiskDialog(b.dataset.editRisk)));}
function openRiskDialog(id=''){const form=$('#risk-form');form.reset();form.elements.id.value=id;$('#risk-error').hidden=true;const item=clientRisks.find(x=>x.id===id);$('#risk-dialog-title').textContent=id?'Edit risk':'Add risk';if(item)Object.entries(item).forEach(([k,v])=>{const f=form.elements.namedItem(k);if(f)f.value=v??'';});$('#risk-dialog').showModal();}
async function saveRisk(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),error=$('#risk-error');error.hidden=true;try{await api(data.id?`/api/risks/${encodeURIComponent(data.id)}`:`/api/clients/${encodeURIComponent(selectedClientId)}/risks`,{method:data.id?'PUT':'POST',body:JSON.stringify(data)});$('#risk-dialog').close();await loadClientWorkspace(selectedClientId);await loadDashboard();}catch(x){error.textContent=x.message;error.hidden=false;}}
function renderDocuments(){const el=$('#document-list');if(!el)return;el.innerHTML=clientDocuments.length?clientDocuments.map(d=>`<article class="record-card"><header><div><p class="eyebrow">${escapeHtml(d.documentType)}</p><h3>${escapeHtml(d.name)}</h3></div><span class="badge ${d.status==='Current'?'success':'neutral'}">${escapeHtml(d.status)}</span></header><div class="record-meta"><span>Dated ${formatDate(d.documentDate)}</span>${d.reviewDate?`<span class="${dueClass(d.reviewDate)}">Review ${formatDate(d.reviewDate)}</span>`:''}</div><p>${escapeHtml(d.notes||'No notes recorded.')}</p><div class="record-actions">${d.referenceUrl?`<a class="row-action" href="${escapeHtml(d.referenceUrl)}" target="_blank" rel="noopener">Open reference</a>`:''}${['owner','manager'].includes(currentUser?.role)?`<button class="row-action" data-archive-document="${escapeHtml(d.id)}">Archive</button>`:''}</div></article>`).join(''):'<div class="empty-records">No document records have been added.</div>';$$('[data-archive-document]').forEach(b=>b.addEventListener('click',async()=>{if(confirm('Archive this document record?')){await api(`/api/documents/${encodeURIComponent(b.dataset.archiveDocument)}`,{method:'DELETE'});await loadClientWorkspace(selectedClientId);}}));}
async function saveDocument(e){e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),error=$('#document-error');error.hidden=true;try{await api(`/api/clients/${encodeURIComponent(selectedClientId)}/documents`,{method:'POST',body:JSON.stringify(data)});$('#document-dialog').close();e.currentTarget.reset();await loadClientWorkspace(selectedClientId);}catch(x){error.textContent=x.message;error.hidden=false;}}

async function archiveSelectedClient() {
  const client = clients.find(item => item.id === selectedClientId);
  if (!client) return;
  if (!window.confirm(`Archive ${client.firstName} ${client.lastName}? The record will remain available under the Archived filter.`)) return;
  try {
    await api(`/api/clients/${encodeURIComponent(selectedClientId)}`, { method: 'DELETE' });
    await loadClients();
    renderClients();
    showPage('clients');
  } catch (error) {
    showToastError(error);
  }
}

function showToastError(error) {
  window.alert(error.message || 'CoreCare could not complete the request.');
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.hidden = true;
  const data = new FormData(loginForm);
  const submit = loginForm.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    const payload = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: String(data.get('email') || '').trim().toLowerCase(), password: String(data.get('password') || '') }) });
    await showApplication(payload.user);
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in to CoreCare';
  }
});

$('#toggle-password').addEventListener('click', event => {
  const field = $('#password');
  const reveal = field.type === 'password';
  field.type = reveal ? 'text' : 'password';
  event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
});

$('#sign-out').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  showLogin();
});

menuButton.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});

$$('.nav-item').forEach(button => button.addEventListener('click', () => {
  $$('.nav-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  sidebar.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  showPage(button.dataset.page);
}));

$$('[data-page-link]').forEach(button => button.addEventListener('click', () => $(`[data-page="${button.dataset.pageLink}"]`).click()));
$('[data-return-dashboard]').addEventListener('click', () => $('[data-page="dashboard"]').click());
$('#add-client').addEventListener('click', () => openClientDialog());
$('#add-staff').addEventListener('click', () => openStaffDialog());
$('#close-staff-dialog').addEventListener('click', () => staffDialog.close());
$('#cancel-staff').addEventListener('click', () => staffDialog.close());
$('#staff-search').addEventListener('input', renderStaff);
$('#staff-status-filter').addEventListener('change', renderStaff);
staffForm.addEventListener('submit', saveStaff);
$('#quick-add').addEventListener('click', () => quickAddDialog.showModal());
$('#close-quick-add').addEventListener('click', () => quickAddDialog.close());
$$('[data-quick]').forEach(button => button.addEventListener('click', () => {
  quickAddDialog.close();
  if (button.dataset.quick === 'client') { $('[data-page="clients"]').click(); openClientDialog(); }
  if (button.dataset.quick === 'staff') { $('[data-page="staff"]').click(); openStaffDialog(); }
}));
$('#close-client-dialog').addEventListener('click', () => clientDialog.close());
$('#cancel-client').addEventListener('click', () => clientDialog.close());
clientSearch.addEventListener('input', renderClients);
clientStatusFilter.addEventListener('change', renderClients);
clientForm.addEventListener('submit', saveClient);
$('#back-to-clients').addEventListener('click', () => $('[data-page="clients"]').click());
$('#edit-profile-client').addEventListener('click', () => openClientDialog(selectedClientId));
$('#archive-profile-client').addEventListener('click', archiveSelectedClient);

$$('[data-client-tab]').forEach(button => button.addEventListener('click', () => showClientTab(button.dataset.clientTab)));
$('#add-care-plan').addEventListener('click', () => openCarePlanDialog());
$('#close-care-plan-dialog').addEventListener('click', () => $('#care-plan-dialog').close());
$('#cancel-care-plan').addEventListener('click', () => $('#care-plan-dialog').close());
$('#care-plan-form').addEventListener('submit', saveCarePlan);
$('#add-risk').addEventListener('click', () => openRiskDialog());
$('#close-risk-dialog').addEventListener('click', () => $('#risk-dialog').close());
$('#cancel-risk').addEventListener('click', () => $('#risk-dialog').close());
$('#risk-form').addEventListener('submit', saveRisk);
$('#add-document').addEventListener('click', () => $('#document-dialog').showModal());
$('#close-document-dialog').addEventListener('click', () => $('#document-dialog').close());
$('#cancel-document').addEventListener('click', () => $('#document-dialog').close());
$('#document-form').addEventListener('submit', saveDocument);

function openPasswordDialog(required = false) {
  passwordForm.reset();
  $('#password-error').hidden = true;
  passwordDialog.dataset.required = required ? 'true' : 'false';
  $('#cancel-password').hidden = required;
  passwordDialog.showModal();
}

$('#open-password').addEventListener('click', () => openPasswordDialog(false));
$('#cancel-password').addEventListener('click', () => passwordDialog.close());
passwordDialog.addEventListener('cancel', event => { if (passwordDialog.dataset.required === 'true') event.preventDefault(); });
passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(passwordForm));
  const error = $('#password-error');
  error.hidden = true;
  if (data.newPassword !== data.confirmPassword) {
    error.textContent = 'The new passwords do not match.';
    error.hidden = false;
    return;
  }
  try {
    await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify(data) });
    currentUser.mustChangePassword = false;
    passwordDialog.close();
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  }
});

async function loadSettings() {
  if (!currentUser) return;
  $('#organisation-input').value = currentUser.organisationName || '';
  $('#add-user').hidden = currentUser.role !== 'owner';
  try {
    const payload = await api('/api/users');
    users = payload.users || [];
    renderUsers();
    await loadAudit();
  } catch (error) {
    $('#user-table-body').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderUsers() {
  const own = currentUser?.id;
  $('#user-table-body').innerHTML = users.map(user => `<tr><td><div class="client-person"><span class="person-avatar">${initialsFromName(user.displayName)}</span><div><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.email)}${user.mustChangePassword ? ' · password change required' : ''}</span></div></div></td><td>${escapeHtml(roleLabel(user.role))}</td><td><span class="badge ${user.status === 'active' ? 'success' : 'neutral'}">${escapeHtml(user.status)}</span></td><td>${user.lastLoginAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(user.lastLoginAt)) : 'Never'}</td><td>${currentUser.role === 'owner' && user.id !== own ? `<button class="row-action" data-edit-user="${escapeHtml(user.id)}">Edit</button>` : ''}</td></tr>`).join('');
  $$('[data-edit-user]').forEach(button => button.addEventListener('click', () => openUserDialog(button.dataset.editUser)));
}

function openUserDialog(id = '') {
  userForm.reset();
  $('#user-form-error').hidden = true;
  userForm.elements.id.value = id;
  const editing = Boolean(id);
  const user = users.find(item => item.id === id);
  $('#user-dialog-title').textContent = editing ? 'Edit user' : 'Add user';
  userForm.elements.email.disabled = editing;
  userForm.elements.status.disabled = !editing;
  $('#temporary-password-label').hidden = editing;
  if (user) {
    userForm.elements.displayName.value = user.displayName;
    userForm.elements.email.value = user.email;
    userForm.elements.role.value = user.role;
    userForm.elements.status.value = user.status;
  }
  userDialog.showModal();
}

$('#add-user').addEventListener('click', () => openUserDialog());
$('#close-user-dialog').addEventListener('click', () => userDialog.close());
$('#cancel-user').addEventListener('click', () => userDialog.close());
userForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(userForm));
  const error = $('#user-form-error');
  error.hidden = true;
  try {
    if (data.id) await api(`/api/users/${encodeURIComponent(data.id)}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/users', { method: 'POST', body: JSON.stringify(data) });
    userDialog.close();
    await loadSettings();
  } catch (exception) {
    error.textContent = exception.message;
    error.hidden = false;
  }
});

$('#organisation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#organisation-input').value.trim();
  const message = $('#organisation-message');
  message.hidden = true;
  try {
    const payload = await api('/api/organisation', { method: 'PUT', body: JSON.stringify({ name }) });
    currentUser.organisationName = payload.organisation.name;
    updateIdentity();
    message.textContent = 'Organisation name saved.';
    message.hidden = false;
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
});

async function loadAudit() {
  const payload = await api('/api/audit?limit=30');
  $('#audit-list').innerHTML = (payload.events || []).map(event => `<div><time>${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${event.created_at}Z`))}</time><div><strong>${escapeHtml(event.action.replaceAll('.', ' '))}</strong><span>${escapeHtml(event.user_name || event.user_email || 'System')} · ${escapeHtml(event.entity_type)}</span></div></div>`).join('') || '<p>No audit events yet.</p>';
}

$('#refresh-audit').addEventListener('click', loadAudit);
restoreSession();
