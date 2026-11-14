//Carrega o TensorFlow.js e o modelo YOLOv5n
importScripts(
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
);

const MODEL_PATH = "yolov5n_web_model/model.json";
const LABELS_PATH = "yolov5n_web_model/labels.json";

let _model = null;
let _labels = [];

async function carregarModelo() {
  await tf.ready();
  _labels = await (await fetch(LABELS_PATH)).json();
  _model = await tf.loadGraphModel(MODEL_PATH);

  postMessage({ type: "model-loaded" });
}

carregarModelo();

const INPUT_SIZE = 640; // o YOLO só aceita imagens 640x640
const THRESHOLD = 0.3; // confiança mínima (30%) para considerar algo

// Transforma a imagem no formato que o YOLO entende
function prepararImagem(image) {
  return tf.tidy(
    () =>
      tf.browser
        .fromPixels(image) // imagem → números (pixels)
        .resizeBilinear([INPUT_SIZE, INPUT_SIZE]) // redimensiona para 640x640
        .div(255) // pixels de 0-255 para 0-1
        .expandDims(0), // "lote" de 1 imagem
  );
}

self.onmessage = async ({ data }) => {
  if (data.type !== "predict") return;
  if (!_model) return; // modelo ainda carregando? ignora

  const entrada = prepararImagem(data.image);

  const saida = await _model.executeAsync(entrada);
  const [boxes, scores, classes] = await Promise.all(
    saida.slice(0, 3).map((t) => t.data()),
  );
  tf.dispose([entrada, ...saida]); // libera memória

  const deteccoes = [];

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < THRESHOLD) continue;

    // caixas vêm em proporção (0 a 1); multiplicamos pelo tamanho real
    const [x1, y1, x2, y2] = boxes.slice(i * 4, i * 4 + 4);
    deteccoes.push({
      label: _labels[classes[i]],
      score: (scores[i] * 100).toFixed(0),
      x: (x1 + x2) / 2, // centro da caixa
      y: (y1 + y2) / 2, // centro da caixa
    });

    postMessage({ type: "prediction", deteccoes });
  }
};
