// =============================================================================
// worker.js — roda o YOLO numa "linha de trabalho" separada, sem travar o jogo
//
// Conversa com o main.js por mensagens:
//   recebe  { type: "analisar", imagem }
//   envia   { type: "modelo-carregado" }
//   envia   { type: "deteccoes", deteccoes: [...] }
// =============================================================================

// Carrega o TensorFlow.js (a biblioteca que roda modelos de IA no navegador)
importScripts(
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
);

// Caminhos relativos à pasta DESTE arquivo (machine-learning/)
const CAMINHO_MODELO = "yolov5n_web_model/model.json";
const CAMINHO_LABELS = "yolov5n_web_model/labels.json";

const TAMANHO_ENTRADA = 640; // o YOLO só aceita imagens 640x640
const CONFIANCA_MINIMA = 0.3; // nota mínima (30%) para considerar uma detecção

let modelo = null;
let labels = []; // nomes das 80 classes: o modelo responde com números, isto traduz

async function carregarModelo() {
  await tf.ready();
  labels = await (await fetch(CAMINHO_LABELS)).json();
  modelo = await tf.loadGraphModel(CAMINHO_MODELO);

  postMessage({ type: "modelo-carregado" });
}

carregarModelo();

// Transforma a imagem no formato que o YOLO entende
function prepararImagem(imagem) {
  return tf.tidy(
    () =>
      tf.browser
        .fromPixels(imagem) // imagem → números (pixels)
        .resizeBilinear([TAMANHO_ENTRADA, TAMANHO_ENTRADA]) // redimensiona para 640x640
        .div(255) // pixels de 0-255 para 0-1
        .expandDims(0), // "lote" de 1 imagem
  );
}

self.onmessage = async ({ data }) => {
  if (data.type !== "analisar") return;
  if (!modelo) return; // modelo ainda carregando? ignora

  const entrada = prepararImagem(data.imagem);
  data.imagem.close(); // já virou tensor: libera a imagem da memória

  const saida = await modelo.executeAsync(entrada);
  const [boxes, scores, classes] = await Promise.all(
    saida.slice(0, 3).map((t) => t.data()),
  );
  tf.dispose([entrada, ...saida]); // libera memória

  const deteccoes = [];

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < CONFIANCA_MINIMA) continue;

    // caixas vêm em proporção (0 a 1); o main.js converte para o tamanho do jogo
    const [x1, y1, x2, y2] = boxes.slice(i * 4, i * 4 + 4);
    deteccoes.push({
      label: labels[classes[i]],
      score: (scores[i] * 100).toFixed(0),
      x: (x1 + x2) / 2, // centro da caixa
      y: (y1 + y2) / 2, // centro da caixa
    });
  }

  // Depois do for: manda TODAS as detecções do frame numa mensagem só
  postMessage({ type: "deteccoes", deteccoes });
};
