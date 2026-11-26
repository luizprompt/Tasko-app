# Validação e roteiro de apresentação

## Execução básica

```powershell
dotnet build
dotnet test tests/TASKO.Tests/TASKO.Tests.csproj
docker compose config --quiet
```

Os testes de API usam `WebApplicationFactory` em processo separado logicamente da demonstração,
sem Postgres. Validam HTTP 429, ProblemDetails, contato anônimo bloqueado, cabeçalhos e a recusa de
chave JWT de exemplo fora de `Development`/`Demo`.

## PostgreSQL real

Pré-requisitos: servidor PostgreSQL acessível e usuário de testes com permissão `CREATEDB`.
Use banco/credenciais de testes, **nunca produção**:

```powershell
$env:TASKO_TEST_POSTGRES = 'Host=localhost;Port=5432;Database=postgres;Username=tasko;Password=tasko'
dotnet test tests/TASKO.Tests/TASKO.Tests.csproj --filter Category=Postgres
Remove-Item Env:TASKO_TEST_POSTGRES
```

O teste cria um banco exclusivo `tasko_test_<guid>`, aplica migrations e remove **somente esse
banco** ao finalizar. Não apaga o banco informado na conexão. Verifica persistência entre
DbContexts, dois aceites concorrentes com estado pré-carregado, índice parcial de contratação
ativa, índice único de avaliação, histórico, auditoria/jsonb e rollback com falha injetada por trigger.

O Docker Desktop não respondeu nesta revisão local; portanto essa suíte foi escrita, mas sua
execução real permanece pendente. O workflow `.github/workflows/validate.yml` fornece PostgreSQL 16
e executa a suíte quando enviado ao GitHub.

## Testes de navegador (.NET Playwright)

Não há projeto npm. O driver de testes é instalado pelo pacote .NET:

```powershell
dotnet build
powershell -ExecutionPolicy Bypass -File tests/TASKO.Tests/bin/Debug/net10.0/playwright.ps1 install chromium
dotnet run --project src/TASKO.Api --launch-profile demo
```

Em outro terminal:

```powershell
$env:TASKO_E2E_URL = 'http://localhost:5237'
dotnet test tests/TASKO.Tests/TASKO.Tests.csproj --filter Category=Browser
Remove-Item Env:TASKO_E2E_URL
```

Execute somente em Demo descartável: cria contas, anúncios, proposta, contratação, avaliação e
denúncia e oculta uma oferta pelo moderador. Os demais cenários validam paginação por respostas
controladas, filtro de região e HTTP 503 visível. Não confundir essas respostas simuladas com
teste de paginação do banco (coberto em `PublicationServiceTests`).

No mobile (390×844), o teste percorre home, explorar, publicar, atividades, perfil e moderação,
confere ausência de rolagem horizontal e lê todas as notificações pela interface. As capturas de
login, cadastro e mobile ficam em `tests/TASKO.Tests/bin/Debug/net10.0/`.

O limite de autenticação é compartilhado por IP e por instância (padrão 10/minuto para cadastro,
login e reset). Ao repetir E2E rapidamente, aguarde uma janela ou reinicie a Demo; não desative
a proteção em produção. Proxies não têm seus cabeçalhos confiados automaticamente.

## Roteiro para a banca

Roteiro rápido com os dados semeados (não depende de criar conteúdo ao vivo):

1. Iniciar a Demo e avisar que os dados são descartáveis; deixar Ana e Carlos já logados.
2. Ana abre **Explorar** e um anúncio: mostrar que o card e o detalhe não expõem contato.
3. Ana abre **Meus anúncios → “Preciso de eletricista para trocar disjuntor”**, com duas propostas.
4. Aceitar a proposta do Carlos; mostrar recusa automática da outra, status, histórico e notificação.
5. Ana clica em **Ver contato**; Carlos mostra o mesmo contrato do outro lado.
6. Abrir o perfil do Carlos: nota 5,0 e avaliação do serviço concluído.
7. Moderador abre a denúncia do anúncio do Rafael e oculta com justificativa.
8. Declarar limitações: e-mail em log, sem pagamentos/chat, PostgreSQL local ainda não validado.
9. Se quiser demonstrar cadastro/publicação, use uma conta nova e apague a Demo depois.

Se o aceite já tiver sido feito no ensaio, reinicie a API antes de apresentar; o estado volta ao seed.

## Checklist antes de implantação

- `ASPNETCORE_ENVIRONMENT=Production`; chave JWT própria e longa; nenhum seed demo.
- `Auth__ExposeSensitiveTokens=false`; aplicação rejeita essa exposição fora de Dev/Demo.
- A chave JWT de exemplo (`dev-only…`/`demo-only…`) é rejeitada fora de Dev/Demo; não reutilize
  os valores de `appsettings.Development.json` ou `appsettings.Demo.json` em produção.
- HTTPS no proxy; banco não exposto à Internet; backups e teste de restauração.
- Segredos em variáveis/gerenciador seguro, nunca commits ou logs compartilhados.
- Refresh atualmente continua no `localStorage`. Migrar para cookie HttpOnly requer também
  política de CSRF, logout, rotação e compatibilidade com clientes da API; não é uma mera troca
  do armazenamento e não foi feito nesta revisão.
- Política de privacidade e retenção aprovada pelo grupo antes de cadastrar pessoas reais.
