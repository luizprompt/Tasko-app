'use strict';

/* ============================================================================
   TASKO SPA — núcleo: estado, sessão, API, roteamento, componentes e eventos.
   Os renderizadores ficam em views-public.js / views-account.js e os fluxos de
   formulário em forms.js. Todos compartilham o escopo global clássico.
   ========================================================================== */

const API_BASE = '/api/v1';
const SESSION_KEY = 'tasko.session.v1';
const PAGE_SIZE = 9;

const state = {
  session: null,
  categories: [],
  unread: 0,
  api: null,
  skillsDraft: [],
};

let routeToken = 0;
let refreshPromise = null;
const busyActions = new WeakSet();
let modalOpener = null;
let pendingConfirmation = null;

function routePage(route) {
  const page = Number(route.query.get('page') || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function paginationLinks(result, path, filters = {}) {
  if (result.totalPages <= 1) return '';
  const link = (page, label) => {
    const query = new URLSearchParams({ ...filters, page: String(page) });
    return `<a class="btn btn--outline btn--sm" href="#/${path}?${esc(query)}">${label}</a>`;
  };
  return `<nav class="pagination" aria-label="Paginação">
    ${result.page > 1 ? link(result.page - 1, 'Anterior') : ''}
    <span class="pagination__info">Página ${result.page} de ${result.totalPages} · ${result.total} registros</span>
    ${result.page < result.totalPages ? link(result.page + 1, 'Próxima') : ''}
  </nav>`;
}

/* ============================== utilidades ============================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

const textOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const numOrNull = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const isoOrNull = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const fmtMoney = (value) => (value === null || value === undefined ? 'A combinar' : moneyFormatter.format(Number(value)));

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date).replace('.', '');
};

const fmtDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
};

const toLocalInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const timeAgo = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora mesmo';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return fmtDate(value);
};

const initials = (name) => String(name || '?')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('') || '?';

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

/* ============================== ícones ============================== */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M20 13 13 20l-9-9V4h7z"/><circle cx="8.5" cy="8.5" r="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17.5v.5"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 12h3"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};

const icon = (name, className = '') =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ============================== rótulos ============================== */

const ROLE_LABEL = { requester: 'Solicitante', provider: 'Prestador', moderator: 'Moderador' };

const PUBLICATION_STATUS = {
  open: ['Aberta', 'open'],
  inNegotiation: ['Em negociação', 'inNegotiation'],
  agreed: ['Combinado', 'agreed'],
  completed: ['Concluído', 'completed'],
  cancelled: ['Encerrada', 'cancelled'],
  hidden: ['Oculta', 'hidden'],
};

const PROPOSAL_STATUS = {
  pending: ['Pendente', 'pending'],
  accepted: ['Aceita', 'accepted'],
  rejected: ['Recusada', 'rejected'],
  withdrawn: ['Retirada', 'withdrawn'],
  expired: ['Expirada', 'withdrawn'],
};

const ENGAGEMENT_STATUS = {
  active: ['Ativa', 'active'],
  completed: ['Concluída', 'completed'],
  cancelled: ['Cancelada', 'cancelled'],
  disputed: ['Em disputa', 'hidden'],
};

const REPORT_STATUS = {
  pending: ['Pendente', 'pending'],
  underReview: ['Em análise', 'underReview'],
  resolved: ['Resolvida', 'resolved'],
  dismissed: ['Arquivada', 'dismissed'],
};

const REPORT_REASONS = {
  spam: 'Spam ou propaganda',
  fraud: 'Fraude ou golpe',
  offensive: 'Conteúdo ofensivo',
  inappropriate: 'Conteúdo inadequado',
  other: 'Outro motivo',
};

const NOTIFICATION_ICON = {
  proposalReceived: 'bell',
  proposalAccepted: 'check',
  proposalRejected: 'x',
  publicationStatusChanged: 'grid',
  engagementCompleted: 'check',
  reviewReceived: 'star',
  reportResolved: 'shield',
};

/* ============================== componentes ============================== */

function avatarHtml(name, className = '', photoUrl = null) {
  if (photoUrl) {
    return `<span class="avatar ${className}"><img src="${esc(photoUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="avatar ${className}" aria-hidden="true">${esc(initials(name))}</span>`;
}

function stars(rating) {
  const value = Math.round(Number(rating) || 0);
  return `<span class="stars" aria-label="${value} de 5 estrelas">${[1, 2, 3, 4, 5]
    .map((n) => `<span class="${n <= value ? 'is-on' : ''}">★</span>`)
    .join('')}</span>`;
}

const badge = (text, tone) => `<span class="badge badge--${tone}">${esc(text)}</span>`;

function statusBadge(status) {
  const meta = PUBLICATION_STATUS[status] || [status, 'slate'];
  return badge(meta[0], meta[1]);
}

const typeBadge = (type) => (type === 'offer'
  ? badge('Oferta', 'offer')
  : badge('Demanda', 'request'));

function proposalStatusBadge(status) {
  const meta = PROPOSAL_STATUS[status] || [status, 'slate'];
  return badge(meta[0], meta[1]);
}

function engagementStatusBadge(status) {
  const meta = ENGAGEMENT_STATUS[status] || [status, 'slate'];
  return badge(meta[0], meta[1]);
}

function reportStatusBadge(status) {
  const meta = REPORT_STATUS[status] || [status, 'slate'];
  return badge(meta[0], meta[1]);
}

const priceFor = (publication) => {
  if (publication.type === 'offer') {
    return publication.offeredPrice !== null && publication.offeredPrice !== undefined
      ? fmtMoney(publication.offeredPrice)
      : 'A combinar';
  }
  const min = publication.budgetMin;
  const max = publication.budgetMax;
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${fmtMoney(min)} – ${fmtMoney(max)}`;
  }
  if (max !== null && max !== undefined) return `Até ${fmtMoney(max)}`;
  if (min !== null && min !== undefined) return `A partir de ${fmtMoney(min)}`;
  return 'A combinar';
};

const isModerator = () => Boolean(state.session?.user?.roles?.includes('moderator'));

/* ============================== API e sessão ============================== */

class ApiError extends Error {
  constructor(status, payload) {
    const detail = payload && typeof payload === 'object'
      ? (payload.detail || payload.title)
      : null;
    super(detail || (status === 0 ? 'Não foi possível conectar à API.' : `Erro ${status}.`));
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.code = payload && typeof payload === 'object' ? payload.code : null;
    this.errors = payload && typeof payload === 'object' ? payload.errors : null;
  }
}

class FormError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormError';
  }
}

async function api(path, options = {}) {
  const { method = 'GET', body, auth = true, retry = true } = options;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && state.session?.accessToken) headers.Authorization = `Bearer ${state.session.accessToken}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { detail: 'Não foi possível conectar à API. Verifique se o servidor está em execução.' });
  }

  if (response.status === 401 && auth && retry && state.session?.refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, { method, body, auth, retry: false });
  }

  if (response.status === 401 && auth && state.session) {
    clearSession();
    showAuth();
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }

  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

