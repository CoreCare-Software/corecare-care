const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }

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
  const platformNavigation = $('#platform-navigation');
  if (platformNavigation) platformNavigation.hidden = !platformWorkspace;
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

const CORECARE_FALLBACK_VERSION = '1.4.2';

async function loadApplicationVersion() {
  let version = CORECARE_FALLBACK_VERSION;
  try {
    const payload = await api('/api/version');
    version = payload.version || version;
  } catch (error) {
    console.warn('CoreCare version endpoint unavailable', error);
  }
  $$('[data-app-version]').forEach(node => node.textContent = version);
  if ($('#dev-version')) $('#dev-version').textContent = `v${version}`;
}

const platformViewMeta = {
  'platform-page': { title: 'Platform administration', kicker: 'Platform owner' },
  'revenue-centre': { title: 'Revenue centre', kicker: 'Commercial' },
  'customer-success-centre': { title: 'Customer success', kicker: 'Commercial' },
  'organisation-portfolio': { title: 'Organisations', kicker: 'Customers' },
  'platform-global-search-panel': { title: 'Global search', kicker: 'Customers' },
  'platform-ai-assistant': { title: 'AI executive assistant', kicker: 'Intelligence' },
  'platform-workflow-engine': { title: 'Workflow engine', kicker: 'Automation' },
  'platform-notification-centre': { title: 'Notification centre', kicker: 'Alerts' },
  'platform-operations-panel': { title: 'Platform operations', kicker: 'Governance' },
  'platform-admin-drawer': { title: 'Security & audit', kicker: 'Governance' }
};

const platformDedicatedTargets = [
  'revenue-centre',
  'customer-success-centre',
  'organisation-portfolio',
  'platform-global-search-panel',
  'platform-ai-assistant',
  'platform-workflow-engine',
  'platform-notification-centre',
  'platform-operations-panel',
  'platform-admin-drawer'
];

function initialisePlatformViews() {
  const platformPage = document.getElementById('platform-page');
  if (!platformPage || platformPage.querySelector(':scope > .platform-view-host')) return;

  const host = document.createElement('div');
  host.className = 'platform-view-host';
  platformPage.appendChild(host);

  platformDedicatedTargets.forEach(id => {
    const node = document.getElementById(id);
    if (!node) return;
    const shell = document.createElement('section');
    shell.className = 'platform-dedicated-view';
    shell.dataset.platformView = id;
    shell.hidden = true;
    host.appendChild(shell);
    shell.appendChild(node);
    node.hidden = false;
    if (node.tagName === 'DETAILS') node.open = true;
  });
}

function showPlatformView(targetId = 'platform-page', updateHistory = true) {
  initialisePlatformViews();
  const platformPage = document.getElementById('platform-page');
  if (!platformPage) return;

  const commandChildren = Array.from(platformPage.children).filter(node =>
    node.classList.contains('executive-hero') || node.classList.contains('executive-kpis') || node.classList.contains('executive-grid')
  );
  commandChildren.forEach(node => node.hidden = targetId !== 'platform-page');

  const shells = Array.from(platformPage.querySelectorAll(':scope > .platform-view-host > .platform-dedicated-view'));
  shells.forEach(shell => { shell.hidden = shell.dataset.platformView !== targetId; });

  if (targetId !== 'platform-page' && !shells.some(shell => shell.dataset.platformView === targetId)) {
    targetId = 'platform-page';
    commandChildren.forEach(node => node.hidden = false);
  }

  const meta = platformViewMeta[targetId] || platformViewMeta['platform-page'];
  if (pageTitle) pageTitle.textContent = meta.title;
  if ($('#page-kicker')) $('#page-kicker').textContent = meta.kicker;
  $$('[data-platform-target]').forEach(button => button.classList.toggle('active', button.dataset.platformTarget === targetId));
  platformPage.dataset.activePlatformView = targetId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (updateHistory) history.pushState({ platformView: targetId }, '', targetId === 'platform-page' ? '#platform' : `#${targetId}`);
}

async function showApplication(user) {
  currentUser = user || currentUser;
  loginView.hidden = true;
  appView.hidden = false;
  setDate();
  updateIdentity();
  applyAccessVisibility();
  await loadApplicationVersion();
  const platformWorkspace = currentUser?.isPlatformUser && !currentUser?.supportMode;
  if (platformWorkspace) {
    $$('.nav-item').forEach(item => item.classList.remove('active'));
    $('#platform-nav')?.classList.add('active');
    showPage('platform');
    showPlatformView(location.hash && location.hash !== '#platform' ? location.hash.slice(1) : 'platform-page', false);
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


function applyAccessVisibility(){
  if(!currentUser||currentUser.isPlatformUser)return;
  const modules=currentUser.modules||{};
  $$('.organisation-workspace-nav[data-page]').forEach(button=>{const page=button.dataset.page;button.hidden=modules[page]===false;});
}
function hasAccess(permission){return currentUser?.isPlatformUser||currentUser?.accessLevel==='organisation_owner'||(currentUser?.permissions||[]).includes(permission);}

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
  if (page === 'rota') {
    activatePage('#rota-page');
    loadRotaBoard();
    return;
  }
  if (page === 'visits') {
    activatePage('#visits-page');
    pageKicker.textContent = 'Electronic call monitoring';
    pageTitle.textContent = 'Visits';
    loadVisitsBoard().catch(showToastError);
    return;
  }
  if (page === 'operations') {
    activatePage('#operations-page');
    pageKicker.textContent = 'Care delivery';
    pageTitle.textContent = 'Live Operations Board';
    loadOperationsBoard().catch(showToastError);
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
    ['AI Executive Assistant', '#platform-ai-assistant', loadAiAssistantHistory],
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
async function loadPlatformHealth(){
  const h=await api('/api/platform/system-health');
  const tone=status=>status==='critical'||status==='failed'?'danger':status==='warning'||status==='Monitoring'?'warning':'success';
  const fmtDate=value=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${value}${String(value).endsWith('Z')?'':'Z'}`)):'Never';
  setText('#platform-health-badge',h.overall||'Healthy');
  const badge=$('#platform-health-badge'); if(badge) badge.className=`badge ${tone(h.overall)}`;
  setText('#ops-overall',h.overall||'Healthy');
  setText('#ops-checked',`Checked ${new Intl.DateTimeFormat('en-GB',{timeStyle:'short'}).format(new Date(h.checkedAt))}`);
  setText('#ops-sessions',h.activeSessions||0); setText('#ops-users-online',`${h.recentUsers||0} users active in the last 30 minutes`);
  setText('#ops-errors',h.errors24h||0); setText('#ops-error-rate',h.errors24h?`${h.errors24h} captured failures`:'No failures recorded');
  setText('#ops-audit',h.auditEvents24h||0); setText('#ops-audit-rate','Recorded platform activity');
  setText('#ops-support',h.supportSessions24h||0); setText('#ops-support-active',`${h.activeSupportSessions||0} currently active`);
  setText('#ops-job-health',`${h.jobSummary?.healthy||0}/${h.jobSummary?.total||0}`); setText('#ops-job-note',h.jobSummary?.failed?`${h.jobSummary.failed} failed job${h.jobSummary.failed===1?'':'s'}`:'Scheduled automation healthy');
  const health=$('#platform-health'); if(health) health.innerHTML=(h.services||[]).map(service=>`<div class="service-status ${tone(service.status)}"><span class="service-dot"></span><div><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.detail||'')}</small></div><b>${escapeHtml(service.status)}</b></div>`).join('')||'<p class="muted">No service status available.</p>';
  const alerts=h.alerts||[]; setText('#ops-alert-count',alerts.length);
  const alertCount=$('#ops-alert-count'); if(alertCount) alertCount.className=`badge ${alerts.some(x=>x.severity==='critical')?'danger':alerts.length?'warning':'success'}`;
  const alertList=$('#ops-alerts'); if(alertList) alertList.innerHTML=alerts.map(x=>`<div class="operations-row alert ${tone(x.severity)}"><span class="operations-icon">${x.severity==='critical'?'!':x.severity==='warning'?'△':'✓'}</span><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.description||'')} ${x.source?'· '+escapeHtml(x.source):''}</small></div></div>`).join('')||'<div class="operations-empty"><strong>No operational alerts</strong><span>All monitored services are operating normally.</span></div>';
  const jobs=$('#ops-jobs'); if(jobs) jobs.innerHTML=(h.jobs||[]).map(job=>`<tr><td><strong>${escapeHtml(job.name)}</strong><small class="table-subtext">${escapeHtml(job.description||'')}</small></td><td>${escapeHtml(job.schedule_label||'')}</td><td><span class="badge ${tone(job.status)}">${escapeHtml(job.status)}</span></td><td>${fmtDate(job.last_run_at)}${job.last_result?`<small class="table-subtext">${escapeHtml(job.last_result)}</small>`:''}</td><td>${fmtDate(job.next_run_at)}</td><td>${job.duration_ms?`${Number(job.duration_ms).toLocaleString('en-GB')} ms`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">No scheduled jobs configured.</td></tr>';
  const errors=$('#ops-error-list'); if(errors) errors.innerHTML=(h.recentErrors||[]).map(x=>`<div class="operations-row"><span class="operations-icon danger">!</span><div><strong>${escapeHtml(`${x.method||''} ${x.route||'Unknown route'}`)}</strong><small>${escapeHtml(x.error_message||'Unknown error')} · ${escapeHtml(x.organisation_name||'Platform')} · ${fmtDate(x.created_at)}</small></div></div>`).join('')||'<div class="operations-empty"><strong>No recent errors</strong><span>No API errors have been recorded.</span></div>';
  const support=$('#ops-support-list'); if(support) support.innerHTML=(h.supportActivity||[]).map(x=>`<div class="operations-row"><span class="operations-icon">◆</span><div><strong>${escapeHtml(x.organisation_name||'Organisation')}</strong><small>${escapeHtml(x.platform_user_name||'Platform user')} · ${escapeHtml(x.reason||'Support')} · ${escapeHtml(x.access_mode||'full')} · ${fmtDate(x.started_at)}</small></div><span class="badge ${x.ended_at?'neutral':'success'}">${x.ended_at?'Ended':'Active'}</span></div>`).join('')||'<div class="operations-empty"><strong>No support activity</strong><span>No recent support sessions recorded.</span></div>';
  const chart=$('#ops-activity-chart'); if(chart){const points=h.activity||[],max=Math.max(1,...points.map(x=>Math.max(Number(x.audit||0),Number(x.errors||0))));chart.innerHTML=points.map((x,i)=>`<div class="operations-bar-group" title="${escapeHtml(x.label)} · ${x.audit||0} audit · ${x.errors||0} errors"><div class="operations-bars"><i class="audit" style="height:${Math.max(3,Math.round(Number(x.audit||0)/max*100))}%"></i><i class="errors" style="height:${Math.max(0,Math.round(Number(x.errors||0)/max*100))}%"></i></div>${i%3===0?`<small>${escapeHtml(x.label)}</small>`:'<small></small>'}</div>`).join('');}
}
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
  $('#platform-org-table').innerHTML=rows.map(o=>`<tr><td><strong>${escapeHtml(o.name)}</strong><div class="organisation-meta"><small class="table-subtext">${escapeHtml(o.slug||'')}</small><span class="status-chip ${o.status==='active'?'active':'suspended'}">${escapeHtml(o.status||'active')}</span></div></td><td>${escapeHtml(o.plan_name||o.subscription_plan||'Development')}</td><td>${money(o.monthly_price_pence)}</td><td><span class="health-score ${o.health_score<60?'danger':o.health_score<80?'warning':'success'}">${o.health_score}%</span></td><td>${o.user_count||0}</td><td>${o.client_count||0}</td><td>${o.last_activity_at?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(`${o.last_activity_at}Z`)):'No activity'}</td><td><div class="row-actions"><button class="row-action" data-platform-manage-org="${escapeHtml(o.id)}">360°</button><button class="row-action" data-platform-open-org="${escapeHtml(o.id)}">Support</button></div></td></tr>`).join('');
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


