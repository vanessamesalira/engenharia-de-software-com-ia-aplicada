import { Rectangle } from 'pixi.js';
import { buildLayout } from "./layout";

export default async function main(game) {
    const container = buildLayout(game.app);
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    game.stage.aim.visible = false;

    worker.onmessage = ({ data }) => {
        const { type, x, y } = data;

        if (type === 'prediction') {
            console.log(`🎯 AI predicted at: (${x}, ${y})`);
            container.updateHUD(data);
            game.stage.aim.visible = true;

            // x/y vêm em pixels da tela; a mira vive no espaço 800x600 do stage
            const global = { x: data.x, y: data.y };
            const local = game.stage.toLocal(global);
            game.stage.aim.setPosition(local.x, local.y);

            game.handleClick({ global });

        }

    };

    setInterval(async () => {
        // captura exatamente a área visível, para as coordenadas baterem com a tela
        const { width, height } = game.app.screen;
        const canvas = game.app.renderer.extract.canvas({
            target: game.app.stage,
            frame: new Rectangle(0, 0, width, height),
        });
        const bitmap = await createImageBitmap(canvas);

        worker.postMessage({
            type: 'predict',
            image: bitmap,
        }, [bitmap]);

    }, 200); // every 200ms

    return container;
}
