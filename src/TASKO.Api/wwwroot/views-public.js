'use strict';

/* ============================================================================
   TASKO SPA — telas públicas: início, explorar, detalhe e publicar/editar.
   ========================================================================== */

function pubCard(publication) {
  const offer = publication.type === 'offer';
  return `<article class="pub-card">
    <div class="pub-card__top">
      ${typeBadge(publication.type)}
      ${statusBadge(publication.status)}
      ${publication.proposalCount ? `<span class="pill">${plural(publication.proposalCount, 'proposta', 'propostas')}</span>` : ''}
    </div>
    <h3><button class="linklike" type="button" data-action="open-publication" data-id="${esc(publication.id)}">${esc(publication.title)}</button></h3>
    <p class="pub-card__desc">${esc(publication.description)}</p>
    <div class="meta">
      <span class="meta__item">${icon('pin')}${esc(publication.city)}${publication.neighborhood ? ` · ${esc(publication.neighborhood)}` : ''}</span>
      <span class="meta__item">${icon('tag')}${esc(publication.categoryName)}</span>
    </div>
    <div class="pub-card__foot">
      <div class="price">${priceFor(publication)}<small>${offer ? 'preço ofertado' : 'orçamento'}</small></div>
      <div class="pub-card__author">${avatarHtml(publication.authorName, 'avatar--xs')}<span>${esc(publication.authorName)}</span></div>
    </div>
  </article>`;
}

function reviewRow(review) {
  return `<div class="review">
    <div class="review__head">
      ${avatarHtml(review.reviewerName, 'avatar--xs')}
      <strong>${esc(review.reviewerName)}</strong>
      ${stars(review.rating)}
      <time>${fmtDate(review.createdAt)}</time>
    </div>
    ${review.comment ? `<p>${esc(review.comment)}</p>` : ''}
  </div>`;
}

function categoryName(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.name || 'Categoria';
}