const visitDayLabels=[['1','Mon'],['2','Tue'],['3','Wed'],['4','Thu'],['5','Fri'],['6','Sat'],['0','Sun']];
function visitRequirementRow(value={}){
  const days=Array.isArray(value.days)?value.days.map(String):['1','2','3','4','5','6','0'];
  return `<article class="visit-requirement-row">
    <label><span>Visit type</span><select data-requirement="visitType"><option>Personal care</option><option>Medication</option><option>Welfare / Domestic</option><option>Companionship</option><option>Meal support</option><option>Other</option></select></label>
    <label><span>Required time</span><input data-requirement="preferredTime" type="time" value="${escapeHtml(value.preferredTime||'08:00')}"></label>
    <label><span>Window</span><select data-requirement="windowMinutes"><option value="0">Fixed</option><option value="30">± 30 mins</option><option value="60" selected>± 1 hour</option><option value="120">± 2 hours</option></select></label>
    <label><span>Duration</span><select data-requirement="durationMinutes"><option value="15">15 mins</option><option value="30" selected>30 mins</option><option value="45">45 mins</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
    <label><span>Carers required</span><select data-requirement="carersRequired"><option value="1">1 carer</option><option value="2">2 carers</option><option value="3">3 carers</option></select></label>
    <label><span>Visit notes</span><input data-requirement="notes" value="${escapeHtml(value.notes||'')}" placeholder="Skills, preferences or instructions"></label>
    <button class="icon-button visit-requirement-remove" type="button" aria-label="Remove visit requirement">×</button>
    <div class="visit-requirement-days">${visitDayLabels.map(([n,label])=>`<label><input type="checkbox" data-requirement-day value="${n}" ${days.includes(n)?'checked':''}> ${label}</label>`).join('')}</div>
  </article>`;
}
function addVisitRequirement(value={}){
  const list=$('#client-visit-requirements');if(!list)return;
  list.insertAdjacentHTML('beforeend',visitRequirementRow(value));
  const row=list.lastElementChild;
  row.querySelector('[data-requirement="visitType"]').value=value.visitType||'Personal care';
  row.querySelector('[data-requirement="windowMinutes"]').value=String(value.windowMinutes??60);
  row.querySelector('[data-requirement="durationMinutes"]').value=String(value.durationMinutes??30);
  row.querySelector('[data-requirement="carersRequired"]').value=String(value.carersRequired??1);
  row.querySelector('.visit-requirement-remove').addEventListener('click',()=>row.remove());
}
function collectVisitRequirements(){return [...document.querySelectorAll('.visit-requirement-row')].map(row=>({visitType:row.querySelector('[data-requirement="visitType"]').value,preferredTime:row.querySelector('[data-requirement="preferredTime"]').value,windowMinutes:Number(row.querySelector('[data-requirement="windowMinutes"]').value),durationMinutes:Number(row.querySelector('[data-requirement="durationMinutes"]').value),carersRequired:Number(row.querySelector('[data-requirement="carersRequired"]').value),notes:row.querySelector('[data-requirement="notes"]').value,days:[...row.querySelectorAll('[data-requirement-day]:checked')].map(x=>Number(x.value))})).filter(r=>r.preferredTime&&r.days.length);}

function openClientDialog(id = '') {
  clientForm.reset();
  $('#client-form-error').hidden = true;
  const requirementsList=$('#client-visit-requirements');if(requirementsList)requirementsList.innerHTML='';
  const startField=$('#client-visit-start-date');if(startField)startField.value=new Date().toISOString().slice(0,10);
  if(!id)addVisitRequirement();
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
    if(!id){data.visitRequirements=collectVisitRequirements();if(!data.visitRequirements.length){throw new Error('Add at least one visit requirement so CoreCare can create the allocation queue.');}}
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
  if (button.dataset.page) showPage(button.dataset.page);
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
  renderCustomRoles();populateCustomRoleSelect();renderActiveSessions(sessions);fillSecurityPolicy(policy.policy||{});renderUsers();populatePermissionUserSelect();await loadOrganisationModules();loadRoutingSettings();
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

$$('[data-platform-target]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  showPage('platform');
  showPlatformView(button.dataset.platformTarget || 'platform-page');
  if(button.dataset.platformTarget==='platform-workflow-engine') loadWorkflowEngine().catch(error=>alert(error.message));
  if(button.dataset.platformTarget==='platform-notification-centre') loadNotifications().catch(error=>alert(error.message));
}));
window.addEventListener('popstate', event => {
  if (currentUser?.isPlatformUser && !currentUser?.supportMode) {
    showPage('platform');
    showPlatformView(event.state?.platformView || (location.hash && location.hash !== '#platform' ? location.hash.slice(1) : 'platform-page'), false);
  }
});

$('#platform-org-search')?.addEventListener('input',renderPlatformOrganisations);
$('#platform-org-status')?.addEventListener('change',renderPlatformOrganisations);
$('#platform-add-organisation')?.addEventListener('click',()=>$('#add-organisation')?.click());



