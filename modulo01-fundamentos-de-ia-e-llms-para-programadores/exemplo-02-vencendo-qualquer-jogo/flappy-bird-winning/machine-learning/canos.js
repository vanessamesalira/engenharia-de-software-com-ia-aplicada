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

// Percorre a linha LINHA_BUSCA_Y da esquerda para a direita e devolve onde
// cada cano começa e termina, ex.: [{ inicio: 300, fim: 444 }, ...]
//
// A ideia é um "interruptor": dentroDeCano começa desligado.
//   - não-verde → verde : acabamos de ENTRAR num cano  (anota o inicio)
//   - verde → não-verde : acabamos de SAIR de um cano  (anota o fim)
function encontrarCanos(pixels) {
  const canos = [];
  let dentroDeCano = false;
  let inicio = 0;

  for (let x = 0; x < LARGURA_JOGO; x++) {
    const verde = ehVerdeDeCano(corDoPixel(pixels, x, LINHA_BUSCA_Y));

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

  return canos;
}

// O pássaro ocupa x de 60 a ~145. Um cano cujo FIM já passou de 60
// ficou para trás e não importa mais.
const X_PASSARO = 60;

function encontrarProximoCano(canos) {
  return canos.find((cano) => cano.fim > X_PASSARO);
}

// Pelo código do jogo (js/entities/entities.js), o vão tem sempre 176 de altura
const ALTURA_VAO = 176;

// Descobre onde está o vão (o buraco por onde o pássaro passa) de um cano.
//
// Recebe:
//   pixels → o "mapa" da tela inteira (900x600), vindo do lerPixels
//   cano   → o "endereço" do cano: { inicio, fim } (só as bordas no eixo x)
//
// Ideia: descer pelo MEIO do cano, um pixel por vez, a partir do topo.
// Enquanto for verde, ainda estamos no cano de cima. No primeiro pixel que
// NÃO for verde, o cano de cima acabou: ali começa o vão.
//
//   y = 10   🟩  cano de cima
//    ...     🟩
//   y = 180  🟩
//   y = 181  ⬜  ← primeiro não-verde = TOPO DO VÃO
function encontrarVao(pixels, cano) {
  // A coluna que vamos "descer": o meio do cano, entre o inicio e o fim.
  // Pelo meio, para fugir do contorno preto das bordas.
  // Esse x fica FIXO durante toda a busca.
  const xMeio = Math.round((cano.inicio + cano.fim) / 2);

  // Agora quem muda é o y: começa perto do topo e vai descendo (y++)
  for (let y = LINHA_BUSCA_Y; y < ALTURA_JOGO; y++) {
    // Pergunta ao "mapa" a cor do ponto (xMeio, y)
    const cor = corDoPixel(pixels, xMeio, y);

    // "!" significa NÃO: entra aqui quando o pixel NÃO é verde de cano
    if (!ehVerdeDeCano(cor)) {
      // Achamos o topo do vão. O resto sai dele, porque o vão tem altura fixa.
      // O return encerra a função na hora: não olhamos mais nenhum pixel.
      return {
        topo: y,
        fim: y + ALTURA_VAO,
        centro: y + ALTURA_VAO / 2,
      };
    }
  }

  // Descemos a tela inteira e foi tudo verde: algo deu errado
  // (por exemplo, o xMeio caiu fora do cano). Avisamos com null.
  return null;
}
