# Matriz de rastreabilidade — TASKO

Revisão: 2026-11-24. Esta matriz relaciona a implementação atual à **síntese** de requisitos
registrada em `docs/analysis/app-do-grupo.md`. O `Tasko_Final.docx` não está disponível nesta
árvore: os nomes abaixo não substituem a redação original nem certificam conformidade integral.

Legenda: **I** implementado; **P** parcial; **V** validação adicional necessária.

## Requisitos funcionais

Testes ficam em `tests/TASKO.Tests`. “Browser” refere-se a `Integration/BrowserFlowTests.cs`;
esses testes exigem uma instância Demo descartável e Chromium instalado.

| RF | Síntese | Estado | Implementação | Evidência automatizada / limite |
| --- | --- | --- | --- | --- |
| 01 | Cadastro | I | `AuthService.RegisterAsync`, `forms.js` | `AuthServiceTests`, Browser (cadastro de dois usuários) |
| 02 | Autenticação | I | JWT/refresh/logout, `AuthController` | `AuthServiceTests`, `ApiSecurityTests` |
| 03 | Atuação | P | Papéis múltiplos no cadastro | Cadastro testado; alteração posterior depende de conferir o documento |
| 04 | Gerenciamento de perfil | I/V | `ProfileService`, `views-account.js` | `ProfileServiceTests` cobre substituição de habilidades; ampliar testes de todos os campos |
| 05 | Oferta de serviço | I | `PublicationService`, formulário `offer` | Domínio + Browser (oferta para moderação) |
| 06 | Publicação de solicitação | I | Formulário `request`, orçamento e prazo | Domínio + Browser (demanda) |
| 07 | Busca de oportunidades | I | `PublicationRepository.SearchAsync` | `PublicationServiceTests` |
| 08 | Filtros | I | Tipo, categoria, cidade, termo e região na SPA/API | Serviço + Browser (região na query) |
| 09 | Detalhes | I | Detalhe, autor, propostas e histórico | Browser |
| 10 | Envio de proposta | I | `ProposalService.CreateAsync` | `ProposalFlowTests`, Browser |
| 11 | Consulta de propostas | I | Propostas com valor e link ao perfil público | Serviço + Browser |
| 12 | Aceite/recusa | I/V | Autor; aceite em transação com lock | `ProposalFlowTests`; concorrência real em `PostgresTests` |
| 13 | Contato | I | Endpoint dedicado aos participantes | `ProposalFlowTests`, `ApiSecurityTests`, Browser |
| 14 | Status | I | Entidades + histórico | `DomainTests`, `PublicationServiceTests`, Browser |
| 15 | Avaliação | I/V | Após conclusão; duas partes; unicidade | `ReviewFlowTests`, Browser; índice real em `PostgresTests` |
| 16 | Denúncia | I | `ReportService.CreateAsync` | Domínio + Browser (não oculta automaticamente) |
| 17 | Moderação | I | Fila paginada; arquivar/ocultar com nota | Domínio + Browser (ocultação justificada de oferta aberta) |
| 18 | Notificações | I/V | In-app, leitura individual/todas e paginação | Serviço + Browser (lista e “marcar todas como lidas”); ampliar E2E de paginação |
| 19 | Edição/encerramento | I | Autor, sem contrato ativo, estado aberto | `PublicationServiceTests` |
| 20 | Atividades | I | Anúncios/propostas/contratos/notificações paginados | Browser (duas páginas, notificações e falha de carregamento simuladas) |
| 21 | Recuperação de senha | P | Token opaco de uso único; e-mail apenas em log | `AuthServiceTests`; envio real fora do MVP |
| 22 | Emerald Trust | I/V | Kit oficial, `identidade.css`, logos SVG, favicon e manifest | `BrandAssetsTests` + Browser (proporção da marca e varredura mobile de home, explorar, publicar, atividades, perfil e moderação); revisão humana de todas as telas pendente |

## Regras de negócio: evitar a divergência de numeração