let workflowData=[];
async function loadWorkflowEngine(){
  if(!$('#workflow-list'))return;const status=$('#workflow-status-filter')?.value||'all';
  const [wf,runs]=await Promise.all([api(`/api/platform/workflows?status=${encodeURIComponent(status)}`),api('/api/platform/workflows/runs?limit=40')]);
  workflowData=wf.workflows||[];renderWorkflowList();renderWorkflowRuns(runs.runs||[]);
}
function renderWorkflowList(){
  const list=$('#workflow-list');if(!list)return;const active=workflowData.filter(x=>x.status==='active').length;
  $('#workflow-total').textContent=workflowData.length;$('#workflow-active').textContent=active;
  list.innerHTML=workflowData.map(w=>`<article class="workflow-card" data-workflow-edit="${escapeHtml(w.id)}"><div class="workflow-card-head"><div><strong>${escapeHtml(w.name)}</strong><small>${escapeHtml((w.trigger_type||'').replaceAll('_',' '))}</small></div><span class="badge ${w.status==='active'?'success':w.status==='paused'?'warning':'neutral'}">${escapeHtml(w.status)}</span></div><small>${escapeHtml(w.scope==='organisation'?(w.organisation_name||'Organisation'):'Platform-wide')} · v${w.version||1} · ${w.run_count||0} runs</small><div class="workflow-card-actions"><button class="row-action" data-workflow-run="${escapeHtml(w.id)}">Test run</button><button class="row-action danger-text" data-workflow-delete="${escapeHtml(w.id)}">Delete</button></div></article>`).join('')||'<div class="empty-state"><strong>No workflows yet</strong><span>Create your first automation using the builder.</span></div>';
  $$('[data-workflow-edit]').forEach(x=>x.addEventListener('click',e=>{if(e.target.closest('button'))return;editWorkflow(x.dataset.workflowEdit)}));
  $$('[data-workflow-run]').forEach(x=>x.addEventListener('click',async e=>{e.stopPropagation();x.disabled=true;try{await api(`/api/platform/workflows/${encodeURIComponent(x.dataset.workflowRun)}/run`,{method:'POST',body:'{}'});await loadWorkflowEngine();}catch(err){alert(err.message)}finally{x.disabled=false}}));
  $$('[data-workflow-delete]').forEach(x=>x.addEventListener('click',async e=>{e.stopPropagation();if(!confirm('Delete this workflow and its run history?'))return;await api(`/api/platform/workflows/${encodeURIComponent(x.dataset.workflowDelete)}`,{method:'DELETE'});resetWorkflowForm();await loadWorkflowEngine();}));
}
function renderWorkflowRuns(rows){
  const today=new Date().toISOString().slice(0,10);$('#workflow-runs-today').textContent=rows.filter(x=>(x.started_at||'').slice(0,10)===today).length;$('#workflow-failed').textContent=rows.filter(x=>x.status==='failed').length;
  $('#workflow-runs').innerHTML=rows.map(r=>`<tr><td><strong>${escapeHtml(r.workflow_name)}</strong><small>${escapeHtml((r.trigger_type||'').replaceAll('_',' '))}</small></td><td>${escapeHtml(r.organisation_name||'Platform')}</td><td><span class="badge ${r.status==='completed'?'success':r.status==='failed'?'danger':'warning'}">${escapeHtml(r.status)}</span></td><td>${new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(`${r.started_at}${String(r.started_at).endsWith('Z')?'':'Z'}`))}</td><td>${r.duration_ms==null?'—':Number(r.duration_ms).toLocaleString('en-GB')+' ms'}</td><td>${r.actions_completed||0}/${r.actions_total||0}</td></tr>`).join('')||'<tr><td colspan="6">No workflow runs recorded.</td></tr>';
}
function resetWorkflowForm(){const f=$('#workflow-form');if(!f)return;f.reset();f.elements.id.value='';$('#workflow-builder-title').textContent='Create workflow';$('#workflow-form-message').hidden=true;}
function editWorkflow(id){const w=workflowData.find(x=>x.id===id),f=$('#workflow-form');if(!w||!f)return;f.elements.id.value=w.id;f.elements.name.value=w.name||'';f.elements.description.value=w.description||'';f.elements.scope.value=w.scope||'platform';f.elements.status.value=w.status||'draft';f.elements.triggerType.value=w.trigger_type||'manual';const c=(w.conditions||[])[0]||{};$('#workflow-condition-field').value=c.field||'';$('#workflow-condition-operator').value=c.operator||'less_than';$('#workflow-condition-value').value=c.value||'';Array.from(f.querySelectorAll('[name="actions"]')).forEach(cb=>cb.checked=(w.actions||[]).some(a=>a.type===cb.value));$('#workflow-builder-title').textContent='Edit workflow';f.scrollIntoView({behavior:'smooth',block:'start'});}
$('#workflow-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,msg=$('#workflow-form-message'),id=f.elements.id.value,field=$('#workflow-condition-field').value,actions=Array.from(f.querySelectorAll('[name="actions"]:checked')).map(x=>({type:x.value,label:x.parentElement.textContent.trim()})),payload={name:f.elements.name.value,description:f.elements.description.value,scope:f.elements.scope.value,status:f.elements.status.value,triggerType:f.elements.triggerType.value,conditions:field?[{field,operator:$('#workflow-condition-operator').value,value:$('#workflow-condition-value').value}]:[],actions};try{await api(id?`/api/platform/workflows/${encodeURIComponent(id)}`:'/api/platform/workflows',{method:id?'PUT':'POST',body:JSON.stringify(payload)});msg.textContent='Workflow saved successfully.';msg.className='form-message success';msg.hidden=false;resetWorkflowForm();await loadWorkflowEngine();}catch(err){msg.textContent=err.message;msg.className='form-message error';msg.hidden=false;}});
$('#workflow-new')?.addEventListener('click',()=>{resetWorkflowForm();$('#workflow-form')?.scrollIntoView({behavior:'smooth'})});
$('#workflow-reset')?.addEventListener('click',resetWorkflowForm);$('#workflow-refresh')?.addEventListener('click',loadWorkflowEngine);$('#workflow-status-filter')?.addEventListener('change',loadWorkflowEngine);

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
$('#operations-refresh')?.addEventListener('click',loadPlatformHealth);
$('#open-revenue-centre')?.addEventListener('click',()=>showPlatformView('revenue-centre'));
$('#revenue-refresh')?.addEventListener('click',loadRevenueCentre);
$('#revenue-export')?.addEventListener('click',exportRevenueCsv);

$('#success-refresh')?.addEventListener('click',loadCustomerSuccess);
$('#success-filter')?.addEventListener('change',renderCustomerSuccess);


let aiConversationId = null;
function aiMessage(role, content, meta = '') {
  const chat = $('#ai-chat'); if (!chat) return;
  const node = document.createElement('div'); node.className = `ai-message ${role}`;
  node.innerHTML = `<div class="ai-avatar">${role === 'assistant' ? '✦' : escapeHtml((currentUser?.displayName||'You').slice(0,1))}</div><div><strong>${role === 'assistant' ? 'CoreCare Assistant' : escapeHtml(currentUser?.displayName||'You')}</strong><p>${escapeHtml(content).replaceAll('\n','<br>')}</p>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</div>`;
  chat.appendChild(node); chat.scrollTop = chat.scrollHeight;
}
async function loadAiAssistantHistory(){
  if (!$('#platform-ai-assistant')) return;
  try {
    const p = await api('/api/platform/assistant/history');
    aiConversationId = p.conversationId || null;
    if ((p.messages||[]).length) {
      $('#ai-chat').innerHTML = '';
      p.messages.forEach(m => aiMessage(m.role, m.content, m.created_at ? new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${m.created_at}Z`)) : ''));
    }
  } catch (error) { console.warn('Assistant history unavailable', error); }
}
async function askAiAssistant(question){
  aiMessage('user', question);
  const send=$('#ai-send'), input=$('#ai-question'); if(send) send.disabled=true; if(input) input.disabled=true;
  const typing=document.createElement('div'); typing.id='ai-typing'; typing.className='ai-message assistant typing'; typing.innerHTML='<div class="ai-avatar">✦</div><div><strong>CoreCare Assistant</strong><p>Analysing live platform data…</p></div>'; $('#ai-chat')?.appendChild(typing);
  try {
    const p=await api('/api/platform/assistant',{method:'POST',body:JSON.stringify({question,conversationId:aiConversationId})});
    aiConversationId=p.conversationId||aiConversationId; typing.remove(); aiMessage('assistant',p.answer,p.generatedAt?'Generated from live data':'');
  } catch(error){ typing.remove(); aiMessage('assistant',`I could not complete that analysis: ${error.message}`); }
  finally { if(send) send.disabled=false; if(input){input.disabled=false;input.focus();} }
}

$('#ai-form')?.addEventListener('submit',e=>{e.preventDefault();const q=$('#ai-question')?.value.trim();if(!q)return;$('#ai-question').value='';askAiAssistant(q);});
$$('[data-ai-question]').forEach(b=>b.addEventListener('click',()=>askAiAssistant(b.dataset.aiQuestion)));
$('#ai-new-conversation')?.addEventListener('click',async()=>{aiConversationId=null;const chat=$('#ai-chat');if(chat)chat.innerHTML='<div class="ai-message assistant"><div class="ai-avatar">✦</div><div><strong>CoreCare Assistant</strong><p>New conversation started. What would you like to know?</p></div></div>';});


let notificationData=[];
async function loadNotifications(){
  if(!$('#notification-list'))return;
  const category=$('#notification-category-filter')?.value||'all',status=$('#notification-status-filter')?.value||'all',search=$('#notification-search')?.value||'';
  const p=await api(`/api/platform/notifications?category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`);
  notificationData=p.notifications||[];renderNotifications(p.stats||{});
}
function renderNotifications(stats={}){
  $('#notification-unread-count').textContent=stats.unread||0;$('#notification-critical-count').textContent=stats.critical||0;$('#notification-today-count').textContent=stats.today||0;$('#notification-ack-count').textContent=stats.acknowledged||0;
  const list=$('#notification-list');if(!list)return;
  list.innerHTML=notificationData.map(n=>`<article class="notification-item ${n.read_at?'':'unread'}"><span class="notification-priority ${escapeHtml(n.priority||'information')}"></span><div class="notification-body"><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message)}</p><small>${escapeHtml(n.category||'system')} · ${new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(`${n.created_at}${String(n.created_at).endsWith('Z')?'':'Z'}`))}${n.organisation_name?' · '+escapeHtml(n.organisation_name):''}</small></div><div class="notification-actions">${!n.read_at?`<button class="row-action" data-notification-read="${escapeHtml(n.id)}">Read</button>`:''}${!n.acknowledged_at?`<button class="row-action" data-notification-ack="${escapeHtml(n.id)}">Acknowledge</button>`:''}<button class="row-action" data-notification-archive="${escapeHtml(n.id)}">Archive</button></div></article>`).join('')||'<div class="empty-state"><strong>No notifications found</strong><span>Change the filters or wait for new platform events.</span></div>';
  $$('[data-notification-read]').forEach(b=>b.addEventListener('click',async()=>{await api(`/api/platform/notifications/${encodeURIComponent(b.dataset.notificationRead)}/read`,{method:'POST',body:'{}'});await loadNotifications();}));
  $$('[data-notification-ack]').forEach(b=>b.addEventListener('click',async()=>{await api(`/api/platform/notifications/${encodeURIComponent(b.dataset.notificationAck)}/acknowledge`,{method:'POST',body:'{}'});await loadNotifications();}));
  $$('[data-notification-archive]').forEach(b=>b.addEventListener('click',async()=>{await api(`/api/platform/notifications/${encodeURIComponent(b.dataset.notificationArchive)}/archive`,{method:'POST',body:'{}'});await loadNotifications();}));
}
$('#notifications-refresh')?.addEventListener('click',loadNotifications);$('#notification-category-filter')?.addEventListener('change',loadNotifications);$('#notification-status-filter')?.addEventListener('change',loadNotifications);$('#notification-search')?.addEventListener('input',()=>{clearTimeout(window.notificationSearchTimer);window.notificationSearchTimer=setTimeout(loadNotifications,250)});$('#notifications-mark-all')?.addEventListener('click',async()=>{await api('/api/platform/notifications/mark-all-read',{method:'POST',body:'{}'});await loadNotifications();});


let operationsData={tasks:[],incidents:[],handovers:[],clients:[],staff:[],timeline:[],stats:{}};
function opFmt(value){if(!value)return 'No due time';try{return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(String(value).endsWith('Z')?value:value+'Z'))}catch{return value}}
async function loadOperationsBoard(){operationsData=await api('/api/operations/board');renderOperationsBoard();}
function renderOperationsBoard(){const s=operationsData.stats||{};setText('#op-open',s.open||0);setText('#op-overdue',s.overdue||0);setText('#op-escalated',s.escalated||0);setText('#op-incidents',s.incidentsOpen||0);setText('#op-high-incidents',s.incidentsHigh||0);setText('#op-handovers',s.handoversUnread||0);setText('#op-compliance',(s.careDue||0)+(s.riskDue||0));
  const filter=$('#operations-task-filter')?.value||'active';let tasks=operationsData.tasks||[];if(filter==='active')tasks=tasks.filter(x=>x.status!=='completed');if(filter==='completed')tasks=tasks.filter(x=>x.status==='completed');
  $('#operations-task-list').innerHTML=tasks.map(t=>`<article class="operations-row priority-${escapeHtml(t.priority||'normal')}"><div class="operations-row-status ${escapeHtml(t.status)}"></div><div><strong>${escapeHtml(t.title)}</strong><p>${escapeHtml(t.description||'No description')}</p><small>${escapeHtml(t.client_name||'General operation')} · ${escapeHtml(t.staff_name||'Unassigned')} · ${opFmt(t.due_at)}</small></div><span class="badge ${t.status==='completed'?'success':t.status==='escalated'?'danger':t.status==='overdue'?'warning':'neutral'}">${escapeHtml(t.status)}</span><div class="operations-row-actions">${t.status!=='completed'?`<button data-op-complete="${escapeHtml(t.id)}">Complete</button>`:''}${!['completed','escalated'].includes(t.status)?`<button data-op-escalate="${escapeHtml(t.id)}">Escalate</button>`:''}</div></article>`).join('')||'<div class="empty-state"><strong>No tasks in this view</strong><span>Create a task to begin coordinating today’s work.</span></div>';
  $('#operations-incident-list').innerHTML=(operationsData.incidents||[]).filter(x=>x.status!=='closed').map(i=>`<article class="mini-operation"><div><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.severity)} · ${escapeHtml(i.client_name||'No client')} · ${opFmt(i.occurred_at||i.created_at)}</small></div><button data-op-review="${escapeHtml(i.id)}">Review</button></article>`).join('')||'<p class="muted">No open incidents.</p>';
  $('#operations-handover-list').innerHTML=(operationsData.handovers||[]).slice(0,5).map(h=>`<article class="mini-operation"><div><strong>${escapeHtml(h.shift)} handover</strong><p>${escapeHtml(h.summary)}</p><small>${opFmt(h.created_at)}</small></div>${h.acknowledged_at?'<span class="badge success">Acknowledged</span>':`<button data-op-ack="${escapeHtml(h.id)}">Acknowledge</button>`}</article>`).join('')||'<p class="muted">No handovers recorded.</p>';
  $('#operations-timeline').innerHTML=(operationsData.timeline||[]).map(x=>`<div><span class="timeline-dot"></span><div><strong>${escapeHtml(x.title)}</strong><p>${escapeHtml(x.detail||'')}</p><time>${opFmt(x.created_at)}</time></div></div>`).join('')||'<p class="muted">No operational activity yet.</p>';
  const clientOptions='<option value="">No client</option>'+(operationsData.clients||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join(''); const staffOptions='<option value="">Unassigned</option>'+(operationsData.staff||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)} · ${escapeHtml(x.job_title||'Staff')}</option>`).join(''); if($('#operations-task-client'))$('#operations-task-client').innerHTML=clientOptions;if($('#operations-incident-client'))$('#operations-incident-client').innerHTML=clientOptions;if($('#operations-task-staff'))$('#operations-task-staff').innerHTML=staffOptions;
  $$('[data-op-complete]').forEach(b=>b.onclick=async()=>{await api(`/api/operations/tasks/${encodeURIComponent(b.dataset.opComplete)}/complete`,{method:'POST',body:'{}'});await loadOperationsBoard();});$$('[data-op-escalate]').forEach(b=>b.onclick=async()=>{await api(`/api/operations/tasks/${encodeURIComponent(b.dataset.opEscalate)}/escalate`,{method:'POST',body:'{}'});await loadOperationsBoard();});$$('[data-op-review]').forEach(b=>b.onclick=async()=>{const review=prompt('Manager review note:','Reviewed and closed.');if(review===null)return;await api(`/api/operations/incidents/${encodeURIComponent(b.dataset.opReview)}/review`,{method:'POST',body:JSON.stringify({review})});await loadOperationsBoard();});$$('[data-op-ack]').forEach(b=>b.onclick=async()=>{await api(`/api/operations/handovers/${encodeURIComponent(b.dataset.opAck)}/acknowledge`,{method:'POST',body:'{}'});await loadOperationsBoard();});
}
$('#operations-refresh-board')?.addEventListener('click',loadOperationsBoard);$('#operations-task-filter')?.addEventListener('change',renderOperationsBoard);$('#operations-new-task')?.addEventListener('click',()=>$('#operations-task-dialog')?.showModal());$('#operations-record-incident')?.addEventListener('click',()=>$('#operations-incident-dialog')?.showModal());$('#operations-add-handover')?.addEventListener('click',()=>$('#operations-handover-dialog')?.showModal());$$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.closeDialog)?.close()));
async function submitOperationsForm(form, endpoint, dialogId, submitButtonId) {
  const errorNode = form.querySelector('.form-error');
  const submitButton = document.getElementById(submitButtonId);
  if (errorNode) { errorNode.hidden = true; errorNode.textContent = ''; }
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Saving…'; }
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    await api(endpoint, { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    document.getElementById(dialogId)?.close();
    await loadOperationsBoard();
  } catch (error) {
    console.error(`CoreCare ${dialogId} submit failed`, error);
    if (errorNode) { errorNode.textContent = error.message || 'CoreCare could not save this record.'; errorNode.hidden = false; }
    showErrorToast?.(error.message || 'CoreCare could not save this record.');
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Create task'; }
  }
}

$('#operations-task-form')?.addEventListener('submit', e => {
  e.preventDefault();
  e.stopPropagation();
  submitOperationsForm(e.currentTarget, '/api/operations/tasks', 'operations-task-dialog', 'operations-task-submit');
});
$('#operations-incident-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api('/api/operations/incidents',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});e.currentTarget.reset();$('#operations-incident-dialog').close();await loadOperationsBoard();});$('#operations-handover-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api('/api/operations/handovers',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});e.currentTarget.reset();$('#operations-handover-dialog').close();await loadOperationsBoard();});


/* Electronic Call Monitoring 1.5.1 */

let rotaData={visits:[],clients:[],staff:[],stats:{}};
let rotaView='board';
let rotaSelected=new Set(),rotaClipboard=null,rotaUndoStack=[],rotaRedoStack=[],rotaContextVisitId=null;
const ROTA_START_HOUR=6, ROTA_END_HOUR=22, ROTA_HOUR_WIDTH=96;
function rotaIsoLocal(date){const d=new Date(date),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function rotaDayDates(){const base=new Date(($('#rota-week')?.value||mondayOf())+'T12:00:00');return Array.from({length:7},(_,i)=>new Date(base.getTime()+i*86400000));}
function selectedRotaDay(){return $('#rota-day')?.value||rotaDayDates()[0].toISOString().slice(0,10);}
async function loadRotaBoard(){const week=$('#rota-week');if(week&&!week.value)week.value=mondayOf();const from=week?.value||mondayOf(),to=new Date(new Date(from+'T12:00:00').getTime()+6*86400000).toISOString().slice(0,10);rotaData=await api(`/api/rota?from=${from}&to=${to}`);renderRotaBoard();}
function rotaStatus(v){return v.live_status||v.status||'scheduled';}
function rotaVisitDuration(v){const a=new Date(v.scheduled_start),b=v.scheduled_end?new Date(v.scheduled_end):new Date(a.getTime()+30*60000);return Math.max(15,Math.round((b-a)/60000));}
function rotaFilteredRows(){const status=$('#rota-status-filter')?.value||'all',staffFilter=$('#rota-staff-filter')?.value||'all';let rows=rotaData.visits||[];if(staffFilter!=='all')rows=rows.filter(v=>v.staff_id===staffFilter);if(status==='unallocated')rows=rows.filter(v=>!v.staff_id);else if(status!=='all')rows=rows.filter(v=>rotaStatus(v)===status);return rows;}
function setupRotaDaySelect(){const sel=$('#rota-day');if(!sel)return;const previous=sel.value,days=rotaDayDates();sel.innerHTML=days.map(d=>`<option value="${d.toISOString().slice(0,10)}">${d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</option>`).join('');sel.value=days.some(d=>d.toISOString().slice(0,10)===previous)?previous:days[0].toISOString().slice(0,10);}

function setupRotaStaffFilter(){const sel=$('#rota-staff-filter');if(!sel)return;const prev=sel.value||'all';sel.innerHTML='<option value="all">All staff</option>'+(rotaData.staff||[]).map(st=>`<option value="${escapeHtml(st.id)}">${escapeHtml(st.preferred_name||st.first_name)} ${escapeHtml(st.last_name)}</option>`).join('');sel.value=[...sel.options].some(o=>o.value===prev)?prev:'all';}
function updateRotaDateHeading(){const el=$('#rota-selected-date'),day=selectedRotaDay();if(el)el.textContent=new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
function changeRotaDay(offset){const d=new Date(selectedRotaDay()+'T12:00:00');d.setDate(d.getDate()+offset);const monday=new Date(d);const day=(monday.getDay()+6)%7;monday.setDate(monday.getDate()-day);const week=monday.toISOString().slice(0,10);if($('#rota-week').value!==week){$('#rota-week').value=week;loadRotaBoard().then(()=>{$('#rota-day').value=d.toISOString().slice(0,10);renderRotaVisualBoard();});}else{$('#rota-day').value=d.toISOString().slice(0,10);renderRotaVisualBoard();}}
function renderRotaBoard(){const s=rotaData.stats||{};setVisitText('#rota-total',s.total);setVisitText('#rota-unallocated',s.unallocated);setVisitText('#rota-late',s.late);setVisitText('#rota-progress',s.inProgress);setVisitText('#rota-completed',s.completed);const co='<option value="">Select client</option>'+(rotaData.clients||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join(''),so='<option value="">Unallocated</option>'+(rotaData.staff||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join('');if($('#rota-client'))$('#rota-client').innerHTML=co;if($('#rota-staff'))$('#rota-staff').innerHTML=so;setupRotaDaySelect();setupRotaStaffFilter();renderRotaVisualBoard();renderRotaWeek();renderRotaList();const has=(rotaData.visits||[]).length>0;if($('#rota-empty'))$('#rota-empty').hidden=has;}
function rotaVisitTypeClass(v){const t=String(v.visit_type||'').toLowerCase();if(t.includes('med'))return 'visit-type-medication';if(t.includes('compan'))return 'visit-type-companionship';if(t.includes('welfare')||t.includes('domestic')||t.includes('meal'))return 'visit-type-welfare';if(t.includes('personal'))return 'visit-type-personal';return 'visit-type-other';}
function rotaTimeHeader(cornerTitle,cornerSubtitle,hours){return `<div class="scheduler-header"><div class="scheduler-corner"><span>${escapeHtml(cornerTitle)}</span><small>${escapeHtml(cornerSubtitle)}</small></div>${hours.map(h=>`<div class="scheduler-hour"><strong>${String(h).padStart(2,'0')}:00</strong><span>${h<12?'Morning':h<17?'Afternoon':'Evening'}</span></div>`).join('')}</div>`;}
function allocateUnallocatedLanes(visits){const lanes=[];return [...visits].sort((a,b)=>new Date(a.scheduled_start)-new Date(b.scheduled_start)).map(v=>{const start=new Date(v.scheduled_start).getTime(),end=start+rotaVisitDuration(v)*60000;let lane=lanes.findIndex(lastEnd=>start>=lastEnd);if(lane<0){lane=lanes.length;lanes.push(end);}else lanes[lane]=end;return {v,lane};});}
function recommendedAllocationHeight(count,laneCount){if(!count)return 260;const byRows=150+Math.max(1,laneCount)*74;const byVolume=count>30?500:count>15?410:count>6?330:280;return Math.min(580,Math.max(byRows,byVolume));}
function applyAllocationPanelHeight(height,manual=false){const panel=$('#rota-unallocated-panel'),label=$('#rota-allocation-size-label');if(!panel)return;const safe=Math.max(240,Math.min(650,Math.round(height)));panel.style.height=`${safe}px`;panel.dataset.manual=manual?'true':'false';if(label)label.textContent=manual?`Custom height · ${safe}px`:`Adaptive height · ${safe}px`;}
function rotaSnapMinutes(){return Math.max(5,Number($('#rota-snap')?.value||localStorage.getItem('corecare_rota_snap')||15));}
function rotaSnapshot(v){return {id:v.id,clientId:v.client_id,staffId:v.staff_id||'',visitType:v.visit_type,scheduledStart:v.scheduled_start,scheduledEnd:v.scheduled_end,plannerNotes:v.planner_notes||'',plannerLocked:Number(v.planner_locked)||0};}
function updatePlannerActionState(){const count=rotaSelected.size,selection=$('#rota-selection-count');if(selection){selection.hidden=!count;selection.textContent=`${count} selected`;}if($('#rota-copy'))$('#rota-copy').disabled=count!==1;if($('#rota-paste'))$('#rota-paste').disabled=!rotaClipboard;if($('#rota-undo'))$('#rota-undo').disabled=!rotaUndoStack.length;if($('#rota-redo'))$('#rota-redo').disabled=!rotaRedoStack.length;}
function selectRotaVisit(id,add=false){if(!add)rotaSelected.clear();if(add&&rotaSelected.has(id))rotaSelected.delete(id);else rotaSelected.add(id);document.querySelectorAll('[data-rota-drag]').forEach(el=>el.classList.toggle('is-selected',rotaSelected.has(el.dataset.rotaDrag)));updatePlannerActionState();}
function hideRotaContextMenu(){const menu=$('#rota-context-menu');if(menu)menu.hidden=true;rotaContextVisitId=null;}
function showRotaContextMenu(e,id){e.preventDefault();selectRotaVisit(id,e.ctrlKey||e.metaKey);rotaContextVisitId=id;const menu=$('#rota-context-menu');if(!menu)return;menu.hidden=false;menu.style.left=`${Math.min(e.clientX,window.innerWidth-230)}px`;menu.style.top=`${Math.min(e.clientY,window.innerHeight-360)}px`;const v=(rotaData.visits||[]).find(x=>x.id===id),lock=menu.querySelector('[data-rota-action="lock"]');if(lock)lock.textContent=Number(v?.planner_locked)?'Unlock visit':'Lock visit';}
function updateEditTimeLabel(){const input=$('#rota-edit-start'),label=$('#rota-edit-time-label');if(input&&label&&input.value)label.textContent=new Date(input.value).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function openRotaEdit(id){hideRotaContextMenu();const v=(rotaData.visits||[]).find(x=>x.id===id);if(!v)return;const f=$('#rota-edit-form');f.reset();f.elements.id.value=v.id;f.elements.scheduledStart.value=rotaIsoLocal(v.scheduled_start);f.elements.duration.value=rotaVisitDuration(v);f.elements.plannerNotes.value=v.planner_notes||'';f.elements.plannerLocked.checked=Number(v.planner_locked)===1;const staff=$('#rota-edit-staff');staff.innerHTML='<option value="">Unallocated</option>'+(rotaData.staff||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join('');staff.value=v.staff_id||'';$('#rota-edit-summary').innerHTML=`<strong>${escapeHtml(v.client_name||'Client')}</strong><span>${escapeHtml(v.visit_type||'Care visit')} · ${rotaVisitDuration(v)} minutes</span>`;$('#rota-edit-travel').innerHTML=`Travel before: <strong>${Number(v.travel_before_minutes||0)} minutes</strong>${v.travel_before_miles?` · ${Number(v.travel_before_miles).toFixed(1)} miles`:''}. Travel will be recalculated when saved.`;$('#rota-edit-error').hidden=true;updateEditTimeLabel();$('#rota-edit-dialog').showModal();}
async function patchRotaVisit(id,payload,{recordUndo=true}={}){const current=(rotaData.visits||[]).find(x=>x.id===id);if(!current)return;const before=rotaSnapshot(current);try{await api(`/api/rota/${id}`,{method:'PATCH',body:JSON.stringify(payload)});if(recordUndo){rotaUndoStack.push({before,after:{...before,...payload,id}});rotaRedoStack=[];}await loadRotaBoard();await loadVisitsBoardNoSync();updatePlannerActionState();}catch(e){if(!payload.travelOverrideReason&&e.message.includes('Travel time requires')){const reason=prompt(`${e.message}\n\nEnter an authorised override reason, or press Cancel to leave the visit unchanged:`);if(reason?.trim())return patchRotaVisit(id,{...payload,travelOverrideReason:reason.trim()},{recordUndo});}throw e;}}
async function nudgeRotaVisits(minutes,ids=[...rotaSelected]){for(const id of ids){const v=(rotaData.visits||[]).find(x=>x.id===id);if(!v||Number(v.planner_locked))continue;const start=new Date(v.scheduled_start);start.setMinutes(start.getMinutes()+minutes);const end=new Date(start.getTime()+rotaVisitDuration(v)*60000);await patchRotaVisit(id,{clientId:v.client_id,staffId:v.staff_id||'',visitType:v.visit_type,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),scope:'single',reason:`Planner nudge ${minutes>0?'+':''}${minutes} minutes`,plannerNotes:v.planner_notes||'',plannerLocked:false});}}
async function copySelectedRota(){const id=[...rotaSelected][0],v=(rotaData.visits||[]).find(x=>x.id===id);if(!v)return;rotaClipboard=rotaSnapshot(v);updatePlannerActionState();}
async function pasteRotaVisit(){if(!rotaClipboard)return;const day=selectedRotaDay(),source=new Date(rotaClipboard.scheduledStart),start=new Date(`${day}T${String(source.getHours()).padStart(2,'0')}:${String(source.getMinutes()).padStart(2,'0')}:00`),duration=Math.max(15,(new Date(rotaClipboard.scheduledEnd)-source)/60000||30),end=new Date(start.getTime()+duration*60000);await api('/api/rota',{method:'POST',body:JSON.stringify({clientId:rotaClipboard.clientId,staffId:rotaClipboard.staffId,visitType:rotaClipboard.visitType,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),recurrence:'none'})});await loadRotaBoard();}
async function undoRota(){const action=rotaUndoStack.pop();if(!action)return;rotaRedoStack.push(action);const b=action.before;await patchRotaVisit(b.id,{clientId:b.clientId,staffId:b.staffId,visitType:b.visitType,scheduledStart:b.scheduledStart,scheduledEnd:b.scheduledEnd,scope:'single',reason:'Planner undo',plannerNotes:b.plannerNotes,plannerLocked:Boolean(b.plannerLocked),unlockRequested:true},{recordUndo:false});updatePlannerActionState();}
async function redoRota(){const action=rotaRedoStack.pop();if(!action)return;rotaUndoStack.push(action);const a=action.after;await patchRotaVisit(a.id,{clientId:a.clientId,staffId:a.staffId,visitType:a.visitType,scheduledStart:a.scheduledStart,scheduledEnd:a.scheduledEnd,scope:'single',reason:'Planner redo',plannerNotes:a.plannerNotes||'',plannerLocked:Boolean(a.plannerLocked),unlockRequested:true},{recordUndo:false});updatePlannerActionState();}
function renderRotaVisualBoard(){updateRotaDateHeading();const day=selectedRotaDay(),rows=rotaFilteredRows().filter(v=>v.scheduled_start.slice(0,10)===day),unallocated=rows.filter(v=>!v.staff_id),hours=Array.from({length:ROTA_END_HOUR-ROTA_START_HOUR},(_,i)=>ROTA_START_HOUR+i);if($('#rota-queue-count'))$('#rota-queue-count').textContent=String(unallocated.length);
 const unallocatedScheduler=$('#rota-unallocated-scheduler');if(unallocatedScheduler){const placed=allocateUnallocatedLanes(unallocated),laneCount=Math.max(1,...placed.map(x=>x.lane+1));const subtitle=new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});const cards=placed.map(({v,lane})=>{const d=new Date(v.scheduled_start),left=(d.getHours()+d.getMinutes()/60-ROTA_START_HOUR)*ROTA_HOUR_WIDTH,width=Math.max(52,rotaVisitDuration(v)/60*ROTA_HOUR_WIDTH);return `<article class="unallocated-timeline-visit ${rotaVisitTypeClass(v)}" draggable="${Number(v.planner_locked)?'false':'true'}" data-rota-drag="${v.id}" data-rota-open="${v.id}" style="left:${Math.max(0,left)}px;top:${12+lane*68}px;width:${width}px" title="${escapeHtml(v.client_name||'Client')} – ${rotaVisitDuration(v)} minutes"><span class="scheduler-visit-time">${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span><strong>${escapeHtml(v.client_name||'Client')}</strong><span>${escapeHtml(v.visit_type||'Care visit')} · ${rotaVisitDuration(v)} min</span></article>`;}).join('');const empty=!unallocated.length?'<div class="unallocated-empty-state"><span>✓</span><strong>No visits waiting for allocation</strong><small>New unassigned visits will appear at their required time.</small></div>':'';unallocatedScheduler.innerHTML=rotaTimeHeader('Unallocated','Required visit times',hours)+`<div class="unallocated-drop-lane" style="height:${Math.max(110,laneCount*68+24)}px">${cards}${empty}</div>`;
  const saved=Number(localStorage.getItem('corecare_rota_allocation_height')||0),manual=saved>=240;if(manual)applyAllocationPanelHeight(saved,true);else applyAllocationPanelHeight(recommendedAllocationHeight(unallocated.length,laneCount),false);
 }
 const scheduler=$('#rota-scheduler');if(!scheduler)return;const staff=rotaData.staff||[];const header=rotaTimeHeader('Care worker',new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}),hours);if(!staff.length){const placeholders=Array.from({length:4},(_,i)=>`<div class="scheduler-row scheduler-placeholder-row"><button class="scheduler-staff scheduler-add-staff" type="button" data-page-link="staff"><span class="staff-avatar">+</span><div><strong>${i===0?'Add care workers':'Available staff row'}</strong><small>${i===0?'Create active staff records to start allocating':'Waiting for an active care worker'}</small></div></button><div class="scheduler-lane scheduler-placeholder-lane"></div></div>`).join('');scheduler.innerHTML=header+placeholders+`<div class="scheduler-empty-overlay"><strong>Your planning grid is ready</strong><span>Add active care workers and visits to begin building the rota.</span><button type="button" class="primary-button compact" data-page-link="staff">Add care worker</button></div>`;scheduler.querySelectorAll('[data-page-link]').forEach(b=>b.addEventListener('click',()=>navigateTo('staff')));wireRotaDragging();wireRotaScrollSync();wireAllocationSplitter();return;}scheduler.innerHTML=header+staff.map(st=>{const visits=rows.filter(v=>v.staff_id===st.id),minutes=visits.reduce((sum,v)=>sum+rotaVisitDuration(v),0),util=Math.min(100,Math.round(minutes/480*100));return `<div class="scheduler-row"><div class="scheduler-staff"><span class="staff-avatar">${escapeHtml(((st.preferred_name||st.first_name||'?')[0]+(st.last_name||'')[0]).toUpperCase())}</span><div class="scheduler-staff-copy"><strong>${escapeHtml(st.preferred_name||st.first_name)} ${escapeHtml(st.last_name)}</strong><small>${escapeHtml(st.job_title||'Care worker')} · ${visits.length} visit${visits.length===1?'':'s'}</small><span class="staff-utilisation"><i style="width:${util}%"></i></span><em>${util}% scheduled</em></div></div><div class="scheduler-lane" data-staff-id="${st.id}">${visits.map(renderSchedulerVisit).join('')}</div></div>`}).join('');
 const now=new Date();if(now.toISOString().slice(0,10)===day&&now.getHours()>=ROTA_START_HOUR&&now.getHours()<ROTA_END_HOUR){const x=((now.getHours()+now.getMinutes()/60)-ROTA_START_HOUR)*ROTA_HOUR_WIDTH;scheduler.querySelectorAll('.scheduler-lane').forEach(l=>l.insertAdjacentHTML('beforeend',`<i class="scheduler-now" style="left:${x}px"></i>`));unallocatedScheduler?.querySelector('.unallocated-drop-lane')?.insertAdjacentHTML('beforeend',`<i class="scheduler-now" style="left:${x}px"></i>`);}
 wireRotaDragging();wireRotaResize();wireRotaScrollSync();wireAllocationSplitter();}
function wireRotaScrollSync(){const a=$('#rota-unallocated-scroll'),b=$('#rota-worker-scroll');if(!a||!b)return;let syncing=false;const sync=(from,to)=>{if(syncing)return;syncing=true;to.scrollLeft=from.scrollLeft;requestAnimationFrame(()=>syncing=false);};a.onscroll=()=>sync(a,b);b.onscroll=()=>sync(b,a);}
function wireAllocationSplitter(){const splitter=$('#rota-board-splitter'),panel=$('#rota-unallocated-panel');if(!splitter||!panel||splitter.dataset.wired==='true')return;splitter.dataset.wired='true';const resizeTo=y=>{const top=panel.getBoundingClientRect().top;applyAllocationPanelHeight(y-top,true);localStorage.setItem('corecare_rota_allocation_height',String(Math.round(Math.max(240,Math.min(650,y-top)))));};splitter.addEventListener('pointerdown',e=>{e.preventDefault();splitter.setPointerCapture?.(e.pointerId);document.body.classList.add('resizing-rota-allocation');const move=ev=>resizeTo(ev.clientY);const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.body.classList.remove('resizing-rota-allocation');};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});});splitter.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const current=panel.getBoundingClientRect().height,next=current+(e.key==='ArrowDown'?30:-30);applyAllocationPanelHeight(next,true);localStorage.setItem('corecare_rota_allocation_height',String(Math.round(next)));});$('#rota-allocation-reset')?.addEventListener('click',()=>{localStorage.removeItem('corecare_rota_allocation_height');renderRotaVisualBoard();});}
function renderSchedulerVisit(v){const d=new Date(v.scheduled_start),mins=(d.getHours()+d.getMinutes()/60-ROTA_START_HOUR)*ROTA_HOUR_WIDTH,duration=rotaVisitDuration(v),width=Math.max(42,duration/60*ROTA_HOUR_WIDTH),travel=Number(v.travel_before_minutes||0),travelWidth=travel/60*ROTA_HOUR_WIDTH,travelLeft=Math.max(0,mins-travelWidth);const travelBlock=travel>0?`<span class="scheduler-travel ${v.travel_conflict?'conflict':''}" style="left:${travelLeft}px;width:${Math.max(18,travelWidth)}px" title="${travel} minutes travel${v.travel_before_miles?` · ${Number(v.travel_before_miles).toFixed(1)} miles`:''}"><b>🚗 ${travel}m</b></span>`:'';const locked=Number(v.planner_locked)===1;return `${travelBlock}<article class="scheduler-visit ${escapeHtml(rotaStatus(v))} ${rotaVisitTypeClass(v)} ${v.travel_conflict?'travel-risk':''} ${locked?'is-locked':''} ${v.planner_notes?'has-notes':''}" draggable="${locked?'false':'true'}" data-rota-drag="${v.id}" data-rota-open="${v.id}" style="left:${Math.max(0,mins)}px;width:${width}px" title="${escapeHtml(v.client_name||'Client')} – ${duration} minutes${travel?` · ${travel} minutes travel before`:''}${v.planner_notes?` · Note: ${escapeHtml(v.planner_notes)}`:''}"><span class="scheduler-visit-time">${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span><strong>${escapeHtml(v.client_name||'Client')}</strong><span>${escapeHtml(v.visit_type||'Care visit')} · ${duration} min</span>${v.travel_conflict?'<em>⚠ Travel shortfall</em>':''}${locked?'':`<i class="scheduler-resize" data-rota-resize="${v.id}"></i>`}</article>`;}
function renderRotaWeek(){const grid=$('#rota-week-grid');if(!grid)return;const rows=rotaFilteredRows();grid.innerHTML=rotaDayDates().map(d=>{const day=d.toISOString().slice(0,10),items=rows.filter(v=>v.scheduled_start.slice(0,10)===day);return `<section class="rota-week-day"><header><strong>${d.toLocaleDateString('en-GB',{weekday:'long'})}</strong><br><small>${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</small></header>${items.map(v=>`<article class="rota-week-card"><strong>${new Date(v.scheduled_start).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})} ${escapeHtml(v.client_name||'Client')}</strong><small>${escapeHtml(v.staff_name||'Unallocated')} · ${escapeHtml(rotaStatus(v).replaceAll('_',' '))}</small></article>`).join('')||'<p class="rota-drop-message">No visits</p>'}</section>`}).join('');}
function renderRotaList(){const rows=rotaFilteredRows(),groups={};rows.forEach(v=>{const day=v.scheduled_start.slice(0,10);(groups[day]??=[]).push(v)});const grid=$('#rota-grid');if(grid)grid.innerHTML=Object.entries(groups).map(([day,items])=>`<section class="rota-day"><header><strong>${new Date(day+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'})}</strong><span>${new Date(day+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></header>${items.map(v=>`<article class="rota-visit"><time>${new Date(v.scheduled_start).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time><div><strong>${escapeHtml(v.client_name||'Client')}</strong><span>${escapeHtml(v.visit_type)} · ${escapeHtml(v.staff_name||'Unallocated')}</span></div><span class="badge ${rotaStatus(v)==='late'||rotaStatus(v)==='overrunning'?'danger':v.status==='completed'?'success':v.status==='in_progress'?'active':'neutral'}">${escapeHtml(rotaStatus(v).replaceAll('_',' '))}</span>${v.status==='scheduled'?`<button class="text-button" data-rota-cancel="${v.id}">Cancel</button>`:''}</article>`).join('')}</section>`).join('');document.querySelectorAll('[data-rota-cancel]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Cancel this rota visit?'))return;await api(`/api/rota/${b.dataset.rotaCancel}/cancel`,{method:'POST',body:JSON.stringify({reason:'Cancelled by manager'})});await loadRotaBoard();await loadVisitsBoardNoSync();}));}
async function moveRotaVisit(id,staffId,startDate,duration,travelOverrideReason=''){const v=(rotaData.visits||[]).find(x=>x.id===id);if(!v)return;if(Number(v.planner_locked))return alert('This visit is locked. Open it and unlock it before moving.');const start=new Date(startDate),end=new Date(start.getTime()+(duration||rotaVisitDuration(v))*60000),payload={clientId:v.client_id,staffId:staffId||'',visitType:v.visit_type,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),scope:'single',reason:'Planner drag-and-drop adjustment',travelOverrideReason,plannerNotes:v.planner_notes||'',plannerLocked:false};try{await patchRotaVisit(id,payload);}catch(e){alert(e.message);}}
function wireRotaDragging(){document.querySelectorAll('[data-rota-drag]').forEach(el=>{el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/rota-id',el.dataset.rotaDrag);e.dataTransfer.effectAllowed='move';document.body.classList.add('rota-is-dragging');});el.addEventListener('dragend',()=>document.body.classList.remove('rota-is-dragging'));});document.querySelectorAll('.scheduler-lane').forEach(lane=>{lane.addEventListener('dragover',e=>{e.preventDefault();lane.classList.add('drag-over')});lane.addEventListener('dragleave',()=>lane.classList.remove('drag-over'));lane.addEventListener('drop',async e=>{e.preventDefault();lane.classList.remove('drag-over');const id=e.dataTransfer.getData('text/rota-id');if(!id)return;const rect=lane.getBoundingClientRect(),raw=(e.clientX-rect.left)/ROTA_HOUR_WIDTH+ROTA_START_HOUR,rounded=Math.round((raw*60)/rotaSnapMinutes())*rotaSnapMinutes()/60,day=selectedRotaDay(),start=new Date(`${day}T00:00:00`);start.setHours(Math.floor(rounded),Math.round((rounded%1)*60),0,0);await moveRotaVisit(id,lane.dataset.staffId,start);});});document.querySelectorAll('.unallocated-drop-lane').forEach(lane=>{lane.addEventListener('dragover',e=>{e.preventDefault();lane.classList.add('drag-over')});lane.addEventListener('dragleave',()=>lane.classList.remove('drag-over'));lane.addEventListener('drop',async e=>{e.preventDefault();lane.classList.remove('drag-over');const id=e.dataTransfer.getData('text/rota-id'),v=(rotaData.visits||[]).find(x=>x.id===id);if(!v)return;const rect=lane.getBoundingClientRect(),raw=(e.clientX-rect.left)/ROTA_HOUR_WIDTH+ROTA_START_HOUR,rounded=Math.round((raw*60)/rotaSnapMinutes())*rotaSnapMinutes()/60,start=new Date(`${selectedRotaDay()}T00:00:00`);start.setHours(Math.floor(rounded),Math.round((rounded%1)*60),0,0);await moveRotaVisit(id,'',start);});});}
function wireRotaResize(){document.querySelectorAll('[data-rota-resize]').forEach(handle=>{handle.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();const id=handle.dataset.rotaResize,v=(rotaData.visits||[]).find(x=>x.id===id),card=handle.closest('.scheduler-visit'),startX=e.clientX,startWidth=card.offsetWidth;const move=ev=>{card.style.width=Math.max(42,startWidth+ev.clientX-startX)+'px'};const up=async ev=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);const mins=Math.max(15,Math.round(((startWidth+ev.clientX-startX)/ROTA_HOUR_WIDTH*60)/rotaSnapMinutes())*rotaSnapMinutes());await moveRotaVisit(id,v.staff_id,new Date(v.scheduled_start),mins)};document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);});});}
function setRotaView(view){rotaView=view;document.querySelectorAll('[data-rota-view]').forEach(b=>b.classList.toggle('active',b.dataset.rotaView===view));$('#rota-board-view').hidden=view!=='board';$('#rota-week-view').hidden=view!=='week';$('#rota-list-view').hidden=view!=='list';$('#rota-day-label').hidden=view!=='board';}
$('#rota-new')?.addEventListener('click',async()=>{if(!rotaData.clients?.length)await loadRotaBoard();$('#rota-form')?.reset();$('#rota-dialog')?.showModal();});$('#rota-refresh')?.addEventListener('click',loadRotaBoard);$('#rota-week')?.addEventListener('change',loadRotaBoard);$('#rota-day')?.addEventListener('change',renderRotaVisualBoard);$('#rota-status-filter')?.addEventListener('change',renderRotaBoard);$('#rota-staff-filter')?.addEventListener('change',renderRotaVisualBoard);$('#rota-prev-day')?.addEventListener('click',()=>changeRotaDay(-1));$('#rota-next-day')?.addEventListener('click',()=>changeRotaDay(1));$('#rota-today')?.addEventListener('click',()=>{const today=new Date(),m=new Date(today),d=(m.getDay()+6)%7;m.setDate(m.getDate()-d);$('#rota-week').value=m.toISOString().slice(0,10);loadRotaBoard().then(()=>{$('#rota-day').value=today.toISOString().slice(0,10);renderRotaVisualBoard();});});document.querySelectorAll('[data-rota-view]').forEach(b=>b.addEventListener('click',()=>setRotaView(b.dataset.rotaView)));
$('#rota-form')?.addEventListener('submit',async e=>{e.preventDefault();const err=$('#rota-form-error');if(err)err.hidden=true;try{const r=await api('/api/rota',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});e.currentTarget.reset();$('#rota-dialog')?.close();await loadRotaBoard();await loadVisitsBoardNoSync();if(r.created>1)alert(`${r.created} weekly visits published.`);}catch(ex){if(err){err.textContent=ex.message;err.hidden=false;}}});

