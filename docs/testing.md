# Validação e roteiro de apresentação

## Execução básica

```powershell
dotnet build
dotnet test tests/TASKO.Tests/TASKO.Tests.csproj
docker compose config --quiet
```

Os testes de API usam `WebApplicationFactory` em processo separado logicamente da demonstração,
sem Postgres. Validam HTTP 429, ProblemDetails, contato anônimo bloqueado e cabeçalhos.

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

O limite de autenticação é compartilhado por IP e por instância (padrão 10/minuto para cadastro,
login e reset). Ao repetir E2E rapidamente, aguarde uma janela ou reinicie a Demo; não desative
a proteção em produção. Proxies não têm seus cabeçalhos confiados automaticamente.

## Roteiro para a banca

1. Iniciar Demo e explicar que seus dados são descartáveis.
2. Entrar como Ana; publicar demanda com prazo e orçamento, sem dados sensíveis.
3. Entrar como Carlos em janela anônima; filtrar a região e enviar proposta.
4. Ana consulta o perfil público (sem telefone/e-mail) e aceita.
5. Ambos consultam contato; demonstrar que uma terceira conta não tem acesso.
6. Ana confirma o combinado e conclui; ambos avaliam; segunda avaliação é bloqueada.
7. Denunciar outra oferta aberta e mostrar que continua visível.
8. Moderador analisa a denúncia, informa justificativa e oculta.
9. Mostrar histórico, notificações e resultados dos testes.
10. Declarar limitações: e-mail em log, sem pagamentos/chat, PostgreSQL local ainda não validado.

## Checklist antes de implantação

- `ASPNETCORE_ENVIRONMENT=Production`; chave JWT própria e longa; nenhum seed demo.
- `Auth__ExposeSensitiveTokens=false`; aplicação rejeita essa exposição fora de Dev/Demo.
- HTTPS no proxy; banco não exposto à Internet; backups e teste de restauração.
- Segredos em variáveis/gerenciador seguro, nunca commits ou logs compartilhados.
- Refresh atualmente continua no `localStorage`. Migrar para cookie HttpOnly requer também
  política de CSRF, logout, rotação e compatibilidade com clientes da API; não é uma mera troca
  do armazenamento e não foi feito nesta revisão.
- Política de privacidade e retenção aprovada pelo grupo antes de cadastrar pessoas reais.
