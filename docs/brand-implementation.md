# Aplicação da identidade visual — Emerald Trust V1.0

Fonte: `docs/Tasko_kit_identidade_final/LEIA-ME.txt`, `guia/guia-de-marca.html` e
`web/identidade.css`. Os arquivos fornecidos pelo grupo são a referência visual oficial.

## Aplicações

| Local | Arquivo original | Cópia servida |
| --- | --- | --- |
| Cabeçalho claro | `logos/tasko-horizontal-principal.svg` | `/assets/brand/logos/tasko-horizontal-principal.svg` |
| Autenticação escura | `logos/tasko-horizontal-negativa.svg` | `/assets/brand/logos/tasko-horizontal-negativa.svg` |
| Aba do navegador | `web/favicon.svg` e `web/favicon.ico` | `/favicon.svg`, `/favicon.ico` |
| Ícones PNG | `web/favicon-{16,32,48}.png` | `/icons/` |
| Apple Touch | `web/apple-touch-icon.png` | `/apple-touch-icon.png` |
| Ícones comuns/maskable | `web/icon-{192,512}*.png` | `/icons/` |
| Tokens oficiais | `web/identidade.css` | `/assets/brand/identidade.css` |

SVGs e PNGs foram copiados sem alterar sua geometria, cores ou transparência. O wordmark
permanece em curvas, sem dependência de fontes externas. O logo anterior, composto por letra T
e texto estilizado, foi substituído pelos SVGs oficiais.

No cabeçalho, a assinatura tem 160 px de largura e altura proporcional (51,2 px); na
autenticação, 220 px. O espaço interno original do SVG e o padding externo completam a área de
proteção recomendada (1/4 da largura do símbolo). Não há sombra, filtro, degradê ou recoloração
aplicados ao logo. Efeitos já existentes em cards e superfícies não alteram os arquivos da marca.

`styles.css` referencia os tokens oficiais para cores principais, neutros e tipografia
`Inter, Arial, sans-serif`. Inter não é baixada de CDN: quando indisponível, usa-se Arial.
Tonalidades auxiliares continuam disponíveis para feedback, contraste e estados da interface.
As estrelas de avaliação usam Champagne Gold.

O banner mobile continua de ponta a ponta, encostado no cabeçalho; as demais seções mantêm suas
margens. O símbolo não é usado para substituir avatares de usuários ou ícones de navegação.

A autenticação usa uma coluna centralizada: marca, frase curta e card com abas de entrar/cadastro.
Não há título promocional, apresentação longa, lista de benefícios ou estatísticas antes do
formulário. Contas demo ficam recolhidas e só aparecem no ambiente de demonstração.

O fundo usa Deep Pine com um brilho esmeralda sutil, textura diagonal discreta e um card claro de
cantos amplos. As abas, os campos e o botão principal seguem a paleta oficial; o botão de entrar
leva uma seta e a tela não depende de imagens adicionais. O foco visível dos campos usa Pure
Emerald. Nada disso altera os arquivos da marca.

## Manifest

`/manifest.webmanifest` adapta os caminhos do exemplo fornecido e usa os quatro ícones oficiais
(192/512 px, comuns e maskable). `start_url` aponta para `/#/home`, respeitando a autenticação
da SPA. Isso não adiciona service worker, cache offline nem promete funcionamento sem conexão.

## Validação

- `BrandAssetsTests`: integridade SHA-256 de logos/favicon, manifest e dimensões dos ícones.
- `BrowserFlowTests`: logos corretos na autenticação/cabeçalho, proporção preservada no mobile,
  banner sem faixa junto ao header e ausência de overflow horizontal.
- Testes Browser geram capturas em `bin/.../brand-login-desktop.png` e `mobile-home.png`
  para revisão; arquivos de build não devem ser versionados.
