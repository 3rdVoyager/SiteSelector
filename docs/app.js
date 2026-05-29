const dataUrl = new URL('./data/pricing-data.json', import.meta.url);

const wizardContainer = document.querySelector('#wizard');
const wizardStatus = document.querySelector('#wizard-status');
const wizardBack = document.querySelector('#wizard-back');
const wizardNext = document.querySelector('#wizard-next');
const result = document.querySelector('#result');
const platformsContainer = document.querySelector('#platforms');
const jsonViewer = document.querySelector('#json-viewer');
const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
const navItems = Array.from(document.querySelectorAll('[data-tab]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

const wizardSteps = [
  {
    key: 'budget',
    label: 'Budget',
    title: 'What is the monthly budget range?',
    prompt: 'Pick the range that is closest to what the organization can spend each month.',
    options: [
      { value: '0-15', title: '$0-$15', copy: 'Only basic hosting, domain, and free tools.' },
      { value: '15-40', title: '$15-$40', copy: 'Low-cost stack with a little room for hosted tools.' },
      { value: '40-100', title: '$40-$100', copy: 'Enough for managed platforms or a light CMS.' },
      { value: '100+', title: '$100+', copy: 'Comfortable for managed hosting and richer services.' },
    ],
  },
  {
    key: 'technicalComfort',
    label: 'Technical comfort',
    title: 'How much technical upkeep can the team handle?',
    prompt: 'This steers the path toward low-maintenance builders or more flexible self-managed tools.',
    options: [
      { value: 'low', title: 'Low', copy: 'Prefer guided tools and minimal setup.' },
      { value: 'medium', title: 'Medium', copy: 'Can handle a little configuration and upkeep.' },
      { value: 'high', title: 'High', copy: 'Comfortable with hosting, DNS, and manual edits.' },
    ],
  },
  {
    key: 'customDomain',
    label: 'Domain',
    title: 'Do you want a custom domain?',
    prompt: 'If yes, the wizard will pick a registrar and DNS approach.',
    options: [
      { value: 'yes', title: 'Yes', copy: 'Use a custom domain from day one.' },
      { value: 'maybe', title: 'Maybe later', copy: 'Start on a subdomain and upgrade later.' },
      { value: 'no', title: 'No', copy: 'Keep the launch simple with a platform subdomain.' },
    ],
  },
  {
    key: 'contentUpdates',
    label: 'CMS need',
    title: 'How often will non-technical people update the site?',
    prompt: 'This helps decide whether a CMS is needed at all.',
    options: [
      { value: 'frequent', title: 'Frequent', copy: 'Content changes happen weekly or more.' },
      { value: 'occasional', title: 'Occasional', copy: 'Updates happen every month or so.' },
      { value: 'rare', title: 'Rare', copy: 'The site is mostly static once launched.' },
    ],
  },
  {
    key: 'siteFocus',
    label: 'Site focus',
    title: 'What does the site need to do best?',
    prompt: 'This steers the CMS or platform choice if one is needed.',
    options: [
      { value: 'brochure', title: 'Brochure site', copy: 'A simple presence with a few pages.' },
      { value: 'blog', title: 'Blog or news', copy: 'Publishing updates, announcements, or articles.' },
      { value: 'programs', title: 'Programs or classes', copy: 'Schedules, pages, and regular content updates.' },
      { value: 'membership', title: 'Membership portal', copy: 'Members-only content or recurring engagement.' },
    ],
  },
  {
    key: 'features',
    label: 'Features',
    title: 'Which services are required?',
    prompt: 'Pick the most important external services for the launch path.',
    options: [
      { value: 'payments', title: 'Payments or donations', copy: 'Need to collect money or donations.' },
      { value: 'scheduling', title: 'Scheduling or bookings', copy: 'Need class or appointment booking.' },
      { value: 'forms', title: 'Forms and lead capture', copy: 'Need contact, intake, or signup forms.' },
      { value: 'none', title: 'Mostly informational', copy: 'No major integrations yet.' },
    ],
  },
  {
    key: 'ownership',
    label: 'Ownership',
    title: 'What matters more: ownership or convenience?',
    prompt: 'This helps determine whether the stack should lean modular or all-in-one.',
    options: [
      { value: 'control', title: 'Control', copy: 'Prefer portability and ownership.' },
      { value: 'balance', title: 'Balanced', copy: 'Want a mix of flexibility and convenience.' },
      { value: 'convenience', title: 'Convenience', copy: 'Prefer the simplest path to launch.' },
    ],
  },
  {
    key: 'design',
    label: 'Design freedom',
    title: 'How important is custom design freedom?',
    prompt: 'This influences whether the site should use a CMS or a more rigid platform.',
    options: [
      { value: 'high', title: 'High', copy: 'Need a distinctive layout and custom sections.' },
      { value: 'medium', title: 'Medium', copy: 'Need some flexibility without full custom build work.' },
      { value: 'low', title: 'Low', copy: 'A solid template is enough for now.' },
    ],
  },
];

const state = {
  stepIndex: 0,
  answers: {},
  data: null,
};

function renderJsonViewer(data) {
  jsonViewer.textContent = JSON.stringify(data, null, 2);
}

function renderPlatforms(records) {
  platformsContainer.innerHTML = records
    .map(
      (platform) => `
        <article class="platform-card">
          <h3>${platform.name}</h3>
          <p>${platform.category}</p>
          <ul>
            <li>${platform.summary}</li>
            <li>${platform.price}</li>
            <li>${platform.best_for.join(', ')}</li>
          </ul>
          <div class="platform-meta">
            <span class="platform-pill">${platform.kind}</span>
            <span class="platform-pill">${platform.ownership}</span>
            <span class="platform-pill">${platform.cost_tier}</span>
          </div>
        </article>
      `,
    )
    .join('');
}

function setActiveTab(tabName) {
  navItems.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', String(!isActive));
    panel.classList.toggle('is-active', isActive);
  });
}

