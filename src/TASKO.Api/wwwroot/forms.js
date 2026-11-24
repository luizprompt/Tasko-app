'use strict';

/* ============================================================================
   TASKO SPA — fluxos de formulário e ações de domínio (propostas, contato,
   avaliações, denúncias, moderação, perfil e autenticação).
   ========================================================================== */

const fieldValue = (form, name) => String(form.querySelector(`[name="${name}"]`)?.value ?? '').trim();

const checkedRoles = (form) => $$('input[name="roles"]:checked', form).map((input) => input.value);

const profilePayload = (profile) => ({
  presentation: textOrNull(profile.presentation),
  phone: textOrNull(profile.phone),
  city: textOrNull(profile.city),
  description: textOrNull(profile.description),
  neighborhood: textOrNull(profile.neighborhood),
  serviceRegion: textOrNull(profile.serviceRegion),
  profilePhotoUrl: textOrNull(profile.profilePhotoUrl),
});

const skillPayload = (skills) => (skills || []).map((skill) => ({
  categoryId: skill.categoryId,
  skillName: skill.skillName,
}));

/* ============================== modais ============================== */

function openForgotModal() {
  openModal(
    'Recuperar senha',
    `<p class="hint" style="margin-bottom:14px">Informe o e-mail da sua conta. Enviaremos as instruções para criar uma nova senha.</p>
    <form data-form="forgot" novalidate>
      <div class="field">
        <label for="forgot-email">E-mail</label>
        <input class="input" id="forgot-email" name="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required />
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit">Enviar instruções</button>
      </div>
    </form>`,
  );
}

function openResetModal(token = '') {
  openModal(
    'Criar nova senha',
    `<form data-form="reset" novalidate>
      <div class="field">
        <label for="reset-token">Token de redefinição</label>
        <input class="input" id="reset-token" name="token" value="${esc(token)}" placeholder="Cole o token recebido" required />
        ${token ? '<p class="hint">Modo demonstração: o token foi preenchido automaticamente.</p>' : ''}
      </div>
      <div class="field">
        <label for="reset-password">Nova senha</label>
        <input class="input" id="reset-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Mínimo 8 caracteres, com letra e número" required />
      </div>
      <div class="field">
        <label for="reset-confirm">Confirme a nova senha</label>
        <input class="input" id="reset-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required />
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit">Redefinir senha</button>
      </div>
    </form>`,
    { subtitle: 'Depois da troca, todas as sessões antigas são encerradas.' },
  );
}

function openProposeModal(publicationId, publicationTitle) {
  openModal(
    'Enviar proposta',
    `<p class="hint" style="margin-bottom:14px">${publicationTitle ? `Para “${esc(publicationTitle)}”. ` : ''}O contato direto só é liberado depois do aceite. Não inclua documentos, endereço completo ou dados bancários na mensagem.</p>
    <form data-form="propose" data-id="${esc(publicationId)}" novalidate>
      <div class="field">
        <label for="propose-message">Mensagem</label>
        <textarea class="textarea" id="propose-message" name="message" minlength="5" maxlength="2000" required placeholder="Explique como você resolve, prazos e o que está incluído."></textarea>
      </div>
      <div class="field">
        <label for="propose-price">Valor proposto (R$)</label>
        <input class="input" id="propose-price" name="proposedPrice" type="number" min="0" step="0.01" placeholder="Opcional: deixe em branco para combinar" />
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit">Enviar proposta</button>
        <button class="btn btn--outline" type="button" data-modal-close>Cancelar</button>
      </div>
    </form>`,
  );
}