document.addEventListener('click',e=>{const card=e.target.closest?.('[data-rota-open]');if(card&&!e.target.closest('[data-rota-resize]'))selectRotaVisit(card.dataset.rotaOpen,e.ctrlKey||e.metaKey);if(!e.target.closest?.('#rota-context-menu'))hideRotaContextMenu();});
document.addEventListener('dblclick',e=>{const card=e.target.closest?.('[data-rota-open]');if(card)openRotaEdit(card.dataset.rotaOpen);});
document.addEventListener('contextmenu',e=>{const card=e.target.closest?.('[data-rota-open]');if(card)showRotaContextMenu(e,card.dataset.rotaOpen);});
$('#rota-snap')?.addEventListener('change',e=>localStorage.setItem('corecare_rota_snap',e.target.value));if($('#rota-snap'))$('#rota-snap').value=localStorage.getItem('corecare_rota_snap')||'15';
$('#rota-copy')?.addEventListener('click',copySelectedRota);$('#rota-paste')?.addEventListener('click',pasteRotaVisit);$('#rota-undo')?.addEventListener('click',undoRota);$('#rota-redo')?.addEventListener('click',redoRota);
document.querySelectorAll('[data-edit-nudge]').forEach(b=>b.addEventListener('click',()=>{const input=$('#rota-edit-start');if(!input.value)return;const d=new Date(input.value);d.setMinutes(d.getMinutes()+Number(b.dataset.editNudge));input.value=rotaIsoLocal(d);updateEditTimeLabel();}));$('#rota-edit-start')?.addEventListener('change',updateEditTimeLabel);
$('#rota-edit-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,id=f.elements.id.value,v=(rotaData.visits||[]).find(x=>x.id===id),start=new Date(f.elements.scheduledStart.value),end=new Date(start.getTime()+Number(f.elements.duration.value)*60000),err=$('#rota-edit-error');try{await patchRotaVisit(id,{clientId:v.client_id,staffId:f.elements.staffId.value,visitType:v.visit_type,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),scope:f.elements.scope.value,reason:f.elements.reason.value,plannerNotes:f.elements.plannerNotes.value,plannerLocked:f.elements.plannerLocked.checked,unlockRequested:Number(v.planner_locked)===1&&!f.elements.plannerLocked.checked});$('#rota-edit-dialog').close();}catch(ex){err.textContent=ex.message;err.hidden=false;}});
$('#rota-context-menu')?.addEventListener('click',async e=>{const action=e.target.dataset.rotaAction;if(!action||!rotaContextVisitId)return;const id=rotaContextVisitId,v=(rotaData.visits||[]).find(x=>x.id===id);hideRotaContextMenu();try{if(action==='edit')return openRotaEdit(id);if(action==='copy'){selectRotaVisit(id);return copySelectedRota();}if(action.startsWith('nudge-')){const mins=action.includes('back')?-Number(action.split('-').pop()):Number(action.split('-').pop());return nudgeRotaVisits(mins,[id]);}if(action==='duplicate'){rotaClipboard=rotaSnapshot(v);return pasteRotaVisit();}if(action==='lock'){return patchRotaVisit(id,{clientId:v.client_id,staffId:v.staff_id||'',visitType:v.visit_type,scheduledStart:v.scheduled_start,scheduledEnd:v.scheduled_end,scope:'single',reason:Number(v.planner_locked)?'Visit unlocked':'Visit locked',plannerNotes:v.planner_notes||'',plannerLocked:!Number(v.planner_locked),unlockRequested:true});}if(action==='split'){const total=rotaVisitDuration(v);if(total<30)return alert('Visits shorter than 30 minutes cannot be split.');const first=Math.round((total/2)/5)*5,second=total-first,start=new Date(v.scheduled_start),mid=new Date(start.getTime()+first*60000),end=new Date(v.scheduled_end);await patchRotaVisit(id,{clientId:v.client_id,staffId:v.staff_id||'',visitType:v.visit_type,scheduledStart:start.toISOString(),scheduledEnd:mid.toISOString(),scope:'single',reason:'Visit split by planner',plannerNotes:v.planner_notes||'',plannerLocked:false});await api('/api/rota',{method:'POST',body:JSON.stringify({clientId:v.client_id,staffId:v.staff_id||'',visitType:`${v.visit_type} (part 2)`,scheduledStart:mid.toISOString(),scheduledEnd:end.toISOString(),recurrence:'none'})});return loadRotaBoard();}}catch(ex){alert(ex.message);}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoRota():undoRota();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&rotaSelected.size===1&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();copySelectedRota();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&rotaClipboard&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();pasteRotaVisit();}if(e.key==='Escape')hideRotaContextMenu();});
updatePlannerActionState();