async function tryRefresh() {
  if (!state.session?.refreshToken) return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.session.refreshToken }),
      });
      if (!response.ok) return false;
      const auth = await response.json();
      writeSession(auth);
      updateChrome();
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  state.session = session || null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* armazenamento indisponível: a sessão vale só para esta aba */
  }
}

function clearSession() {
  writeSession(null);
  state.unread = 0;
  const badgeEl = $('#notif-badge');
  if (badgeEl) badgeEl.hidden = true;
}

async function loadCategories() {
  try {
    state.categories = await api('/categories', { auth: false });
  } catch {
    state.categories = [];
  }
}

async function checkHealth() {
  const element = $('#api-status');
  if (!element) return;
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('offline');
    const data = await response.json();
    state.api = data;
    const database = String(data.database || '').toLowerCase();
    $$('[data-demo-only]').forEach((node) => { node.hidden = database !== 'inmemory'; });
    const label = database === 'inmemory' ? 'modo demonstração' : 'PostgreSQL';
    element.className = 'api-status is-online';
    element.innerHTML = `<span class="dot"></span> API online · ${esc(label)}`;
  } catch {
    element.className = 'api-status is-offline';
    element.innerHTML = '<span class="dot"></span> API offline';
  }
}

async function refreshUnread() {
  if (!state.session) return;
  try {
    const data = await api('/notifications/unread-count');
    state.unread = Number(data?.count) || 0;
  } catch {
    state.unread = 0;
  }
  const badgeEl = $('#notif-badge');
  if (!badgeEl) return;
  badgeEl.hidden = state.unread === 0;
  badgeEl.textContent = state.unread > 9 ? '9+' : String(state.unread);
}

