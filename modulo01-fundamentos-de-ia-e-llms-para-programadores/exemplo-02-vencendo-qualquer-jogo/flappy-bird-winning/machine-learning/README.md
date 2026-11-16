# Ensinando uma IA a jogar Clumsy Bird

Este projeto faz uma IA jogar o [Clumsy Bird](https://github.com/ellisonleao/clumsy-bird) sozinha, olhando a tela do jogo. Ele segue o mesmo mecanismo do exemplo do Duck Hunt (`../../DuckHunt-JS-parte02`): a IA vê, decide e age, como um jogador humano.

```
print da tela ──→ cores ──→ onde está o vão do próximo cano ─┐
              └──→ YOLO ──→ onde está o pássaro ─────────────┴─→ decidir ─→ apertar "espaço"
```

**Nenhum modelo foi treinado.** O YOLO já vem pronto e só é usado para *enxergar* o pássaro. "Ensinar a IA a vencer" aqui significou duas coisas: dar a ela uma boa **percepção** do jogo e uma boa **regra de decisão**, e calibrar as duas com dados.

## Como rodar

```bash
npm start
```

- `http://localhost:3000/` mostra a IA jogando. A miniatura no canto mostra o que ela "vê", e o console (F12) mostra cada decisão.
- `http://localhost:3000/?ia=off` é para você jogar manualmente.

## Os arquivos da IA

| Arquivo | Papel |
|---|---|
| `main.js` | O "maestro": tira os prints, junta as peças e aperta o espaço |
| `worker.js` | Roda o YOLO numa thread separada, para não travar o jogo |
| `passaro.js` | Escolhe, entre as detecções do YOLO, qual é o pássaro |
| `canos.js` | Acha os canos e o vão pela **cor** dos pixels |
| `decisao.js` | O "cérebro": a regra de quando pular. **É aqui que se ensina a IA** |
| `layout.js` | A miniatura do que a IA vê |

## 1. Percepção: ensinando a IA a enxergar o jogo

### O pássaro: YOLO (modelo pronto)
- O YOLO conhece 80 objetos do mundo real, mas não um "pássaro de videogame". Ele chama o pássaro de `traffic light`, `kite`, `person`... e o nome muda de um frame para outro.
- **O que funcionou:** reconhecer o pássaro pela **posição**, não pelo nome. Ele está sempre na mesma coluna (x ≈ 30 a 100), então o que o YOLO detecta fora dela é descartado.
- **Calibração:** comparamos centenas de leituras do YOLO com a posição real do pássaro no jogo. O erro médio ficou em ~2 px, que o código desconta.
- **Leituras falsas:** às vezes o YOLO "vê" o pássaro no chão ou num cano. Se a leitura indica que o pássaro "teleportou" para longe de onde a física diz que ele deveria estar, ela é descartada.
- **Quando o YOLO perde o pássaro** (em alguns frames ele não detecta nada), a IA estima a posição pela física, a partir da última leitura boa.

### Os canos e o vão: detecção por cor (sem IA)

O YOLO não reconhece os canos. Por isso esta parte **não foi aprendida pela IA**: usamos **visão computacional clássica**, com regras sobre cores e posições escritas à mão. Está tudo em `canos.js`, em 5 passos.

**1. Transformar o print em números**

Toda imagem é uma grade de pixels, e cada pixel tem 4 números de 0 a 255: vermelho (r), verde (g), azul (b) e transparência.
```
[ r, g, b, a,   r, g, b, a,   r, g, b, a, ... ]
   pixel 1        pixel 2        pixel 3
```
Antes de ler, o print é redesenhado num canvas invisível de **900×600**, o tamanho que o jogo "pensa". Assim, cada pixel já fica na coordenada do jogo, seja qual for o tamanho da janela. A função `corDoPixel(x, y)` pega os números de um ponto.

**2. A regra do "verde de cano"**

Cores medidas nas imagens do jogo:

| Coisa | r | g | b |
|---|---|---|---|
| Cano claro | 224 | **245** | 144 |
| Cano escuro | 90 | **138** | 32 |
| Céu | 0 | 150 | **200** |
| Nuvem | 255 | 255 | 255 |

No cano, **o verde é bem maior que o azul**:
```js
g > b + 50 && g > r      // ehVerdeDeCano
```
O **contorno preto** do cano também conta como cano. "Preto" é quando os três números são baixos (`r + g + b < 150`, em `ehContornoEscuro`).

**3. Achar os canos: varrer uma linha**

A IA olha **uma linha horizontal perto do topo** (y = 10), onde só existem céu e o cano de cima, que sempre encosta no topo. Mais embaixo há arbustos verdes, que confundiriam a busca. Ela anda pixel por pixel, da esquerda para a direita, como um **interruptor**:
```
x:     0 ... 299 | 300 ... 447 | 448 ... 899
cor:   azul      | 🟩 cano 🟩   | azul
                 ↑             ↑
             ENTROU         SAIU
          (início=300)    (fim=447)
```
O resultado é uma lista como `[{ inicio: 300, fim: 447 }, ...]`.
- O **placar** é desenhado em preto no topo do meio da tela. Sobre o céu, ele parecia um "cano" estreito. Por isso, "canos" com menos de 100 px no meio da tela são descartados (um cano de verdade tem 148).
- Só importa o **próximo** cano: o primeiro cujo fim ainda não passou pelo pássaro.

**4. Achar o vão: descer uma coluna**

Com o próximo cano, a IA **desce por dentro dele**, a partir do topo, até a cor deixar de ser cano:
```
y = 10    🟩  cano de cima
 ...      🟩
          ⬛  contorno da ponta do cano
          🟩  ponta do cano
          ⬛  contorno
y = 181   ⬜  ← primeiro pixel que não é cano = TOPO DO VÃO
```
O resto vem do código do jogo: **o vão tem sempre 176 px**, então o fim do vão é o topo + 176.
- **Contorno preto:** no começo a busca parava nele e achava o vão 24 px acima do real.
- **Três colunas** (1/4, metade e 3/4 do cano), ficando com o **maior** topo. Se algo atrapalhar uma coluna (o placar, o pássaro passando na frente), as outras salvam.
- **Colunas que passam pelo pássaro são ignoradas**, para o contorno dele não ser confundido com o do cano.
- **Se não der para medir** (o cano está bem em cima do pássaro), a IA mantém o último vão medido. O vão de um cano nunca muda de altura.

**5. Como sabemos que funciona**

O teste automático comparou o vão medido pela IA com a posição real lida do jogo: **152 de 155 medições bateram exatamente**. Os 3 erros foram com o cano ainda entrando pela borda da tela, cortado.

> **Resumo:** um **modelo treinado** (o YOLO) acha o pássaro, e **regras escritas à mão** acham os canos. Uma regra de cor separa cano de céu, uma varredura horizontal acha onde estão os canos, uma varredura vertical acha o vão, e uma informação do código do jogo (vão de 176 px) completa o resto.

### Coordenadas
O canvas capturado muda de tamanho (tela Retina, tamanho da janela), mas o jogo sempre "pensa" em 900×600. Todas as posições são convertidas para 900×600, o mesmo cuidado que corrigiu um bug parecido no Duck Hunt.

## 2. Decisão: ensinando a IA *quando* pular

Esta é a parte central. A regra está em `decisao.js` e usa a **física do jogo**, lida direto do código-fonte:

| Grandeza | Valor |
|---|---|
| Altura do vão | 176 px |
| Altura da colisão do pássaro | 71 px |
| Altura de cada pulo | 72 px |
| Gravidade | +0,2 px/frame a cada frame |

**A janela para pular:** 176 − 71 − 72 = **33 px**.
- Pular antes dela: depois de subir 72 px, a cabeça bate no cano de cima.
- Pular depois dela: a barriga já encostou no cano de baixo.

**A regra:**
1. **Não pula** se o pulo fizer a cabeça bater no cano de cima. Essa trava só vale quando o cano já está perto; longe dele, o único teto é o topo da tela.
2. **Mira o meio da janela:** pula quando o centro do pássaro chega a ~52 px acima do fundo do vão.
3. **Agenda o pulo no instante exato:** a IA só pode decidir quando o YOLO termina uma análise (a cada ~55 ms), e nesse tempo o pássaro cai até ~18 px. Como a física é conhecida, ela calcula o milissegundo em que o pássaro vai chegar no ponto ideal e agenda o pulo com um timer.

**Física para compensar o atraso:**
- **Posição:** cada print já tem ~50 ms quando a decisão sai. A IA projeta onde o pássaro está *agora* com `y + v·t + ½·g·t²`.
- **Velocidade:** é calculada pelo **tempo desde o último pulo**, e não pela diferença entre duas leituras. As leituras têm ruído, e com ~50 ms entre elas a velocidade saía muito errada.
- **Prints velhos:** um print tirado antes do último pulo ainda não mostra o efeito do pulo. Se fosse usado, a IA pularia de novo à toa (o "pulo duplo"), então ele é ignorado.

### Os "botões" para experimentar (`decisao.js`)
| Constante | O que muda |
|---|---|
| `PONTO_DE_PULO` | Altura do pulo dentro da janela. Menor: risco no cano de baixo. Maior: risco no de cima |
| `X_CANO_PERTO` | A partir de que distância o cano de cima passa a ser considerado |
| `FOLGA_CANO_CIMA` | Margem mínima até o cano de cima depois do pulo |

## 3. Calibração: medir antes de ajustar

O maior aprendizado do projeto. Mexer nos números "no olho" quase não deu resultado. O que funcionou foi um teste automático que:
1. abre o jogo no Chrome e deixa a IA jogar várias partidas seguidas;
2. registra **o que a IA achou que via** e **onde as coisas realmente estavam** (lido do próprio jogo);
3. classifica cada morte: cano de cima, de baixo, traseira do cano ou chão.

Cada correção importante veio de uma comparação dessas:

| Problema encontrado | Como apareceu nos dados | Correção |
|---|---|---|
| Pulo duplo | Dois pulos seguidos, pássaro bate em cima | Ignorar prints anteriores ao último pulo |
| Vão medido 24 px alto | Mortes em cima "sem motivo" | Contorno preto conta como cano |
| Velocidade errada | IA calculava v = 0 com o pássaro caindo | Velocidade pela física (tempo desde o pulo) |
| "Freio" atrapalhando | Pássaro preso no alto, sem descer até o vão | Freio só com cano perto (depois, removido) |
| Cano visto mais estreito | Mortes na traseira do cano | Largura real do cano + trocar de alvo mais tarde |
| Colisão maior que o desenho | Mortes com "10 px de folga sobrando" | Usar a altura real da colisão (71 px) |
| Pulo atrasado pelo ritmo do YOLO | Pulos fora da janela de 33 px | Agendar o pulo no milissegundo certo |

## Resultados

Medido em ~70 partidas automáticas:

| Etapa | Média de canos | Recorde |
|---|---|---|
| Primeira versão funcional | ~1 | 2 |
| Depois de corrigir velocidade e pulo duplo | ~4 | 11 |
| Depois de corrigir a visão dos canos | ~5 | 16 |
| Com pulo agendado | ~6 | 12 |

A IA **ainda não é invencível**. A janela de 33 px é muito estreita para uma "visão" que tem alguns pixels de ruído e às vezes perde o pássaro por alguns frames. A maioria das mortes restantes é no cano de cima, por erro pequeno de posição.

## Lições

1. **Um modelo pronto pode servir mesmo sem "entender" o jogo.** O YOLO não sabe o que é o pássaro, mas acha *alguma coisa* naquela posição, e isso basta.
2. **Nem tudo precisa de IA.** Os canos foram achados por cor, que é mais simples e mais preciso.
3. **Conhecer as regras do ambiente vale ouro.** A física do jogo (gravidade, altura do pulo, tamanho do vão) transformou "chutes" em contas.
4. **Atraso é inimigo.** Toda percepção chega atrasada. Uma IA que reage ao passado precisa *prever* o presente.
5. **Meça antes de ajustar.** As melhorias reais vieram de comparar o que a IA via com a realidade, não de mexer nos números no olho.
