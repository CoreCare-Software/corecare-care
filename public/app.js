const DEMO_EMAIL='admin@demo.corecare';
const DEMO_PASSWORD='ChangeMe!2026';
const STORAGE_KEY='corecare-demo-clients-v1';
const seedClients=[
  {id:'cl-1001',firstName:'Margaret',lastName:'Ellis',dateOfBirth:'1942-05-17',nhsNumber:'485 302 1187',town:'East Kirkby',carePackage:'Personal care · 4 visits daily',nextReview:'2026-07-26',status:'Active',risk:'High'},
  {id:'cl-1002',firstName:'Arthur',lastName:'Bennett',dateOfBirth:'1938-11-02',nhsNumber:'618 445 9002',town:'Spilsby',carePackage:'Medication and meal support',nextReview:'2026-08-12',status:'Active',risk:'Medium'},
  {id:'cl-1003',firstName:'Jean',lastName:'Parker',dateOfBirth:'1949-02-21',nhsNumber:'392 701 6654',town:'Horncastle',carePackage:'Wellbeing visits',nextReview:'2026-09-03',status:'Active',risk:'Standard'},
  {id:'cl-1004',firstName:'David',lastName:'Collins',dateOfBirth:'1955-09-08',nhsNumber:'207 996 3145',town:'Boston',carePackage:'Domestic and companionship',nextReview:'2026-08-01',status:'Paused',risk:'Medium'}
];
const loginView=document.querySelector('#login-view');
const appView=document.querySelector('#app-view');
const loginForm=document.querySelector('#login-form');
const loginError=document.querySelector('#login-error');
const sidebar=document.querySelector('.sidebar');
const menuButton=document.querySelector('#menu-button');
const pageTitle=document.querySelector('#page-title');
const pageKicker=document.querySelector('#page-kicker');
const dashboardPage=document.querySelector('#dashboard-page');
const clientsPage=document.querySelector('#clients-page');
const placeholderPage=document.querySelector('#placeholder-page');
const placeholderTitle=document.querySelector('#placeholder-title');
const placeholderCopy=document.querySelector('#placeholder-copy');
const clientDialog=document.querySelector('#client-dialog');
const clientForm=document.querySelector('#client-form');
const clientTableBody=document.querySelector('#client-table-body');
const clientEmpty=document.querySelector('#client-empty');
const clientSearch=document.querySelector('#client-search');
const clientStatusFilter=document.querySelector('#client-status-filter');
const labels={staff:['Staff','Staff records, employment information, availability and compliance will live here.'],family:['Family portal','Secure family access, updates and messaging will be introduced in a later milestone.'],care:['Care plans','Person-centred care plans, risks, goals, outcomes and reviews will be managed here.'],medication:['Medication','Medication profiles, electronic MAR and administration records will be built here.'],visits:['Visits','Live visits, daily notes, outcomes and evidence of care will be managed here.'],rota:['Rota','Scheduling, recurring calls, assignments, travel and availability will be managed here.'],tasks:['Tasks','Operational tasks, reminders, ownership and escalation will be managed here.'],incidents:['Incidents','Incident reporting, investigation, actions and audit history will be managed here.'],finance:['Finance','Invoices, rates, funding arrangements and payment tracking will be built here.'],reports:['Reports','Operational, quality, compliance and management reporting will be built here.'],settings:['Settings','Organisations, branches, users, roles, permissions and system configuration will be managed here.']};
let clients=loadClients();
let storageMode='local';
function loadClients(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));return Array.isArray(saved)?saved:seedClients}catch{return seedClients}}
function saveClients(){localStorage.setItem(STORAGE_KEY,JSON.stringify(clients))}