/* ============================== casca e navegação ============================== */

function showAuth() {
  document.body.dataset.view = 'auth';
  const authView = $('#auth-view');
  const shell = $('#shell');
  if (authView) authView.hidden = false;
  if (shell) shell.hidden = true;
  closeUserMenu();
  closeNotifPanel();
}

function showShell() {
  document.body.dataset.view = 'app';
  const authView = $('#auth-view');
  const shell = $('#shell');
  if (authView) authView.hidden = true;
  if (shell) shell.hidden = false;
  updateChrome();
}

function updateChrome() {
  const user = state.session?.user;
  if (!user) return;

  const nameEl = $('#user-name');
  const roleEl = $('#user-role');
  const avatarEl = $('#user-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) {
    const roles = (user.roles || []).map((role) => ROLE_LABEL[role] || role);
    roleEl.textContent = roles.length ? roles.join(' · ') : 'Conta';
  }
  if (avatarEl) avatarEl.textContent = initials(user.name);

  const moderator = isModerator();
  $$('[data-moderator-only]').forEach((element) => { element.hidden = !moderator; });
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const name = segments[0] || 'home';
  return { name, segments, query: new URLSearchParams(queryPart || '') };
}

function navigate(path) {
  const target = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (location.hash === target) {
    renderRoute();
    return;
  }
  location.hash = target;
}

function explorePath(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      query.set(key, String(value).trim());
    }
  });
  const text = query.toString();
  return `explore${text ? `?${text}` : ''}`;
}

function setActiveNav(name) {
  const map = {
    home: 'home',
    explore: 'explore',
    publication: 'explore',
    publish: 'publish',
    activities: 'activities',
    profile: 'profile',
    moderation: 'moderation',
  };
  const active = map[name] || '';
  $$('[data-nav]').forEach((element) => {
    element.classList.toggle('is-active', element.dataset.nav === active);
  });
}

async function renderRoute() {
  const token = ++routeToken;
  closeUserMenu();
  closeNotifPanel();

  if (!state.session) {
    showAuth();
    return;
  }

  showShell();
  const route = parseRoute();
  setActiveNav(route.name);
  const main = $('#main');
  if (!main) return;
  main.innerHTML = loadingPage();

  try {
    switch (route.name) {
      case 'home':
        await renderHome(main, token);
        break;
      case 'explore':
        await renderExplore(main, route, token);
        break;
      case 'publication':
        await renderPublicationPage(main, route.segments[1], token);
        break;
      case 'publish':
        await renderPublishPage(main, route.segments[1], token);
        break;
      case 'activities':
        await renderActivities(main, route, token);
        break;
      case 'profile':
        await renderProfilePage(main, route, token);
        break;
      case 'moderation':
        await renderModeration(main, route, token);
        break;
      default:
        navigate('home');
    }
  } catch (error) {
    if (token !== routeToken) return;
    if (!state.session) {
      showAuth();
      return;
    }
    main.innerHTML = errorState(error);
  }
}

/* ============================== estados visuais ============================== */

function loadingPage() {
  return `<div class="page">
    <div class="skeleton skeleton-line skeleton-line--sm" style="margin-bottom:18px"></div>
    <div class="skeleton skeleton-line skeleton-line--lg" style="height:26px;margin-bottom:24px"></div>
    <div class="grid grid--cards">
      ${Array.from({ length: 6 }).map(() => '<div class="skeleton skeleton-card"></div>').join('')}
    </div>
  </div>`;
}

