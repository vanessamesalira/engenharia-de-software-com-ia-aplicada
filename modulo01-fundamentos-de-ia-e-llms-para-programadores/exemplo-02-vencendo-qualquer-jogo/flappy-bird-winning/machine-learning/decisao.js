// =============================================================================
// decisao.js — o "cérebro": com o pássaro e o vão em mãos, pula ou não pula?
//
// Este é o arquivo para EXPERIMENTAR: mexendo nas constantes abaixo você
// "ensina" a IA a jogar melhor ou pior.
// =============================================================================

// -----------------------------------------------------------------------------
// A física do jogo (tirada de js/entities/entities.js)
// -----------------------------------------------------------------------------

// A "caixa de colisão" do pássaro é declarada como uma elipse de 71 x 51,
// centralizada no desenho (new me.Ellipse(5, 5, 71, 51) em
// js/entities/entities.js). O y que vem do passaro.js já é o centro dela.
//
// MAS: nas mortes medidas, o pássaro batia no cano com ~10 px de folga
// "sobrando". O MelonJS 4 testa elipse contra retângulo tratando a elipse
// como um CÍRCULO do raio maior (71 / 2 = 35,5). Na prática, a colisão tem
// 71 de altura, não 51.
const MEIA_ALTURA_COLISAO = 35.5;

const ALTURA_PULO = 72; // cada pulo leva o pássaro 72 px para cima

// Gravidade: a cada frame (~16,7 ms) a velocidade de queda aumenta 0,2 px/frame.
// Convertendo para px/ms²:
const GRAVIDADE = 0.2 / (16.7 * 16.7);

// O chão começa em y = 504 (600 de tela - 96 de chão)
const Y_CHAO = 504;

// A JANELA para pular: o vão (176) menos a colisão (71) menos o pulo (72)
// deixa só 33 px onde dá para pular sem bater em nada:
//   - pular muito cedo  → depois de subir 72, a cabeça bate no cano de cima
//   - pular muito tarde → a barriga já encostou no cano de baixo
// O mais seguro é mirar o MEIO dessa janela: o centro da colisão a ~52 px
// acima do fundo do vão. Assim sobram ~16 px de folga para cada lado.
//   menor = pula mais em cima da hora (risco no cano de baixo)
//   maior = pula mais cedo (risco no cano de cima)
const PONTO_DE_PULO = 52;

// Folga mínima do cano de CIMA depois de pular (px).
// Se pular agora fosse bater em cima, ela espera.
const FOLGA_CANO_CIMA = 2;

// Tempo até a próxima chance de decidir (~o tempo do YOLO analisar um print)
const PROXIMA_DECISAO_MS = 60;

// Sem cano à vista: mantém a colisão do pássaro nesta faixa da tela
const ALVO_SEM_CANO = { topo: 150, fim: 380 };

// O cano de CIMA só é um perigo quando o cano já está chegando no pássaro.
// Enquanto ele está longe, o único "teto" é sair pelo topo da tela (y < -80).
// A colisão do pássaro termina em x ≈ 100, e o cano anda ~0,3 px/ms.
// Depois de um pulo, o pássaro leva ~450 ms para cair de volta os 72 px:
// nesse tempo o cano anda ~135 px. Então o teto precisa valer desde que o
// cano esteja a menos de ~280 px, senão um pulo "solto" faz ele chegar alto demais.
const X_CANO_PERTO = 280;
const TETO_DA_TELA = -50;

// -----------------------------------------------------------------------------

// O pulo é uma animação de ~50 ms, e o jogo só lê a tecla no próximo frame.
// A queda "recomeça do zero" mais ou menos esse tempo depois de apertar.
const INICIO_DA_QUEDA_APOS_PULO_MS = 60;
const VELOCIDADE_INICIAL = 0.2 / 16.7; // 0,2 px/frame logo depois do pulo