function categoryOptions(selectedId = '', includeAll = false) {
  const all = includeAll ? `<option value="">Todas as categorias</option>` : '';
  return `${all}${state.categories
    .map((category) => `<option value="${esc(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${esc(category.name)}</option>`)
    .join('')}`;
}

/* ============================== início ============================== */

async function renderHome(main, token) {
  const [offers, requests] = await Promise.all([
    api('/publications?type=offer&status=open&pageSize=6'),
    api('/publications?type=request&status=open&pageSize=6'),
  ]);
  if (token !== routeToken) return;

  const user = state.session.user;
  const firstName = String(user.name || '').split(' ')[0];
  const categories = state.categories || [];

  const heroChips = categories.slice(0, 5)
    .map((category) => `<button class="chip" type="button" data-action="explore-category" data-category="${esc(category.id)}">${esc(category.name)}</button>`)
    .join('');

  main.innerHTML = `<div class="page">
    <section class="hero">
      <p class="hero__eyebrow">Olá, ${esc(firstName)}</p>
      <h1>O que você precisa resolver <span>hoje</span>?</h1>
      <p class="hero__sub">Encontre profissionais avaliados por quem já contratou, ou publique o que você oferece e receba propostas.</p>

      <form class="hero__search" data-form="hero-search" role="search">
        ${icon('search')}
        <input name="term" type="search" placeholder="Eletricista, diarista, pintura, montagem de móveis…" aria-label="Buscar serviços" />
        <button class="btn btn--primary" type="submit">Buscar</button>
      </form>

      <div class="hero__chips">${heroChips}</div>

      <div class="hero__stats">
        <div class="hero__stat"><strong>${offers.total}</strong><span>ofertas abertas</span></div>
        <div class="hero__stat"><strong>${requests.total}</strong><span>demandas abertas</span></div>
        <div class="hero__stat"><strong>${categories.length}</strong><span>categorias</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Ofertas em destaque</h2>
          <p>Profissionais que já publicaram o que sabem fazer.</p>
        </div>
        <a class="section-head__link" href="#/explore?type=offer">Ver todas ${icon('arrowRight')}</a>
      </div>
      ${offers.items.length
        ? `<div class="grid grid--cards">${offers.items.map(pubCard).join('')}</div>`
        : emptyState('briefcase', 'Nenhuma oferta aberta', 'Assim que alguém publicar um serviço, ele aparece aqui.', '<a class="btn btn--primary" href="#/publish">Publicar oferta</a>')}
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2>Pedidos recentes</h2>
          <p>Quem precisa de ajuda agora e está aberto a propostas.</p>
        </div>
        <a class="section-head__link" href="#/explore?type=request">Ver todos ${icon('arrowRight')}</a>
      </div>
      ${requests.items.length
        ? `<div class="grid grid--cards">${requests.items.map(pubCard).join('')}</div>`
        : emptyState('message', 'Nenhuma demanda aberta', 'Publique o que você precisa e receba propostas de profissionais.', '<a class="btn btn--primary" href="#/publish">Publicar demanda</a>')}
    </section>

    <section class="trust-banner">
      <div class="trust-item">
        <span class="trust-item__icon">${icon('shield')}</span>
        <div><strong>Contato protegido</strong><small>Telefone e e-mail aparecem apenas para os participantes depois do aceite.</small></div>
      </div>
      <div class="trust-item">
        <span class="trust-item__icon">${icon('star')}</span>
        <div><strong>Avaliações verificadas</strong><small>Só é possível avaliar depois que a contratação é concluída.</small></div>
      </div>
      <div class="trust-item">
        <span class="trust-item__icon">${icon('alert')}</span>
        <div><strong>Moderação humana</strong><small>Denúncias são analisadas antes de qualquer ocultação de conteúdo.</small></div>
      </div>
    </section>
  </div>`;
}

/* ============================== explorar ============================== */

async function renderExplore(main, route, token) {
  const type = route.query.get('type') || '';
  const categoryId = route.query.get('categoryId') || '';
  const city = route.query.get('city') || '';
  const serviceRegion = route.query.get('serviceRegion') || '';
  const term = route.query.get('term') || '';
  const page = Math.max(1, Number.parseInt(route.query.get('page') || '1', 10) || 1);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status: 'open' });
  if (type) query.set('type', type);
  if (categoryId) query.set('categoryId', categoryId);
  if (city) query.set('city', city);
  if (serviceRegion) query.set('serviceRegion', serviceRegion);
  if (term) query.set('term', term);

  const result = await api(`/publications?${query.toString()}`);
  if (token !== routeToken) return;

  const hasFilters = Boolean(type || categoryId || city || serviceRegion || term);
  const totalPages = result.totalPages || 0;
  const typeLabel = type === 'offer' ? 'ofertas' : type === 'request' ? 'demandas' : 'anúncios';

  const pagination = totalPages > 1 ? `<div class="pagination">
      <button class="btn btn--outline btn--sm" type="button" data-action="explore-page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="pagination__info">Página ${page} de ${totalPages}</span>
      <button class="btn btn--outline btn--sm" type="button" data-action="explore-page" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Próxima</button>
    </div>` : '';

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <p class="page-head__eyebrow">Explorar</p>
        <h1>Encontre o serviço certo</h1>
        <p>Filtre por tipo, categoria, cidade e região. Todos os anúncios abertos aceitam propostas.</p>
      </div>
    </div>

    <form class="toolbar explore-filters" data-form="explore-filters" role="search">
      <div class="searchbar">
        ${icon('search')}
        <input name="term" type="search" value="${esc(term)}" placeholder="Buscar por título ou descrição" aria-label="Buscar anúncios" />
      </div>
      <button class="btn btn--outline explore-filters__toggle" type="button"
        data-action="toggle-explore-filters" aria-expanded="false" aria-controls="explore-extra">
        ${icon('filter')} Filtros${hasFilters ? ' ativos' : ''}
      </button>
      <div class="explore-filters__extra" id="explore-extra">
      <select class="select" name="type" aria-label="Tipo de anúncio">
        <option value="">Tudo</option>
        <option value="offer" ${type === 'offer' ? 'selected' : ''}>Ofertas</option>
        <option value="request" ${type === 'request' ? 'selected' : ''}>Demandas</option>
      </select>
      <select class="select" name="categoryId" aria-label="Categoria">
        ${categoryOptions(categoryId, true)}
      </select>
      <input class="input" name="city" value="${esc(city)}" placeholder="Cidade" aria-label="Cidade" />
      <input class="input" name="serviceRegion" value="${esc(serviceRegion)}" placeholder="Região de atendimento" aria-label="Região de atendimento" />
      </div>
      <button class="btn btn--primary" type="submit">Filtrar</button>
      ${hasFilters ? '<a class="btn btn--ghost" href="#/explore">Limpar</a>' : ''}
    </form>

    <div class="results-line">
      <p><strong>${result.total}</strong> ${typeLabel} encontrados${term ? ` para “${esc(term)}”` : ''}</p>
      ${hasFilters ? '<span class="pill">Filtros ativos</span>' : ''}
    </div>

    ${result.items.length
      ? `<div class="grid grid--cards">${result.items.map(pubCard).join('')}</div>`
      : emptyState('search', 'Nada por aqui ainda', 'Tente remover alguns filtros ou publicar o que você precisa.', '<a class="btn btn--outline" href="#/explore">Limpar filtros</a>')}

    ${pagination}
  </div>`;
}

