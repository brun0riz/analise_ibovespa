# IBOV em perspectiva

Dashboard local, em português, para explorar o histórico diário do Ibovespa por mandato presidencial desde 1995. Código em Node.js, HTML, CSS e JavaScript, sem dependências externas, chave de API ou etapa de build.

## Executar

Requer **Node.js 22 ou mais recente** (Node 24 está disponível neste computador).

No PowerShell, dentro da pasta `analise_ibo`, execute:

```powershell
node server.mjs
```

Abra **http://localhost:3000** no navegador. Mantenha o terminal aberto e use Ctrl+C para parar. Você também pode abrir `iniciar.cmd` no Windows.

Se a porta estiver ocupada:

```powershell
$env:PORT = '3001'
node server.mjs
```

Não é preciso rodar `npm install`. A primeira consulta exige internet e pode levar até cerca de 40 segundos caso o primeiro host da fonte esteja indisponível.

## O que o painel oferece

- Série diária com faixas por mandato e cores próprias, com escala linear ou logarítmica.
- Card ao passar o mouse e ao tocar, com presidente, partido, eleição/sucessão, cotação e retorno no mandato até aquele dia. Abertura, máxima, mínima e volume aparecem quando a API os fornece.
- Card lateral com contexto político, datas, base de cálculo e métricas do período inteiro.
- Exploração por teclado: setas para navegar entre pregões; Shift + seta avança 20 pregões; Home e End vão às pontas.
- Filtros por mandato e datas, visão em pontos ou retorno do recorte.
- Comparação em base 100 e meses desde a posse. Clique na legenda para mostrar ou ocultar mandatos. As curvas encerram na última observação de cada período, sem extrapolação.
- Ranking por retorno acumulado, retorno anualizado ou maior queda.
- Tabela ordenável e CSV com datas, bases, indicadores, fonte e horário de consulta. CSV em UTF-8 com BOM e separador `;` para facilitar a abertura no Excel em português.
- Layout responsivo para celular e computador.
- Atualização e cache local, com aviso visível em caso de atraso ou falha da fonte.

## Fonte financeira gratuita

**Yahoo Finance**, símbolo **^BVSP**, endpoint público de gráficos:

```text
https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?period1=<início Unix>&period2=<fim Unix>&interval=1d
```

O servidor usa intervalo de datas explícito. Não utiliza `range=max`, pois esse parâmetro pode devolver dados agregados mesmo com intervalo diário. Se o primeiro host falhar, tenta `query2.finance.yahoo.com`.

O acesso observado é gratuito e sem cadastro ou token. Este endpoint é **não oficial**, não possui garantia de disponibilidade e pode impor bloqueios/limites ou mudar. Para publicação ou uso comercial, confira as condições do provedor e de licenciamento dos dados.

O navegador consulta apenas o servidor local; não depende de CORS da fonte nem carrega bibliotecas de CDNs. Cotações não são inventadas: uma falha sem cache aparece como erro, com opção de tentar novamente. Abertura/máxima/mínima/volume ausentes ficam ausentes.