async function initialiseClientStorage(){
  try{
    const response=await fetch('/api/clients',{headers:{'accept':'application/json'}});
    if(!response.ok)throw new Error('Cloud database unavailable');
    const payload=await response.json();
    if(Array.isArray(payload.clients)){clients=payload.clients;storageMode='cloud';}
  }catch{storageMode='local';clients=loadClients();}
}
async function persistClient(client,isUpdate){
  if(storageMode!=='cloud'){const index=clients.findIndex(item=>item.id===client.id);if(index>=0)clients[index]=client;else clients.unshift(client);saveClients();return client;}
  const url=isUpdate?`/api/clients/${encodeURIComponent(client.id)}`:'/api/clients';
  const response=await fetch(url,{method:isUpdate?'PUT':'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(client)});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload?.error?.message||'Unable to save the client record.');
  const saved=payload.client;
  const index=clients.findIndex(item=>item.id===saved.id);
  if(index>=0)clients[index]=saved;else clients.unshift(saved);
  return saved;
}

function setDate(){const now=new Date();pageKicker.textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)}
async function showApplication(){loginView.hidden=true;appView.hidden=false;sessionStorage.setItem('corecare-demo-session','active');setDate();await initialiseClientStorage();renderClients();document.querySelector('#main-content').focus()}
function showLogin(){appView.hidden=true;loginView.hidden=false;sessionStorage.removeItem('corecare-demo-session');document.querySelector('#email').focus()}
function showPage(page){[dashboardPage,clientsPage,placeholderPage].forEach(item=>item.classList.remove('active-page'));if(page==='dashboard'){dashboardPage.classList.add('active-page');setDate();pageTitle.textContent='Good afternoon, Chris';return}if(page==='clients'){clientsPage.classList.add('active-page');pageKicker.textContent='People';pageTitle.textContent='Clients';renderClients();return}placeholderPage.classList.add('active-page');const[title,copy]=labels[page];placeholderTitle.textContent=title;placeholderCopy.textContent=copy;pageKicker.textContent='CoreCare module';pageTitle.textContent=title}
function formatDate(value){if(!value)return'—';return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`))}
function initials(client){return`${client.firstName?.[0]||''}${client.lastName?.[0]||''}`.toUpperCase()}
function reviewDue(client){return client.status==='Active'&&new Date(`${client.nextReview}T23:59:59`)<new Date()}
function renderClients(){const term=clientSearch.value.trim().toLowerCase();const status=clientStatusFilter.value;const filtered=clients.filter(client=>{const haystack=`${client.firstName} ${client.lastName} ${client.town} ${client.nhsNumber}`.toLowerCase();return(!term||haystack.includes(term))&&(status==='all'||client.status===status)});clientTableBody.innerHTML=filtered.map(client=>`<tr><td><div class="client-person"><span class="person-avatar">${initials(client)}</span><div><strong>${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}</strong><span>DOB ${formatDate(client.dateOfBirth)} · NHS ${escapeHtml(client.nhsNumber||'Not recorded')}</span></div></div></td><td>${escapeHtml(client.town)}</td><td>${escapeHtml(client.carePackage||'Not set')}</td><td><span class="review-date ${reviewDue(client)?'overdue':''}">${formatDate(client.nextReview)}${reviewDue(client)?' · overdue':''}</span></td><td><span class="badge ${client.status==='Active'?'success':client.status==='Paused'?'active':'neutral'}">${client.status}</span>${client.risk==='High'?'<span class="risk-tag">High risk</span>':''}</td><td><button class="row-action" data-edit-client="${client.id}">Edit</button></td></tr>`).join('');clientEmpty.hidden=filtered.length>0;document.querySelector('#client-active-count').textContent=clients.filter(c=>c.status==='Active').length;document.querySelector('#client-review-count').textContent=clients.filter(reviewDue).length;document.querySelector('#client-risk-count').textContent=clients.filter(c=>c.status==='Active'&&c.risk==='High').length;document.querySelectorAll('[data-edit-client]').forEach(button=>button.addEventListener('click',()=>openClientDialog(button.dataset.editClient)))}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function openClientDialog(id){clientForm.reset();document.querySelector('#client-form-error').hidden=true;document.querySelector('#client-id').value='';document.querySelector('#client-dialog-title').textContent=id?'Edit client':'Add client';if(id){const client=clients.find(item=>item.id===id);if(client){Object.entries(client).forEach(([key,value])=>{const field=clientForm.elements.namedItem(key);if(field)field.value=value})}}clientDialog.showModal()}
function closeClientDialog(){clientDialog.close()}
loginForm.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(loginForm);const email=String(data.get('email')||'').trim().toLowerCase();const password=String(data.get('password')||'');if(email!==DEMO_EMAIL||password!==DEMO_PASSWORD){loginError.textContent='Use the demonstration email address and password shown below the form.';loginError.hidden=false;return}loginError.hidden=true;showApplication()});
document.querySelector('#toggle-password').addEventListener('click',event=>{const field=document.querySelector('#password');const reveal=field.type==='password';field.type=reveal?'text':'password';event.currentTarget.textContent=reveal?'Hide':'Show'});
document.querySelector('#sign-out').addEventListener('click',showLogin);
menuButton.addEventListener('click',()=>{const open=sidebar.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open))});
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('active'));button.classList.add('active');sidebar.classList.remove('open');menuButton.setAttribute('aria-expanded','false');showPage(button.dataset.page)}));
document.querySelector('[data-return-dashboard]').addEventListener('click',()=>document.querySelector('[data-page="dashboard"]').click());
document.querySelector('#add-client').addEventListener('click',()=>openClientDialog());
document.querySelector('#close-client-dialog').addEventListener('click',closeClientDialog);
document.querySelector('#cancel-client').addEventListener('click',closeClientDialog);
clientSearch.addEventListener('input',renderClients);
clientStatusFilter.addEventListener('change',renderClients);
clientForm.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(clientForm));const error=document.querySelector('#client-form-error');if(!data.firstName.trim()||!data.lastName.trim()||!data.town.trim()||!data.dateOfBirth||!data.nextReview){error.textContent='Complete all required fields before saving.';error.hidden=false;return}const isUpdate=Boolean(data.id);const client={...data,id:data.id||`cl-${Date.now()}`};try{await persistClient(client,isUpdate);renderClients();closeClientDialog()}catch(saveError){error.textContent=saveError.message;error.hidden=false}});
if(sessionStorage.getItem('corecare-demo-session')==='active')showApplication();