let visitsData={visits:[],clients:[],staff:[],codes:[],stats:{}};
const VISIT_QUEUE_KEY='corecare_visit_event_queue_v1';
function visitQueue(){try{return JSON.parse(localStorage.getItem(VISIT_QUEUE_KEY)||'[]')}catch{return[]}}
function saveVisitQueue(q){localStorage.setItem(VISIT_QUEUE_KEY,JSON.stringify(q));renderSyncStatus();}
function setVisitText(sel,val){const n=$(sel);if(n)n.textContent=String(val??0)}
async function loadVisitsBoard(){visitsData=await api('/api/visits/board');renderVisitsBoard();await syncPendingVisitEvents();}
function renderVisitsBoard(){const s=visitsData.stats||{};setVisitText('#visit-scheduled',s.scheduled);setVisitText('#visit-progress',s.inProgress);setVisitText('#visit-late',s.late);setVisitText('#visit-completed',s.completed);setVisitText('#visit-overrunning',s.overrunning);
 const list=$('#visits-live-list');if(list)list.innerHTML=(visitsData.visits||[]).map(v=>`<article class="operations-row"><div class="operations-row-status ${escapeHtml(v.live_status||v.status)}"></div><div><strong>${escapeHtml(v.client_name||'Client')}</strong><p>${escapeHtml(v.visit_type||'Care visit')}</p><small>${opFmt(v.scheduled_start)} · ${escapeHtml(v.staff_name||'Unallocated')}</small></div><span class="badge ${v.live_status==='late'||v.live_status==='overrunning'?'danger':v.status==='completed'?'success':v.status==='in_progress'?'active':'neutral'}">${escapeHtml((v.live_status||v.status).replaceAll('_',' '))}</span></article>`).join('')||'<div class="empty-state"><strong>No visits today</strong><span>Schedule a visit to begin live monitoring.</span></div>';
 const co='<option value="">Select client</option>'+(visitsData.clients||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join('');const so='<option value="">Unallocated</option>'+(visitsData.staff||[]).map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.preferred_name||x.first_name)} ${escapeHtml(x.last_name)}</option>`).join('');if($('#visit-client'))$('#visit-client').innerHTML=co;if($('#visit-code-client'))$('#visit-code-client').innerHTML=co;if($('#visit-staff'))$('#visit-staff').innerHTML=so;renderSyncStatus();}
function renderSyncStatus(){const q=visitQueue(),n=$('#visit-sync-status');if(n)n.innerHTML=q.length?`<strong>${q.length} event${q.length===1?'':'s'} saved offline</strong><span>CoreCare will retry automatically. <button id="visit-sync-now" class="text-button">Sync now</button></span>`:'<strong>All visit events synced</strong><span>No offline records waiting.</span>';$('#visit-sync-now')?.addEventListener('click',syncPendingVisitEvents);}
async function queueVisitEvent(type,code){const event={eventId:crypto.randomUUID(),type,code:code.trim(),deviceTime:new Date().toISOString(),source:navigator.onLine?'online':'offline'};const q=visitQueue();q.push(event);saveVisitQueue(q);await syncPendingVisitEvents();}
async function syncPendingVisitEvents(){const q=visitQueue();if(!q.length||!navigator.onLine)return;try{const response=await api('/api/visits/sync',{method:'POST',body:JSON.stringify({events:q})});const ok=new Set((response.results||[]).filter(x=>x.ok).map(x=>x.eventId));saveVisitQueue(q.filter(x=>!ok.has(x.eventId)));if(ok.size)await loadVisitsBoardNoSync();}catch(e){console.warn('Visit sync deferred',e);renderSyncStatus();}}
async function loadVisitsBoardNoSync(){visitsData=await api('/api/visits/board');renderVisitsBoard();}
$('#visits-refresh')?.addEventListener('click',loadVisitsBoard);$('#visit-new')?.addEventListener('click',()=>$('#visit-dialog')?.showModal());$('#visit-clock')?.addEventListener('click',()=>$('#visit-clock-dialog')?.showModal());$('#visit-code')?.addEventListener('click',()=>$('#visit-code-dialog')?.showModal());
$('#visit-form')?.addEventListener('submit',async e=>{e.preventDefault();await api('/api/visits',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});e.currentTarget.reset();$('#visit-dialog')?.close();await loadVisitsBoard();});
$('#visit-code-form')?.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const r=await api('/api/visits/client-code',{method:'POST',body:JSON.stringify(data)});$('#visit-code-result').textContent=r.code;$('#visit-code-result-wrap').hidden=false;});
$('#visit-clock-form')?.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));await queueVisitEvent(data.type,data.code);$('#visit-clock-dialog')?.close();e.currentTarget.reset();});
window.addEventListener('online',syncPendingVisitEvents);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncPendingVisitEvents()});setInterval(syncPendingVisitEvents,60000);renderSyncStatus();


function populatePermissionUserSelect(){const s=$('#permission-user');if(!s)return;const value=s.value;s.innerHTML='<option value="">Select a user</option>'+users.filter(u=>u.status==='active').map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.displayName)} · ${escapeHtml(roleLabel(u.accessLevel||u.role))}</option>`).join('');s.value=value;}
async function loadRoutingSettings(){const form=$('#routing-settings-form');if(!form)return;try{const p=await api('/api/routing/settings'),s=p.settings||{};form.provider.value=s.provider||'manual';form.defaultTravelMinutes.value=s.default_travel_minutes??15;form.parkingBufferMinutes.value=s.parking_buffer_minutes??5;form.cacheDays.value=s.cache_days??90;form.blockConflicts.checked=s.block_conflicts!==0;setText('#routing-provider-status',p.mapboxConfigured?'Mapbox key configured':'Mapbox key not configured — manual fallback remains active');}catch(e){setText('#routing-provider-status',e.message);}}
$('#routing-settings-form')?.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#routing-settings-message');try{await api('/api/routing/settings',{method:'PUT',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});msg.textContent='Travel settings saved.';msg.hidden=false;await loadRoutingSettings();}catch(ex){msg.textContent=ex.message;msg.hidden=false;}});
async function loadOrganisationModules(){const el=$('#organisation-module-list');if(!el)return;try{const p=await api('/api/security/modules');const labels={dashboard:'Dashboard',operations:'Live operations',clients:'Clients',staff:'Staff',family:'Family portal',care:'Care plans',medication:'Medication',visits:'Visits',rota:'Scheduling & rota',tasks:'Tasks',incidents:'Incidents',finance:'Finance',reports:'Reports',settings:'Settings'};el.innerHTML=(p.modules||[]).map(m=>`<label class="module-toggle ${m.enabled?'is-enabled':'is-disabled'}"><span class="module-icon">${({dashboard:'⌂',operations:'◆',clients:'●',staff:'◉',family:'◇',care:'▤',medication:'✚',visits:'◷',rota:'▦',tasks:'✓',incidents:'!',finance:'£',reports:'▥',settings:'⚙'})[m.module_key]||'•'}</span><span class="module-copy"><b>${escapeHtml(labels[m.module_key]||m.module_key)}</b><small>${m.enabled?'Visible to users with permission':'Hidden for everyone in this organisation'}</small></span><span class="switch-control"><input type="checkbox" data-module-key="${escapeHtml(m.module_key)}" ${m.enabled?'checked':''}><i></i></span></label>`).join('');el.querySelectorAll('[data-module-key]').forEach(x=>x.addEventListener('change',()=>x.closest('.module-toggle')?.classList.toggle('is-enabled',x.checked)));}catch(e){el.innerHTML=`<p class="muted">${escapeHtml(e.message)}</p>`;}}
$('#save-organisation-modules')?.addEventListener('click',async()=>{const modules={};$$('[data-module-key]').forEach(x=>modules[x.dataset.moduleKey]=x.checked);const m=$('#module-save-message');try{await api('/api/security/modules',{method:'PUT',body:JSON.stringify({modules})});m.textContent='Organisation modules updated. Users will see the change next time they sign in.';m.hidden=false;}catch(e){m.textContent=e.message;m.hidden=false;}});
$('#load-user-permissions')?.addEventListener('click',async()=>{const userId=$('#permission-user')?.value,el=$('#user-permission-editor');if(!userId){el.innerHTML='<p class="muted">Select a user first.</p>';return;}try{const p=await api(`/api/security/users/${encodeURIComponent(userId)}/permissions`),state=Object.fromEntries((p.overrides||[]).map(x=>[x.permission_key,x.effect]));el.innerHTML=`<div class="effective-access-heading"><strong>${escapeHtml(p.user.display_name)}</strong><span>Individual overrides</span></div><div class="permission-override-grid">${permissionCatalogue.map(x=>`<div class="permission-override-row"><span><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.category)} · ${escapeHtml(x.description||'')}</small></span><div class="permission-segment"><label class="permission-state"><input type="radio" name="override-${escapeHtml(x.permission_key)}" value="inherit" ${!state[x.permission_key]?'checked':''}><span>Inherit</span></label><label class="permission-state allow"><input type="radio" name="override-${escapeHtml(x.permission_key)}" value="allow" ${state[x.permission_key]==='allow'?'checked':''}><span>Allow</span></label><label class="permission-state deny"><input type="radio" name="override-${escapeHtml(x.permission_key)}" value="deny" ${state[x.permission_key]==='deny'?'checked':''}><span>Deny</span></label></div></div>`).join('')}</div><button id="save-user-permissions" class="primary-button compact" type="button">Save user access</button><p id="user-permission-message" class="form-message" hidden></p>`;$('#save-user-permissions').addEventListener('click',async()=>{const allow=[],deny=[];permissionCatalogue.forEach(x=>{const checked=el.querySelector(`input[name="override-${CSS.escape(x.permission_key)}"]:checked`);if(checked?.value==='allow')allow.push(x.permission_key);if(checked?.value==='deny')deny.push(x.permission_key);});const msg=$('#user-permission-message');try{await api(`/api/security/users/${encodeURIComponent(userId)}/permissions`,{method:'PUT',body:JSON.stringify({allow,deny})});msg.textContent='User-specific access saved.';msg.hidden=false;}catch(e){msg.textContent=e.message;msg.hidden=false;}});}catch(e){el.innerHTML=`<p class="muted">${escapeHtml(e.message)}</p>`;}});

