# TASKO API v1 — contrato resumido

Base: `/api/v1`. Corpo e resposta em JSON (camelCase). Enums como string camelCase
(`request`, `inNegotiation`, `provider`, `hide`, ...). Datas em ISO 8601 UTC.

Autenticação: `Authorization: Bearer <accessToken>` nas rotas marcadas com 🔒.
Rotas de moderação exigem o papel `moderator` (política `Moderator`).

## Formato de erro (RFC 7807)

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.9",
  "title": "Conflito de estado",
  "status": 409,
  "detail": "A publicação não está aberta para propostas.",
  "instance": "/api/v1/publications/8f.../proposals",
  "code": "publication.not_open",
  "traceId": "0HN7..."
}
```

| `ErrorKind` | HTTP | Uso |
| --- | --- | --- |
| `Validation` | 400 | regra de domínio/validação de entrada |
| `Unauthorized` | 401 | sem token ou credencial inválida |
| `Forbidden` | 403 | autenticado sem permissão (ex.: não é autor) |
| `NotFound` | 404 | recurso inexistente ou invisível |
| `Conflict` | 409 | transição de estado inválida, duplicidade |

Validações de entrada retornam `ValidationProblemDetails` com `errors: { campo: [mensagens] }`
e `code: "validation.failed"`. Stack traces nunca são expostos.

## Paginação

Toda listagem aceita `page` (≥ 1, padrão 1) e `pageSize` (padrão 20, máximo 50) e responde:

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
```

---

## Auth — `/api/v1/auth`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/register` | — | Cria conta com papéis `requester`/`provider` (201) |
| POST | `/login` | — | Access + refresh token |
| POST | `/refresh` | — | Rotaciona refresh token |
| POST | `/logout` | — | Revoga o refresh token (204) |
| POST | `/forgot-password` | — | Gera token de reset; resposta genérica |
| POST | `/reset-password` | — | Troca a senha e revoga refresh tokens (204) |

`POST /register`

```json
{ "name": "Maria Silva", "email": "maria@exemplo.com", "password": "Senha123", "roles": ["requester", "provider"] }
```

`AuthResponse`:

```json
{
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-11-21T12:15:00Z",
  "refreshToken": "3f9c...",
  "user": { "id": "…", "name": "Maria Silva", "email": "maria@exemplo.com", "roles": ["requester", "provider"] }
}
```

Regras: senha 8–128 com letra e número; e-mail normalizado (trim + lowercase); e-mail duplicado → 409
`auth.email_taken`; papel `moderator` no cadastro → 403 `auth.role_moderator`.
`forgot-password` responde sempre 200 com mensagem genérica; em `Development` (`Auth:ExposeSensitiveTokens`)
devolve `resetToken` para facilitar testes.

Cadastro, login, forgot/reset compartilham uma janela de 10 tentativas por minuto por IP e
instância (`Security:AuthAttemptsPerMinute`). Excesso → 429 `application/problem+json`,
`code: "auth.rate_limited"` e cabeçalho `Retry-After` em segundos. Refresh/logout não consomem
essa janela. Tokens sensíveis e provider InMemory são rejeitados fora de Development/Demo.
Respostas sob `/api` possuem `Cache-Control: no-store`.

## Usuários — `/api/v1/users`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/me` | 🔒 | Perfil próprio (inclui `email` e `phone`) |
| PUT | `/me/profile` | 🔒 | Atualiza apresentação, telefone, cidade, descrição, bairro, região, foto |
| PUT | `/me/skills` | 🔒 | Substitui a lista de habilidades |
| GET | `/{id}/profile` | — | Perfil público (**sem** e-mail/telefone) + média e total de avaliações |
| GET | `/{id}/reviews` | — | Avaliações recebidas (paginado) |

`PUT /me/profile`

```json
{
  "presentation": "Eletricista com 10 anos de experiência",
  "phone": "11999998888",
  "city": "São Paulo",
  "description": "Atendo residências e comércios.",
  "neighborhood": "Centro",
  "serviceRegion": "Zona Central",
  "profilePhotoUrl": "https://…"
}
```

`PUT /me/skills`

```json
{ "skills": [ { "categoryId": "…", "skillName": "Instalação elétrica" } ] }
```

Telefone exige ao menos 10 dígitos quando informado. Categoria inexistente → 404 `category.not_found`.

## Categorias — `/api/v1/categories`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `` | — | Lista categorias ordenadas por nome |

## Publicações — `/api/v1/publications`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `` | — | Busca com filtros + paginação (padrão: `status=open`) |
| POST | `` | 🔒 | Cria publicação (201) |
| GET | `/mine` | 🔒 | Publicações do usuário (todos os status) |
| GET | `/{id}` | — | Detalhe + histórico de status |
| PUT | `/{id}` | 🔒 | Edita (só autor, só `open`, sem contratação ativa) |
| POST | `/{id}/cancel` | 🔒 | Encerra (só autor, só `open`) |
| GET | `/{id}/history` | — | Histórico de transições de status |
| POST | `/{id}/proposals` | 🔒 | Envia proposta (201) |
| GET | `/{id}/proposals` | 🔒 | Propostas recebidas (só autor) |
| POST | `/{id}/reviews` | 🔒 | Avalia a contraparte após conclusão (201) |
| GET | `/{id}/reviews` | — | Avaliações da publicação (paginado) |

