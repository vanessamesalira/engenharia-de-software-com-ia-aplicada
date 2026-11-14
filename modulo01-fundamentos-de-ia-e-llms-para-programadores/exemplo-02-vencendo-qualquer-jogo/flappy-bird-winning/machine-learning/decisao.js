// =============================================================================
// decisao.js — o "cérebro": com o pássaro e o vão em mãos, pula ou não pula?
//
// Este é o arquivo para EXPERIMENTAR: mexendo nas constantes abaixo você
// "ensina" a IA a jogar melhor ou pior.
// =============================================================================

// Números do próprio jogo (js/entities/entities.js):
//   - cada pulo leva o pássaro ~72 px para cima
//   - o pássaro tem 60 de altura (30 acima e 30 abaixo do centro)
//   - o vão tem 176 de altura (88 acima e 88 abaixo do centro)
//
// Regra: só pula quando o pássaro já caiu um pouco ABAIXO do centro do vão.
//
//   topo do vão  ─────────────  centro - 88
//                     ↑
//                  (sobe 72 ao pular)
//   centro       ─ ─ ─ ─ ─ ─ ─
//   centro + 25  ─────────────  ← passou daqui? PULA
//
//   fim do vão   ─────────────  centro + 88
//
// Por que +25 e não 0 (o centro exato)? Se pulasse no centro, subiria 72 e a
// cabeça (30 acima do centro do pássaro) passaria do topo do vão: bateria no
// cano de cima. Pulando a +25, ele sobe até centro - 47, e a cabeça fica em
// centro - 77, ainda dentro do vão (o topo é centro - 88).
//
// 👉 Experimente: menor = joga mais "alto" (risco no cano de cima);
//                 maior = joga mais "baixo" (risco no cano de baixo).
const MARGEM_ABAIXO_DO_CENTRO = 25;

// Sem cano à vista (começo do jogo): mantém o pássaro no meio da tela
const Y_ALVO_SEM_CANO = 300;

// Quantos milissegundos "à frente" a IA tenta prever.
// O pássaro cai cada vez mais rápido: entre duas leituras ele pode descer
// ~40 px. Se a IA só olhar onde ele ESTÁ, quando perceber já é tarde.
// Então ela olha para onde ele VAI ESTAR daqui a esse tempo
// (≈ o atraso do YOLO + o tempo até a próxima decisão).
//
// 👉 Experimente: 0 = sem previsão (o comportamento antigo);
//                 maior = pula mais cedo quando está caindo rápido.
const PREVISAO_MS = 120;

// Prevê onde o pássaro vai estar, usando a velocidade entre duas leituras.
//   leituraAtual / leituraAnterior: { y, momento } (momento em ms)
//   Sem leitura anterior não dá para saber a velocidade: devolve o y atual.
function preverY(leituraAtual, leituraAnterior) {
  if (!leituraAnterior) return leituraAtual.y;

  const tempo = leituraAtual.momento - leituraAnterior.momento;
  if (tempo <= 0) return leituraAtual.y;

  // px por ms (positivo = caindo, negativo = subindo)
  const velocidade = (leituraAtual.y - leituraAnterior.y) / tempo;

  return leituraAtual.y + velocidade * PREVISAO_MS;
}

function devePular(yPrevisto, vao) {
  const alvo = vao ? vao.centro : Y_ALVO_SEM_CANO;

  // Lembrete: no canvas, o y CRESCE para baixo.
  // Então "yPrevisto > alvo" significa "o pássaro vai estar ABAIXO do alvo".
  return yPrevisto > alvo + MARGEM_ABAIXO_DO_CENTRO;
}