/* ============================== detalhe ============================== */

async function renderPublicationPage(main, publicationId, token) {
  if (!publicationId) {
    navigate('explore');
    return;
  }

  const detail = await api(`/publications/${publicationId}`);
  const publication = detail.publication;
  const me = state.session.user;

  const [reviews, engagementsResult, authorProfile] = await Promise.all([
    api(`/publications/${publicationId}/reviews?page=1&pageSize=10`),
    participantEngagement(publicationId),
    api(`/users/${publication.authorId}/profile`).catch(() => null),
  ]);

  let proposals = [];
  if (publication.authorId === me.id) {
    proposals = await api(`/publications/${publicationId}/proposals`);
  }

  if (token !== routeToken) return;

  const isAuthor = publication.authorId === me.id;
  const engagement = engagementsResult;
  const alreadyReviewed = (reviews.items || []).some((review) => review.reviewerId === me.id);

  const history = (detail.statusHistory || []).map((entry) => `<div class="timeline__item">
      <span class="timeline__dot"></span>
      <div class="timeline__body">
        <strong>${esc(PUBLICATION_STATUS[entry.newStatus]?.[0] || entry.newStatus)}</strong>
        <span>${fmtDateTime(entry.createdAt)}${entry.note ? ` · ${esc(entry.note)}` : ''}</span>
      </div>
    </div>`).join('');

  const proposalsPanel = isAuthor ? `<section class="panel" style="margin-top:16px">
      <div class="panel__head">
        <div><h2>Propostas recebidas</h2><p>${plural(proposals.length, 'proposta', 'propostas')}</p></div>
      </div>
      <div class="panel__body">
        ${proposals.length
          ? proposals.map((proposal) => proposalCard(proposal, { actions: true })).join('')
          : '<p class="hint">Nenhuma proposta ainda. Compartilhe o anúncio para receber mais interessados.</p>'}
      </div>
    </section>` : '';

  const sideAction = isAuthor
    ? `<aside class="panel">
        <div class="panel__head"><h2>Gerenciar anúncio</h2></div>
        <div class="panel__body">
          <p class="hint">Status atual: <strong>${esc(PUBLICATION_STATUS[publication.status]?.[0] || publication.status)}</strong></p>
          <div class="form-actions" style="margin-top:14px">
            ${publication.status === 'open' ? `<button class="btn btn--outline btn--block" type="button" data-action="edit-publication" data-id="${publication.id}">Editar anúncio</button>` : ''}
            ${publication.status === 'open' ? `<button class="btn btn--danger btn--block" type="button" data-action="cancel-publication" data-id="${publication.id}">Encerrar anúncio</button>` : ''}
            <button class="btn btn--ghost btn--block" type="button" data-action="open-profile" data-id="${me.id}">Meu perfil</button>
          </div>
        </div>
      </aside>`
    : `<aside class="panel">
        <div class="panel__body">
          ${publication.status === 'open'
            ? `<h2 style="font-size:15px;font-weight:900">Tem interesse?</h2>
               <p class="hint" style="margin:6px 0 14px">Envie uma proposta com mensagem e valor. O contato só é liberado depois do aceite.</p>
               <button class="btn btn--primary btn--block" type="button" data-action="propose" data-id="${publication.id}" data-title="${esc(publication.title)}">Enviar proposta</button>
               <button class="btn btn--ghost btn--block" type="button" style="margin-top:8px" data-action="report-publication" data-id="${publication.id}" data-title="${esc(publication.title)}">Denunciar anúncio</button>`
            : `<p class="hint">Este anúncio não está mais aberto para propostas.</p>
               <button class="btn btn--ghost btn--block" type="button" style="margin-top:10px" data-action="report-publication" data-id="${publication.id}" data-title="${esc(publication.title)}">Denunciar anúncio</button>`}
        </div>
      </aside>`;

  main.innerHTML = `<div class="page">
    <div class="page-head" style="margin-bottom:16px">
      <button class="linklike" type="button" data-action="back">${icon('arrowLeft')} Voltar</button>
    </div>

    <div class="detail-grid">
      <div>
        <section class="panel detail-head">
          <div class="detail-head__badges">
            ${typeBadge(publication.type)}
            ${statusBadge(publication.status)}
            <span class="pill">${icon('grid')} ${esc(publication.categoryName)}</span>
          </div>
          <h1>${esc(publication.title)}</h1>
          <div class="detail-head__sub meta">
            <span class="meta__item">${icon('pin')}${esc(publication.city)}${publication.neighborhood ? ` · ${esc(publication.neighborhood)}` : ''}</span>
            <span class="meta__item">${icon('tag')}${esc(publication.serviceRegion)}</span>
            ${publication.deadline ? `<span class="meta__item">${icon('calendar')}Prazo: ${fmtDate(publication.deadline)}</span>` : ''}
            <span class="meta__item">${icon('clock')}Publicado ${timeAgo(publication.createdAt)}</span>
          </div>

          <div class="detail-price">
            <div>
              <div class="price">${priceFor(publication)}</div>
              <small>${publication.type === 'offer' ? 'Preço ofertado pelo prestador' : 'Orçamento previsto pelo solicitante'}</small>
            </div>
            <div class="meta">
              <span class="meta__item">${icon('message')}${plural(publication.proposalCount, 'proposta', 'propostas')}</span>
            </div>
          </div>

          <p class="detail-head__desc">${esc(publication.description)}</p>
        </section>

        ${engagement ? engagementPanel(engagement, publication, me, alreadyReviewed) : ''}
        ${proposalsPanel}

        <section class="panel" style="margin-top:16px">
          <div class="panel__head">
            <div><h2>Avaliações</h2><p>${plural(reviews.total || 0, 'avaliação', 'avaliações')} nesta publicação</p></div>
          </div>
          <div class="panel__body">
            ${reviews.items?.length
              ? reviews.items.map(reviewRow).join('')
              : '<p class="hint">As avaliações aparecem aqui depois que o serviço é concluído.</p>'}
          </div>
        </section>

        <section class="panel" style="margin-top:16px">
          <div class="panel__head"><div><h2>Histórico do anúncio</h2><p>Transições de status registradas</p></div></div>
          <div class="panel__body"><div class="timeline">${history}</div></div>
        </section>
      </div>

      <div class="sticky-side">
        ${authorCard(publication, authorProfile)}
        ${sideAction}
      </div>
    </div>
  </div>`;
}

