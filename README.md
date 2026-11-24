# TASKO — Marketplace de serviços (MVP)

Aplicação web do marketplace de serviços TASKO, com SPA responsiva e API REST servidas pela
mesma aplicação ASP.NET Core 10. O PostgreSQL é o banco padrão. O MVP cobre autenticação,
múltiplos perfis, publicações (oferta/demanda), propostas, contratação com liberação condicional
de contato, avaliações, notificações e moderação por denúncia.

## Stack

| Item | Versão |
| --- | --- |
| .NET SDK | 10.0.401 (`net10.0`) |
| ASP.NET Core | 10.0 (Controllers) |
| EF Core + Npgsql | 10.0.15 / 10.0.4 |
| PostgreSQL | 16 (imagem `postgres:16-alpine`) |
| FluentValidation | 12.2.0 |
| BCrypt.Net-Next | 4.2.0 |
| Swashbuckle (OpenAPI) | 11.0.1 |
| Frontend | HTML5, CSS3 e JavaScript ES2020, sem framework e sem build Node.js |
| xUnit | 2.9.3 (50 casos: 47 domínio/serviços/HTTP, 2 Browser e 1 PostgreSQL opt-in) |

## Estrutura

```
src/
  TASKO.Domain/          Entidades, enums, invariantes (RN01–RN10), interfaces de repositório
  TASKO.Application/     Casos de uso, DTOs, validadores, portas (IClock, ITokenService, ...)
  TASKO.Infrastructure/  DbContext, repositórios, JWT, BCrypt, e-mail, migrations
  TASKO.Api/             Controllers, middleware, seed, Swagger e SPA em wwwroot/
tests/
  TASKO.Tests/           Testes de domínio e de fluxo (EF Core InMemory + fakes)
docs/
  database/schema.sql    DDL idempotente gerado a partir da migration
  api/endpoints.md       Contrato resumido dos endpoints
  analysis/              Registro da análise e integração do protótipo visual
  requirements/          Matriz de requisitos, implementação e evidências
  testing.md             Testes opcionais, implantação e roteiro para a banca
Dockerfile               Build multi-stage (sdk:10.0 → aspnet:10.0)
docker-compose.yml       API + PostgreSQL 16 com healthcheck
```

Fluxo de dependências: `Api → Application → Domain`, `Api → Infrastructure → Application/Domain`.
Regras de negócio ficam nas entidades; os serviços apenas orquestram e gravam auditoria.

A SPA consome somente `/api/v1` na mesma origem. Não existe servidor Node.js, proxy de
desenvolvimento ou dependência de `npm`.

## Demonstração sem PostgreSQL

O perfil `demo` usa EF Core InMemory, semeia dados representativos e abre a aplicação em
http://localhost:5237:

```powershell
dotnet run --project src/TASKO.Api --launch-profile demo
```

Contas disponíveis:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Solicitante | `ana@tasko.demo` | `Demo1234` |
| Prestador | `carlos@tasko.demo` | `Demo1234` |
| Prestadora | `mariana@tasko.demo` | `Demo1234` |
| Moderador | `moderador@tasko.local` | `Moderador123` |

Os dados ficam somente em memória e são recriados quando a aplicação reinicia. O modo demo é
opt-in; os perfis normais continuam usando PostgreSQL.

## Subir com Docker

```powershell
docker compose up --build
```

- Aplicação web/API: http://localhost:8080
- Swagger: http://localhost:8080/swagger (em `Development`)
- Health: http://localhost:8080/health
- PostgreSQL: `localhost:5432`, banco/usuário/senha `tasko`

O Compose roda em `Development` com `Database__AutoMigrate=true`, então a migration é aplicada
e o seed roda no start. Variáveis sobrescrevíveis:

| Variável | Padrão |
| --- | --- |
| `TASKO_JWT_SIGNING_KEY` | `dev-only-signing-key-change-me-before-deploy` |
| `TASKO_MODERATOR_EMAIL` | `moderador@tasko.local` |
| `TASKO_MODERATOR_PASSWORD` | `Moderador123` |

> Esses valores são **apenas para desenvolvimento**. Em produção defina `ASPNETCORE_ENVIRONMENT=Production`,
> um `Jwt__SigningKey` real (≥ 32 caracteres) e desligue `Auth__ExposeSensitiveTokens`.

## Rodar localmente (sem Docker)

Pré-requisito: PostgreSQL acessível em `localhost:5432` com banco `tasko` (ou ajuste a conexão).

```powershell
dotnet tool restore
dotnet build
dotnet ef database update --project src/TASKO.Infrastructure --startup-project src/TASKO.Api
dotnet run --project src/TASKO.Api
```

