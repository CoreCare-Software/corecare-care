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
const careClientPickerDialog = $('#care-client-picker-dialog');
let staff = [];
let carePlans = [];
let allCarePlans = [];
let clientRisks = [];
let clientDocuments = [];

const labels = {
  family: ['Family portal', 'Secure family access, updates and messaging will be introduced in a later milestone.'],
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
let customRoles = [];
let permissionCatalogue = [];
let selectedClientId = null;
let branches = [];
let organisations = [];
let platformData = null;
let customerSuccessData = null;

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
  return ({ platform_owner:'Platform owner',platform_admin:'Platform admin',organisation_owner:'Organisation owner',organisation_admin:'Organisation admin',branch_manager:'Branch manager',senior_carer:'Senior carer',carer:'Carer',office_staff:'Office staff',auditor:'Read-only auditor',family:'Family member',owner:'Organisation owner',manager:'Manager' })[role] || 'CoreCare user';
}

function updateIdentity() {
  const name = currentUser?.displayName || 'CoreCare user';
  pageTitle.textContent = `Good afternoon, ${name.split(' ')[0]}`;
  $('#user-name').textContent = name;
  $('#user-role').textContent = roleLabel(currentUser?.accessLevel || currentUser?.role);
  $('#user-avatar').textContent = initialsFromName(name);
  $('#organisation-name').textContent = `${currentUser?.organisationName || 'Organisation'}${currentUser?.branchName ? ' · '+currentUser.branchName : ''}`;
  const platformUser = Boolean(currentUser?.isPlatformUser);
  const platformWorkspace = platformUser && !currentUser?.supportMode;
  $('#platform-nav').hidden = !platformUser || currentUser?.supportMode;
  $('#platform-nav-section').hidden = !platformUser || currentUser?.supportMode;
  $$('.organisation-workspace-nav').forEach(item => item.hidden = platformWorkspace);
  $$('.organisation-workspace-action').forEach(item => item.hidden = platformWorkspace);
  const supportBanner=$('#support-mode-banner');
  if(supportBanner){
    const inSupport=platformUser&&currentUser?.supportMode;
    supportBanner.hidden=!inSupport;
    if(inSupport){
      $('#support-mode-org').textContent=currentUser?.organisationName||'organisation';
      $('#support-mode-user').textContent=currentUser?.displayName||'Platform user';
      $('#support-mode-access').textContent=currentUser?.supportAccessMode==='read_only'?'Read-only support':'Full support';
      $('#support-mode-reason').textContent=currentUser?.supportReason||'Support request';
      $('#support-mode-started').textContent=currentUser?.supportStartedAt?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${currentUser.supportStartedAt}Z`)):'Now';
    }
  }
  document.body.classList.toggle('platform-workspace', platformWorkspace);
}

async function showApplication(user) {
  currentUser = user || currentUser;
  loginView.hidden = true;
  appView.hidden = false;
  setDate();
  updateIdentity();
  const platformWorkspace = currentUser?.isPlatformUser && !currentUser?.supportMode;
  if (platformWorkspace) {
    $$('.nav-item').forEach(item => item.classList.remove('active'));
    $('#platform-nav')?.classList.add('active');
    showPage('platform');
  } else {
    await Promise.all([loadClients(), loadStaff(), loadDashboard()]);
    renderClients();
    renderStaff();
    await loadDevelopmentStatus();
    showPage('dashboard');
  }
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
  const page = $(id);
  if (!page) throw new Error(`CoreCare page is unavailable: ${id}`);
  page.classList.add('active-page');
}

function showPage(page) {
  selectedClientId = page === 'client-profile' ? selectedClientId : null;
  if (page === 'platform') {
    if (!currentUser?.isPlatformUser) return showPage('dashboard');
    activatePage('#platform-page');
    pageKicker.textContent = 'Platform owner';
    pageTitle.textContent = 'Platform administration';
    loadPlatformWorkspace().catch(showToastError);
    return;
  }
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
  if (page === 'care') {
    activatePage('#care-page');
    pageKicker.textContent = 'Care delivery';
    pageTitle.textContent = 'Care plans';
    loadAllCarePlans().catch(showToastError);
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



async function loadPlatformWorkspace(){
  const modules = [
    ['Executive dashboard', '#executive-greeting', loadPlatformDashboard],
    ['Revenue Centre', '#revenue-centre', loadRevenueCentre],
    ['Customer Success Centre', '#customer-success-centre', loadCustomerSuccess],
    ['Notifications', '#platform-notifications', loadPlatformNotifications],
    ['Platform health', '#platform-health', loadPlatformHealth],
    ['Plans', '#platform-plans', loadPlatformPlans],
    ['Audit', '#platform-audit-table', loadPlatformAudit],
    ['Platform users', '#platform-users', loadPlatformUsers]
  ];
  const results = await Promise.allSettled(
    modules.filter(([, selector]) => Boolean($(selector))).map(async ([name,, loader]) => {
      try { await loader(); }
      catch (error) { error.message = `${name}: ${error.message}`; throw error; }
    })
  );
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) {
    console.error('CoreCare platform module failures', failures.map(x => x.reason));
    showToastError(new Error(failures.map(x => x.reason?.message || 'Module failed').join(' · ')));
  }
}

async function loadPlatformDashboard(){
  const payload=await api('/api/platform/dashboard');
  platformData=payload;
  const s=payload.summary||{}, f=payload.financials||{}, c=payload.customerSuccess||{};
  const money=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(pence||0)/100);
  const hour=new Date().getHours(), greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  $('#executive-greeting').textContent=`${greeting}, ${currentUser?.displayName?.split(' ')[0]||'Christopher'}`;
  $('#executive-briefing').textContent=payload.briefing?.headline||'Your CoreCare platform is ready.';
  $('#executive-mrr').textContent=money(f.mrrPence); $('#executive-arr').textContent=money(f.arrPence);
  $('#platform-org-count').textContent=s.organisations||0; $('#platform-active-orgs').textContent=s.activeOrganisations||0; $('#platform-suspended-orgs').textContent=s.suspendedOrganisations||0;
  $('#platform-user-count').textContent=s.users||0; $('#executive-active-users').textContent=s.activeUsers30d||0;
  $('#executive-customer-health').textContent=`${Math.round(c.averageHealth||0)}%`; $('#executive-attention-count').textContent=c.needsAttention||0;
  $('#executive-renewals-count').textContent=(payload.renewals||[]).length;
  $('#executive-health-score').textContent=(payload.operations?.overall||'Healthy'); $('#executive-health-copy').textContent=`${payload.operations?.errors24h||0} errors in the last 24 hours`;
  $('#executive-brief-list').innerHTML=(payload.briefing?.items||[]).map(x=>`<div class="brief-item ${escapeHtml(x.tone||'neutral')}"><span>${escapeHtml(x.icon||'•')}</span><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.detail||'')}</small></div></div>`).join('')||'<p class="muted">No briefing items.</p>';
  $('#executive-risk-badge').textContent=c.needsAttention||0;
  $('#executive-risk-list').innerHTML=(payload.atRiskOrganisations||[]).map(o=>`<div class="platform-result"><div><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(o.reason)} · Health ${o.health_score}%</small></div><button class="row-action" data-platform-manage-org="${escapeHtml(o.id)}">Review</button></div>`).join('')||'<p class="muted">No organisations currently need attention.</p>';
  $('#executive-renewals').innerHTML=(payload.renewals||[]).map(o=>`<div class="platform-result"><div><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(o.plan_name||o.subscription_plan)} · ${escapeHtml(o.renewal_date)}</small></div><span class="badge neutral">${o.days_until} days</span></div>`).join('')||'<p class="muted">No renewals in the next 30 days.</p>';
  $('#platform-activity').innerHTML=(payload.activity||[]).map(event=>`<div><span class="timeline-dot"></span><div><strong>${escapeHtml((event.action||'activity').replaceAll('.',' '))}</strong><p>${escapeHtml(event.organisation_name||'Organisation')} · ${escapeHtml(event.user_name||'System')}</p><time>${new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${event.created_at}Z`))}</time></div></div>`).join('')||'<div><p>No platform activity yet.</p></div>';
  renderPlatformOrganisations();
  $$('[data-platform-manage-org]').forEach(button=>button.addEventListener('click',()=>managePlatformOrganisation(button.dataset.platformManageOrg)));
}


