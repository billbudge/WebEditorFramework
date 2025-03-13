import { getDefaultTheme, CanvasController, PropertyGridController, readFile } from '../../src/diagrams.js';
import { StatechartEditor } from './statecharts.js';
(function () {
    const body = document.getElementById('body'), canvas = document.getElementById('canvas'), palette = document.getElementById('palette');
    if (body && canvas && palette) {
        body.style.overscrollBehaviorY = 'contain';
        body.style.touchAction = 'pinch-zoom';
        const theme = getDefaultTheme(), // or getBlueprintTheme
        canvasController = new CanvasController(canvas), paletteController = new CanvasController(palette, true /* draggable */), propertyGridController = new PropertyGridController(body, theme), editor = new StatechartEditor(theme, canvasController, paletteController, propertyGridController);
        palette.style.borderColor = theme.strokeColor;
        palette.style.borderStyle = 'solid';
        palette.style.borderWidth = '0.25px';
        canvas.style.backgroundColor = theme.bgColor;
        canvasController.configure([editor]);
        canvasController.setSize(window.innerWidth, window.innerHeight);
        paletteController.configure([editor]);
        paletteController.setSize(150, 100);
        window.onbeforeunload = function () {
            return "Confirm unload?";
        };
        window.onresize = function () {
            paletteController.onWindowResize();
            canvasController.onWindowResize();
        };
        const openFileInput = document.getElementById("open-file-input");
        if (openFileInput) {
            openFileInput.addEventListener("change", (event) => {
                readFile(event, editor.openFile.bind(editor));
            });
        }
        document.addEventListener('keydown', function (e) {
            // Handle any keyboard commands for the app window here.
            canvasController.onKeyDown(e);
        });
        document.addEventListener('keyup', function (e) {
            canvasController.onKeyUp(e);
        });
        const fileMenu = document.getElementById('file'), editMenu = document.getElementById('edit'), examplesMenu = document.getElementById('examples');
        function selectListener(e) {
            const target = e.target, command = idToCommand(target.value);
            if (command) {
                target.selectedIndex = 0;
                if (target === fileMenu) {
                    switch (command) {
                        case 'new':
                            editor.openNewContext();
                            break;
                        case 'open':
                            openFileInput.click();
                            break;
                        case 'save':
                            editor.saveFile();
                            break;
                        case 'print':
                            editor.print();
                            break;
                    }
                }
                else {
                    editor.doCommand(command);
                }
            }
        }
        function idToCommand(id) {
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
                case 'new': return 'new';
                case 'open': return 'open';
                case 'save': return 'save';
                case 'print': return 'print';
            }
        }
        function buttonListener(e) {
            const target = e.target, command = idToCommand(target.id);
            if (command) {
                editor.doCommand(command);
            }
        }
        document.getElementById('undo').addEventListener('click', buttonListener);
        document.getElementById('redo').addEventListener('click', buttonListener);
        document.getElementById('delete').addEventListener('click', buttonListener);
        document.getElementById('extend').addEventListener('click', buttonListener);
        fileMenu.addEventListener('change', selectListener);
        editMenu.addEventListener('change', selectListener);
        examplesMenu.addEventListener('change', event => {
            const select = event.target;
            const id = select.value, fileName = id + '.txt';
            select.selectedIndex = 0;
            fetch(fileName)
                .then(response => response.text())
                .then(text => editor.openNewContext(text, fileName));
        });
    }
})();
//# sourceMappingURL=statechart_example.js.map