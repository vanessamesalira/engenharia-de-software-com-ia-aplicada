// =============================================================================
// main.js — o "maestro": não faz o trabalho pesado, só junta as peças
//
//   layout.js  → criarPreview, desenharPreview
//   canos.js   → lerPixels, encontrarCanos, encontrarProximoCano, encontrarVao
//   passaro.js → encontrarPassaro
//   decisao.js → calcularVelocidade, decidir  (a regra: pula ou não pula?)
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

  // Por quanto tempo dá para confiar na estimativa pela física quando o
  // YOLO perde o pássaro. Mais que isso, o erro acumulado fica grande demais.
  const MAX_TEMPO_ESTIMANDO_MS = 400;

  // Diferença máxima aceitável entre a leitura do YOLO e a previsão da física
  const SALTO_MAXIMO_PX = 60;

  // Pulo marcado para um instante exato (ver decisao.js, regra 3)
  let puloAgendado = null;

  // Aperta o espaço e registra o pulo.
  //   yNaHora → onde o centro do pássaro está no momento do pulo
  function executarPulo(yNaHora) {
    apertarEspaco();
    momentoDoUltimoPulo = performance.now();
    // Referência para depois do pulo: onde o pássaro deve ficar quando a
    // animação acabar (72 px acima de onde estava). Serve para estimar a
    // posição e descartar leituras absurdas logo após o pulo.
    leituraAnterior = {
      y: yNaHora - ALTURA_PULO,
      momento: momentoDoUltimoPulo + INICIO_DA_QUEDA_APOS_PULO_MS,
      velocidade: VELOCIDADE_INICIAL,
    };
  }

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

      // Este print já mostra o efeito do último pulo? Se não, ele está
      // "desatualizado" e não serve para decidir um pulo novo.
      const printViuUltimoPulo =
        momentoDoPrint > momentoDoUltimoPulo + DURACAO_PULO_MS;
      if (!printViuUltimoPulo) {
        console.log("🐦 ⏸️ (print anterior ao pulo)");
        return;
      }

      let passaro = encontrarPassaro(data.deteccoes);
      let estimado = false;

      // Leitura impossível? Se o YOLO diz que o pássaro "teleportou" para
      // longe de onde a física diz que ele deveria estar, provavelmente pegou
      // outra coisa (cano, chão). Descarta e usa a estimativa abaixo.
      if (passaro && leituraAnterior) {
        const dt = momentoDoPrint - leituraAnterior.momento;
        const esperado = preverColisao(leituraAnterior.y, leituraAnterior.velocidade, dt);
        if (Math.abs(passaro.y - esperado) > SALTO_MAXIMO_PX) {
          console.log(`🐦 ❌ leitura descartada: y=${Math.round(passaro.y)}, esperado ~${Math.round(esperado)}`);
          passaro = null;
        }
      }

      // O YOLO às vezes "perde" o pássaro por alguns frames (principalmente
      // quando ele está caindo de bico para baixo). Em vez de ficar sem
      // decidir, estimamos onde ele está pela física, a partir da última
      // leitura boa (como um "piloto automático" curto).
      if (!passaro && leituraAnterior) {
        const dt = momentoDoPrint - leituraAnterior.momento;
        if (dt < MAX_TEMPO_ESTIMANDO_MS) {
          const y = preverColisao(leituraAnterior.y, leituraAnterior.velocidade, dt);
          passaro = { y };
          estimado = true;
        }
      }
      if (!passaro) return; // sem leitura e sem como estimar

      // Velocidade: pela física (tempo desde o último pulo), ver decisao.js
      const leituraAtual = { y: passaro.y, momento: momentoDoPrint };
      const velocidade = calcularVelocidade(
        momentoDoPrint,
        momentoDoUltimoPulo,
        leituraAtual,
        leituraAnterior,
      );
      leituraAtual.velocidade = velocidade;

      const { pular, motivo, agendarEmMs } = decidir(
        { y: passaro.y, velocidade, atrasoMs },
        ultimoVao,
      );

      // Chegou informação nova: um pulo agendado antes é cancelado
      // (a decisão de agora é mais atualizada).
      clearTimeout(puloAgendado);

      if (pular) {
        executarPulo(preverColisao(passaro.y, velocidade, atrasoMs));
      } else {
        if (!estimado) leituraAnterior = leituraAtual; // só leituras REAIS viram referência

        if (agendarEmMs !== undefined) {
          // Onde o pássaro vai estar na hora do pulo agendado
          const yNaHora = preverColisao(passaro.y, velocidade, atrasoMs + agendarEmMs);
          puloAgendado = setTimeout(() => executarPulo(yNaHora), agendarEmMs);
        }
      }

      console.log(
        `🐦 y=${Math.round(passaro.y)}${estimado ? " (estimado)" : ""} v=${velocidade.toFixed(2)}`,
        ultimoVao ? `🎯 vão ${ultimoVao.topo}–${ultimoVao.fim}` : "🎯 sem cano",
        pular ? `⬆️ PULA (${motivo})` : motivo,
        `⏱️ ${atrasoMs}ms`,
      );
    }
  };

  // Tenta a cada 20ms, mas só tira um print quando o YOLO terminou o anterior.
  // Assim a IA decide o mais rápido que o YOLO aguentar (~a cada 50-60ms).
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
      // último vão: o buraco de um cano nunca muda de altura.
      // Junto, guarda ONDE o cano está (em x): a decisão precisa saber se ele
      // já está em cima do pássaro ou ainda longe.
      const vao = encontrarVao(pixels, proximo) ?? ultimoVao;
      ultimoVao = vao && { ...vao, canoInicio: proximo.inicio, canoFim: proximo.fim };
    }

    workerOcupado = true;
    momentoDoPrint = agora;
    worker.postMessage({ type: "analisar", imagem: bitmap }, [bitmap]);
  }, 20);
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