let revenueData=null;
const formatRevenueMoney=pence=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(pence||0)/100);
async function loadRevenueCentre(){
  if (!$('#revenue-centre')) return;
  const p=await api('/api/platform/revenue'); revenueData=p; const m=p.metrics||{};
  $('#revenue-mrr').textContent=formatRevenueMoney(m.mrrPence); $('#revenue-arr').textContent=formatRevenueMoney(m.arrPence); $('#revenue-new-mrr').textContent=formatRevenueMoney(m.newMrrPence); $('#revenue-lost-mrr').textContent=formatRevenueMoney(m.lostMrrPence); $('#revenue-arpo').textContent=formatRevenueMoney(m.averageRevenuePence); $('#revenue-renewal-value').textContent=formatRevenueMoney(m.renewal90Pence);
  const trend=p.trend||[], max=Math.max(1,...trend.map(x=>Number(x.mrrPence||0)));
  $('#revenue-trend').innerHTML=trend.map(x=>`<div class="revenue-bar-column"><div class="revenue-bar-value">${formatRevenueMoney(x.mrrPence)}</div><div class="revenue-bar-track"><div class="revenue-bar" style="height:${Math.max(4,Math.round(Number(x.mrrPence||0)/max*100))}%"></div></div><strong>${escapeHtml(x.label)}</strong><small>${x.organisations} org${x.organisations===1?'':'s'}</small></div>`).join('');
  const total=Math.max(1,Number(m.mrrPence||0)); $('#revenue-plan-mix').innerHTML=(p.planBreakdown||[]).map(x=>`<div class="plan-mix-row"><div><strong>${escapeHtml(x.name)}</strong><small>${x.organisations} organisation${x.organisations===1?'':'s'} · ${formatRevenueMoney(x.mrrPence)}</small></div><div class="mix-track"><span style="width:${Math.round(Number(x.mrrPence||0)/total*100)}%"></span></div></div>`).join('')||'<p class="muted">No billable plans yet.</p>';
  $('#revenue-renewals').innerHTML=(p.renewals||[]).map(o=>`<tr><td><strong>${escapeHtml(o.name)}</strong></td><td>${escapeHtml(o.plan_name||o.subscription_plan||'Unassigned')}</td><td>${new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(`${o.renewal_date}T00:00:00Z`))}</td><td><span class="badge ${o.daysUntil<=30?'warning':'neutral'}">${o.daysUntil}</span></td><td>${formatRevenueMoney(o.monthly_price_pence)}</td></tr>`).join('')||'<tr><td colspan="5">No upcoming renewals recorded.</td></tr>';
  $('#revenue-commercial-summary').innerHTML=[['Billable organisations',m.billableOrganisations||0],['Net MRR movement',formatRevenueMoney(m.netMovementPence)],['Renewals within 30 days',formatRevenueMoney(m.renewal30Pence)],['Renewals within 90 days',formatRevenueMoney(m.renewal90Pence)],['Last calculated',new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.generatedAt))]].map(([k,v])=>`<div class="health-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
}
function exportRevenueCsv(){if(!revenueData)return;const lines=[['Organisation','Status','Subscription status','Plan','Monthly revenue','Renewal date'],...(revenueData.organisations||[]).map(o=>[o.name,o.status,o.subscription_status||'',o.plan_name||o.subscription_plan||'',(Number(o.monthly_price_pence||0)/100).toFixed(2),o.renewal_date||''])];const csv=lines.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`corecare-revenue-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);}



async function loadCustomerSuccess(){
  if (!$('#customer-success-centre')) return;
  const p=await api('/api/platform/customer-success');customerSuccessData=p;const s=p.summary||{};
  $('#success-average').textContent=`${s.averageHealth||0}%`;$('#success-healthy').textContent=s.healthy||0;$('#success-attention').textContent=s.attention||0;$('#success-risk').textContent=s.risk||0;$('#success-adoption').textContent=`${s.averageAdoption||0}%`;
  renderCustomerSuccess();
}
function renderCustomerSuccess(){
  if(!customerSuccessData)return;const filter=$('#success-filter')?.value||'all';const rows=(customerSuccessData.organisations||[]).filter(o=>filter==='all'||o.health_band===filter);
  $('#success-table').innerHTML=rows.map(o=>`<tr><td><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(o.plan_name||'Unassigned')}</small></td><td><span class="health-score ${o.health_band}">${o.health_score}%</span></td><td><span class="trend ${o.trend}">${o.trend==='up'?'↑ Improving':o.trend==='down'?'↓ Declining':'→ Stable'}</span></td><td>${o.adoption_score}%<small>${o.active_users_30d||0}/${o.user_count||0} active</small></td><td>${o.days_inactive>365?'Never':o.days_inactive+' days ago'}</td><td>${o.support_90d||0} / 90d</td><td><button class="row-action" data-success-org="${escapeHtml(o.id)}">Review</button></td></tr>`).join('')||'<tr><td colspan="7">No organisations match this filter.</td></tr>';
  $$('[data-success-org]').forEach(b=>b.addEventListener('click',()=>showCustomerSuccessDetail(b.dataset.successOrg)));
  if(rows[0])showCustomerSuccessDetail(rows[0].id);
}
function showCustomerSuccessDetail(id){const o=(customerSuccessData?.organisations||[]).find(x=>x.id===id);if(!o)return;$('#success-detail').innerHTML=`<div class="success-detail-head"><div><strong>${escapeHtml(o.name)}</strong><span class="health-score ${o.health_band}">${o.health_score}%</span></div><small>${escapeHtml(o.plan_name||'Unassigned')} · ${o.client_count||0} clients · ${o.branch_count||0} branches</small></div><h4>Risk signals</h4><ul>${(o.reasons||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No immediate risk signals.</li>'}</ul><h4>Success recommendations</h4><ol>${(o.recommendations||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol><h4>Module adoption</h4><div class="module-tags">${(o.module_usage||[]).map(x=>`<span>${escapeHtml(x.name)} <b>${x.count}</b></span>`).join('')||'<span>No recent module activity</span>'}</div><button class="primary-button compact" data-platform-manage-org="${escapeHtml(o.id)}">Open Organisation 360</button>`;$('#success-detail [data-platform-manage-org]')?.addEventListener('click',()=>managePlatformOrganisation(o.id));}

