// =============================================================================
// canos.js — encontra os canos olhando a COR dos pixels do print
//
// O YOLO não reconhece os canos de forma confiável, então aqui não usamos IA:
// usamos uma regra simples ("o cano é verde e o céu é azul").
// =============================================================================

// O jogo "pensa" em 900x600 (me.video.init em js/game.js)
const LARGURA_JOGO = 900;
const ALTURA_JOGO = 600;

// Linha onde procuramos os canos. Perto do topo só tem céu azul e o cano de
// cima (que sempre encosta no topo). Mais embaixo tem arbustos verdes, que
// iam confundir a busca.
const LINHA_BUSCA_Y = 10;

// -----------------------------------------------------------------------------
// Canvas "invisível" do tamanho do jogo, só para ler as cores.
// Truque: desenhando o print (1918x1278) aqui dentro em 900x600, cada pixel
// já fica nas coordenadas do jogo. Não precisa converter nada depois.
// -----------------------------------------------------------------------------
const canvasAnalise = document.createElement("canvas");
canvasAnalise.width = LARGURA_JOGO;
canvasAnalise.height = ALTURA_JOGO;
// willReadFrequently: avisa o navegador que vamos ler muito deste canvas
const ctxAnalise = canvasAnalise.getContext("2d", { willReadFrequently: true });

// Desenha o print no canvas de análise e devolve TODOS os pixels numa lista:
// [r, g, b, a,  r, g, b, a,  ...]  → 4 números por pixel
function lerPixels(bitmap) {
  ctxAnalise.drawImage(bitmap, 0, 0, LARGURA_JOGO, ALTURA_JOGO);
  return ctxAnalise.getImageData(0, 0, LARGURA_JOGO, ALTURA_JOGO).data;
}

