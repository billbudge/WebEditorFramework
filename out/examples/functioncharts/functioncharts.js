import { SelectionSet, Multimap } from '../../src/collections.js';
import { Theme, getEdgeBezier, hitTestRect, roundRectPath, bezierEdgePath, hitTestBezier, inFlagPath, outFlagPath, measureNameValuePairs, FileController } from '../../src/diagrams.js';
import { getExtents, expandRect } from '../../src/geometry.js';
import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, EventBase, copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet, reduceToRoots, TransactionManager, HistoryManager } from '../../src/dataModels.js';
// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'
//------------------------------------------------------------------------------
// TODO Distinguish between fully defined and partially defined function charts.
// Value and Function type descriptions.
export class Pin {
    get typeString() { return this.toString(); }
    constructor(type, name) {
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.baseline = 0;
        this.type = type;
        this.name = name;
    }
    copy() {
        if (this.type === Type.valueType)
            return new Pin(Type.valueType, this.name);
        else if (this.type === Type.starType)
            return new Pin(Type.starType, this.name);
        return new Pin(this.type.copy(), this.name);
    }
    copyUnlabeled() {
        if (this.type === Type.valueType)
            return new Pin(Type.valueType);
        else if (this.type === Type.starType)
            return new Pin(Type.starType);
        return new Pin(this.type.copyUnlabeled());
    }
    toString() {
        let s = this.type.toString();
        if (this.name)
            s += '(' + this.name + ')';
        return s;
    }
}
export class Type {
    static initialize() {
        Type.atomizedTypes.clear();
        Type.atomizedTypes.set(Type.valueTypeString, Type.valueType);
        Type.atomizedTypes.set(Type.starTypeString, Type.starType);
        Type.atomizedTypes.set(Type.spacerTypeString, Type.spacerType);
        Type.atomizedTypes.set(Type.emptyTypeString, Type.emptyType);
    }
    get typeString() { return this.toString(); }
    get needsLayout() {
        return this.height === 0; // width may be 0 in the case of spacer type.
    }
    constructor(inputs, outputs, name) {
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.inputs = inputs;
        this.outputs = outputs;
        this.name = name;
    }
    copy() {
        return new Type(this.inputs.map(pin => pin.copy()), this.outputs.map(pin => pin.copy()), this.name);
    }
    copyUnlabeled() {
        return new Type(this.inputs.map(pin => pin.copyUnlabeled()), this.outputs.map(pin => pin.copyUnlabeled()));
    }
    toString() {
        if (this === Type.valueType)
            return Type.valueTypeString;
        if (this === Type.starType)
            return Type.starTypeString;
        if (this === Type.spacerType)
            return Type.spacerTypeString;
        let s = '[';
        this.inputs.forEach(input => s += input.toString());
        s += ',';
        this.outputs.forEach(output => s += output.toString());
        s += ']';
        if (this.name)
            s += '(' + this.name + ')';
        return s;
    }
    atomized() {
        let s = this.toString();
        let atomizedType = Type.atomizedTypes.get(s);
        if (!atomizedType) {
            atomizedType = this;
            Type.atomizedTypes.set(s, atomizedType);
        }
        return atomizedType;
    }
    // private static equals(src: Type, dst: Type) : boolean {
    //   if (src === dst)
    //     return true;
    //   return src.inputs.length === dst.inputs.length &&
    //          src.outputs.length === dst.outputs.length &&
    //          dst.inputs.every((input, i) => {
    //             return Type.equals(src.inputs[i].type, input.type );
    //          }) &&
    //          dst.outputs.every((output, i) => {
    //            return Type.equals(src.outputs[i].type, output.type);
    //          });
    // }
    // equals(dst: Type) : boolean {
    //   return Type.equals(this, dst);
    // }
    static canConnect(src, dst) {
        if (src === dst)
            return true;
        if (src === Type.starType || dst === Type.starType)
            return true;
        if (src === Type.spacerType || dst === Type.spacerType)
            return false;
        if (dst === Type.valueType)
            return src === Type.valueType;
        return src.inputs.length >= dst.inputs.length &&
            src.outputs.length >= dst.outputs.length &&
            dst.inputs.every((input, i) => {
                return Type.canConnect(src.inputs[i].type, input.type);
            }) &&
            dst.outputs.every((output, i) => {
                return Type.canConnect(src.outputs[i].type, output.type);
            });
    }
    canConnectTo(dst) {
        return Type.canConnect(this, dst);
    }
}
Type.valueTypeString = 'v';
Type.valueType = new Type([], []);
Type.starTypeString = '*';
Type.starType = new Type([], []);
Type.spacerTypeString = ' ';
Type.spacerType = new Type([], []);
Type.emptyTypeString = '[,]';
Type.emptyType = new Type([], []);
Type.atomizedTypes = new Map();
// export type TypeVisitor = (type: Type, parent: Type | undefined) => void;
// export function forEachType(type: Type, callback: TypeVisitor) {
//   callback(type, undefined);
//   if (type.inputs)
//     type.inputs.forEach(input => forEachType(input.type, callback));
//   if (type.outputs)
//     type.outputs.forEach(output => forEachType(output.type, callback));
// }
export function parseTypeString(s) {
    let j = 0;
    // Close over j to avoid extra return values.
    function parseName() {
        let name;
        if (s[j] === '(') {
            let i = j + 1;
            j = s.indexOf(')', i);
            if (j > i)
                name = s.substring(i, j);
            j++;
        }
        return name;
    }
    function parsePin() {
        let i = j;
        // value type
        if (s[j] === Type.valueTypeString) {
            j++;
            return new Pin(Type.valueType, parseName());
        }
        // wildcard type
        if (s[j] === Type.starTypeString) {
            j++;
            return new Pin(Type.starType, parseName());
        }
        // Layout spacer type.
        if (s[j] === Type.spacerTypeString) {
            j++;
            return new Pin(Type.spacerType, parseName());
        }
        // function types
        let type = parseFunction(), typeString = s.substring(i, j);
        // Add the pin type, without label.
        type = type.atomized();
        return new Pin(type, parseName());
    }
    function parseFunction() {
        let i = j;
        if (s[j] === Type.valueTypeString) {
            return Type.valueType;
        }
        else if (s[j] === Type.starTypeString) {
            return Type.starType;
        }
        else if (s[j] === Type.spacerTypeString) {
            return Type.spacerType;
        }
        else if (s[j] === '[') {
            j++;
            let inputs = new Array, outputs = new Array;
            while (s[j] !== ',') {
                inputs.push(parsePin());
            }
            j++;
            while (s[j] !== ']') {
                outputs.push(parsePin());
            }
            j++;
            const typeString = s.substring(i, j);
            let type = new Type(inputs, outputs);
            type = type.atomized();
            return type;
        }
        else {
            throw new Error('Invalid type string: ' + s);
        }
    }
    let type = parseFunction();
    if (type) {
        const name = parseName();
        if (name) {
            // The top level function type includes the label, so duplicate
            // type and pins.
            const inputs = type.inputs.map(pin => new Pin(pin.type, pin.name)), outputs = type.outputs.map(pin => new Pin(pin.type, pin.name));
            type = new Type(inputs, outputs, name);
        }
        type = type.atomized();
    }
    return type;
}
//------------------------------------------------------------------------------
// Implement type-safe interfaces as well as a raw data interface for
// cloning, serialization, etc.
const idProp = new IdProp('id'), xProp = new ScalarProp('x'), yProp = new ScalarProp('y'), nameProp = new ScalarProp('name'), typeStringProp = new ScalarProp('typeString'), widthProp = new ScalarProp('width'), heightProp = new ScalarProp('height'), srcProp = new ReferenceProp('src'), srcPinProp = new ScalarProp('srcPin'), dstProp = new ReferenceProp('dst'), dstPinProp = new ScalarProp('dstPin'), nonWiresProp = new ChildArrayProp('nonWires'), wiresProp = new ChildArrayProp('wires'), functionchartProp = new ReferenceProp('functionchart'), elementsProp = new ChildArrayProp('elements');
class NonWireTemplate {
    constructor() {
        this.id = idProp;
        this.x = xProp;
        this.y = yProp;
    }
}
class ElementTemplate extends NonWireTemplate {
    constructor(typeName) {
        super();
        this.name = nameProp;
        this.typeString = typeStringProp;
        this.elements = elementsProp;
        this.properties = [this.id, this.x, this.y, this.name, this.typeString, this.elements];
        this.typeName = typeName;
    }
}
class PseudoelementTemplate extends NonWireTemplate {
    constructor(typeName) {
        super();
        this.typeString = typeStringProp;
        this.properties = [this.id, this.x, this.y, this.typeString];
        this.typeName = typeName;
    }
}
class WireTemplate {
    constructor() {
        this.typeName = 'wire';
        this.src = srcProp;
        this.srcPin = srcPinProp;
        this.dst = dstProp;
        this.dstPin = dstPinProp;
        this.properties = [this.src, this.srcPin, this.dst, this.dstPin];
    }
}
class FunctionchartTemplate extends NonWireTemplate {
    constructor() {
        super(...arguments);
        this.typeName = 'functionchart';
        this.width = widthProp;
        this.height = heightProp;
        this.name = nameProp;
        this.nonWires = nonWiresProp;
        this.wires = wiresProp;
        this.properties = [this.id, this.x, this.y, this.width, this.height, this.name,
            this.nonWires, this.wires];
    }
}
class FunctionInstanceTemplate extends NonWireTemplate {
    constructor() {
        super(...arguments);
        this.typeName = 'instance';
        this.functionchart = functionchartProp;
        this.properties = [this.id, this.x, this.y, this.functionchart];
    }
}
const literalTemplate = new ElementTemplate('literal'), binopTemplate = new ElementTemplate('binop'), unopTemplate = new ElementTemplate('unop'), condTemplate = new ElementTemplate('cond'), storeTemplate = new ElementTemplate('store'), importTemplate = new ElementTemplate('import'), exportTemplate = new ElementTemplate('export'), elementTemplate = new ElementTemplate('element'), inputTemplate = new PseudoelementTemplate('input'), outputTemplate = new PseudoelementTemplate('output'), applyTemplate = new PseudoelementTemplate('apply'), passTemplate = new PseudoelementTemplate('pass'), wireTemplate = new WireTemplate(), functionchartTemplate = new FunctionchartTemplate(), functionInstanceTemplate = new FunctionInstanceTemplate();
const defaultPoint = { x: 0, y: 0 }, defaultPointWithNormal = { x: 0, y: 0, nx: 0, ny: 0 }, defaultBezierCurve = [
    defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal
];
class ElementBase {
    getPassThroughs() {
        var _a;
        if (this instanceof FunctionInstance)
            return (_a = this.functionchart) === null || _a === void 0 ? void 0 : _a.passThroughs;
        if (this instanceof Element) {
            switch (this.template.typeName) {
                case 'cond':
                    return [[1, 2, 3]]; // '0' is the condition input, of valueType.
                case 'store':
                    return [[1, 0]];
            }
        }
        else if (this instanceof Pseudoelement) {
            switch (this.template.typeName) {
                case 'pass':
                    return [[0, 1]];
            }
        }
    }
    getPin(index) {
        const type = this.type, firstOutput = type.inputs.length, pin = index < firstOutput ? this.type.inputs[index] :
            this.type.outputs[index - firstOutput];
        return pin;
    }
    constructor(id) {
        this.globalPosition = defaultPoint;
        this.type = Type.emptyType;
        this.inWires = new Array(); // one input per pin (no fan in).
        this.outWires = new Array(); // multiple outputs per pin (fan out).
        this.id = id;
    }
}
export class Element extends ElementBase {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get typeString() { return this.template.typeString.get(this); }
    set typeString(value) { this.template.typeString.set(this, value); }
    get elements() { return this.template.elements.get(this); }
    constructor(context, template, id) {
        super(id);
        this.context = context;
        this.template = template;
    }
}
export class Pseudoelement extends ElementBase {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get typeString() { return this.template.typeString.get(this); }
    set typeString(value) { this.template.typeString.set(this, value); }
    // Derived properties.
    // index: number = -1;
    constructor(context, template, id) {
        super(id);
        this.context = context;
        this.template = template;
        switch (this.template.typeName) {
            case 'input':
                this.typeString = '[,*]';
                break;
            case 'output':
                this.typeString = '[*,]';
                break;
            case 'apply':
                this.typeString = '[*,]';
                break;
            case 'pass':
                this.typeString = '[*,*]';
                break;
        }
    }
}
export class Wire {
    get src() { return this.template.src.get(this); }
    set src(value) { this.template.src.set(this, value); }
    get srcPin() { return this.template.srcPin.get(this); }
    set srcPin(value) { this.template.srcPin.set(this, value); }
    get dst() { return this.template.dst.get(this); }
    set dst(value) { this.template.dst.set(this, value); }
    get dstPin() { return this.template.dstPin.get(this); }
    set dstPin(value) { this.template.dstPin.set(this, value); }
    constructor(context) {
        this.template = wireTemplate;
        this.bezier = defaultBezierCurve;
        this.context = context;
        this.srcPin = -1;
        this.dstPin = -1;
    }
}
export class Functionchart {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get width() { return this.template.width.get(this) || 0; }
    set width(value) { this.template.width.set(this, value); }
    get height() { return this.template.height.get(this) || 0; }
    set height(value) { this.template.height.set(this, value); }
    get name() { return this.template.name.get(this) || 0; }
    set name(value) { this.template.name.set(this, value); }
    get nonWires() { return this.template.nonWires.get(this); }
    get wires() { return this.template.wires.get(this); }
    constructor(context, id) {
        this.template = functionchartTemplate;
        this.globalPosition = defaultPoint;
        this.type = Type.emptyType;
        this.context = context;
        this.id = id;
    }
}
export class FunctionInstance extends ElementBase {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get functionchart() { return this.template.functionchart.get(this); }
    set functionchart(value) { this.template.functionchart.set(this, value); }
    constructor(context, id) {
        super(id);
        this.template = functionInstanceTemplate;
        this.context = context;
    }
}
export class FunctionchartContext extends EventBase {
    constructor() {
        super();
        this.highestId = 0; // 0 stands for no id.
        this.referentMap = new Map();
        this.elements = new Set;
        this.functioncharts = new Set;
        this.wires = new Set;
        // Topologically sorted elements, or undefined if needs update.
        this.sorted = new Array();
        // Map from functionchart to its instances.
        this.fcMap = new Multimap();
        this.selection = new SelectionSet();
        const self = this;
        this.transactionManager = new TransactionManager();
        this.addHandler('changed', this.transactionManager.onChanged.bind(this.transactionManager));
        function update() {
            if (!self.sorted)
                self.sorted = self.topologicalSort();
            self.makeConsistent();
        }
        this.transactionManager.addHandler('transactionEnding', update);
        this.transactionManager.addHandler('didUndo', update);
        this.transactionManager.addHandler('didRedo', update);
        this.historyManager = new HistoryManager(this.transactionManager, this.selection);
        const root = new Functionchart(this, this.highestId++);
        this.functionchart = root;
        this.insertFunctionchart(root, undefined);
    }
    get root() {
        return this.functionchart;
    }
    set root(root) {
        if (this.functionchart) {
            // This removes all elements, functioncharts, and wires.
            this.removeItem(this.functionchart);
        }
        this.functionchart = root;
        this.insertFunctionchart(root, undefined);
        this.makeConsistent();
    }
    newElement(typeName) {
        const nextId = ++this.highestId;
        let template, typeString;
        switch (typeName) {
            case 'literal':
                template = literalTemplate;
                typeString = '[,v]';
                break;
            case 'binop':
                template = binopTemplate;
                typeString = '[vv,v]';
                break;
            case 'unop':
                template = unopTemplate;
                typeString = '[v,v]';
                break;
            case 'cond':
                template = condTemplate;
                typeString = '[v**,*](?)';
                break;
            case 'store':
                template = storeTemplate;
                typeString = '[v*,*](:=)';
                break;
            case 'import':
                template = importTemplate;
                typeString = Type.emptyTypeString;
                break;
            case 'export':
                template = exportTemplate;
                typeString = Type.emptyTypeString;
                break;
            case 'element':
                template = elementTemplate;
                typeString = Type.emptyTypeString;
                break;
            default: throw new Error('Unknown element type: ' + typeName);
        }
        const result = new Element(this, template, nextId);
        result.typeString = typeString;
        this.referentMap.set(nextId, result);
        return result;
    }
    newPseudoelement(typeName) {
        const nextId = ++this.highestId;
        let template;
        switch (typeName) {
            case 'input':
                template = inputTemplate;
                break;
            case 'output':
                template = outputTemplate;
                break;
            case 'apply':
                template = applyTemplate;
                break;
            case 'pass':
                template = passTemplate;
                break;
            default: throw new Error('Unknown pseudoelement type: ' + typeName);
        }
        const result = new Pseudoelement(this, template, nextId);
        this.referentMap.set(nextId, result);
        return result;
    }
    newWire(src, srcPin, dst, dstPin) {
        const result = new Wire(this);
        result.src = src;
        result.srcPin = srcPin;
        result.dst = dst;
        result.dstPin = dstPin;
        return result;
    }
    newFunctionchart() {
        const nextId = ++this.highestId;
        const result = new Functionchart(this, nextId);
        this.referentMap.set(nextId, result);
        return result;
    }
    newFunctionInstance() {
        const nextId = ++this.highestId;
        const result = new FunctionInstance(this, nextId);
        this.referentMap.set(nextId, result);
        return result;
    }
    contains(item) {
        if (item instanceof ElementBase)
            return this.elements.has(item);
        if (item instanceof Wire)
            return this.wires.has(item);
        if (item instanceof Functionchart)
            return this.functioncharts.has(item);
        return false;
    }
    visitAll(item, visitor) {
        const self = this;
        visitor(item);
        if (item instanceof Functionchart) {
            item.nonWires.forEach(t => self.visitAll(t, visitor));
            item.wires.forEach(t => self.visitAll(t, visitor));
        }
    }
    reverseVisitAll(item, visitor) {
        const self = this;
        if (item instanceof Functionchart) {
            item.wires.forEachReverse(t => self.reverseVisitAll(t, visitor));
            item.nonWires.forEachReverse(t => self.reverseVisitAll(t, visitor));
        }
        visitor(item);
    }
    visitNonWires(item, visitor) {
        const self = this;
        visitor(item);
        if (item instanceof Functionchart) {
            item.nonWires.forEach(item => self.visitNonWires(item, visitor));
        }
    }
    reverseVisitNonWires(item, visitor) {
        const self = this;
        if (item instanceof Functionchart) {
            item.nonWires.forEachReverse(item => self.reverseVisitNonWires(item, visitor));
        }
        visitor(item);
    }
    visitWires(functionchart, visitor) {
        const self = this;
        functionchart.wires.forEach(t => visitor(t));
        functionchart.nonWires.forEach(t => {
            if (t instanceof Functionchart)
                self.visitWires(t, visitor);
        });
    }
    reverseVisitWires(functionchart, visitor) {
        const self = this;
        functionchart.nonWires.forEachReverse(t => {
            if (t instanceof Functionchart)
                self.reverseVisitWires(t, visitor);
        });
        functionchart.wires.forEach(t => visitor(t));
    }
    getContainingFunctionchart(items) {
        let parent = getLowestCommonAncestor(...items);
        if (!parent)
            return this.functionchart; // |items| empty.
        if (!(parent instanceof Functionchart)) { // |items| is a single element.
            parent = parent.parent;
        }
        if (!parent)
            return this.functionchart; // |items| not in the functionchart yet.
        return parent;
    }
    forInWires(element, visitor) {
        element.inWires.forEach(wire => {
            if (wire)
                visitor(wire);
        });
    }
    forOutWires(element, visitor) {
        element.outWires.forEach(wires => {
            wires.forEach(wire => visitor(wire));
        });
    }
    // Gets the translation to move an item from its current parent to
    // newParent.
    getToParent(item, newParent) {
        const oldParent = item.parent;
        let dx = 0, dy = 0;
        if (oldParent) {
            const global = oldParent.globalPosition;
            dx += global.x;
            dy += global.y;
        }
        if (newParent) {
            const global = newParent.globalPosition;
            dx -= global.x;
            dy -= global.y;
        }
        return { x: dx, y: dy };
    }
    setGlobalPosition(item) {
        const x = item.x, y = item.y, parent = item.parent;
        if (parent) {
            // console.log(item.type, parent.type, parent.globalPosition);
            const global = parent.globalPosition;
            if (global) {
                item.globalPosition = { x: x + global.x, y: y + global.y };
            }
        }
        else {
            item.globalPosition = { x: x, y: y };
        }
    }
    getGraphInfo() {
        return {
            elements: this.elements,
            functioncharts: this.functioncharts,
            wires: this.wires,
            interiorWires: this.wires,
            inWires: new Set(),
            outWires: new Set(),
        };
    }
    getSubgraphInfo(items) {
        const self = this, elements = new Set(), functioncharts = new Set(), wires = new Set(), interiorWires = new Set(), inWires = new Set(), outWires = new Set();
        // First collect Elements and Functioncharts.
        items.forEach(item => {
            this.visitNonWires(item, (item) => {
                if (item instanceof Functionchart)
                    functioncharts.add(item);
                else
                    elements.add(item);
            });
        });
        // Now collect and classify wires that connect to them.
        items.forEach(item => {
            function addWire(wire) {
                // Stop if we've already processed this transtion (handle transitions from a element to itself.)
                if (wires.has(wire))
                    return;
                wires.add(wire);
                const src = wire.src, dst = wire.dst, srcInside = elements.has(src), dstInside = elements.has(dst);
                if (srcInside) {
                    if (dstInside) {
                        interiorWires.add(wire);
                    }
                    else {
                        outWires.add(wire);
                    }
                }
                if (dstInside) {
                    if (!srcInside) {
                        inWires.add(wire);
                    }
                }
            }
            if (item instanceof ElementBase) {
                self.forInWires(item, addWire);
                self.forOutWires(item, addWire);
            }
        });
        return {
            elements: elements,
            functioncharts: functioncharts,
            wires: wires,
            interiorWires: interiorWires,
            inWires: inWires,
            outWires: outWires,
        };
    }
    getConnectedElements(elements, upstream, downstream) {
        const result = new Set();
        elements = elements.slice(0); // Copy input array
        while (elements.length > 0) {
            const element = elements.pop();
            result.add(element);
            this.forInWires(element, wire => {
                if (!upstream(wire))
                    return;
                const src = wire.src;
                if (!result.has(src))
                    elements.push(src);
            });
            this.forOutWires(element, wire => {
                if (!downstream(wire))
                    return;
                const dst = wire.dst;
                if (!result.has(dst))
                    elements.push(dst);
            });
        }
        return result;
    }
    beginTransaction(name) {
        this.transactionManager.beginTransaction(name);
    }
    endTransaction() {
        if (!this.isValidFunctionchart()) {
            // TODO some kind of error message.
            this.transactionManager.cancelTransaction();
        }
        else {
            this.transactionManager.endTransaction();
        }
    }
    cancelTransaction(name) {
        this.transactionManager.cancelTransaction();
    }
    getOldValue(item, property) {
        return this.transactionManager.getOldValue(item, property);
    }
    getUndo() {
        return this.historyManager.getUndo();
    }
    undo() {
        this.historyManager.undo();
    }
    getRedo() {
        return this.historyManager.getRedo();
    }
    redo() {
        this.historyManager.redo();
    }
    addTransactionHandler(name, handler) {
        this.transactionManager.addHandler(name, handler);
    }
    select(item) {
        this.selection.add(item);
    }
    selectedAllTypes() {
        return this.selection.contents();
    }
    selectedTrueElements() {
        const result = new Array();
        this.selection.forEach(item => {
            if (item instanceof Element || item instanceof FunctionInstance)
                result.push(item);
        });
        return result;
    }
    selectedElements() {
        const result = new Array();
        this.selection.forEach(item => {
            if (item instanceof ElementBase)
                result.push(item);
        });
        return result;
    }
    selectedNonWires() {
        const result = new Array();
        this.selection.forEach(item => {
            if (!(item instanceof Wire))
                result.push(item);
        });
        return result;
    }
    reduceSelection() {
        const selection = this.selection;
        // Deselect any items whose ancestors are selected.
        const roots = reduceToRoots(selection.contents(), selection);
        // Reverse, to preserve the previous order of selection.
        selection.set(roots.reverse());
    }
    disconnectElement(element) {
        const self = this;
        element.inWires.forEach(wire => {
            if (wire)
                self.deleteItem(wire);
        });
        element.outWires.forEach(wires => {
            if (wires.length === 0)
                return;
            // Copy array since we're mutating it.
            wires.slice().forEach(wire => {
                if (wire)
                    self.deleteItem(wire);
            });
        });
    }
    disconnectSelection() {
        const self = this;
        this.selectedElements().forEach(element => self.disconnectElement(element));
    }
    extendSelectionToWires() {
        const self = this, graphInfo = this.getSubgraphInfo(this.selectedElements());
        graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
    }
    selectConnectedElements(upstream, downstream) {
        const selectedElements = this.selectedElements(), connectedElements = this.getConnectedElements(selectedElements, upstream, downstream);
        this.selection.set(Array.from(connectedElements));
    }
    addItem(item, parent) {
        const oldParent = item.parent;
        if (!parent)
            parent = this.functionchart;
        if (oldParent === parent)
            return item;
        // At this point we can add item to parent.
        if (!(item instanceof Wire)) {
            const translation = this.getToParent(item, parent);
            item.x += translation.x;
            item.y += translation.y;
        }
        if (oldParent)
            this.deleteItem(item);
        if (item instanceof Wire) {
            parent.wires.append(item);
        }
        else {
            parent.nonWires.append(item);
        }
        return item;
    }
    addItems(items, parent) {
        // Add functioncharts, then elements, then wires.
        for (let item of items) {
            if (item instanceof Functionchart)
                this.addItem(item, parent);
        }
        for (let item of items) {
            if (item instanceof ElementBase)
                this.addItem(item, parent);
        }
        for (let item of items) {
            if (item instanceof Wire)
                this.addItem(item, parent);
        }
    }
    deleteItem(item) {
        if (item.parent) {
            if (item instanceof Wire) {
                item.parent.wires.remove(item);
            }
            else {
                item.parent.nonWires.remove(item);
            }
        }
        this.selection.delete(item);
    }
    deleteItems(items) {
        const self = this;
        items.forEach(item => self.deleteItem(item));
    }
    copy() {
        const Functionchart = this.functionchart, selection = this.selection;
        selection.set(this.selectedNonWires());
        this.extendSelectionToWires();
        this.reduceSelection();
        const selected = selection.contents(), map = new Map(), copies = copyItems(selected, this, map);
        selected.forEach(item => {
            if (!(item instanceof Wire)) {
                const copy = map.get(item.id);
                if (copy) {
                    const translation = this.getToParent(item, Functionchart);
                    copy.x += translation.x;
                    copy.y += translation.y;
                }
            }
        });
        return copies;
    }
    paste(items) {
        this.transactionManager.beginTransaction('paste');
        items.forEach(item => {
            // Offset paste so copies don't overlap with the originals.
            if (!(item instanceof Wire)) {
                item.x += 16;
                item.y += 16;
            }
        });
        const copies = copyItems(items, this);
        this.addItems(copies, this.functionchart);
        this.selection.set(copies);
        this.endTransaction();
        return copies;
    }
    deleteSelectionHelper() {
        this.reduceSelection();
        this.disconnectSelection();
        this.deleteItems(this.selection.contents());
    }
    cut() {
        this.transactionManager.beginTransaction('cut');
        const result = this.copy();
        this.deleteSelectionHelper();
        this.endTransaction();
        return result;
    }
    deleteSelection() {
        this.transactionManager.beginTransaction('delete');
        this.deleteSelectionHelper();
        this.endTransaction();
    }
    connectInput(element, pin, pinToPoint) {
        const elementParent = element.parent, p = pinToPoint(element, pin), junction = this.newPseudoelement('input');
        junction.x = p.x - 32;
        junction.y = p.y;
        this.addItem(junction, elementParent);
        const wire = this.newWire(junction, 0, element, pin);
        this.addItem(wire, elementParent);
        return { junction, wire };
    }
    connectOutput(element, pin, pinToPoint) {
        const elementParent = element.parent, p = pinToPoint(element, pin), junction = this.newPseudoelement('output');
        junction.x = p.x + 32;
        junction.y = p.y;
        this.addItem(junction, elementParent);
        const wire = this.newWire(element, pin, junction, 0);
        this.addItem(wire, elementParent);
        return { junction, wire };
    }
    completeElements(elements, inputToPoint, outputToPoint) {
        const self = this, selection = this.selection;
        // Add junctions for disconnected pins on elements.
        elements.forEach(element => {
            const inputs = element.inWires, outputs = element.outWires;
            for (let pin = 0; pin < inputs.length; pin++) {
                if (element.type.inputs[pin].type === Type.spacerType)
                    continue;
                if (inputs[pin] === undefined) {
                    const { junction, wire } = self.connectInput(element, pin, inputToPoint);
                    selection.add(junction);
                    selection.add(wire);
                }
            }
            for (let pin = 0; pin < outputs.length; pin++) {
                if (element.type.outputs[pin].type === Type.spacerType)
                    continue;
                if (outputs[pin].length === 0) {
                    const { junction, wire } = self.connectOutput(element, pin, outputToPoint);
                    selection.add(junction);
                    selection.add(wire);
                }
            }
        });
    }
    isValidWire(wire) {
        if (wire.pSrc || wire.pDst)
            return true; // Dragging a new wire is temporarily invalid.
        const src = wire.src, dst = wire.dst;
        if (!src || !dst)
            return false;
        if (src === dst)
            return false;
        // Wires must be within the functionchart or to/from an enclosing functionchart.
        const lca = getLowestCommonAncestor(src, dst);
        if (!lca || !(lca === src.parent || lca === dst.parent))
            return false;
        // TODO no wires to dst out of functionchart.
        const srcPin = wire.srcPin, dstPin = wire.dstPin;
        if (srcPin < 0 || srcPin >= src.type.outputs.length)
            return false;
        if (dstPin < 0 || dstPin >= dst.type.inputs.length)
            return false;
        const srcType = src.type.outputs[srcPin].type, dstType = dst.type.inputs[dstPin].type;
        return srcType.canConnectTo(dstType);
    }
    // Topological sort of elements for update and validation. The circuit should form a DAG.
    // All wires should be valid.
    topologicalSort() {
        const visiting = new Set(), visited = new Set(), sorted = new Array();
        let cycle = false;
        function visit(element) {
            if (visited.has(element))
                return;
            if (visiting.has(element)) {
                cycle = true;
                return;
            }
            visiting.add(element);
            element.outWires.forEach(wires => {
                wires.forEach(wire => {
                    visit(wire.dst);
                });
            });
            if (cycle)
                return;
            visiting.delete(element);
            visited.add(element);
            sorted.push(element);
        }
        this.elements.forEach(element => {
            if (!visited.has(element) && !visiting.has(element))
                visit(element);
        });
        return sorted;
    }
    isValidFunctionchart() {
        const self = this, invalidWires = new Array(), graphInfo = this.getGraphInfo();
        // Check wires.
        graphInfo.wires.forEach(wire => {
            if (!self.isValidWire(wire)) {
                console.log(wire, self.isValidWire(wire));
                invalidWires.push(wire);
            }
        });
        if (invalidWires.length !== 0)
            return false;
        if (!this.sorted)
            this.sorted = this.topologicalSort();
        return this.sorted.length === this.elements.size;
    }
    // verifyInternal() : boolean {
    //   const invalidWires = new Set<Wire>(),
    //         invalidElements = new Set<ElementTypes>(),
    //         graphInfo = this.getGraphInfo();
    //   // Check wires.
    //   graphInfo.wires.forEach(wire => {
    //     const src = wire.src,
    //           srcPin = wire.srcPin,
    //           dst = wire.dst,
    //           dstPin = wire.dstPin;
    //     if (src && srcPin >= 0 && srcPin < src.type.outputs.length) {
    //       if (src.outWires[srcPin].indexOf(wire) < 0)
    //         invalidWires.add(wire);
    //     }
    //     if (dst && dstPin >= 0 && dstPin < dst.type.inputs.length) {
    //       if (dst.inWires[dstPin] != wire)
    //         invalidWires.add(wire);
    //     }
    //     if (src && dst) {
    //       const lca: Functionchart = getLowestCommonAncestor<AllTypes>(src, dst) as Functionchart;
    //       if (!lca || !lca.wires.includes(wire)) {
    //         invalidWires.add(wire);
    //       }
    //     }
    //   });
    //   // Check elements.
    //   graphInfo.elements.forEach(element => {
    //     element.inWires.forEach((wire) => {
    //       if (wire && !graphInfo.wires.has(wire))
    //         invalidElements.add(element);
    //     });
    //     element.outWires.forEach((wires) => {
    //       wires.forEach((wire) => {
    //         if (!graphInfo.wires.has(wire))
    //           invalidElements.add(element);
    //       });
    //     });
    //   });
    //   if (invalidWires.size !== 0 || invalidElements.size !== 0) {
    //     console.log('invalid wires', invalidWires);
    //     console.log('invalid elements', invalidElements);
    //     return false;
    //   }
    //   return true;
    // }
    makeConsistent() {
        const self = this;
        // TODO use topological sort to traverse graph and make types consistent.
        if (!this.sorted)
            this.sorted = this.topologicalSort();
        // Update functioncharts, and functioninstances.
        this.reverseVisitNonWires(this.functionchart, item => {
            if (item instanceof Pseudoelement) {
                if (item.template.typeName === 'apply') {
                    const type = self.resolvePinType(item, 0);
                    let typeString = '[*,]';
                    if (type) {
                        const newType = type.copy();
                        newType.inputs.splice(0, 0, new Pin(Type.starType));
                        newType.outputs.splice(0, 0, new Pin(Type.spacerType));
                        typeString = newType.typeString;
                    }
                    item.typeString = typeString;
                }
            }
            else if (item instanceof Functionchart) {
                const typeInfo = self.getFunctionchartTypeInfo(item);
                if (typeInfo.typeString !== item.type.typeString) {
                    this.updateItem(item);
                }
            }
            else if (item instanceof FunctionInstance) {
                if (!self.functioncharts.has(item.functionchart)) {
                    self.deleteItem(item);
                }
            }
        });
        this.visitNonWires(this.functionchart, item => {
            if (item instanceof FunctionInstance) {
                const functionchart = item.functionchart;
                if (item.type !== functionchart.type) {
                    item.type = functionchart.type;
                }
            }
        });
        // Make sure wires between elements are contained by the lowest common parent functionchart.
        Array.from(this.wires.values()).forEach(wire => {
            const src = wire.src, dst = wire.dst, srcParent = src.parent, dstParent = dst.parent, lca = getLowestCommonAncestor(srcParent, dstParent);
            if (wire.parent !== lca) {
                self.deleteItem(wire);
                self.addItem(wire, lca);
            }
        });
    }
    replaceElement(element, newElement) {
        const type = element.type, newType = newElement.type;
        // Add newElement right after element. Both should be present as we
        // rewire them.
        if (element.parent !== newElement.parent) {
            this.deleteItem(newElement);
        }
        if (element.parent) {
            this.addItem(newElement, element.parent);
        }
        newElement.x = element.x;
        newElement.y = element.y;
        // Update all incoming and outgoing wires if possible; otherwise they
        // are deleted.
        const srcChange = new Array(), dstChange = new Array();
        element.inWires.forEach(wire => {
            if (!wire)
                return;
            const src = wire.src, srcPin = wire.srcPin, dstPin = wire.dstPin;
            if (dstPin < newType.inputs.length &&
                src.type.outputs[srcPin].type.canConnectTo(newElement.type.inputs[dstPin].type)) {
                dstChange.push(wire);
            }
            else {
                this.deleteItem(wire);
            }
        });
        element.outWires.forEach(wires => {
            if (wires.length === 0)
                return;
            // Copy array since we're mutating.
            wires.slice().forEach(wire => {
                if (!wire)
                    return;
                const dst = wire.dst, srcPin = wire.srcPin, dstPin = wire.dstPin;
                if (srcPin < newType.outputs.length &&
                    newElement.type.outputs[srcPin].type.canConnectTo(dst.type.inputs[dstPin].type)) {
                    srcChange.push(wire);
                }
                else {
                    this.deleteItem(wire);
                }
            });
        });
        srcChange.forEach(wire => {
            wire.src = newElement;
        });
        dstChange.forEach(function (wire) {
            wire.dst = newElement;
        });
        this.deleteItem(element);
    }
    exportElement(element) {
        const result = this.newElement('export'), newType = new Type([], [new Pin(element.type)]);
        result.typeString = newType.toString();
        return result;
    }
    exportElements(elements) {
        const self = this, selection = this.selection;
        // Open each non-input/output element.
        elements.forEach(element => {
            selection.delete(element);
            const newElement = self.exportElement(element);
            self.replaceElement(element, newElement);
            newElement.elements.append(element); // newElement owns the base element.
            selection.add(newElement);
        });
    }
    importElement(element) {
        const result = this.newPseudoelement('input'), type = element.type, newType = type.copyUnlabeled();
        result.typeString = '[,' + newType.toString() + ']';
        return result;
    }
    importElements(elements) {
        const self = this, selection = this.selection;
        // Open each non-input/output element.
        elements.forEach(element => {
            selection.delete(element);
            const newElement = self.importElement(element);
            self.replaceElement(element, newElement);
            selection.add(newElement);
        });
    }
    group(items, grandparent, bounds) {
        const self = this, selection = this.selection, parent = this.newFunctionchart();
        parent.x = bounds.x;
        parent.y = bounds.y;
        // parent.width = bounds.width;
        // parent.height = bounds.height;
        this.addItem(parent, grandparent);
        // TODO - make outputs from outgoing wires, then delete them.
        items.forEach(item => {
            self.addItem(item, parent);
            selection.add(item);
        });
    }
    // Visit pins along the first pass-through containing the given pin.
    visitPassthroughs(element, index, visitor, visited) {
        const passThroughs = element.getPassThroughs();
        if (passThroughs) {
            for (let passThrough of passThroughs) {
                if (passThrough.includes(index)) {
                    for (let i of passThrough) {
                        this.visitPin(element, i, visitor, visited);
                    }
                    break;
                }
            }
        }
    }
    // Visit the given pin, then follow wires and pass-throughs.
    visitPin(element, index, visitor, visited) {
        if (visited.has(element, index))
            return;
        visited.add(element, index);
        visitor(element, index);
        const type = element.type, firstOutput = type.inputs.length;
        if (index < firstOutput) {
            const wire = element.inWires[index];
            if (wire) {
                const src = wire.src, srcPin = wire.srcPin, index = src.type.inputs.length + srcPin;
                this.visitPin(src, index, visitor, visited);
            }
        }
        else {
            const wires = element.outWires[index - firstOutput];
            if (wires) { // |wires| may be undefined if the instance doesn't has its type yet.
                for (let i = 0; i < wires.length; i++) {
                    const wire = wires[i];
                    if (wire) {
                        const dst = wire.dst, dstPin = wire.dstPin;
                        this.visitPin(dst, dstPin, visitor, visited);
                    }
                }
            }
        }
        this.visitPassthroughs(element, index, visitor, visited);
    }
    // Visits the pin, all pins wired to it, and all pass-throughs containing it, and returns
    // the type of the first non-star pin it finds.
    resolvePinType(element, index, visited = new Multimap()) {
        let type;
        function visit(element, index) {
            const pin = element.getPin(index);
            // |pin| may be undefined if the instance doesn't has its type yet.
            if (pin && pin.type !== Type.starType) {
                type = pin.type;
            }
            return true;
        }
        this.visitPin(element, index, visit, visited);
        // As a side effect, 'visited' is populated.
        return type;
    }
    getFunctionchartTypeInfo(functionchart) {
        const self = this, inputs = new Array(), outputs = new Array(), name = functionchart.name;
        // Collect subgraph info.
        const subgraphInfo = self.getSubgraphInfo(functionchart.nonWires.asArray());
        // Collect the functionchart's inputs and outputs.
        subgraphInfo.elements.forEach(item => {
            if (item.parent !== functionchart)
                return;
            if (item instanceof Pseudoelement) {
                if (item.template.typeName === 'input') {
                    const connected = new Multimap();
                    const type = self.resolvePinType(item, 0, connected) || Type.starType;
                    const pinInfo = { element: item, index: 0, type, connected, fcIndex: -1 };
                    inputs.push(pinInfo);
                }
                else if (item.template.typeName === 'output') {
                    const connected = new Multimap();
                    const type = self.resolvePinType(item, 0, connected) || Type.starType;
                    const pinInfo = { element: item, index: 0, type, connected, fcIndex: -1 };
                    outputs.push(pinInfo);
                }
                // TODO 'pass' pseudoelement.
            }
        });
        // // Now, implicit inputs and outputs.
        // if (!functionchart.explicit) {
        //   // Add all disconnected inputs and outputs as pins.
        //   subgraphInfo.elements.forEach(element => {
        //     if (element instanceof FunctionInstance && element.functionchart === functionchart)
        //       return;  // We don't expose a recursive instance of the functionchart.
        //     element.inWires.forEach((wire, index) => {
        //       if (wire === undefined) {
        //         const connected = new Multimap<ElementTypes, number>();
        //         const pin = element.type.inputs[index];
        //         if (pin.type === Type.spacerType) return;
        //         const type = self.resolvePinType(element, index, connected) || Type.starType;
        //         const pinInfo = { element, index, type, connected, fcIndex: -1 };
        //         inputs.push(pinInfo);
        //       }
        //     });
        //     element.outWires.forEach((wires, index) => {
        //       if (wires.length === 0) {
        //         const connected = new Multimap<ElementTypes, number>();
        //         const pin = element.type.outputs[index];
        //         if (pin.type === Type.spacerType) return;
        //         const firstOutput = element.type.inputs.length;
        //         const type = self.resolvePinType(element, index + firstOutput, connected) || Type.starType;
        //         const pinInfo = { element, index: index + firstOutput, type, connected, fcIndex: -1 };
        //         outputs.push(pinInfo);
        //       }
        //     });
        //   });
        // }
        // Sort pins in increasing y-order. This lets users arrange the pins of the
        // new type in an intuitive way.
        function compareYs(p1, p2) {
            const element1 = p1.element, element2 = p2.element, pin1 = element1.getPin(p1.index), pin2 = element2.getPin(p2.index), y1 = element1.y + pin1.y, y2 = element2.y + pin2.y;
            return y1 - y2;
        }
        function compareIndices(p1, p2) {
            return p1.fcIndex - p2.fcIndex;
        }
        inputs.sort(compareYs);
        inputs.forEach((input, i) => { input.fcIndex = i; });
        const firstOutput = inputs.length;
        outputs.sort(compareYs);
        outputs.forEach((output, i) => { output.fcIndex = i + firstOutput; });
        function getPinInfo(element, index) {
            for (let i = 0; i < inputs.length; i++) {
                const input = inputs[i];
                if (input.element === element && input.index === index)
                    return input;
            }
            for (let i = 0; i < outputs.length; i++) {
                const output = outputs[i];
                if (output.element === element && output.index === index)
                    return output;
            }
        }
        function getPinName(type, pin) {
            let typeString = type.typeString;
            if (pin.name)
                typeString += '(' + pin.name + ')';
            return typeString;
        }
        const passThroughs = new Array(), inPassthrough = new Multimap();
        let typeString = '[';
        inputs.forEach(input => {
            // For unresolved pin types, compute the pass-throughs.
            if (input.type === Type.starType) {
                if (!inPassthrough.has(input.element, input.index)) {
                    const pinClique = input.connected, connected = new Array();
                    pinClique.forAll((e, i) => {
                        if (!inPassthrough.has(e, i)) {
                            inPassthrough.add(e, i);
                            const pinInfo = getPinInfo(e, i);
                            if (pinInfo)
                                connected.push(pinInfo);
                        }
                    });
                    if (connected.length > 1) {
                        connected.sort(compareIndices);
                        passThroughs.push(connected.map(info => info.fcIndex));
                    }
                }
            }
            typeString += getPinName(input.type, input.element.getPin(input.index));
        });
        typeString += ',';
        outputs.forEach(output => {
            // For unresolved pin types, compute the pass-throughs.
            if (output.type === Type.starType) {
                if (!inPassthrough.has(output.element, output.index)) {
                    const pinClique = output.connected, connected = new Array();
                    pinClique.forAll((e, i) => {
                        if (!inPassthrough.has(e, i)) {
                            inPassthrough.add(e, i);
                            const pinInfo = getPinInfo(e, i);
                            if (pinInfo)
                                connected.push(pinInfo);
                        }
                    });
                    if (connected.length > 1) {
                        connected.sort(compareIndices);
                        passThroughs.push(connected.map(info => info.fcIndex));
                    }
                }
            }
            typeString += getPinName(output.type, output.element.getPin(output.index));
        });
        typeString += ']';
        if (name)
            typeString += '(' + name + ')';
        const partial = !!(subgraphInfo.inWires.size > 0);
        return { typeString, passThroughs, partial };
    }
    // Update the derived 'type' property. Delete any wires that are no longer compatible with
    // the type.
    updateType(element, type) {
        var _a;
        // Make sure type and inWires and outWires arrays are consistent.
        // TODO split into two functions.
        const inputs = type.inputs.length, outputs = type.outputs.length, inWires = element.inWires, outWires = element.outWires;
        element.type = type;
        for (let i = 0; i < inWires.length; i++) {
            const wire = inWires[i];
            if (wire) {
                if (i >= inputs || !this.isValidWire(wire)) { // no pin at this index.
                    this.deleteItem(wire);
                }
                else {
                    const srcType = (_a = wire.src) === null || _a === void 0 ? void 0 : _a.type.outputs[wire.srcPin].type;
                    if (!srcType || !srcType.canConnectTo(type.inputs[i].type)) { // incompatible types.
                        this.deleteItem(wire);
                    }
                }
            }
        }
        if (inputs > inWires.length) {
            // for (let i = inWires.length; i < inputs; i++) {
            //   inWires[i] = undefined;
            // }
        }
        inWires.length = inputs;
        // outWires.length >= outputs.
        for (let i = 0; i < outWires.length; i++) {
            const wires = outWires[i];
            if (wires.length === 0)
                continue;
            wires.slice().forEach(wire => {
                var _a;
                if (i >= outputs || !this.isValidWire(wire)) { // no pin at this index.
                    this.deleteItem(wire);
                }
                else {
                    const dstType = (_a = wire.dst) === null || _a === void 0 ? void 0 : _a.type.inputs[wire.dstPin].type;
                    if (!dstType || !type.outputs[i].type.canConnectTo(dstType)) { // incompatible types.
                        this.deleteItem(wire);
                    }
                }
            });
        }
        if (outputs > outWires.length) {
            for (let i = outWires.length; i < outputs; i++) {
                if (!outWires[i]) {
                    outWires[i] = new Array();
                }
            }
        }
        outWires.length = outputs;
    }
    updateItem(item) {
        if (item instanceof Wire)
            return;
        // Update 'type' property for functioncharts and their instances.
        if (item instanceof Functionchart) {
            const typeInfo = this.getFunctionchartTypeInfo(item), typeString = typeInfo.typeString, type = parseTypeString(typeString);
            item.type = type;
            item.passThroughs = typeInfo.passThroughs.length > 0 ? typeInfo.passThroughs : undefined;
            // Update all instances of the functionchart.
            // TODO store the typestring on instances, and use that instead.
            this.fcMap.forValues(item, instance => {
                instance.type = type;
            });
            this.fcMap.forValues(item, instance => {
                this.updateType(instance, type);
            });
        }
        else if (item instanceof FunctionInstance) {
            const functionChart = item.functionchart;
            if (functionChart) {
                this.updateType(item, functionChart.type);
            }
        }
        else if (item.typeString) {
            this.updateType(item, parseTypeString(item.typeString));
        }
        // Update child items with our current position.
        this.visitNonWires(item, item => this.setGlobalPosition(item));
    }
    insertElement(element, parent) {
        this.elements.add(element);
        element.parent = parent;
        this.updateItem(element);
        this.sorted = undefined;
        // TODO clean up.
        if (element instanceof FunctionInstance) {
            const functionChart = element.functionchart;
            this.fcMap.add(functionChart, element);
        }
    }
    removeElement(element) {
        this.elements.delete(element);
        this.sorted = undefined;
        if (element instanceof FunctionInstance) {
            const functionChart = element.functionchart;
            this.fcMap.delete(functionChart, element);
        }
    }
    // Parent can be undefined in the case of the root functionchart.
    insertFunctionchart(functionchart, parent) {
        this.functioncharts.add(functionchart);
        functionchart.parent = parent;
        const self = this;
        functionchart.nonWires.forEach(item => self.insertItem(item, functionchart));
        functionchart.wires.forEach(wire => self.insertWire(wire, functionchart));
        // Update function chart after all descendants have been added and updated. We need that
        // in order to compute the type info for the functionchart.
        this.updateItem(functionchart);
    }
    removeFunctionchart(functionchart) {
        this.functioncharts.delete(functionchart);
        const self = this;
        functionchart.wires.forEach(wire => self.removeWire(wire));
        functionchart.nonWires.forEach(element => self.removeItem(element));
    }
    insertWire(wire, parent) {
        this.wires.add(wire);
        wire.parent = parent;
        this.updateItem(wire);
        this.sorted = undefined;
        const src = wire.src, srcPin = wire.srcPin, dst = wire.dst, dstPin = wire.dstPin;
        if (src && srcPin >= 0) {
            let outputs = src.outWires[srcPin];
            if (!outputs) {
                outputs = new Array();
                src.outWires[srcPin] = outputs;
            }
            if (!outputs.includes(wire))
                outputs.push(wire);
        }
        if (dst && dstPin >= 0) {
            dst.inWires[dstPin] = wire;
        }
    }
    static removeWireHelper(array, wire) {
        if (array) {
            const index = array.indexOf(wire);
            if (index >= 0) {
                array.splice(index, 1);
            }
        }
    }
    removeWire(wire) {
        this.wires.delete(wire);
        this.sorted = undefined; // Removal might break a cycle, making an unsortable graph sortable.
        const src = wire.src, dst = wire.dst;
        if (src) {
            const outputs = src.outWires[wire.srcPin];
            FunctionchartContext.removeWireHelper(outputs, wire);
        }
        if (dst) {
            const inputs = dst.inWires;
            inputs[wire.dstPin] = undefined;
        }
    }
    insertItem(item, parent) {
        if (item instanceof Wire) {
            if (parent && this.functioncharts.has(parent)) {
                this.insertWire(item, parent);
            }
        }
        else if (item instanceof Functionchart) {
            if (parent && this.functioncharts.has(parent)) {
                this.insertFunctionchart(item, parent);
            }
        }
        else {
            if (parent && this.functioncharts.has(parent)) {
                this.insertElement(item, parent);
            }
        }
    }
    removeItem(item) {
        if (item instanceof Wire)
            this.removeWire(item);
        else if (item instanceof Functionchart)
            this.removeFunctionchart(item);
        else
            this.removeElement(item);
    }
    // DataContext interface implementation.
    valueChanged(owner, prop, oldValue) {
        if (owner instanceof Wire) {
            if (this.wires.has(owner)) {
                // Remove and reinsert changed wires.
                if (prop === wireTemplate.src) {
                    const oldSrc = oldValue, srcPin = owner.srcPin;
                    if (oldSrc && srcPin >= 0) // TODO systematize the valid wire check.
                        FunctionchartContext.removeWireHelper(oldSrc.outWires[srcPin], owner);
                }
                else if (prop === wireTemplate.dst) {
                    const oldDst = oldValue, dstPin = owner.dstPin;
                    if (oldDst && dstPin >= 0)
                        oldDst.inWires[dstPin] = undefined;
                }
                else if (prop === wireTemplate.srcPin) {
                    const src = owner.src, oldPin = oldValue;
                    if (src && oldPin >= 0) {
                        const oldOutputs = src.outWires[oldPin];
                        if (oldOutputs) // oldPin might be invalid.
                            FunctionchartContext.removeWireHelper(oldOutputs, owner);
                    }
                }
                else if (prop === wireTemplate.dstPin) {
                    const dst = owner.dst, oldPin = oldValue;
                    if (dst && oldPin >= 0)
                        dst.inWires[oldPin] = undefined;
                }
                this.insertWire(owner, owner.parent);
            }
        }
        else if (owner instanceof FunctionInstance) {
            if (this.elements.has(owner)) {
                if (prop === functionchartProp) {
                    owner.type = owner.functionchart.type;
                }
            }
        }
        else if (owner instanceof Element || owner instanceof Pseudoelement) {
            if (this.elements.has(owner)) {
                if (prop === typeStringProp) {
                    const type = parseTypeString(owner.typeString);
                    owner.type = type;
                    this.updateType(owner, type);
                }
            }
        }
        this.onValueChanged(owner, prop, oldValue);
        this.updateItem(owner); // Update any derived properties.
    }
    elementInserted(owner, prop, index) {
        const value = prop.get(owner).at(index);
        this.insertItem(value, owner);
        this.onElementInserted(owner, prop, index);
    }
    elementRemoved(owner, prop, index, oldValue) {
        this.removeItem(oldValue);
        this.onElementRemoved(owner, prop, index, oldValue);
    }
    resolveReference(owner, prop) {
        // Look up element id.
        const id = prop.getId(owner);
        if (!id)
            return undefined;
        return this.referentMap.get(id);
    }
    construct(typeName) {
        switch (typeName) {
            case 'literal':
            case 'binop':
            case 'unop':
            case 'cond':
            case 'import':
            case 'export':
            case 'store':
            case 'element': return this.newElement(typeName);
            case 'input':
            case 'output':
            case 'apply':
            case 'pass': return this.newPseudoelement(typeName);
            case 'wire': return this.newWire(undefined, -1, undefined, -1);
            case 'functionchart': return this.newFunctionchart();
            case 'instance': return this.newFunctionInstance();
        }
        throw new Error('Unknown type');
    }
    onChanged(change) {
        // console.log(change);
        super.onEvent('changed', change);
        return change;
    }
    onValueChanged(owner, prop, oldValue) {
        const change = { type: 'valueChanged', item: owner, prop, index: 0, oldValue };
        super.onEvent('valueChanged', change);
        return this.onChanged(change);
    }
    onElementInserted(owner, prop, index) {
        const change = { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
        super.onEvent('elementInserted', change);
        return this.onChanged(change);
    }
    onElementRemoved(owner, prop, index, oldValue) {
        const change = { type: 'elementRemoved', item: owner, prop: prop, index: index, oldValue: oldValue };
        super.onEvent('elementRemoved', change);
        return this.onChanged(change);
    }
}
//------------------------------------------------------------------------------
class FunctionchartTheme extends Theme {
    constructor(theme, radius = 8) {
        super();
        this.textIndent = 8;
        this.textLeading = 6;
        this.knobbyRadius = 4;
        this.padding = 8;
        this.spacing = 8;
        this.minTypeWidth = 8;
        this.minTypeHeight = 8;
        this.minFunctionchartWidth = 64;
        this.minFunctionchartHeight = 32;
        Object.assign(this, theme);
        this.radius = radius;
        // Layout the base types.
        Type.valueType.width = Type.starType.width = radius;
        Type.valueType.height = Type.starType.height = Type.spacerType.height = radius;
    }
}
class ElementHitResult {
    constructor(item, inner) {
        this.input = -1;
        this.output = -1;
        this.item = item;
        this.inner = inner;
    }
}
class WireHitResult {
    constructor(item, inner) {
        this.item = item;
        this.inner = inner;
    }
}
class FunctionchartHitResult {
    constructor(item, inner, instancer) {
        this.item = item;
        this.inner = inner;
        this.instancer = instancer;
    }
}
var RenderMode;
(function (RenderMode) {
    RenderMode[RenderMode["Normal"] = 0] = "Normal";
    RenderMode[RenderMode["Palette"] = 1] = "Palette";
    RenderMode[RenderMode["Highlight"] = 2] = "Highlight";
    RenderMode[RenderMode["HotTrack"] = 3] = "HotTrack";
    RenderMode[RenderMode["Print"] = 4] = "Print";
})(RenderMode || (RenderMode = {}));
class Renderer {
    constructor(theme) {
        this.theme = new FunctionchartTheme(theme);
    }
    begin(ctx) {
        this.ctx = ctx;
        ctx.save();
        ctx.font = this.theme.font;
    }
    end() {
        this.ctx.restore();
    }
    getItemRect(item) {
        let x, y, width, height;
        if (item instanceof Wire) {
            const extents = getExtents(item.bezier);
            x = extents.xmin;
            y = extents.ymin;
            width = extents.xmax - x;
            height = extents.ymax - y;
        }
        else {
            const global = item.globalPosition;
            x = global.x,
                y = global.y;
            if (item instanceof Functionchart) {
                width = item.width;
                height = item.height;
            }
            else {
                // Element, Pseudoelement, FunctionInstance.
                const type = item.type;
                width = type.width;
                height = type.height;
            }
        }
        return { x, y, width, height };
    }
    getBounds(items) {
        let xMin = Number.POSITIVE_INFINITY, yMin = Number.POSITIVE_INFINITY, xMax = -Number.POSITIVE_INFINITY, yMax = -Number.POSITIVE_INFINITY;
        for (let item of items) {
            const rect = this.getItemRect(item);
            xMin = Math.min(xMin, rect.x);
            yMin = Math.min(yMin, rect.y);
            xMax = Math.max(xMax, rect.x + rect.width);
            yMax = Math.max(yMax, rect.y + rect.height);
        }
        return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
    }
    // Gets the bounding rect for the functionchart instancing element.
    getFunctionchartInstanceBounds(type, bounds) {
        const theme = this.theme, spacing = theme.spacing, width = type.width, height = type.height, x = bounds.x + bounds.width - width - spacing, y = bounds.y + bounds.height - height - spacing;
        return { x, y, width, height };
    }
    pinToPoint(element, index, isInput) {
        const rect = this.getItemRect(element), w = rect.width, h = rect.height, type = element.type;
        let x = rect.x, y = rect.y, pin, nx;
        if (isInput) {
            pin = type.inputs[index];
            nx = -1;
        }
        else {
            pin = type.outputs[index];
            nx = 1;
            x += w;
        }
        y += pin.y + pin.height / 2;
        return { x: x, y: y, nx: nx, ny: 0 };
    }
    // Compute sizes for an element type.
    layoutType(type) {
        const self = this, ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, spacing = theme.spacing, name = type.name, inputs = type.inputs, outputs = type.outputs;
        let height = 0, width = 0;
        if (name) {
            width = 2 * spacing + ctx.measureText(name).width;
            height += textSize + spacing / 2;
        }
        else {
            height += spacing / 2;
        }
        function layoutPins(pins) {
            let y = height, w = 0;
            for (let i = 0; i < pins.length; i++) {
                let pin = pins[i];
                self.layoutPin(pin);
                pin.y = y + spacing / 2;
                let name = pin.name, pw = pin.width, ph = pin.height + spacing / 2;
                if (name) {
                    pin.baseline = y + textSize;
                    if (textSize > ph) {
                        pin.y += (textSize - ph) / 2;
                        ph = textSize;
                    }
                    else {
                        pin.baseline += (ph - textSize) / 2;
                    }
                    pw += 2 * spacing + ctx.measureText(name).width;
                }
                y += ph;
                w = Math.max(w, pw);
            }
            return [y, w];
        }
        const [yIn, wIn] = layoutPins(inputs);
        const [yOut, wOut] = layoutPins(outputs);
        type.width = Math.round(Math.max(width, wIn + 2 * spacing + wOut, theme.minTypeWidth));
        type.height = Math.round(Math.max(yIn, yOut, theme.minTypeHeight) + spacing / 2);
    }
    layoutPin(pin) {
        const type = pin.type;
        if (type.needsLayout)
            this.layoutType(type);
        pin.width = type.width;
        pin.height = type.height;
    }
    layoutElement(element) {
        const type = element.type;
        if (type.needsLayout)
            this.layoutType(type);
    }
    layoutWire(wire) {
        let src = wire.src, dst = wire.dst, p1 = wire.pSrc, p2 = wire.pDst;
        // Since we intercept change events and not transactions, wires may be in
        // an inconsistent state, so check before creating the path.
        if (src && wire.srcPin >= 0) {
            p1 = this.pinToPoint(src, wire.srcPin, false);
        }
        if (dst && wire.dstPin >= 0) {
            p2 = this.pinToPoint(dst, wire.dstPin, true);
        }
        if (p1 && p2) {
            wire.bezier = getEdgeBezier(p1, p2, 24);
        }
    }
    // Make sure a functionchart is big enough to enclose its contents.
    layoutFunctionchart(functionchart) {
        const self = this, spacing = this.theme.spacing;
        function layout(functionChart) {
            const type = functionchart.type, nonWires = functionChart.nonWires;
            if (type.needsLayout)
                self.layoutType(type);
            let width, height;
            if (nonWires.length === 0) {
                width = self.theme.minFunctionchartWidth;
                height = self.theme.minFunctionchartHeight;
            }
            else {
                const extents = self.getBounds(nonWires.asArray()), global = functionChart.globalPosition, x = global.x, y = global.y, margin = 2 * spacing;
                width = extents.x + extents.width - x + margin;
                height = extents.y + extents.height - y + margin;
                width += type.width;
                height = Math.max(height, type.height + margin);
            }
            // TODO check for value change before setting.
            functionchart.width = Math.max(width, functionchart.width);
            functionchart.height = Math.max(height, functionchart.height);
        }
        // Visit in reverse order to correctly include sub-functionchart bounds.
        functionchart.context.reverseVisitAll(functionchart, item => {
            if (item instanceof Functionchart)
                layout(item);
        });
    }
    drawType(type, x, y, fillOutputs) {
        const self = this, ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, spacing = theme.spacing, name = type.name, w = type.width, h = type.height, right = x + w;
        ctx.lineWidth = 0.5;
        ctx.fillStyle = theme.textColor;
        ctx.textBaseline = 'bottom';
        if (name) {
            ctx.textAlign = 'center';
            ctx.fillText(name, x + w / 2, y + textSize + spacing / 2);
        }
        type.inputs.forEach(function (pin, i) {
            const name = pin.name;
            self.drawPin(pin, x, y + pin.y, false);
            if (name) {
                ctx.textAlign = 'left';
                ctx.fillText(name, x + pin.width + spacing, y + pin.baseline);
            }
        });
        type.outputs.forEach(function (pin) {
            const name = pin.name, pinLeft = right - pin.width;
            self.drawPin(pin, pinLeft, y + pin.y, fillOutputs);
            if (name) {
                ctx.textAlign = 'right';
                ctx.fillText(name, pinLeft - spacing, y + pin.baseline);
            }
        });
    }
    drawPin(pin, x, y, fill) {
        const ctx = this.ctx, theme = this.theme;
        ctx.strokeStyle = theme.strokeColor;
        if (pin.type === Type.valueType || pin.type === Type.starType) {
            const r = theme.knobbyRadius;
            ctx.beginPath();
            if (pin.type === Type.valueType) {
                const d = 2 * r;
                ctx.rect(x, y, d, d);
            }
            else {
                ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
            }
            ctx.stroke();
        }
        else if (pin.type) {
            const type = pin.type, width = type.width, height = type.height;
            ctx.beginPath();
            ctx.rect(x, y, width, height);
            // if (level == 1) {
            //   ctx.fillStyle = theme.altBgColor;
            //   ctx.fill();
            // }
            ctx.stroke();
            this.drawType(type, x, y, false);
        }
    }
    drawElement(element, mode) {
        const ctx = this.ctx, theme = this.theme, spacing = theme.spacing, rect = this.getItemRect(element), x = rect.x, y = rect.y, w = rect.width, h = rect.height, right = x + w, bottom = y + h;
        if (element instanceof Pseudoelement) {
            switch (element.template.typeName) {
                case 'input':
                    inFlagPath(x, y, w, h, spacing, ctx);
                    break;
                case 'output':
                    outFlagPath(x, y, w, h, spacing, ctx);
                    break;
                case 'apply':
                case 'pass':
                    ctx.beginPath();
                    ctx.rect(x, y, w, h);
            }
        }
        else {
            ctx.beginPath();
            ctx.rect(x, y, w, h);
        }
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Palette:
            case RenderMode.Print:
                ctx.fillStyle = (mode === RenderMode.Palette) ? theme.altBgColor : theme.bgColor;
                ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                // const passThroughs = element.passThroughs;  // TODO pass rendering
                // if (passThroughs) {
                // }
                this.drawType(element.type, x, y, false);
                break;
            case RenderMode.Highlight:
                ctx.strokeStyle = theme.highlightColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            case RenderMode.HotTrack:
                ctx.strokeStyle = theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
    }
    drawFunctionchart(functionchart, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.radius, rect = this.getItemRect(functionchart), x = rect.x, y = rect.y, w = rect.width, h = rect.height, textSize = theme.fontSize;
        roundRectPath(x, y, w, h, r, ctx);
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Palette:
            case RenderMode.Print:
                ctx.fillStyle = (mode === RenderMode.Palette) ? theme.altBgColor : theme.bgColor;
                ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                const type = functionchart.type, instanceRect = this.getFunctionchartInstanceBounds(type, rect);
                ctx.beginPath();
                ctx.rect(instanceRect.x, instanceRect.y, instanceRect.width, instanceRect.height);
                ctx.fillStyle = theme.altBgColor;
                ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                if (type !== Type.emptyType)
                    this.drawType(type, instanceRect.x, instanceRect.y, false);
                break;
            case RenderMode.Highlight:
            case RenderMode.HotTrack:
                roundRectPath(x, y, w, h, r, ctx);
                ctx.strokeStyle = mode === RenderMode.Highlight ? theme.highlightColor : theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
    }
    hitTestElement(element, p, tol, mode) {
        const rect = this.getItemRect(element), x = rect.x, y = rect.y, width = rect.width, height = rect.height, hitInfo = hitTestRect(x, y, width, height, p, tol);
        if (hitInfo) {
            const result = new ElementHitResult(element, hitInfo), type = element.type;
            type.inputs.forEach(function (input, i) {
                if (hitTestRect(x, y + input.y, input.width, input.height, p, 0)) {
                    result.input = i;
                }
            });
            type.outputs.forEach(function (output, i) {
                if (hitTestRect(x + width - output.width, y + output.y, output.width, output.height, p, 0)) {
                    result.output = i;
                }
            });
            return result;
        }
    }
    hitTestFunctionchart(functionchart, p, tol, mode) {
        const theme = this.theme, r = theme.radius, rect = this.getItemRect(functionchart), x = rect.x, y = rect.y, w = rect.width, h = rect.height, inner = hitTestRect(x, y, w, h, p, tol);
        if (inner) {
            const instanceRect = this.getFunctionchartInstanceBounds(functionchart.type, rect), instancer = hitTestRect(instanceRect.x, instanceRect.y, instanceRect.width, instanceRect.height, p, tol) !== undefined;
            return new FunctionchartHitResult(functionchart, inner, instancer);
        }
    }
    drawWire(wire, mode) {
        const theme = this.theme, ctx = this.ctx;
        bezierEdgePath(wire.bezier, ctx, 0);
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Palette:
            case RenderMode.Print:
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 1;
                break;
            case RenderMode.Highlight:
                ctx.strokeStyle = theme.highlightColor;
                ctx.lineWidth = 2;
                break;
            case RenderMode.HotTrack:
                ctx.strokeStyle = theme.hotTrackColor;
                ctx.lineWidth = 2;
                break;
        }
        ctx.stroke();
    }
    hitTestWire(wire, p, tol, mode) {
        // TODO don't hit test new wire as it's dragged.
        const hitInfo = hitTestBezier(wire.bezier, p, tol);
        if (hitInfo) {
            return new WireHitResult(wire, hitInfo);
        }
    }
    draw(item, mode) {
        if (item instanceof ElementBase) {
            this.drawElement(item, mode);
        }
        else if (item instanceof Wire) {
            this.drawWire(item, mode);
        }
        else if (item instanceof Functionchart) {
            this.drawFunctionchart(item, mode);
        }
    }
    hitTest(item, p, tol, mode) {
        let hitInfo;
        if (item instanceof ElementBase) {
            hitInfo = this.hitTestElement(item, p, tol, mode);
        }
        else if (item instanceof Wire) {
            hitInfo = this.hitTestWire(item, p, tol, mode);
        }
        else if (item instanceof Functionchart) {
            hitInfo = this.hitTestFunctionchart(item, p, tol, mode);
        }
        return hitInfo;
    }
    layout(item) {
        if (item instanceof ElementBase) {
            this.layoutElement(item);
        }
        else if (item instanceof Wire) {
            this.layoutWire(item);
        }
        else if (item instanceof Functionchart) {
            this.layoutFunctionchart(item);
        }
    }
    drawHoverText(item, p, nameValuePairs) {
        const self = this, ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, gap = 16, border = 4, height = textSize * nameValuePairs.length + 2 * border, maxWidth = measureNameValuePairs(nameValuePairs, gap, ctx) + 2 * border;
        let x = p.x, y = p.y;
        ctx.fillStyle = theme.hoverColor;
        ctx.fillRect(x, y, maxWidth, height);
        ctx.fillStyle = theme.hoverTextColor;
        nameValuePairs.forEach(function (pair) {
            ctx.textAlign = 'left';
            ctx.fillText(pair.name, x + border, y + textSize);
            ctx.textAlign = 'right';
            ctx.fillText(pair.value, x + maxWidth - border, y + textSize);
            y += textSize;
        });
    }
}
// --------------------------------------------------------------------------------------------
function isDropTarget(hitInfo) {
    const item = hitInfo.item, selection = item.context.selection;
    // We can't drop onto the selection which is being dragged.
    if (selection.has(item) || ancestorInSet(item, selection))
        return false;
    // We can drop anything onto a functionchart.
    if (hitInfo instanceof FunctionchartHitResult)
        return true;
    const lastSelected = selection.lastSelected;
    if (hitInfo instanceof ElementHitResult && lastSelected instanceof ElementBase) {
        // Drop onto an element requires type compatibility.
        return lastSelected.type.canConnectTo(hitInfo.item.type);
    }
    return false;
}
function isClickable(hitInfo) {
    return true;
}
function isDraggable(hitInfo) {
    return !(hitInfo instanceof Wire);
}
function isElementInputPin(hitInfo) {
    return hitInfo instanceof ElementHitResult && hitInfo.input >= 0;
}
function isElementOutputPin(hitInfo) {
    return hitInfo instanceof ElementHitResult && hitInfo.output >= 0;
}
function hasProperties(hitInfo) {
    return !(hitInfo instanceof Wire);
}
class NonWireDrag {
    constructor(items, type, description) {
        this.items = items;
        this.kind = type;
        this.description = description;
    }
}
class WireDrag {
    constructor(transition, type, description) {
        this.wire = transition;
        this.kind = type;
        this.description = description;
    }
}
export class FunctionchartEditor {
    constructor(theme, canvasController, paletteController, propertyGridController) {
        this.scrap = [];
        this.clickInPalette = false;
        this.propertyInfo = new Map();
        const self = this;
        this.theme = new FunctionchartTheme(theme);
        this.canvasController = canvasController;
        this.paletteController = paletteController;
        this.propertyGridController = propertyGridController;
        this.fileController = new FileController();
        this.hitTolerance = 8;
        // Change tracking for layout.
        // Changed items that must be updated before drawing and hit testing.
        this.changedItems = new Set();
        // Changed top level functioncharts that must be laid out after transactions and undo/redo.
        this.changedTopLevelFunctioncharts = new Set();
        const renderer = new Renderer(theme);
        this.renderer = renderer;
        // Embed the palette items in a Functionchart so the renderer can do layout and drawing.
        const context = new FunctionchartContext(), functionchart = context.newFunctionchart(), input = context.newPseudoelement('input'), output = context.newPseudoelement('output'), apply = context.newPseudoelement('apply'), pass = context.newPseudoelement('pass'), literal = context.newElement('literal'), binop = context.newElement('binop'), unop = context.newElement('unop'), cond = context.newElement('cond'), store = context.newElement('store'), newFunctionchart = context.newFunctionchart();
        context.root = functionchart;
        input.x = 8;
        input.y = 8;
        output.x = 40;
        output.y = 8;
        apply.x = 68;
        apply.y = 8;
        pass.x = 96;
        pass.y = 8;
        literal.x = 8;
        literal.y = 32;
        binop.x = 40;
        binop.y = 32;
        binop.typeString = '[vv,v](+)'; // binary addition
        unop.x = 80;
        unop.y = 32;
        unop.typeString = '[v,v](-)'; // unary negation
        cond.x = 118;
        cond.y = 32; // conditional
        store.x = 156;
        store.y = 32;
        newFunctionchart.x = 8;
        newFunctionchart.y = 82;
        newFunctionchart.width = this.theme.minFunctionchartWidth;
        newFunctionchart.height = this.theme.minFunctionchartHeight;
        functionchart.nonWires.append(input);
        functionchart.nonWires.append(output);
        functionchart.nonWires.append(apply);
        functionchart.nonWires.append(store);
        functionchart.nonWires.append(pass);
        functionchart.nonWires.append(literal);
        functionchart.nonWires.append(binop);
        functionchart.nonWires.append(unop);
        functionchart.nonWires.append(cond);
        functionchart.nonWires.append(newFunctionchart);
        context.root = functionchart;
        this.palette = functionchart;
        // Default Functionchart.
        this.context = new FunctionchartContext();
        this.initializeContext(this.context);
        this.functionchart = this.context.root;
        // Register property grid layouts.
        function getter(info, item) {
            return item ? info.prop.get(item) : '';
        }
        function setter(info, item, value) {
            if (item && (info.prop instanceof ScalarProp || info.prop instanceof ReferenceProp)) {
                const description = 'change ' + info.label, context = self.context;
                context.beginTransaction(description);
                info.prop.set(item, value);
                context.endTransaction();
                self.canvasController.draw();
            }
        }
        function elementLabelGetter(info, item) {
            switch (item.template.typeName) {
                case 'input': // [,v(label)]
                    return item.type.outputs[0].name || '';
                case 'output': // [v(label),]
                    return item.type.inputs[0].name || '';
                case 'literal': // [,v(label)]
                    return item.type.outputs[0].name || '';
                case 'binop': // [vv,v](label)
                case 'unop': // [v,v](label)
            }
            return '';
        }
        function elementLabelSetter(info, item, value) {
            const labelPart = value ? '(' + value + ')' : '';
            let newValue;
            switch (item.template.typeName) {
                case 'input': // [,v(label)]
                    newValue = '[,*' + labelPart + ']';
                    break;
                case 'output': // [v(label),]
                    newValue = '[*' + labelPart + ',]';
                    break;
                case 'literal': // [,v(label)]
                    newValue = '[,v' + labelPart + ']';
                    break;
                case 'binop': // [vv,v](label)
                    newValue = '[vv,v]' + labelPart;
                    break;
                case 'unop': // [v,v](label)
                    newValue = '[v,v]' + labelPart;
                    break;
            }
            setter(info, item, newValue);
        }
        this.propertyInfo.set('input', [
            {
                label: 'label',
                type: 'text',
                getter: elementLabelGetter,
                setter: elementLabelSetter,
                prop: typeStringProp,
            }
        ]);
        this.propertyInfo.set('output', [
            {
                label: 'label',
                type: 'text',
                getter: elementLabelGetter,
                setter: elementLabelSetter,
                prop: typeStringProp,
            }
        ]);
        this.propertyInfo.set('literal', [
            {
                label: 'value',
                type: 'text',
                getter: elementLabelGetter,
                setter: elementLabelSetter,
                prop: typeStringProp,
            }
        ]);
        const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
            '|', '&', '||', '&&'];
        this.propertyInfo.set('binop', [
            {
                label: 'operator',
                type: 'enum',
                values: binaryOps.join(','),
                getter: elementLabelGetter,
                setter: elementLabelSetter,
                prop: typeStringProp,
            },
        ]);
        const unaryOps = ['!', '~', '-'];
        this.propertyInfo.set('unop', [
            {
                label: 'operator',
                type: 'enum',
                values: unaryOps.join(','),
                getter: elementLabelGetter,
                setter: elementLabelSetter,
                prop: typeStringProp,
            },
        ]);
        this.propertyInfo.set('functionchart', [
            {
                label: 'name',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: nameProp,
            },
            // {
            //   label: 'explicit',
            //   type: 'boolean',
            //   getter: getter,
            //   setter: setter,
            //   prop: explicitProp,
            // },
        ]);
        this.propertyInfo.forEach((info, key) => {
            propertyGridController.register(key, info);
        });
    }
    initializeContext(context) {
        const self = this;
        // On attribute changes and item insertions, dynamically layout affected items.
        // This allows us to layout transitions as their src or dst elements are dragged.
        context.addHandler('changed', change => self.onChanged(change));
        // On ending transactions and undo/redo, layout the changed top level functioncharts.
        function update() {
            self.updateBounds();
        }
        context.addTransactionHandler('transactionEnding', update);
        context.addTransactionHandler('didUndo', update);
        context.addTransactionHandler('didRedo', update);
    }
    setContext(context) {
        // Make sure any function instances don't get detached from their functioncharts.
        const functioncharts = new Set();
        this.scrap.forEach(item => {
            context.visitAll(item, item => {
                if (item instanceof FunctionInstance) {
                    functioncharts.add(item.functionchart); // prepend so they precede instances.
                }
            });
        });
        this.scrap.splice(0, 0, ...functioncharts);
        const functionchart = context.root, renderer = this.renderer;
        this.context = context;
        this.functionchart = functionchart;
        this.changedItems.clear();
        this.changedTopLevelFunctioncharts.clear();
        // renderer.setModel(model);
        // Layout any items in the functionchart.
        renderer.begin(this.canvasController.getCtx());
        context.reverseVisitAll(this.functionchart, item => renderer.layout(item));
        renderer.end();
    }
    initialize(canvasController) {
        if (canvasController === this.canvasController) {
        }
        else {
            const renderer = this.renderer;
            // Layout the palette items and their parent functionchart.
            renderer.begin(canvasController.getCtx());
            this.context.reverseVisitAll(this.palette, item => renderer.layout(item));
            // Draw the palette items.
            this.palette.nonWires.forEach(item => renderer.draw(item, RenderMode.Print));
            renderer.end();
        }
    }
    onChanged(change) {
        const functionchart = this.functionchart, context = this.context, changedItems = this.changedItems, changedTopLevelStates = this.changedTopLevelFunctioncharts, item = change.item, prop = change.prop;
        // Track all top level functioncharts which contain changes. On ending a transaction,
        // update the layout of functioncharts.
        let ancestor = item, topLevel;
        do {
            topLevel = ancestor;
            ancestor = ancestor.parent;
        } while (ancestor && ancestor !== functionchart);
        if (ancestor === functionchart && topLevel instanceof Functionchart) {
            changedTopLevelStates.add(topLevel);
        }
        function addItems(item) {
            if (item instanceof ElementBase) {
                // Layout the state's incoming and outgoing transitions.
                context.forInWires(item, addItems);
                context.forOutWires(item, addItems);
            }
            changedItems.add(item);
        }
        switch (change.type) {
            case 'valueChanged': {
                // For changes to x, y, width, height, or typeString, layout affected transitions.
                if (prop === xProp || prop === yProp || prop === widthProp || prop === heightProp ||
                    prop === typeStringProp) {
                    // Visit item and sub-items to layout all affected wires.
                    context.visitAll(item, addItems);
                }
                else if (item instanceof Wire) {
                    addItems(item);
                }
                break;
            }
            case 'elementInserted': {
                // Update item subtrees as they are inserted.
                context.reverseVisitAll(prop.get(item).at(change.index), addItems);
                break;
            }
        }
    }
    updateLayout() {
        const renderer = this.renderer, context = this.context, changedItems = this.changedItems;
        // This function is called during the draw, hitTest, and updateBounds_ methods,
        // so the renderer is started.
        // First layout containers, and then layout wires which depend on elements'
        // size and location.
        function layout(item, visitor) {
            context.reverseVisitAll(item, visitor);
        }
        // Layout elements. Functioncharts are updated at the end of the transaction.
        changedItems.forEach(item => {
            layout(item, item => {
                if (item instanceof ElementBase)
                    renderer.layout(item);
            });
        });
        changedItems.forEach(item => {
            layout(item, item => {
                if (item instanceof Wire && context.isValidWire(item)) // Wire may be invalid after edit.
                    renderer.layout(item);
            });
        });
        changedItems.clear();
    }
    updateBounds() {
        const ctx = this.canvasController.getCtx(), renderer = this.renderer, context = this.context, functionchart = this.functionchart, changedTopLevelFunctioncharts = this.changedTopLevelFunctioncharts;
        renderer.begin(ctx);
        // Update any changed items first.
        this.updateLayout();
        // Then update the bounds of super states, bottom up.
        changedTopLevelFunctioncharts.forEach(functionchart => context.reverseVisitAll(functionchart, item => {
            if (!context.contains(item))
                return;
            if (!(item instanceof Wire))
                renderer.layout(item);
        }));
        // Finally update the root functionchart's bounds.
        renderer.layoutFunctionchart(functionchart);
        renderer.end();
        changedTopLevelFunctioncharts.clear();
        // Make sure the canvas is large enough to contain the root functionchart.
        const canvasController = this.canvasController, canvasSize = canvasController.getSize();
        let width = functionchart.width, height = functionchart.height;
        if (width > canvasSize.width || height > canvasSize.height) {
            width = Math.max(width, canvasSize.width);
            height = Math.max(height, canvasSize.height);
            canvasController.setSize(width, height);
        }
    }
    draw(canvasController) {
        const renderer = this.renderer, functionchart = this.functionchart, context = this.context;
        if (canvasController === this.canvasController) {
            // Draw a dashed border around the canvas.
            const ctx = canvasController.getCtx(), size = canvasController.getSize();
            ctx.strokeStyle = this.theme.strokeColor;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(0, 0, size.width, size.height);
            ctx.setLineDash([]);
            // Now draw the functionchart.
            renderer.begin(ctx);
            this.updateLayout();
            canvasController.applyTransform();
            // Don't draw the root functionchart.
            functionchart.nonWires.forEach(item => {
                context.visitNonWires(item, item => { renderer.draw(item, RenderMode.Normal); });
            });
            // Draw wires after elements.
            context.visitWires(functionchart, wire => {
                renderer.drawWire(wire, RenderMode.Normal);
            });
            // Highlight selection.
            context.selection.forEach(function (item) {
                renderer.draw(item, RenderMode.Highlight);
            });
            if (this.hotTrackInfo)
                renderer.draw(this.hotTrackInfo.item, RenderMode.HotTrack);
            const hoverHitInfo = this.hoverHitInfo;
            if (hoverHitInfo) {
                const item = hoverHitInfo.item, propertyInfo = this.propertyInfo.get(item.template.typeName), nameValuePairs = [];
                if (propertyInfo) {
                    for (let info of propertyInfo) {
                        const name = info.label, value = info.getter(info, item);
                        if (value !== undefined) {
                            nameValuePairs.push({ name, value });
                        }
                    }
                    renderer.drawHoverText(hoverHitInfo.item, this.hoverPoint, nameValuePairs);
                }
            }
            renderer.end();
        }
        else if (canvasController === this.paletteController) {
            // Palette drawing occurs during drag and drop. If the palette has the drag,
            // draw the canvas underneath so the new object will appear on the canvas.
            this.canvasController.draw();
            const ctx = this.paletteController.getCtx();
            renderer.begin(ctx);
            canvasController.applyTransform();
            this.palette.nonWires.forEach(item => { renderer.draw(item, RenderMode.Palette); });
            // Draw any selected object in the palette. Translate object to palette coordinates.
            const offset = canvasController.offsetToOtherCanvas(this.canvasController);
            ctx.translate(offset.x, offset.y);
            context.selection.forEach(item => {
                renderer.draw(item, RenderMode.Normal);
                renderer.draw(item, RenderMode.Highlight);
            });
            renderer.end();
        }
    }
    print() {
        const renderer = this.renderer, context = this.context, canvasController = this.canvasController;
        let functionchart = this.functionchart, renderMode = RenderMode.Print;
        if (true) {
            // Print functionchart.
        }
        else {
            functionchart = this.palette;
            renderMode = RenderMode.Palette;
            // Print palette.
        }
        // Calculate document bounds. We don't need to consider wires as they should be  mostly
        // in the bounds of the elements.
        const items = new Array();
        functionchart.nonWires.forEach(item => items.push(item));
        const bounds = renderer.getBounds(items);
        // Adjust all edges 1 pixel out.
        const ctx = new window.C2S(bounds.width + 2, bounds.height + 2);
        ctx.translate(-bounds.x + 1, -bounds.y + 1);
        renderer.begin(ctx);
        canvasController.applyTransform();
        // Don't draw the root functionchart.
        functionchart.nonWires.forEach(item => {
            context.visitNonWires(item, item => { renderer.draw(item, renderMode); });
        });
        // Draw wires after elements.
        context.visitWires(functionchart, wire => {
            renderer.drawWire(wire, renderMode);
        });
        renderer.end();
        // Write out the SVG file.
        const serializedSVG = ctx.getSerializedSvg();
        const blob = new Blob([serializedSVG], {
            type: 'text/plain'
        });
        window.saveAs(blob, 'functionchart.svg', true);
    }
    getCanvasPosition(canvasController, p) {
        // When dragging from the palette, convert the position from pointer events
        // into the canvas space to render the drag and drop.
        return this.canvasController.viewToOtherCanvasView(canvasController, p);
    }
    hitTestCanvas(p) {
        const renderer = this.renderer, context = this.context, tol = this.hitTolerance, functionchart = this.functionchart, canvasController = this.canvasController, cp = this.getCanvasPosition(canvasController, p), ctx = canvasController.getCtx(), hitList = [];
        function pushInfo(info) {
            if (info)
                hitList.push(info);
        }
        renderer.begin(ctx);
        this.updateLayout();
        // TODO hit test selection first, in highlight, first.
        // Hit test transitions first.
        context.reverseVisitWires(functionchart, (wire) => {
            pushInfo(renderer.hitTestWire(wire, cp, tol, RenderMode.Normal));
        });
        // Skip the root functionchart, as hits there should go to the underlying canvas controller.
        functionchart.nonWires.forEachReverse(item => {
            context.reverseVisitNonWires(item, (item) => {
                pushInfo(renderer.hitTest(item, cp, tol, RenderMode.Normal));
            });
        });
        renderer.end();
        return hitList;
    }
    hitTestPalette(p) {
        const renderer = this.renderer, context = this.context, tol = this.hitTolerance, ctx = this.paletteController.getCtx(), hitList = [];
        function pushInfo(info) {
            if (info)
                hitList.push(info);
        }
        renderer.begin(ctx);
        this.palette.nonWires.forEachReverse(item => {
            pushInfo(renderer.hitTest(item, p, tol, RenderMode.Palette));
        });
        renderer.end();
        return hitList;
    }
    getFirstHit(hitList, filterFn) {
        for (let hitInfo of hitList) {
            if (filterFn(hitInfo))
                return hitInfo;
        }
    }
    getDraggableAncestor(hitList, hitInfo) {
        while (hitInfo && !isDraggable(hitInfo)) {
            const parent = hitInfo.item.parent;
            hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; });
        }
        return hitInfo;
    }
    setPropertyGrid() {
        const context = this.context, item = context.selection.lastSelected, type = item ? item.template.typeName : undefined;
        this.propertyGridController.show(type, item);
    }
    onClick(canvasController) {
        const context = this.context, selection = context.selection, shiftKeyDown = this.canvasController.shiftKeyDown, cmdKeyDown = this.canvasController.cmdKeyDown, p = canvasController.getClickPointerPosition(), cp = canvasController.viewToCanvas(p);
        let hitList;
        if (canvasController === this.paletteController) {
            hitList = this.hitTestPalette(cp);
            this.clickInPalette = true;
        }
        else {
            hitList = this.hitTestCanvas(cp);
            this.clickInPalette = false;
        }
        const pointerHitInfo = this.pointerHitInfo = this.getFirstHit(hitList, isClickable);
        if (pointerHitInfo) {
            this.draggableHitInfo = this.getDraggableAncestor(hitList, pointerHitInfo);
            const item = pointerHitInfo.item;
            if (this.clickInPalette) {
                selection.clear();
            }
            else if (cmdKeyDown) {
                selection.toggle(item);
            }
            else if (shiftKeyDown) {
                selection.add(item);
            }
            else if (!selection.has(item)) {
                selection.set(item);
            }
            else {
                selection.add(item);
            }
        }
        else {
            if (!shiftKeyDown) {
                selection.clear();
            }
        }
        this.setPropertyGrid();
        return pointerHitInfo !== undefined;
    }
    onBeginDrag(canvasController) {
        let pointerHitInfo = this.pointerHitInfo;
        if (!pointerHitInfo)
            return false;
        const context = this.context, selection = context.selection, p0 = canvasController.getClickPointerPosition();
        let dragItem = pointerHitInfo.item;
        let drag, newWire;
        // First check for a drag that creates a new wire.
        if ((pointerHitInfo instanceof ElementHitResult &&
            (pointerHitInfo.input >= 0 || pointerHitInfo.output >= 0))) {
            const element = dragItem, cp0 = this.getCanvasPosition(canvasController, p0);
            if (pointerHitInfo.input >= 0) {
                newWire = context.newWire(undefined, -1, element, pointerHitInfo.input);
                newWire.pSrc = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
                drag = new WireDrag(newWire, 'connectWireSrc', 'Add new wire');
            }
            else if (pointerHitInfo.output >= 0) {
                newWire = context.newWire(element, pointerHitInfo.output, undefined, -1);
                newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
                drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
            }
        }
        else if (pointerHitInfo instanceof WireHitResult) {
            if (pointerHitInfo.inner.t === 0) {
                drag = new WireDrag(dragItem, 'connectWireSrc', 'Edit wire');
            }
            else if (pointerHitInfo.inner.t === 1) {
                drag = new WireDrag(dragItem, 'connectWireDst', 'Edit wire');
            }
        }
        else if (this.draggableHitInfo) {
            pointerHitInfo = this.pointerHitInfo = this.draggableHitInfo;
            if (!(pointerHitInfo instanceof WireHitResult)) {
                if (this.clickInPalette) {
                    drag = new NonWireDrag([pointerHitInfo.item], 'copyPalette', 'Create new element or functionchart');
                }
                else if (this.canvasController.shiftKeyDown) {
                    drag = new NonWireDrag(context.selectedElements(), 'moveCopySelection', 'Move copy of selection');
                }
                else {
                    if (pointerHitInfo instanceof FunctionchartHitResult) {
                        if (pointerHitInfo.inner.border) {
                            drag = new NonWireDrag([pointerHitInfo.item], 'resizeFunctionchart', 'Resize functionchart');
                        }
                        else if (pointerHitInfo.instancer) {
                            drag = new NonWireDrag([pointerHitInfo.item], 'instantiateFunctionchart', 'Create new instance of functionchart');
                        }
                        else {
                            drag = new NonWireDrag(context.selectedElements(), 'moveSelection', 'Move selection');
                        }
                    }
                    else {
                        drag = new NonWireDrag(context.selectedElements(), 'moveSelection', 'Move selection');
                    }
                }
            }
        }
        this.dragInfo = drag;
        if (drag) {
            if (drag.kind === 'moveSelection' || drag.kind === 'moveCopySelection') {
                context.reduceSelection();
            }
            if (drag.kind == 'copyPalette') {
                // Transform palette items into the canvas coordinate system.
                const offset = this.paletteController.offsetToOtherCanvas(this.canvasController), copies = copyItems(drag.items, context);
                copies.forEach(copy => {
                    if (!(copy instanceof Wire)) {
                        copy.x -= offset.x;
                        copy.y -= offset.y;
                    }
                });
                drag.items = copies;
            }
            else if (drag.kind == 'moveCopySelection') {
                const copies = context.copy(); // TODO fix
                drag.items = copies;
            }
            else if (drag.kind === 'instantiateFunctionchart') {
                const functionchart = drag.items[0], newInstance = context.newFunctionInstance(), renderer = this.renderer, bounds = renderer.getItemRect(functionchart), instancerBounds = this.renderer.getFunctionchartInstanceBounds(functionchart.type, bounds); // TODO simplify this
                newInstance.functionchart = functionchart;
                newInstance.x = instancerBounds.x;
                newInstance.y = instancerBounds.y;
                drag.items = [newInstance];
            }
            context.beginTransaction(drag.description);
            if (newWire) {
                context.addItem(newWire, this.functionchart);
                selection.set(newWire);
            }
            else {
                if (drag.kind == 'copyPalette' || drag.kind == 'moveCopySelection' ||
                    drag.kind === 'instantiateFunctionchart') {
                    context.addItems(drag.items, this.functionchart);
                    selection.set(drag.items);
                }
            }
        }
    }
    onDrag(canvasController) {
        const drag = this.dragInfo;
        if (!drag)
            return;
        const context = this.context, renderer = this.renderer, p0 = canvasController.getClickPointerPosition(), cp0 = this.getCanvasPosition(canvasController, p0), p = canvasController.getCurrentPointerPosition(), cp = this.getCanvasPosition(canvasController, p), dx = cp.x - cp0.x, dy = cp.y - cp0.y, pointerHitInfo = this.pointerHitInfo, hitList = this.hitTestCanvas(cp);
        let hitInfo;
        if (drag instanceof NonWireDrag) {
            switch (drag.kind) {
                case 'copyPalette':
                case 'moveCopySelection':
                case 'moveSelection':
                case 'instantiateFunctionchart': {
                    hitInfo = this.getFirstHit(hitList, isDropTarget);
                    context.selection.forEach(item => {
                        if (item instanceof Wire)
                            return;
                        const oldX = context.getOldValue(item, 'x'), oldY = context.getOldValue(item, 'y');
                        item.x = oldX + dx;
                        item.y = oldY + dy;
                    });
                    break;
                }
                case 'resizeFunctionchart': {
                    const hitInfo = pointerHitInfo, item = drag.items[0], oldX = context.getOldValue(item, 'x'), oldY = context.getOldValue(item, 'y'), oldWidth = context.getOldValue(item, 'width'), oldHeight = context.getOldValue(item, 'height');
                    if (hitInfo.inner.left) {
                        item.x = oldX + dx;
                        item.width = oldWidth - dx;
                    }
                    if (hitInfo.inner.top) {
                        item.y = oldY + dy;
                        item.height = oldHeight - dy;
                    }
                    if (hitInfo.inner.right)
                        item.width = oldWidth + dx;
                    if (hitInfo.inner.bottom)
                        item.height = oldHeight + dy;
                    break;
                }
            }
        }
        else if (drag instanceof WireDrag) {
            const wire = drag.wire;
            switch (drag.kind) {
                case 'connectWireSrc': {
                    const dst = wire.dst, dstPin = wire.dstPin, hitInfo = this.getFirstHit(hitList, isElementOutputPin), src = hitInfo ? hitInfo.item : undefined;
                    if (src && dst && src !== dst) {
                        wire.src = src;
                        wire.srcPin = hitInfo.output;
                    }
                    else {
                        wire.src = undefined; // This notifies observers to update the layout.
                        wire.pSrc = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
                    }
                    break;
                }
                case 'connectWireDst': {
                    const src = wire.src, hitInfo = this.getFirstHit(hitList, isElementInputPin), dst = hitInfo ? hitInfo.item : undefined;
                    if (src && dst && src !== dst) {
                        wire.dst = dst;
                        wire.dstPin = hitInfo.input;
                    }
                    else {
                        wire.dst = undefined; // This notifies observers to update the layout.
                        wire.pDst = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
                    }
                    break;
                }
            }
        }
        this.hotTrackInfo = (hitInfo && hitInfo.item !== this.functionchart) ? hitInfo : undefined;
    }
    onEndDrag(canvasController) {
        const drag = this.dragInfo;
        if (!drag)
            return;
        const context = this.context, functionchart = this.functionchart, selection = context.selection, p = canvasController.getCurrentPointerPosition(), cp = this.getCanvasPosition(canvasController, p);
        if (drag instanceof WireDrag) {
            drag.wire.pSrc = drag.wire.pDst = undefined;
        }
        else if (drag instanceof NonWireDrag &&
            (drag.kind == 'copyPalette' || drag.kind === 'moveSelection' ||
                drag.kind === 'moveCopySelection' || drag.kind === 'instantiateFunctionchart')) {
            // Find element or functionchart beneath mouse.
            const hitList = this.hitTestCanvas(cp), hitInfo = this.getFirstHit(hitList, isDropTarget), lastSelected = selection.lastSelected;
            if (hitInfo instanceof ElementHitResult && lastSelected instanceof ElementBase &&
                lastSelected.type.canConnectTo(hitInfo.item.type)) {
                context.replaceElement(hitInfo.item, lastSelected);
            }
            else {
                let parent = functionchart;
                if (hitInfo instanceof FunctionchartHitResult) {
                    parent = hitInfo.item;
                }
                // Reparent items
                selection.contents().forEach(item => {
                    context.addItem(item, parent);
                });
            }
        }
        context.endTransaction();
        this.setPropertyGrid();
        this.dragInfo = undefined;
        this.pointerHitInfo = undefined;
        this.draggableHitInfo = undefined;
        this.hotTrackInfo = undefined;
        this.canvasController.draw();
    }
    createContext(text) {
        const raw = JSON.parse(text), context = new FunctionchartContext();
        const functionchart = Deserialize(raw, context);
        context.root = functionchart;
        this.initializeContext(context);
        this.setContext(context);
        this.renderer.begin(this.canvasController.getCtx());
        this.updateBounds();
        this.canvasController.draw();
    }
    onKeyDown(e) {
        const self = this, context = this.context, functionchart = this.functionchart, selection = context.selection, keyCode = e.keyCode, // TODO fix me.
        cmdKey = e.ctrlKey || e.metaKey, shiftKey = e.shiftKey;
        if (keyCode === 8) { // 'delete'
            context.deleteSelection();
            return true;
        }
        if (cmdKey) {
            switch (keyCode) {
                case 65: { // 'a'
                    functionchart.nonWires.forEach(function (v) {
                        context.selection.add(v);
                    });
                    self.canvasController.draw();
                    return true;
                }
                case 90: { // 'z'
                    if (context.getUndo()) {
                        context.undo();
                        self.canvasController.draw();
                    }
                    return true;
                }
                case 89: { // 'y'
                    if (context.getRedo()) {
                        context.redo();
                        self.canvasController.draw();
                    }
                    return true;
                }
                case 88: { // 'x'
                    this.scrap = context.cut();
                    self.canvasController.draw();
                    return true;
                }
                case 67: { // 'c'
                    this.scrap = context.copy();
                    return true;
                }
                case 86: { // 'v'
                    if (this.scrap.length > 0) {
                        context.paste(this.scrap);
                        this.updateBounds();
                        return true;
                    }
                    return false;
                }
                case 71: { // 'g'
                    context.selection.set(context.selectedNonWires());
                    context.extendSelectionToWires();
                    context.reduceSelection();
                    context.beginTransaction('group items into functionchart');
                    const theme = this.theme, bounds = this.renderer.getBounds(context.selectedNonWires()), contents = context.selectedAllTypes();
                    let parent = context.getContainingFunctionchart(contents);
                    expandRect(bounds, theme.radius, theme.radius);
                    context.group(context.selectedAllTypes(), parent, bounds);
                    context.endTransaction();
                }
                case 69: { // 'e'
                    context.selectConnectedElements((wire) => true, (wire) => true); // TODO more nuanced connecting.
                    self.canvasController.draw();
                    return true;
                }
                case 72: // 'h'
                    // editingModel.doTogglePalette();
                    // return true;
                    return false;
                case 74: { // 'j'
                    const renderer = this.renderer;
                    renderer.begin(this.canvasController.getCtx());
                    function inputToPoint(element, pin) {
                        return renderer.pinToPoint(element, pin, true);
                    }
                    ;
                    function outputToPoint(element, pin) {
                        return renderer.pinToPoint(element, pin, false);
                    }
                    ;
                    context.beginTransaction('complete elements');
                    context.completeElements(context.selectedElements(), inputToPoint, outputToPoint);
                    renderer.end();
                    context.endTransaction();
                    return true;
                }
                case 75: { // 'k'
                    context.beginTransaction('export elements');
                    context.exportElements(context.selectedTrueElements());
                    context.endTransaction();
                    return true;
                }
                case 76: // 'l'
                    context.beginTransaction('open elements');
                    context.importElements(context.selectedTrueElements());
                    context.endTransaction();
                    return true;
                case 78: { // ctrl 'n'   // Can't intercept cmd n.
                    const context = new FunctionchartContext();
                    self.initializeContext(context);
                    self.setContext(context);
                    self.renderer.begin(self.canvasController.getCtx());
                    self.updateBounds();
                    self.canvasController.draw();
                    self.renderer.end();
                    return true;
                }
                case 79: { // 'o'
                    this.fileController.openFile().then(result => self.createContext(result));
                    return true;
                }
                case 83: { // 's'
                    let text = JSON.stringify(Serialize(functionchart), undefined, 2);
                    this.fileController.saveUnnamedFile(text, 'functionchart.txt').then();
                    // console.log(text);
                    return true;
                }
                case 80: { // 'p'
                    this.print();
                    return true;
                }
            }
        }
        return false;
    }
    onKeyUp(e) {
        return false;
    }
    onBeginHover(canvasController) {
        const context = this.context, p = canvasController.getCurrentPointerPosition(), hitList = this.hitTestCanvas(p), hoverHitInfo = this.hoverHitInfo = this.getFirstHit(hitList, hasProperties);
        if (!hoverHitInfo)
            return false;
        const cp = canvasController.viewToCanvas(p);
        this.hoverPoint = cp;
        this.hoverHitInfo = hoverHitInfo;
        return true;
    }
    onEndHover(canvasController) {
        this.hoverHitInfo = undefined;
    }
}
//# sourceMappingURL=functioncharts.js.map