function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="empty">
    <div class="empty__icon">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actionHtml}
  </div>`;
}

function errorState(error) {
  const status = error instanceof ApiError ? error.status : 0;
  const title = status === 403
    ? 'Acesso restrito'
    : status === 404
      ? 'Conteúdo não encontrado'
      : status === 0
        ? 'Sem conexão com a API'
        : 'Algo não saiu como esperado';
  const message = error?.message || 'Tente novamente em instantes.';
  return `<div class="page">
    <div class="error-state">
      <div class="error-state__code">${status || '!'}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(message)}</p>
      <button class="btn btn--primary" type="button" data-action="back">Voltar</button>
    </div>
  </div>`;
}

function forbiddenState(message = 'Seu perfil não tem permissão para acessar esta área.') {
  return `<div class="page">
    <div class="error-state">
      <div class="error-state__icon">${icon('shield')}</div>
      <h2>Acesso restrito</h2>
      <p>${esc(message)}</p>
      <button class="btn btn--outline" type="button" data-action="back">Voltar</button>
    </div>
  </div>`;
}

/* ============================== modais e toasts ============================== */

function openModal(title, bodyHtml, options = {}) {
  closeModal();
  modalOpener = document.activeElement;
  const root = $('#modal-root');
  if (!root) return null;
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
    <div class="modal ${options.wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__head">
        <div class="modal__title">
          <h2 id="modal-title">${esc(title)}</h2>
          ${options.subtitle ? `<p>${esc(options.subtitle)}</p>` : ''}
        </div>
        <button class="modal__close" type="button" aria-label="Fechar" data-modal-close>${icon('x')}</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
      ${options.footer ? `<div class="modal__foot">${options.footer}</div>` : ''}
    </div>
  </div>`;

  const backdrop = root.querySelector('[data-modal-backdrop]');
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal();
  });
  document.body.style.overflow = 'hidden';

  const modal = root.querySelector('.modal');
  requestAnimationFrame(() => {
    const focusable = modal?.querySelector('input:not([type="hidden"]), select, textarea, .modal__close');
    focusable?.focus();
  });
  return modal;
}

function closeModal() {
  const confirmation = pendingConfirmation;
  pendingConfirmation = null;
  confirmation?.(false);
  const root = $('#modal-root');
  if (root) root.innerHTML = '';
  document.body.style.overflow = '';
  if (modalOpener?.isConnected) modalOpener.focus();
  modalOpener = null;
}

function confirmModal({ title, message, confirmLabel = 'Confirmar', tone = 'primary' }) {
  return new Promise((resolve) => {
    const modal = openModal(title, `<p class="confirm-text">${esc(message)}</p>`);
    if (!modal) {
      resolve(false);
      return;
    }
    pendingConfirmation = resolve;
    const foot = document.createElement('div');
    foot.className = 'modal__foot';
    foot.innerHTML = `<button class="btn btn--outline" type="button" data-confirm-cancel>Cancelar</button>
      <button class="btn btn--${tone}" type="button" data-confirm-ok>${esc(confirmLabel)}</button>`;
    modal.appendChild(foot);
    foot.querySelector('[data-confirm-cancel]').addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    foot.querySelector('[data-confirm-ok]').addEventListener('click', () => {
      pendingConfirmation = null;
      closeModal();
      resolve(true);
    });
    foot.querySelector('[data-confirm-ok]').focus();
  });
}

function toast(message, type = 'success') {
  const root = $('#toast-root');
  if (!root) return;
  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'bell' : 'check';
  element.innerHTML = `<span class="toast__icon">${icon(iconName)}</span><p>${esc(message)}</p>`;
  root.appendChild(element);
  setTimeout(() => {
    element.style.transition = 'opacity .2s ease, transform .2s ease';
    element.style.opacity = '0';
    element.style.transform = 'translateX(18px)';
    setTimeout(() => element.remove(), 220);
  }, 4200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado para a área de transferência.', 'info');
  } catch {
    toast('Não foi possível copiar automaticamente.', 'error');
  }
}

/* ============================== formulários ============================== */