function openReviewModal(publicationId, reviewedUserId, reviewedName) {
  const stars = [1, 2, 3, 4, 5]
    .map((value) => `<button class="rating__star ${value <= 5 ? 'is-on' : ''}" type="button" role="radio" aria-checked="${value === 5}" data-action="set-rating" data-value="${value}" aria-label="${value} ${value === 1 ? 'estrela' : 'estrelas'}">★</button>`)
    .join('');

  openModal(
    'Avaliar contratação',
    `<p class="hint" style="margin-bottom:14px">Como foi sua experiência com <strong>${esc(reviewedName)}</strong>? A avaliação fica vinculada a esta contratação concluída.</p>
    <form data-form="review" data-publication="${esc(publicationId)}" data-user="${esc(reviewedUserId)}" novalidate>
      <div class="field">
        <label>Nota</label>
        <input type="hidden" name="rating" value="5" />
        <div class="rating" role="radiogroup" aria-label="Nota de 1 a 5">${stars}</div>
      </div>
      <div class="field">
        <label for="review-comment">Comentário (opcional)</label>
        <textarea class="textarea" id="review-comment" name="comment" maxlength="1000" placeholder="Conte o que funcionou bem e o que poderia melhorar."></textarea>
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--primary" type="submit">Enviar avaliação</button>
        <button class="btn btn--outline" type="button" data-modal-close>Cancelar</button>
      </div>
    </form>`,
  );
}

function openReportModal({ publicationId = null, reportedUserId = null, title = '' }) {
  const reasons = Object.entries(REPORT_REASONS)
    .map(([value, label]) => `<option value="${value}">${esc(label)}</option>`)
    .join('');

  openModal(
    'Denunciar para moderação',
    `<p class="hint" style="margin-bottom:14px">${title ? `Alvo: “${esc(title)}”. ` : ''}A denúncia entra na fila de moderação e não oculta o conteúdo automaticamente.</p>
    <form data-form="report" data-publication="${esc(publicationId || '')}" data-user="${esc(reportedUserId || '')}" novalidate>
      <div class="field">
        <label for="report-reason">Motivo</label>
        <select class="select" id="report-reason" name="reason" required>${reasons}</select>
      </div>
      <div class="field">
        <label for="report-description">Descrição</label>
        <textarea class="textarea" id="report-description" name="description" maxlength="1000" placeholder="Explique o que aconteceu. Quanto mais contexto, melhor para a moderação."></textarea>
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--danger" type="submit">Enviar denúncia</button>
        <button class="btn btn--outline" type="button" data-modal-close>Cancelar</button>
      </div>
    </form>`,
  );
}

function openResolveReportModal({ id, mode, title }) {
  const hide = mode === 'hide';
  openModal(
    hide ? 'Ocultar publicação' : 'Arquivar denúncia',
    `<p class="confirm-text">${hide
      ? `A publicação “${esc(title)}” será ocultada da plataforma e o autor será notificado. A decisão fica registrada na denúncia.`
      : 'A denúncia será encerrada como arquivada, sem alterar o conteúdo denunciado.'}</p>
    <form data-form="resolve-report" data-id="${esc(id)}" data-mode="${esc(mode)}" novalidate style="margin-top:14px">
      <div class="field">
        <label for="resolve-note">Justificativa${hide ? '' : ' (opcional)'}</label>
        <textarea class="textarea" id="resolve-note" name="note" maxlength="500" ${hide ? 'minlength="5" required' : ''} placeholder="${hide ? 'Descreva o motivo da ocultação (mínimo 5 caracteres).' : 'Observação interna da moderação.'}"></textarea>
      </div>
      <div class="form-error" data-error hidden></div>
      <div class="form-actions">
        <button class="btn btn--${hide ? 'danger' : 'primary'}" type="submit">${hide ? 'Ocultar publicação' : 'Arquivar denúncia'}</button>
        <button class="btn btn--outline" type="button" data-modal-close>Cancelar</button>
      </div>
    </form>`,
  );
}

