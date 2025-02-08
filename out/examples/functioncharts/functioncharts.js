var _a;
import { SelectionSet, Multimap } from '../../src/collections.js';
import { Theme, getEdgeBezier, hitTestRect, roundRectPath, bezierEdgePath, hitTestBezier, inFlagPath, outFlagPath, notchedRectPath, FileController } from '../../src/diagrams.js';
import { getExtents, expandRect } from '../../src/geometry.js';
import { ScalarProp, ChildListProp, ReferenceProp, IdProp, EventBase, copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet, reduceToRoots, TransactionManager, HistoryManager, ChildSlotProp } from '../../src/dataModels.js';
// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'
// TODO Functionchart imports.
// TODO Root functionchart type display.
//------------------------------------------------------------------------------
// Value and Function type descriptions.
function escapeName(name) {
    return name.replace(')', '))');
}
function unescapeName(name) {
    return name.replace('))', ')');
}
export class Pin {
    constructor(type, name) {
        this.varArgs = 0; // no var args
        this.y = 0;
        this.baseline = 0;
        this.type = type;
        this.name = name;
    }
    copy() {
        const result = new Pin(this.type, this.name);
        result.varArgs = this.varArgs;
        result.y = this.y;
        result.baseline = this.baseline;
        return result;
    }
    toString() {
        const type = this.type;
        let s = type.typeString;
        if (this.name) {
            // Insert an empty name, so the pin name doesn't get parsed as the type name.
            if (type !== Type.valueType && type.name === undefined)
                s += '()';
            s += '(' + escapeName(this.name) + ')';
        }
        if (this.varArgs)
            s += '{' + this.varArgs.toString() + '}';
        return s;
    }
}
export class Type {
    get typeString() {
        return this._typeString;
    }
    initializeBaseType(value) {
        this._typeString = value;
        return this;
    }
    get needsLayout() {
        return this.height === 0;
    }
    static fromInfo(inputs, outputs, name) {
        // Generally, pins can't be shared between types.
        const type = new Type(inputs.map(pin => pin.copy()), outputs.map(pin => pin.copy()), name);
        return type.atomized();
    }
    static fromString(typeString) {
        let result = this.atomizedTypes.get(typeString);
        if (!result) {
            result = parseTypeString(typeString).atomized();
        }
        return result;
    }
    rename(name) {
        return Type.fromInfo(this.inputs.map(pin => pin.copy()), this.outputs.map(pin => pin.copy()), name);
    }
    toImportExportType() {
        return Type.fromInfo([], [new Pin(this)]);
    }
    toConstructorType() {
        const inputs = this.inputs.map(pin => new Pin(pin.type, pin.name)), outputs = this.outputs.map(pin => new Pin(pin.type, pin.name));
        outputs.splice(0, 0, new Pin(Type.valueType));
        return Type.fromInfo(inputs, outputs, 'new ' + this.name);
    }
    toUpCastType() {
        return Type.fromInfo([new Pin(Type.valueType)], [new Pin(this)]);
    }
    toDownCastType() {
        return Type.fromInfo([new Pin(this)], [new Pin(Type.valueType)]);
    }
    static outputType(pin) {
        const type = pin.type;
        if (type === Type.valueType)
            return pin.type;
        return Type.fromInfo(type.inputs, type.outputs, pin.name);
    }
    constructor(inputs, outputs, name) {
        this.width = 0;
        this.height = 0;
        this.inputs = inputs;
        this.outputs = outputs;
        this.name = name;
        this.varArgs = inputs.some(input => (input.varArgs > 0));
    }
    toString() {
        if (this === Type.valueType)
            return Type.valueTypeString;
        let s = '[';
        const inputs = this.inputs, length = inputs.length;
        for (let i = 0; i < length; i++) {
            let input = inputs[i]; // TODO improve this code.
            while (input.varArgs) {
                if (i === length - 1)
                    break; // last pin
                if (input.varArgs > inputs[i + 1].varArgs)
                    break; // last in this var args range
                i++;
                input = inputs[i];
            }
            s += input.toString();
        }
        s += ',';
        this.outputs.forEach(output => s += output.toString());
        s += ']';
        if (this.name)
            s += '(' + escapeName(this.name) + ')';
        return s;
    }
    // private toFlatType(): Type {
    //   const inputs = this.inputs.map(pin => new Pin(Type.valueType, pin.name)),
    //         outputs = this.outputs.map(pin => new Pin(Type.valueType, pin.name));
    //   return Type.fromInfo(inputs, outputs, this.name);
    // }
    atomized() {
        let s = this.toString();
        let atomizedType = Type.atomizedTypes.get(s);
        if (!atomizedType) {
            atomizedType = this;
            this._typeString = s;
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
        return true;
    }
    canConnectTo(dst) {
        return Type.canConnect(this, dst);
    }
}
_a = Type;
Type.emptyPins = [];
Type.valueTypeString = 'v';
Type.valueType = new Type(Type.emptyPins, Type.emptyPins);
Type.emptyTypeString = '[,]';
Type.emptyType = new Type(Type.emptyPins, Type.emptyPins);
Type.emptyExporterTypeString = '[,' + _a.emptyTypeString + ']'; // export the empty type
Type.emptyExporterType = new Type(Type.emptyPins, [new Pin(Type.emptyType)]);
// Manually atomize the base types.
// TODO make this private.
Type.atomizedTypes = new Map([
    [Type.valueTypeString, Type.valueType.initializeBaseType(Type.valueTypeString)],
    [Type.emptyTypeString, Type.emptyType.initializeBaseType(Type.emptyTypeString)],
    [Type.emptyExporterTypeString, Type.emptyExporterType.initializeBaseType(Type.emptyExporterTypeString)],
]);
// not exported
function parseTypeString(s) {
    let j = 0;
    // Close over j to avoid extra return values.
    function parseName() {
        let name;
        if (s[j] === '(') {
            let i = j + 1, k = i;
            // Advance to right paren, skipping the escape sequence '))'.
            while ((j = s.indexOf(')', k)) > i && s[j + 1] === ')') {
                k = j + 2;
            }
            if (j > i) {
                name = s.substring(i, j);
                name = unescapeName(name);
            }
            j++;
        }
        return name;
    }
    function parsePin() {
        let result;
        if (s[j] === Type.valueTypeString) {
            // value type
            j++;
            result = new Pin(Type.valueType, parseName());
        }
        else {
            // function types
            const type = parseFunction(), name = parseName();
            result = new Pin(type, name);
        }
        // optional var args modifier
        let varArgs = 0;
        if (s[j] === '{') {
            j++;
            const k = s.indexOf('}', j);
            if (k < 0)
                throw new Error('Invalid type string: ' + s);
            const varArgsString = s.substring(j, k);
            varArgs = parseInt(varArgsString);
            if (isNaN(varArgs))
                throw new Error('Bad varArgs count in type string: ' + s);
            j = k + 1;
        }
        result.varArgs = varArgs;
        return result;
    }
    function parseFunction() {
        if (s[j] === Type.valueTypeString) {
            return Type.valueType;
        }
        else if (s[j] === '[') {
            j++;
            let inputs = new Array, outputs = new Array;
            while (s[j] !== ',') {
                const pin = parsePin(), varArgs = pin.varArgs;
                if (varArgs) {
                    for (let i = 1; i < varArgs; i++) {
                        const vaPin = new Pin(pin.type, pin.name);
                        vaPin.varArgs = i;
                        inputs.push(vaPin);
                    }
                }
                inputs.push(pin); // in the var args case, this pin has the count.
            }
            j++;
            while (s[j] !== ']') {
                outputs.push(parsePin());
            }
            j++;
            // Parse the name if present.
            const name = parseName();
            return Type.fromInfo(inputs, outputs, name);
        }
        else {
            throw new Error('Invalid type string: ' + s);
        }
    }
    // TODO try catch here?
    return parseFunction();
}
export function visitType(type, visitor) {
    visitor(type);
    type.inputs.forEach(input => visitType(input.type, visitor));
    type.outputs.forEach(output => visitType(output.type, visitor));
}
//------------------------------------------------------------------------------
// Properties and templates for the raw data interface for cloning, serialization, etc.
const idProp = new IdProp('id'), xProp = new ScalarProp('x', 0), yProp = new ScalarProp('y', 0), nameProp = new ScalarProp('name', ''), typeStringProp = new ScalarProp('typeString', Type.emptyTypeString), widthProp = new ScalarProp('width', 0), heightProp = new ScalarProp('height', 0), srcProp = new ReferenceProp('src'), srcPinProp = new ScalarProp('srcPin', 0), dstProp = new ReferenceProp('dst'), dstPinProp = new ScalarProp('dstPin', 0), nodesProp = new ChildListProp('nodes'), wiresProp = new ChildListProp('wires'), instancerProp = new ReferenceProp('instancer'), innerElementProp = new ChildSlotProp('inner'), implicitProp = new ScalarProp('implicit', false), hideLinksProp = new ScalarProp('hideLinks', false), commentProp = new ScalarProp('comment');
class NodeTemplate {
    constructor() {
        this.id = idProp;
        this.typeString = typeStringProp;
        this.x = xProp;
        this.y = yProp;
        this.comment = commentProp;
        this.properties = [];
    }
}
class ElementTemplate extends NodeTemplate {
    constructor(typeName) {
        super();
        this.name = nameProp;
        this.hideLinks = hideLinksProp;
        this.properties = [this.id, this.typeString, this.x, this.y, this.name, this.hideLinks,
            this.comment];
        this.typeName = typeName;
    }
}
class ModifierElementTemplate extends ElementTemplate {
    constructor(typeName) {
        super(typeName);
        this.innerElement = innerElementProp;
        this.properties = [this.id, this.typeString, this.x, this.y, this.name,
            this.hideLinks, this.innerElement, this.comment];
    }
}
class FunctionInstanceTemplate extends ElementTemplate {
    constructor() {
        super(...arguments);
        this.src = instancerProp;
        this.srcPin = srcPinProp;
        this.properties = [this.id, this.typeString, this.x, this.y,
            this.src, this.srcPin]; // no 'name' property
    }
}
class PseudoelementTemplate extends NodeTemplate {
    constructor(typeName) {
        super();
        this.properties = [this.id, this.typeString, this.x, this.y, this.comment];
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
class FunctionchartTemplate extends NodeTemplate {
    constructor(typeName) {
        super();
        this.width = widthProp;
        this.height = heightProp;
        this.name = nameProp;
        this.implicit = implicitProp;
        this.hideLinks = hideLinksProp;
        this.nodes = nodesProp;
        this.wires = wiresProp;
        this.properties = [this.id, this.typeString, this.x, this.y, this.width, this.height,
            this.name, this.implicit, this.hideLinks, this.nodes, this.wires,
            this.comment];
        this.typeName = typeName;
    }
}
const elementTemplate = new ElementTemplate('element'), // built-in elements
importerTemplate = new ModifierElementTemplate('importer'), // modifier elements
exporterTemplate = new ModifierElementTemplate('exporter'), constructorTemplate = new ModifierElementTemplate('constructor'), upCastTemplate = new ModifierElementTemplate('upCast'), downCastTemplate = new ModifierElementTemplate('downCast'), inputTemplate = new PseudoelementTemplate('input'), // input pseudoelement
outputTemplate = new PseudoelementTemplate('output'), // output pseudoelement
useTemplate = new PseudoelementTemplate('use'), wireTemplate = new WireTemplate(), functionchartTemplate = new FunctionchartTemplate('functionchart'), functionInstanceTemplate = new FunctionInstanceTemplate('instance');
const defaultPoint = { x: 0, y: 0 }, defaultPointWithNormal = { x: 0, y: 0, nx: 0, ny: 0 }, defaultBezierCurve = [
    defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal
];
// Type safe interfaces over the raw templated data.
// Base element class to implement type fields, and incoming/outgoing wire arrays.
class NodeBase {
    get typeString() { return this.template.typeString.get(this); }
    set typeString(value) { this.template.typeString.set(this, value); }
    get x() { return this.template.x.get(this); }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this); }
    set y(value) { this.template.y.set(this, value); }
    get comment() { return this.template.comment.get(this); }
    set comment(value) { this.template.comment.set(this, value); }
    get type() {
        if (!this._type) {
            this._type = Type.fromString(this.typeString);
        }
        return this._type;
    }
    set type(type) {
        if (type !== this._type) {
            this._type = type;
        }
    }
    get isAbstract() { return false; }
    get isInstancer() { return false; }
    asInstance() {
        if (this instanceof FunctionInstance)
            return this;
        if (this instanceof ModifierElement) {
            const inner = this.innerElement;
            if (inner instanceof FunctionInstance)
                return inner;
        }
    }
    // Get the pin for the node type, given an index in the combined input/output format.
    getPin(index) {
        const type = this.type, firstOutput = type.inputs.length, pin = index < firstOutput ? type.inputs[index] :
            type.outputs[index - firstOutput];
        return pin;
    }
    constructor(template, context, id) {
        this.globalPosition = defaultPoint;
        this.inWires = new Array(); // one input per pin (no fan in).
        this.outWires = new Array(); // multiple outputs per pin (fan out).
        this.instances = new Array(); // each output pin potentially has multiple instances.
        this.template = template;
        this.context = context;
        this.id = id;
    }
}
// Base class, for Elements that are not user defined.
// 'binop', 'unop', 'cond', 'let', 'const', are the built-in elements.
// 'external' are library elements.
// 'abstract' are abstractions created from other elements.
export class Element extends NodeBase {
    get name() { return this.template.name.get(this); }
    set name(value) { this.template.name.set(this, value); }
    get hideLinks() { return this.template.hideLinks.get(this); }
    set hideLinks(value) { this.template.hideLinks.set(this, value); }
    get isAbstract() {
        return this.name === 'abstract';
    }
    get hasSideEffects() {
        return false;
    }
    get isInstancer() {
        return !this.isExporter;
    }
    get isImporter() {
        return this.template.typeName === 'importer';
    }
    get isExporter() {
        return this.template.typeName === 'exporter';
    }
    get isConstructor() {
        return this.template.typeName === 'constructor';
    }
    get isUpCast() {
        return this.template.typeName === 'upCast';
    }
    get isDownCast() {
        return this.template.typeName === 'downCast';
    }
    get isInstanced() {
        return this instanceof FunctionInstance ||
            this instanceof ModifierElement && this.innerElement instanceof FunctionInstance;
    }
    constructor(template, context, id) {
        super(template, context, id);
    }
}
export class ModifierElement extends Element {
    get innerElement() { return this.template.innerElement.get(this).get(0); }
    set innerElement(value) { this.template.innerElement.get(this).set(0, value); }
    // Derived properties.
    get innerType() { var _b; return ((_b = this.innerElement) === null || _b === void 0 ? void 0 : _b.type) || Type.emptyType; }
    get isAbstract() {
        if (!this.innerElement)
            return false;
        return this.isExporter && this.innerElement.isAbstract;
    }
    updateTypeInfo() {
        if (this.innerElement) {
            const innerType = this.innerType;
            let modifierType;
            if (this.isUpCast) {
                modifierType = innerType.toUpCastType();
            }
            else if (this.isDownCast) {
                modifierType = innerType.toDownCastType();
            }
            else if (this.isConstructor) {
                modifierType = innerType.toConstructorType();
            }
            else {
                modifierType = innerType.toImportExportType();
            }
            this.typeString = modifierType.typeString;
        }
    }
    constructor(context, template, id) {
        super(template, context, id);
    }
}
export class FunctionInstance extends Element {
    get src() { return this.template.src.get(this); }
    set src(value) { this.template.src.set(this, value); }
    get srcPin() { return this.template.srcPin.get(this); }
    set srcPin(value) { this.template.srcPin.set(this, value); }
    // Derived Properties
    get isAbstract() {
        const src = this.src;
        return src instanceof Functionchart && src.isAbstract;
    }
    get hasSideEffects() {
        const src = this.src;
        if (src instanceof Element) {
            return (src.name === 'let' || src.name === 'this'); // must be this/let setter, which has side effects.
        }
        return src instanceof Functionchart && src.hasSideEffects;
    }
    get isInstancer() { return true; }
    getSrcType() {
        return this.src.type.outputs[this.srcPin].type;
    }
    constructor(context, id) {
        super(functionInstanceTemplate, context, id);
    }
}
export class Pseudoelement extends NodeBase {
    // Derived properties.
    // index: number = -1;
    constructor(context, template, id) {
        super(template, context, id);
        switch (this.template.typeName) {
            case 'input':
                this.typeString = '[,v]';
                break;
            case 'output':
                this.typeString = '[v,]';
                break;
            case 'use':
                this.typeString = '[v{1},v]';
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
    get type() {
        if (this.src) {
            return this.src.type.outputs[this.srcPin].type;
        }
        if (this.dst) {
            return this.dst.type.inputs[this.dstPin].type;
        }
        return Type.valueType;
    }
    constructor(context) {
        this.template = wireTemplate;
        this.bezier = defaultBezierCurve;
        this.context = context;
        this.srcPin = -1;
        this.dstPin = -1;
    }
}
// This TypeInfo instance signals that the functionchart hasn't been initialized yet.
const emptyTypeInfo = {
    instanceType: Type.emptyExporterType,
    closed: true,
    abstract: false,
    sideEffects: false,
    inputs: [],
    outputs: [],
};
export class Functionchart extends NodeBase {
    get width() { return this.template.width.get(this); }
    set width(value) { this.template.width.set(this, value); }
    get height() { return this.template.height.get(this); }
    set height(value) { this.template.height.set(this, value); }
    get typeString() {
        return this.template.typeString.get(this) ||
            this.typeInfo.instanceType.toImportExportType().typeString; // TODO remove when files converted
    }
    set typeString(value) { this.template.typeString.set(this, value); }
    get name() { return this.template.name.get(this); }
    set name(value) { this.template.name.set(this, value); }
    get implicit() { return this.template.implicit.get(this); }
    set implicit(value) { this.template.implicit.set(this, value); }
    get hideLinks() { return this.template.hideLinks.get(this); }
    set hideLinks(value) { this.template.hideLinks.set(this, value); }
    get nodes() { return this.template.nodes.get(this); }
    get wires() { return this.template.wires.get(this); }
    // Derived properties.
    get isAbstract() { return this.typeInfo.abstract; }
    get hasSideEffects() { return this.typeInfo.sideEffects; }
    get isInstancer() { return true; }
    get isClosed() { return this.typeInfo.closed; }
    constructor(context, template, id) {
        super(template, context, id);
        this.typeInfo = emptyTypeInfo;
        this.recursive = false;
        this.instanceType = Type.emptyType;
    }
}
// Radius of rounded corners. This isn't themeable, as it's conceptually part of the notation.
Functionchart.radius = 8;
export class FunctionchartContext extends EventBase {
    constructor(layoutEngine = new Renderer()) {
        super();
        this.highestId = 0; // 0 stands for no id.
        this.referentMap = new Map();
        this.nodes = new Set;
        this.wires = new Set;
        // Graph traversal helper info. These are batch updated after transactions.
        this.derivedInfoNeedsUpdate = false; // If true, we need to update sorted and wire lists.
        // Topologically sorted elements. If a cycle is present, the size is less than the elements set.
        this.sorted = new Array();
        this.invalidWires = new Array(); // Wires that violate the fan-in constraint.
        this.instancingGraph = new Map();
        this.selection = new SelectionSet();
        this.layoutEngine = layoutEngine;
        const self = this;
        this.transactionManager = new TransactionManager();
        this.addHandler('changed', this.transactionManager.onChanged.bind(this.transactionManager));
        function update() {
            self.updateDerivedInfo();
        }
        this.transactionManager.addHandler('transactionEnded', update);
        this.transactionManager.addHandler('transactionCanceled', update);
        this.transactionManager.addHandler('didUndo', update);
        this.transactionManager.addHandler('didRedo', update);
        this.historyManager = new HistoryManager(this.transactionManager, this.selection);
        const root = new Functionchart(this, functionchartTemplate, this.highestId++);
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
        this.updateDerivedInfo(); // Make sure wire arrays are present for implicit functioncharts.
        this.updateFunctioncharts(); // Initialize TypeInfo for all functioncharts.
        this.updateDerivedInfo();
    }
    newElement(typeName) {
        const nextId = ++this.highestId;
        let result;
        switch (typeName) {
            case 'element':
                result = new Element(elementTemplate, this, nextId);
                break;
            case 'instance':
                result = new FunctionInstance(this, nextId);
                break;
            case 'importer':
                result = new ModifierElement(this, importerTemplate, nextId);
                break;
            case 'exporter':
                result = new ModifierElement(this, exporterTemplate, nextId);
                break;
            case 'constructor':
                result = new ModifierElement(this, constructorTemplate, nextId);
                break;
            case 'upCast':
                result = new ModifierElement(this, upCastTemplate, nextId);
                break;
            case 'downCast':
                result = new ModifierElement(this, downCastTemplate, nextId);
                break;
            default: throw new Error('Unknown element type: ' + typeName);
        }
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
            case 'use':
                template = useTemplate;
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
    newFunctionchart(typeName) {
        const nextId = ++this.highestId;
        let template;
        switch (typeName) {
            case 'functionchart':
                template = functionchartTemplate;
                break;
            default: throw new Error('Unknown functionchart type: ' + typeName);
        }
        const result = new Functionchart(this, template, nextId);
        this.referentMap.set(nextId, result);
        return result;
    }
    contains(item) {
        if (item instanceof NodeBase)
            return this.nodes.has(item);
        if (item instanceof Wire)
            return this.wires.has(item);
        return false;
    }
    // TODO make these free standing functions?
    visitAll(item, visitor) {
        const self = this;
        visitor(item);
        if (item instanceof Functionchart) {
            item.nodes.forEach(t => self.visitAll(t, visitor));
            item.wires.forEach(t => self.visitAll(t, visitor));
        }
        else if (item instanceof ModifierElement) {
            if (item.innerElement)
                visitor(item.innerElement);
        }
    }
    reverseVisitAll(item, visitor) {
        const self = this;
        if (item instanceof Functionchart) {
            item.wires.forEachReverse(t => self.reverseVisitAll(t, visitor));
            item.nodes.forEachReverse(t => self.reverseVisitAll(t, visitor));
        }
        else if (item instanceof ModifierElement) {
            if (item.innerElement)
                visitor(item.innerElement);
        }
        visitor(item);
    }
    visitNodes(item, visitor) {
        const self = this;
        visitor(item);
        if (item instanceof Functionchart) {
            item.nodes.forEach(item => self.visitNodes(item, visitor));
        }
        else if (item instanceof ModifierElement) {
            if (item.innerElement) {
                this.visitNodes(item.innerElement, visitor);
            }
        }
    }
    reverseVisitNodes(item, visitor) {
        const self = this;
        if (item instanceof Functionchart) {
            item.nodes.forEachReverse(item => self.reverseVisitNodes(item, visitor));
        }
        else if (item instanceof ModifierElement) {
            if (item.innerElement) {
                this.reverseVisitNodes(item.innerElement, visitor);
            }
        }
        visitor(item);
    }
    visitWires(functionchart, visitor) {
        const self = this;
        functionchart.wires.forEach(t => visitor(t));
        functionchart.nodes.forEach(t => {
            if (t instanceof Functionchart)
                self.visitWires(t, visitor);
        });
    }
    reverseVisitWires(functionchart, visitor) {
        const self = this;
        functionchart.nodes.forEachReverse(t => {
            if (t instanceof Functionchart)
                self.reverseVisitWires(t, visitor);
        });
        functionchart.wires.forEach(t => visitor(t));
    }
    getContainingFunctionchart(items) {
        let owner = getLowestCommonAncestor(...items);
        while (owner && !(owner instanceof Functionchart))
            owner = owner.parent;
        if (owner instanceof Functionchart)
            return owner;
        return this.functionchart;
    }
    getToFunctionchart(node) {
        if (node instanceof Functionchart)
            return node;
        let result = node.parent;
        while (result && !(result instanceof Functionchart))
            result = result.parent;
        return result;
    }
    // getToUncontainedNode(node: NodeTypes) : NodeTypes {
    //   let result = node;
    //   while (result.parent instanceof ModifierElement)
    //     result = result.parent;
    //   return result;
    // }
    forInWires(dst, visitor) {
        dst.inWires.forEach(wire => {
            if (wire)
                visitor(wire);
        });
    }
    forOutWires(src, visitor) {
        src.outWires.forEach(wires => {
            wires.forEach(wire => visitor(wire));
        });
    }
    // Gets the translation to move an item from its current parent to
    // newParent.
    getToParent(node, newParent) {
        const oldParent = node.parent;
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
    setGlobalPosition(node) {
        const x = node.x, y = node.y, parent = node.parent;
        if (parent) {
            const global = parent.globalPosition;
            if (global) {
                node.globalPosition = { x: x + global.x, y: y + global.y };
            }
        }
        else {
            node.globalPosition = { x: x, y: y };
        }
    }
    getGraphInfo() {
        return {
            nodes: this.nodes,
            wires: this.wires,
            interiorWires: this.wires,
            inWires: new Set(),
            outWires: new Set(),
        };
    }
    getSubgraphInfo(items) {
        const self = this, nodes = new Set(), wires = new Set(), interiorWires = new Set(), inWires = new Set(), outWires = new Set();
        // First collect nodes.
        items.forEach(item => {
            nodes.add(item);
        });
        // Now collect and classify wires that connect to them.
        items.forEach(item => {
            function addWire(wire) {
                // Stop if we've already processed this transtion (handle transitions from a element to itself.)
                if (wires.has(wire))
                    return;
                wires.add(wire);
                const src = wire.src, dst = wire.dst, srcInside = nodes.has(src), dstInside = nodes.has(dst);
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
            if (item instanceof NodeBase) {
                self.forInWires(item, addWire);
                self.forOutWires(item, addWire);
            }
        });
        return {
            nodes,
            wires,
            interiorWires,
            inWires,
            outWires,
        };
    }
    getConnectedNodes(nodes, upstream, downstream) {
        const result = new Set();
        nodes = nodes.slice(0); // Copy input array
        while (nodes.length > 0) {
            const element = nodes.pop();
            result.add(element);
            this.forInWires(element, wire => {
                if (!upstream(wire))
                    return;
                const src = wire.src;
                if (!result.has(src))
                    nodes.push(src);
            });
            this.forOutWires(element, wire => {
                if (!downstream(wire))
                    return;
                const dst = wire.dst;
                if (!result.has(dst))
                    nodes.push(dst);
            });
        }
        return result;
    }
    beginTransaction(name) {
        this.transactionManager.beginTransaction(name);
    }
    endTransaction() {
        this.makeConsistent();
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
    // Excludes pseudo-elements.
    selectedElements() {
        const result = new Array();
        this.selection.forEach(item => {
            if (item instanceof Element)
                result.push(item);
        });
        return result;
    }
    selectedNodes() {
        const result = new Array();
        this.selection.forEach(item => {
            if (item instanceof NodeBase)
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
    disconnectNode(node) {
        if (node instanceof ModifierElement && node.innerElement)
            this.disconnectNode(node.innerElement);
        const self = this;
        node.inWires.forEach(wire => {
            if (wire)
                self.deleteItem(wire);
        });
        node.outWires.forEach(wires => {
            if (wires.length === 0)
                return;
            // Copy array since we're mutating it.
            wires.slice().forEach(wire => {
                if (wire)
                    self.deleteItem(wire);
            });
        });
        node.instances.forEach(instances => {
            if (instances.length === 0)
                return;
            // Copy array since we're mutating it.
            instances.slice().forEach(instance => {
                if (instance)
                    self.deleteItem(instance);
            });
        });
    }
    disconnectSelection() {
        const self = this;
        this.selectedNodes().forEach(node => self.disconnectNode(node));
    }
    extendSelectionToWires() {
        const self = this, graphInfo = this.getSubgraphInfo(this.selectedNodes());
        graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
    }
    selectConnectedNodes(upstream, downstream) {
        const selectedNodes = this.selectedNodes(), connectedNodes = this.getConnectedNodes(selectedNodes, upstream, downstream);
        this.selection.set(Array.from(connectedNodes));
    }
    addItem(item, parent) {
        const oldParent = item.parent;
        if (!parent)
            parent = this.functionchart;
        if (oldParent === parent)
            return item;
        if (!(item instanceof Wire)) {
            const translation = this.getToParent(item, parent);
            let x, y;
            if (parent instanceof ModifierElement) {
                const offset = this.layoutEngine.getInnerElementOffset(parent);
                x = offset.x;
                y = offset.y;
            }
            else {
                x = Math.max(0, item.x + translation.x);
                y = Math.max(0, item.y + translation.y);
            }
            if (item.x != x)
                item.x = x;
            if (item.y != y)
                item.y = y;
        }
        if (oldParent)
            this.unparent(item);
        if (parent instanceof Functionchart) {
            if (item instanceof Wire) {
                parent.wires.append(item);
            }
            else {
                parent.nodes.append(item);
            }
        }
        else if (parent instanceof ModifierElement && item instanceof Element) {
            const inner = parent.innerElement;
            if (inner) {
                this.deleteItem(inner);
            }
            parent.innerElement = item;
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
            if (item instanceof NodeBase)
                this.addItem(item, parent);
        }
        for (let item of items) {
            if (item instanceof Wire)
                this.addItem(item, parent);
        }
    }
    unparent(item) {
        const parent = item.parent;
        if (parent instanceof Functionchart) {
            if (item instanceof Wire) {
                parent.wires.remove(item);
            }
            else {
                parent.nodes.remove(item);
            }
        }
    }
    deleteItem(item) {
        this.unparent(item);
        this.selection.delete(item);
    }
    deleteItems(items) {
        const self = this;
        items.forEach(item => self.deleteItem(item));
    }
    copy() {
        const Functionchart = this.functionchart, selection = this.selection;
        selection.set(this.selectedNodes());
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
    newInputForWire(wire, parent, p) {
        const input = this.newPseudoelement('input'), offset = this.layoutEngine.outputPinToPoint(input, 0);
        input.x = p.x - offset.x;
        input.y = p.y - offset.y;
        wire.src = input;
        wire.srcPin = 0;
        this.addItem(input, parent);
        return input;
    }
    connectInput(node, pin) {
        const parent = node.parent, p = this.layoutEngine.inputPinToPoint(node, pin), wire = this.newWire(undefined, 0, node, pin);
        p.x -= 16; // TODO layout engine?
        const input = this.newInputForWire(wire, parent, p);
        this.addItem(wire, parent);
        return { input, wire };
    }
    newOutputForWire(wire, parent, p) {
        const src = wire.src, output = this.newPseudoelement('output'), offset = this.layoutEngine.inputPinToPoint(output, 0);
        output.x = p.x - offset.x;
        output.y = p.y - offset.y;
        wire.dst = output;
        wire.dstPin = 0;
        this.addItem(output, parent);
        return output;
    }
    newInstanceForWire(wire, parent, p) {
        const src = wire.src, type = src.type.outputs[wire.srcPin].type, element = this.newElement('instance');
        element.typeString = type.typeString;
        element.src = src;
        element.srcPin = wire.srcPin;
        element.x = p.x;
        element.y = p.y - type.height / 2;
        this.deleteItem(wire);
        this.addItem(element, parent);
        return element;
    }
    connectOutput(node, pin) {
        const parent = node.parent, p = this.layoutEngine.outputPinToPoint(node, pin), wire = this.newWire(node, pin, undefined, 0);
        p.x += 16; // TODO layout engine?
        const output = this.newOutputForWire(wire, parent, p);
        this.addItem(wire, parent);
        return { output, wire };
    }
    completeNode(nodes) {
        const self = this, selection = this.selection;
        // Add input/output pseudoelements for disconnected pins on elements.
        nodes.forEach(element => {
            const inputs = element.inWires, outputs = element.outWires;
            for (let pin = 0; pin < inputs.length; pin++) {
                if (inputs[pin] === undefined) {
                    const { input, wire } = self.connectInput(element, pin);
                    selection.add(input);
                    selection.add(wire);
                }
            }
            for (let pin = 0; pin < outputs.length; pin++) {
                if (outputs[pin].length === 0) {
                    const { output, wire } = self.connectOutput(element, pin);
                    selection.add(output);
                    selection.add(wire);
                }
            }
            selection.delete(element);
        });
    }
    isValidWire(wire) {
        if (wire.pSrc || wire.pDst)
            return true; // Return valid for wires that are being dragged.
        const src = wire.src, dst = wire.dst;
        if (!src || !dst)
            return false;
        if (src === dst)
            return false;
        // Wires must be within the functionchart or from a source in an enclosing functionchart.
        const lca = getLowestCommonAncestor(src, dst);
        if (!lca || lca !== this.getToFunctionchart(src.parent)) // TODO test
            return false;
        const srcPin = wire.srcPin, dstPin = wire.dstPin;
        if (srcPin < 0 || srcPin >= src.type.outputs.length)
            return false;
        if (dstPin < 0 || dstPin >= dst.type.inputs.length)
            return false;
        const srcType = src.type.outputs[srcPin].type, dstType = dst.type.inputs[dstPin].type;
        return srcType.canConnectTo(dstType);
    }
    canAddNode(node, parent) {
        if (node instanceof FunctionInstance) {
            const definition = node.src, definitionScope = definition.parent, scope = getLowestCommonAncestor(node, definition, parent);
            if (definition instanceof Functionchart) {
                // Closed functioncharts can be instantiated anywhere.
                if (definition.typeInfo.closed)
                    return true;
                // Top level functionchart, we can't currently instantiate it. TODO it should be possible.
                if (!definitionScope)
                    return true;
                // An open functionchart can only be instantiated in its defining functionchart or the next outer scope.
                return scope === definition || // recursive
                    scope === definitionScope; // within scope of definition.
            }
            if (definition.isImporter) {
                return scope === definitionScope;
            }
        }
        else if (node instanceof ModifierElement) {
            return !(parent instanceof ModifierElement); // A modifier can't modify another modifier.
        }
        return true;
    }
    // isIsolated(node: NodeTypes) : boolean {
    //   const type = node.type,
    //         nInputs = type.inputs.length,
    //         nOutputs = type.outputs.length,
    //         inputs = node.inWires,
    //         outputs = node.outWires;
    //   for (let i = 0; i < inputs.length; i++) {
    //     if (inputs[i] !== undefined)
    //       return false;
    //   }
    //   for (let i = 0; i < outputs.length; i++) {
    //     if (outputs[i].length !== 0)
    //       return false;
    //   }
    //   if (node.isInstancer) {
    //     const instances = node.instances;
    //     for (let i = 0; i < outputs.length; i++) {
    //       if (instances[i].length !== 0)
    //         return false;
    //     }
    //   }
    //   return true;
    // }
    isWiredOrInstanced(node) {
        const type = node.type, nInputs = type.inputs.length, nOutputs = type.outputs.length, inputs = node.inWires, outputs = node.outWires;
        for (let i = 0; i < nInputs; i++) {
            if (inputs[i] !== undefined)
                return false;
        }
        for (let i = 0; i < nOutputs; i++) {
            if (outputs[i].length !== 0)
                return false;
        }
        if (node instanceof Element && node.isInstancer) {
            const instances = node.instances;
            for (let i = 0; i < nOutputs; i++) {
                if (instances[i].length !== 0)
                    return false;
            }
        }
        return true;
    }
    isValidFunctionInstance(instance) {
        let parent = instance.parent;
        // To be able to export an instance, the inner element must be valid in the containing functionchart.
        if (parent instanceof ModifierElement)
            parent = parent.parent;
        return parent instanceof Functionchart && this.canAddNode(instance, parent);
    }
    // Update wire lists. Returns true iff wires don't fan-in to any input pins.
    updateReferenceLists() {
        const invalidWires = new Array(), graphInfo = this.getGraphInfo();
        // Initialize the element inWires, outWires, and instances arrays.
        graphInfo.nodes.forEach(node => {
            const type = node.type;
            node.inWires = new Array(type.inputs.length);
            node.outWires = new Array(type.outputs.length);
            for (let i = 0; i < type.outputs.length; i++)
                node.outWires[i] = new Array();
            node.instances = new Array(type.outputs.length);
            for (let i = 0; i < type.outputs.length; i++)
                node.instances[i] = new Array();
        });
        // Push wires onto the corresponding wire arrays on the elements.
        graphInfo.wires.forEach(wire => {
            const src = wire.src, dst = wire.dst, srcPin = wire.srcPin, dstPin = wire.dstPin;
            if (!src || !dst) {
                invalidWires.push(wire);
                return;
            }
            if (!src.outWires[srcPin])
                src.outWires[srcPin] = new Array();
            src.outWires[srcPin].push(wire);
            if (dst.inWires[dstPin] !== undefined) {
                invalidWires.push(wire);
                return;
            }
            dst.inWires[dstPin] = wire;
        });
        function addInstance(instance) {
            const src = instance.src, srcPin = instance.srcPin;
            src.instances[srcPin].push(instance);
        }
        graphInfo.nodes.forEach(node => {
            const instance = node.asInstance();
            if (instance) {
                addInstance(instance);
            }
        });
        return invalidWires;
    }
    // TODO some tests.
    buildInstancingGraph() {
        const instancingGraph = new Map();
        // -Only functioncharts can be recursive.
        // -For each functionchart, make a list of other functioncharts it instantiates, either directly, or
        // indirectly through another functionchart, possibly including itself.
        // -If a functionchart references itself, or another functionchart that references it, it is recursive.
        function visitInstance(instance, functioncharts) {
            const src = instance.src;
            if (src instanceof Functionchart) {
                if (!functioncharts.has(src)) {
                    functioncharts.add(src);
                    visitFunctionchart(src);
                }
            }
        }
        function visitFunctionchart(functionchart) {
            if (instancingGraph.has(functionchart))
                return;
            const functioncharts = new Set();
            instancingGraph.set(functionchart, functioncharts);
            functionchart.nodes.forEach(node => {
                if (node instanceof FunctionInstance) {
                    visitInstance(node, functioncharts);
                }
                else if (node instanceof ModifierElement) {
                    if (node.innerElement instanceof FunctionInstance) {
                        // TODO chains of instancers shouldn't be possible.
                        visitInstance(node.innerElement, functioncharts);
                    }
                }
            });
        }
        this.nodes.forEach(node => {
            if (node instanceof Functionchart) {
                visitFunctionchart(node);
            }
        });
        instancingGraph.forEach((srcs, functionchart) => {
            functionchart.recursive = srcs.has(functionchart);
        });
        return instancingGraph;
    }
    // Topological sort of elements for update and validation. The circuit should form a DAG.
    // All wires should be valid.
    topologicalSort() {
        const visiting = new Set(), visited = new Set(), sorted = new Array();
        let cycle = false;
        function visit(node) {
            if (visited.has(node))
                return;
            if (visiting.has(node)) {
                cycle = true;
                return;
            }
            visiting.add(node);
            node.outWires.forEach(wires => {
                wires.forEach(wire => {
                    visit(wire.dst);
                });
            });
            if (cycle)
                return;
            visiting.delete(node);
            visited.add(node);
            sorted.push(node);
        }
        this.nodes.forEach(node => {
            if (!visited.has(node) && !visiting.has(node))
                visit(node);
        });
        return sorted;
    }
    updateFunctioncharts() {
        const self = this;
        // Update Functionchart types.
        this.reverseVisitNodes(this.functionchart, item => {
            if (item instanceof Functionchart) {
                const typeInfo = self.getFunctionchartTypeInfo(item), instanceType = typeInfo.instanceType;
                item.typeInfo = typeInfo;
                item.type = typeInfo.instanceType.toImportExportType();
                item.typeString = item.type.typeString;
                item.instanceType = instanceType;
            }
        });
    }
    updateDerivedInfo() {
        if (this.derivedInfoNeedsUpdate) {
            // Clear the update flag to avoid re-entering. No changes to the primary data should
            // be made while we're here.
            this.derivedInfoNeedsUpdate = false;
            this.invalidWires = this.updateReferenceLists();
            this.sorted = this.topologicalSort();
            this.instancingGraph = this.buildInstancingGraph();
            this.updateFunctioncharts();
        }
    }
    isValidFunctionchart() {
        if (this.invalidWires.length !== 0 || this.sorted.length !== this.nodes.size)
            return false;
        const self = this, invalidWires = new Array(), invalidInstances = new Array(), invalidFunctioncharts = new Array();
        // Check wires.
        this.wires.forEach(wire => {
            if (!self.isValidWire(wire)) { // TODO incorporate in update graph info?
                invalidWires.push(wire);
            }
        });
        if (invalidWires.length !== 0)
            return false;
        // Check functioncharts and functioninstances.
        this.nodes.forEach(node => {
            if (node instanceof Functionchart) {
                if (node.recursive) {
                    // Recursive functioncharts can't be implicit.
                    if (node.implicit) {
                        invalidFunctioncharts.push(node);
                    }
                }
            }
            else {
                const instance = node.asInstance();
                if (instance) {
                    if (!self.isValidFunctionInstance(instance))
                        invalidInstances.push(instance);
                }
            }
        });
        return invalidFunctioncharts.length === 0 && invalidInstances.length === 0;
    }
    // Makes an array that maps old inputs and outputs to new ones based on the TypeInfo.
    // The input mapping and output mapping are concatenated in the final array. The array
    // has an entry for each input and output in the old TypeInfo. -1 signals that a new
    // pin was added or an old pin was deleted.
    makePinMap(oldTypeInfo, typeInfo) {
        const result = new Array();
        function find(pins, element, index) {
            return pins.find(pin => pin.element === element && pin.index === index);
        }
        function makeMap(oldPins, pins) {
            for (let i = 0; i < oldPins.length; i++) {
                const oldPin = oldPins[i], newPin = find(pins, oldPin.element, oldPin.index);
                if (newPin) {
                    result.push(newPin.fcIndex);
                }
                else {
                    result.push(-1);
                }
            }
        }
        makeMap(oldTypeInfo.inputs, typeInfo.inputs);
        makeMap(oldTypeInfo.outputs, typeInfo.outputs);
        return result;
    }
    remapFunctionInstance(instance, functionchart) {
        const typeInfo = functionchart.typeInfo, oldTypeInfo = functionchart.lastTypeInfo, pinMap = functionchart.pinMap;
        // Remap wires, which are based on the old TypeInfo.
        const inWires = instance.inWires, newInputsLength = typeInfo.inputs.length;
        for (let i = 0; i < inWires.length; i++) {
            const wire = inWires[i];
            if (!wire)
                continue;
            if (i >= newInputsLength || pinMap[i] === -1) {
                this.deleteItem(wire); // no pin at this index.
            }
            else {
                const newIndex = pinMap[i];
                if (wire.dstPin !== newIndex)
                    wire.dstPin = newIndex;
            }
        }
        const outWires = instance.outWires, newOutputsLength = typeInfo.outputs.length, firstOutput = oldTypeInfo.inputs.length;
        for (let i = 0; i < outWires.length; i++) {
            const wires = outWires[i];
            if (wires.length === 0)
                continue;
            wires.forEach(wire => {
                const newIndex = pinMap[i + firstOutput];
                if (i >= newOutputsLength || newIndex === -1) {
                    this.deleteItem(wire); // no pin at this index.
                }
                else {
                    if (wire.srcPin !== newIndex)
                        wire.srcPin = newIndex;
                }
            });
        }
    }
    makeConsistent() {
        const self = this;
        this.nodes.forEach(node => {
            if (node instanceof Functionchart)
                node.lastTypeInfo = node.typeInfo;
        });
        // Generate next type info.
        this.updateDerivedInfo();
        // Update type strings for all functioncharts and instances.
        this.visitNodes(this.functionchart, node => {
            if (node instanceof Functionchart) {
                const typeInfo = node.typeInfo, instanceType = typeInfo.instanceType, type = instanceType.toImportExportType();
                if (node.typeString !== type.typeString) {
                    node.typeString = type.typeString;
                }
            }
            else {
                const instance = node.asInstance();
                if (instance) {
                    const type = instance.getSrcType(), typeString = type.typeString;
                    // TODO varArgs merging.
                    if (instance.typeString !== typeString)
                        instance.typeString = typeString;
                }
            }
        });
        // Generate pin maps for updating wired instances.
        this.nodes.forEach(node => {
            if (node instanceof Functionchart) {
                const typeInfo = node.typeInfo;
                let lastTypeInfo = node.lastTypeInfo;
                if (lastTypeInfo === emptyTypeInfo)
                    lastTypeInfo = typeInfo;
                node.pinMap = self.makePinMap(lastTypeInfo, typeInfo);
            }
            else if (node.type.varArgs) {
                // Reroute wires to maintain the varArgs invariants:
                // 1) There are no gaps in the varArgs range...
                // 2) Except the last pin, which is unwired.
                const type = node.type, inWires = node.inWires, length = inWires.length;
                let wired = 0, unwired = 0;
                for (let i = 0; i < length; i++) {
                    const wire = inWires[i];
                    if (wire) {
                        if (unwired > 0) {
                            wire.dstPin = wire.dstPin - unwired;
                        }
                        wired++;
                    }
                    else {
                        unwired++;
                    }
                }
                const newLength = wired + 1;
                if (newLength !== length) {
                    // The type has to change.
                    const inputs = new Array(newLength);
                    for (let i = 0; i < newLength; i++) {
                        inputs[i] = new Pin(Type.valueType);
                        inputs[i].varArgs = i + 1;
                    }
                    const newType = Type.fromInfo(inputs, [new Pin(Type.valueType)]);
                    node.typeString = newType.typeString;
                }
            }
            // Update to the new types.
            this.updateDerivedInfo();
        });
        // Delete unsupported FunctionInstances. Update the rest.
        Array.from(this.nodes).forEach(node => {
            if (node instanceof FunctionInstance) {
                const src = node.src, srcPin = node.srcPin, supported = self.nodes.has(src) && src.instances[srcPin].includes(node);
                if (!supported) {
                    self.disconnectNode(node);
                    self.deleteItem(node);
                }
                else {
                    const instancer = node.src;
                    if (instancer instanceof Functionchart) {
                        self.remapFunctionInstance(node, instancer);
                    }
                    else {
                        const type = node.getSrcType();
                        node.type = type;
                    }
                }
            }
        });
        this.nodes.forEach(node => {
            if (node instanceof Functionchart) {
                node.lastTypeInfo = node.pinMap = undefined;
            }
        });
        this.updateDerivedInfo();
        // Make sure wires between elements are contained by the lowest common parent functionchart.
        Array.from(this.wires.values()).forEach(wire => {
            const src = wire.src, dst = wire.dst, srcParent = src.parent, dstParent = dst.parent, lca = getLowestCommonAncestor(srcParent, dstParent);
            if (wire.parent !== lca) {
                self.addItem(wire, lca);
            }
        });
    }
    replaceNode(node, newNode) {
        const parent = node.parent, // TODO replace at the same index (change addItem to take index).
        newType = newNode.type;
        // Add newNode so that both nodes are present as we rewire them.
        this.addItem(newNode, parent);
        newNode.x = node.x;
        newNode.y = node.y;
        // Update all incoming and outgoing wires if possible; otherwise they
        // are deleted.
        const srcChange = new Array(), dstChange = new Array();
        node.inWires.forEach(wire => {
            if (!wire)
                return;
            const src = wire.src, srcPin = wire.srcPin, dstPin = wire.dstPin;
            if (dstPin < newType.inputs.length &&
                src.type.outputs[srcPin].type.canConnectTo(newNode.type.inputs[dstPin].type)) {
                dstChange.push(wire);
            }
            else {
                this.deleteItem(wire);
            }
        });
        node.outWires.forEach(wires => {
            if (wires.length === 0)
                return;
            // Copy array since we're mutating.
            wires.slice().forEach(wire => {
                if (!wire)
                    return;
                const dst = wire.dst, srcPin = wire.srcPin, dstPin = wire.dstPin;
                if (srcPin < newType.outputs.length &&
                    newNode.type.outputs[srcPin].type.canConnectTo(dst.type.inputs[dstPin].type)) {
                    srcChange.push(wire);
                }
                else {
                    this.deleteItem(wire);
                }
            });
        });
        srcChange.forEach(wire => {
            wire.src = newNode;
        });
        dstChange.forEach(function (wire) {
            wire.dst = newNode;
        });
        this.deleteItem(node);
    }
    dropNodeOnElement(node, target) {
        const selection = this.selection;
        if (target instanceof ModifierElement && this.canAddNode(node, target)) {
            // We could replaceNode but any errors can't be corrected in the current editor. We
            // have no way to un-import/export.
            if (target.innerElement)
                this.disconnectNode(target.innerElement);
            this.addItem(node, target);
            selection.delete(node);
            selection.add(target);
        }
        else {
            this.replaceNode(target, node);
            selection.add(node);
        }
    }
    // Create an abstract functionchart to represent the given type.
    typeToFunctionchart(type) {
        const self = this, layoutEngine = this.layoutEngine, map = new Map(), functioncharts = new Array();
        // Recursively build the function chart. Cycles in the type dependency graph are impossible.
        function populate(type) {
            const functionchart = self.newFunctionchart('functionchart');
            functionchart.name = type.name;
            let y;
            y = 8;
            type.inputs.forEach(pin => {
                const pinType = pin.type;
                if (pinType === Type.valueType) {
                    const input = self.newPseudoelement('input'), name = pin.name || '';
                    ;
                    input.x = 8;
                    input.y = y;
                    input.typeString = '[,v(' + name + ')]';
                    y += layoutEngine.getBounds(input).height + 8;
                    functionchart.nodes.append(input);
                }
                else {
                    let subFunctionchart = map.get(pinType);
                    if (!subFunctionchart) {
                        subFunctionchart = populate(pinType);
                        subFunctionchart.name = pinType.name;
                    }
                    // Create an instance of the abstract sub-functionchart, to generate the input pin.
                    const instance = self.newElement('instance');
                    instance.src = subFunctionchart;
                    instance.srcPin = 0;
                    instance.typeString = pinType.typeString;
                    instance.x = 8;
                    instance.y = y;
                    y += layoutEngine.getBounds(instance).height + 8;
                    functionchart.nodes.append(instance);
                }
            });
            y = 8;
            type.outputs.forEach(pin => {
                const pinType = pin.type;
                if (pinType === Type.valueType) {
                    const output = self.newPseudoelement('output'), name = pin.name || '';
                    output.x = 40;
                    output.y = y;
                    output.typeString = '[v(' + name + '),]';
                    y += layoutEngine.getBounds(output).height + 8;
                    functionchart.nodes.append(output);
                }
                else {
                    let subFunctionchart = map.get(pinType);
                    if (!subFunctionchart) {
                        subFunctionchart = populate(pinType);
                        subFunctionchart.name = pinType.name;
                    }
                    // Create an output, wired to the sub-functionchart, to generate the output pin.
                    const output = self.newPseudoelement('output'), name = pin.name || '';
                    output.x = 40;
                    output.y = y;
                    output.typeString = '[v(' + name + '),]';
                    y += layoutEngine.getBounds(output).height + 8;
                    functionchart.nodes.append(output);
                    const wire = self.newWire(subFunctionchart, 0, output, 0);
                    functionchart.wires.append(wire);
                }
            });
            layoutEngine.layoutFunctionchart(functionchart);
            functionchart.width += type.width;
            map.set(type, functionchart);
            functioncharts.push(functionchart);
            return functionchart;
        }
        const root = populate(type);
        let y = root.height;
        functioncharts.forEach(functionchart => {
            if (functionchart === root)
                return;
            functionchart.x = 8;
            functionchart.y = y;
            y += layoutEngine.getBounds(functionchart).height + 8;
            root.nodes.append(functionchart);
        });
        layoutEngine.layoutFunctionchart(root);
        return root;
    }
    modifyElement(element, modifierType) {
        const modifier = this.newElement(modifierType);
        let typeString;
        switch (modifierType) {
            case 'importer':
            case 'exporter':
                typeString = element.type.toImportExportType().typeString;
                break;
            case 'upCast':
                typeString = element.type.toUpCastType().typeString;
                break;
            case 'constructor':
                typeString = element.type.toConstructorType().typeString;
                break;
            case 'downCast':
                typeString = element.type.toDownCastType().typeString;
                break;
        }
        modifier.typeString = typeString;
        modifier.x = element.x;
        modifier.y = element.y;
        return modifier;
    }
    modifyElements(elements, modifierType) {
        const self = this, selection = this.selection;
        elements.forEach(element => {
            if (element instanceof ModifierElement)
                return;
            self.disconnectNode(element);
            selection.delete(element);
            const importer = self.modifyElement(element, modifierType), parent = element.parent;
            self.addItem(importer, parent);
            self.addItem(element, importer);
            selection.add(importer);
        });
    }
    abstractElement(element) {
        const type = element.type, layoutEngine = this.layoutEngine, bounds = layoutEngine.getBounds(element);
        const abstractElement = this.newElement('element');
        abstractElement.name = 'abstract';
        abstractElement.x = bounds.x;
        abstractElement.y = bounds.y;
        abstractElement.typeString = type.typeString;
        return abstractElement;
    }
    abstractElements(elements, asFunctioncharts) {
        const self = this, selection = this.selection;
        elements.forEach(element => {
            selection.delete(element);
            if (asFunctioncharts) {
                const abstractElement = self.abstractElement(element);
                self.replaceNode(element, abstractElement);
                selection.add(abstractElement);
            }
            else {
                const abstractFunctionchart = self.typeToFunctionchart(element.type);
                self.addItem(abstractFunctionchart, element.parent);
                self.disconnectNode(element);
                self.deleteItem(element);
                abstractFunctionchart.x = element.x;
                abstractFunctionchart.y = element.y;
                self.addItem(abstractFunctionchart, element.parent);
                selection.add(abstractFunctionchart);
            }
        });
    }
    group(items, grandparent, bounds) {
        const self = this, selection = this.selection, parent = this.newFunctionchart('functionchart');
        parent.x = bounds.x;
        parent.y = bounds.y;
        // parent.width = bounds.width;
        // parent.height = bounds.height;
        this.addItem(parent, grandparent);
        items.forEach(item => {
            self.addItem(item, parent);
            selection.add(item);
        });
        selection.add(parent);
    }
    // Visit the given pin, then follow wires from the parent element.
    visitPin(node, index, visitor, visited) {
        if (visited.has(node, index))
            return;
        visited.add(node, index);
        visitor(node, index);
        const type = node.type, firstOutput = type.inputs.length;
        if (index < firstOutput) {
            const wire = node.inWires[index];
            if (wire) {
                const src = wire.src;
                if (src) {
                    const srcPin = wire.srcPin, index = src.type.inputs.length + srcPin;
                    this.visitPin(src, index, visitor, visited);
                }
            }
        }
        else {
            const wires = node.outWires[index - firstOutput];
            if (wires) { // |wires| may be undefined if the instance doesn't has its type yet.
                for (let i = 0; i < wires.length; i++) {
                    const wire = wires[i];
                    if (wire) {
                        const dst = wire.dst;
                        if (dst) {
                            const dstPin = wire.dstPin;
                            this.visitPin(dst, dstPin, visitor, visited);
                        }
                    }
                }
            }
        }
    }
    // Visits the pin, all pins wired to it, and returns the type of the first non-value
    // pin it finds.
    inferPinType(element, index, visited = new Multimap()) {
        let type = Type.valueType;
        function visit(element, index) {
            const pin = element.getPin(index);
            // |pin| may be undefined if the instance doesn't has its type yet.
            if (pin && pin.type !== Type.valueType) {
                type = pin.type;
            }
            return true;
        }
        this.visitPin(element, index, visit, visited);
        // As a side effect, 'visited' is populated.
        return type;
    }
    getFunctionchartTypeInfo(functionchart) {
        const self = this, inputs = new Array(), outputs = new Array(), name = functionchart.name, implicit = functionchart.implicit, subgraphInfo = self.getSubgraphInfo(functionchart.nodes.asArray()), closed = subgraphInfo.inWires.size == 0;
        // A functionchart is abstract if it has no wires.
        let abstract = subgraphInfo.wires.size === 0 && subgraphInfo.inWires.size === 0;
        let sideEffects = false;
        // Collect the functionchart's input and output pseudoelements.
        subgraphInfo.nodes.forEach(node => {
            if (node instanceof Pseudoelement) {
                if (node.template === inputTemplate) {
                    const connected = new Multimap(); // TODO move this out
                    const type = self.inferPinType(node, 0, connected);
                    const name = node.type.outputs[0].name;
                    const pinInfo = { element: node, index: 0, type, name, fcIndex: -1 };
                    inputs.push(pinInfo);
                }
                else if (node.template === outputTemplate) {
                    const connected = new Multimap();
                    const type = self.inferPinType(node, 0, connected);
                    const name = node.type.inputs[0].name;
                    const pinInfo = { element: node, index: 0, type, name, fcIndex: -1 };
                    outputs.push(pinInfo);
                }
            }
            else {
                // Special cases of nodes that generate pins.
                if (node instanceof ModifierElement && node.isImporter) {
                    // Instancers are inputs.
                    const innerType = node.innerType, name = innerType.name, type = innerType.rename(), pinInfo = { element: node, index: 0, type, name, fcIndex: -1 };
                    inputs.push(pinInfo);
                }
                else if (node instanceof ModifierElement && node.isExporter && node.isAbstract) {
                    // Abstract exporters are outputs.
                    const type = node.innerType, name = undefined, pinInfo = { element: node, index: 0, type, name, fcIndex: -1 };
                    outputs.push(pinInfo);
                }
                else if (node instanceof Element && node.isAbstract) {
                    // Abstract elements become a single input (and don't implicitly generate other pins).
                    const type = node.type, name = undefined, pinInfo = { element: node, index: 0, type, name, fcIndex: -1 };
                    inputs.push(pinInfo);
                }
                else {
                    // The general case node...
                    abstract = abstract && node.isAbstract;
                    sideEffects = sideEffects || node.hasSideEffects;
                    if (implicit && (node instanceof Element || node instanceof Functionchart)) {
                        // In implicit mode, empty pins of nodes become pins for the functionchart type.
                        const type = node.type, inputPins = type.inputs, outputPins = type.outputs;
                        for (let i = 0; i < inputPins.length; i++) {
                            if (node.inWires[i])
                                continue;
                            const pin = inputPins[i];
                            const type = pin.type, name = pin.name, pinInfo = { element: node, index: i, type, name, fcIndex: -1 };
                            inputs.push(pinInfo);
                        }
                        for (let i = 0; i < outputPins.length; i++) {
                            // If output is used or instanced from.
                            if (node.outWires[i].length !== 0 || node.instances[i].length !== 0)
                                continue;
                            const pin = outputPins[i];
                            const type = pin.type, name = pin.name, pinInfo = { element: node, index: i, type, name, fcIndex: -1 };
                            outputs.push(pinInfo);
                        }
                    }
                }
            }
        });
        // Sort pins in increasing y-order. This lets users arrange the pins of the
        // new type in an intuitive way.
        function compareYs(p1, p2) {
            const element1 = p1.element, element2 = p2.element, pin1 = element1.getPin(p1.index), pin2 = element2.getPin(p2.index), y1 = element1.globalPosition.y + pin1.y, y2 = element2.globalPosition.y + pin2.y;
            return y1 - y2;
        }
        // function compareIndices(p1: PinInfo, p2: PinInfo) {
        //   return p1.fcIndex - p2.fcIndex;
        // }
        inputs.sort(compareYs);
        inputs.forEach((input, i) => { input.fcIndex = i; });
        outputs.sort(compareYs);
        outputs.forEach((output, i) => { output.fcIndex = i; });
        const inputPins = inputs.map(pinInfo => {
            return new Pin(pinInfo.type, pinInfo.name);
        });
        const outputPins = outputs.map(pinInfo => {
            return new Pin(pinInfo.type, pinInfo.name);
        });
        const type = Type.fromInfo(inputPins, outputPins, name);
        return { instanceType: type, closed, abstract, sideEffects, inputs, outputs };
    }
    updateGlobalPosition(node) {
        if (node instanceof NodeBase) {
            this.visitNodes(node, item => this.setGlobalPosition(item));
        }
    }
    insertElement(element, parent) {
        this.nodes.add(element);
        element.parent = parent;
        if (element instanceof ModifierElement) {
            if (element.innerElement) {
                this.insertElement(element.innerElement, element);
            }
        }
        else if (parent instanceof ModifierElement) {
            parent.updateTypeInfo();
        }
        element.type = Type.fromString(element.typeString);
        this.updateGlobalPosition(element);
        this.derivedInfoNeedsUpdate = true;
    }
    removeElement(element) {
        this.nodes.delete(element);
        if (element instanceof ModifierElement) {
            if (element.innerElement) {
                this.removeElement(element.innerElement);
            }
        }
        this.derivedInfoNeedsUpdate = true;
    }
    // Parent can be undefined in the case of the root functionchart.
    insertFunctionchart(functionchart, parent) {
        this.nodes.add(functionchart);
        functionchart.parent = parent;
        functionchart.type = Type.fromString(functionchart.typeString).toImportExportType();
        const self = this;
        functionchart.nodes.forEach(item => self.insertItem(item, functionchart));
        functionchart.wires.forEach(wire => self.insertWire(wire, functionchart));
        // Update function chart after all descendants have been updated.
        this.updateGlobalPosition(functionchart);
        this.derivedInfoNeedsUpdate = true;
    }
    removeFunctionchart(functionchart) {
        this.nodes.delete(functionchart);
        const self = this;
        functionchart.wires.forEach(wire => self.removeWire(wire));
        functionchart.nodes.forEach(element => self.removeItem(element));
        this.derivedInfoNeedsUpdate = true;
    }
    insertWire(wire, parent) {
        this.wires.add(wire);
        wire.parent = parent;
        this.derivedInfoNeedsUpdate = true;
    }
    removeWire(wire) {
        this.wires.delete(wire);
        this.derivedInfoNeedsUpdate = true; // Removal might break a cycle, making an unsortable graph sortable.
    }
    insertItem(item, parent) {
        if (!this.nodes.has(parent))
            return; // Ignore changes while object graphs are constructed.
        if (parent instanceof Functionchart) {
            if (item instanceof Wire) {
                this.insertWire(item, parent);
            }
            else if (item instanceof Functionchart) {
                this.insertFunctionchart(item, parent);
            }
            else {
                this.insertElement(item, parent);
            }
        }
        else if (parent instanceof ModifierElement && item instanceof Element) {
            this.insertElement(item, parent);
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
        if (owner instanceof NodeBase) {
            if (prop === typeStringProp) {
                const newType = Type.fromString(owner.typeString);
                owner.type = newType;
                if (owner.parent instanceof ModifierElement) {
                    owner.parent.updateTypeInfo();
                }
            }
            else {
                this.updateGlobalPosition(owner);
            }
        }
        this.onValueChanged(owner, prop, oldValue);
        this.derivedInfoNeedsUpdate = true;
    }
    elementInserted(owner, prop, index) {
        if (this.nodes.has(owner)) {
            const value = prop.get(owner).get(index);
            this.insertItem(value, owner);
            this.onElementInserted(owner, prop, index);
        }
    }
    elementRemoved(owner, prop, index, oldValue) {
        if (this.nodes.has(owner)) {
            this.removeItem(oldValue);
            this.onElementRemoved(owner, prop, index, oldValue);
        }
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
            case 'element':
            case 'importer':
            case 'exporter':
            case 'constructor':
            case 'upCast':
            case 'downCast':
            case 'instance': return this.newElement(typeName);
            case 'input':
            case 'output':
            case 'use': return this.newPseudoelement(typeName);
            case 'wire': return this.newWire(undefined, -1, undefined, -1);
            case 'functionchart': return this.newFunctionchart(typeName);
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
    constructor(theme = new Theme()) {
        super();
        this.textIndent = 8;
        this.textLeading = 6;
        this.knobbyRadius = 4;
        this.padding = 4;
        this.spacing = 8;
        this.minTypeWidth = 8;
        this.minTypeHeight = 8;
        this.minFunctionchartWidth = 56;
        this.minFunctionchartHeight = 32;
        Object.assign(this, theme);
        // Layout the base types.
        const pinSize = 2 * this.knobbyRadius;
        Type.valueType.width = pinSize;
        Type.valueType.height = pinSize;
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
// TODO merge with ElementHitResult, as NodeHitResult.
class FunctionchartHitResult {
    constructor(item, inner) {
        this.input = -1;
        this.output = -1;
        this.item = item;
        this.inner = inner;
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
    constructor(theme = new FunctionchartTheme()) {
        this.theme = theme;
    }
    begin(ctx) {
        this.ctx = ctx;
        ctx.save();
        ctx.font = this.theme.font;
    }
    end() {
        this.ctx.restore();
    }
    // Get bounding box for elements, functioncharts, and wires.
    getBounds(item) {
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
                // All element types.
                const type = item.type;
                width = type.width;
                height = type.height;
            }
        }
        return { x, y, width, height };
    }
    getInnerElementOffset(modifier) {
        const spacing = this.theme.spacing, type = modifier.type;
        if (type.needsLayout) {
            this.layoutType(type);
        }
        switch (modifier.template.typeName) {
            case 'upCast': {
                const y = type.outputs[1].y;
                return { x: spacing + spacing, y };
            }
            case 'downCast': {
                const y = type.inputs[0].y;
                return { x: 0, y };
            }
            default: {
                const y = type.outputs[0].y;
                return { x: spacing, y };
            }
        }
    }
    // Get wire attachment point for element input/output pins.
    inputPinToPoint(node, index) {
        const rect = this.getBounds(node), type = node.type, pin = type.inputs[index];
        return { x: rect.x, y: rect.y + pin.y + pin.type.height / 2, nx: -1, ny: 0 };
    }
    outputPinToPoint(node, index) {
        const rect = this.getBounds(node), type = node.type, pin = type.outputs[index];
        // Handle special case of functionchart's output.
        if (node instanceof Functionchart) {
            const type = node.instanceType, r = Functionchart.radius, right = rect.x + rect.width;
            return { x: right, y: rect.y + r + type.height / 2, nx: 1, ny: 0 };
        }
        return { x: rect.x + rect.width, y: rect.y + pin.y + pin.type.height / 2, nx: 1, ny: 0 };
    }
    pinToRect(pin, pinPt) {
        const width = pin.type.width, height = pin.type.height, x = pinPt.x - (pinPt.nx + 1) * width / 2, y = pinPt.y - (pinPt.ny + 1) * height / 2;
        return { x, y, width, height };
    }
    instancerBounds(instancer, srcPin = 0) {
        const pinPt = this.outputPinToPoint(instancer, srcPin), pinRect = this.pinToRect(instancer.type.outputs[srcPin], pinPt);
        return pinRect;
    }
    sumBounds(items) {
        let xMin = Number.POSITIVE_INFINITY, yMin = Number.POSITIVE_INFINITY, xMax = -Number.POSITIVE_INFINITY, yMax = -Number.POSITIVE_INFINITY;
        for (let item of items) {
            const rect = this.getBounds(item);
            xMin = Math.min(xMin, rect.x);
            yMin = Math.min(yMin, rect.y);
            xMax = Math.max(xMax, rect.x + rect.width);
            yMax = Math.max(yMax, rect.y + rect.height);
        }
        return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
    }
    // Compute sizes for an element type.
    layoutType(type) {
        const self = this, ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, spacing = theme.spacing, name = type.name, inputs = type.inputs, outputs = type.outputs;
        let height = 0, width = 0;
        if (name) {
            width = spacing + ctx.measureText(name).width;
            height += textSize;
        }
        function layoutPins(pins) {
            let y = height, w = 0;
            for (let i = 0; i < pins.length; i++) {
                const pin = pins[i], name = pin.name;
                self.layoutPin(pin);
                pin.y = y + spacing / 2;
                let pw = pin.type.width, ph = pin.type.height + spacing / 2;
                if (name) {
                    pin.baseline = y + spacing / 2 + textSize;
                    if (textSize > ph) {
                        // pin.y += (textSize - ph) / 2;
                        ph = textSize;
                    }
                    else {
                        pin.baseline += (ph - textSize) / 2;
                    }
                    pw += spacing + ctx.measureText(name).width;
                }
                y += ph;
                w = Math.max(w, pw);
            }
            return [y, w];
        }
        let [yIn, wIn] = layoutPins(inputs);
        let [yOut, wOut] = layoutPins(outputs);
        type.width = Math.round(Math.max(width, wIn + wOut + spacing, theme.minTypeWidth));
        type.height = Math.round(Math.max(yIn, yOut, theme.minTypeHeight) + spacing / 2);
    }
    layoutPin(pin) {
        const type = pin.type;
        if (type.needsLayout)
            this.layoutType(type);
    }
    layoutElement(element) {
        const type = element.type;
        if (type.needsLayout) {
            this.layoutType(type);
        }
    }
    layoutWire(wire) {
        let src = wire.src, dst = wire.dst, p1 = wire.pSrc, p2 = wire.pDst;
        // Since we intercept change events and not transactions, wires may be in
        // an inconsistent state, so check before creating the path.
        if (src && wire.srcPin >= 0) {
            p1 = this.outputPinToPoint(src, wire.srcPin);
        }
        if (dst && wire.dstPin >= 0) {
            p2 = this.inputPinToPoint(dst, wire.dstPin);
        }
        if (p1 && p2) {
            wire.bezier = getEdgeBezier(p1, p2, 0);
        }
    }
    // Make sure a functionchart is big enough to enclose its contents.
    layoutFunctionchart(functionchart) {
        const self = this, spacing = this.theme.spacing, type = functionchart.instanceType, nodes = functionchart.nodes;
        if (type.needsLayout) {
            this.layoutType(type);
        }
        let width, height;
        if (nodes.length === 0) {
            width = self.theme.minFunctionchartWidth;
            height = self.theme.minFunctionchartHeight;
        }
        else {
            const extents = self.sumBounds(nodes.asArray()), global = functionchart.globalPosition, x = global.x, y = global.y, margin = 2 * spacing;
            width = extents.x + extents.width - x + margin;
            height = extents.y + extents.height - y + margin;
            // Make sure instancer fits. It may overlap with the contents at the bottom right.
            width = Math.max(width, type.width + margin);
            height = Math.max(height, type.height + margin);
        }
        width = Math.max(width, functionchart.width);
        height = Math.max(height, functionchart.height);
        if (width !== functionchart.width)
            functionchart.width = width;
        if (height !== functionchart.height)
            functionchart.height = height;
    }
    drawInputs(type, x, y, limit) {
        const ctx = this.ctx, spacing = this.theme.spacing;
        for (let i = 0; i < limit; i++) {
            const pin = type.inputs[i], name = pin.name;
            this.drawPin(pin, x, y + pin.y);
            if (name) {
                ctx.textAlign = 'left';
                ctx.fillText(name, x + pin.type.width + spacing, y + pin.baseline);
            }
        }
    }
    drawOutputs(type, x, y, limit) {
        const ctx = this.ctx, spacing = this.theme.spacing, right = x + type.width;
        for (let i = 0; i < limit; i++) {
            const pin = type.outputs[i], pinLeft = right - pin.type.width, name = pin.name;
            this.drawPin(pin, pinLeft, y + pin.y);
            if (name) {
                ctx.textAlign = 'right';
                ctx.fillText(name, pinLeft - spacing, y + pin.baseline);
            }
        }
    }
    drawType(type, x, y) {
        const ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, spacing = theme.spacing, name = type.name, w = type.width;
        ctx.beginPath();
        ctx.lineWidth = 0.5;
        ctx.fillStyle = theme.textColor;
        if (name) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(name, x + w / 2, y + textSize + spacing / 2);
        }
        this.drawInputs(type, x, y, type.inputs.length);
        this.drawOutputs(type, x, y, type.outputs.length);
    }
    drawPin(pin, x, y) {
        const ctx = this.ctx, theme = this.theme;
        ctx.strokeStyle = theme.strokeColor;
        ctx.lineWidth = 0.5;
        if (pin.type === Type.valueType) {
            const r = theme.knobbyRadius;
            ctx.beginPath();
            const d = 2 * r;
            ctx.rect(x, y, d, d);
            // ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
            ctx.stroke();
        }
        else {
            const type = pin.type, width = type.width, height = type.height;
            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.stroke();
            this.drawType(type, x, y);
        }
    }
    drawFunctionInstanceLink(instance, color) {
        const ctx = this.ctx, theme = this.theme, offset = theme.spacing / 2, rect = this.getBounds(instance), x = rect.x, y = rect.y, w = rect.width, h = rect.height, p1 = this.outputPinToPoint(instance.src, instance.srcPin), p2 = { x, y: y + h / 2, nx: -1, ny: 0 };
        ctx.strokeStyle = color;
        p1.x += offset;
        p2.x -= offset;
        const bezier = getEdgeBezier(p1, p2, 0);
        ctx.beginPath();
        bezierEdgePath(bezier, ctx, 0);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    abstractStroke(ctx) {
        ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.setLineDash([0]);
    }
    drawSideEffectsTick(right, top) {
        const ctx = this.ctx, theme = this.theme, spacing = theme.spacing;
        ctx.moveTo(right - spacing, top);
        ctx.lineTo(right, top + spacing);
    }
    drawElement(element, mode) {
        if (element.parent instanceof ModifierElement) // TODO something better
            return;
        const ctx = this.ctx, theme = this.theme, rect = this.getBounds(element), x = rect.x, y = rect.y, w = rect.width, h = rect.height;
        ctx.beginPath();
        // Importers and abstract instances define function inputs, so use the input shape.
        if (element instanceof ModifierElement) {
            const d = theme.knobbyRadius * 2;
            if (element.isImporter) {
                inFlagPath(x - d, y, w + d, h, d, ctx);
            }
            else if (element.isExporter) {
                outFlagPath(x, y, w + d, h, d, ctx);
            }
            else if (element.isConstructor) {
                notchedRectPath(x, y, w, h, theme.spacing / 2, ctx);
            }
            else {
                ctx.rect(x, y, w, h);
            }
        }
        else {
            if (element.hasSideEffects) {
                notchedRectPath(x, y, w, h, theme.spacing / 3, ctx);
            }
            else {
                ctx.rect(x, y, w, h);
            }
        }
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Palette:
            case RenderMode.Print: {
                const fillStyle = (mode === RenderMode.Palette) ? theme.altBgColor : theme.bgColor;
                ctx.fillStyle = fillStyle;
                if (!(element.parent instanceof ModifierElement))
                    ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 0.5;
                if (element.isAbstract) {
                    this.abstractStroke(ctx);
                }
                else {
                    ctx.stroke();
                }
                // Shade function outputs that can be instanced.
                if (!element.isExporter) {
                    ctx.beginPath();
                    const right = x + w;
                    element.type.outputs.forEach(pin => {
                        const type = pin.type;
                        if (type !== Type.valueType) {
                            ctx.rect(right - type.width, y + pin.y, type.width, type.height);
                        }
                    });
                    ctx.fillStyle = theme.altBgColor;
                    ctx.fill();
                    ctx.fillStyle = fillStyle;
                }
                this.drawType(element.type, x, y);
                break;
            }
            case RenderMode.Highlight:
            case RenderMode.HotTrack:
                ctx.strokeStyle = (mode === RenderMode.Highlight) ? theme.highlightColor : theme.hotTrackColor;
                ctx.lineWidth = 2;
                if (element.isAbstract) {
                    this.abstractStroke(ctx);
                }
                else {
                    ctx.stroke();
                }
                break;
        }
    }
    drawPseudoElement(element, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.knobbyRadius, d = r * 2, rect = this.getBounds(element), x = rect.x, y = rect.y, w = rect.width, h = rect.height;
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Palette:
            case RenderMode.Print: {
                ctx.fillStyle = mode === RenderMode.Palette ? theme.altBgColor : theme.bgColor;
                ctx.strokeStyle = theme.strokeColor;
                switch (element.template.typeName) {
                    case 'input': {
                        inFlagPath(x, y, w, h, d, ctx);
                        break;
                    }
                    case 'output': {
                        outFlagPath(x, y, w, h, d, ctx);
                        break;
                    }
                    case 'use': {
                        roundRectPath(x, y, w, h, 2 * r, ctx);
                    }
                }
                ctx.fill();
                ctx.lineWidth = 0.5;
                ctx.stroke();
                this.drawType(element.type, x, y);
                break;
            }
            case RenderMode.Highlight:
            case RenderMode.HotTrack:
                ctx.beginPath();
                ctx.strokeStyle = mode === RenderMode.Highlight ? theme.highlightColor : theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.rect(x, y, w, h);
                ctx.stroke();
                break;
        }
    }
    drawFunctionchart(functionchart, mode) {
        const ctx = this.ctx, theme = this.theme, r = Functionchart.radius, implicit = functionchart.implicit, rect = this.getBounds(functionchart), x = rect.x, y = rect.y, w = rect.width, h = rect.height;
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
                const pinRect = this.instancerBounds(functionchart, 0);
                if (functionchart.hasSideEffects) {
                    notchedRectPath(pinRect.x, pinRect.y, pinRect.width, pinRect.height, theme.spacing / 3, ctx);
                }
                else {
                    ctx.beginPath();
                    ctx.rect(pinRect.x, pinRect.y, pinRect.width, pinRect.height);
                }
                ctx.fillStyle = theme.altBgColor;
                ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                if (functionchart.isAbstract) {
                    this.abstractStroke(ctx);
                }
                else {
                    ctx.stroke();
                }
                const instanceType = functionchart.instanceType;
                this.drawType(instanceType, x + w - instanceType.width, y + r);
                if (implicit) {
                    // Draw tick marks indicating the auto-generated pins.
                    const self = this, spacing = theme.spacing, typeInfo = functionchart.typeInfo, inputs = typeInfo.inputs, outputs = typeInfo.outputs;
                    ctx.beginPath();
                    ctx.lineWidth = 1;
                    inputs.forEach(input => {
                        const element = input.element;
                        if (element instanceof Pseudoelement || element.type.inputs.length === 0)
                            return;
                        const p = self.inputPinToPoint(element, input.index);
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x - spacing, p.y);
                    });
                    outputs.forEach(output => {
                        const element = output.element;
                        if (element instanceof Pseudoelement || element.type.outputs.length === 0)
                            return;
                        const p = self.outputPinToPoint(element, output.index);
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x + spacing, p.y);
                    });
                    ctx.stroke();
                }
                break;
            case RenderMode.Highlight:
            case RenderMode.HotTrack:
                ctx.strokeStyle = (mode === RenderMode.Highlight) ? theme.highlightColor : theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
    }
    hitTestElement(element, p, tol, mode) {
        if (element.parent instanceof ModifierElement) // TODO something better
            return;
        const rect = this.getBounds(element), x = rect.x, y = rect.y, width = rect.width, height = rect.height, hitInfo = hitTestRect(x, y, width, height, p, tol);
        if (!hitInfo)
            return;
        const self = this, result = new ElementHitResult(element, hitInfo), type = element.type;
        if (mode !== RenderMode.Palette) {
            for (let i = 0; i < type.inputs.length; i++) {
                const pinPt = self.inputPinToPoint(element, i), rect = self.pinToRect(type.inputs[i], pinPt);
                if (hitTestRect(rect.x, rect.y, rect.width, rect.height, p, 0)) {
                    result.input = i;
                }
            }
            for (let i = 0; i < type.outputs.length; i++) {
                const pinPt = self.outputPinToPoint(element, i), rect = self.pinToRect(type.outputs[i], pinPt);
                if (hitTestRect(rect.x, rect.y, rect.width, rect.height, p, 0)) {
                    result.output = i;
                }
            }
        }
        return result;
    }
    hitTestFunctionchart(functionchart, p, tol, mode) {
        const rect = this.getBounds(functionchart), x = rect.x, y = rect.y, w = rect.width, h = rect.height, inner = hitTestRect(x, y, w, h, p, tol);
        if (!inner)
            return;
        const result = new FunctionchartHitResult(functionchart, inner);
        const pinRect = this.instancerBounds(functionchart, 0);
        if (hitTestRect(pinRect.x, pinRect.y, pinRect.width, pinRect.height, p, 0)) {
            result.output = 0;
        }
        return result;
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
        // Draw the pin type for dragging wires where src or dst are not connected.
        if (wire.dst === undefined) {
            const pin = wire.src.type.outputs[wire.srcPin], pinPos = wire.pDst, pinX = pinPos.x, pinY = pinPos.y - pin.type.height / 2;
            this.drawPin(pin, pinX, pinY);
        }
        else if (wire.src === undefined) {
            const pin = wire.dst.type.inputs[wire.dstPin], pinPos = wire.pSrc, pinX = pinPos.x - pin.type.width, pinY = pinPos.y - pin.type.height / 2;
            this.drawPin(pin, pinX, pinY);
        }
    }
    hitTestWire(wire, p, tol, mode) {
        // TODO don't hit test new wire as it's dragged.
        const hitInfo = hitTestBezier(wire.bezier, p, tol);
        if (hitInfo) {
            return new WireHitResult(wire, hitInfo);
        }
    }
    draw(item, mode) {
        if (item instanceof NodeBase) {
            if (item instanceof Functionchart) {
                this.drawFunctionchart(item, mode);
            }
            else if (item instanceof Pseudoelement) {
                this.drawPseudoElement(item, mode);
            }
            else {
                this.drawElement(item, mode);
            }
        }
        else {
            this.drawWire(item, mode);
        }
    }
    hitTest(item, p, tol, mode) {
        let hitInfo;
        if (item instanceof NodeBase) {
            if (item instanceof Functionchart) {
                hitInfo = this.hitTestFunctionchart(item, p, tol, mode);
            }
            else {
                hitInfo = this.hitTestElement(item, p, tol, mode);
            }
        }
        else {
            hitInfo = this.hitTestWire(item, p, tol, mode);
        }
        return hitInfo;
    }
    layout(item) {
        if (item instanceof NodeBase) {
            if (item instanceof Functionchart) {
                this.layoutFunctionchart(item);
            }
            else {
                this.layoutElement(item);
            }
        }
        else {
            this.layoutWire(item);
        }
    }
    drawHoverInfo(info, p) {
        const theme = this.theme, strokeColor = theme.hoverColor, ctx = this.ctx, x = p.x, y = p.y;
        let displayType;
        if (info instanceof ElementHitResult) {
            const element = info.item, type = element.type;
            if (info.input >= 0) {
            }
            else if (info.output >= 0) {
                const pinIndex = info.output, pin = type.outputs[pinIndex];
                // Show link to instances.
                if (pin.type !== Type.valueType) {
                    element.instances[pinIndex].forEach(instance => this.drawFunctionInstanceLink(instance, strokeColor));
                }
            }
            if (element instanceof FunctionInstance) {
                this.drawFunctionInstanceLink(element, strokeColor);
            }
        }
        else if (info instanceof FunctionchartHitResult) {
            const functionchart = info.item;
            if (info.output === 0) {
                functionchart.instances[0].forEach(instance => this.drawFunctionInstanceLink(instance, strokeColor));
            }
        }
        else if (info instanceof WireHitResult) {
            displayType = info.item.type; // Wire type is src or dst pin type.
        }
        if (displayType) {
            const w = displayType.width, h = displayType.height;
            ctx.fillStyle = theme.hoverColor;
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.strokeStyle = theme.strokeColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            this.drawType(displayType, x, y);
        }
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
    if (hitInfo instanceof ElementHitResult) {
        // Drop onto an element requires type compatibility.
        return true; //lastSelected.type.canConnectTo(hitInfo.item.type);
    }
    return false;
}
function isClickable(hitInfo) {
    return true;
}
function isDraggable(hitInfo) {
    return !(hitInfo instanceof Wire);
}
function isElement(hitInfo) {
    return hitInfo instanceof ElementHitResult;
}
// function isElementInputPin(hitInfo: HitResultTypes) : boolean {
//   return hitInfo instanceof ElementHitResult && hitInfo.input >= 0;
// }
// function isElementOutputPin(hitInfo: HitResultTypes) : boolean {
//   return hitInfo instanceof ElementHitResult && hitInfo.output >= 0;
// }
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
    constructor(wire, type, description) {
        this.wire = wire;
        this.kind = type;
        this.description = description;
    }
}
export class FunctionchartEditor {
    constructor(baseTheme, canvasController, paletteController, propertyGridController) {
        this.scrap = [];
        this.clickInPalette = false;
        this.propertyInfo = new Map();
        const self = this, theme = new FunctionchartTheme(baseTheme);
        this.theme = theme;
        this.canvasController = canvasController;
        this.paletteController = paletteController;
        this.propertyGridController = propertyGridController;
        this.fileController = new FileController();
        // This is finely tuned to allow picking in tight areas, such as input/output pins with
        // wires attached, or near the borders of a functionchart, without making it too difficult
        // to pick wires.
        this.hitTolerance = 6;
        // Change tracking for layout.
        // Changed items that must be updated before drawing and hit testing.
        this.changedItems = new Set();
        // Changed top level functioncharts that must be laid out after transactions and undo/redo.
        this.changedTopLevelFunctioncharts = new Set();
        const renderer = new Renderer(theme);
        this.renderer = renderer;
        // Embed the palette items in a Functionchart so the renderer can do layout and drawing.
        const context = new FunctionchartContext(renderer), functionchart = context.newFunctionchart('functionchart'), input = context.newPseudoelement('input'), output = context.newPseudoelement('output'), use = context.newPseudoelement('use'), literal = context.newElement('element'), binop = context.newElement('element'), unop = context.newElement('element'), cond = context.newElement('element'), letFn = context.newElement('element'), thisFn = context.newElement('element'), external = context.newElement('element'), newFunctionchart = context.newFunctionchart('functionchart'), importer = context.newElement('importer'), exporter = context.newElement('exporter'), constructor = context.newElement('constructor');
        context.root = functionchart;
        input.x = 8;
        input.y = 8;
        output.x = 40;
        output.y = 8;
        use.x = 72;
        use.y = 8;
        literal.x = 8;
        literal.y = 32;
        literal.name = 'literal';
        literal.typeString = '[,v(0)]';
        binop.x = 56;
        binop.y = 32;
        binop.name = 'binop';
        binop.typeString = '[vv,v](+)'; // binary addition
        unop.x = 96;
        unop.y = 32;
        unop.name = 'unop';
        unop.typeString = '[v,v](-)'; // unary negation
        cond.x = 134;
        cond.y = 32;
        cond.name = 'cond';
        cond.typeString = '[vvv,v](?)'; // conditional
        letFn.x = 172;
        letFn.y = 32;
        letFn.name = 'let';
        letFn.typeString = '[v,v[v,v]](let)';
        thisFn.x = 224;
        thisFn.y = 32;
        thisFn.name = 'this';
        thisFn.typeString = '[vv,v[v,v]](this)';
        external.x = 278;
        external.y = 32;
        external.name = 'external';
        external.typeString = '[,](lib)';
        newFunctionchart.x = 8;
        newFunctionchart.y = 90;
        newFunctionchart.width = this.theme.minFunctionchartWidth;
        newFunctionchart.height = this.theme.minFunctionchartHeight;
        importer.x = 80;
        importer.y = 96;
        importer.typeString = '[,[,]]';
        exporter.x = 104;
        exporter.y = 96;
        exporter.typeString = '[,[,]]';
        constructor.x = 136;
        constructor.y = 96;
        constructor.typeString = '[,[,]]';
        functionchart.nodes.append(input);
        functionchart.nodes.append(output);
        functionchart.nodes.append(use);
        functionchart.nodes.append(literal);
        functionchart.nodes.append(binop);
        functionchart.nodes.append(unop);
        functionchart.nodes.append(cond);
        functionchart.nodes.append(letFn);
        functionchart.nodes.append(thisFn);
        functionchart.nodes.append(external);
        functionchart.nodes.append(newFunctionchart);
        functionchart.nodes.append(importer);
        functionchart.nodes.append(exporter);
        functionchart.nodes.append(constructor);
        context.root = functionchart;
        this.palette = functionchart;
        // Default Functionchart.
        this.context = new FunctionchartContext(renderer);
        this.initializeContext(this.context);
        this.functionchart = this.context.root;
        // Register property grid layouts.
        function getter(info, item) {
            if (item)
                return info.prop.get(item);
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
        function boolSetter(info, item, value) {
            if (value === 'true')
                value = true;
            else if (value === 'false')
                value = false;
            setter(info, item, value);
        }
        function nodeLabelGetter(info, item) {
            let result;
            switch (item.template.typeName) {
                case 'input': // [,v(label)]
                    result = item.type.outputs[0].name;
                    break;
                case 'output': // [v(label),]
                    result = item.type.inputs[0].name;
                    break;
                case 'element': { // [vv,v](label), [v,v](label), [vvv,v](label)
                    const element = item;
                    if (element.name == 'literal') {
                        result = item.type.outputs[0].name;
                    }
                    else {
                        result = item.type.name;
                    }
                    break;
                }
                // case 'importer': {
                //   const modifier = item as Modifierlement;
                //   if (modifier.isImporter || modifier.isExporter) {
                //     result = item.type.outputs[0].name;
                //   } else if (modifier.isCast) {
                //     result = item.type.outputs[1].name;
                //   }
                //   break;
                // }
            }
            return result ? result : '';
        }
        function nodeLabelSetter(info, item, value) {
            let newType;
            switch (item.template.typeName) {
                case 'input':
                    newType = Type.fromInfo([], [new Pin(Type.valueType, value)]);
                    break;
                case 'output':
                    newType = Type.fromInfo([new Pin(Type.valueType, value)], []);
                    break;
                case 'element': {
                    const element = item, type = element.type;
                    if (element.name === 'literal') {
                        newType = Type.fromInfo([], [new Pin(type.outputs[0].type, value)]);
                    }
                    else {
                        newType = Type.fromInfo(type.inputs, type.outputs, value);
                    }
                    break;
                }
                // case 'importer':
                // case 'exporter': {
                //   const modifier = item as ModifierElement,
                //         type = modifier.type;
                //   if (modifier.isImporter) {
                //     newType = Type.fromInfo([], [new Pin(type.outputs[0].type, value)]);
                //   } else if (modifier.isCast) {
                //     newType = Type.fromInfo([], [new Pin(type.outputs[1].type, value)]);
                //   }
                //   break;
                // }
            }
            if (newType) {
                const newValue = newType.typeString;
                setter(info, item, newValue);
            }
        }
        this.propertyInfo.set('input', [
            {
                label: 'label',
                type: 'text',
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('output', [
            {
                label: 'label',
                type: 'text',
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
            '|', '&', '||', '&&'];
        this.propertyInfo.set('binop', [
            {
                label: 'operator',
                type: 'enum',
                values: binaryOps.join(','),
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
        ]);
        const unaryOps = ['!', '~', '-', '√']; // TODO remove sqrt operator in favor of Math.sqrt.
        this.propertyInfo.set('unop', [
            {
                label: 'operator',
                type: 'enum',
                values: unaryOps.join(','),
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
        ]);
        this.propertyInfo.set('literal', [
            {
                label: 'value',
                type: 'text',
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('let', [
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('external', [
            {
                label: 'type string',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: typeStringProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('abstract', [
            {
                label: 'name',
                type: 'text',
                getter: nodeLabelGetter,
                setter: nodeLabelSetter,
                prop: typeStringProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('importer', [
            // {
            //   label: 'name',
            //   type: 'text',
            //   getter: nodeLabelGetter,
            //   setter: nodeLabelSetter,
            //   prop: typeStringProp,
            // },
            {
                label: 'hideLinks',
                type: 'boolean',
                getter: getter,
                setter: setter,
                prop: hideLinksProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('exporter', [
            // {
            //   label: 'name',
            //   type: 'text',
            //   getter: nodeLabelGetter,
            //   setter: nodeLabelSetter,
            //   prop: typeStringProp,
            // },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('upCast', [
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.set('downCast', [
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
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
            {
                label: 'implicit',
                type: 'boolean',
                getter: getter,
                setter: setter,
                prop: implicitProp,
            },
            {
                label: 'hideLinks',
                type: 'boolean',
                getter: getter,
                setter: setter,
                prop: hideLinksProp,
            },
            {
                label: 'comment',
                type: 'text',
                getter: getter,
                setter: setter,
                prop: commentProp,
            },
        ]);
        this.propertyInfo.forEach((info, key) => {
            propertyGridController.register(key, info);
        });
    }
    initializeContext(context) {
        const self = this;
        // On attribute changes and item insertions, dynamically layout affected items.
        // This allows us to layout wires as their src or dst elements are dragged.
        context.addHandler('changed', change => self.onChanged(change));
        // On ending transactions and undo/redo, layout the changed top level functioncharts.
        function update() {
            self.updateBounds();
        }
        function advance() {
            self.setPropertyGrid();
        }
        context.addTransactionHandler('transactionEnding', advance);
        context.addTransactionHandler('didUndo', update);
        context.addTransactionHandler('didRedo', update);
    }
    setContext(context) {
        // Make sure any function instances don't get detached from their instancers.
        // TODO revisit this.
        const instancers = new Set();
        this.scrap.forEach(item => {
            context.visitAll(item, item => {
                if (item instanceof FunctionInstance) {
                    instancers.add(item.src); // prepend so they precede instances.
                }
            });
        });
        this.scrap.splice(0, 0, ...instancers);
        const functionchart = context.root, renderer = this.renderer;
        this.context = context;
        this.functionchart = functionchart;
        this.changedItems.clear();
        this.changedTopLevelFunctioncharts.clear();
        // Layout any items in the functionchart.
        renderer.begin(this.canvasController.getCtx());
        context.reverseVisitNodes(this.functionchart, item => renderer.layout(item));
        context.visitWires(this.functionchart, item => renderer.layout(item));
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
            this.palette.nodes.forEach(item => renderer.draw(item, RenderMode.Print));
            renderer.end();
        }
    }
    onChanged(change) {
        const functionchart = this.functionchart, context = this.context, changedItems = this.changedItems, changedTopLevelFunctioncharts = this.changedTopLevelFunctioncharts, item = change.item, prop = change.prop;
        // Track all top level functioncharts which contain changes. On ending a transaction,
        // update the layout of functioncharts.
        let ancestor = item, topLevel;
        do {
            topLevel = ancestor;
            ancestor = ancestor.parent;
        } while (ancestor && ancestor !== functionchart);
        if (ancestor === functionchart && topLevel instanceof Functionchart) {
            changedTopLevelFunctioncharts.add(topLevel);
        }
        function addItems(item) {
            if (item instanceof NodeBase) {
                // Layout the item's incoming and outgoing wires.
                context.forInWires(item, addItems);
                context.forOutWires(item, addItems);
            }
            else if (item instanceof Functionchart) {
                context.forOutWires(item, addItems);
            }
            changedItems.add(item);
        }
        switch (change.type) {
            case 'valueChanged': {
                // Visit item and sub-items to layout all affected wires.
                context.visitAll(item, addItems);
                break;
            }
            case 'elementInserted': {
                // Update item subtrees as they are inserted.
                context.reverseVisitAll(prop.get(item).get(change.index), addItems);
                break;
            }
        }
    }
    updateLayout() {
        const renderer = this.renderer, context = this.context, changedItems = this.changedItems;
        // This function is called during the draw, hitTest, and updateBounds_ methods,
        // so the renderer is started.
        // First layout elements, and then layout wires which depend on them.
        // size and location.
        function layout(item, visitor) {
            context.reverseVisitAll(item, visitor);
        }
        // Layout elements. Functioncharts are updated at the end of the transaction.
        changedItems.forEach(item => {
            layout(item, item => {
                if (item instanceof NodeBase)
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
        // Then update the bounds of functionchart contents, bottom up.
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
        const renderer = this.renderer, functionchart = this.functionchart, context = this.context, ctx = canvasController.getCtx(), size = canvasController.getSize();
        if (canvasController === this.canvasController) {
            // Draw a dashed border around the canvas.
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
            functionchart.nodes.forEach(item => {
                context.visitNodes(item, item => { renderer.draw(item, RenderMode.Normal); });
            });
            // Draw instance links.
            const linkColor = this.theme.dimColor;
            context.visitNodes(functionchart, node => {
                if (node instanceof FunctionInstance) {
                    const src = node.src;
                    if (!src.hideLinks)
                        renderer.drawFunctionInstanceLink(node, linkColor);
                }
            });
            // Draw wires elements.
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
                renderer.drawHoverInfo(hoverHitInfo, this.hoverPoint);
            }
            renderer.end();
        }
        else if (canvasController === this.paletteController) {
            // Palette drawing occurs during drag and drop. If the palette has the drag,
            // draw the canvas underneath so the new object will appear on the canvas.
            this.canvasController.draw();
            renderer.begin(ctx);
            canvasController.applyTransform();
            // Render white background, since palette canvas is floating over the main canvas.
            ctx.fillStyle = this.theme.bgColor;
            ctx.fillRect(0, 0, size.width, size.height);
            this.palette.nodes.forEach(item => { renderer.draw(item, RenderMode.Palette); });
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
        functionchart.nodes.forEach(item => items.push(item));
        const bounds = renderer.sumBounds(items);
        // If there is a last selected element, we also render its hover info.
        const last = context.selection.lastSelected;
        let hoverHitResult, p;
        if (last) {
            const hoverBounds = renderer.getBounds(last), offset = this.theme.spacing * 2; // offset from bottom right to avoid pins, hit instancer.
            p = { x: hoverBounds.x + hoverBounds.width - offset,
                y: hoverBounds.y + hoverBounds.height - offset };
            hoverHitResult = renderer.hitTest(last, p, 1, RenderMode.Print);
            if (hoverHitResult) {
                // The biggest hover info is when we render the full type.
                const hoverWidth = p.x + last.type.width - bounds.x, hoverHeight = p.y + last.type.height - bounds.y;
                bounds.width = Math.max(bounds.width, hoverWidth);
                bounds.height = Math.max(bounds.width, hoverHeight);
            }
        }
        // Adjust all edges 8 pixels out.
        const ctx = new window.C2S(bounds.width + 16, bounds.height + 16);
        ctx.translate(-bounds.x + 8, -bounds.y + 8);
        renderer.begin(ctx);
        canvasController.applyTransform();
        // Don't draw the root functionchart.
        functionchart.nodes.forEach(item => {
            context.visitNodes(item, item => { renderer.draw(item, renderMode); });
        });
        // Draw instance links.
        const linkColor = this.theme.dimColor;
        context.visitNodes(functionchart, node => {
            if (node instanceof FunctionInstance) {
                const src = node.src;
                if (!src.hideLinks)
                    renderer.drawFunctionInstanceLink(node, linkColor);
            }
        });
        // Draw wires elements.
        context.visitWires(functionchart, wire => {
            renderer.drawWire(wire, renderMode);
        });
        if (hoverHitResult && p)
            renderer.drawHoverInfo(hoverHitResult, p);
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
        // Hit test wires first.
        context.reverseVisitWires(functionchart, wire => {
            pushInfo(renderer.hitTestWire(wire, cp, tol, RenderMode.Normal));
        });
        // Skip the root functionchart, as hits there should go to the underlying canvas controller.
        functionchart.nodes.forEachReverse(item => {
            context.reverseVisitNodes(item, item => {
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
        this.palette.nodes.forEachReverse(item => {
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
        const context = this.context, item = context.selection.lastSelected;
        let type = undefined;
        if (item instanceof Element) {
            if (item instanceof ModifierElement) {
                type = item.template.typeName; // 'importer', 'exporter', ...
            }
            else {
                type = item.name; // 'binop', 'unop', 'cond', 'literal', 'let', 'const'
            }
        }
        else if (item) {
            type = item.template.typeName;
        }
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
            const cp0 = this.getCanvasPosition(canvasController, p0);
            if (pointerHitInfo.input >= 0) {
                const dst = dragItem;
                newWire = context.newWire(undefined, -1, dst, pointerHitInfo.input);
                newWire.pSrc = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
                drag = new WireDrag(newWire, 'connectWireSrc', 'Add new wire');
            }
            else if (pointerHitInfo.output >= 0) {
                const src = dragItem;
                newWire = context.newWire(src, pointerHitInfo.output, undefined, -1);
                newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
                drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
            }
        }
        else if (pointerHitInfo instanceof FunctionchartHitResult &&
            pointerHitInfo.output >= 0 &&
            !this.clickInPalette) {
            const cp0 = this.getCanvasPosition(canvasController, p0);
            const src = dragItem;
            newWire = context.newWire(src, pointerHitInfo.output, undefined, -1);
            newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
            drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
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
                    drag = new NonWireDrag(context.selectedNodes(), 'moveCopySelection', 'Move copy of selection');
                }
                else {
                    if (pointerHitInfo instanceof FunctionchartHitResult) {
                        if (pointerHitInfo.inner.border) {
                            drag = new NonWireDrag([pointerHitInfo.item], 'resizeFunctionchart', 'Resize functionchart');
                        }
                        else {
                            drag = new NonWireDrag(context.selectedNodes(), 'moveSelection', 'Move selection');
                        }
                    }
                    else {
                        drag = new NonWireDrag(context.selectedNodes(), 'moveSelection', 'Move selection');
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
            context.beginTransaction(drag.description);
            if (newWire) {
                context.addItem(newWire, this.functionchart); // makeConsistent will canonicalize the parent functionchart.
                selection.set(newWire);
            }
            else {
                if (drag.kind == 'copyPalette' || drag.kind == 'moveCopySelection') {
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
        const context = this.context, p0 = canvasController.getClickPointerPosition(), cp0 = this.getCanvasPosition(canvasController, p0), p = canvasController.getCurrentPointerPosition(), cp = this.getCanvasPosition(canvasController, p), dx = cp.x - cp0.x, dy = cp.y - cp0.y, pointerHitInfo = this.pointerHitInfo, hitList = this.hitTestCanvas(cp);
        let hitInfo;
        if (drag instanceof NonWireDrag) {
            switch (drag.kind) {
                case 'copyPalette':
                case 'moveCopySelection':
                case 'moveSelection': {
                    hitInfo = this.getFirstHit(hitList, isDropTarget);
                    context.selection.forEach(item => {
                        if (item instanceof Wire)
                            return;
                        const oldX = context.getOldValue(item, 'x') || 0, oldY = context.getOldValue(item, 'y') || 0;
                        item.x = oldX + dx;
                        item.y = oldY + dy;
                    });
                    break;
                }
                case 'resizeFunctionchart': {
                    const hitInfo = pointerHitInfo, item = drag.items[0], oldX = context.getOldValue(item, 'x') || 0, oldY = context.getOldValue(item, 'y') || 0, oldWidth = context.getOldValue(item, 'width') || 0, oldHeight = context.getOldValue(item, 'height') || 0;
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
                    hitInfo = this.getFirstHit(hitList, isElement);
                    const dst = wire.dst, src = hitInfo ? hitInfo.item : undefined;
                    if (src && dst && src !== dst && hitInfo.output >= 0) {
                        wire.src = src;
                        wire.srcPin = hitInfo.output;
                    }
                    else {
                        wire.src = undefined; // This notifies observers to update the layout.
                        wire.pSrc = { x: cp.x, y: cp.y, nx: 1, ny: 0 };
                    }
                    break;
                }
                case 'connectWireDst': {
                    hitInfo = this.getFirstHit(hitList, isElement);
                    const src = wire.src, dst = hitInfo ? hitInfo.item : undefined;
                    if (src && dst && src !== dst && hitInfo.input >= 0) {
                        wire.dst = dst;
                        wire.dstPin = hitInfo.input;
                    }
                    else {
                        wire.dst = undefined; // This notifies observers to update the layout.
                        wire.pDst = { x: cp.x, y: cp.y, nx: -1, ny: 0 };
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
        // Find element or functionchart beneath mouse.
        const hitList = this.hitTestCanvas(cp), hitInfo = this.getFirstHit(hitList, isDropTarget), lastSelected = selection.lastSelected;
        let parent = functionchart;
        if (hitInfo instanceof FunctionchartHitResult) {
            parent = hitInfo.item;
        }
        if (drag instanceof WireDrag) {
            const wire = drag.wire, src = wire.src, dst = wire.dst;
            // Auto-complete if wire has no src or destination. Inputs of all types and
            // outputs of value type auto-complete to input/output pseudoelements. Outputs
            // of function type auto-complete to an instance of the src pin function type.
            if (src === undefined) {
                const p = wire.pSrc, input = context.newInputForWire(wire, parent, p);
                context.select(input);
            }
            else if (dst === undefined) {
                const p = wire.pDst, pin = src.type.outputs[wire.srcPin];
                let output;
                if (src.isInstancer && pin.type !== Type.valueType) {
                    output = context.newInstanceForWire(wire, parent, p);
                    if (hitInfo instanceof ElementHitResult && hitInfo.input < 0) {
                        context.dropNodeOnElement(output, hitInfo.item);
                    }
                }
                else {
                    output = context.newOutputForWire(wire, parent, p);
                }
                context.select(output);
            }
            else {
                // The user's new wire takes precedence over any existing wire (fan-in <= 1).
                const current = dst.inWires[wire.dstPin];
                if (current) {
                    context.deleteItem(current);
                }
            }
            wire.pSrc = wire.pDst = undefined;
        }
        else if (drag instanceof NonWireDrag &&
            (drag.kind == 'copyPalette' || drag.kind === 'moveSelection' ||
                drag.kind === 'moveCopySelection')) {
            if (hitInfo instanceof ElementHitResult && lastSelected instanceof NodeBase /*&&  TODO
                lastSelected.type.canConnectTo(hitInfo.item.type)*/) {
                const target = hitInfo.item;
                if (!(lastSelected instanceof Functionchart)) {
                    context.dropNodeOnElement(lastSelected, target);
                }
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
        this.dragInfo = undefined;
        this.pointerHitInfo = undefined;
        this.draggableHitInfo = undefined;
        this.hotTrackInfo = undefined;
        this.canvasController.draw();
    }
    createContext(text) {
        const raw = JSON.parse(text), context = new FunctionchartContext(this.renderer);
        const functionchart = Deserialize(raw, context);
        context.root = functionchart;
        this.initializeContext(context);
        this.setContext(context);
        this.renderer.begin(this.canvasController.getCtx());
        this.updateBounds();
        this.canvasController.draw();
    }
    onKeyDown(e) {
        const self = this, context = this.context, functionchart = this.functionchart, keyCode = e.keyCode, // TODO fix me.
        cmdKey = e.ctrlKey || e.metaKey, shiftKey = e.shiftKey;
        if (keyCode === 8) { // 'delete'
            context.deleteSelection();
            return true;
        }
        if (cmdKey) {
            switch (keyCode) {
                case 65: { // 'a'
                    functionchart.nodes.forEach(node => {
                        context.selection.add(node);
                    });
                    self.canvasController.draw();
                    this.setPropertyGrid();
                    return true;
                }
                case 90: { // 'z'
                    if (shiftKey) {
                        if (context.getRedo()) {
                            context.redo();
                            self.canvasController.draw();
                        }
                    }
                    else {
                        if (context.getUndo()) {
                            context.undo();
                            self.canvasController.draw();
                        }
                    }
                    return true;
                }
                case 89: { // 'y'
                    return true; // TODO new command slot.
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
                    context.selection.set(context.selectedNodes());
                    context.extendSelectionToWires();
                    context.reduceSelection();
                    context.beginTransaction('group items into functionchart');
                    const bounds = this.renderer.sumBounds(context.selectedNodes()), contents = context.selectedAllTypes();
                    let parent = context.getContainingFunctionchart(contents);
                    expandRect(bounds, Functionchart.radius, Functionchart.radius);
                    context.group(contents, parent, bounds);
                    context.endTransaction();
                    return true;
                }
                case 69: { // 'e'
                    context.selectConnectedNodes((wire) => true, (wire) => true); // TODO more nuanced connecting.
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
                    context.beginTransaction('complete elements');
                    context.completeNode(context.selectedNodes());
                    renderer.end();
                    context.endTransaction();
                    return true;
                }
                case 75: { // 'k'
                    context.beginTransaction('export element');
                    context.modifyElements(context.selectedElements(), 'exporter');
                    context.endTransaction();
                    return true;
                }
                case 76: // 'l'
                    context.beginTransaction('import element');
                    context.modifyElements(context.selectedElements(), 'importer');
                    context.endTransaction();
                    return true;
                case 73: // 'i'
                    context.beginTransaction('abstract element');
                    context.abstractElements(context.selectedElements(), !shiftKey);
                    context.endTransaction();
                    return true;
                case 85: // 'u'
                    context.beginTransaction('cast element');
                    context.modifyElements(context.selectedElements(), shiftKey ? 'downCast' : 'upCast');
                    context.endTransaction();
                    return true;
                case 78: { // 'n'
                    // ctrl-n
                    const context = new FunctionchartContext(this.renderer);
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