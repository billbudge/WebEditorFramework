import { getDefaultTheme, CanvasController, PropertyGridController } from '../../src/diagrams.js'
import { FunctionchartEditor } from '../../examples/functioncharts/functioncharts.js'

(function() {

  const body = document.getElementById('body'),
        canvas = document.getElementById('canvas'),
        palette = document.getElementById('palette'),
        selectExample = document.getElementById('select-example');
  if (body && canvas && palette) {

    body.style.overscrollBehaviorY = 'contain';
    body.style.touchAction = 'pinch-zoom';

    const theme = getDefaultTheme(),  // or getBlueprintTheme
          canvasController = new CanvasController(canvas as HTMLCanvasElement),
          paletteController = new CanvasController(palette as HTMLCanvasElement, true /* draggable */),
          propertyGridController = new PropertyGridController(body, theme),
          functionchartEditor = new FunctionchartEditor(
              theme, canvasController, paletteController, propertyGridController);

    palette.style.borderColor = theme.strokeColor;
    palette.style.borderStyle = 'solid';
    palette.style.borderWidth = '0.25px';
    canvas.style.backgroundColor = theme.bgColor;

    canvasController.configure([functionchartEditor]);
    canvasController.setSize(window.innerWidth, window.innerHeight);
    paletteController.configure([functionchartEditor]);
    paletteController.setSize(324, 128);

    window.onbeforeunload = function() {
      return "Confirm unload?";
    }

    window.onresize = function() {
      paletteController.onWindowResize();
      canvasController.onWindowResize();
    }

    document.addEventListener('keydown', function(e) {
      // Handle any keyboard commands for the app window here.
      canvasController.onKeyDown(e);
    });

    document.addEventListener('keyup', function(e) {
      canvasController.onKeyUp(e);
    });

    selectExample!.addEventListener('change', event => {
      const id = (event.target! as HTMLSelectElement).value as string,
            fileName = id + '.txt';
      fetch(fileName)
        .then(response => response.text())
        .then(text => functionchartEditor.openNewContext(text));
    });
  }
})();