async function loadPlatformNotifications(){const p=await api('/api/platform/notifications');const rows=p.notifications||[];$('#platform-notification-count').textContent=rows.length;$('#platform-notifications').innerHTML=rows.slice(0,8).map(n=>`<div class="platform-result ${escapeHtml(n.type||'')}"><div><strong>${escapeHtml(n.title)}</strong><small>${escapeHtml(n.message||'')}</small></div></div>`).join('')||'<p class="muted">No platform alerts.</p>';}
async function loadPlatformHealth(){const h=await api('/api/platform/system-health');$('#platform-health-badge').textContent=h.database==='healthy'?'Healthy':'Attention';$('#platform-health').innerHTML=[['Database',h.database],['Worker',h.workerVersion],['Active sessions',h.activeSessions],['Errors (24h)',h.errors24h],['Audit events (24h)',h.auditEvents24h],['Checked',new Intl.DateTimeFormat('en-GB',{timeStyle:'short'}).format(new Date(h.checkedAt))]].map(([k,v])=>`<div class="health-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');}
async function loadPlatformPlans(){const p=await api('/api/platform/plans');$('#platform-plans').innerHTML=(p.plans||[]).map(x=>`<div class="plan-row"><div><strong>${escapeHtml(x.name)}</strong><small>${x.max_users||'Unlimited'} users · ${x.max_clients||'Unlimited'} clients</small></div><span class="plan-price">${Number(x.monthly_price_pence||0)===0?'Free':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(x.monthly_price_pence)/100)+'/mo'}</span></div>`).join('')||'<p class="muted">No plans configured.</p>';}
async function loadPlatformAudit(){const p=await api('/api/platform/audit?limit=50');$('#platform-audit-table').innerHTML=(p.events||[]).map(e=>`<tr><td>${new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(`${e.created_at}Z`))}</td><td>${escapeHtml(e.organisation_name||'')}</td><td>${escapeHtml(e.user_name||'System')}</td><td>${escapeHtml((e.action||'').replaceAll('.',' '))}</td><td>${escapeHtml(e.entity_type||'')}</td></tr>`).join('')||'<tr><td colspan="5">No audit activity.</td></tr>';}
async function loadPlatformUsers(){const p=await api('/api/platform/users');$('#platform-users').innerHTML=(p.users||[]).map(u=>`<div class="platform-result"><div><strong>${escapeHtml(u.display_name)}</strong><small>${escapeHtml(u.email)} · ${escapeHtml(roleLabel(u.access_level))}</small></div><span class="badge ${u.status==='active'?'success':'neutral'}">${escapeHtml(u.status)}</span></div>`).join('')||'<p class="muted">No platform users.</p>';}
let platformSearchTimer;
async function runPlatformSearch(){const q=$('#platform-global-search')?.value.trim()||'';if(q.length<2){$('#platform-search-results').innerHTML='<p class="muted">Enter at least 2 characters.</p>';return;}const p=await api(`/api/platform/search?q=${encodeURIComponent(q)}`);$('#platform-search-results').innerHTML=(p.results||[]).map(r=>`<div class="platform-result"><div><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.type)} · ${escapeHtml(r.organisation_name)}${r.branch_name?' · '+escapeHtml(r.branch_name):''}</small></div><button class="row-action" data-search-open-org="${escapeHtml(r.organisation_id)}">Open organisation</button></div>`).join('')||'<p class="muted">No matching records.</p>';$$('[data-search-open-org]').forEach(b=>b.addEventListener('click',()=>openPlatformOrganisation(b.dataset.searchOpenOrg)));}

function renderPlatformOrganisations(){
  const query=($('#platform-org-search')?.value||'').trim().toLowerCase();
  const status=$('#platform-org-status')?.value||'all';
  const rows=(platformData?.organisations||[]).filter(o=>(status==='all'||o.status===status)&&`${o.name} ${o.subscription_plan}`.toLowerCase().includes(query));
  $('#platform-org-empty').hidden=rows.length>0;
  const money=p=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(p||0)/100);
  $('#platform-org-table').innerHTML=rows.map(o=>`<tr><td><strong>${escapeHtml(o.name)}</strong><small class="table-subtext">${escapeHtml(o.slug||'')}</small></td><td>${escapeHtml(o.plan_name||o.subscription_plan||'Development')}</td><td>${money(o.monthly_price_pence)}</td><td><span class="health-score ${o.health_score<60?'danger':o.health_score<80?'warning':'success'}">${o.health_score}%</span></td><td>${o.user_count||0}</td><td>${o.client_count||0}</td><td>${o.last_activity_at?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(`${o.last_activity_at}Z`)):'No activity'}</td><td><div class="row-actions"><button class="row-action" data-platform-manage-org="${escapeHtml(o.id)}">360°</button><button class="row-action" data-platform-open-org="${escapeHtml(o.id)}">Support</button></div></td></tr>`).join('');
  $$('[data-platform-open-org]').forEach(button=>button.addEventListener('click',()=>openPlatformOrganisation(button.dataset.platformOpenOrg)));
  $$('[data-platform-manage-org]').forEach(button=>button.addEventListener('click',()=>managePlatformOrganisation(button.dataset.platformManageOrg)));
}
let selectedPlatformOrganisationId=null;
async function openPlatformOrganisation(organisationId,accessMode='full'){
  const row=(platformData?.organisations||[]).find(o=>o.id===organisationId);
  const reason=prompt(`Enter the reason for accessing ${row?.name||'this organisation'}:`,'Customer support request');
  if(!reason) return;
  await api('/api/platform/switch-organisation',{method:'POST',body:JSON.stringify({organisationId,reason,accessMode})});
  location.reload();
}
async function managePlatformOrganisation(organisationId){
  const dialog=$('#platform-organisation-dialog'), profileName=$('#platform-org-profile-name'), profileContent=$('#platform-org-profile-content');
  if(!dialog||!profileName||!profileContent) throw new Error('Organisation 360 is unavailable in this deployment. Refresh the browser after deploying the latest public assets.');
  selectedPlatformOrganisationId=organisationId;
  const p=await api(`/api/platform/organisations/${encodeURIComponent(organisationId)}`),o=p.organisation;
  profileName.textContent=o.name;
  const flags=Object.entries(o.featureFlags||{}).filter(([,v])=>v).map(([k])=>k.replaceAll('_',' '));
  const healthTone=o.health_score<60?'danger':o.health_score<80?'warning':'success';
  const usagePct=o.max_users?Math.min(100,Math.round((Number(o.user_count||0)/Number(o.max_users))*100)):0;
  const clientPct=o.max_clients?Math.min(100,Math.round((Number(o.client_count||0)/Number(o.max_clients))*100)):0;
  const activity=(p.activity||[]).map(x=>`<div class="org360-event"><span class="timeline-dot"></span><div><strong>${escapeHtml((x.action||'activity').replaceAll('.',' '))}</strong><small>${escapeHtml(x.user_name||'System')} · ${escapeHtml(x.entity_type||'record')}</small></div><time>${x.created_at?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${x.created_at}Z`)):''}</time></div>`).join('')||'<p class="muted">No recent activity.</p>';
  profileContent.innerHTML=`
  <section class="org360-hero span-two"><div class="org-brand-swatch" style="--org-colour:${escapeHtml(o.primary_colour||'#1f6f5f')}">${o.logo_url?`<img src="${escapeHtml(o.logo_url)}" alt="">`:initialsFromName(o.name)}</div><div class="org360-title"><div><span class="badge ${o.status==='active'?'success':'danger'}">${escapeHtml(o.status)}</span><span class="health-score ${healthTone}">${o.health_score}% health</span></div><h3>${escapeHtml(o.name)}</h3><p>${escapeHtml(o.contact_email||'No contact email')} · ${escapeHtml(o.contact_phone||'No phone')} ${o.website?'· '+escapeHtml(o.website):''}</p></div><div class="org360-commercial"><small>Monthly recurring revenue</small><strong>${money(o.monthly_price_pence||0)}</strong><span>${escapeHtml(o.plan_name||o.subscription_plan||'Development')} plan</span></div></section>
  <nav class="org360-tabs span-two" aria-label="Organisation 360 sections">${[['overview','Overview'],['people','People & branches'],['commercial','Commercial'],['security','Security'],['support','Support'],['activity','Activity']].map(([id,label],i)=>`<button type="button" class="${i===0?'active':''}" data-org360-tab="${id}">${label}</button>`).join('')}</nav>
  <div class="org360-panel span-two" data-org360-panel="overview">
    <section class="org-profile-stats"><div><span>Clients</span><strong>${o.client_count||0}</strong></div><div><span>Staff</span><strong>${o.staff_count||0}</strong></div><div><span>Users</span><strong>${o.user_count||0}</strong></div><div><span>Branches</span><strong>${o.branch_count||0}</strong></div><div><span>Care plans</span><strong>${o.active_care_plans||0}</strong></div><div><span>Documents</span><strong>${o.document_count||0}</strong></div></section>
    <div class="org360-grid"><section class="org-profile-detail"><h3>Customer health</h3><div class="org360-health"><strong class="health-score ${healthTone}">${o.health_score}%</strong><span>${escapeHtml(o.health_band||'healthy')}</span></div><ul>${(o.health_reasons||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>No immediate concerns detected.</li>'}</ul></section><section class="org-profile-detail"><h3>Operational attention</h3><div class="attention-metrics"><div><span>Overdue reviews</span><strong>${o.overdue_care_plans||0}</strong></div><div><span>High risks</span><strong>${o.high_risks||0}</strong></div><div><span>Active users (30d)</span><strong>${o.active_users_30d||0}</strong></div><div><span>Last activity</span><strong>${o.last_activity_at?formatDate(o.last_activity_at.slice(0,10)):'None'}</strong></div></div></section></div>
    <section class="org-profile-detail"><h3>Enabled modules</h3><div class="feature-chip-list">${flags.map(x=>`<span>${escapeHtml(x)}</span>`).join('')||'<span>Core modules</span>'}</div></section>
  </div>
  <div class="org360-panel span-two" data-org360-panel="people" hidden><div class="org360-grid"><section class="org-profile-detail"><h3>Branches</h3>${(p.branches||[]).map(b=>`<div class="support-history-row"><div><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.code||'No code')} · ${b.user_count||0} users · ${b.client_count||0} clients</small></div><span class="badge ${b.status==='active'?'success':'neutral'}">${escapeHtml(b.status)}</span></div>`).join('')||'<p>No branches.</p>'}</section><section class="org-profile-detail"><h3>Users</h3>${(p.users||[]).slice(0,20).map(u=>`<div class="support-history-row"><div><strong>${escapeHtml(u.display_name)}</strong><small>${escapeHtml(u.email)} · ${escapeHtml(roleLabel(u.access_level))}${u.branch_name?' · '+escapeHtml(u.branch_name):''}</small></div><span class="badge ${u.status==='active'?'success':'neutral'}">${escapeHtml(u.status)}</span></div>`).join('')||'<p>No users.</p>'}</section></div></div>
  <div class="org360-panel span-two" data-org360-panel="commercial" hidden><div class="org360-grid"><section class="org-profile-detail"><h3>Subscription & licence</h3><p><b>${escapeHtml(o.plan_name||o.subscription_plan||'Development')}</b> · ${escapeHtml(o.subscription_status||'active')}</p><p>Renewal ${formatDate(o.renewal_date)||'Not set'}</p><div class="licence-meter"><span>Users ${o.user_count||0}/${o.max_users||'∞'}</span><i><b style="width:${usagePct}%"></b></i></div><div class="licence-meter"><span>Clients ${o.client_count||0}/${o.max_clients||'∞'}</span><i><b style="width:${clientPct}%"></b></i></div></section><section class="org-profile-detail"><h3>Revenue history</h3>${(p.revenueEvents||[]).map(r=>`<div class="support-history-row"><div><strong>${escapeHtml((r.event_type||'event').replaceAll('_',' '))}</strong><small>${escapeHtml(r.description||'')}</small></div><span>${money(r.amount_pence||0)}</span></div>`).join('')||'<p>No revenue events recorded.</p>'}</section></div></div>
  <div class="org360-panel span-two" data-org360-panel="security" hidden><div class="org360-grid"><section class="org-profile-detail"><h3>Security policy</h3>${p.securityPolicy?`<div class="attention-metrics"><div><span>MFA required</span><strong>${p.securityPolicy.require_mfa?'Yes':'No'}</strong></div><div><span>Session timeout</span><strong>${p.securityPolicy.session_timeout_minutes||'Default'} min</strong></div><div><span>Password length</span><strong>${p.securityPolicy.minimum_password_length||'Default'}</strong></div><div><span>Emergency mode</span><strong>${p.securityPolicy.emergency_mode?'Active':'Off'}</strong></div></div>`:'<p>No custom security policy.</p>'}</section><section class="org-profile-detail"><h3>Recent logins</h3>${(p.loginHistory||[]).slice(0,12).map(l=>`<div class="support-history-row"><div><strong>${escapeHtml(l.display_name||l.email||'User')}</strong><small>${escapeHtml(l.ip_address||'Unknown IP')} · ${escapeHtml(l.result||l.status||'attempt')}</small></div><time>${l.created_at?formatDate(l.created_at.slice(0,10)):''}</time></div>`).join('')||'<p>No login history.</p>'}</section></div></div>
  <div class="org360-panel span-two" data-org360-panel="support" hidden><div class="org360-grid"><section class="org-profile-detail"><h3>Support history</h3>${(p.supportHistory||[]).map(x=>`<div class="support-history-row"><div><strong>${escapeHtml(x.display_name||'Platform user')}</strong><small>${escapeHtml(x.reason)} · ${escapeHtml(x.access_mode)}</small></div><time>${formatDate(x.started_at?.slice(0,10))}</time></div>`).join('')||'<p>No support sessions recorded.</p>'}</section><section class="org-profile-detail"><h3>Customer success notes</h3>${(p.successNotes||[]).map(x=>`<div class="support-history-row"><div><strong>${escapeHtml(x.note_type||'Note')}</strong><small>${escapeHtml(x.note||x.content||'')} · ${escapeHtml(x.author_name||'Platform')}</small></div><time>${formatDate(x.created_at?.slice(0,10))}</time></div>`).join('')||'<p>No success notes recorded.</p>'}</section></div></div>
  <div class="org360-panel span-two" data-org360-panel="activity" hidden><section class="org-profile-detail"><h3>Recent organisation activity</h3><div class="org360-activity">${activity}</div></section></div>`;
  $$('[data-org360-tab]').forEach(button=>button.addEventListener('click',()=>{$$('[data-org360-tab]').forEach(x=>x.classList.toggle('active',x===button));$$('[data-org360-panel]').forEach(x=>x.hidden=x.dataset.org360Panel!==button.dataset.org360Tab);}));
  if(typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
}
async function loadAllCarePlans() {
  const payload = await api('/api/care-plans');
  allCarePlans = payload.carePlans || [];
  renderAllCarePlans();
}

