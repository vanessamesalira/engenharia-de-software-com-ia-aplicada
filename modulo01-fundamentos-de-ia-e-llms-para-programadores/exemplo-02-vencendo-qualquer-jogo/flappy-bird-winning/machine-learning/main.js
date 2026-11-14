// =============================================================================
// main.js — o "maestro": não faz o trabalho pesado, só junta as peças
//
//   layout.js  → criarPreview, desenharPreview
//   canos.js   → lerPixels, encontrarCanos
//   passaro.js → encontrarPassaro
//   worker.js  → roda o YOLO (em paralelo, sem travar o jogo)
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

  // Respostas que chegam do worker
  worker.onmessage = ({ data }) => {
    if (data.type === "modelo-carregado") {
      console.log("🧠 Modelo carregado e pronto!");
    }

    // O worker manda TODAS as detecções de um frame juntas, numa lista
    if (data.type === "deteccoes") {
      const passaro = encontrarPassaro(data.deteccoes);
      if (!passaro) return; // a IA não achou o pássaro neste frame

      console.log(
        `🐦 pássaro em (${Math.round(passaro.x)}, ${Math.round(passaro.y)})`,
        `[${passaro.label} ${passaro.score}%]`,
      );
    }
  };

  // A cada 200ms: tira um print, analisa as cores e manda para o YOLO
  setInterval(async () => {
    const bitmap = await capturarTela();
    if (!bitmap) return;

    desenharPreview(preview, bitmap);

    // Lê as cores ANTES de mandar para o worker: depois do postMessage
    // o bitmap é transferido e deixa de existir aqui no main.js
    const pixels = lerPixels(bitmap);
    const canos = encontrarCanos(pixels);
    console.log("🟩 canos:", JSON.stringify(canos));

    worker.postMessage({ type: "analisar", imagem: bitmap }, [bitmap]);
  }, 200);
}

// Tira um "print" do canvas do jogo.
// Devolve null se o jogo ainda não criou o canvas (tenta de novo no próximo ciclo).
async function capturarTela() {
  if (!me.video.renderer) return null;

  const canvas = me.video.renderer.getScreenCanvas();
  return createImageBitmap(canvas);
}
