const DEMO_EMAIL = 'admin@demo.fmn';
const DEMO_PASSWORD = 'ChangeMe!2026';

const loginView = document.querySelector('#login-view');
const appView = document.querySelector('#app-view');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const sidebar = document.querySelector('.sidebar');
const menuButton = document.querySelector('#menu-button');
const pageTitle = document.querySelector('#page-title');
const pageKicker = document.querySelector('#page-kicker');
const dashboardPage = document.querySelector('#dashboard-page');
const placeholderPage = document.querySelector('#placeholder-page');
const placeholderTitle = document.querySelector('#placeholder-title');
const placeholderCopy = document.querySelector('#placeholder-copy');

const labels = {
  clients: ['Clients', 'Client records, contacts, alerts and care information will be added in the Client sprint.'],
  staff: ['Staff', 'Staff profiles, employment assignments, availability and compliance will be added in the Staff sprint.'],
  schedule: ['Schedule', 'The live rota, repeating visits and worker assignment tools will be added in the Scheduling sprint.'],
  care: ['Care planning', 'Care plans, risks, outcomes and review workflows will be added in the Care Planning sprint.'],
  medication: ['Medication', 'Medication profiles, schedules and electronic MAR workflows will be added in the Medication sprint.'],
  incidents: ['Incidents', 'Incident reporting, investigation and action tracking will be added in the Quality sprint.'],
  documents: ['Documents', 'Secure document upload, versioning and access controls will be added in a later sprint.'],
  reports: ['Reports', 'Operational, compliance and management reports will be added as real data becomes available.'],
  administration: ['Administration', 'Organisations, branches, users, roles and permissions will be added in the platform foundation sprint.']
};

function showApplication() {
  loginView.hidden = true;
  appView.hidden = false;
  sessionStorage.setItem('fmn-demo-session', 'active');
  document.querySelector('#main-content').focus();
}

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  sessionStorage.removeItem('fmn-demo-session');
  document.querySelector('#email').focus();
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    loginError.textContent = 'Use the demonstration email address and password shown below the form.';
    loginError.hidden = false;
    return;
  }

  loginError.hidden = true;
  showApplication();
});

document.querySelector('#sign-out').addEventListener('click', showLogin);

menuButton.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    const page = button.dataset.page;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    sidebar.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');

    if (page === 'dashboard') {
      dashboardPage.classList.add('active-page');
      placeholderPage.classList.remove('active-page');
      pageKicker.textContent = 'Monday, 28 July 2026';
      pageTitle.textContent = 'Good afternoon, Chris';
      return;
    }

    const [title, copy] = labels[page];
    dashboardPage.classList.remove('active-page');
    placeholderPage.classList.add('active-page');
    placeholderTitle.textContent = title;
    placeholderCopy.textContent = copy;
    pageKicker.textContent = 'Project Forget Me Not';
    pageTitle.textContent = title;
  });
});

document.querySelector('[data-return-dashboard]').addEventListener('click', () => {
  document.querySelector('[data-page="dashboard"]').click();
});

if (sessionStorage.getItem('fmn-demo-session') === 'active') {
  showApplication();
}