function carePlanDueState(date) {
  if (!date) return 'none';
  const today = new Date(); today.setHours(0,0,0,0);
  const review = new Date(`${date}T00:00:00`);
  const inThirty = new Date(today); inThirty.setDate(inThirty.getDate()+30);
  if (review < today) return 'overdue';
  if (review <= inThirty) return 'due';
  return 'current';
}

function renderAllCarePlans() {
  const query = ($('#care-search')?.value || '').trim().toLowerCase();
  const status = $('#care-status-filter')?.value || 'all';
  const visible = allCarePlans.filter(plan => (status === 'all' || plan.status === status) && `${plan.clientName} ${plan.title} ${plan.authorName}`.toLowerCase().includes(query));
  const active = allCarePlans.filter(plan => plan.status === 'Active');
  $('#care-active-count').textContent = active.length;
  $('#care-due-count').textContent = active.filter(plan => carePlanDueState(plan.reviewDate) === 'due').length;
  $('#care-overdue-count').textContent = active.filter(plan => carePlanDueState(plan.reviewDate) === 'overdue').length;
  const list = $('#care-overview-list');
  const empty = $('#care-overview-empty');
  empty.hidden = visible.length > 0;
  list.innerHTML = visible.map(plan => {
    const due = carePlanDueState(plan.reviewDate);
    const dueLabel = due === 'overdue' ? 'Overdue' : due === 'due' ? 'Due soon' : 'Current';
    return `<article class="care-overview-row">
      <button class="care-client-link" data-open-care-client="${escapeHtml(plan.clientId)}">
        <span class="person-avatar">${escapeHtml(initialsFromName(plan.clientName))}</span>
        <span><strong>${escapeHtml(plan.clientName)}</strong><small>${escapeHtml(plan.title)}</small></span>
      </button>
      <span><small>Status</small><strong>${escapeHtml(plan.status)}</strong></span>
      <span><small>Version</small><strong>${escapeHtml(plan.version)}</strong></span>
      <span><small>Review</small><strong class="${due === 'overdue' ? 'date-overdue' : ''}">${formatDate(plan.reviewDate)}</strong></span>
      <span class="badge ${due === 'overdue' ? 'danger' : due === 'due' ? 'active' : 'success'}">${dueLabel}</span>
      <button class="row-action" data-open-care-client="${escapeHtml(plan.clientId)}">Open</button>
    </article>`;
  }).join('');
  $$('[data-open-care-client]').forEach(button => button.addEventListener('click', async () => {
    await openClientProfile(button.dataset.openCareClient);
    showClientTab('care-plans');
  }));
}