async function participantEngagement(publicationId) {
  let previous = null;
  let page = 1;
  let pages;
  do {
    const result = await api(`/engagements?page=${page}&pageSize=50`);
    const matches = result.items.filter((item) => item.publicationId === publicationId);
    const active = matches.find((item) => item.status === 'active');
    if (active) return active;
    previous ||= matches[0] || null;
    pages = result.totalPages;
    page++;
  } while (page <= pages);
  return previous;
}

function authorCard(publication, profile) {
  const rating = profile && profile.averageRating !== null && profile.averageRating !== undefined
    ? `${stars(profile.averageRating)} <span>${Number(profile.averageRating).toFixed(1)} · ${plural(profile.reviewCount || 0, 'avaliação', 'avaliações')}</span>`
    : '<span>Sem avaliações ainda</span>';

  return `<aside class="panel author-card">
    <div class="author-card__top">
      ${avatarHtml(publication.authorName, 'avatar--lg', profile?.profilePhotoUrl)}
      <div style="min-width:0">
        <button class="linklike author-card__name" type="button" data-action="open-profile" data-id="${publication.authorId}">${esc(publication.authorName)}</button>
        <div class="author-card__meta">${profile?.city ? esc(profile.city) : 'Local não informado'}</div>
        <div class="author-card__meta">${rating}</div>
      </div>
    </div>
    ${profile?.presentation ? `<p class="author-card__bio">${esc(profile.presentation)}</p>` : ''}
    <div class="author-card__actions">
      <button class="btn btn--outline btn--sm" type="button" data-action="open-profile" data-id="${publication.authorId}">Ver perfil completo</button>
      ${publication.authorId !== state.session.user.id
        ? `<button class="btn btn--ghost btn--sm" type="button" data-action="report-user" data-id="${publication.authorId}" data-title="${esc(publication.authorName)}">Denunciar perfil</button>`
        : ''}
    </div>
  </aside>`;
}