async function openContactModal(engagementId) {
  const contact = await api(`/engagements/${engagementId}/contact`);
  const me = state.session.user.id;

  const row = (participant, label) => `<div class="contact-row">
    ${avatarHtml(participant.name, 'avatar--sm')}
    <div class="contact-row__body">
      <strong>${esc(participant.name)}${participant.userId === me ? ' (você)' : ''}</strong>
      <span>${label}</span>
      <span>${esc(participant.email)}</span>
      <span>${participant.phone ? esc(participant.phone) : 'Telefone não informado'}</span>
    </div>
    <button class="btn btn--outline btn--sm" type="button" data-copy="${esc(participant.email)}">Copiar e-mail</button>
    ${participant.phone ? `<button class="btn btn--outline btn--sm" type="button" data-copy="${esc(participant.phone)}">Copiar telefone</button>` : ''}
  </div>`;

  openModal(
    'Contato liberado',
    `<p class="hint" style="margin-bottom:14px">Disponível porque a proposta foi aceita. Combine os detalhes diretamente com a contraparte.</p>
    <div class="contact-list">
      ${row(contact.proposer, 'Proponente')}
      ${row(contact.receiver, 'Autor do anúncio')}
    </div>`,
    { subtitle: 'Contato visível apenas para os participantes desta contratação (RN06).' },
  );
}

/* ============================== formulários ============================== */