O perfil `Development` já traz chave JWT de desenvolvimento, `AutoMigrate` e o moderador semeado.
A conexão pode ser trocada por `ConnectionStrings__Default` ou `appsettings.Development.json`.

## Comandos úteis

```powershell
dotnet build                                              # compila a solução (TASKO.slnx)
dotnet test tests/TASKO.Tests/TASKO.Tests.csproj          # 47 aprovados; 3 opt-in ignorados sem configuração
dotnet ef migrations add <Nome> --project src/TASKO.Infrastructure --startup-project src/TASKO.Api --output-dir Persistence/Migrations
dotnet ef database update --project src/TASKO.Infrastructure --startup-project src/TASKO.Api
dotnet ef migrations script --idempotent --project src/TASKO.Infrastructure --startup-project src/TASKO.Api --output docs/database/schema.sql
```

`dotnet ef` usa a `TaskoDbContextFactory` (design-time), que lê `TASKO_DB_CONNECTION` ou cai no
default `Host=localhost;Port=5432;Database=tasko;Username=tasko;Password=tasko`.

Testes HTTP executam em processo via `WebApplicationFactory`. Os testes Browser usam Playwright
.NET e uma Demo descartável; o teste PostgreSQL cria seu próprio banco temporário com migrations.
Instruções completas em [`docs/testing.md`](docs/testing.md). O workflow
`.github/workflows/validate.yml` automatiza build, testes e Chromium com serviço PostgreSQL 16;
está configurado para push e Pull Request. Consulte a aba Actions para o resultado de cada execução.

## Autenticação

- `POST /api/v1/auth/register` → cria conta com papéis `requester`/`provider` (moderador nunca é autoatribuído).
- `POST /api/v1/auth/login` → access token JWT (15 min) + refresh token opaco (7 dias, hash SHA-256 no banco).
- `POST /api/v1/auth/refresh` → rotaciona o refresh token (o anterior é revogado).
- `POST /api/v1/auth/logout` → revoga o refresh token informado.
- `POST /api/v1/auth/forgot-password` / `reset-password` → token de uso único, 60 min.

Envie `Authorization: Bearer <accessToken>`. Enums trafegam como string em camelCase
(`request`, `inNegotiation`, `provider`, ...).

## Interface web

A interface em `src/TASKO.Api/wwwroot` é uma SPA com roteamento por hash. Ela inclui:

- cadastro, login, refresh automático, logout e recuperação de senha;
- início, busca, filtros, detalhes e publicação de ofertas/demandas;
- envio, aceite, recusa e retirada de propostas;
- contato protegido, confirmação, conclusão e cancelamento de contratações;
- avaliações pós-conclusão, notificações e histórico de atividades;
- perfil próprio/público, edição de dados e habilidades;
- denúncia e painel de moderação com decisão justificada;
- layout responsivo Emerald Trust, navegação móvel e estados de carregamento/erro.

Access e refresh tokens ficam no `localStorage` neste cliente web. Em uma implantação com maior
exigência de segurança, prefira refresh token em cookie `HttpOnly`/`Secure`.

Cadastro/login/recuperação/reset compartilham limite de 10 tentativas por minuto por IP/instância
(`Security:AuthAttemptsPerMinute`). Ao exceder, a API retorna 429 ProblemDetails e `Retry-After`.
Não é um limiter distribuído; proxies precisam de configuração segura antes de confiar no IP
encaminhado. Configurações sensíveis de demo são rejeitadas fora de `Development`/`Demo`.

Atividades e moderação têm paginação navegável; explorar também filtra por região. Falhas de
carregamento nas atividades não são mais apresentadas como listas vazias. Formulários bloqueiam
envios simultâneos e modais retêm o foco do teclado e o devolvem ao fechar.

## Endpoints

Resumo por área (detalhes em [`docs/api/endpoints.md`](docs/api/endpoints.md)):

| Área | Rotas |
| --- | --- |
| Auth | `POST /api/v1/auth/{register,login,refresh,logout,forgot-password,reset-password}` |
| Usuários | `GET/PUT /api/v1/users/me`, `PUT /api/v1/users/me/skills`, `GET /api/v1/users/{id}/profile`, `GET /api/v1/users/{id}/reviews` |
| Categorias | `GET /api/v1/categories` |
| Publicações | `GET/POST /api/v1/publications`, `GET /api/v1/publications/mine`, `GET/PUT /api/v1/publications/{id}`, `POST .../{id}/cancel`, `GET .../{id}/history` |
| Propostas | `POST/GET /api/v1/publications/{id}/proposals`, `GET /api/v1/proposals/mine`, `POST .../{id}/accept`, `POST .../{id}/reject`, `DELETE /api/v1/proposals/{id}` |
| Contratações | `GET /api/v1/engagements`, `GET /api/v1/engagements/{id}`, `GET .../{id}/contact`, `POST .../{id}/{confirm,complete,cancel}` |
| Avaliações | `POST/GET /api/v1/publications/{id}/reviews` |
| Notificações | `GET /api/v1/notifications`, `GET .../unread-count`, `POST .../{id}/read`, `POST .../read-all` |
| Denúncias | `POST /api/v1/reports` |
| Moderação | `GET /api/v1/admin/reports`, `POST /api/v1/admin/reports/{id}/resolve` (política `Moderator`) |

