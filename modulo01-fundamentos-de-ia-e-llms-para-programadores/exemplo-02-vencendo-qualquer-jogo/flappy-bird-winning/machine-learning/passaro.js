// =============================================================================
// passaro.js — escolhe, entre as detecções do YOLO, qual é o pássaro
// =============================================================================

// O pássaro fica sempre no mesmo x: o centro dele está em x ≈ 65 (medido no
// jogo rodando). Tudo que a IA detectar fora dessa faixa é outra coisa
// (canos, chão, placar...). Faixa estreita = menos chance de pegar lixo.
const X_MIN_PASSARO = 30;
const X_MAX_PASSARO = 100;

// Calibração: comparando o que o YOLO vê com a posição REAL do pássaro no
// jogo (centenas de medições automáticas), o centro da caixa do YOLO fica
// ~2 px ABAIXO do centro da colisão do pássaro (com variação de só ±2 px,
// para qualquer label). Erro pequeno e estável: é só descontar.
const CORRECAO_Y_PASSARO = -2;

function encontrarPassaro(deteccoes) {
  return (
    deteccoes
      // 1. map: converte cada detecção de PROPORÇÃO (0 a 1) para coordenadas do jogo.
      //    O canvas capturado muda de tamanho (tela Retina, tamanho da janela: no seu
      //    Mac tem 1918x1278), mas o jogo sempre "pensa" em 900x600. A proporção é
      //    a mesma nos dois, então basta multiplicar pelo tamanho do jogo.
      //    LARGURA_JOGO e ALTURA_JOGO estão definidas em canos.js.
      //    O "...d" copia os outros campos (label, score) para o novo objeto.
      .map((d) => ({
        ...d,
        x: d.x * LARGURA_JOGO,
        y: d.y * ALTURA_JOGO + CORRECAO_Y_PASSARO,
      }))
      // 2. filter: o nome (label) não é confiável (o pássaro vira "traffic light",
      //    "kite", "person"...), mas a POSIÇÃO é: só fica o que estiver na
      //    coluna do pássaro.
      .filter((d) => d.x > X_MIN_PASSARO && d.x < X_MAX_PASSARO)
      // 3. sort: o mesmo pássaro aparece em várias caixas; ordena da maior nota
      //    para a menor. Number() porque o score vem como texto ("46").
      .sort((a, b) => Number(b.score) - Number(a.score))[0]
    // 4. [0]: fica só com a primeira (a de maior nota).
    //    Se a lista estiver vazia, [0] dá undefined, ou seja, "não achou".
  );
}
