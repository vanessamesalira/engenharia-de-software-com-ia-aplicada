const parameters = new URLSearchParams(window.location.search);

const enableAI = parameters.get("enableAI") !== "false";

if (enableAI) {
  console.log("AI is Enabled");

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

  setInterval(async () => {
    // Se o jogo ainda não criou o canvas, tentar de novo daqui a pouco
    if (!me.video.renderer) return;

    const canvas = me.video.renderer.getScreenCanvas();
    const bitmap = await createImageBitmap(canvas);

    console.log("📸 print:", bitmap.width, "x", bitmap.height);

    preview.getContext("2d").drawImage(bitmap, 0, 0, preview.width, preview.height);
  }, 200); // Captura a tela a cada 200ms
} else {
  console.log("AI is Disabled");
}
