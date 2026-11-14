// =============================================================================
// layout.js — tudo que é VISUAL da IA (o que aparece na tela para a gente ver)
// =============================================================================

// Cria a miniatura do que a IA "vê" e coloca na página.
function criarPreview() {
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

// Desenha o print dentro da miniatura (encolhendo para caber).
function desenharPreview(preview, bitmap) {
  preview
    .getContext("2d")
    .drawImage(bitmap, 0, 0, preview.width, preview.height);
}