Query de busca: `type` (`offer`/`request`), `categoryId`, `city`, `serviceRegion`, `term`
(título/descrição, case-insensitive), `status`, `page`, `pageSize`. Publicações `hidden`
nunca aparecem na busca.

`POST /publications` (demanda):

```json
{
  "type": "request",
  "categoryId": "…",
  "title": "Preciso de eletricista",
  "description": "Troca de disjuntor e revisão da fiação antiga do imóvel.",
  "city": "São Paulo",
  "neighborhood": "Centro",
  "serviceRegion": "Zona Central",
  "budgetMin": 100,
  "budgetMax": 300,
  "deadline": "2026-12-01T18:00:00Z"
}
```

Oferta usa `offeredPrice` e **não** aceita orçamento nem exige prazo. Regras: título 5–150,
descrição 20–4000, `deadline` futuro em `request`, `budgetMin ≤ budgetMax`, valores ≥ 0,
tipo imutável após criação.

`GET /{id}` → `{ "publication": { … }, "statusHistory": [ { "oldStatus", "newStatus", "changedBy", "note", "createdAt" } ] }`.
`PublicationResponse` inclui `authorId`, `authorName`, `categoryId`, `categoryName`, `type`, `status`,
faixas de preço, `deadline`, `proposalCount`, `createdAt`, `updatedAt`, `closedAt`.

## Propostas — `/api/v1`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/proposals/mine` | 🔒 | Propostas enviadas pelo usuário |
| POST | `/proposals/{id}/accept` | 🔒 | Aceite atômico → `EngagementResponse` |
| POST | `/proposals/{id}/reject` | 🔒 | Recusa (só autor da publicação) |
| DELETE | `/proposals/{id}` | 🔒 | Retira a própria proposta pendente |

`POST /publications/{id}/proposals`

```json
{ "message": "Posso executar o serviço amanhã pela manhã.", "proposedPrice": 200 }
```

Regras: publicação `open`, sem auto-proposta, papel `provider` obrigatório apenas em `request`,
uma proposta pendente por usuário/publicação, mensagem 5–2000. O autor recebe notificação
`proposalReceived`.

**Aceite** (autor da publicação) executa em uma única transação: proposta aceita, demais pendentes
recusadas, publicação → `in_negotiation`, linha em `publication_status_history`, criação do
`engagement`, liberação de contato e notificação ao proponente.

## Contratações — `/api/v1/engagements`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `` | 🔒 | Contratações em que o usuário é participante (paginado) |
| GET | `/{id}` | 🔒 | Detalhe (só participantes) |
| GET | `/{id}/contact` | 🔒 | Contato dos dois participantes (RN06) |
| POST | `/{id}/confirm` | 🔒 | `in_negotiation` → `agreed` (só autor) |
| POST | `/{id}/complete` | 🔒 | `agreed` → `completed` (só autor) |
| POST | `/{id}/cancel` | 🔒 | Cancela contrato ativo; publicação volta a `open` se estava em negociação |

`GET /{id}/contact` → 

```json
{
  "engagementId": "…",
  "proposer": { "userId": "…", "name": "…", "email": "…", "phone": "…" },
  "receiver": { "userId": "…", "name": "…", "email": "…", "phone": "…" }
}
```

Acesso restrito aos participantes e somente com `contactRevealedAt` preenchido (após o aceite).
Contrato cancelado → 403 `engagement.contact_unavailable`.

`EngagementResponse` traz `publicationType`, `proposerId/Name`, `receiverId/Name`,
`providerId/Name` (quem executa: autor em `offer`, proponente em `request`), `agreedPrice`,
`status`, `contactRevealedAt`, `startedAt`, `completedAt`, `contactAvailable`.

## Notificações — `/api/v1/notifications`

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `` | 🔒 | Lista (`unreadOnly`, `page`, `pageSize`) |
| GET | `/unread-count` | 🔒 | `{ "count": 3 }` |
| POST | `/{id}/read` | 🔒 | Marca uma como lida |
| POST | `/read-all` | 🔒 | Marca todas como lidas |

Tipos: `proposalReceived`, `proposalAccepted`, `proposalRejected`, `publicationStatusChanged`,
`engagementCompleted`, `reviewReceived`, `reportResolved`.

## Denúncias e moderação

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/api/v1/reports` | 🔒 | Denuncia perfil e/ou publicação (201) |
| GET | `/api/v1/admin/reports` | 🔒 moderator | Fila (`status`, paginação) |
| POST | `/api/v1/admin/reports/{id}/resolve` | 🔒 moderator | `dismiss` ou `hide` |

`POST /api/v1/reports`

```json
{ "reportedUserId": "…", "publicationId": null, "reason": "spam", "description": "Perfil suspeito" }
```

`reason`: `spam`, `fraud`, `offensive`, `inappropriate`, `other`. Ao menos um alvo é obrigatório;
auto-denúncia → 403 `report.self`. A denúncia nasce `pending` e **não** oculta nada (RN10).

`POST /api/v1/admin/reports/{id}/resolve`

```json
{ "action": "hide", "note": "Conteúdo ofensivo no título" }
```

`hide` exige publicação denunciada e justificativa (≥ 5 caracteres): a publicação vai para `hidden`
com registro no histórico, o autor é notificado e a denúncia fica `resolved`. `dismiss` apenas
encerra a denúncia como `dismissed`.
