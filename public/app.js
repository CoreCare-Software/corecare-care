const DEMO_EMAIL='admin@demo.corecare';
const DEMO_PASSWORD='ChangeMe!2026';
const loginView=document.querySelector('#login-view');
const appView=document.querySelector('#app-view');
const loginForm=document.querySelector('#login-form');
const loginError=document.querySelector('#login-error');
const sidebar=document.querySelector('.sidebar');
const menuButton=document.querySelector('#menu-button');
const pageTitle=document.querySelector('#page-title');
const pageKicker=document.querySelector('#page-kicker');
const dashboardPage=document.querySelector('#dashboard-page');
const placeholderPage=document.querySelector('#placeholder-page');
const placeholderTitle=document.querySelector('#placeholder-title');
const placeholderCopy=document.querySelector('#placeholder-copy');
const labels={clients:['Clients','Client profiles, contacts, alerts and core care information will be built into this module.'],staff:['Staff','Staff records, employment information, availability and compliance will live here.'],family:['Family portal','Secure family access, updates and messaging will be introduced in a later milestone.'],care:['Care plans','Person-centred care plans, risks, goals, outcomes and reviews will be managed here.'],medication:['Medication','Medication profiles, electronic MAR and administration records will be built here.'],visits:['Visits','Live visits, daily notes, outcomes and evidence of care will be managed here.'],rota:['Rota','Scheduling, recurring calls, assignments, travel and availability will be managed here.'],tasks:['Tasks','Operational tasks, reminders, ownership and escalation will be managed here.'],incidents:['Incidents','Incident reporting, investigation, actions and audit history will be managed here.'],finance:['Finance','Invoices, rates, funding arrangements and payment tracking will be built here.'],reports:['Reports','Operational, quality, compliance and management reporting will be built here.'],settings:['Settings','Organisations, branches, users, roles, permissions and system configuration will be managed here.']};
function setDate(){const now=new Date();pageKicker.textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now)}
function showApplication(){loginView.hidden=true;appView.hidden=false;sessionStorage.setItem('corecare-demo-session','active');setDate();document.querySelector('#main-content').focus()}
function showLogin(){appView.hidden=true;loginView.hidden=false;sessionStorage.removeItem('corecare-demo-session');document.querySelector('#email').focus()}
loginForm.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(loginForm);const email=String(data.get('email')||'').trim().toLowerCase();const password=String(data.get('password')||'');if(email!==DEMO_EMAIL||password!==DEMO_PASSWORD){loginError.textContent='Use the demonstration email address and password shown below the form.';loginError.hidden=false;return}loginError.hidden=true;showApplication()});
document.querySelector('#toggle-password').addEventListener('click',event=>{const field=document.querySelector('#password');const reveal=field.type==='password';field.type=reveal?'text':'password';event.currentTarget.textContent=reveal?'Hide':'Show'});
document.querySelector('#sign-out').addEventListener('click',showLogin);
menuButton.addEventListener('click',()=>{const open=sidebar.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open))});
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{const page=button.dataset.page;document.querySelectorAll('.nav-item').forEach(item=>item.classList.remove('active'));button.classList.add('active');sidebar.classList.remove('open');menuButton.setAttribute('aria-expanded','false');if(page==='dashboard'){dashboardPage.classList.add('active-page');placeholderPage.classList.remove('active-page');setDate();pageTitle.textContent='Good afternoon, Chris';return}const[title,copy]=labels[page];dashboardPage.classList.remove('active-page');placeholderPage.classList.add('active-page');placeholderTitle.textContent=title;placeholderCopy.textContent=copy;pageKicker.textContent='CoreCare module';pageTitle.textContent=title}));
document.querySelector('[data-return-dashboard]').addEventListener('click',()=>document.querySelector('[data-page="dashboard"]').click());
if(sessionStorage.getItem('corecare-demo-session')==='active')showApplication();
