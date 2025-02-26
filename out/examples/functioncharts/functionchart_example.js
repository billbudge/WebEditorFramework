import { getDefaultTheme, CanvasController, PropertyGridController } from '../../src/diagrams.js';
import { FunctionchartEditor } from './functioncharts.js';
(function () {
    const body = document.getElementById('body'), canvas = document.getElementById('canvas'), palette = document.getElementById('palette');
    if (body && canvas && palette) {
        body.style.overscrollBehaviorY = 'contain';
        body.style.touchAction = 'pinch-zoom';
        const theme = getDefaultTheme(), // or getBlueprintTheme
        canvasController = new CanvasController(canvas), paletteController = new CanvasController(palette, true /* draggable */), propertyGridController = new PropertyGridController(body, theme), functionchartEditor = new FunctionchartEditor(theme, canvasController, paletteController, propertyGridController);
        palette.style.borderColor = theme.strokeColor;
        palette.style.borderStyle = 'solid';
        palette.style.borderWidth = '0.25px';
        canvas.style.backgroundColor = theme.bgColor;
        canvasController.configure([functionchartEditor]);
        canvasController.setSize(window.innerWidth, window.innerHeight);
        paletteController.configure([functionchartEditor]);
        paletteController.setSize(324, 128);
        {
            function fn_3(p_8_0, p_7_0) {
                const v_10 = 1;
                const v_9 = p_8_0 <= 1;
                let v_4;
                if (v_9) {
                    v_4 = p_7_0;
                }
                else {
                    let r_12_0 = fn_13(p_8_0);
                    const v_6 = p_8_0 * p_7_0;
                    let r_11_0 = fn_3(r_12_0, v_6);
                    v_4 = r_11_0;
                }
                ;
                return v_4;
            }
            function fn_13(p_14_0) {
                const v_15 = 1;
                const v_14 = p_14_0 - 1;
                return v_14;
            }
            function fn_16(p_17_0) {
                const v_18 = 1;
                let r_17_0 = fn_3(p_17_0, 1);
                return r_17_0;
            }
            console.log(fn_16(5));
        }
        window.onbeforeunload = function () {
            return "Confirm unload?";
        };
        window.onresize = function () {
            paletteController.onWindowResize();
            canvasController.onWindowResize();
        };
        document.addEventListener('keydown', function (e) {
            // Handle any keyboard commands for the app window here.
            canvasController.onKeyDown(e);
        });
        document.addEventListener('keyup', function (e) {
            canvasController.onKeyUp(e);
        });
        function idToCommand(id) {
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
        }
        function buttonListener(e) {
            const target = e.target, command = idToCommand(target.id);
            if (command) {
                functionchartEditor.doCommand(command);
            }
        }
        document.getElementById('undo').addEventListener('click', buttonListener);
        document.getElementById('redo').addEventListener('click', buttonListener);
        document.getElementById('delete').addEventListener('click', buttonListener);
        document.getElementById('complete').addEventListener('click', buttonListener);
        document.getElementById('extend').addEventListener('click', buttonListener);
        function selectListener(e) {
            const target = e.target, command = idToCommand(target.value);
            if (command) {
                target.selectedIndex = 0;
                functionchartEditor.doCommand(command);
            }
        }
        document.getElementById('file').addEventListener('change', selectListener);
        document.getElementById('edit').addEventListener('change', selectListener);
        document.getElementById('modify').addEventListener('change', selectListener);
        document.getElementById('examples').addEventListener('change', e => {
            const select = e.target, id = select.value, fileName = id + '.txt';
            select.selectedIndex = 0;
            fetch(fileName)
                .then(response => response.text())
                .then(text => functionchartEditor.openNewContext(text));
        });
    }
})();
//# sourceMappingURL=functionchart_example.js.map