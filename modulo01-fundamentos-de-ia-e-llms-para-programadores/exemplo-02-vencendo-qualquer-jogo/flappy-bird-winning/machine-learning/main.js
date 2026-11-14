// =============================================================================
// main.js — o "maestro": não faz o trabalho pesado, só junta as peças
//
//   layout.js  → criarPreview, desenharPreview
//   canos.js   → lerPixels, encontrarCanos, encontrarProximoCano, encontrarVao
//   passaro.js → encontrarPassaro
//   decisao.js → preverY, devePular  (a regra: pula ou não pula?)
//   worker.js  → roda o YOLO (em paralelo, sem travar o jogo)
//
// O ciclo completo:
//   print → cores (vão) ─┐
//         → YOLO (pássaro) ┴→ decidir → pular
// =============================================================================

// Abra com ?ia=off para jogar você mesma, sem a IA
const parametros = new URLSearchParams(window.location.search);
const iaLigada = parametros.get("ia") !== "off";

if (iaLigada) {
  iniciarIA();
} else {
  console.log("🎮 IA desligada: modo manual");
}

function iniciarIA() {
  console.log("🤖 IA ligada");

  const preview = criarPreview();
  const worker = new Worker("machine-learning/worker.js");

  // "Quadro de avisos" compartilhado entre as duas partes:
  //   - o setInterval ESCREVE o vão (ele tem os pixels)
  //   - o onmessage LÊ o vão quando o pássaro chega do YOLO
  let ultimoVao = null;

  // Enquanto o YOLO está analisando um print, não mandamos outro.
  // Sem isso, se o YOLO for mais lento que o intervalo, os prints formam uma
  // fila e a IA passa a reagir a imagens cada vez mais VELHAS (= bate no cano).
  let workerOcupado = false;

  // Só começamos a mandar prints depois que o modelo terminar de carregar
  // (leva alguns segundos). Antes disso o worker não tem como analisar nada.
  let modeloPronto = false;

  // Quando o último print foi tirado (para medir o atraso da IA)
  let momentoDoPrint = 0;

  // Quando foi o último pulo. Um print tirado ANTES disso (ou logo depois,
  // enquanto o pulo ainda está acontecendo) mostra o pássaro como se ele não
  // tivesse pulado. Decidir com ele = pular de novo à toa = pulo duplo.
  let momentoDoUltimoPulo = 0;
  const DURACAO_PULO_MS = 80; // a animação do pulo leva ~50ms (js/entities/entities.js)

  // Leitura anterior do pássaro { y, momento }, para calcular a velocidade.
  // É apagada a cada pulo: uma leitura de antes do pulo não diz nada sobre
  // a velocidade depois dele.
  let leituraAnterior = null;

  // Respostas que chegam do worker
  worker.onmessage = ({ data }) => {
    if (data.type === "modelo-carregado") {
      modeloPronto = true;
      console.log("🧠 Modelo carregado e pronto!");
    }

    // O worker manda TODAS as detecções de um frame juntas, numa lista
    if (data.type === "deteccoes") {
      workerOcupado = false; // livre para o próximo print

      // Quanto tempo passou entre tirar o print e a resposta chegar.
      // Durante esse tempo o pássaro continuou se mexendo!
      const atrasoMs = Math.round(performance.now() - momentoDoPrint);

      const passaro = encontrarPassaro(data.deteccoes);
      if (!passaro) return; // a IA não achou o pássaro neste frame

      // Este print já mostra o efeito do último pulo? Se não, ele está
      // "desatualizado" e não serve para decidir um pulo novo.
      const printViuUltimoPulo =
        momentoDoPrint > momentoDoUltimoPulo + DURACAO_PULO_MS;

      // Print desatualizado: não decide nada com ele (nem guarda como leitura)
      if (!printViuUltimoPulo) {
        console.log(`🐦 y=${Math.round(passaro.y)} ⏸️ (print anterior ao pulo)`);
        return;
      }

      // Onde o pássaro VAI estar, usando a velocidade desde a leitura anterior
      const leituraAtual = { y: passaro.y, momento: momentoDoPrint };
      const yPrevisto = preverY(leituraAtual, leituraAnterior);

      const pular = devePular(yPrevisto, ultimoVao);
      if (pular) {
        apertarEspaco();
        momentoDoUltimoPulo = performance.now();
        leituraAnterior = null; // depois do pulo, a velocidade recomeça do zero
      } else {
        leituraAnterior = leituraAtual;
      }

      console.log(
        `🐦 y=${Math.round(passaro.y)} → previsto ${Math.round(yPrevisto)}`,
        ultimoVao ? `🎯 vão ${ultimoVao.topo}–${ultimoVao.fim}` : "🎯 sem cano",
        pular ? "⬆️ PULA" : "",
        `⏱️ ${atrasoMs}ms`,
      );
    }
  };

  // A cada 100ms: tira um print, acha o vão pelas cores e manda para o YOLO
  setInterval(async () => {
    if (!modeloPronto) return; // modelo ainda carregando
    if (workerOcupado) return; // YOLO ainda pensando no print anterior

    const agora = performance.now(); // anota a hora ANTES de tirar o print
    const bitmap = await capturarTela();
    if (!bitmap) return;

    desenharPreview(preview, bitmap);

    // Lê as cores ANTES de mandar para o worker: depois do postMessage
    // o bitmap é transferido e deixa de existir aqui no main.js
    const pixels = lerPixels(bitmap);
    const proximo = encontrarProximoCano(encontrarCanos(pixels));
    if (!proximo) {
      ultimoVao = null; // nenhum cano à frente
    } else {
      // Se não deu para medir agora (ex.: cano em cima do pássaro), mantém o
      // último vão: o buraco de um cano nunca muda de altura
      ultimoVao = encontrarVao(pixels, proximo) ?? ultimoVao;
    }

    workerOcupado = true;
    momentoDoPrint = agora;
    worker.postMessage({ type: "analisar", imagem: bitmap }, [bitmap]);
  }, 100);
}

// Tira um "print" do canvas do jogo.
// Devolve null se o jogo ainda não criou o canvas (tenta de novo no próximo ciclo).
async function capturarTela() {
  if (!me.video.renderer) return null;

  const canvas = me.video.renderer.getScreenCanvas();
  return createImageBitmap(canvas);
}

// A "mão" da IA: aperta e solta a barra de espaço pelo código.
// O jogo liga o espaço à ação "fly" (js/game.js) e pula quando ela é apertada.
// Precisa SOLTAR depois: a tecla foi registrada com "lock", então segurar
// conta como um pulo só.
function apertarEspaco() {
  me.input.triggerKeyEvent(me.input.KEY.SPACE, true); // aperta
  setTimeout(() => me.input.triggerKeyEvent(me.input.KEY.SPACE, false), 50); // solta
}