## Regras de negócio implementadas

| Regra | Onde |
| --- | --- |
| RN01 conta com múltiplos papéis; moderador não autoatribuível | `User.AddRole` / `AuthService.RegisterAsync` |
| RN02 campos obrigatórios por tipo de publicação | `Publication.Normalize` + `CreatePublicationRequestValidator` |
| RN03 sem auto-proposta; papel `provider` exigido só em `request` | `ProposalService.CreateAsync` |
| RN04/RN05 aceite atômico → `in_negotiation`, demais recusadas, histórico, engagement | `ProposalService.AcceptAsync` (transação + `SELECT ... FOR UPDATE`) |
| RN05 `agreed`/`completed` só por ação explícita | `EngagementService.ConfirmAsync/CompleteAsync` |
| RN06 contato apenas para os dois participantes após aceite | `GET /api/v1/engagements/{id}/contact` |
| RN07 avaliação só após conclusão | `Review.Create` |
| RN08 sem autoavaliação; alvo = contraparte do contrato | `Review.Create` |
| RN09 edição/encerramento bloqueados com contratação ativa | `Publication.EnsureEditable` / `Cancel` |
| RN10 denúncia não oculta conteúdo automaticamente | `Report.Create` (status `pending`) |
| RF17 moderação humana; ocultação com justificativa | `ReportService.ResolveAsync` |
| RN11 advertência sobre dados sensíveis (síntese da análise) | Cadastro, publicação e proposta na SPA |
| RN12 intermediação sem pagamento (síntese da análise) | Ausência de gateway/escrow no MVP |
| Paginação com total (apoio a RNF03/RNF12) | `PagedResponse<T>` nas listagens paginadas |
| RNF05 telefone/e-mail nunca em listagens públicas | `PublicProfileResponse` / `ProposalResponse` |
| RNF10 erros RFC 7807 sem stack trace | `ExceptionHandlingMiddleware` |
| RNF11 auditoria de ações críticas | `AuditService` → `activity_logs` |

Os códigos acima seguem a síntese disponível, não uma transcrição certificada do documento
original. Cobertura, testes e pendências em
[`docs/requirements/traceability.md`](docs/requirements/traceability.md), inclusive RF03 parcial
(atuação pós-cadastro) e limites da validação de acessibilidade/desempenho.

## Banco de dados

15 tabelas (14 do DER + `refresh_tokens`), identificadores em snake_case:
`users`, `user_roles`, `user_profiles`, `user_skills`, `password_reset_tokens`, `refresh_tokens`,
`categories`, `publications`, `publication_status_history`, `proposals`, `engagements`, `reviews`,
`reports`, `notifications`, `activity_logs`.

Decisões de schema:
- `timestamptz` (UTC) em vez de `timestamp` — **divergência consciente do DER**, aprovada como default.
- Valores monetários em `numeric(12,2)`; `activity_logs.metadata` em `jsonb`.
- Índice único parcial `engagements(publication_id) WHERE status = 'Active'` garante um contrato ativo por publicação.
- Índices únicos parciais em `users(email) WHERE deleted_at IS NULL` e `reviews(publication_id, reviewer_id)`.
- `CHECK` para nota (1–5) e para exigir alvo em denúncias.
- DDL completo em [`docs/database/schema.sql`](docs/database/schema.sql) (idempotente).

## Fora do MVP

Gateway de pagamento/PIX, escrow, cálculo tributário, rastreamento GPS, validação biométrica,
chat interno e envio de e-mail real (o MVP usa `LogEmailSender`). Notificações são apenas in-app.

## Limitações conhecidas

- **Sem validação de runtime com PostgreSQL neste ambiente**: o daemon do Docker não estava
  disponível, então `docker compose up` não foi executado. A migration foi gerada e o DDL
  inspecionado, mas o fluxo real contra Postgres deve ser validado no primeiro `up`.
- Testes comuns usam EF Core InMemory; a suíte opt-in PostgreSQL verifica `FOR UPDATE`, `jsonb`,
  índices parciais e rollback, mas sua execução local permanece pendente.
- `IEmailSender` apenas registra em log; nenhum e-mail é entregue.
- Refresh/reset usam hash SHA-256 (tokens são aleatórios de 48 bytes), não BCrypt.
- Swagger UI exposto em `Development` e no perfil local `Demo`.
