import { getDefaultTheme, CanvasController, PropertyGridController, FileInputElement, UIErrorReporter, ConsoleErrorReporter } from '../../src/diagrams.js'
import { FunctionchartEditor, EditorCommand } from './functioncharts.js'

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
          openFileInput = document.getElementById('open-file-input'),
          fileInput = new FileInputElement(openFileInput as HTMLInputElement),
          errorBox = document.getElementById('errors');

          const errorReporter = (errorBox) ? new UIErrorReporter(errorBox) : new ConsoleErrorReporter();
          const editor = new FunctionchartEditor(
              theme, canvasController, paletteController, propertyGridController, fileInput, errorReporter);

    palette.style.borderColor = theme.strokeColor;
    palette.style.borderStyle = 'solid';
    palette.style.borderWidth = '0.25px';
    canvas.style.backgroundColor = theme.bgColor;

    canvasController.configure([editor]);
    canvasController.setSize(window.innerWidth, window.innerHeight);
    paletteController.configure([editor]);
    paletteController.setSize(324, 128);

    {
    }

    window.onbeforeunload = function() {
      return 'Confirm unload?';
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
        case 'complete': return 'complete';
        case 'extend': return 'extend';
        case 'selectAll': return 'selectAll';
        case 'import': return 'import';
        case 'export': return 'export';
        case 'constructor': return 'constructor';
        case 'upcast': return 'upCast';
        case 'downcast': return 'downCast';
        case 'abstract': return 'abstract';
        case 'abstractFunctionchart': return 'abstractFunctionchart';
        case 'new': return 'new';
        case 'open': return 'open';
        case 'openImport': return 'openImport';
        case 'save': return 'save';
        case 'print': return 'print';
      }
      // default returns undefined
    }

    function buttonListener(e: InputEvent) {
      const target = e.target as HTMLElement,
            command = idToCommand(target.id);
      if (command) {
        editor.doCommand(command);
      }
    }
    document.getElementById('undo')!.addEventListener('click', buttonListener);
    document.getElementById('redo')!.addEventListener('click', buttonListener);
    document.getElementById('delete')!.addEventListener('click', buttonListener);

    const fileMenu = document.getElementById('file'),
          editMenu = document.getElementById('edit'),
          modifyMenu = document.getElementById('modify'),
          examplesMenu = document.getElementById('examples');

    function selectListener(e: InputEvent) {
      const target = e.target as HTMLSelectElement,
            command = idToCommand(target.value);
      if (command) {
        target.selectedIndex = 0;
        editor.doCommand(command);
      }
    }

    fileMenu!.addEventListener('change', selectListener);
    editMenu!.addEventListener('change', selectListener);
    modifyMenu!.addEventListener('change', selectListener);

    examplesMenu!.addEventListener('change', e => {
      const select = e.target as HTMLSelectElement,
            id = select.value,
            fileName = id + '.txt';
      select.selectedIndex = 0;
      fetch(fileName)
        .then(response => response.text())
        .then(text => editor.openNewContext(text, fileName));
    });
  }
})();