O README anterior atribuía RN11/RN12 à moderação. A análise do documento atribui esses códigos
a advertências sobre dados sensíveis e intermediação sem pagamento. Até conferir o original:

| RN (síntese da análise) | Implementação / evidência | Estado |
| --- | --- | --- |
| 01 múltiplos papéis | `User.AddRole`, cadastro; `AuthServiceTests` | I |
| 02 campos por tipo | `Publication.Normalize`, validadores; `DomainTests` | I |
| 03 propostas em publicação aberta | `ProposalService.CreateAsync`; testes de fluxo | I |
| 04 decisão pelo autor | `ProposalService.AcceptAsync/RejectAsync`; teste de autorização | I |
| 05 transições explícitas | Aceite → negociação → combinado → concluído; domínio e Browser | I |
| 06 privacidade de contato | DTO público sem contato, endpoint autorizado; testes de fluxo/API | I |
| 07 avaliação após conclusão | `Review.Create`; `ReviewFlowTests` | I |
| 08 sem autoavaliação | Contraparte do contrato; `ReviewFlowTests` | I |
| 09 editar sem contrato ativo | `Publication.EnsureEditable`; testes de serviço | I |
| 10 denúncia sem ocultação automática | `Report.Create`; domínio e Browser | I |
| 11 aviso sobre dados sensíveis | Avisos em cadastro, publicação e proposta; revisão visual | I/V |
| 12 intermediação sem pagamento | Sem gateway, escrow ou tributos | I |

Oferta/demanda, aceite pelo autor, conclusão unilateral e demais defaults já aprovados não
foram reabertos. A moderação permanece implementada sob RF17.

## Requisitos não funcionais (síntese)

| RNF | Evidência atual | O que falta comprovar |
| --- | --- | --- |
| 01 usabilidade | Toasts, carregamento, erros visíveis, bloqueio de envio duplicado | Teste com usuários |
| 02 responsividade | Breakpoints e varredura Browser de home, explorar, publicar, atividades, perfil e moderação em 360/390/448 px | Telas restantes (detalhe, formulários preenchidos) e navegadores reais |
| 03 desempenho | Paginação e consultas por aba ativa | Medição de carga/latência com PostgreSQL |
| 04 segurança | JWT, rate limit por IP, bloqueio de configuração demo e de chave JWT de exemplo em produção | Revisão independente; refresh em cookie HttpOnly ainda não implementado |
| 05 privacidade | DTO dedicado, avisos e `Cache-Control: no-store` na API | Política de privacidade e retenção revisada com o grupo |
| 06 integridade | Entidades, transações, índices e suíte PostgreSQL | Executar suíte real onde o Docker estiver disponível |
| 07 acessibilidade | Foco dos modais, Escape, teclado; auditoria anterior da moderação | Auditoria completa e leitores de tela |
| 08 compatibilidade | E2E Chromium | Firefox/WebKit e navegadores móveis reais |
| 09 manutenibilidade | Camadas, testes e GitHub Actions | Revisão pelo grupo |
| 10 confiabilidade | ProblemDetails; HTTP 429; erros não viram listas vazias | Ampliar cenários de indisponibilidade e testes de todas as rotas |
| 11 rastreabilidade | `activity_logs`, histórico; suítes de fluxo/PostgreSQL | Política de consulta/retenção |
| 12 escalabilidade | PostgreSQL e paginação | Limiter distribuído e testes de carga, fora da certificação atual |

## Situação de execução

- A existência do workflow não significa que ele já rodou no GitHub.
- `schema.sql` foi regenerado e confere com a migration `InitialCreate` (sem mudanças pendentes).
- Testes PostgreSQL são **ignorados**, e não aprovados, quando falta `TASKO_TEST_POSTGRES`.
- Testes Browser são ignorados quando falta `TASKO_E2E_URL`.
- Não somar testes ignorados ao número de aprovados.
- Não enviar dados reais para a instância Demo nem usar suas credenciais em produção.
