import { getDefaultTheme, CanvasController, PropertyGridController } from '../../src/diagrams.js'
import { StatechartEditor, EditorCommand } from './statecharts.js'

(function() {

  const body = document.getElementById('body'),
        canvas = document.getElementById('canvas'),
        palette = document.getElementById('palette');
  if (body && canvas && palette) {

    body.style.overscrollBehaviorY = 'contain';
    body.style.touchAction = 'pinch-zoom';

    const theme = getDefaultTheme(),  // or getBlueprintTheme
          canvasController = new CanvasController(canvas as HTMLCanvasElement),
          paletteController = new CanvasController(palette as HTMLCanvasElement, true /* draggable */),
          propertyGridController = new PropertyGridController(body, theme),
          statechartEditor = new StatechartEditor(
              theme, canvasController, paletteController, propertyGridController);

    palette.style.borderColor = theme.strokeColor;
    palette.style.borderStyle = 'solid';
    palette.style.borderWidth = '0.25px';
    canvas.style.backgroundColor = theme.bgColor;

    canvasController.configure([statechartEditor]);
    canvasController.setSize(window.innerWidth, window.innerHeight);
    paletteController.configure([statechartEditor]);
    paletteController.setSize(150, 100);

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

    function idToCommand(id: string) : EditorCommand | undefined {
      switch (id) {
        case 'undo': return 'undo';
        case 'redo': return 'redo';
        case 'cut': return 'cut';
        case 'copy': return 'copy';
        case 'paste': return 'paste';
        case 'delete': return 'delete';
        case 'group': return 'group';
        case 'extend': return 'extend';
        case 'selectAll': return 'selectAll';
        case 'open': return 'open';
        case 'save': return 'save';
        case 'print': return 'print';
      }
    }

    function buttonListener(e: Event) {
      const target = e.target as HTMLElement,
            command = idToCommand(target.id);
      if (command) {
        statechartEditor.doCommand(command);
      }
    }
    document.getElementById('undo')!.addEventListener('click', buttonListener);
    document.getElementById('redo')!.addEventListener('click', buttonListener);
    document.getElementById('delete')!.addEventListener('click', buttonListener);
    document.getElementById('extend')!.addEventListener('click', buttonListener);

    function selectListener(e: Event) {
      const target = e.target as HTMLSelectElement,
            command = idToCommand(target.value);
      if (command) {
        target.selectedIndex = 0;
        statechartEditor.doCommand(command);
      }
    }

    document.getElementById('file')!.addEventListener('change', selectListener);
    document.getElementById('edit')!.addEventListener('change', selectListener);

    document.getElementById('examples')!.addEventListener('change', event => {
      const select = event.target as HTMLSelectElement;
      const id = select.value,
            fileName = id + '.txt';
      select.selectedIndex = 0;
      fetch(fileName)
        .then(response => response.text())
        .then(text => statechartEditor.createContext(text));
    });
  }
})();
