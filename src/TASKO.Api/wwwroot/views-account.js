'use strict';

/* ============================================================================
   TASKO SPA — telas da conta: atividades, perfil e moderação.
   Depende dos helpers globais definidos em app.js e views-public.js.
   ========================================================================== */

const ACTIVITY_TABS = [
  { id: 'publications', label: 'Meus anúncios', icon: 'grid' },
  { id: 'proposals', label: 'Minhas propostas', icon: 'message' },
  { id: 'engagements', label: 'Contratações', icon: 'briefcase' },
  { id: 'notifications', label: 'Notificações', icon: 'bell' },
];

const MODERATION_FILTERS = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'underReview', label: 'Em análise' },
  { id: 'resolved', label: 'Resolvidas' },
  { id: 'dismissed', label: 'Arquivadas' },
  { id: 'all', label: 'Todas' },
];

function activitiesTabLink(tab, current, count) {
  const active = tab.id === current;
  return `<a class="tab ${active ? 'is-active' : ''}" href="#/activities?tab=${tab.id}" role="tab" aria-selected="${active}">
    ${esc(tab.label)}${count ? `<span class="tab__count">${count > 99 ? '99+' : count}</span>` : ''}
  </a>`;
}

/* ============================== atividades ============================== */

async function renderActivities(main, route, token) {
  const me = state.session.user;
  const requested = route.query.get('tab');
  const tab = ACTIVITY_TABS.some((item) => item.id === requested) ? requested : 'publications';

  const page = routePage(route);
  const paths = {
    publications: '/publications/mine', proposals: '/proposals/mine',
    engagements: '/engagements', notifications: '/notifications',
  };
  // Falhas são exibidas pelo roteador, não como listas vazias.
  const [result, unreadResult] = await Promise.all([
    api(`${paths[tab]}?page=${page}&pageSize=${PAGE_SIZE}`),
    api('/notifications/unread-count'),
  ]);
  const empty = { items: [], total: 0 };
  const publications = tab === 'publications' ? result : empty;
  const proposals = tab === 'proposals' ? result : empty;
  const engagements = tab === 'engagements' ? result : empty;
  const notifications = tab === 'notifications' ? result : empty;

  const engagementItems = engagements.items || [];
  const publicationIds = [...new Set(engagementItems.map((item) => item.publicationId))];
  const details = await Promise.all(
    publicationIds.map((id) => api(`/publications/${id}`)),
  );
  const statusByPublication = new Map(
    details.filter(Boolean).map((detail) => [detail.publication.id, detail.publication.status]),
  );

  const reviewedPublications = new Set();
  if (tab === 'engagements') {
    const completed = publicationIds.filter((id) => statusByPublication.get(id) === 'completed');
    const reviewPages = await Promise.all(
      completed.map((id) => api(`/publications/${id}/reviews?page=1&pageSize=50`)),
    );
    completed.forEach((id, index) => {
      if ((reviewPages[index].items || []).some((review) => review.reviewerId === me.id)) {
        reviewedPublications.add(id);
      }
    });
  }

  if (token !== routeToken) return;

  const notificationItems = notifications.items || [];
  const unread = unreadResult.count;
  const counts = {
    [tab]: result.total,
    notifications: unread,
  };

  let content = '';
  if (tab === 'publications') {
    const items = publications.items || [];
    content = items.length
      ? `<div class="grid grid--2">${items.map(myPublicationCard).join('')}</div>`
      : emptyState(
        'grid',
        'Você ainda não publicou nada',
        'Crie uma oferta de serviço ou uma demanda para receber propostas.',
        '<a class="btn btn--primary" href="#/publish">Publicar agora</a>',
      );
  } else if (tab === 'proposals') {
    const items = proposals.items || [];
    content = items.length
      ? items.map(myProposalCard).join('')
      : emptyState(
        'message',
        'Nenhuma proposta enviada',
        'Explore anúncios abertos e envie sua primeira proposta.',
        '<a class="btn btn--primary" href="#/explore">Explorar anúncios</a>',
      );
  } else if (tab === 'engagements') {
    content = engagementItems.length
      ? engagementItems
        .map((engagement) => myEngagementCard(
          engagement,
          statusByPublication.get(engagement.publicationId) || null,
          reviewedPublications.has(engagement.publicationId),
        ))
        .join('')
      : emptyState(
        'briefcase',
        'Nenhuma contratação ainda',
        'Quando uma proposta for aceita, a negociação aparece aqui com o contato liberado.',
        '<a class="btn btn--primary" href="#/explore">Explorar anúncios</a>',
      );
  } else {
    content = notificationItems.length
      ? `<div class="panel">
          <div class="panel__head">
            <div><h2>Notificações</h2><p>${unread ? `${unread} não lidas` : 'Tudo em dia'}</p></div>
            ${unread ? '<button class="btn btn--outline btn--sm" type="button" data-action="mark-all-read">Marcar todas como lidas</button>' : ''}
          </div>
          ${notificationItems.map((notification) => notificationItem(notification)).join('')}
        </div>`
      : emptyState('bell', 'Sem notificações', 'Avisos de propostas, contratações e avaliações aparecem aqui.');
  }

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <p class="page-head__eyebrow">Minha conta</p>
        <h1>Minhas atividades</h1>
        <p>Acompanhe seus anúncios, propostas enviadas, contratações e notificações.</p>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--primary" href="#/publish">${icon('plus')} Publicar anúncio</a>
      </div>
    </div>

    <div class="tabs" role="tablist" aria-label="Seções das atividades">
      ${ACTIVITY_TABS.map((item) => activitiesTabLink(item, tab, counts[item.id])).join('')}
    </div>

    <div class="section" style="margin-top:18px">${content}</div>
    ${paginationLinks(result, 'activities', { tab })}
  </div>`;
}

function myPublicationCard(publication) {
  const canManage = publication.status === 'open';
  return `<article class="activity-card">
    <div class="activity-card__head">
      <div class="activity-card__title">
        <div class="pub-card__top" style="margin-bottom:8px">
          ${typeBadge(publication.type)}
          ${statusBadge(publication.status)}
        </div>
        <h3>${esc(publication.title)}</h3>
        <p>${esc(publication.categoryName)} · ${esc(publication.city)}${publication.neighborhood ? ` · ${esc(publication.neighborhood)}` : ''}</p>
      </div>
      <div class="price">${priceFor(publication)}<small>${publication.type === 'offer' ? 'preço ofertado' : 'orçamento'}</small></div>
    </div>
    <div class="activity-card__body">
      <div class="meta">
        <span class="meta__item">${icon('message')}${plural(publication.proposalCount, 'proposta', 'propostas')}</span>
        <span class="meta__item">${icon('clock')}Publicado ${timeAgo(publication.createdAt)}</span>
        ${publication.deadline ? `<span class="meta__item">${icon('calendar')}Prazo ${fmtDate(publication.deadline)}</span>` : ''}
      </div>
      <div class="activity-card__actions" style="margin-top:14px">
        <button class="btn btn--outline btn--sm" type="button" data-action="open-publication" data-id="${publication.id}">Abrir anúncio</button>
        ${canManage ? `<button class="btn btn--ghost btn--sm" type="button" data-action="edit-publication" data-id="${publication.id}">Editar</button>` : ''}
        ${canManage ? `<button class="btn btn--danger btn--sm" type="button" data-action="cancel-publication" data-id="${publication.id}">Encerrar</button>` : ''}
      </div>
    </div>
  </article>`;
}

function myProposalCard(proposal) {
  const pending = proposal.status === 'pending';
  return `<article class="activity-card">
    <div class="activity-card__head">
      <div class="activity-card__title">
        <div class="pub-card__top" style="margin-bottom:8px">${proposalStatusBadge(proposal.status)}</div>
        <h3>${esc(proposal.publicationTitle)}</h3>
        <p>Enviada ${timeAgo(proposal.createdAt)}${proposal.decidedAt ? ` · decidida ${timeAgo(proposal.decidedAt)}` : ''}</p>
      </div>
      <div class="proposal__price">${proposal.proposedPrice !== null && proposal.proposedPrice !== undefined ? fmtMoney(proposal.proposedPrice) : 'A combinar'}</div>
    </div>
    <div class="activity-card__body">
      <p class="proposal__msg">${esc(proposal.message)}</p>
      <div class="activity-card__actions" style="margin-top:14px">
        <button class="btn btn--outline btn--sm" type="button" data-action="open-publication" data-id="${proposal.publicationId}">Ver anúncio</button>
        ${pending ? `<button class="btn btn--danger btn--sm" type="button" data-action="withdraw-proposal" data-id="${proposal.id}">Retirar proposta</button>` : ''}
      </div>
    </div>
  </article>`;
}

function myEngagementCard(engagement, publicationStatus, reviewed) {
  const me = state.session.user;
  const isReceiver = engagement.receiverId === me.id;
  const counterpartName = isReceiver ? engagement.proposerName : engagement.receiverName;
  const counterpartId = isReceiver ? engagement.proposerId : engagement.receiverId;
  const providerName = engagement.providerName;

  const canConfirm = engagement.status === 'active' && isReceiver && publicationStatus === 'inNegotiation';
  const canComplete = engagement.status === 'active' && isReceiver && publicationStatus === 'agreed';
  const canReview = engagement.status === 'completed' && publicationStatus === 'completed' && !reviewed;
  const canCancel = engagement.status === 'active';

  return `<article class="engagement">
    <div class="engagement__head">
      <div class="engagement__title">
        <div class="pub-card__top" style="margin-bottom:8px">
          ${typeBadge(engagement.publicationType)}
          ${engagementStatusBadge(engagement.status)}
          ${publicationStatus ? statusBadge(publicationStatus) : ''}
        </div>
        <h3><button class="linklike" type="button" data-action="open-publication" data-id="${engagement.publicationId}">${esc(engagement.publicationTitle)}</button></h3>
        <p>Contraparte: <strong>${esc(counterpartName)}</strong>${providerName && providerName !== counterpartName ? ` · Profissional: ${esc(providerName)}` : ''}</p>
      </div>
      <div class="price">${engagement.agreedPrice !== null && engagement.agreedPrice !== undefined ? fmtMoney(engagement.agreedPrice) : 'A combinar'}<small>valor combinado</small></div>
    </div>

    <div class="engagement__meta">
      <span>${icon('clock')} Início ${fmtDate(engagement.startedAt)}</span>
      ${engagement.completedAt ? `<span>${icon('check')} Concluída ${fmtDate(engagement.completedAt)}</span>` : ''}
      <span>${icon('shield')} ${engagement.contactAvailable ? 'Contato liberado' : 'Contato indisponível'}</span>
    </div>

    <div class="engagement__actions">
      ${engagement.contactAvailable ? `<button class="btn btn--primary btn--sm" type="button" data-action="contact" data-id="${engagement.id}">${icon('phone')} Ver contato</button>` : ''}
      ${canConfirm ? `<button class="btn btn--primary btn--sm" type="button" data-action="confirm-engagement" data-id="${engagement.id}" data-publication="${engagement.publicationId}">Confirmar combinação</button>` : ''}
      ${canComplete ? `<button class="btn btn--primary btn--sm" type="button" data-action="complete-engagement" data-id="${engagement.id}" data-publication="${engagement.publicationId}">Concluir serviço</button>` : ''}
      ${canReview ? `<button class="btn btn--gold btn--sm" type="button" data-action="review" data-publication="${engagement.publicationId}" data-user="${counterpartId}" data-name="${esc(counterpartName)}">Avaliar ${esc(String(counterpartName).split(' ')[0])}</button>` : ''}
      ${canCancel ? `<button class="btn btn--danger btn--sm" type="button" data-action="cancel-engagement" data-id="${engagement.id}" data-publication="${engagement.publicationId}">Cancelar</button>` : ''}
      <button class="btn btn--outline btn--sm" type="button" data-action="open-profile" data-id="${counterpartId}">Ver perfil</button>
    </div>
  </article>`;
}

/* ============================== perfil ============================== */

async function renderProfilePage(main, route, token) {
  const targetId = route.segments[1] || state.session.user.id;

  if (targetId === state.session.user.id) {
    await renderMyProfile(main, token);
    return;
  }

  const [profile, reviews] = await Promise.all([
    api(`/users/${targetId}/profile`, { auth: false }),
    api(`/users/${targetId}/reviews?pageSize=10`, { auth: false }).catch(() => ({ items: [], total: 0 })),
  ]);
  if (token !== routeToken) return;

  const rating = profile.averageRating !== null && profile.averageRating !== undefined
    ? Number(profile.averageRating).toFixed(1)
    : '—';

  const skillChips = (profile.skills || []).length
    ? `<div class="chips">${profile.skills.map((skill) => `<span class="skill-chip">${esc(skill.skillName)} <small>${esc(skill.categoryName)}</small></span>`).join('')}</div>`
    : '<p class="hint">Nenhuma habilidade cadastrada.</p>';

  main.innerHTML = `<div class="page">
    <div class="page-head" style="margin-bottom:16px">
      <button class="linklike" type="button" data-action="back">${icon('arrowLeft')} Voltar</button>
    </div>

    <section class="profile-hero">
      <div class="profile-hero__top">
        ${avatarHtml(profile.name, 'avatar profile-hero__avatar', profile.profilePhotoUrl)}
        <div>
          <h1>${esc(profile.name)}</h1>
          <div class="profile-hero__meta">
            ${profile.city ? `<span>${icon('pin')}${esc(profile.city)}${profile.neighborhood ? ` · ${esc(profile.neighborhood)}` : ''}</span>` : ''}
            ${profile.serviceRegion ? `<span>${icon('tag')}${esc(profile.serviceRegion)}</span>` : ''}
            <span>${icon('calendar')}Na TASKO desde ${fmtDate(profile.memberSince)}</span>
          </div>
        </div>
      </div>

      ${profile.presentation ? `<p class="profile-hero__bio">${esc(profile.presentation)}</p>` : ''}

      <div class="profile-hero__stats">
        <div class="profile-hero__stat"><strong>${rating}</strong><span>nota média</span></div>
        <div class="profile-hero__stat"><strong>${profile.reviewCount || 0}</strong><span>avaliações</span></div>
        <div class="profile-hero__stat"><strong>${(profile.skills || []).length}</strong><span>habilidades</span></div>
      </div>

      <div class="profile-hero__roles" style="margin-top:18px">
        ${profile.averageRating !== null && profile.averageRating !== undefined ? stars(profile.averageRating) : ''}
        <button class="btn btn--ghost btn--sm" type="button" data-action="report-user" data-id="${profile.id}">Denunciar perfil</button>
      </div>
    </section>

    <div class="detail-grid" style="margin-top:18px">
      <div class="stack">
        <section class="panel">
          <div class="panel__head"><div><h2>Sobre</h2><p>Apresentação e experiência</p></div></div>
          <div class="panel__body">
            ${profile.description ? `<p style="font-size:13.5px;line-height:1.7;color:var(--ink-2);white-space:pre-line">${esc(profile.description)}</p>` : '<p class="hint">Este perfil ainda não preencheu a descrição.</p>'}
          </div>
        </section>

        <section class="panel">
          <div class="panel__head"><div><h2>Habilidades</h2><p>Serviços declarados</p></div></div>
          <div class="panel__body">${skillChips}</div>
        </section>

        <section class="panel">
          <div class="panel__head"><div><h2>Avaliações recebidas</h2><p>${plural(reviews.total || 0, 'avaliação', 'avaliações')}</p></div></div>
          <div class="panel__body">
            ${(reviews.items || []).length
              ? reviews.items.map(reviewRow).join('')
              : '<p class="hint">Ainda não há avaliações para este perfil.</p>'}
          </div>
        </section>
      </div>

      <aside class="sticky-side">
        <section class="panel author-card">
          <div class="author-card__top">
            ${avatarHtml(profile.name, 'avatar--lg', profile.profilePhotoUrl)}
            <div>
              <div class="author-card__name">${esc(profile.name)}</div>
              <div class="author-card__meta">${profile.city ? esc(profile.city) : 'Local não informado'}</div>
            </div>
          </div>
          <div class="author-card__actions">
            <a class="btn btn--outline btn--sm" href="#/explore">Ver anúncios abertos</a>
          </div>
          <p class="hint" style="margin-top:12px">E-mail e telefone só são liberados para participantes de uma contratação aceita.</p>
        </section>
      </aside>
    </div>
  </div>`;
}

async function renderMyProfile(main, token) {
  const profile = await api('/users/me');
  state.myProfile = profile;
  if (token !== routeToken) return;

  const roles = (profile.roles || []).map((role) => ROLE_LABEL[role] || role);
  const skills = profile.skills || [];

  const skillChips = skills.length
    ? `<div class="chips">${skills.map((skill) => `<span class="skill-chip">
        ${esc(skill.skillName)} <small>${esc(skill.categoryName)}</small>
        <button type="button" data-action="remove-skill" data-category="${skill.categoryId}" data-name="${esc(skill.skillName)}" aria-label="Remover habilidade">×</button>
      </span>`).join('')}</div>`
    : '<p class="hint">Você ainda não cadastrou habilidades. Prestadores com habilidades cadastradas recebem mais propostas.</p>';

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <p class="page-head__eyebrow">Minha conta</p>
        <h1>Meu perfil</h1>
        <p>Seus dados de contato ficam protegidos: só aparecem para a contraparte depois do aceite de uma proposta.</p>
      </div>
      <div class="page-head__actions">
        <a class="btn btn--outline" href="#/activities">Minhas atividades</a>
      </div>
    </div>

    <section class="profile-hero">
      <div class="profile-hero__top">
        ${avatarHtml(profile.name, 'avatar profile-hero__avatar', profile.profilePhotoUrl)}
        <div>
          <h1>${esc(profile.name)}</h1>
          <div class="profile-hero__meta">
            <span>${icon('mail')}${esc(profile.email)}</span>
            ${profile.phone ? `<span>${icon('phone')}${esc(profile.phone)}</span>` : ''}
            ${profile.city ? `<span>${icon('pin')}${esc(profile.city)}${profile.neighborhood ? ` · ${esc(profile.neighborhood)}` : ''}</span>` : ''}
          </div>
          <div class="profile-hero__roles">
            ${roles.map((role) => `<span class="badge">${esc(role)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="profile-hero__stats">
        <div class="profile-hero__stat"><strong>${skills.length}</strong><span>habilidades</span></div>
        <div class="profile-hero__stat"><strong>${roles.length}</strong><span>papéis</span></div>
        <div class="profile-hero__stat"><strong>${profile.updatedAt ? fmtDate(profile.updatedAt) : '—'}</strong><span>última atualização</span></div>
      </div>
    </section>

    <div class="detail-grid" style="margin-top:18px">
      <div class="stack">
        <section class="panel">
          <div class="panel__head"><div><h2>Dados do perfil</h2><p>Apresentação, localização e contato</p></div></div>
          <div class="panel__body">
            <form data-form="profile" novalidate>
              <div class="form-grid">
                <div class="field field--full">
                  <label for="profile-presentation">Apresentação</label>
                  <input class="input" id="profile-presentation" name="presentation" maxlength="200" value="${esc(profile.presentation || '')}" placeholder="Ex.: Eletricista predial e residencial com 12 anos de experiência." />
                </div>
                <div class="field">
                  <label for="profile-phone">Telefone</label>
                  <input class="input" id="profile-phone" name="phone" value="${esc(profile.phone || '')}" placeholder="DDD + número" maxlength="20" inputmode="tel" />
                  <p class="hint">Visível apenas para contrapartes após o aceite.</p>
                </div>
                <div class="field">
                  <label for="profile-city">Cidade</label>
                  <input class="input" id="profile-city" name="city" maxlength="120" value="${esc(profile.city || '')}" placeholder="Ex.: São Paulo" />
                </div>
                <div class="field">
                  <label for="profile-neighborhood">Bairro</label>
                  <input class="input" id="profile-neighborhood" name="neighborhood" maxlength="120" value="${esc(profile.neighborhood || '')}" placeholder="Ex.: Vila Mariana" />
                </div>
                <div class="field">
                  <label for="profile-region">Região de atendimento</label>
                  <input class="input" id="profile-region" name="serviceRegion" maxlength="120" value="${esc(profile.serviceRegion || '')}" placeholder="Ex.: Zona Sul e Centro" />
                </div>
                <div class="field field--full">
                  <label for="profile-photo">Foto de perfil (URL)</label>
                  <input class="input" id="profile-photo" name="profilePhotoUrl" maxlength="500" value="${esc(profile.profilePhotoUrl || '')}" placeholder="https://…" />
                </div>
                <div class="field field--full">
                  <label for="profile-description">Descrição</label>
                  <textarea class="textarea" id="profile-description" name="description" maxlength="1000" placeholder="Conte sua experiência, diferenciais e forma de atendimento.">${esc(profile.description || '')}</textarea>
                </div>
              </div>
              <div class="form-error" data-error hidden></div>
              <div class="form-actions">
                <button class="btn btn--primary" type="submit">Salvar perfil</button>
              </div>
            </form>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head"><div><h2>Habilidades</h2><p>Associe serviços às categorias</p></div></div>
          <div class="panel__body">
            ${skillChips}
            <div class="divider"></div>
            <form data-form="add-skill" novalidate>
              <div class="form-grid">
                <div class="field">
                  <label for="skill-category">Categoria</label>
                  <select class="select" id="skill-category" name="categoryId" required>
                    ${categoryOptions('')}
                  </select>
                </div>
                <div class="field">
                  <label for="skill-name">Habilidade</label>
                  <input class="input" id="skill-name" name="skillName" maxlength="120" minlength="2" placeholder="Ex.: Instalação elétrica residencial" required />
                </div>
              </div>
              <div class="form-error" data-error hidden></div>
              <div class="form-actions">
                <button class="btn btn--outline" type="submit">Adicionar habilidade</button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <aside class="sticky-side">
        <section class="panel author-card">
          <div class="panel__head"><div><h2>Conta</h2><p>Dados de acesso</p></div></div>
          <div class="panel__body">
            <div class="meta" style="display:grid;gap:10px">
              <span class="meta__item">${icon('mail')}${esc(profile.email)}</span>
              <span class="meta__item">${icon('user')}${roles.join(' · ') || 'Sem papéis'}</span>
            </div>
            <p class="hint" style="margin-top:14px">O e-mail de acesso não pode ser alterado nesta versão do MVP.</p>
          </div>
        </section>
      </aside>
    </div>
  </div>`;
}

/* ============================== moderação ============================== */

async function renderModeration(main, route, token) {
  if (!isModerator()) {
    main.innerHTML = forbiddenState('A fila de moderação é restrita a moderadores.');
    return;
  }

  const requested = route.query.get('status') || 'pending';
  const filter = MODERATION_FILTERS.some((item) => item.id === requested) ? requested : 'pending';

  const query = new URLSearchParams({ page: String(routePage(route)), pageSize: String(PAGE_SIZE) });
  if (filter !== 'all') query.set('status', filter);

  const result = await api(`/admin/reports?${query.toString()}`);

  const entries = await Promise.all((result.items || []).map(async (report) => {
    const [publicationDetail, reportedUser, reporter] = await Promise.all([
      report.publicationId
        ? api(`/publications/${report.publicationId}`).catch(() => null)
        : Promise.resolve(null),
      report.reportedUserId
        ? api(`/users/${report.reportedUserId}/profile`, { auth: false }).catch(() => null)
        : Promise.resolve(null),
      api(`/users/${report.reporterId}/profile`, { auth: false }).catch(() => null),
    ]);
    return {
      report,
      publication: publicationDetail?.publication || null,
      reportedUser,
      reporter,
    };
  }));

  if (token !== routeToken) return;

  const filters = MODERATION_FILTERS.map((item) => {
    const active = item.id === filter;
    return `<a class="chip ${active ? 'is-active' : ''}" href="#/moderation?status=${item.id}">${esc(item.label)}</a>`;
  }).join('');

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div>
        <p class="page-head__eyebrow">Governança</p>
        <h1>Fila de moderação</h1>
        <p>Analise denúncias com contexto. Nenhum conteúdo é ocultado sem decisão registrada e justificativa.</p>
      </div>
      <div class="page-head__actions">
        <span class="pill">${icon('shield')} ${plural(result.total || 0, 'denúncia', 'denúncias')}</span>
      </div>
    </div>

    <div class="chips" style="margin-bottom:18px">${filters}</div>

    ${entries.length
      ? entries.map(moderationCard).join('')
      : emptyState('shield', 'Nada na fila', 'Não há denúncias para este filtro. Atualize a página para consultar novamente.')}
    ${paginationLinks(result, 'moderation', { status: filter })}
  </div>`;
}

function moderationCard(entry) {
  const { report, publication, reportedUser, reporter } = entry;
  const reason = REPORT_REASONS[report.reason] || report.reason;
  const actionable = report.status === 'pending' || report.status === 'underReview';
  const targets = [];

  if (publication) {
    targets.push(`<div class="report-target">
      ${icon('grid')}
      <span>Publicação</span>
      <strong>${esc(publication.title)}</strong>
      ${statusBadge(publication.status)}
      <button class="linklike" type="button" data-action="open-publication" data-id="${publication.id}">abrir</button>
    </div>`);
  }

  if (reportedUser) {
    targets.push(`<div class="report-target">
      ${icon('user')}
      <span>Perfil</span>
      <strong>${esc(reportedUser.name)}</strong>
      <button class="linklike" type="button" data-action="open-profile" data-id="${reportedUser.id}">abrir</button>
    </div>`);
  }

  return `<article class="report-card">
    <div class="report-card__head">
      <div class="report-card__title">
        <h2>${esc(reason)}</h2>
        <p>Denúncia de ${esc(reporter?.name || 'usuário')} · ${fmtDateTime(report.createdAt)}</p>
      </div>
      ${reportStatusBadge(report.status)}
    </div>

    <div class="report-card__targets">${targets.join('') || '<p class="hint">Sem alvo associado.</p>'}</div>

    ${report.description ? `<p class="report-card__desc">${esc(report.description)}</p>` : ''}

    ${report.moderationNote ? `<p class="hint" style="margin-top:10px"><strong>Nota da moderação:</strong> ${esc(report.moderationNote)}${report.resolvedAt ? ` · ${fmtDateTime(report.resolvedAt)}` : ''}</p>` : ''}

    ${actionable ? `<div class="report-card__actions">
      <button class="btn btn--outline btn--sm" type="button" data-action="resolve-report" data-id="${report.id}" data-mode="dismiss" data-title="${esc(reason)}">Arquivar denúncia</button>
      ${publication && publication.status !== 'hidden'
        ? `<button class="btn btn--danger btn--sm" type="button" data-action="resolve-report" data-id="${report.id}" data-mode="hide" data-title="${esc(publication.title)}">Ocultar publicação</button>`
        : ''}
    </div>` : ''}
  </article>`;
}