// Pega a cor de UM pixel (x, y) dentro da lista.
// Cada linha da imagem tem LARGURA_JOGO pixels, e cada pixel ocupa 4 posições.
function corDoPixel(pixels, x, y) {
  const i = (y * LARGURA_JOGO + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
}

// É cor de cano?
//   Cano claro  → r 224, g 245, b 144
//   Cano escuro → r  90, g 138, b  32
//   Céu         → r   0, g 150, b 200   (azul maior que verde)
//   Nuvem       → r 255, g 255, b 255   (tudo igual)
// No cano, o verde é BEM maior que o azul. No céu e na nuvem, não.
function ehVerdeDeCano({ r, g, b }) {
  return g > b + 50 && g > r;
}

// É o contorno preto do cano? A ponta do cano tem uma "tampa" com linhas
// pretas em volta. Se a busca do vão parasse no preto, acharia o topo ~24 px
// acima do real (e a IA miraria alto demais, batendo no cano de cima).
function ehContornoEscuro({ r, g, b }) {
  return r + g + b < 150;
}

// Para achar o vão: verde OU contorno preto ainda é "cano".
function ehParteDoCano(cor) {
  return ehVerdeDeCano(cor) || ehContornoEscuro(cor);
}

// Percorre a linha LINHA_BUSCA_Y da esquerda para a direita e devolve onde
// cada cano começa e termina, ex.: [{ inicio: 300, fim: 444 }, ...]
//
// A ideia é um "interruptor": dentroDeCano começa desligado.
//   - não-cano → cano : acabamos de ENTRAR num cano  (anota o inicio)
//   - cano → não-cano : acabamos de SAIR de um cano  (anota o fim)
//
// "Cano" aqui inclui o contorno preto (ehParteDoCano). Só com o verde, a IA
// via o cano ~17 px mais estreito do que ele é, achava que ele "já tinha
// passado" e o pássaro raspava na traseira dele.
function encontrarCanos(pixels) {
  const canos = [];
  let dentroDeCano = false;
  let inicio = 0;

  for (let x = 0; x < LARGURA_JOGO; x++) {
    const verde = ehParteDoCano(corDoPixel(pixels, x, LINHA_BUSCA_Y));

    if (verde && !dentroDeCano) {
      dentroDeCano = true;
      inicio = x;
    } else if (!verde && dentroDeCano) {
      dentroDeCano = false;
      canos.push({ inicio, fim: x - 1 });
    }
  }

  // Cano entrando pela direita: a linha acabou e ainda estávamos "dentro".
  // Fecha ele na borda da tela.
  if (dentroDeCano) {
    canos.push({ inicio, fim: LARGURA_JOGO - 1 });
  }

  // Descarta "canos" estreitos no meio da tela: são os números pretos do
  // placar desenhados sobre o céu. Um cano de verdade tem ~148 de largura;
  // só fica estreito quando está entrando/saindo pelas bordas da tela.
  return canos.filter((c) => {
    const tocaBorda = c.inicio === 0 || c.fim === LARGURA_JOGO - 1;
    return tocaBorda || c.fim - c.inicio > LARGURA_MINIMA_CANO;
  });
}

const LARGURA_MINIMA_CANO = 100;

// O DESENHO do pássaro ocupa x de ~22 a ~108 (medido no jogo rodando).
// Usado para não confundir o contorno escuro do pássaro com o do cano.
const X_PASSARO = 18;
const X_FIM_PASSARO = 112;

// A COLISÃO dele começa em x ≈ 30. Um cano só "ficou para trás" quando o
// fim dele passa BEM disso: trocar de alvo cedo demais fazia o pássaro ir
// atrás do próximo vão ainda raspando na traseira do cano anterior.
const X_INICIO_COLISAO = 10;

function encontrarProximoCano(canos) {
  return canos.find((cano) => cano.fim > X_INICIO_COLISAO);
}

// Pelo código do jogo (js/entities/entities.js), o vão tem sempre 176 de altura
const ALTURA_VAO = 176;

// Descobre onde está o vão (o buraco por onde o pássaro passa) de um cano.
//
// Recebe:
//   pixels → o "mapa" da tela inteira (900x600), vindo do lerPixels
//   cano   → o "endereço" do cano: { inicio, fim } (só as bordas no eixo x)
//
// Ideia: descer pelo cano, um pixel por vez, a partir do topo.
// Enquanto for cano (verde ou contorno preto), ainda estamos no cano de cima.
// No primeiro pixel que NÃO for cano (céu, nuvem...), começa o vão.
//
//   y = 10   🟩  cano de cima
//    ...     🟩
//            ⬛  contorno da tampa (ainda é cano)
//            🟩  tampa
//            ⬛  contorno da tampa
//   y = 181  ⬜  ← primeiro pixel que não é cano = TOPO DO VÃO
//
// Por que várias colunas? Algo pode atrapalhar uma coluna (por exemplo, o
// pássaro, quando o cano passa por cima dele). Olhando em mais de um ponto
// e ficando com o MAIOR topo, uma coluna boa já basta.
function encontrarVao(pixels, cano) {
  const largura = cano.fim - cano.inicio;

  // Três colunas: a 1/4, 1/2 e 3/4 da largura do cano
  const colunas = [0.25, 0.5, 0.75].map((p) =>
    Math.round(cano.inicio + largura * p),
  );

  const topos = colunas
    // Pula colunas que passam pelo pássaro: o contorno escuro dele seria
    // confundido com o contorno do cano
    .filter((x) => x < X_PASSARO || x > X_FIM_PASSARO)
    .map((x) => topoDoVaoNaColuna(pixels, x))
    .filter((t) => t !== null); // descarta coluna que não achou nada

  // Nenhuma coluna serviu (ex.: o cano está bem em cima do pássaro).
  // Devolve null e o main.js mantém o último vão medido desse cano.
  if (topos.length === 0) return null;

  const topo = Math.max(...topos);
  return {
    topo,
    fim: topo + ALTURA_VAO,
    centro: topo + ALTURA_VAO / 2,
  };
}

// Desce pela coluna x a partir do topo da tela e devolve o y do primeiro
// pixel que NÃO é cano (= onde o cano de cima acaba, já incluindo a tampa).
function topoDoVaoNaColuna(pixels, x) {
  for (let y = LINHA_BUSCA_Y; y < ALTURA_JOGO; y++) {
    if (!ehParteDoCano(corDoPixel(pixels, x, y))) {
      return y; // o return encerra na hora: não olha mais nenhum pixel
    }
  }
  return null; // desceu a tela inteira e foi tudo verde: algo deu errado
}