Referência: [histórico ^BVSP no Yahoo Finance](https://finance.yahoo.com/quote/%5EBVSP/history/).

**Volume:** é o número reportado pelo Yahoo para o índice, sem conversão para reais ou interpretação como volume financeiro negociado.

### Cache

O download é compartilhado entre requisições simultâneas e salvo em `.cache/ibovespa.json`. A validade para nova consulta é de uma hora. “Atualizar dados” tenta renovar, respeitando um intervalo mínimo de um minuto entre tentativas para evitar excesso de chamadas. Em uma falha, a última cópia válida continua disponível com aviso e data da consulta original. O painel sinaliza quando o último pregão está há mais de cinco dias corridos.

Barras com a data corrente de São Paulo são excluídas, inclusive depois do fechamento, para impedir que um valor intradiário seja tratado como fechamento definitivo. Assim, a data mais recente normalmente é o pregão anterior.

## Cadastro político e referências

Cotações e informações políticas vêm de fontes distintas. A API financeira **não fornece presidente ou partido**. O cadastro revisável está em `data/mandates.json`, servido por `/api/mandates`. Os partidos são os do exercício do cargo; as mudanças de legenda são indicadas. Os cards identificam presidentes efetivos, incluindo a sucessão de Temer, em vez de tratar todos como candidatos eleitos.

- [Governo Federal: presidentes, datas, partidos e eleições](https://www.gov.br/cti/pt-br/trajetoria-historica/presidentes-da-republica-desde-a-criacao-do-cti).
- [Secretaria-Geral: Dilma Rousseff e afastamento em 12/05/2016](https://www.gov.br/secretariageral/pt-br/centrais-de-conteudo/biblioteca-da-pr/galeria-dos-ex-presidentes/dilma-vana-rousseff/).
- [Secretaria-Geral: Michel Temer, interinidade e sucessão](https://www.gov.br/secretariageral/pt-br/centrais-de-conteudo/biblioteca-da-pr/galeria-dos-ex-presidentes/capa-dados-ex-presidente).
- [TSE: aprovação da mudança de PMDB para MDB em maio de 2018](https://www.tse.jus.br/comunicacao/noticias/2018/Maio/aprovada-mudanca-do-nome-do-partido-do-movimento-democratico-brasileiro-pmdb).
- [Agência Brasil: filiação de Bolsonaro ao PL e saída do PSL](https://agenciabrasil.ebc.com.br/politica/noticia/2021-11/presidente-bolsonaro-assina-filiacao-ao-pl).
- [B3: Ibovespa e metodologia de retorno total](https://b3.com.br/pt_br/market-data-e-indices/indices/indices-amplos/ibovespa-b3.htm).

O cadastro contém FHC I/II, Lula I/II, Dilma I/II, Temer, Bolsonaro e Lula III (2023–2026). Para períodos posteriores, atualize o JSON conforme as posses e o exercício efetivo. Não há previsão de eleições futuras no código.

## Critérios dos cálculos

- **Recorte:** de 01/01/1995 ao último fechamento disponível. Dezembro de 1994 é consultado para fornecer a base anterior ao primeiro mandato. A escolha evita misturar as mudanças de escala do índice anteriores ao real.
- **Limites de mandato:** início inclusivo; fim exclusivo. Em 2016, Dilma II termina em 12/05/2016 (excluído) e Temer começa nessa data, incluindo a interinidade. O fim formal do mandato de Dilma foi 31/08/2016. Esse critério está exposto no painel.
- **Base:** último fechamento anterior à posse. O primeiro pregão pertence ao novo governo. Na sucessão, o fechamento final do antecessor é a base do sucessor.
- **Retorno acumulado (%):** `(final / base − 1) × 100`.
- **Retorno anualizado (% a.a.):** `((final / base)^(365,2425 / dias corridos) − 1) × 100`, contando da data da base à data final. Períodos curtos podem produzir taxas anualizadas elevadas.
- **Maior queda (%):** pior variação entre um pico de fechamento (incluindo a base) e um fechamento posterior dentro do recorte. Valores negativos; quanto mais próximos de zero, menor a queda.
- **Volatilidade anualizada:** desvio-padrão amostral dos retornos logarítmicos entre fechamentos (incluindo a base) multiplicado por `√252 × 100`.
- **Base 100:** `fechamento / base × 100`. O ponto inicial é 100 na posse. O eixo usa dias corridos desde a posse convertidos para meses médios de 30,4375 dias; inclui o primeiro dia como dia 1.
- **Cobertura:** não se publica retorno de um mandato sem base anterior próxima ou com lacunas superiores a dez dias corridos. A distância máxima às bordas é dez dias; é uma verificação heurística que não detecta todo pregão isolado ausente. Períodos sem cobertura suficiente ficam sem indicadores e não entram no ranking.
- **Parcial:** um mandato cujo fim ainda não ocorreu é indicado como parcial. Nunca se extrapola a curva até o fim previsto.
- **Escopo dos filtros:** o gráfico e os cartões de resumo seguem o recorte selecionado; comparação, ranking e tabela sempre usam cada mandato inteiro até o último dado.
- **Unidade:** pontos do Ibovespa, nominal em reais, sem ajuste por inflação, câmbio, impostos ou custos. O índice é de retorno total e já contempla proventos conforme a metodologia da B3.

Este painel descreve o desempenho da bolsa durante governos. Não identifica causalidade, não mede sozinho a economia brasileira e não funciona como avaliação geral de uma gestão.

## Arquivos e endpoints

```text
analise_ibo/
  server.mjs              servidor HTTP local e cache
  lib/market.mjs          consulta e normalização do Yahoo
  data/mandates.json      cadastro político revisável
  public/index.html      interface
  public/style.css       estilos responsivos
  public/app.js          gráficos SVG e interações
  public/model.js        cálculos puros compartilhados
  test/                  testes sem serviços externos
  iniciar.cmd            atalho de execução no Windows
  .cache/                dados baixados (gerado na execução)
```

- `GET /api/history`: cotações normalizadas, fonte, momento da consulta, avisos e estado de cache.
- `GET /api/history?refresh=1`: solicita atualização, respeitando o intervalo mínimo.
- `GET /api/mandates`: cadastro político.

O servidor escuta apenas em `127.0.0.1`. Apenas arquivos públicos conhecidos são servidos.

## Verificar

```powershell
node --test
node --check public/app.js
node --check server.mjs
```

Os testes cobrem fórmulas, sucessão sem duplicar retornos, mandatos parciais, lacunas de cobertura, base 100, rejeição de dados intradiários/agregados, fallback de host, cache e respostas HTTP.