function renderCareClientPicker() {
  const term = ($('#care-client-picker-search')?.value || '').trim().toLowerCase();
  const activeClients = clients.filter(client => client.status === 'Active');
  const visible = activeClients.filter(client => {
    const haystack = `${client.firstName} ${client.lastName} ${client.preferredName || ''} ${client.nhsNumber || ''} ${client.dateOfBirth || ''} ${formatDate(client.dateOfBirth)}`.toLowerCase();
    return !term || haystack.includes(term);
  });
  const list = $('#care-client-picker-list');
  const empty = $('#care-client-picker-empty');
  empty.hidden = visible.length > 0;
  list.innerHTML = visible.map(client => `<button type="button" class="client-picker-row" data-select-care-client="${escapeHtml(client.id)}">
    <span class="person-avatar">${initialsFromName(`${client.firstName} ${client.lastName}`)}</span>
    <span class="client-picker-details"><strong>${escapeHtml(clientDisplayName(client))}</strong><small>DOB ${formatDate(client.dateOfBirth)} · NHS ${escapeHtml(client.nhsNumber || 'Not recorded')}</small></span>
    <span class="client-picker-action">Select</span>
  </button>`).join('');
  $$('[data-select-care-client]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    button.querySelector('.client-picker-action').textContent = 'Opening…';
    try {
      careClientPickerDialog.close();
      await openClientProfile(button.dataset.selectCareClient);
      showClientTab('care-plans');
      openCarePlanDialog();
    } catch (error) {
      showToastError(error);
    } finally {
      button.disabled = false;
    }
  }));
}

function openCareClientPicker() {
  $('#care-client-picker-search').value = '';
  renderCareClientPicker();
  careClientPickerDialog.showModal();
  setTimeout(() => $('#care-client-picker-search').focus(), 50);
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
  const message = error?.message || 'CoreCare could not complete the request.';
  console.error(error);
  let toast = $('#corecare-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'corecare-error-toast';
    toast.className = 'corecare-error-toast';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = '<strong>CoreCare could not complete part of the request</strong><span></span><button type="button" aria-label="Dismiss">×</button>';
    document.body.appendChild(toast);
    toast.querySelector('button')?.addEventListener('click', () => toast.remove());
  }
  const copy = toast.querySelector('span');
  if (copy) copy.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToastError.timer);
  showToastError.timer = setTimeout(() => toast?.classList.remove('visible'), 9000);
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
$('#care-search').addEventListener('input', renderAllCarePlans);
$('#care-status-filter').addEventListener('change', renderAllCarePlans);
$('#care-open-clients').addEventListener('click', openCareClientPicker);
$('#close-care-client-picker').addEventListener('click', () => careClientPickerDialog.close());
$('#cancel-care-client-picker').addEventListener('click', () => careClientPickerDialog.close());
$('#care-client-picker-search').addEventListener('input', renderCareClientPicker);
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