function proposalCard(proposal, options = {}) {
  const pending = proposal.status === 'pending';
  return `<div class="proposal">
    <div class="proposal__head">
      ${avatarHtml(proposal.proposerName, 'avatar--sm')}
      <div class="proposal__who">
        <button class="linklike" type="button" data-action="open-profile" data-id="${esc(proposal.proposerId)}">${esc(proposal.proposerName)}</button>
        <small>
          ${proposal.proposerCity ? `${esc(proposal.proposerCity)} · ` : ''}
          ${proposal.proposerRating !== null && proposal.proposerRating !== undefined ? `★ ${Number(proposal.proposerRating).toFixed(1)} · ` : ''}
          ${timeAgo(proposal.createdAt)}
        </small>
      </div>
      <div class="proposal__price">${proposal.proposedPrice !== null && proposal.proposedPrice !== undefined ? fmtMoney(proposal.proposedPrice) : 'A combinar'}</div>
      ${proposalStatusBadge(proposal.status)}
    </div>
    <p class="proposal__msg">${esc(proposal.message)}</p>
    ${options.actions && pending ? `<div class="proposal__actions">
      <button class="btn btn--primary btn--sm" type="button" data-action="accept-proposal" data-id="${proposal.id}" data-publication="${proposal.publicationId}">Aceitar proposta</button>
      <button class="btn btn--danger btn--sm" type="button" data-action="reject-proposal" data-id="${proposal.id}" data-publication="${proposal.publicationId}">Recusar</button>
    </div>` : ''}
  </div>`;
}

