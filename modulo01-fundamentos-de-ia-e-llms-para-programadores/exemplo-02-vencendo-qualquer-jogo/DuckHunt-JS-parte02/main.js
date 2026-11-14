import main from './machine-learning/main';
import Game from './src/modules/Game';

document.addEventListener('DOMContentLoaded', async function () {
  const game = new Game({
    spritesheet: 'sprites.json'
  });
  await game.load();

  // Abra com ?ai=off para jogar manualmente, sem a IA atirando
  const aiEnabled = new URLSearchParams(window.location.search).get('ai') !== 'off';
  if (aiEnabled) {
    await main(game);
  }

}, false);