$('#add-visit-requirement')?.addEventListener('click',()=>addVisitRequirement());


// CoreCare 1.13.0 — Intelligent Template & Recurrence Engine
let rotaTemplates={visitTemplates:[],workingPatterns:[],exceptions:[],runs:[],clients:[],staff:[]};
const templateDays=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function templateName(x){return x.preferred_name||[x.first_name,x.last_name].filter(Boolean).join(' ')}
function templateDate(v){if(!v)return 'Open ended';try{return new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:v.includes?.('T')?'short':undefined})}catch{return v}}
function templateOptions(rows,blank){return `${blank?`<option value="">${blank}</option>`:''}${rows.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(templateName(x))}</option>`).join('')}`}
async function loadRotaTemplates(){const target=$('#template-visit-list');if(!target)return;try{rotaTemplates=await api('/api/rota/templates');populateTemplateSelects();renderRotaTemplates()}catch(e){target.innerHTML=`<p class="form-error">${escapeHtml(e.message)}</p>`}}
function populateTemplateSelects(){const clients=templateOptions(rotaTemplates.clients||[],'Select client'),staff=templateOptions(rotaTemplates.staff||[],'Any suitable carer');['template-visit-client','template-exception-client'].forEach(id=>{const e=$('#'+id);if(e)e.innerHTML=clients});['template-preferred-staff','template-backup-staff','template-pattern-staff','template-exception-staff','template-replacement-staff'].forEach(id=>{const e=$('#'+id);if(e)e.innerHTML=staff})}
function renderRotaTemplates(){
 const visits=$('#template-visit-list'),patterns=$('#template-pattern-list'),exceptions=$('#template-exception-list'),runs=$('#template-run-list');
 if(visits)visits.innerHTML=(rotaTemplates.visitTemplates||[]).map(x=>`<article class="template-card"><div><span class="badge active">${templateDays[x.day_of_week]} ${escapeHtml(x.preferred_time)}</span><h3>${escapeHtml(x.client_name||'Client')}</h3><p>${escapeHtml(x.visit_type)} · ${x.duration_minutes} minutes</p><small>Preferred: ${escapeHtml(x.preferred_staff_name||'Any suitable carer')}${x.backup_staff_name?` · Backup: ${escapeHtml(x.backup_staff_name)}`:''}</small></div><button class="icon-button" data-template-delete="visit" data-id="${x.id}" title="Delete">×</button></article>`).join('')||'<div class="empty-state"><strong>No recurring visits yet</strong><span>Add the client’s regular weekly calls.</span></div>';
 if(patterns)patterns.innerHTML=(rotaTemplates.workingPatterns||[]).map(x=>`<article class="template-card"><div><span class="badge neutral">Week ${x.week_number} of ${x.cycle_weeks}</span><h3>${escapeHtml(x.staff_name||'Carer')}</h3><p>${templateDays[x.day_of_week]} · ${escapeHtml(x.start_time)}–${escapeHtml(x.end_time)}</p><small>${escapeHtml(x.name)}</small></div><button class="icon-button" data-template-delete="working-pattern" data-id="${x.id}">×</button></article>`).join('')||'<div class="empty-state"><strong>No working patterns yet</strong><span>Add normal hours for each carer.</span></div>';
 if(exceptions)exceptions.innerHTML=(rotaTemplates.exceptions||[]).map(x=>`<article class="template-card"><div><span class="badge warning">${escapeHtml(x.exception_type)}</span><h3>${escapeHtml(x.staff_name||x.client_name||'Organisation-wide exception')}</h3><p>${templateDate(x.start_at)}${x.end_at?` – ${templateDate(x.end_at)}`:''}</p><small>${escapeHtml(x.reason||x.action)}</small></div><button class="icon-button" data-template-delete="exception" data-id="${x.id}">×</button></article>`).join('')||'<div class="empty-state"><strong>No current exceptions</strong><span>Holidays and one-off changes appear here.</span></div>';
 if(runs)runs.innerHTML=(rotaTemplates.runs||[]).map(x=>`<article class="template-card generation-card"><div><span class="badge success">${escapeHtml(x.week_commencing)}</span><h3>${x.visits_created} visits generated</h3><p>${x.visits_unallocated} unallocated · ${x.visits_skipped} skipped</p><small>${templateDate(x.generated_at)}</small></div></article>`).join('')||'<div class="empty-state"><strong>No generated weeks yet</strong><span>Use Generate week when templates are ready.</span></div>';
}
function openTemplateDialog(id){const d=$('#'+id);d?.querySelector('form')?.reset();d?.showModal()}
document.querySelectorAll('[data-template-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-template-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.template-panel').forEach(x=>x.classList.toggle('active',x.id===`template-${b.dataset.templateTab}`))}));
$('#template-refresh')?.addEventListener('click',loadRotaTemplates);$('#template-add-visit')?.addEventListener('click',()=>openTemplateDialog('template-visit-dialog'));$('#template-add-pattern')?.addEventListener('click',()=>openTemplateDialog('template-pattern-dialog'));$('#template-add-exception')?.addEventListener('click',()=>openTemplateDialog('template-exception-dialog'));$('#template-generate-open')?.addEventListener('click',()=>{openTemplateDialog('template-generate-dialog');const w=$('#rota-week')?.value;if(w)$('#template-generate-form').elements.weekCommencing.value=w});
async function submitTemplateForm(e,path){e.preventDefault();const f=e.currentTarget,err=f.querySelector('.form-error');try{await api(path,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});f.closest('dialog').close();await loadRotaTemplates()}catch(ex){err.textContent=ex.message;err.hidden=false}}
$('#template-visit-form')?.addEventListener('submit',e=>submitTemplateForm(e,'/api/rota/templates/visit'));$('#template-pattern-form')?.addEventListener('submit',e=>submitTemplateForm(e,'/api/rota/templates/working-pattern'));$('#template-exception-form')?.addEventListener('submit',e=>submitTemplateForm(e,'/api/rota/templates/exception'));
$('#template-generate-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,err=f.querySelector('.form-error'),result=$('#template-generate-result');try{const r=await api('/api/rota/templates/generate',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(f)))});result.hidden=false;result.innerHTML=`<strong>${r.created} visits created</strong><span>${r.unallocated} left in the allocation queue · ${r.skipped} skipped</span>${r.warnings?.length?`<small>${r.warnings.slice(0,5).map(escapeHtml).join('<br>')}</small>`:''}`;await Promise.all([loadRotaTemplates(),loadRotaBoard()])}catch(ex){err.textContent=ex.message;err.hidden=false}});
document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-template-delete]');if(!b)return;if(!confirm('Delete this template item?'))return;try{await api(`/api/rota/templates/${b.dataset.templateDelete}/${b.dataset.id}`,{method:'DELETE'});await loadRotaTemplates()}catch(ex){alert(ex.message)}});
const originalLoadRotaBoard=loadRotaBoard;loadRotaBoard=async function(){const r=await originalLoadRotaBoard.apply(this,arguments);if($('#template-visit-list')&&!rotaTemplates.clients.length)await loadRotaTemplates();return r};