function engagementPanel(engagement, publication, me, alreadyReviewed) {
  const isReceiver = engagement.receiverId === me.id;
  const isProposer = engagement.proposerId === me.id;
  const counterpartId = isProposer ? engagement.receiverId : engagement.proposerId;
  const counterpartName = isProposer ? engagement.receiverName : engagement.proposerName;
  const canConfirm = engagement.status === 'active' && isReceiver && publication.status === 'inNegotiation';
  const canComplete = engagement.status === 'active' && isReceiver && publication.status === 'agreed';
  const canCancel = engagement.status === 'active' && (isReceiver || isProposer);
  const canReview = publication.status === 'completed' && engagement.status === 'completed' && !alreadyReviewed;

  return `<section class="panel" style="margin-top:16px">
    <div class="panel__head">
      <div><h2>Contratação</h2><p>Negociação entre as duas partes</p></div>
      ${engagementStatusBadge(engagement.status)}
    </div>
    <div class="panel__body">
      <div class="meta" style="gap:10px 22px">
        <span class="meta__item">${icon('user')}Contraparte: <strong>${esc(counterpartName)}</strong></span>
        <span class="meta__item">${icon('wallet')}Valor combinado: <strong>${engagement.agreedPrice !== null && engagement.agreedPrice !== undefined ? fmtMoney(engagement.agreedPrice) : 'A combinar'}</strong></span>
        <span class="meta__item">${icon('clock')}Início: ${fmtDate(engagement.startedAt)}</span>
      </div>

      <div class="form-actions" style="margin-top:16px">
        ${engagement.contactAvailable ? `<button class="btn btn--primary btn--sm" type="button" data-action="contact" data-id="${engagement.id}">${icon('phone')} Ver contato</button>` : ''}
        ${canConfirm ? `<button class="btn btn--primary btn--sm" type="button" data-action="confirm-engagement" data-id="${engagement.id}" data-publication="${publication.id}">Confirmar combinação</button>` : ''}
        ${canComplete ? `<button class="btn btn--primary btn--sm" type="button" data-action="complete-engagement" data-id="${engagement.id}" data-publication="${publication.id}">Concluir serviço</button>` : ''}
        ${canReview ? `<button class="btn btn--gold btn--sm" type="button" data-action="review" data-publication="${publication.id}" data-user="${counterpartId}" data-name="${esc(counterpartName)}">Avaliar ${esc(counterpartName.split(' ')[0])}</button>` : ''}
        ${canCancel ? `<button class="btn btn--danger btn--sm" type="button" data-action="cancel-engagement" data-id="${engagement.id}" data-publication="${publication.id}">Cancelar contratação</button>` : ''}
      </div>

      ${alreadyReviewed ? '<p class="hint" style="margin-top:10px">Você já avaliou esta contratação.</p>' : ''}
      ${publication.status === 'inNegotiation' && isReceiver ? '<p class="hint" style="margin-top:10px">Confirme a combinação para liberar a etapa de conclusão.</p>' : ''}
    </div>
  </section>`;
}

/* ============================== publicar / editar ============================== */

