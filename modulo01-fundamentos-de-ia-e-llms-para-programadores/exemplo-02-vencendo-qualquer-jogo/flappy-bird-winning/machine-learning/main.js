const parameters = new URLSearchParams(window.location.search);

const enableAI = parameters.get("enableAI") !== "false";

if (enableAI) {
  console.log("AI is Enabled");

  const preview = criarPreview();
  const worker = new Worker("machine-learning/worker.js");
  worker.onmessage = ({ data }) => {
    if (data.type === "model-loaded") {
      console.log("🤖 AI model loaded and ready to predict!");
    }

    if (data.type === "prediction") {
      // O worker manda a posição em PROPORÇÃO (0 a 1), não em pixels.
      // Ex.: x = 0.1 significa "10% da largura da tela, a partir da esquerda".
      //
      // Por quê? O canvas capturado muda de tamanho (tela Retina, tamanho da
      // janela...): no seu Mac ele tem 1918x1278, mas o jogo "pensa" em 900x600.
      // A proporção é a mesma nos dois, então basta multiplicar pelo tamanho
      // do jogo para ter a posição nas coordenadas que o próprio jogo usa
      // (as mesmas do `this.pos.x = 60` do pássaro em js/entities/entities.js).
      //
      // me.game.viewport é a "câmera" do MelonJS: largura 900, altura 600.
      const gameX = data.x * me.game.viewport.width;
      const gameY = data.y * me.game.viewport.height;

      console.log(`👁️ ${data.label} (${data.score}%)`, Math.round(gameX), Math.round(gameY));
    }
  };

  setInterval(async () => {
    const bitmap = await capturarTela();
    if (!bitmap) return;

    desenharPreview(preview, bitmap);

    worker.postMessage({ type: "predict", image: bitmap }, [bitmap]);
  }, 200); // Captura a tela a cada 200ms
} else {
  console.log("AI is Disabled");
}

function criarPreview() {
  // Miniatura do que a IA "vê" (criada uma vez só, antes de ser usada)
  const preview = document.createElement("canvas");
  preview.width = 225; // 900 / 4
  preview.height = 150; // 600 / 4
  preview.style.position = "fixed";
  preview.style.top = "10px";
  preview.style.right = "10px";
  preview.style.border = "2px solid red";
  preview.style.zIndex = "1000";
  document.body.appendChild(preview); // sem isso o preview não aparece na página

  return preview;
}

async function capturarTela() {
  // se o renderer não existe ainda, devolve null
  // senão, devolve o bitmap
  // Se o jogo ainda não criou o canvas, tentar de novo daqui a pouco
  if (!me.video.renderer) return null;

  const canvas = me.video.renderer.getScreenCanvas();
  const bitmap = await createImageBitmap(canvas);

  return bitmap;
}

function desenharPreview(preview, bitmap) {
  // desenha o bitmap dentro do preview
  preview
    .getContext("2d")
    .drawImage(bitmap, 0, 0, preview.width, preview.height);
}