// Velocidade de queda (px/ms; positivo = caindo).
//
// Primeira ideia: medir pela diferença entre duas leituras do YOLO. Não
// funcionou bem: cada leitura tem ~4 px de ruído e elas são muito próximas
// (~50 ms), então a velocidade saía MUITO errada (ex.: 0 com o pássaro caindo).
//
// Solução: a física do jogo é conhecida! Depois de cada pulo, a velocidade só
// depende do TEMPO desde o pulo: v = v0 + gravidade · t. O YOLO dá a posição;
// o relógio dá a velocidade.
//
// Antes do primeiro pulo (não sabemos quando a queda começou), usamos a
// diferença entre leituras mesmo.
function calcularVelocidade(momentoDoPrint, momentoDoUltimoPulo, leituraAtual, leituraAnterior) {
  if (momentoDoUltimoPulo > 0) {
    const tempoCaindo = momentoDoPrint - momentoDoUltimoPulo - INICIO_DA_QUEDA_APOS_PULO_MS;
    return VELOCIDADE_INICIAL + GRAVIDADE * Math.max(0, tempoCaindo);
  }
  if (!leituraAnterior) return 0;
  const tempo = leituraAtual.momento - leituraAnterior.momento;
  if (tempo <= 0) return 0;
  return (leituraAtual.y - leituraAnterior.y) / tempo;
}

// Onde o centro da colisão vai estar daqui a `ms` milissegundos.
// Física de queda livre: y + v·t + ½·g·t²
function preverColisao(y, velocidade, ms) {
  return y + velocidade * ms + 0.5 * GRAVIDADE * ms * ms;
}

// Decide se pula.
//   y           → centro do pássaro visto pelo YOLO (já calibrado)
//   velocidade  → px/ms
//   atrasoMs    → quanto tempo já passou desde o print (o pássaro já se mexeu!)
//   vao         → { topo, fim } do próximo cano, ou null
// Devolve { pular, motivo } — o motivo aparece no log para entender a decisão.
function decidir({ y, velocidade, atrasoMs }, vao) {
  const alvo = vao ?? ALVO_SEM_CANO;
  const fundo = Math.min(alvo.fim, Y_CHAO);

  // Teto: o cano de cima, se ele já estiver perto; senão, só o topo da tela
  const canoPerto = vao && vao.canoInicio < X_CANO_PERTO;
  const teto = canoPerto ? alvo.topo : TETO_DA_TELA;

  // Onde a colisão está AGORA (o print já tem alguns ms de idade)...
  const centroAgora = preverColisao(y, velocidade, atrasoMs);
  // ...e onde vai estar na próxima chance de decidir
  const centroProximo = preverColisao(y, velocidade, atrasoMs + PROXIMA_DECISAO_MS);

  // 1. Se pular agora, a "cabeça" da colisão bate no cano de cima? Então não.
  const cabecaDepoisDoPulo = centroAgora - ALTURA_PULO - MEIA_ALTURA_COLISAO;
  if (cabecaDepoisDoPulo < teto + FOLGA_CANO_CIMA) {
    return { pular: false, motivo: "esperando (pular agora bateria em cima)" };
  }

  // 2. Chegou no ponto de pulo (o meio da janela segura)? Pula.
  const pontoDePulo = fundo - PONTO_DE_PULO;
  if (centroAgora >= pontoDePulo) {
    return { pular: true, motivo: "chegou no ponto de pulo" };
  }

  // 3. Ainda não chegou, mas vai chegar ANTES da próxima decisão?
  //    A IA só decide quando o YOLO termina (~a cada 55 ms), e nesse tempo o
  //    pássaro cai até ~18 px: numa janela de 33 px, isso é muito.
  //    Como a física é conhecida, dá para calcular o milissegundo exato em
  //    que ele vai chegar no ponto e AGENDAR o pulo para esse instante.
  if (centroProximo >= pontoDePulo) {
    const ms = msAteChegar(centroAgora, velocidade + GRAVIDADE * atrasoMs, pontoDePulo);
    return { pular: false, agendarEmMs: ms, motivo: `pulo agendado em ${Math.round(ms)}ms` };
  }

  return { pular: false, motivo: "" };
}

// Quantos ms até o centro sair de `y` (com velocidade `v`) e chegar em `alvo`.
// Resolve  y + v·t + ½·g·t² = alvo  (a fórmula de Bhaskara, com t positivo).
function msAteChegar(y, v, alvo) {
  const d = alvo - y;
  if (d <= 0) return 0;
  return (-v + Math.sqrt(v * v + 2 * GRAVIDADE * d)) / GRAVIDADE;
}
