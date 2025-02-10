// Useful diagram stuff.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as geometry from '../src/geometry.js';
export function roundRectPath(x, y, width, height, r, ctx) {
    r = Math.min(r, width * 0.5, height * 0.5);
    let right = x + width, bottom = y + height;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, bottom - r);
    ctx.quadraticCurveTo(x, bottom, x + r, bottom);
    ctx.lineTo(right - r, bottom);
    ctx.quadraticCurveTo(right, bottom, right, bottom - r);
    ctx.lineTo(right, y + r);
    ctx.quadraticCurveTo(right, y, right - r, y);
    ctx.lineTo(x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
}
export function rectParamToPoint(left, top, width, height, t) {
    let right = left + width, bottom = top + height, x0, y0, nx, ny, dx = 0, dy = 0;
    if (t < 2) { // + side
        if (t < 1) { // right
            x0 = right;
            y0 = top;
            dy = height;
            nx = 1;
            ny = 0;
        }
        else { // bottom
            y0 = bottom;
            x0 = right;
            dx = -width;
            t -= 1;
            nx = 0;
            ny = 1;
        }
    }
    else { // - side
        if (t < 3) { // left
            x0 = left;
            y0 = bottom;
            dy = -height;
            t -= 2;
            nx = -1;
            ny = 0;
        }
        else { // top
            y0 = top;
            x0 = left;
            dx = width;
            t -= 3;
            nx = 0;
            ny = -1;
        }
    }
    return { x: x0 + dx * t,
        y: y0 + dy * t,
        nx: nx,
        ny: ny
    };
}
export function circleParamToPoint(cx, cy, r, t) {
    let rads = ((t - 0.5) / 4) * 2 * Math.PI, nx = Math.cos(rads), ny = Math.sin(rads);
    return { x: cx + nx * r,
        y: cy + ny * r,
        nx: nx,
        ny: ny
    };
}
export function roundRectParamToPoint(left, top, width, height, r, t) {
    let right = left + width, bottom = top + height, wr = r / width, hr = r / height, omwr = 1 - wr, omhr = 1 - hr, tc;
    if (t < 2) { // + side
        if (t < 1) { // right
            if (t < hr)
                return circleParamToPoint(right - r, top + r, r, t / hr * 0.5);
            else if (t > omhr)
                return circleParamToPoint(right - r, bottom - r, r, (t - omhr) / hr * 0.5 + 0.5);
        }
        else { // bottom
            tc = t - 1;
            if (tc < wr)
                return circleParamToPoint(right - r, bottom - r, r, tc / wr * 0.5 + 1.0);
            else if (tc > omwr)
                return circleParamToPoint(left + r, bottom - r, r, (tc - omwr) / wr * 0.5 + 1.5);
        }
    }
    else { // - side
        if (t < 3) { // left
            tc = t - 2;
            if (tc < hr)
                return circleParamToPoint(left + r, bottom - r, r, tc / hr * 0.5 + 2.0);
            else if (tc > omhr)
                return circleParamToPoint(left + r, top + r, r, (tc - omhr) / hr * 0.5 + 2.5);
        }
        else { // top
            tc = t - 3;
            if (tc < wr)
                return circleParamToPoint(left + r, top + r, r, tc / wr * 0.5 + 3.0);
            else if (tc > omwr)
                return circleParamToPoint(right - r, top + r, r, (tc - omwr) / wr * 0.5 + 3.5);
        }
    }
    return rectParamToPoint(left, top, width, height, t);
}
export function circlePointToParam(cx, cy, p) {
    return ((Math.PI - Math.atan2(p.y - cy, cx - p.x)) / (2 * Math.PI) * 4 + 0.5) % 4;
}
export function rectPointToParam(left, top, width, height, p) {
    // translate problem to one with origin at center of rect
    let dx = width / 2, dy = height / 2, cx = left + dx, cy = top + dy, px = p.x - cx, py = p.y - cy;
    // rotate problem into quadrant 0
    // use "PerpDot" product to determine relative orientation
    // (Graphics Gems IV, page 138)
    let result, temp;
    if (dy * px + dx * py > 0) { // quadrant 0 or 1
        if (-dy * px + dx * py < 0) { // quadrant 0
            result = 0;
        }
        else { // quadrant 1
            result = 1;
            temp = px;
            px = -py;
            py = temp;
            temp = dx;
            dx = dy;
            dy = temp;
        }
    }
    else { // quadrant 2 or 3
        if (dy * px + -dx * py < 0) { // quadrant 2
            result = 2;
            px = -px;
            py = -py;
        }
        else { // quadrant 3
            result = 3;
            temp = py;
            py = -px;
            px = temp;
            temp = dx;
            dx = dy;
            dy = temp;
        }
    }
    let y = dx * py / px;
    result += (y + dy) / (dy * 2);
    return result;
}
export function diskPath(x, y, r, ctx) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
}
export function getEdgeBezier(p1, p2, scaleFactor) {
    let dx = p1.x - p2.x, dy = p1.y - p2.y, nx1 = p1.nx || 0, ny1 = p1.ny || 0, nx2 = p2.nx || 0, ny2 = p2.ny || 0, 
    // dot = nx1 * -nx2 + ny1 * -ny2,
    // scale = (2 - dot) * (scaleFactor || 32),
    scale = scaleFactor || Math.sqrt(dx * dx + dy * dy) * 0.3, c1 = { x: p1.x + scale * nx1, y: p1.y + scale * ny1 }, c2 = { x: p2.x + scale * nx2, y: p2.y + scale * ny2 };
    return [p1, c1, c2, p2];
}
export function arrowPath(p, ctx, arrowSize) {
    let cos45 = 0.866, sin45 = 0.500, nx = p.nx, ny = p.ny;
    ctx.moveTo(p.x + arrowSize * (nx * cos45 - ny * sin45), p.y + arrowSize * (nx * sin45 + ny * cos45));
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + arrowSize * (nx * cos45 + ny * sin45), p.y + arrowSize * (ny * cos45 - nx * sin45));
}
export function lineEdgePath(p1, p2, ctx, arrowSize) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    if (arrowSize)
        arrowPath(p2, ctx, arrowSize);
}
export function bezierEdgePath(bezier, ctx, arrowSize) {
    let p1 = bezier[0], c1 = bezier[1], c2 = bezier[2], p2 = bezier[3];
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
    if (arrowSize)
        arrowPath(p2, ctx, arrowSize);
}
export function inFlagPath(x, y, width, height, indent, ctx) {
    let right = x + width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(right, y);
    ctx.lineTo(right, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + indent, y + height / 2);
    ctx.lineTo(x, y);
}
export function outFlagPath(x, y, width, height, indent, ctx) {
    let right = x + width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(right - indent, y);
    ctx.lineTo(right, y + height / 2);
    ctx.lineTo(right - indent, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y);
}
export function notchedRectPath(x, y, width, height, notch, ctx) {
    const right = x + width, bottom = y + height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(right - notch, y);
    ctx.lineTo(right, y + notch);
    ctx.lineTo(right, bottom);
    ctx.lineTo(x, bottom);
    ctx.lineTo(x, y);
}
export function closedPath(points, ctx) {
    ctx.beginPath();
    let length = points.length, pLast = points[length - 1];
    ctx.moveTo(pLast.x, pLast.y);
    for (let i = 0; i < length; i++) {
        let pi = points[i];
        ctx.lineTo(pi.x, pi.y);
    }
}
// Check if p is within tolerance of (x, y). Useful for knobbies.
export function hitPoint(x, y, p, tol) {
    return Math.abs(x - p.x) <= tol && Math.abs(y - p.y) <= tol;
}
export function hitTestRect(x, y, width, height, p, tol) {
    let right = x + width, bottom = y + height, px = p.x, py = p.y;
    if (px > x - tol && px < right + tol &&
        py > y - tol && py < bottom + tol) {
        let hitTop = Math.abs(py - y) < tol, hitLeft = Math.abs(px - x) < tol, hitBottom = Math.abs(py - bottom) < tol, hitRight = Math.abs(px - right) < tol, hitBorder = hitTop || hitLeft || hitBottom || hitRight;
        return {
            top: hitTop,
            left: hitLeft,
            bottom: hitBottom,
            right: hitRight,
            border: hitBorder,
        };
    }
}
export function hitTestDisk(x, y, r, p, tol) {
    const dx = x - p.x, dy = y - p.y, dSquared = dx * dx + dy * dy, inner = Math.max(0, r - tol), outer = r + tol;
    if (dSquared < outer * outer) {
        const border = dSquared > inner * inner;
        return { border: border };
    }
}
export function hitTestLine(p1, p2, p, tol) {
    if (geometry.pointToPointDist(p1, p) < tol) {
        return { p1: true };
    }
    else if (geometry.pointToPointDist(p2, p) < tol) {
        return { p2: true };
    }
    else if (geometry.pointOnSegment(p1, p2, p, tol)) {
        return { edge: true };
    }
}
export function hitTestBezier(bezier, p, tol) {
    const p1 = bezier[0], p2 = bezier[3];
    if (geometry.pointToPointDist(p1, p) < tol) {
        return { x: p1.x, y: p1.y, d: 0, t: 0 };
    }
    else if (geometry.pointToPointDist(p2, p) < tol) {
        return { x: p2.x, y: p2.y, d: 0, t: 1 };
    }
    else {
        const hit = geometry.hitTestBezier(bezier[0], bezier[1], bezier[2], bezier[3], p, tol);
        return hit;
    }
}
//------------------------------------------------------------------------------
function getCanvasScaleFactor(ctx) {
    return window.devicePixelRatio;
}
function getCanvasSize(canvas, ctx) {
    const contextScale = getCanvasScaleFactor(ctx);
    return { width: canvas.width / contextScale, height: canvas.height / contextScale };
}
export function setCanvasSize(canvas, ctx, width, height) {
    const contextScale = getCanvasScaleFactor(ctx);
    canvas.width = width * contextScale;
    canvas.height = height * contextScale;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.resetTransform();
    ctx.scale(contextScale, contextScale);
}
export function measureNameValuePairs(pairs, gap, ctx) {
    let maxWidth = 0;
    pairs.forEach(function (pair) {
        let nameWidth = ctx.measureText(pair.name).width, valueWidth = ctx.measureText(pair.value).width, width = nameWidth + gap + valueWidth;
        maxWidth = Math.max(maxWidth, width);
    });
    return maxWidth;
}
//------------------------------------------------------------------------------
export class Theme {
}
export function getDefaultTheme() {
    return {
        bgColor: 'white',
        altBgColor: '#F0F0F0',
        strokeColor: '#505050',
        textColor: '#505050',
        highlightColor: '#40F040',
        hotTrackColor: 'blue',
        dimColor: '#e0e0e0',
        hoverColor: '#FCF0AD',
        hoverTextColor: '#404040',
        font: '14px monospace',
        fontSize: 14,
    };
}
export function getBlueprintTheme() {
    return {
        bgColor: '#6666cc',
        altBgColor: '#5656aa',
        strokeColor: '#f0f0f0',
        textColor: '#f0f0f0',
        highlightColor: '#40F040',
        hotTrackColor: '#F0F040',
        dimColor: '#808080',
        hoverColor: '#FCF0AD',
        hoverTextColor: '#404040',
        font: '14px monospace',
        fontSize: 14,
    };
}
export class PropertyGridController {
    constructor(container, theme = getDefaultTheme()) {
        this.container = container;
        this.theme = theme;
        this.types = new Map();
        this.active = undefined;
    }
    register(type, properties) {
        const self = this, table = document.createElement('table'), info = {
            properties: properties,
            table: table,
        };
        // TODO better styling
        const style = 'position:fixed; table-layout: fixed; top:300px; left: 0;   padding: 0; margin: 0; border-collapse: collapse; margin: 25px 0; font-size: 0.9em; font-family: sans-serif; box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);';
        table.setAttribute('style', style);
        // table.style = 'position:fixed; table-layout: fixed; top:300px; left: 0;   padding: 0; margin: 0;';
        // 'border-collapse: collapse; margin: 25px 0; font-size: 0.9em; font-family: sans-serif; ';
        // 'box-shadow: 0 0 20px rgba(0, 0, 0, 0.15);';
        // table.style['background-color'] = this.theme.altBgColor;  //TODO fixme
        table.style.display = 'none';
        table.style.visibility = 'hidden';
        properties.forEach(function (propertyInfo, index) {
            const label = propertyInfo.label, labelElement = document.createTextNode(label), type = propertyInfo.type, row = table.insertRow(index), cell1 = row.insertCell(), cell2 = row.insertCell();
            let editingElement = undefined;
            switch (type) {
                case 'text': {
                    const inputElement = document.createElement('input');
                    inputElement.setAttribute('type', 'text');
                    inputElement.addEventListener('change', event => {
                        propertyInfo.setter(propertyInfo, self.item, inputElement.value);
                    });
                    editingElement = inputElement;
                    break;
                }
                case 'boolean': {
                    const inputElement = document.createElement('input');
                    inputElement.setAttribute('type', 'checkbox');
                    inputElement.addEventListener('change', event => {
                        propertyInfo.setter(propertyInfo, self.item, inputElement.checked);
                    });
                    editingElement = inputElement;
                    break;
                }
                case 'enum': {
                    const enumValues = propertyInfo.values;
                    if (enumValues) {
                        const selectElement = document.createElement('select');
                        const values = enumValues.split(',');
                        for (let value of values) {
                            const option = document.createElement('option');
                            option.value = value;
                            option.text = value;
                            selectElement.add(option);
                        }
                        selectElement.addEventListener('change', event => {
                            propertyInfo.setter(propertyInfo, self.item, selectElement.value);
                        });
                        editingElement = selectElement;
                    }
                    break;
                }
            }
            if (editingElement) {
                cell1.appendChild(labelElement);
                cell2.appendChild(editingElement);
            }
        });
        this.types.set(type, info);
        this.container.appendChild(table);
    }
    show(type, item) {
        const active = this.active, typeInfo = type ? this.types.get(type) : undefined;
        // Hide the previous table if it's different.
        if (typeInfo !== active && active) {
            const table = active.table;
            table.style.display = 'none';
            table.style.visibility = 'hidden';
        }
        this.active = typeInfo;
        if (typeInfo) {
            const table = typeInfo.table;
            // Initialize editing control values.
            typeInfo.properties.forEach(function (propertyInfo, index) {
                const row = table.rows[index], cell = row.cells[1], editingElement = cell.children[0], value = propertyInfo.getter(propertyInfo, item);
                if (propertyInfo.type === 'boolean') {
                    editingElement.checked = (value === true);
                }
                else {
                    editingElement.value = value;
                }
            });
            this.item = item;
            table.style.display = 'block';
            table.style.visibility = 'visible';
        }
    }
}
export class CanvasController {
    get translation() { return { x: this.transform[4], y: this.transform[5] }; }
    ;
    get scale() { return { x: this.transform[0], y: this.transform[3] }; }
    ;
    setTransform(translation, scale) {
        let tx = 0, ty = 0, sx = 1, sy = 1;
        if (translation) {
            tx = translation.x;
            ty = translation.y;
        }
        if (scale) {
            sx = scale.x;
            sy = scale.y;
        }
        this.transform = [sx, 0, 0, sy, tx, ty];
        let ooSx = 1.0 / sx, ooSy = 1.0 / sy;
        this.inverseTransform = [ooSx, 0, 0, ooSy, -tx * ooSx, -ty * ooSy];
        this.cancelHover_();
    }
    applyTransform() {
        let t = this.transform;
        this.ctx.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
    }
    viewToCanvas(p) {
        return geometry.matMulPt(p, this.inverseTransform);
    }
    canvasToView(p) {
        return geometry.matMulPt(p, this.transform);
    }
    offsetToOtherCanvas(canvasController) {
        const rect = this.getClientRect(), otherRect = canvasController.getClientRect();
        return { x: otherRect.left - rect.left, y: otherRect.top - rect.top };
    }
    viewToOtherCanvasView(canvasController, p) {
        // TODO this can be simplified to have a single return.
        if (canvasController === this) {
            return this.viewToCanvas(p);
        }
        else {
            const offset = this.offsetToOtherCanvas(canvasController);
            p = { x: p.x + offset.x, y: p.y + offset.y };
            return canvasController.viewToCanvas(p);
        }
    }
    draw() {
        const self = this, ctx = this.ctx, layers = this.layers, length = layers.length;
        function draw() {
            const size = self.getSize();
            ctx.clearRect(0, 0, size.width, size.height);
            // Draw layers in reverse order.
            for (let i = length - 1; i >= 0; i--) {
                let layer = layers[i];
                if (layer.draw)
                    layer.draw(self);
            }
        }
        window.requestAnimationFrame(draw);
    }
    onPointerDown(e) {
        e.preventDefault();
        this.canvas.focus({ preventScroll: true });
        this.initialClientX = e.clientX;
        this.initialClientY = e.clientY;
        const self = this, alt = (e.button !== 0);
        this.pointer = this.clickPointer = this.getPointerPosition(e);
        this.shiftKeyDown = e.shiftKey;
        this.cmdKeyDown = e.ctrlKey || e.metaKey;
        // Call layers until one returns true.
        this.layers.some(function (layer) {
            if (!layer.onClick(self))
                return false;
            // Layers that return true from onClick must implement onBeginDrag, etc.
            self.clickOwner = layer;
            return true;
        });
        if (!this.clickOwner && this.draggable) {
            this.clickOwner = this;
        }
        if (this.clickOwner) {
            this.canvas.setPointerCapture(e.pointerId);
        }
        this.cancelHover_();
        this.draw();
        return this.clickOwner;
    }
    onPointerMove(e) {
        e.preventDefault();
        this.clientX = e.clientX;
        this.clientY = e.clientY;
        let pointer = this.pointer = this.getPointerPosition(e), click = this.clickPointer;
        if (this.clickOwner) {
            let dx = pointer.x - click.x, dy = pointer.y - click.y;
            if (!this.isDragging) {
                this.isDragging = Math.abs(dx) >= this.dragThreshold ||
                    Math.abs(dy) >= this.dragThreshold;
                if (this.isDragging) {
                    this.cancelHover_();
                    this.clickOwner.onBeginDrag(this);
                }
            }
            if (this.isDragging) {
                this.clickOwner.onDrag(this);
                this.draw();
            }
        }
        if (!this.isDragging)
            this.startHover_();
        return this.clickOwner;
    }
    onPointerUp(e) {
        e.preventDefault();
        this.pointer = this.getPointerPosition(e);
        if (this.isDragging) {
            this.isDragging = false;
            if (this.clickOwner)
                this.clickOwner.onEndDrag(this);
            this.draw();
        }
        this.clickOwner = undefined;
        return false;
    }
    // A draggable canvas sets itself as the click owner, so must implement
    // onBeginDrag, onDrag, and onEndDrag.
    moveCanvas() {
        const canvas = this.canvas, newX = this.canvasRect.x + (this.clientX - this.initialClientX), newY = this.canvasRect.y + (this.clientY - this.initialClientY);
        canvas.style.left = newX + "px";
        canvas.style.top = newY + "px";
    }
    onBeginDrag() {
        this.canvasRect = this.canvas.getBoundingClientRect();
        this.moveCanvas();
    }
    onDrag() {
        this.moveCanvas();
    }
    onEndDrag() {
    }
    startHover_() {
        let self = this;
        if (this.hovering)
            this.cancelHover_();
        this.hovering = window.setTimeout(function () {
            self.layers.some(function (layer) {
                if (!layer.onBeginHover(self))
                    return false;
                // Layers that return true from onBeginHover must implement onEndHover.
                self.hoverOwner = layer;
                self.hovering = 0;
                self.draw();
                return true;
            });
        }, this.hoverTimeout);
    }
    cancelHover_() {
        if (this.hovering) {
            window.clearTimeout(this.hovering);
            this.hovering = 0;
        }
        if (this.hoverOwner) {
            this.hoverOwner.onEndHover(this);
            this.hoverOwner = undefined;
            this.draw();
        }
    }
    onKeyDown(e) {
        // Don't route key events to canvas layers if there is a focused control.
        if (document.activeElement !== this.canvas)
            return false;
        let self = this;
        this.shiftKeyDown = e.shiftKey;
        this.cmdKeyDown = e.ctrlKey || e.metaKey;
        this.layers.some(function (layer) {
            if (!layer.onKeyDown(e))
                return false;
            // Layers that return true from onClick must implement onBeginDrag, onDrag,
            // and onEndDrag.
            self.keyOwner = layer;
            self.draw();
            e.preventDefault();
            return true;
        });
        this.cancelHover_();
        return this.keyOwner;
    }
    onKeyUp(e) {
        this.shiftKeyDown = e.shiftKey;
        this.cmdKeyDown = e.ctrlKey || e.metaKey;
        let keyOwner = this.keyOwner;
        if (keyOwner) {
            if (keyOwner.onKeyUp)
                keyOwner.onKeyUp(e);
            this.keyOwner = undefined;
            return false;
        }
    }
    getCanvas() {
        return this.canvas;
    }
    getCtx() {
        return this.ctx;
    }
    getSize() {
        return getCanvasSize(this.canvas, this.ctx);
    }
    setSize(width, height) {
        this.canvasRect.width = width;
        this.canvasRect.height = height;
        setCanvasSize(this.canvas, this.ctx, width, height);
        this.draw();
    }
    onWindowResize() {
        setCanvasSize(this.canvas, this.ctx, this.canvasRect.width, this.canvasRect.height);
        this.draw();
    }
    getClientRect() {
        return this.canvas.getBoundingClientRect();
    }
    getPointerPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    getCurrentPointerPosition() {
        return this.pointer;
    }
    getClickPointerPosition() {
        return this.clickPointer;
    }
    constructor(canvas, draggable = false) {
        this.transform = [1, 0, 0, 1, 0, 0];
        this.inverseTransform = [1, 0, 0, 1, 0, 0];
        this.pointer = { x: 0, y: 0 };
        this.dragThreshold = 4;
        this.hoverTimeout = 500; // milliseconds
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.canvasRect = canvas.getBoundingClientRect();
        this.draggable = draggable;
        canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
        canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    }
    configure(layers) {
        this.layers = layers.slice(0);
        const length = this.layers.length;
        for (let i = 0; i < length; i++) {
            const layer = this.layers[i];
            if (layer.initialize)
                layer.initialize(this, i);
        }
        // Layers are presented in draw order, but most loops assume hit test order, so
        // reverse the array here.
        this.layers.reverse();
    }
}
const defaultFileTypes = [
    {
        description: 'Text file',
        accept: { 'text/plain': ['.txt'] },
    }
];
export class FileController {
    constructor(types = defaultFileTypes, excludeAcceptAllOption = false) {
        this.types = types;
        this.excludeAcceptAllOption = excludeAcceptAllOption;
    }
    getWriteFileHandle(suggestedName) {
        return __awaiter(this, void 0, void 0, function* () {
            const opts = {
                types: this.types,
                excludeAcceptAllOption: this.excludeAcceptAllOption,
                suggestedName: suggestedName,
            };
            return yield window.showSaveFilePicker(opts);
        });
    }
    saveFile(fileHandle, contents) {
        return __awaiter(this, void 0, void 0, function* () {
            const writable = yield fileHandle.createWritable();
            yield writable.write(contents);
            yield writable.close();
        });
    }
    saveUnnamedFile(contents, suggestedName) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileHandle = yield this.getWriteFileHandle(suggestedName);
            yield this.saveFile(fileHandle, contents);
        });
    }
    getReadFileHandle() {
        return __awaiter(this, void 0, void 0, function* () {
            const opts = {
                types: this.types,
                excludeAcceptAllOption: this.excludeAcceptAllOption,
                multiple: false,
            };
            const [fileHandle] = yield window.showOpenFilePicker(opts);
            return fileHandle;
        });
    }
    openFile() {
        return __awaiter(this, void 0, void 0, function* () {
            const fileHandle = yield this.getReadFileHandle();
            const fileData = yield fileHandle.getFile();
            return yield fileData.text();
        });
    }
}
//# sourceMappingURL=diagrams.js.map