async function renderPublishPage(main, editId, token) {
  let publication = null;
  if (editId) {
    const detail = await api(`/publications/${editId}`);
    publication = detail.publication;
    if (publication.authorId !== state.session.user.id) {
      if (token === routeToken) main.innerHTML = forbiddenState('Apenas o autor pode editar este anúncio.');
      return;
    }
  }
  if (token !== routeToken) return;

  const type = publication?.type || 'offer';
  const locked = Boolean(publication);

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <p class="page-head__eyebrow">${locked ? 'Editar anúncio' : 'Publicar'}</p>
        <h1>${locked ? 'Ajuste seu anúncio' : 'O que você quer publicar?'}</h1>
        <p>${locked
          ? 'Você pode editar enquanto o anúncio estiver aberto e sem contratação ativa.'
          : 'Escolha entre oferecer um serviço ou pedir ajuda. Leva menos de dois minutos.'}</p>
      </div>
    </div>

    <form class="panel" data-form="publish" data-edit-id="${locked ? publication.id : ''}" data-locked="${locked ? 'true' : 'false'}" style="padding:22px;max-width:820px">
      <div class="field">
        <label>Tipo de anúncio</label>
        <div class="segmented">
          <button class="segmented__btn ${type === 'offer' ? 'is-active' : ''}" type="button" data-action="set-publish-type" data-type="offer" ${locked ? 'disabled' : ''}>Ofereço um serviço</button>
          <button class="segmented__btn ${type === 'request' ? 'is-active' : ''}" type="button" data-action="set-publish-type" data-type="request" ${locked ? 'disabled' : ''}>Preciso de um serviço</button>
        </div>
        <input type="hidden" name="type" value="${type}" />
        ${locked ? '<p class="hint">O tipo de um anúncio não pode ser alterado depois da publicação.</p>' : ''}
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="publish-category">Categoria</label>
          <select class="select" id="publish-category" name="categoryId" required>
            ${categoryOptions(publication?.categoryId || '')}
          </select>
        </div>
        <div class="field">
          <label for="publish-region">Região de atendimento</label>
          <input class="input" id="publish-region" name="serviceRegion" value="${esc(publication?.serviceRegion || '')}" placeholder="Ex.: Zona Sul e Centro" required minlength="2" maxlength="120" />
        </div>
        <div class="field field--full">
          <label for="publish-title">Título</label>
          <input class="input" id="publish-title" name="title" value="${esc(publication?.title || '')}" placeholder="Ex.: Instalação elétrica residencial e reparos" required minlength="5" maxlength="150" />
        </div>
        <div class="field field--full">
          <label for="publish-description">Descrição</label>
          <textarea class="textarea" id="publish-description" name="description" placeholder="Explique o serviço, o que está incluído, prazos e diferenciais." required minlength="20" maxlength="4000">${esc(publication?.description || '')}</textarea>
          <p class="hint">Entre 20 e 4000 caracteres. Não publique telefone, e-mail, endereço completo, documentos ou dados bancários; o contato é liberado após o aceite.</p>
        </div>
        <div class="field">
          <label for="publish-city">Cidade</label>
          <input class="input" id="publish-city" name="city" value="${esc(publication?.city || '')}" placeholder="Ex.: São Paulo" required minlength="2" maxlength="120" />
        </div>
        <div class="field">
          <label for="publish-neighborhood">Bairro (opcional)</label>
          <input class="input" id="publish-neighborhood" name="neighborhood" value="${esc(publication?.neighborhood || '')}" placeholder="Ex.: Vila Mariana" maxlength="120" />
        </div>
      </div>

      <div data-price-offer ${type === 'request' ? 'hidden' : ''}>
        <div class="field" style="max-width:280px">
          <label for="publish-price">Preço ofertado (R$)</label>
          <input class="input" id="publish-price" name="offeredPrice" type="number" min="0" step="0.01" value="${publication?.offeredPrice ?? ''}" placeholder="Ex.: 180" />
          <p class="hint">Deixe em branco para combinar o valor nas propostas.</p>
        </div>
      </div>

      <div data-price-request ${type === 'offer' ? 'hidden' : ''}>
        <div class="form-grid">
          <div class="field">
            <label for="publish-budget-min">Orçamento mínimo (R$)</label>
            <input class="input" id="publish-budget-min" name="budgetMin" type="number" min="0" step="0.01" value="${publication?.budgetMin ?? ''}" placeholder="Ex.: 100" />
          </div>
          <div class="field">
            <label for="publish-budget-max">Orçamento máximo (R$)</label>
            <input class="input" id="publish-budget-max" name="budgetMax" type="number" min="0" step="0.01" value="${publication?.budgetMax ?? ''}" placeholder="Ex.: 300" />
          </div>
          <div class="field field--full">
            <label for="publish-deadline">Prazo desejado</label>
            <input class="input" id="publish-deadline" name="deadline" type="datetime-local" value="${toLocalInputValue(publication?.deadline)}" ${type === 'request' ? 'required' : ''} />
          </div>
        </div>
      </div>

      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit">${locked ? 'Salvar alterações' : 'Publicar anúncio'}</button>
        <button class="btn btn--outline" type="button" data-action="back">Cancelar</button>
      </div>
    </form>
  </div>`;

  setPublishType(type);
}

function setPublishType(type) {
  const form = $('form[data-form="publish"]');
  if (!form || form.dataset.locked === 'true') return;
  const hidden = form.querySelector('[name="type"]');
  if (hidden) hidden.value = type;
  form.querySelectorAll('[data-action="set-publish-type"]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.type === type);
  });
  const offerBlock = form.querySelector('[data-price-offer]');
  const requestBlock = form.querySelector('[data-price-request]');
  if (offerBlock) offerBlock.hidden = type !== 'offer';
  if (requestBlock) requestBlock.hidden = type !== 'request';
  const deadline = form.querySelector('[name="deadline"]');
  if (deadline) deadline.required = type === 'request';
}
