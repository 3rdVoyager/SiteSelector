const dataUrl = new URL('./data/pricing-data.json', import.meta.url);

const form = document.querySelector('#questionnaire');
const result = document.querySelector('#result');
const platformsContainer = document.querySelector('#platforms');
const jsonViewer = document.querySelector('#json-viewer');
const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
const navItems = Array.from(document.querySelectorAll('[data-tab]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

const recommendationRules = [
  {
    name: 'Wix Business Basic',
    matches: ({ budget, technicalComfort, ecommerce, integrations, ownership }) =>
      budget !== '0-15' && technicalComfort !== 'high' && (ecommerce === 'yes' || ecommerce === 'maybe') && ownership !== 'high' && integrations !== 'no',
    cost: '$16-$27/mo',
    gains: ['Fast setup', 'Hosting included', 'Built-in design tools'],
    losses: ['Less ownership', 'Platform lock-in', 'Higher long-term costs'],
    explanation: 'Best when convenience matters more than portability and the team wants a guided setup.',
  },
  {
    name: 'Squarespace Business',
    matches: ({ budget, technicalComfort, ecommerce, ownership }) =>
      budget !== '0-15' && technicalComfort === 'low' && (ecommerce === 'maybe' || ecommerce === 'yes') && ownership !== 'high',
    cost: '$23-$36/mo',
    gains: ['Polished templates', 'Simple editor', 'All-in-one hosting'],
    losses: ['Limited flexibility', 'Transaction fees on some tiers', 'Moderate cost'],
    explanation: 'A good fit for organizations that want a clean presentation with minimal setup overhead.',
  },
  {
    name: 'GitHub Pages + Tally + Zeffy',
    matches: ({ budget, technicalComfort, ownership }) => budget === '0-15' || technicalComfort === 'high' || ownership === 'high',
    cost: '$0-$15/mo + domain',
    gains: ['Very low hosting cost', 'Full content ownership', 'Modular tools'],
    losses: ['More technical setup', 'Multiple services to manage', 'Some features are external'],
    explanation: 'Best for teams that value ownership and low recurring cost more than a single dashboard.',
  },
  {
    name: 'WordPress.org + shared hosting',
    matches: ({ budget, technicalComfort, ownership }) => technicalComfort !== 'low' && ownership === 'high' && budget !== '0-15',
    cost: '$10-$35/mo + domain',
    gains: ['Open ecosystem', 'Large plugin library', 'Good ownership model'],
    losses: ['Maintenance burden', 'Plugin conflicts', 'More configuration work'],
    explanation: 'A solid middle ground when the organization wants control but can handle some maintenance.',
  },
];

function toNumberRange(value) {
  if (value === '0-15') {
    return [0, 15];
  }

  if (value === '15-40') {
    return [15, 40];
  }

  if (value === '40-100') {
    return [40, 100];
  }

  return [100, 200];
}

function pickRecommendation(answers) {
  const recommendation = recommendationRules.find((rule) => rule.matches(answers)) ?? recommendationRules[0];
  return recommendation;
}

function renderRecommendation(answers) {
  const recommendation = pickRecommendation(answers);
  const [minBudget, maxBudget] = toNumberRange(answers.budget);

  result.innerHTML = `
    <h3>${recommendation.name}</h3>
    <p>${recommendation.explanation}</p>
    <p class="cost">Recommended budget: $${minBudget} to $${maxBudget}/mo</p>
    <div class="tradeoffs">
      <strong>What you gain</strong>
      <ul>
        ${recommendation.gains.map((item) => `<li>${item}</li>`).join('')}
      </ul>
      <strong>What you lose</strong>
      <ul>
        ${recommendation.losses.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderPlatforms(platforms) {
  platformsContainer.innerHTML = platforms
    .map(
      (platform) => `
        <article class="platform-card">
          <h3>${platform.platform}</h3>
          <p>${platform.category}</p>
          <ul>
            <li>${platform.summary}</li>
            <li>Starting price: ${platform.starting_price}</li>
            <li>Best for: ${platform.best_for.join(', ')}</li>
          </ul>
        </article>
      `,
    )
    .join('');
}

function renderJsonViewer(data) {
  jsonViewer.textContent = JSON.stringify(data, null, 2);
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

async function init() {
  const response = await fetch(dataUrl);
  const data = await response.json();
  renderJsonViewer(data);
  renderPlatforms(data.platforms);

  sidebarToggle.addEventListener('click', () => {
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(!isCollapsed);
  });

  navItems.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab);
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const answers = Object.fromEntries(formData.entries());
    renderRecommendation(answers);
  });
}

init().catch((error) => {
  result.innerHTML = `<p class="muted">Unable to load pricing data: ${error.message}</p>`;
});