function applyOrganisationBranding(org){
  if(!org)return;
  if(org.primary_colour)document.documentElement.style.setProperty('--brand',org.primary_colour);
  const name=org.name||currentUser?.organisationName;
  if(name)document.title=`${name} · CoreCare`;
}
async function loadOrganisationProfile(){
  const payload=await api('/api/organisation/profile'); const o=payload.organisation||{};
  $('#organisation-input').value=o.name||''; $('#organisation-logo').value=o.logo_url||''; $('#organisation-colour').value=o.primary_colour||'#1f6f5f'; $('#organisation-contact-email').value=o.contact_email||''; $('#organisation-contact-phone').value=o.contact_phone||''; applyOrganisationBranding(o);
}
async function loadSettings() {
  if (!currentUser) return;
  await loadOrganisationProfile();
  const canAdmin = ['platform_owner','platform_admin','organisation_owner','organisation_admin'].includes(currentUser.accessLevel) || (['platform_owner','organisation_owner','organisation_admin'].includes(currentUser.accessLevel) || currentUser.role === 'owner');
  $('#add-user').hidden = !canAdmin;
  $('#add-branch').hidden = !canAdmin;
  $('#platform-admin-panel').hidden = !currentUser.isPlatformUser || currentUser.supportMode;
  try {
    const [userPayload, branchPayload] = await Promise.all([api('/api/users'), api('/api/branches')]);
    users = userPayload.users || [];
    branches = branchPayload.branches || [];
    renderUsers(); renderBranches(); populateBranchSelect();
    await loadEnterpriseSecurity();
    if(currentUser.isPlatformUser && !currentUser.supportMode) await loadOrganisations();
    await loadAudit();
  await loadOrganisationCustomisation();
  } catch (error) {
    $('#user-table-body').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderUsers() {
  const own = currentUser?.id;
  $('#user-table-body').innerHTML = users.map(user => `<tr><td><div class="client-person"><span class="person-avatar">${initialsFromName(user.displayName)}</span><div><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.email)}${user.mustChangePassword ? ' · password change required' : ''}</span></div></div></td><td>${escapeHtml(roleLabel(user.accessLevel || user.role))}</td><td>${user.customRoleName?`<span class="role-pill"><i style="--role-colour:${escapeHtml(customRoles.find(r=>r.id===user.customRoleId)?.colour||'#0f766e')}"></i>${escapeHtml(user.customRoleName)}</span>`:'<span class="muted">Standard permissions</span>'}</td><td><span class="badge ${user.status === 'active' ? 'success' : 'neutral'}">${escapeHtml(user.status)}</span></td><td>${user.lastLoginAt ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(user.lastLoginAt)) : 'Never'}</td><td>${(['platform_owner','organisation_owner','organisation_admin'].includes(currentUser.accessLevel) || currentUser.role === 'owner') && user.id !== own ? `<button class="row-action" data-edit-user="${escapeHtml(user.id)}">Edit</button>` : ''}</td></tr>`).join('');
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
    userForm.elements.accessLevel.value = user.accessLevel || user.role;
    userForm.elements.branchId.value = user.branchId || "";
    userForm.elements.customRoleId.value = user.customRoleId || "";
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

function updateBrandingPreview(){
  const primary=$('#organisation-colour')?.value||'#1f6f5f',secondary=$('#organisation-secondary-colour')?.value||'#0f172a';
  const preview=$('#branding-preview');if(!preview)return;preview.style.setProperty('--preview-primary',primary);preview.style.setProperty('--preview-secondary',secondary);
  $('#preview-name').textContent=$('#organisation-input')?.value||'Organisation';$('#preview-short').textContent=$('#organisation-short-name')?.value||'Care management';$('#preview-welcome').textContent=$('#organisation-welcome')?.value||'Welcome to your care operations workspace';$('#preview-clients').textContent=($('#term-client')?.value||'Client')+'s';$('#preview-staff').textContent=($('#term-carer')?.value||'Carer')+'s';
  $('#preview-logo').textContent=initialsFromName($('#organisation-input')?.value||'CoreCare');
}
async function loadOrganisationCustomisation(){
  const p=await api('/api/organisation/profile'),o=p.organisation||{};
  const set=(id,v)=>{const e=$(id);if(e)e.value=v||''};set('#organisation-input',o.name);set('#organisation-short-name',o.short_name);set('#organisation-logo',o.logo_url);set('#organisation-colour',o.primary_colour||'#1f6f5f');set('#organisation-secondary-colour',o.secondary_colour||'#0f172a');set('#organisation-contact-email',o.contact_email);set('#organisation-contact-phone',o.contact_phone);set('#organisation-website',o.website);set('#organisation-welcome',o.dashboard_welcome);set('#organisation-timezone',o.timezone||'Europe/London');set('#organisation-week-start',o.week_start||'monday');set('#organisation-time-format',o.time_format||'24h');set('#organisation-document-footer',o.document_footer);set('#organisation-invoice-footer',o.invoice_footer);set('#term-client',o.terminology?.client||'Client');set('#term-carer',o.terminology?.carer||'Carer');set('#term-branch',o.terminology?.branch||'Branch');
  $$('input[name="dashboardWidget"]').forEach(x=>x.checked=(o.dashboardWidgets||[]).includes(x.value));updateBrandingPreview();applyOrganisationBranding(o);
}
function applyPortalBranding(o){document.documentElement.style.setProperty('--organisation-primary',o.primary_colour||'#1f6f5f');document.documentElement.style.setProperty('--organisation-secondary',o.secondary_colour||'#0f172a');const brand=document.querySelector('.sidebar-brand strong');if(brand)brand.textContent=o.short_name||o.name||'CoreCare';}
$('#organisation-form').addEventListener('input',updateBrandingPreview);
$('#organisation-form').addEventListener('submit',async event=>{event.preventDefault();const f=new FormData(event.currentTarget),data=Object.fromEntries(f);data.terminology={client:data.termClient,carer:data.termCarer,branch:data.termBranch};data.dashboardWidgets=f.getAll('dashboardWidget');const message=$('#organisation-message');message.hidden=true;try{const payload=await api('/api/organisation/profile',{method:'PUT',body:JSON.stringify(data)});currentUser.organisationName=payload.organisation.name;applyPortalBranding(payload.organisation);updateIdentity();message.textContent='Portal customisation saved.';message.hidden=false;}catch(error){message.textContent=error.message;message.hidden=false;}});


function populateCustomRoleSelect(){const select=$('#user-custom-role-select');if(!select)return;const current=select.value;select.innerHTML='<option value="">Use standard access level</option>'+customRoles.filter(r=>r.is_active!==0).map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join('');select.value=current;}
async function loadEnterpriseSecurity(){
  const canSee=['platform_owner','platform_admin','organisation_owner','organisation_admin'].includes(currentUser?.accessLevel);
  const panel=$('.enterprise-security-panel');if(panel)panel.hidden=!canSee;if(!canSee)return;
  const [overview,roles,permissions,policy,sessions]=await Promise.all([api('/api/security/overview'),api('/api/security/roles'),api('/api/security/permissions'),api('/api/security/policy'),api('/api/security/sessions')]);
  customRoles=roles.roles||[];permissionCatalogue=permissions.permissions||[];
  $('#security-role-count').textContent=overview.customRoles||0;$('#security-user-count').textContent=overview.activeUsers||0;$('#security-session-count').textContent=overview.activeSessions||0;$('#security-event-count').textContent=overview.securityEvents24h||0;
  renderCustomRoles();populateCustomRoleSelect();renderActiveSessions(sessions);fillSecurityPolicy(policy.policy||{});renderUsers();
}
function renderCustomRoles(){const el=$('#custom-role-list');if(!el)return;el.innerHTML=customRoles.length?customRoles.map(r=>`<article class="role-card" data-edit-role="${escapeHtml(r.id)}"><div class="role-card-icon" style="--role-colour:${escapeHtml(r.colour||'#0f766e')}">${initialsFromName(r.name)}</div><div><strong>${escapeHtml(r.name)}</strong><p>${escapeHtml(r.description||'No description')}</p><small>${r.permission_count||0} permissions · ${r.user_count||0} users</small></div><button class="row-action">Manage</button></article>`).join(''):'<div class="empty-state"><strong>No custom roles yet</strong><span>Create a role for job-specific access without changing the built-in access levels.</span></div>';$$('[data-edit-role]').forEach(x=>x.addEventListener('click',()=>openRoleDialog(x.dataset.editRole)));}
function renderPermissionGroups(selected=[]){const query=($('#permission-search')?.value||'').toLowerCase();const groups={};permissionCatalogue.filter(p=>!query||`${p.category} ${p.name} ${p.description}`.toLowerCase().includes(query)).forEach(p=>(groups[p.category]??=[]).push(p));$('#permission-groups').innerHTML=Object.entries(groups).map(([category,items])=>`<fieldset class="permission-group"><legend>${escapeHtml(category)} <span>${items.length}</span></legend>${items.map(p=>`<label class="permission-item ${p.risk_level}"><input type="checkbox" name="permission" value="${escapeHtml(p.permission_key)}" ${selected.includes(p.permission_key)?'checked':''}><span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.description||'')}</small></span><em>${escapeHtml(p.risk_level)}</em></label>`).join('')}</fieldset>`).join('')||'<p class="muted">No permissions match your search.</p>';}
const roleDialog=$('#role-dialog'),roleForm=$('#role-form');
function openRoleDialog(id=''){roleForm.reset();roleForm.elements.id.value=id;$('#role-form-error').hidden=true;const role=customRoles.find(r=>r.id===id);$('#role-dialog-title').textContent=role?'Edit custom role':'Create custom role';$('#delete-role').hidden=!role;if(role){roleForm.elements.name.value=role.name;roleForm.elements.description.value=role.description||'';roleForm.elements.colour.value=role.colour||'#0f766e';}renderPermissionGroups(role?.permissions?.filter(p=>p.effect==='allow').map(p=>p.permission_key)||[]);roleDialog.showModal();}
$('#add-custom-role')?.addEventListener('click',()=>openRoleDialog());$('#close-role-dialog')?.addEventListener('click',()=>roleDialog.close());$('#cancel-role')?.addEventListener('click',()=>roleDialog.close());
$('#permission-search')?.addEventListener('input',()=>{const selected=[...roleForm.querySelectorAll('input[name="permission"]:checked')].map(x=>x.value);renderPermissionGroups(selected)});
$('#clear-permissions')?.addEventListener('click',()=>$$('#permission-groups input[type="checkbox"]').forEach(x=>x.checked=false));
$('#select-safe-permissions')?.addEventListener('click',()=>$$('#permission-groups .permission-item:not(.critical) input').forEach(x=>x.checked=true));
roleForm?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(roleForm),data=Object.fromEntries(f);data.permissions=f.getAll('permission');try{if(data.id)await api(`/api/security/roles/${encodeURIComponent(data.id)}`,{method:'PUT',body:JSON.stringify(data)});else await api('/api/security/roles',{method:'POST',body:JSON.stringify(data)});roleDialog.close();await loadEnterpriseSecurity();}catch(error){$('#role-form-error').textContent=error.message;$('#role-form-error').hidden=false;}});
$('#delete-role')?.addEventListener('click',async()=>{const id=roleForm.elements.id.value;if(!id||!confirm('Delete this custom role? Users will return to their standard access level.'))return;try{await api(`/api/security/roles/${encodeURIComponent(id)}`,{method:'DELETE'});roleDialog.close();await loadEnterpriseSecurity();}catch(error){$('#role-form-error').textContent=error.message;$('#role-form-error').hidden=false;}});
function fillSecurityPolicy(p){const f=$('#security-policy-form');if(!f)return;f.elements.sessionHours.value=String(p.session_hours||12);f.elements.idleTimeoutMinutes.value=String(p.idle_timeout_minutes||60);f.elements.requireMfa.checked=Boolean(p.require_mfa);f.elements.requireTrustedDevice.checked=Boolean(p.require_trusted_device);f.elements.allowPasswordLogin.checked=p.allow_password_login!==0;}
$('#security-policy-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,data={sessionHours:Number(f.elements.sessionHours.value),idleTimeoutMinutes:Number(f.elements.idleTimeoutMinutes.value),requireMfa:f.elements.requireMfa.checked,requireTrustedDevice:f.elements.requireTrustedDevice.checked,allowPasswordLogin:f.elements.allowPasswordLogin.checked},m=$('#security-policy-message');try{await api('/api/security/policy',{method:'PUT',body:JSON.stringify(data)});m.textContent='Security policy saved.';m.hidden=false;}catch(error){m.textContent=error.message;m.hidden=false;}});
function renderActiveSessions(payload){const el=$('#active-session-list');if(!el)return;el.innerHTML=(payload.sessions||[]).map(s=>`<article class="session-row"><div class="session-device"><span>${/Mobile|Android|iPhone/i.test(s.user_agent||'')?'▯':'▣'}</span><div><strong>${escapeHtml(s.display_name)}</strong><small>${escapeHtml(s.email)} · ${escapeHtml((s.user_agent||'Unknown device').slice(0,90))}</small></div></div><div><b>${s.id===payload.currentSessionId?'Current session':'Active'}</b><small>${escapeHtml(s.ip_hint||'IP unavailable')} · last seen ${new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(`${s.last_seen_at||s.created_at}Z`))}</small></div>${s.id===payload.currentSessionId?'<span class="badge success">This device</span>':`<button class="row-action danger-text" data-revoke-session="${escapeHtml(s.id)}">Revoke</button>`}</article>`).join('')||'<p class="muted">No active sessions.</p>';$$('[data-revoke-session]').forEach(x=>x.addEventListener('click',async()=>{if(!confirm('Revoke this session immediately?'))return;await api(`/api/security/sessions/${encodeURIComponent(x.dataset.revokeSession)}`,{method:'DELETE'});await refreshActiveSessions();}));}
async function refreshActiveSessions(){const p=await api('/api/security/sessions');renderActiveSessions(p);$('#security-session-count').textContent=(p.sessions||[]).length;}
$('#refresh-sessions')?.addEventListener('click',refreshActiveSessions);

async function loadAudit() {
  const payload = await api('/api/audit?limit=30');
  $('#audit-list').innerHTML = (payload.events || []).map(event => `<div><time>${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${event.created_at}Z`))}</time><div><strong>${escapeHtml(event.action.replaceAll('.', ' '))}</strong><span>${escapeHtml(event.user_name || event.user_email || 'System')} · ${escapeHtml(event.entity_type)}</span></div></div>`).join('') || '<p>No audit events yet.</p>';
}

$('#refresh-audit').addEventListener('click', loadAudit);

function populateBranchSelect(){
  const select=$('#user-branch-select'); if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Organisation-wide</option>'+branches.filter(b=>b.status==='active').map(b=>`<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join('');
  select.value=current;
}
function renderBranches(){
  const list=$('#branch-list'); if(!list)return;
  list.innerHTML=branches.map(b=>`<article class="record-card"><div class="record-card-heading"><div><p class="eyebrow">${escapeHtml(b.code||'Branch')}</p><h3>${escapeHtml(b.name)}</h3></div><span class="badge ${b.status==='active'?'success':'neutral'}">${escapeHtml(b.status)}</span></div><p>${escapeHtml(b.address||'No address recorded')}</p><small>${escapeHtml(b.phone||'')} ${escapeHtml(b.email||'')}</small></article>`).join('')||'<div class="empty-state"><strong>No branches found</strong></div>';
}
async function loadOrganisations(){const p=await api('/api/platform/organisations');organisations=p.organisations||[];renderOrganisations();}
function renderOrganisations(){const list=$('#organisation-admin-list');if(!list)return;list.innerHTML=organisations.map(o=>`<article class="record-card"><div class="record-card-heading"><div><p class="eyebrow">${escapeHtml(o.subscription_plan||'development')}</p><h3>${escapeHtml(o.name)}</h3></div><span class="badge ${o.status==='active'?'success':'danger'}">${escapeHtml(o.status)}</span></div><p>${o.branch_count||0} branches · ${o.user_count||0} users · ${o.client_count||0} clients</p><button class="secondary-button" data-switch-org="${escapeHtml(o.id)}">Open organisation</button></article>`).join('');$$('[data-switch-org]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Switch your support view to this organisation?'))return;await api('/api/platform/switch-organisation',{method:'POST',body:JSON.stringify({organisationId:b.dataset.switchOrg})});location.reload();}));}
const branchDialog=$('#branch-dialog'),branchForm=$('#branch-form'),organisationDialog=$('#organisation-dialog'),organisationAdminForm=$('#organisation-admin-form');
$('#add-branch')?.addEventListener('click',()=>{branchForm.reset();$('#branch-form-error').hidden=true;branchDialog.showModal();});
$('#close-branch-dialog')?.addEventListener('click',()=>branchDialog.close());$('#cancel-branch')?.addEventListener('click',()=>branchDialog.close());
branchForm?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/branches',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(branchForm)))});branchDialog.close();const p=await api('/api/branches');branches=p.branches||[];renderBranches();populateBranchSelect();}catch(x){$('#branch-form-error').textContent=x.message;$('#branch-form-error').hidden=false;}});
$('#add-organisation')?.addEventListener('click',()=>{organisationAdminForm.reset();$('#organisation-admin-error').hidden=true;organisationDialog.showModal();});
$('#close-organisation-dialog')?.addEventListener('click',()=>organisationDialog.close());$('#cancel-organisation')?.addEventListener('click',()=>organisationDialog.close());
organisationAdminForm?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/platform/organisations',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(organisationAdminForm)))});organisationDialog.close();await loadOrganisations();}catch(x){$('#organisation-admin-error').textContent=x.message;$('#organisation-admin-error').hidden=false;}});