function setBusy(form, busy) {
  const button = form.querySelector('[type="submit"]');
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Aguarde…';
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

function clearFormErrors(form) {
  $$('.field-error', form).forEach((element) => element.remove());
  $$('.is-invalid', form).forEach((element) => element.classList.remove('is-invalid'));
  const box = form.querySelector('[data-error]');
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
}

function showFormError(form, error) {
  const box = form.querySelector('[data-error]');
  const isApi = error instanceof ApiError;

  if (box) {
    box.hidden = false;
    box.textContent = isApi && error.status === 400 && error.errors
      ? 'Verifique os campos destacados.'
      : (error?.message || 'Não foi possível concluir a operação.');
  } else {
    toast(error?.message || 'Não foi possível concluir a operação.', 'error');
  }

  if (isApi && error.errors && typeof error.errors === 'object') {
    Object.entries(error.errors).forEach(([key, messages]) => {
      const candidates = [key, key.charAt(0).toLowerCase() + key.slice(1)];
      let input = null;
      for (const candidate of candidates) {
        try {
          input = form.querySelector(`[name="${CSS.escape(candidate)}"]`);
        } catch {
          input = null;
        }
        if (input) break;
      }
      if (!input) return;
      input.classList.add('is-invalid');
      const small = document.createElement('p');
      small.className = 'field-error';
      small.textContent = Array.isArray(messages) ? messages.join(' ') : String(messages);
      input.insertAdjacentElement('afterend', small);
    });
  }
}

/* ============================== autenticação ============================== */

function setAuthTab(tab) {
  $$('[data-auth-tab]').forEach((button) => {
    const active = button.dataset.authTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const login = $('#login-form');
  const register = $('#register-form');
  if (login) login.hidden = tab !== 'login';
  if (register) register.hidden = tab !== 'register';
  const title = $('#auth-title');
  if (title) title.textContent = tab === 'login' ? 'Entre na sua conta Tasko' : 'Crie sua conta Tasko';
}

function fillDemo(email, password) {
  setAuthTab('login');
  const form = $('#login-form');
  if (!form) return;
  const emailInput = form.querySelector('[name="email"]');
  const passwordInput = form.querySelector('[name="password"]');
  if (emailInput) emailInput.value = email;
  if (passwordInput) passwordInput.value = password;
  emailInput?.focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function completeAuth(auth, isNew = false) {
  writeSession(auth);
  updateChrome();
  await refreshUnread().catch(() => {});
  closeModal();
  const firstName = String(auth?.user?.name || '').split(' ')[0] || '';
  toast(isNew ? 'Conta criada com sucesso. Bem-vindo(a)!' : `Bem-vindo(a), ${firstName}!`);
  const login = $('#login-form');
  if (login) login.reset();
  navigate('home');
}

async function logout() {
  const refreshToken = state.session?.refreshToken;
  if (refreshToken) {
    try {
      await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
    } catch {
      /* logout local mesmo se a API falhar */
    }
  }
  clearSession();
  const register = $('#register-form');
  if (register) register.reset();
  showAuth();
  setAuthTab('login');
  toast('Você saiu da sua conta.', 'info');
}

/* ============================== painéis do topo ============================== */

function closeUserMenu() {
  const menu = $('#user-menu');
  if (menu) menu.hidden = true;
  const chip = $('[data-action="toggle-user-menu"]');
  if (chip) chip.setAttribute('aria-expanded', 'false');
}

function toggleUserMenu() {
  const menu = $('#user-menu');
  if (!menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  const chip = $('[data-action="toggle-user-menu"]');
  if (chip) chip.setAttribute('aria-expanded', String(willOpen));
}

function closeNotifPanel() {
  const panel = $('#notif-panel');
  if (panel) panel.hidden = true;
}

async function toggleNotifications() {
  const panel = $('#notif-panel');
  if (!panel) return;
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  panel.innerHTML = `<div class="notif-panel__head"><strong>Notificações</strong><span class="loading-inline"><span class="spinner"></span> carregando</span></div>`;

  try {
    const [result] = await Promise.all([
      api('/notifications?pageSize=6'),
      refreshUnread(),
    ]);
    const items = result.items || [];
    panel.innerHTML = `<div class="notif-panel__head">
        <strong>Notificações</strong>
        <button class="linklike" type="button" data-action="mark-all-read">Marcar todas</button>
      </div>
      ${items.length
        ? items.map((notification) => notificationItem(notification)).join('')
        : `<div style="padding:26px 18px;text-align:center"><p class="hint">Nenhuma notificação por aqui.</p></div>`}
      <div class="notif-panel__foot">
        <a class="linklike" href="#/activities?tab=notifications" data-notif-close>Ver todas as notificações</a>
      </div>`;
  } catch (error) {
    panel.innerHTML = `<div class="notif-panel__head"><strong>Notificações</strong></div>
      <div style="padding:18px"><p class="hint">${esc(error?.message || 'Não foi possível carregar.')}</p></div>`;
  }
}

function notificationItem(notification) {
  const unread = !notification.readAt;
  return `<div class="notification-item ${unread ? 'is-unread' : ''}" role="button" tabindex="0"
      data-action="open-notification"
      data-id="${esc(notification.id)}"
      data-ref-type="${esc(notification.referenceType || '')}"
      data-ref-id="${esc(notification.referenceId || '')}">
    <span class="notification-item__icon">${icon(NOTIFICATION_ICON[notification.type] || 'bell')}</span>
    <div class="notification-item__body">
      <strong>${esc(notification.title)}</strong>
      <p>${esc(notification.message)}</p>
      <time>${timeAgo(notification.createdAt)}</time>
    </div>
    ${unread ? '<span class="notification-item__dot"></span>' : ''}
  </div>`;
}

/* ============================== ações ============================== */

async function handleAction(element) {
  const action = element.dataset.action;
  switch (action) {
    case 'toggle-user-menu':
      toggleUserMenu();
      break;
    case 'toggle-notifications':
      await toggleNotifications();
      break;
    case 'logout':
      await logout();
      break;
    case 'open-publication':
      navigate(`publication/${element.dataset.id}`);
      break;
    case 'open-profile':
      navigate(`profile/${element.dataset.id}`);
      break;
    case 'back':
      if (history.length > 1) history.back();
      else navigate('home');
      break;
    case 'explore-page': {
      const query = new URLSearchParams(location.hash.split('?')[1] || '');
      query.set('page', element.dataset.page || '1');
      navigate(`explore?${query.toString()}`);
      break;
    }
    case 'explore-category':
      navigate(explorePath({ categoryId: element.dataset.category }));
      break;
    case 'toggle-password': {
      const input = document.getElementById(element.dataset.target);
      if (!input) break;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      element.textContent = show ? 'ocultar' : 'ver';
      element.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      break;
    }
    case 'forgot-password':
      openForgotModal();
      break;
    case 'toggle-demo': {
      const list = $('#demo-accounts-list');
      if (!list) break;
      list.hidden = !list.hidden;
      element.setAttribute('aria-expanded', String(!list.hidden));
      element.classList.toggle('is-open', !list.hidden);
      break;
    }
    default:
      if (typeof handleDomainAction === 'function') await handleDomainAction(element);
  }
}

/* ============================== eventos globais ============================== */

function bindEvents() {
  window.addEventListener('hashchange', () => { renderRoute(); });

  document.addEventListener('click', (event) => {
    const modalClose = event.target.closest('[data-modal-close]');
    if (modalClose) {
      closeModal();
      return;
    }

    const copy = event.target.closest('[data-copy]');
    if (copy) {
      copyText(copy.dataset.copy || '');
      return;
    }

    const demo = event.target.closest('[data-demo-email]');
    if (demo) {
      fillDemo(demo.dataset.demoEmail, demo.dataset.demoPassword);
      return;
    }

    const authTab = event.target.closest('[data-auth-tab]');
    if (authTab) {
      setAuthTab(authTab.dataset.authTab);
      return;
    }

    if (event.target.closest('[data-notif-close]')) closeNotifPanel();

    if (!event.target.closest('.user-menu')) closeUserMenu();
    if (!event.target.closest('#notif-panel') && !event.target.closest('[data-action="toggle-notifications"]')) {
      closeNotifPanel();
    }

    const actionElement = event.target.closest('[data-action]');
    if (actionElement) {
      event.preventDefault();
      if (busyActions.has(actionElement)) return;
      busyActions.add(actionElement);
      handleAction(actionElement)
        .catch((error) => toast(error?.message || 'Não foi possível concluir a operação.', 'error'))
        .finally(() => busyActions.delete(actionElement));
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.busy === 'true') return;

    const handler = typeof FORM_HANDLERS !== 'undefined' ? FORM_HANDLERS[form.dataset.form] : null;
    if (!handler) return;

    clearFormErrors(form);
    form.dataset.busy = 'true';
    setBusy(form, true);
    try {
      await handler(form);
    } catch (error) {
      showFormError(form, error);
    } finally {
      delete form.dataset.busy;
      setBusy(form, false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && $('.modal')) {
      const nodes = $$('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex="0"]', $('.modal'))
        .filter((node) => !node.disabled && node.getClientRects().length);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.key === 'Escape') {
      closeModal();
      closeUserMenu();
      closeNotifPanel();
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action][role="button"]')) {
      event.preventDefault();
      event.target.click();
    }
  });
}

/* ============================== boot ============================== */

async function boot() {
  state.session = readSession();
  bindEvents();
  await loadCategories();
  checkHealth();

  if (state.session) {
    try {
      const profile = await api('/users/me');
      state.session.user = { ...state.session.user, ...profile };
      writeSession(state.session);
      await refreshUnread();
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) clearSession();
      else toast('Não foi possível atualizar sua sessão. Verifique a conexão e tente novamente.', 'error');
    }
  }

  renderRoute();
}

boot();