function setSidebarCollapsed(isCollapsed) {
  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  document.body.classList.toggle('sidebar-open', !isCollapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
}

function getStepAnswer(stepKey) {
  return state.answers[stepKey] ?? '';
}

function setStepAnswer(stepKey, value) {
  state.answers[stepKey] = value;
  renderWizard();
}

function currentStep() {
  return wizardSteps[state.stepIndex];
}

function canGoNext() {
  return Boolean(getStepAnswer(currentStep().key));
}

function renderOptionButton(option, isSelected) {
  return `
    <button
      type="button"
      class="option-button ${isSelected ? 'is-selected' : ''}"
      data-step-option="${option.value}"
      aria-pressed="${String(isSelected)}"
    >
      <span class="option-title">${option.title}</span>
      <span class="option-copy">${option.copy}</span>
    </button>
  `;
}

function renderWizard() {
  const step = currentStep();
  const selectedValue = getStepAnswer(step.key);
  const progressPercent = ((state.stepIndex + 1) / wizardSteps.length) * 100;

  wizardStatus.textContent = `Step ${state.stepIndex + 1} of ${wizardSteps.length}`;
  wizardContainer.innerHTML = `
    <div class="wizard-question">
      <p class="eyebrow">${step.label}</p>
      <h4>${step.title}</h4>
      <p>${step.prompt}</p>
    </div>
    <div class="progress-track" aria-hidden="true">
      <div class="progress-fill" style="width: ${progressPercent}%"></div>
    </div>
    <div class="option-grid">
      ${step.options.map((option) => renderOptionButton(option, option.value === selectedValue)).join('')}
    </div>
  `;

  wizardBack.disabled = state.stepIndex === 0;
  wizardNext.textContent = state.stepIndex === wizardSteps.length - 1 ? 'Submit' : 'Next';
  wizardNext.disabled = !canGoNext();
}

function goToNextStep() {
  const hasSelection = canGoNext();
  if (!hasSelection) {
    return;
  }

  if (state.stepIndex < wizardSteps.length - 1) {
    state.stepIndex += 1;
    renderWizard();
    return;
  }

  renderPlan();
}

function goToPreviousStep() {
  if (state.stepIndex === 0) {
    return;
  }

  state.stepIndex -= 1;
  renderWizard();
}

function chooseCms(answers) {
  if (answers.contentUpdates === 'rare' && answers.siteFocus === 'brochure') {
    return {
      needed: false,
      value: 'No CMS yet',
      reason: 'The site is mostly static, so a CMS would add overhead without much benefit.',
    };
  }

  if (answers.siteFocus === 'blog' || answers.contentUpdates === 'frequent') {
    if (answers.technicalComfort === 'high' || answers.ownership === 'control') {
      return {
        needed: true,
        value: 'WordPress.org',
        reason: 'Best when frequent publishing and ownership matter more than simplicity.',
      };
    }

    if (answers.design === 'high' || answers.ownership === 'convenience') {
      return {
        needed: true,
        value: 'Webflow CMS',
        reason: 'Better for polished layouts when the team wants less infrastructure work.',
      };
    }

    return {
      needed: true,
      value: 'Ghost',
      reason: 'A focused publishing CMS for blogs, updates, and lightweight memberships.',
    };
  }

  if (answers.siteFocus === 'membership') {
    return {
      needed: true,
      value: 'WordPress.org',
      reason: 'Flexible enough for member content, plugins, and future expansion.',
    };
  }

  if (answers.design === 'high' && answers.technicalComfort !== 'low') {
    return {
      needed: true,
      value: 'Squarespace',
      reason: 'Useful when the priority is a polished design system with less operational overhead.',
    };
  }

  return {
    needed: false,
    value: 'Static publishing',
    reason: 'The content is simple enough that a static site can carry the launch cleanly.',
  };
}

function chooseHosting(answers, cmsChoice) {
  if (cmsChoice.value === 'WordPress.org') {
    return 'Managed WordPress hosting';
  }

  if (cmsChoice.value === 'Ghost') {
    return 'Ghost(Pro) or lightweight Node hosting';
  }

  if (cmsChoice.value === 'Webflow CMS' || cmsChoice.value === 'Squarespace') {
    return `${cmsChoice.value} hosted platform`; 
  }

  if (answers.technicalComfort === 'high' && answers.ownership === 'control') {
    return 'GitHub Pages or Cloudflare Pages';
  }

  return 'GitHub Pages';
}

function chooseRegistrar(answers) {
  if (answers.customDomain === 'no') {
    return {
      registrar: 'No registrar yet',
      reason: 'Launch on a platform subdomain first, then buy a domain later if the project sticks.',
    };
  }

  if (answers.technicalComfort === 'high' && answers.ownership === 'control') {
    return {
      registrar: 'Cloudflare Registrar',
      reason: 'Best when the team wants strong DNS control and a clean ownership model.',
    };
  }

  if (answers.budget === '0-15' || answers.budget === '15-40') {
    return {
      registrar: 'Porkbun',
      reason: 'Usually the best value for simple, low-cost domain registration.',
    };
  }

  return {
    registrar: 'Namecheap',
    reason: 'A familiar middle-ground registrar with a straightforward buying flow.',
  };
}

function chooseIntegrations(answers) {
  const items = [];

  if (answers.features === 'payments') {
    items.push('Zeffy or Stripe Checkout for payments and donations');
  }

  if (answers.features === 'scheduling') {
    items.push(answers.budget === '0-15' ? 'TidyCal' : 'Calendly');
  }

  if (answers.features === 'forms') {
    items.push('Tally for forms and intake');
  }

  if (items.length === 0) {
    items.push('No external integrations required yet');
  }

  return items;
}

function estimateMonthlyCost(answers, cmsChoice, registrarChoice) {
  const base = {
    '0-15': [0, 15],
    '15-40': [15, 40],
    '40-100': [40, 100],
    '100+': [100, 250],
  }[answers.budget] ?? [0, 0];

  if (cmsChoice.value === 'WordPress.org') {
    return '$15-$45/mo + domain';
  }

  if (cmsChoice.value === 'Ghost') {
    return '$10-$35/mo + domain';
  }

  if (cmsChoice.value === 'Webflow CMS' || cmsChoice.value === 'Squarespace') {
    return '$20-$50/mo + domain';
  }

  if (base[1] <= 15) {
    return '$0-$15/mo + domain';
  }

  return `$${base[0]}-$${base[1]}/mo + domain`;
}

function renderPlan() {
  const cmsChoice = chooseCms(state.answers);
  const registrarChoice = chooseRegistrar(state.answers);
  const hostingChoice = chooseHosting(state.answers, cmsChoice);
  const integrations = chooseIntegrations(state.answers);
  const cost = estimateMonthlyCost(state.answers, cmsChoice, registrarChoice);
  const customDomainStatus = state.answers.customDomain === 'yes' ? 'Yes' : state.answers.customDomain === 'maybe' ? 'Maybe later' : 'No custom domain for now';
  const pathLabel = cmsChoice.needed ? 'CMS path' : 'Static path';

  const phases = [
    {
      title: '1. Foundation',
      text: `${customDomainStatus}. ${registrarChoice.registrar}. ${registrarChoice.reason}`,
      tags: [state.answers.customDomain === 'yes' ? 'custom domain' : 'subdomain launch', registrarChoice.registrar],
    },
    {
      title: '2. Site platform',
      text: `${hostingChoice}. ${cmsChoice.value}. ${cmsChoice.reason}`,
      tags: [pathLabel, hostingChoice],
    },
    {
      title: '3. Content system',
      text: cmsChoice.needed
        ? `Use ${cmsChoice.value} for page editing, publishing, and future content growth.`
        : 'Skip the CMS for now and keep the site as static pages with occasional updates.',
      tags: cmsChoice.needed ? ['CMS enabled', cmsChoice.value] : ['CMS skipped', 'static content'],
    },
    {
      title: '4. Services',
      text: integrations.join('. '),
      tags: integrations,
    },
    {
      title: '5. Launch checklist',
      text: 'Add analytics, test mobile pages, confirm forms, connect the domain, and publish a first version.',
      tags: ['analytics', 'mobile QA', 'go live'],
    },
  ];

  result.innerHTML = `
    <h3>${pathLabel}</h3>
    <p>${cmsChoice.reason}</p>
    <p class="cost">Estimated monthly stack: ${cost}</p>
    <div class="path-stack">
      ${phases
        .map(
          (phase) => `
            <section class="path-card">
              <h4>${phase.title}</h4>
              <p>${phase.text}</p>
              <div class="path-tags">
                ${phase.tags.map((tag) => `<span class="path-tag">${tag}</span>`).join('')}
              </div>
            </section>
          `,
        )
        .join('')}
    </div>
    <section class="path-card">
      <h4>What this path prioritizes</h4>
      <ul>
        <li>${state.answers.ownership === 'control' ? 'Ownership and portability come first.' : 'Convenience is prioritized for the launch.'}</li>
        <li>${state.answers.design === 'high' ? 'Custom design freedom matters more than template speed.' : 'The structure favors a faster rollout.'}</li>
        <li>${state.answers.contentUpdates === 'frequent' ? 'Content publishing is expected to stay active.' : 'The site can stay fairly static after launch.'}</li>
      </ul>
    </section>
  `;
}

function bindWizardEvents() {
  wizardContainer.addEventListener('click', (event) => {
    const target = event.target.closest('[data-step-option]');
    if (!target) {
      return;
    }

    const step = currentStep();
    setStepAnswer(step.key, target.dataset.stepOption);
  });

  wizardNext.addEventListener('click', goToNextStep);
  wizardBack.addEventListener('click', goToPreviousStep);
}

async function init() {
  setSidebarCollapsed(false);

  const response = await fetch(dataUrl);
  const data = await response.json();
  state.data = data;

  renderJsonViewer(data);
  renderPlatforms(Array.isArray(data) ? data : data.platforms ?? []);
  renderWizard();
  bindWizardEvents();

  sidebarToggle.addEventListener('click', () => {
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!isCollapsed);
  });

  navItems.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab);
    });
  });
}

init().catch((error) => {
  result.innerHTML = `<p class="muted">Unable to load pricing data: ${error.message}</p>`;
});