$('#platform-org-search')?.addEventListener('input',renderPlatformOrganisations);
$('#platform-org-status')?.addEventListener('change',renderPlatformOrganisations);
$('#platform-add-organisation')?.addEventListener('click',()=>$('#add-organisation')?.click());

restoreSession();

$('#exit-support-mode')?.addEventListener('click',async()=>{try{await api('/api/platform/exit-support',{method:'POST'});location.reload();}catch(error){alert(error.message);}});

$('#platform-global-search')?.addEventListener('input',()=>{clearTimeout(platformSearchTimer);platformSearchTimer=setTimeout(runPlatformSearch,300);});

$('#close-platform-org-profile')?.addEventListener('click',()=>$('#platform-organisation-dialog').close());
$('#platform-org-support-full')?.addEventListener('click',()=>{if(selectedPlatformOrganisationId)openPlatformOrganisation(selectedPlatformOrganisationId,'full')});
$('#platform-org-support-readonly')?.addEventListener('click',()=>{if(selectedPlatformOrganisationId)openPlatformOrganisation(selectedPlatformOrganisationId,'read_only')});

// Sprint 12 security completion UI
function populateEffectiveAccessUsers(){const s=$('#effective-access-user');if(!s)return;const current=s.value;s.innerHTML='<option value="">Select a user</option>'+users.filter(u=>u.status==='active').map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)} · ${escapeHtml(roleLabel(u.accessLevel||u.role))}</option>`).join('');s.value=current;}
async function loadLoginHistory(){const el=$('#login-history-list');if(!el)return;try{const p=await api('/api/security/login-history');el.innerHTML=(p.events||[]).map(e=>`<article class="session-row"><div class="session-device"><span>${e.outcome==='success'?'✓':'!'}</span><div><strong>${escapeHtml(e.display_name||e.email||'Unknown user')}</strong><small>${escapeHtml(e.reason||e.outcome)} · ${escapeHtml((e.user_agent||'Unknown device').slice(0,80))}</small></div></div><div><b>${escapeHtml(e.outcome)}</b><small>${escapeHtml(e.ip_hint||'IP unavailable')} · ${new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(`${e.created_at}Z`))}</small></div></article>`).join('')||'<p class="muted">No login history has been recorded yet.</p>';}catch(error){el.innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`;}}
$('#refresh-login-history')?.addEventListener('click',loadLoginHistory);
$('#test-effective-access')?.addEventListener('click',async()=>{const userId=$('#effective-access-user')?.value,result=$('#effective-access-result');if(!userId){result.innerHTML='<p class="muted">Select a user first.</p>';return;}try{const p=await api(`/api/security/effective-access?userId=${encodeURIComponent(userId)}`),groups={};(p.permissions||[]).forEach(x=>(groups[x.category]??=[]).push(x));result.innerHTML=`<div class="effective-access-heading"><strong>${escapeHtml(p.user.display_name)}</strong><span>${p.permissions.length} permissions</span></div>`+Object.entries(groups).map(([g,items])=>`<details><summary>${escapeHtml(g)} <span>${items.length}</span></summary><div class="effective-permission-list">${items.map(x=>`<span class="permission-chip ${escapeHtml(x.risk_level)}">${escapeHtml(x.name)}</span>`).join('')}</div></details>`).join('')||'<p class="muted">No effective permissions.</p>';}catch(error){result.innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`;}});
let emergencyModeEnabled=false;
function updateEmergencyUI(policy={}){emergencyModeEnabled=Boolean(policy.emergency_mode);const badge=$('#emergency-mode-badge'),button=$('#toggle-emergency-mode'),reason=$('#emergency-mode-reason');if(badge){badge.textContent=emergencyModeEnabled?'Active':'Off';badge.className=`badge ${emergencyModeEnabled?'danger':'neutral'}`;}if(button){button.textContent=emergencyModeEnabled?'Disable emergency mode':'Enable emergency mode';}if(reason&&policy.emergency_reason)reason.value=policy.emergency_reason;}
$('#toggle-emergency-mode')?.addEventListener('click',async()=>{const reason=$('#emergency-mode-reason')?.value||'';if(!emergencyModeEnabled&&!confirm('Enable emergency mode? This records a critical security event.'))return;if(emergencyModeEnabled&&!confirm('Disable emergency mode and return to normal operation?'))return;try{const p=await api('/api/security/emergency-mode',{method:'PUT',body:JSON.stringify({enabled:!emergencyModeEnabled,reason})});updateEmergencyUI(p.policy||{});}catch(error){alert(error.message);}});
const originalFillSecurityPolicy=fillSecurityPolicy;fillSecurityPolicy=function(p){originalFillSecurityPolicy(p);updateEmergencyUI(p);populateEffectiveAccessUsers();loadLoginHistory();};

$('#executive-refresh')?.addEventListener('click',()=>loadPlatformWorkspace());
$('#open-revenue-centre')?.addEventListener('click',()=>$('#revenue-centre')?.scrollIntoView({behavior:'smooth',block:'start'}));
$('#revenue-refresh')?.addEventListener('click',loadRevenueCentre);
$('#revenue-export')?.addEventListener('click',exportRevenueCsv);

$('#success-refresh')?.addEventListener('click',loadCustomerSuccess);
$('#success-filter')?.addEventListener('change',renderCustomerSuccess);