const FORM_HANDLERS = {
  login: async (form) => {
    const email = fieldValue(form, 'email');
    const password = String(form.querySelector('[name="password"]')?.value ?? '');
    if (!email || !password) throw new FormError('Informe e-mail e senha.');
    const auth = await api('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    await completeAuth(auth);
  },

  register: async (form) => {
    const name = fieldValue(form, 'name');
    const email = fieldValue(form, 'email');
    const password = String(form.querySelector('[name="password"]')?.value ?? '');
    const roles = checkedRoles(form);

    if (name.length < 2) throw new FormError('Informe seu nome completo.');
    if (!email) throw new FormError('Informe um e-mail válido.');
    if (password.length < 8) throw new FormError('A senha precisa ter ao menos 8 caracteres.');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new FormError('A senha precisa ter ao menos uma letra e um número.');
    }
    if (!roles.length) throw new FormError('Escolha ao menos um papel: solicitante ou prestador.');

    const auth = await api('/auth/register', {
      method: 'POST',
      body: { name, email, password, roles },
      auth: false,
    });
    form.reset();
    await completeAuth(auth, true);
  },

  forgot: async (form) => {
    const email = fieldValue(form, 'email');
    if (!email) throw new FormError('Informe o e-mail da sua conta.');
    const result = await api('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    });
    closeModal();
    toast(result?.message || 'Se o e-mail existir, enviaremos as instruções de redefinição.');
    if (result?.resetToken) openResetModal(result.resetToken);
  },

  reset: async (form) => {
    const token = fieldValue(form, 'token');
    const newPassword = String(form.querySelector('[name="newPassword"]')?.value ?? '');
    const confirmPassword = String(form.querySelector('[name="confirmPassword"]')?.value ?? '');
    if (!token) throw new FormError('Informe o token de redefinição.');
    if (newPassword !== confirmPassword) throw new FormError('As senhas não coincidem.');
    if (newPassword.length < 8) throw new FormError('A senha precisa ter ao menos 8 caracteres.');
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new FormError('A senha precisa ter ao menos uma letra e um número.');
    }
    await api('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
      auth: false,
    });
    closeModal();
    setAuthTab('login');
    toast('Senha redefinida. Entre com a nova senha.', 'info');
  },

  'hero-search': async (form) => {
    navigate(explorePath({ term: fieldValue(form, 'term') }));
  },

  'explore-filters': async (form) => {
    navigate(explorePath({
      type: fieldValue(form, 'type'),
      categoryId: fieldValue(form, 'categoryId'),
      city: fieldValue(form, 'city'),
      serviceRegion: fieldValue(form, 'serviceRegion'),
      term: fieldValue(form, 'term'),
    }));
  },

  publish: async (form) => {
    const editId = form.dataset.editId || '';
    const type = fieldValue(form, 'type') || 'offer';
    const categoryId = fieldValue(form, 'categoryId');
    const title = fieldValue(form, 'title');
    const description = fieldValue(form, 'description');
    const city = fieldValue(form, 'city');
    const neighborhood = textOrNull(fieldValue(form, 'neighborhood'));
    const serviceRegion = fieldValue(form, 'serviceRegion');
    const deadline = isoOrNull(fieldValue(form, 'deadline'));

    if (!categoryId) throw new FormError('Selecione uma categoria.');
    if (title.length < 5) throw new FormError('O título precisa ter ao menos 5 caracteres.');
    if (description.length < 20) throw new FormError('A descrição precisa ter ao menos 20 caracteres.');
    if (city.length < 2) throw new FormError('Informe a cidade.');
    if (serviceRegion.length < 2) throw new FormError('Informe a região de atendimento.');
    if (type === 'request' && !deadline) throw new FormError('Informe o prazo desejado para a demanda.');

    const payload = {
      categoryId,
      title,
      description,
      city,
      neighborhood,
      serviceRegion,
      budgetMin: type === 'request' ? numOrNull(fieldValue(form, 'budgetMin')) : null,
      budgetMax: type === 'request' ? numOrNull(fieldValue(form, 'budgetMax')) : null,
      offeredPrice: type === 'offer' ? numOrNull(fieldValue(form, 'offeredPrice')) : null,
      deadline: type === 'request' ? deadline : null,
    };

    if (payload.budgetMin !== null && payload.budgetMax !== null && payload.budgetMin > payload.budgetMax) {
      throw new FormError('O orçamento mínimo não pode ser maior que o máximo.');
    }

    if (editId) {
      const updated = await api(`/publications/${editId}`, { method: 'PUT', body: payload });
      toast('Anúncio atualizado.');
      navigate(`publication/${updated.id}`);
      return;
    }

    const created = await api('/publications', {
      method: 'POST',
      body: { ...payload, type },
    });
    toast('Anúncio publicado com sucesso.');
    navigate(`publication/${created.id}`);
  },

  propose: async (form) => {
    const publicationId = form.dataset.id;
    const message = fieldValue(form, 'message');
    if (message.length < 5) throw new FormError('Escreva uma mensagem com ao menos 5 caracteres.');
    await api(`/publications/${publicationId}/proposals`, {
      method: 'POST',
      body: { message, proposedPrice: numOrNull(fieldValue(form, 'proposedPrice')) },
    });
    closeModal();
    toast('Proposta enviada. Você será avisado quando houver resposta.');
    renderRoute();
  },

  review: async (form) => {
    const publicationId = form.dataset.publication;
    const reviewedUserId = form.dataset.user;
    const rating = Number.parseInt(fieldValue(form, 'rating') || '5', 10);
    if (!(rating >= 1 && rating <= 5)) throw new FormError('Escolha uma nota entre 1 e 5.');
    await api(`/publications/${publicationId}/reviews`, {
      method: 'POST',
      body: {
        reviewedUserId,
        rating,
        comment: textOrNull(fieldValue(form, 'comment')),
      },
    });
    closeModal();
    toast('Avaliação registrada. Obrigado pelo retorno!');
    renderRoute();
  },

  report: async (form) => {
    const publicationId = form.dataset.publication || null;
    const reportedUserId = form.dataset.user || null;
    await api('/reports', {
      method: 'POST',
      body: {
        publicationId: publicationId || null,
        reportedUserId: reportedUserId || null,
        reason: fieldValue(form, 'reason') || 'other',
        description: textOrNull(fieldValue(form, 'description')),
      },
    });
    closeModal();
    toast('Denúncia enviada para a fila de moderação.', 'info');
  },

  profile: async (form) => {
    const profile = await api('/users/me/profile', {
      method: 'PUT',
      body: profilePayload({
        presentation: fieldValue(form, 'presentation'),
        phone: fieldValue(form, 'phone'),
        city: fieldValue(form, 'city'),
        description: fieldValue(form, 'description'),
        neighborhood: fieldValue(form, 'neighborhood'),
        serviceRegion: fieldValue(form, 'serviceRegion'),
        profilePhotoUrl: fieldValue(form, 'profilePhotoUrl'),
      }),
    });
    state.myProfile = profile;
    toast('Perfil atualizado.');
    renderRoute();
  },

  'add-skill': async (form) => {
    const categoryId = fieldValue(form, 'categoryId');
    const skillName = fieldValue(form, 'skillName');
    if (!categoryId) throw new FormError('Selecione uma categoria.');
    if (skillName.length < 2) throw new FormError('Informe o nome da habilidade.');

    const current = state.myProfile?.skills || [];
    const duplicated = current.some((skill) =>
      skill.categoryId === categoryId && skill.skillName.toLowerCase() === skillName.toLowerCase());
    if (duplicated) throw new FormError('Essa habilidade já está cadastrada.');

    const profile = await api('/users/me/skills', {
      method: 'PUT',
      body: { skills: [...skillPayload(current), { categoryId, skillName }] },
    });
    state.myProfile = profile;
    toast('Habilidade adicionada.');
    renderRoute();
  },

  'resolve-report': async (form) => {
    const id = form.dataset.id;
    const action = form.dataset.mode === 'hide' ? 'hide' : 'dismiss';
    const note = fieldValue(form, 'note');
    if (action === 'hide' && note.length < 5) {
      throw new FormError('Justifique a ocultação com ao menos 5 caracteres.');
    }
    await api(`/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: { action, note: note || null },
    });
    closeModal();
    toast(action === 'hide' ? 'Publicação oculta e denúncia resolvida.' : 'Denúncia arquivada.');
    renderRoute();
  },
};

/* ============================== ações de domínio ============================== */

async function handleDomainAction(element) {
  const action = element.dataset.action;

  switch (action) {
    case 'toggle-explore-filters': {
      const form = element.closest('form');
      const expanded = form.classList.toggle('is-expanded');
      element.setAttribute('aria-expanded', String(expanded));
      break;
    }
    case 'edit-publication':
      navigate(`publish/${element.dataset.id}`);
      break;

    case 'cancel-publication': {
      const confirmed = await confirmModal({
        title: 'Encerrar anúncio',
        message: 'O anúncio deixa de aceitar novas propostas. Você poderá publicar outro quando quiser.',
        confirmLabel: 'Encerrar anúncio',
        tone: 'danger',
      });
      if (!confirmed) break;
      await api(`/publications/${element.dataset.id}/cancel`, { method: 'POST' });
      toast('Anúncio encerrado.', 'info');
      renderRoute();
      break;
    }

    case 'propose': {
      const publicationId = element.dataset.id;
      const title = element.dataset.title || '';
      openProposeModal(publicationId, title);
      break;
    }

    case 'accept-proposal': {
      const confirmed = await confirmModal({
        title: 'Aceitar proposta',
        message: 'As demais propostas pendentes serão recusadas automaticamente e o contato será liberado para os dois participantes.',
        confirmLabel: 'Aceitar proposta',
      });
      if (!confirmed) break;
      await api(`/proposals/${element.dataset.id}/accept`, { method: 'POST' });
      toast('Proposta aceita. O contato foi liberado.');
      navigate(`publication/${element.dataset.publication}`);
      break;
    }

    case 'reject-proposal': {
      const confirmed = await confirmModal({
        title: 'Recusar proposta',
        message: 'A proposta será marcada como recusada e o proponente será notificado.',
        confirmLabel: 'Recusar',
        tone: 'danger',
      });
      if (!confirmed) break;
      await api(`/proposals/${element.dataset.id}/reject`, { method: 'POST' });
      toast('Proposta recusada.', 'info');
      renderRoute();
      break;
    }

    case 'withdraw-proposal': {
      const confirmed = await confirmModal({
        title: 'Retirar proposta',
        message: 'Sua proposta será retirada e o autor do anúncio não poderá mais aceitá-la.',
        confirmLabel: 'Retirar proposta',
        tone: 'danger',
      });
      if (!confirmed) break;
      await api(`/proposals/${element.dataset.id}`, { method: 'DELETE' });
      toast('Proposta retirada.', 'info');
      renderRoute();
      break;
    }

    case 'contact':
      await openContactModal(element.dataset.id);
      break;

    case 'confirm-engagement': {
      const confirmed = await confirmModal({
        title: 'Confirmar combinação',
        message: 'O anúncio passa para “combinado”. Depois disso você poderá concluir o serviço e liberar as avaliações.',
        confirmLabel: 'Confirmar combinação',
      });
      if (!confirmed) break;
      await api(`/engagements/${element.dataset.id}/confirm`, { method: 'POST' });
      toast('Combinação confirmada.');
      renderRoute();
      break;
    }

    case 'complete-engagement': {
      const confirmed = await confirmModal({
        title: 'Concluir serviço',
        message: 'A contratação será concluída e as duas partes poderão se avaliar. Confirme apenas se o serviço foi entregue.',
        confirmLabel: 'Concluir serviço',
      });
      if (!confirmed) break;
      await api(`/engagements/${element.dataset.id}/complete`, { method: 'POST' });
      toast('Serviço concluído. As avaliações estão liberadas.');
      renderRoute();
      break;
    }

    case 'cancel-engagement': {
      const confirmed = await confirmModal({
        title: 'Cancelar contratação',
        message: 'A contratação será cancelada. Se a publicação estava em negociação, ela volta a ficar aberta para novas propostas.',
        confirmLabel: 'Cancelar contratação',
        tone: 'danger',
      });
      if (!confirmed) break;
      await api(`/engagements/${element.dataset.id}/cancel`, { method: 'POST' });
      toast('Contratação cancelada.', 'info');
      renderRoute();
      break;
    }

    case 'review':
      openReviewModal(
        element.dataset.publication,
        element.dataset.user,
        element.dataset.name || 'a contraparte',
      );
      break;

    case 'report-publication':
      openReportModal({ publicationId: element.dataset.id, title: element.dataset.title || '' });
      break;

    case 'report-user':
      openReportModal({ reportedUserId: element.dataset.id, title: element.dataset.title || '' });
      break;

    case 'resolve-report':
      openResolveReportModal({
        id: element.dataset.id,
        mode: element.dataset.mode || 'dismiss',
        title: element.dataset.title || 'conteúdo denunciado',
      });
      break;

    case 'set-rating': {
      const form = element.closest('form');
      if (!form) break;
      const value = Number.parseInt(element.dataset.value || '0', 10);
      const input = form.querySelector('[name="rating"]');
      if (input) input.value = String(value);
      $$('.rating__star', form).forEach((star) => {
        const starValue = Number.parseInt(star.dataset.value || '0', 10);
        star.classList.toggle('is-on', starValue <= value);
        star.setAttribute('aria-checked', String(starValue === value));
      });
      break;
    }

    case 'set-publish-type':
      setPublishType(element.dataset.type);
      break;

    case 'mark-all-read':
      await api('/notifications/read-all', { method: 'POST' });
      await refreshUnread();
      closeNotifPanel();
      toast('Notificações marcadas como lidas.', 'info');
      renderRoute();
      break;

    case 'open-notification': {
      const id = element.dataset.id;
      if (element.classList.contains('is-unread')) {
        try {
          await api(`/notifications/${id}/read`, { method: 'POST' });
        } catch {
          /* seguir para o destino mesmo se a marcação falhar */
        }
        await refreshUnread();
      }
      closeNotifPanel();
      const referenceType = element.dataset.refType;
      const referenceId = element.dataset.refId;
      if (referenceType === 'publication' && referenceId) navigate(`publication/${referenceId}`);
      else if (referenceType === 'user' && referenceId) navigate(`profile/${referenceId}`);
      else if (referenceType === 'engagement') navigate('activities?tab=engagements');
      else if (referenceType === 'report') navigate('moderation');
      else navigate('activities?tab=notifications');
      break;
    }

    case 'open-reset':
      openResetModal(element.dataset.token || '');
      break;

    case 'remove-skill': {
      const categoryId = element.dataset.category;
      const name = element.dataset.name;
      const current = state.myProfile?.skills || [];
      const skills = current.filter((skill) =>
        !(skill.categoryId === categoryId && skill.skillName === name));
      const profile = await api('/users/me/skills', {
        method: 'PUT',
        body: { skills: skillPayload(skills) },
      });
      state.myProfile = profile;
      toast('Habilidade removida.', 'info');
      renderRoute();
      break;
    }

    default:
      break;
  }
}
