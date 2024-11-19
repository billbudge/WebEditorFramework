import { SelectionSet, Multimap } from '../../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, inFlagPath, outFlagPath, measureNameValuePairs,
         CanvasController, CanvasLayer, PropertyGridController, PropertyInfo,
         FileController } from '../../src/diagrams.js'

import { Point, Rect, PointWithNormal, getExtents, projectPointToCircle,
         BezierCurve, evaluateBezier, CurveHitResult, expandRect } from '../../src/geometry.js'

import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, EventHandler,
         Change, ChangeEvents, CompoundOp, copyItems, Serialize, Deserialize,
         getLowestCommonAncestor, ancestorInSet, reduceToRoots,
         List, TransactionManager, TransactionEvent, HistoryManager, ScalarPropertyTypes,
         ArrayPropertyTypes } from '../../src/dataModels.js'
import { types } from '@babel/core';
import { isElementAccessChain } from 'typescript';

// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

//------------------------------------------------------------------------------

// TODO Check validity of function instances during drag-n-drop.

// Value and Function type descriptions.

export class Pin {
  readonly type: Type;
  readonly name?: string;
  get typeString() { return this.toString(); }
  y = 0;
  baseline = 0;

  constructor(type: Type, name?: string) {
    this.type = type;
    this.name = name;
  }

  copy() : Pin {
    if (this.type === Type.valueType)
      return new Pin(Type.valueType, this.name);
    return new Pin(this.type.copy(), this.name);
  }
  copyUnlabeled() : Pin {
    if (this.type === Type.valueType)
      return new Pin(Type.valueType);
    return new Pin(this.type.copyUnlabeled());
  }
  toString() : string {
    let s = this.type.toString();
    if (this.name)
      s += '(' + this.name + ')';
    return s;
  }
}

export class Type {
  static readonly emptyPins = [];
  static readonly valueTypeString = 'v';
  static readonly valueType = new Type(Type.emptyPins, Type.emptyPins);
  static readonly emptyTypeString = '[,]';
  static readonly emptyType = new Type(Type.emptyPins, Type.emptyPins);

  static readonly atomizedTypes = new Map<string, Type>([
    [Type.valueTypeString, Type.valueType],
    [Type.emptyTypeString, Type.emptyType],
  ]);

  readonly inputs: Pin[];
  readonly outputs: Pin[];
  readonly name?: string;
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  get needsLayout() {
    return this.height === 0;  // width may be 0 in the case of spacer type.
  }

  constructor(inputs: Pin[], outputs: Pin[], name?: string) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.name = name;
  }

  copy() : Type {
    return new Type(this.inputs.map(pin => pin.copy()),
                    this.outputs.map(pin => pin.copy()),
                    this.name);
  }
  copyUnlabeled() : Type {
    return new Type(this.inputs.map(pin => pin.copyUnlabeled()),
                    this.outputs.map(pin => pin.copyUnlabeled()));
  }
  toString() : string {
    if (this === Type.valueType)
      return Type.valueTypeString;
    let s = '[';
    this.inputs.forEach(input => s += input.toString());
    s += ',';
    this.outputs.forEach(output => s += output.toString());
    s += ']';
    if (this.name)
      s += '(' + this.name + ')';
    return s;
  }
  static fromString(typeString: string) : Type {
    const type = parseTypeString(typeString);
    return type.atomized();
  }
  toFlatType(): Type {
    let typeString = '[';
    this.inputs.forEach((pin: Pin) => {
      typeString += 'v';
      if (pin.name)
        typeString += '(' + pin.name + ')';
    });
    typeString += ',';
    this.outputs.forEach((pin: Pin) => {
      typeString += 'v';
      if (pin.name)
        typeString += '(' + pin.name + ')';
    });
    typeString += ']';
    if (this.name) {
      typeString += '(' + this.name + ')';
    }
    return Type.fromString(typeString);
  }
  toImportType() : Type {
    const inputs = this.inputs.slice();
    inputs.push(new Pin(this));
    const newType = new Type(inputs, this.outputs);
    return newType;
  }
  toExportType() : Type {
    const inputs: Array<Pin> = [],
          outputs = [new Pin(this)];
    return new Type(inputs, outputs);
  }
  atomized() : Type {
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
  private static canConnect(src: Type, dst: Type) : boolean {
    return true;
  }
  canConnectTo(dst: Type) : boolean {
    return Type.canConnect(this, dst);
  }
}

// export type TypeVisitor = (type: Type, parent: Type | undefined) => void;

// export function forEachType(type: Type, callback: TypeVisitor) {
//   callback(type, undefined);
//   if (type.inputs)
//     type.inputs.forEach(input => forEachType(input.type, callback));
//   if (type.outputs)
//     type.outputs.forEach(output => forEachType(output.type, callback));
// }

export function parseTypeString(s: string) : Type {
  let j = 0;
  // Close over j to avoid extra return values.
  function parseName() : string | undefined {
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
  function parsePin() : Pin {
    let i = j;
    // value type
    if (s[j] === Type.valueTypeString || s[j] === '*') {  // TODO remove when files converted
      j++;
      return new Pin(Type.valueType, parseName());
    }
    // function types
    let type = parseFunction(),
        typeString = s.substring(i, j);
    // Add the pin type, without label.
    type = type.atomized();
    return new Pin(type, parseName());
  }
  function parseFunction() : Type {
    let i = j;
    if (s[j] === Type.valueTypeString || s[j] === '*') {  // TODO remove when files converted
      return Type.valueType;
    } else if (s[j] === '[') {
      j++;
      let inputs = new Array<Pin>, outputs = new Array<Pin>;
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
    } else {
      throw new Error('Invalid type string: ' + s);
    }
  }

  let type = parseFunction();
  if (type) {
    const name = parseName();
    if (name) {
      // The top level function type includes the label, so duplicate
      // type and pins.
      const inputs = type.inputs.map(pin => new Pin(pin.type, pin.name)),
            outputs = type.outputs.map(pin => new Pin(pin.type, pin.name));
      type = new Type(inputs, outputs, name);
    }
    type = type.atomized();
  }
  return type;
}

//------------------------------------------------------------------------------

// Properties and templates for the raw data interface for cloning, serialization, etc.

const idProp = new IdProp('id'),
      xProp = new ScalarProp('x'),
      yProp = new ScalarProp('y'),
      nameProp = new ScalarProp('name'),
      typeStringProp = new ScalarProp('typeString'),
      widthProp = new ScalarProp('width'),
      heightProp = new ScalarProp('height'),
      srcProp = new ReferenceProp('src'),
      srcPinProp = new ScalarProp('srcPin'),
      dstProp = new ReferenceProp('dst'),
      dstPinProp = new ScalarProp('dstPin'),
      nonWiresProp = new ChildArrayProp('nonWires'),
      wiresProp = new ChildArrayProp('wires'),
      functionchartProp = new ReferenceProp('functionchart');

abstract class NonWireTemplate {
  readonly id = idProp;
  readonly x = xProp;
  readonly y = yProp;
}

export type ElementType = 'literal' | 'binop' | 'unop' | 'cond' | 'var' | 'import' | 'element';

class ElementTemplate extends NonWireTemplate {
  readonly typeName: ElementType;
  readonly name = nameProp;
  readonly typeString = typeStringProp;
  readonly properties: PropertyTypes[] = [this.id, this.x, this.y, this.name, this.typeString];
  constructor(typeName: ElementType) {
    super();
    this.typeName = typeName;
  }
}

export type PseudoelementType = 'input' | 'output' | 'use';

class PseudoelementTemplate extends NonWireTemplate {
  readonly typeName: PseudoelementType;
  readonly typeString = typeStringProp;
  readonly properties = [this.id, this.x, this.y, this.typeString];
  constructor(typeName: PseudoelementType) {
    super();
    this.typeName = typeName;
  }
}

class WireTemplate {
  readonly typeName = 'wire';
  readonly src = srcProp;
  readonly srcPin = srcPinProp;
  readonly dst = dstProp;
  readonly dstPin = dstPinProp;
  readonly properties = [this.src, this.srcPin, this.dst, this.dstPin];
}

export type FunctionchartType = 'functionchart' | 'export';

class FunctionchartTemplate extends NonWireTemplate {
  readonly typeName : FunctionchartType;
  readonly width = widthProp;
  readonly height = heightProp;
  readonly name = nameProp;
  readonly nonWires = nonWiresProp;
  readonly wires = wiresProp;
  readonly properties = [this.id, this.x, this.y, this.width, this.height, this.name,
                         this.nonWires, this.wires];
    constructor(typeName: FunctionchartType) {
      super();
      this.typeName = typeName;
  }
}

class FunctionInstanceTemplate extends NonWireTemplate {
  readonly typeName = 'instance';
  readonly functionchart = functionchartProp;
  readonly properties = [this.id, this.x, this.y, this.functionchart];
}

const literalTemplate = new ElementTemplate('literal'),
      binopTemplate = new ElementTemplate('binop'),
      unopTemplate = new ElementTemplate('unop'),
      condTemplate = new ElementTemplate('cond'),
      varTemplate = new ElementTemplate('var'),
      importTemplate = new ElementTemplate('import'),
      elementTemplate = new ElementTemplate('element'),
      inputTemplate = new PseudoelementTemplate('input'),
      outputTemplate = new PseudoelementTemplate('output'),
      wireTemplate = new WireTemplate(),
      functionchartTemplate = new FunctionchartTemplate('functionchart'),
      exportTemplate = new FunctionchartTemplate('export'),
      functionInstanceTemplate = new FunctionInstanceTemplate();

const defaultPoint = { x: 0, y: 0 },
      defaultPointWithNormal: PointWithNormal = { x: 0, y: 0, nx: 0 , ny: 0 },
      defaultBezierCurve: BezierCurve = [
          defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal];

// Type safe interfaces over the raw templated data.

// Base element class to implement type fields, and incoming/outgoing wire arrays.
abstract class NodeBase<T extends NonWireTemplate> {
  readonly template: T;
  readonly context: FunctionchartContext;
  readonly id: number;

  // Derived properties, managed by the FunctionchartContext.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  private _type: Type = Type.emptyType;
  get type() { return this._type; }
  set type(type: Type) {
    this._type = type.atomized();
    this._flatType = type.toFlatType().atomized();
  }
  // Flat type has the same arity as type, but all pins are value type.
  private _flatType: Type = Type.emptyType;
  get flatType() { return this._flatType; }
  inWires = new Array<Wire | undefined>();   // one input per pin (no fan in).
  outWires = new Array<Array<Wire>>();       // multiple outputs per pin (fan out).

  // Get the pin for the node type.
  getPin(index: number) : Pin {
    const type = this.type,
          firstOutput = type.inputs.length,
          pin = index < firstOutput ? type.inputs[index] :
                                      type.outputs[index - firstOutput];
    return pin;
  }

  constructor(template: T, context: FunctionchartContext, id: number) {
    this.template = template;
    this.context = context;
    this.id = id;
  }
}

export class Element extends NodeBase<ElementTemplate> implements DataContextObject, ReferencedObject {
  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get typeString() { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  constructor(template: ElementTemplate, context: FunctionchartContext, id: number) {
    super(template, context,  id);
  }
}

export class Pseudoelement extends NodeBase<PseudoelementTemplate> implements DataContextObject, ReferencedObject {
  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get typeString() : string { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  // Derived properties.
  // index: number = -1;

  constructor(context: FunctionchartContext, template: PseudoelementTemplate, id: number) {
    super(template, context, id);

    switch (this.template.typeName) {
      case 'input':
        this.typeString = '[,v]';
        break;
      case 'output':
        this.typeString = '[v,]';
        break;
      }
  }
}

export class Wire implements DataContextObject {
  readonly template = wireTemplate;
  readonly context: FunctionchartContext;

  get src() { return this.template.src.get(this) as NodeTypes | undefined; }
  set src(value: NodeTypes | undefined) { this.template.src.set(this, value); }
  get srcPin() { return this.template.srcPin.get(this); }
  set srcPin(value: number) { this.template.srcPin.set(this, value); }
  get dst() { return this.template.dst.get(this) as NodeTypes | undefined; }
  set dst(value: NodeTypes | undefined) { this.template.dst.set(this, value); }
  get dstPin() { return this.template.dstPin.get(this); }
  set dstPin(value: number) { this.template.dstPin.set(this, value); }

  // Derived properties.
  parent: Functionchart | undefined;
  pSrc: PointWithNormal | undefined;
  pDst: PointWithNormal | undefined;
  bezier: BezierCurve = defaultBezierCurve;

  get type() : Type {
    if (this.src) {
      return this.src.type.outputs[this.srcPin].type;
    }
    if (this.dst) {
      return this.dst.type.inputs[this.dstPin].type;
    }
    return Type.valueType;
  }

  constructor(context: FunctionchartContext) {
    this.context = context;
    this.srcPin = -1;
    this.dstPin = -1;
  }
}

export class Functionchart extends NodeBase<FunctionchartTemplate> implements DataContextObject {
  // Radius of rounded corners. This isn't themeable, as it's conceptually part of the notation.
  static radius: number = 8;

  readonly id: number;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value: number) { this.template.width.set(this, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value: number) { this.template.height.set(this, value); }
  get name() { return this.template.name.get(this) || 0; }
  set name(value: number) { this.template.name.set(this, value); }

  get nonWires() { return this.template.nonWires.get(this) as List<NodeTypes>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }

  // Derived properties.
  closed = true;
  instances = new Set<FunctionInstance>();  // TODO do we need this mapping to instances?

  constructor(context: FunctionchartContext, template: FunctionchartTemplate, id: number) {
    super(template, context, id);
  }
}

export class FunctionInstance extends NodeBase<FunctionInstanceTemplate> implements DataContextObject, ReferencedObject {
  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get functionchart() { return this.template.functionchart.get(this) as Functionchart; }
  set functionchart(value: Functionchart) { this.template.functionchart.set(this, value); }

  constructor(context: FunctionchartContext, id: number) {
    super(functionInstanceTemplate, context, id);
  }
}

export type TrueElement = Element | FunctionInstance;
export type AllElementTypes = TrueElement | Pseudoelement;
export type NodeTypes = AllElementTypes | Functionchart;
export type AllTypes = NodeTypes | Wire;

export type FunctionchartVisitor = (item: AllTypes) => void;
export type NodeVisitor = (node: NodeTypes) => void;
export type WireVisitor = (wire: Wire) => void;
export type WirePredicate = (wire: Wire) => boolean;

interface ILayoutEngine {
  // Get bounding box for elements, functioncharts, and wires.
  getBounds(items: AllTypes) : Rect;

  // Get wire attachment point for node input/output pins.
  inputPinToPoint(item: NodeTypes, index: number) : PointWithNormal;
  outputPinToPoint(item: NodeTypes, index: number) : PointWithNormal;
}

export type PinRefSet = Multimap<NodeTypes, number>;

export type PinInfo = {
  element: AllElementTypes,
  index: number,
  type: Type,
  connected: PinRefSet,
  fcIndex: number,
};

// Circuit visitor for type resolution. Index specifies input or output pin,
// depending on range. Returns true if the circuit should be traversed further.
export type PinVisitor = (node: NodeTypes, index: number) => void;

export interface GraphInfo {
  elements: Set<AllElementTypes>;
  functioncharts: Set<Functionchart>;
  wires: Set<Wire>;
  interiorWires: Set<Wire>;
  inWires: Set<Wire>;
  outWires: Set<Wire>;
}

export class FunctionchartContext extends EventBase<Change, ChangeEvents>
                                  implements DataContext {
  private readonly layoutEngine: ILayoutEngine;
  private highestId: number = 0;  // 0 stands for no id.
  private readonly referentMap = new Map<number, ReferencedObject>();

  private functionchart: Functionchart;  // The root functionchart.
  private readonly elements = new Set<AllElementTypes>;
  private readonly functioncharts = new Set<Functionchart>;
  private readonly wires = new Set<Wire>;

  // Graph traversal helper info. These are batch updated after transactions.
  private graphInfoNeedsUpdate = false;  // If true, we need to update sorted and wire lists.
  // Topologically sorted elements. If a cycle is present, the size is less than the elements set.
  private sorted = new Array<NodeTypes>();
  private invalidWires = new Array<Wire>();  // Wires that violate the fan-in constraint.

  private readonly transactionManager: TransactionManager;
  private readonly historyManager: HistoryManager;

  selection = new SelectionSet<AllTypes>();

  constructor(layoutEngine: ILayoutEngine = new Renderer()) {
    super();
    this.layoutEngine = layoutEngine;
    const self = this;
    this.transactionManager = new TransactionManager();
    this.addHandler('changed',
        this.transactionManager.onChanged.bind(this.transactionManager));

    function update() {
      self.makeConsistent();  // updates wire lists and sorts topologically.
    }
    this.transactionManager.addHandler('transactionEnding', update);
    this.transactionManager.addHandler('transactionCanceled', update);
    this.transactionManager.addHandler('didUndo', update);
    this.transactionManager.addHandler('didRedo', update);

    this.historyManager = new HistoryManager(this.transactionManager, this.selection);
    const root = new Functionchart(this, functionchartTemplate, this.highestId++);
    this.functionchart = root;
    this.insertFunctionchart(root, undefined);
  }

  get root() : Functionchart {
    return this.functionchart;
  }
  set root(root: Functionchart) {
    if (this.functionchart) {
      // This removes all elements, functioncharts, and wires.
      this.removeItem(this.functionchart);
    }
    this.functionchart = root;
    this.insertFunctionchart(root, undefined);
    this.makeConsistent();
  }

  newElement(typeName: ElementType) : Element {
    const nextId = ++this.highestId;
    let template: ElementTemplate,
        typeString: string;
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
        typeString = '[vvv,v](?)';
        break;
      case 'var':
        template = varTemplate;
        typeString = '[,v[v,v]](var)';
        break;
      case 'import':
        template = importTemplate;
        typeString = Type.emptyTypeString;
        break;
      case 'element':
        template = elementTemplate;
        typeString = Type.emptyTypeString;
        break;
      default: throw new Error('Unknown element type: ' + typeName);
    }

    const result = new Element(template, this, nextId);
    result.typeString = typeString;
    this.referentMap.set(nextId, result);
    return result;
  }
  newPseudoelement(typeName: PseudoelementType) : Pseudoelement {
    const nextId = ++this.highestId;
    let template: PseudoelementTemplate;
    switch (typeName) {
      case 'input': template = inputTemplate; break;
      case 'output': template = outputTemplate; break;
      default: throw new Error('Unknown pseudoelement type: ' + typeName);
    }
    const result: Pseudoelement = new Pseudoelement(this, template, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  newWire(src: NodeTypes | undefined, srcPin: number,
          dst: NodeTypes | undefined, dstPin: number) : Wire {
    const result = new Wire(this);
    result.src = src;
    result.srcPin = srcPin;
    result.dst = dst;
    result.dstPin = dstPin;
    return result;
  }
  newFunctionchart(typeName: FunctionchartType) : Functionchart {
    const nextId = ++this.highestId;
    let template: FunctionchartTemplate;
    switch (typeName) {
      case 'functionchart': template = functionchartTemplate; break;
      case 'export': template = exportTemplate; break;
      default: throw new Error('Unknown pseudoelement type: ' + typeName);
    }
    const result: Functionchart = new Functionchart(this, template, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  newFunctionInstance() : FunctionInstance {
    const nextId = ++this.highestId;
    const result = new FunctionInstance(this, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }

  contains(item: AllTypes) : boolean {
    if (item instanceof Functionchart)
      return this.functioncharts.has(item);
    if (item instanceof NodeBase)
      return this.elements.has(item);
    if (item instanceof Wire)
      return this.wires.has(item);
    return false;
  }

  visitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.nonWires.forEach(t => self.visitAll(t, visitor));
      item.wires.forEach(t => self.visitAll(t, visitor));
    }
  }
  reverseVisitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    if (item instanceof Functionchart) {
      item.wires.forEachReverse(t => self.reverseVisitAll(t, visitor));
      item.nonWires.forEachReverse(t => self.reverseVisitAll(t, visitor));
    }
    visitor(item);
  }
  visitNonWires(item: NodeTypes, visitor: NodeVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.nonWires.forEach(item => self.visitNonWires(item, visitor));
    }
  }
  reverseVisitNonWires(item: NodeTypes, visitor: NodeVisitor) : void {
    const self = this;
    if (item instanceof Functionchart) {
      item.nonWires.forEachReverse(item => self.reverseVisitNonWires(item, visitor));
    }
    visitor(item);
  }
  visitWires(functionchart: Functionchart, visitor: WireVisitor) : void {
    const self = this;
    functionchart.wires.forEach(t => visitor(t));
    functionchart.nonWires.forEach(t => {
      if (t instanceof Functionchart)
        self.visitWires(t, visitor)
    });
  }
  reverseVisitWires(functionchart: Functionchart, visitor: WireVisitor) : void {
    const self = this;
    functionchart.nonWires.forEachReverse(t => {
      if (t instanceof Functionchart)
        self.reverseVisitWires(t, visitor)
    });
    functionchart.wires.forEach(t => visitor(t));
  }

  getContainingFunctionchart(items: AllTypes[]) : Functionchart {
    let owner = getLowestCommonAncestor<AllTypes>(...items);
    if (!owner)
      return this.functionchart;  // |items| not in the functionchart yet.
    return owner as Functionchart;
  }

  forInWires(dst: NodeTypes, visitor: WireVisitor) {
    dst.inWires.forEach(wire => {
      if (wire)
        visitor(wire);
    });
  }

  forOutWires(src: NodeTypes, visitor: WireVisitor) {
    src.outWires.forEach(wires => {
      wires.forEach(wire => visitor(wire))
    });
  }

  // Gets the translation to move an item from its current parent to
  // newParent.
  getToParent(item: NodeTypes, newParent: Functionchart | undefined) {
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

  private setGlobalPosition(item: NodeTypes) {
    const x = item.x,
          y = item.y,
          parent = item.parent;

    if (parent) {
      // console.log(item.type, parent.type, parent.globalPosition);
      const global = parent.globalPosition;
      if (global) {
        item.globalPosition = { x: x + global.x, y: y + global.y };
      }
    } else {
      item.globalPosition = { x: x, y: y };
    }
  }

  getGraphInfo() : GraphInfo {
    return {
      elements: this.elements,
      functioncharts: this.functioncharts,
      wires: this.wires,
      interiorWires: this.wires,
      inWires: new Set(),
      outWires: new Set(),
    };
  }

  getSubgraphInfo(items: NodeTypes[]) : GraphInfo {
    const self = this,
          elements = new Set<AllElementTypes>(),
          functioncharts = new Set<Functionchart>(),
          wires = new Set<Wire>(),
          interiorWires = new Set<Wire>(),
          inWires = new Set<Wire>(),
          outWires = new Set<Wire>();
    // First collect Elements and Functioncharts.
    items.forEach(item => {
      this.visitNonWires(item, (item: NodeTypes) => {
        if (item instanceof Functionchart)
          functioncharts.add(item);
        else
          elements.add(item);
      });
    });
    // Now collect and classify wires that connect to them.
    items.forEach(item => {
      function addWire(wire: Wire) {
        // Stop if we've already processed this transtion (handle transitions from a element to itself.)
        if (wires.has(wire)) return;
        wires.add(wire);
        const src: NodeTypes = wire.src!,
              dst: NodeTypes = wire.dst!,
              srcInside = (src instanceof Functionchart) ? functioncharts.has(src) : elements.has(src),
              dstInside = (dst instanceof Functionchart) ? functioncharts.has(dst) : elements.has(dst);
        if (srcInside) {
          if (dstInside) {
            interiorWires.add(wire);
          } else {
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
      elements: elements,
      functioncharts: functioncharts,
      wires: wires,
      interiorWires: interiorWires,
      inWires: inWires,
      outWires: outWires,
    }
  }

  // TODO change this method to getConnectedNodes.
  getConnectedNodes(nodes: NodeTypes[], upstream: WirePredicate, downstream: WirePredicate) : Set<NodeTypes> {
    const result = new Set<NodeTypes>();
    nodes = nodes.slice(0);  // Copy input array
    while (nodes.length > 0) {
      const element = nodes.pop()!;
      result.add(element);

      this.forInWires(element, wire => {
        if (!upstream(wire)) return;
        const src = wire.src!;
        if (!result.has(src))
          nodes.push(src);
    });
      this.forOutWires(element, wire => {
        if (!downstream(wire)) return;
        const dst = wire.dst!;
        if (!result.has(dst))
          nodes.push(dst);
    });
    }
    return result;
  }

  beginTransaction(name: string) {
    this.transactionManager.beginTransaction(name);
  }
  endTransaction() {
    if (!this.isValidFunctionchart()) {
      // TODO some kind of error message.
      this.transactionManager.cancelTransaction();
    } else {
      this.transactionManager.endTransaction();
    }
  }
  cancelTransaction(name: string) {
    this.transactionManager.cancelTransaction();
  }
  getOldValue(item: any, property: string) : any {
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
  addTransactionHandler(name: TransactionEvent, handler: EventHandler<CompoundOp>) {
    this.transactionManager.addHandler(name, handler);
  }

  select(item: AllTypes) {
    this.selection.add(item);
  }

  selectedAllTypes() : AllTypes[] {
    return this.selection.contents();
  }

  selectedTrueElements() : TrueElement[] {
    const result = new Array<TrueElement>();
    this.selection.forEach(item => {
      if (item instanceof Element || item instanceof FunctionInstance)
        result.push(item);
    });
    return result;
  }

  selectedNodes() : NodeTypes[] {
    const result = new Array<NodeTypes>();
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

  disconnectNode(node: NodeTypes) {
    const self = this;
    node.inWires.forEach(wire => {
      if (wire)
        self.deleteItem(wire)
    });
    node.outWires.forEach(wires => {
      if (wires.length === 0) return;
      // Copy array since we're mutating it.
      wires.slice().forEach(wire => {
        if (wire)
          self.deleteItem(wire);
      });
    });
  }
  disconnectSelection() {
    const self = this;
    this.selectedNodes().forEach(node => self.disconnectNode(node));
  }

  extendSelectionToWires() {
    const self = this,
          graphInfo = this.getSubgraphInfo(this.selectedNodes());
    graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
  }

  selectConnectedNodes(upstream: WirePredicate, downstream: WirePredicate) {
    const selectedNodes = this.selectedNodes(),
          connectedNodes = this.getConnectedNodes(selectedNodes, upstream, downstream);
    this.selection.set(Array.from(connectedNodes));
  }

  addItem(item: AllTypes, parent: Functionchart) : AllTypes {
    const oldParent = item.parent;

    if (!parent)
      parent = this.functionchart;
    if (!(item instanceof Wire)) {
      const translation = this.getToParent(item, parent),
            x = Math.max(0, item.x + translation.x),
            y = Math.max(0, item.y + translation.y);
      if (item.x != x)
        item.x = x;
      if (item.y != y)
        item.y = y;
    }

    if (oldParent === parent)
      return item;

    // At this point we can add item to parent.
    if (oldParent)
      this.unparent(item);

    if (item instanceof Wire) {
      parent.wires.append(item);
    } else {
      parent.nonWires.append(item);
    }
    return item;
  }

  addItems(items: AllTypes[], parent: Functionchart) {
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

  private unparent(item: AllTypes) {
    const parent = item.parent;
    if (parent instanceof Functionchart) {
      if (item instanceof Wire) {
        parent.wires.remove(item);
      } else {
        parent.nonWires.remove(item);
      }
    }
  }

  private deleteItem(item: AllTypes) {
    this.unparent(item);
    this.selection.delete(item);
  }

  private deleteItems(items: AllTypes[]) {
    const self = this;
    items.forEach(item => self.deleteItem(item));
  }

  copy() : AllTypes[] {
    const Functionchart = this.functionchart,
          selection = this.selection;

    selection.set(this.selectedNodes());
    this.extendSelectionToWires();
    this.reduceSelection();

    const selected = selection.contents(),
          map = new Map<number, Element>(),
          copies = copyItems(selected, this, map);

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
    return copies as AllTypes[];
  }

  paste(items: AllTypes[]) : AllTypes[] {
    this.transactionManager.beginTransaction('paste');
    items.forEach(item => {
      // Offset paste so copies don't overlap with the originals.
      if (!(item instanceof Wire)) {
        item.x += 16;
        item.y += 16;
      }
    });
    const copies = copyItems(items, this) as AllTypes[];
    this.addItems(copies, this.functionchart);
    this.selection.set(copies);
    this.endTransaction();
    return copies;
  }

  private deleteSelectionHelper() {
    this.reduceSelection();
    this.disconnectSelection();
    this.deleteItems(this.selection.contents());
  }

  cut() : AllTypes[] {
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

  newInputForWire(wire: Wire, p: Point) {
    const parent = wire.parent as Functionchart,
          input = this.newPseudoelement('input'),
          offset = this.layoutEngine.outputPinToPoint(input, 0);
    input.x = p.x - offset.x;
    input.y = p.y - offset.y;
    wire.src = input;
    wire.srcPin = 0;
    this.addItem(input, parent);
    return input;
  }

  connectInput(node: NodeTypes, pin: number) {
    const parent = node.parent as Functionchart,
          p = this.layoutEngine.inputPinToPoint(node, pin),
          wire = this.newWire(undefined, 0, node, pin);
    p.x -= 32;
    const input = this.newInputForWire(wire, p);
    this.addItem(wire, parent);
    return { input, wire };
  }

  newOutputForWire(wire: Wire, p: Point) {
    const parent = wire.parent as Functionchart,
          output = this.newPseudoelement('output'),
          offset = this.layoutEngine.inputPinToPoint(output, 0);
    output.x = p.x - offset.x;
    output.y = p.y - offset.y;
    wire.dst = output;
    wire.dstPin = 0;
    this.addItem(output, parent);
    return output;
  }

  newImportForWire(wire: Wire, p: Point) {
    const parent = wire.parent as Functionchart,
          element = this.newElement('import'),
          type = wire.src!.type.outputs[wire.srcPin].type,
          newType = type.toImportType();
    element.typeString = newType.toString();
    const lastInput = newType.inputs.length - 1,
          offset = this.layoutEngine.inputPinToPoint(element, lastInput);
    element.x = p.x - offset.x;
    element.y = p.y - offset.y;
    wire.dst = element;
    wire.dstPin = lastInput;
    this.addItem(element, parent);
    return element;
  }

  connectOutput(node: NodeTypes, pin: number) {
    const parent = node.parent as Functionchart,
          p = this.layoutEngine.outputPinToPoint(node, pin),
          wire = this.newWire(node, pin, undefined, 0);
    p.x += 32;
    const output = this.newOutputForWire(wire, p);
    this.addItem(wire, parent);
    return { output, wire };
  }

  completeNode(nodes: NodeTypes[]) {
    const self = this,
          selection = this.selection;
    // Add input/output pseudoelements for disconnected pins on elements.
    nodes.forEach(element => {
      const inputs = element.inWires,
            outputs = element.outWires;
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

  isValidWire(wire: Wire) {
    if (wire.pSrc || wire.pDst)
      return true;  // Return valid for wires that are being dragged.
    const src = wire.src,
          dst = wire.dst;
    if (!src || !dst)
      return false;
    if (src === dst)
      return false;
    // Wires must be within the functionchart or from a source in an enclosing functionchart.
    const lca = getLowestCommonAncestor<AllTypes>(src, dst);
    if (!lca || lca !== src.parent)
      return false;
    const srcPin = wire.srcPin,
          dstPin = wire.dstPin;
    if (srcPin < 0 || srcPin >= src.type.outputs.length)
      return false;
    if (dstPin < 0 || dstPin >= dst.type.inputs.length)
      return false;
    const srcType = src.type.outputs[srcPin].type,
          dstType = dst.type.inputs[dstPin].type;
    return srcType.canConnectTo(dstType);
  }

  canAddItem(item: AllTypes, parent: Functionchart) : boolean {
    if (item instanceof FunctionInstance) {
      const definition = item.functionchart;
      // Closed functioncharts can be instantiated anywhere.
      if (definition.closed)
        return true;
      const definitionScope = definition.parent;
      // Top level functionchart, we can't currently instantiate it but it should be possible. TODO
      if (!definitionScope)
        return true;
      // An open functionchart can only be instantiated in its defining functionchart or the next outer scope.
      const scope = getLowestCommonAncestor<AllTypes>(item, definition);
      return scope === definition ||  // recursive
              scope === definitionScope;  // within scope of definition.
      }
    return true;
  }
  isValidFunctionInstance(instance: FunctionInstance) : boolean {
    const parent = instance.parent;
    if (!parent)
      return false;
    return this.canAddItem(instance, parent);
  }

  // Update wire lists. Returns true iff wires don't fan-in to any input pins.
  private updateWireLists() : Array<Wire> {
    const invalidWires = new Array<Wire>(),
          graphInfo = this.getGraphInfo();
    // Initialize the element inWires and outWires arrays.
    graphInfo.elements.forEach(element => {
      const type = element.type;
      element.inWires = new Array<Wire>(type.inputs.length);
      element.outWires = new Array<Array<Wire>>(type.outputs.length);
      for (let i = 0; i < type.outputs.length; i++)
        element.outWires[i] = new Array<Wire>();
    });
    graphInfo.functioncharts.forEach(functionchart => {
      functionchart.outWires = new Array<Array<Wire>>(new Array<Wire>());
    });
    // Push wires onto the corresponding wire arrays on the elements.
    graphInfo.wires.forEach(wire => {
      const src = wire.src, dst = wire.dst,
            srcPin = wire.srcPin, dstPin = wire.dstPin;
      if (!src || !dst) {
        invalidWires.push(wire);
        return;
      }
      src.outWires[srcPin].push(wire);

      if (dst.inWires[dstPin] !== undefined) {
        invalidWires.push(wire);
        return;
      }
      dst.inWires[dstPin] = wire;
    });
    return invalidWires;
  }

  // Topological sort of elements for update and validation. The circuit should form a DAG.
  // All wires should be valid.
  private topologicalSort() : NodeTypes[] {
    const visiting = new Set<NodeTypes>(),
          visited = new Set<NodeTypes>(),
          sorted = new Array<NodeTypes>();

    let cycle = false;
    function visit(element: NodeTypes) {
      if (visited.has(element))
        return;
      if (visiting.has(element)) {
        cycle = true;
        return;
      }
      visiting.add(element);
      element.outWires.forEach(wires => {
        wires.forEach(wire => {
          visit(wire.dst!);
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
  updateGraphInfo() {
    if (this.graphInfoNeedsUpdate) {
      // Clear the update flag to avoid re-entering. This shouldn't happen as long as no mutating methods
      // are called while we're here.
      this.graphInfoNeedsUpdate = false;
      this.invalidWires = this.updateWireLists();
      this.sorted = this.topologicalSort();
    }
  }
  isValidFunctionchart() {
    this.updateGraphInfo();

    if (this.invalidWires.length !== 0 || this.sorted.length !== this.elements.size)
      return false;

    const self = this,
          invalidWires = new Array<Wire>(),
          invalidInstances = new Array<FunctionInstance>(),
          graphInfo = this.getGraphInfo();
    // Check wires.
    graphInfo.wires.forEach(wire => {
      if (!self.isValidWire(wire)) {  // TODO incorporate in update graph info?
        // console.log(wire, self.isValidWire(wire));
        invalidWires.push(wire);
      }
    });
    if (invalidWires.length !== 0)
      return false;

    // Check function instances.
    graphInfo.elements.forEach(element => {
      if (element instanceof FunctionInstance) {
        if (!self.isValidFunctionInstance(element))
            invalidInstances.push(element);
      }
    });

    return invalidInstances.length === 0;
  }

  // TODO do we still need this?
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
    this.updateGraphInfo();

    const self = this;

    // Update functioncharts, and functioninstances.
    this.reverseVisitNonWires(this.functionchart, item => {
      if (item instanceof Functionchart) {
        const typeInfo = self.getFunctionchartTypeInfo(item);
        item.closed = typeInfo.closed;
        if (typeInfo.typeString !== item.type.toString()) {
          this.updateItem(item);
        }
      } else if (item instanceof FunctionInstance) {
        if (!self.functioncharts.has(item.functionchart)) {
          self.deleteItem(item);
        }
      }
    });
    this.visitNonWires(this.functionchart, item => {
      if (item instanceof FunctionInstance) {
        const functionchart = item.functionchart!;
        if (item.type !== functionchart.type) {  // TODO we should replaceElement here.
          item.type = functionchart.type;
        }
      }
    });

    // Make sure wires between elements are contained by the lowest common parent functionchart.
    Array.from(this.wires.values()).forEach(wire => {   // Make a copy as we may mutate the set of wires.
      const src = wire.src!,
            dst = wire.dst!,
            srcParent = src.parent!,
            dstParent = dst.parent!,
            lca = getLowestCommonAncestor<AllTypes>(srcParent, dstParent) as Functionchart;
      if (wire.parent !== lca) {
        self.addItem(wire, lca);
      }
    });
  }

  replaceElement(element: AllElementTypes, newElement: AllElementTypes) {
    const type = element.type,
          parent = element.parent,
          newType = newElement.type;
    // Add newElement right after element. Both should be present as we
    // rewire them.
    if (newElement.parent !== parent) {
      this.deleteItem(newElement);
    }
    if (parent && parent instanceof Functionchart) {
      this.addItem(newElement, parent);
    }
    newElement.x = element.x;
    newElement.y = element.y;

    // Update all incoming and outgoing wires if possible; otherwise they
    // are deleted.
    const srcChange = new Array<Wire>(),
          dstChange = new Array<Wire>();
    element.inWires.forEach(wire => {
      if (!wire) return;
      const src = wire.src!, srcPin = wire.srcPin, dstPin = wire.dstPin;
      if (dstPin < newType.inputs.length &&
          src.type.outputs[srcPin].type.canConnectTo(newElement.type.inputs[dstPin].type)) {
        dstChange.push(wire);
      } else {
        this.deleteItem(wire);
      }
    });
    element.outWires.forEach(wires => {
      if (wires.length === 0) return;
      // Copy array since we're mutating.
      wires.slice().forEach(wire => {
        if (!wire) return;
        const dst = wire.dst!, srcPin = wire.srcPin, dstPin = wire.dstPin;
        if (srcPin < newType.outputs.length &&
          newElement.type.outputs[srcPin].type.canConnectTo(dst.type.inputs[dstPin].type)) {
          srcChange.push(wire);
        } else {
          this.deleteItem(wire);
        }
      });
    });
    srcChange.forEach(wire => {
      wire.src = newElement;
    });
    dstChange.forEach(function(wire) {
      wire.dst = newElement;
    });

    this.deleteItem(element);
  }

  // exportElement(element: TrueElement) : Functionchart {
  //   // const result = this.newDerivedElement('export'),
  //   //       newType = new Type([], [new Pin(element.type.copyUnlabeled())]);
  //   // result.typeString = newType.toString();
  //   // return result;
  // }

  importElement(type: Type) : Element {
    const result = this.newElement('import'),
          importType = type.copyUnlabeled().toImportType();
    result.typeString = importType.toString();
    return result;
  }

  exportElements(elements: TrueElement[]) {
    // const self = this,
    //       selection = this.selection;

    // // Open each non-input/output element.
    // elements.forEach(element => {
    //   selection.delete(element);
    //   const newElement = self.exportElement(element);
    //   self.replaceElement(element, newElement);
    //   newElement.inner = element;  // newElement owns the base element.
    //   selection.add(newElement);
    // });
  }

  importElements(elements: TrueElement[]) {
    const self = this,
          selection = this.selection;

    // Open each non-input/output element.
    elements.forEach(element => {
      selection.delete(element);
      const newElement = self.importElement(element.type);
      self.replaceElement(element, newElement);
      selection.add(newElement);
    });
  }

  group(items: AllTypes[], grandparent: Functionchart, bounds: Rect) {
    const self = this,
          selection = this.selection,
          parent = this.newFunctionchart('functionchart');
    parent.x = bounds.x;
    parent.y = bounds.y;
    // parent.width = bounds.width;
    // parent.height = bounds.height;
    this.addItem(parent, grandparent);

    items.forEach(item => {
      self.addItem(item, parent);
      selection.add(item);
    });
  }

  // Visit the given pin, then follow wires from the parent element.
  visitPin(node: NodeTypes, index: number, visitor: PinVisitor, visited: PinRefSet) {
    if (visited.has(node, index))
      return;
    visited.add(node, index);
    visitor(node, index);

    const type = node.type,
          firstOutput = type.inputs.length;
    if (index < firstOutput) {
      const wire = node.inWires[index];
      if (wire) {
        const src = wire.src! as AllElementTypes,  // We can only reach elements from elements.
              srcPin = wire.srcPin,
              index = src.type.inputs.length + srcPin;
        this.visitPin(src, index, visitor, visited);
      }
    } else {
      const wires = node.outWires[index - firstOutput];
      if (wires) {  // |wires| may be undefined if the instance doesn't has its type yet.
        for (let i = 0; i < wires.length; i++) {
          const wire = wires[i];
          if (wire) {
            const dst = wire.dst!,
                  dstPin = wire.dstPin;
            this.visitPin(dst, dstPin, visitor, visited);
          }
        }
      }
    }
  }

  // Visits the pin, all pins wired to it, and returns the type of the first non-value
  // pin it finds.
  inferPinType(element: AllElementTypes, index: number,
                 visited = new Multimap<AllElementTypes, number>()) : Type {
    let type: Type = Type.valueType;
    function visit(element: AllElementTypes, index: number) : boolean {
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

  getFunctionchartTypeInfo(functionchart: Functionchart) {
    const self = this,
          inputs = new Array<PinInfo>(),
          outputs = new Array<PinInfo>(),
          name = functionchart.name;

    // Collect subgraph info.
    const subgraphInfo = self.getSubgraphInfo(functionchart.nonWires.asArray()),
          unwired = subgraphInfo.wires.size === 0,
          closed = subgraphInfo.inWires.size == 0;
    let abstract = unwired && closed;

    // Collect the functionchart's inputs and outputs.
    subgraphInfo.elements.forEach(item => {
      if (item.parent !== functionchart)  // TODO remove this.
        return;
      if (item instanceof Pseudoelement) {
        if (item.template.typeName === 'input') {
          const connected = new Multimap<AllElementTypes, number>();
          const type = self.inferPinType(item, 0, connected);
          const pinInfo = { element: item, index: 0, type, connected, fcIndex: -1 };
          inputs.push(pinInfo);
        } else if(item.template.typeName === 'output') {
          const connected = new Multimap<AllElementTypes, number>();
          const type = self.inferPinType(item, 0, connected);
          const pinInfo = { element: item, index: 0, type, connected, fcIndex: -1 };
          outputs.push(pinInfo);
        }
      } else {  // instanceof ElementTypes
        abstract = false;
      }
    });
    // For 'export' functioncharts, unwired inputs and outputs.
    if (functionchart.template === exportTemplate) {
      // Add all disconnected inputs and outputs as pins.
      subgraphInfo.elements.forEach(element => {
        if (element instanceof FunctionInstance && element.functionchart === functionchart)
          return;  // We don't expose a recursive instance of the functionchart.
        const firstOutput = element.inWires.length;
        for (let i = 0; i < firstOutput; i++) {
          const wire = element.inWires[i];
          if (wire) continue;
          const connected = new Multimap<AllElementTypes, number>();
          const pin = element.type.inputs[i],
                type = pin.type;
          const pinInfo = { element, index: i, type, connected, fcIndex: -1 };
          inputs.push(pinInfo);
        }
        for (let i = 0; i < element.outWires.length; i++) {
          const wires = element.outWires[i];
          if (wires.length !== 0) continue;
          const connected = new Multimap<AllElementTypes, number>();
          const pin = element.type.outputs[i],
                type = pin.type;
          const pinInfo = { element, index: i + firstOutput, type, connected, fcIndex: -1 };
          outputs.push(pinInfo);
        }
      });
    }
    // Sort pins in increasing y-order. This lets users arrange the pins of the
    // new type in an intuitive way.
    function compareYs(p1: PinInfo, p2: PinInfo) {
      const element1 = p1.element,
            element2 = p2.element,
            pin1 = element1.getPin(p1.index),
            pin2 = element2.getPin(p2.index),
            y1 = element1.y + pin1.y,
            y2 = element2.y + pin2.y;
      return y1 - y2;
    }
    function compareIndices(p1: PinInfo, p2: PinInfo) {
      return p1.fcIndex - p2.fcIndex;
    }
    inputs.sort(compareYs);
    inputs.forEach((input, i) => { input.fcIndex = i; });
    const firstOutput = inputs.length;
    outputs.sort(compareYs);
    outputs.forEach((output, i) => { output.fcIndex = i + firstOutput; });

    function getPinInfo(element: AllElementTypes, index: number) : PinInfo | undefined {
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
    function getPinName(type: Type, pin: Pin) : string {
      let typeString = type.toString();
      if (pin.name)
        typeString += '(' + pin.name + ')';
      return typeString;
    }

    let typeString = '[';
    inputs.forEach(input => {
      typeString += getPinName(input.type, input.element.getPin(input.index));
    });
    typeString += ',';
    outputs.forEach(output => {
      typeString += getPinName(output.type, output.element.getPin(output.index));
    });
    typeString += ']';
    if (name)
      typeString += '(' + name + ')';

    return { typeString, closed, abstract };
  }

  // Update the derived 'type' property. Delete any wires that are no longer compatible with
  // the type.
  updateType(element: AllElementTypes, type: Type) {
    element.type = type;

    // TODO robust type re-mapping.

    // for (let i = 0; i < inWires.length; i++) {
    //   const wire = inWires[i];
    //   if (wire) {
    //     if (i >= inputs || !this.isValidWire(wire)) {  // no pin at this index.
    //       this.deleteItem(wire);
    //     } else {
    //       const srcType = wire.src?.type.outputs[wire.srcPin].type;
    //       if (!srcType || !srcType.canConnectTo(type.inputs[i].type)) {  // incompatible types.
    //         this.deleteItem(wire);
    //       }
    //     }
    //   }
    // }
    // if (inputs > inWires.length) {
    //   // for (let i = inWires.length; i < inputs; i++) {
    //   //   inWires[i] = undefined;
    //   // }
    // }
    // inWires.length = inputs;
    // // outWires.length >= outputs.
    // for (let i = 0; i < outWires.length; i++) {
    //   const wires = outWires[i];
    //   if (wires.length === 0) continue;
    //   wires.slice().forEach(wire => {
    //     if (i >= outputs || !this.isValidWire(wire)) {  // no pin at this index.
    //       this.deleteItem(wire);
    //     } else {
    //       const dstType = wire.dst?.type.inputs[wire.dstPin].type;
    //       if (!dstType || !type.outputs[i].type.canConnectTo(dstType)) {  // incompatible types.
    //         this.deleteItem(wire);
    //       }
    //     }
    //   });
    // }
    // if (outputs > outWires.length) {
    //   for (let i = outWires.length; i < outputs; i++) {
    //     if (!outWires[i]) {
    //       outWires[i] = new Array<Wire>();
    //     }
    //   }
    // }
    // outWires.length = outputs;
  }

  private updateItem(item: AllTypes) {
    if (item instanceof Wire) {
      this.graphInfoNeedsUpdate = true;
      return;
    }

    const self = this;
    // Update 'type' property for functioncharts and their instances.
    if (item instanceof Functionchart) {
      const typeInfo = this.getFunctionchartTypeInfo(item),
            typeString = typeInfo.typeString;
      let type = parseTypeString(typeString);
      if (item.template === exportTemplate) {
        type = type.toExportType();
      }
      item.type = type;
      // Update all instances of the functionchart.
      if (item.template === functionchartTemplate) {
        item.instances.forEach(instance => {
          self.updateType(instance, type);
        });
      }
    } else if (item instanceof FunctionInstance) {
      const functionChart = item.functionchart;
      if (functionChart) {
        this.updateType(item, functionChart.type);
      }
    } else if (item.typeString) {
      this.updateType(item, parseTypeString(item.typeString));
    }

    // Update child items with our current position.
    this.visitNonWires(item, item => this.setGlobalPosition(item));
  }

  private insertElement(element: AllElementTypes, parent: Functionchart) {
    this.elements.add(element);
    element.parent = parent;
    this.updateItem(element);
    this.graphInfoNeedsUpdate = true;
    if (element instanceof FunctionInstance) {
      const functionChart = element.functionchart;
      functionChart.instances.add(element);
    }
  }

  private removeElement(element: AllElementTypes) {
    this.elements.delete(element);
    this.graphInfoNeedsUpdate = true;
    if (element instanceof FunctionInstance) {
      const functionChart = element.functionchart;
      functionChart.instances.delete(element);
    }
  }

  // Parent can be undefined in the case of the root functionchart.
  private insertFunctionchart(functionchart: Functionchart, parent: Functionchart | undefined) {
    this.functioncharts.add(functionchart);
    functionchart.parent = parent;

    const self = this;
    functionchart.nonWires.forEach(item => self.insertItem(item, functionchart));
    functionchart.wires.forEach(wire => self.insertWire(wire, functionchart));

    // Update function chart after all descendants have been added and updated. We need that
    // in order to compute the type info for the functionchart.
    this.updateItem(functionchart);
  }

  private removeFunctionchart(functionchart: Functionchart) {
    this.functioncharts.delete(functionchart);
    const self = this;
    functionchart.wires.forEach(wire => self.removeWire(wire));
    functionchart.nonWires.forEach(element => self.removeItem(element));
  }

  private insertWire(wire: Wire, parent: Functionchart) {
    this.wires.add(wire);
    wire.parent = parent;
    this.updateItem(wire);
    this.graphInfoNeedsUpdate = true;
  }

  private removeWire(wire: Wire) {
    this.wires.delete(wire);
    this.graphInfoNeedsUpdate = true;  // Removal might break a cycle, making an unsortable graph sortable.
  }

  private insertItem(item: AllTypes, parent: Functionchart) {
    if (item instanceof Wire) {
      if (parent && this.functioncharts.has(parent)) {
        this.insertWire(item, parent);
      }
    } else if (item instanceof Functionchart) {
      if (parent && this.functioncharts.has(parent)) {
        this.insertFunctionchart(item, parent);
      }
    } else {
      if (parent && this.functioncharts.has(parent)) {
        this.insertElement(item, parent);
      }
    }
  }

  private removeItem(item: AllTypes) {
    if (item instanceof Wire)
      this.removeWire(item);
    else if (item instanceof Functionchart)
      this.removeFunctionchart(item);
    else
      this.removeElement(item);
  }

  // DataContext interface implementation.
  valueChanged(owner: AllTypes, prop: ScalarPropertyTypes, oldValue: any) : void {
    if (owner instanceof Wire) {
      if (this.wires.has(owner)) {
        this.insertWire(owner, owner.parent!);
      }
    } else if (owner instanceof FunctionInstance) {
      if (this.elements.has(owner)) {
        if (prop === functionchartProp) {
          owner.type = owner.functionchart.type;
        }
      }
    } else if (owner instanceof Functionchart) {
      // TODO.
    } else if (owner instanceof NodeBase) {
      if (this.elements.has(owner)) {
        if (prop === typeStringProp) {
          const type = parseTypeString(owner.typeString);
          owner.type = type;
          this.updateType(owner, type);
        }
      }
    }
    this.onValueChanged(owner, prop, oldValue);
    this.updateItem(owner);  // Update any derived properties.
  }
  elementInserted(owner: Functionchart, prop: ArrayPropertyTypes, index: number) : void {
    const value: AllTypes = prop.get(owner).at(index) as AllTypes;
    this.insertItem(value, owner);
    this.onElementInserted(owner, prop, index);
  }
  elementRemoved(owner: Functionchart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes) : void {
    this.removeItem(oldValue);
    this.onElementRemoved(owner, prop, index, oldValue);
  }
  resolveReference(owner: AllTypes, prop: ReferenceProp) : ReferencedObject | undefined {
    // Look up element id.
    const id: number = prop.getId(owner);
    if  (!id)
      return undefined;
    return this.referentMap.get(id);
  }
  construct(typeName: string) : AllTypes {
    switch (typeName) {
      case 'literal':
      case 'binop':
      case 'unop':
      case 'cond':
      case 'import':
      case 'var':
      case 'element': return this.newElement(typeName);

      case 'input':
      case 'output': return this.newPseudoelement(typeName);

      case 'wire': return this.newWire(undefined, -1, undefined, -1);

      case 'functionchart':
      case 'export': return this.newFunctionchart(typeName);

      case 'instance': return this.newFunctionInstance();
    }
    throw new Error('Unknown type');
  }
  private onChanged(change: Change) : Change {
    // console.log(change);
    super.onEvent('changed', change);
    return change;
  }
  private onValueChanged(
      owner: AllTypes, prop: ScalarPropertyTypes, oldValue: any) :
      Change {
    const change: Change = {type: 'valueChanged', item: owner, prop, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    return this.onChanged(change);
  }
  private onElementInserted(
      owner: Functionchart, prop: ArrayPropertyTypes, index: number) :
      Change {
    const change: Change =
        { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(
      owner: Functionchart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes ) :
      Change {
    const change: Change =
        { type: 'elementRemoved', item: owner, prop: prop, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    return this.onChanged(change);
  }
}

//------------------------------------------------------------------------------

class FunctionchartTheme extends Theme {
  textIndent = 8;
  textLeading = 6;
  knobbyRadius = 4;
  padding = 8;
  spacing = 8;
  minTypeWidth = 8;
  minTypeHeight = 8;
  minFunctionchartWidth = 56;
  minFunctionchartHeight = 32;

  constructor(theme: Theme = new Theme()) {
    super();
    Object.assign(this, theme);

    // Layout the base types.
    const pinSize = 2 * this.knobbyRadius;
    Type.valueType.width = pinSize;
    Type.valueType.height = pinSize;
  }
}

class ElementHitResult {
  item: AllElementTypes;
  inner: RectHitResult;
  input: number = -1;
  output: number = -1;
  constructor(item: AllElementTypes, inner: RectHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

class WireHitResult {
  item: Wire;
  inner: CurveHitResult;
  constructor(item: Wire, inner: CurveHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

class FunctionchartHitResult {
  item: Functionchart;
  inner: RectHitResult;
  instancer: boolean;
  output: number;
  constructor(item: Functionchart, inner: RectHitResult, instancer: boolean, output: number) {
    this.item = item;
    this.inner = inner;
    this.instancer = instancer;
    this.output = output;
  }
}

type HitResultTypes = ElementHitResult | WireHitResult | FunctionchartHitResult;

enum RenderMode {
  Normal,
  Palette,
  Highlight,
  HotTrack,
  Print
}

class Renderer implements ILayoutEngine {
  private theme: FunctionchartTheme;
  private ctx: CanvasRenderingContext2D;

  constructor(theme: FunctionchartTheme = new FunctionchartTheme()) {
    this.theme = theme;
  }

  begin(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    ctx.save();
    ctx.font = this.theme.font;
  }
  end() {
    this.ctx.restore();
  }

  // Get bounding box for elements, functioncharts, and wires.
  getBounds(item: AllTypes) : Rect {
    let x, y, width, height;
    if (item instanceof Wire) {
      const extents = getExtents(item.bezier);
      x = extents.xmin;
      y = extents.ymin;
      width = extents.xmax - x;
      height = extents.ymax - y;
    } else {
      const global = item.globalPosition;
      x = global.x,
      y = global.y;
      if (item instanceof Functionchart) {
        width = item.width;
        height = item.height;
      } else {
        // Element, Pseudoelement, FunctionInstance.
        const type = item.flatType;
        width = type.width;
        height = type.height;
      }
    }
    return { x, y, width, height };
  }
  // Get wire attachment point for element input/output pins.
  inputPinToPoint(element: NodeTypes, index: number) : PointWithNormal {
    const rect = this.getBounds(element),
          type = element.flatType,
          pin = type.inputs[index];
    // Handle special case of 'import' element's last input.
    if (element.template === importTemplate) {
      const inputs = type.inputs,
            lastInput = inputs.length - 1;
      if (index === lastInput) {
        const mid = rect.x + rect.width / 2,
              bottom = rect.y + rect.height;
        return { x: mid, y: bottom, nx: 0, ny: 1 };
      }
    }
    return { x: rect.x, y: rect.y + pin.y + pin.type.height / 2, nx: -1, ny: 0 };
  }
  outputPinToPoint(element: NodeTypes, index: number) : PointWithNormal {
    const rect = this.getBounds(element),
          type = element.flatType,
          pin = type.outputs[index];
    // Handle special case of 'export' functionchart's output.
    if (element.template === exportTemplate) {
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2, nx: 1, ny: 0 };
    }
    return { x: rect.x + rect.width, y: rect.y + pin.y + pin.type.height / 2, nx: 1, ny: 0 }
  }
  pinToRect(pin: Pin, pinPt: PointWithNormal) : Rect {
    const width = pin.type.width,
          height = pin.type.height,
          x = pinPt.x - (pinPt.nx + 1) * width / 2,
          y = pinPt.y - (pinPt.ny + 1) * height / 2;
    return { x, y, width, height }
  }

  instancerBounds(functionchart: Functionchart) : Rect {
    const rect = this.getBounds(functionchart),
          right = rect.x + rect.width,
          bottom = rect.y + rect.height,
          type = functionchart.flatType,
          width = type.width,
          height = type.height;
    return { x: right - width - Functionchart.radius,
             y: bottom - height - Functionchart.radius,
             width, height };
  }

  sumBounds(items: AllTypes[]) : Rect {
    let xMin = Number.POSITIVE_INFINITY, yMin = Number.POSITIVE_INFINITY,
        xMax = -Number.POSITIVE_INFINITY, yMax = -Number.POSITIVE_INFINITY;
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
  layoutType(type: Type) {
    const self = this,
          ctx = this.ctx,
          theme = this.theme,
          textSize = theme.fontSize,
          spacing = theme.spacing,
          name = type.name,
          inputs = type.inputs,
          outputs = type.outputs;
    let height = 0, width = 0;
    if (name) {
      width = spacing + ctx.measureText(name).width;
      height += textSize;
    }

    function layoutPins(pins: Pin[]) {
      let y = height, w = 0;
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i],
              name = pin.name;
        self.layoutPin(pin);
        pin.y = y + spacing / 2;
        let pw = pin.type.width, ph = pin.type.height + spacing / 2;
        if (name) {
          pin.baseline = y + spacing / 2 + textSize;
          if (textSize > ph) {
            pin.y += (textSize - ph) / 2;
            ph = textSize;
          } else {
            pin.baseline += (ph - textSize) / 2;
          }
          pw += 2 * spacing + ctx.measureText(name).width;
        }
        y += ph;
        w = Math.max(w, pw);
      }
      return [y, w];
    }
    let [yIn, wIn] = layoutPins(inputs);
    let [yOut, wOut] = layoutPins(outputs);

    if (wIn > 0) wIn += spacing;
    if (wOut > 0) wOut += spacing;

    type.width = Math.round(Math.max(width, wIn + wOut, theme.minTypeWidth));
    type.height = Math.round(Math.max(yIn, yOut, theme.minTypeHeight) + spacing / 2);
  }

  layoutPin(pin: Pin) {
    const type = pin.type;
    if (type.needsLayout)
      this.layoutType(type);
  }

  layoutElement(element: AllElementTypes) {
    const type = element.type;
    if (type.needsLayout) {
      this.layoutType(type);
      this.layoutType(element.flatType);
    }
  }

  layoutWire(wire: Wire) {
    let src = wire.src,
        dst = wire.dst,
        p1 = wire.pSrc,
        p2 = wire.pDst;
    // Since we intercept change events and not transactions, wires may be in
    // an inconsistent state, so check before creating the path.
    if (src && wire.srcPin >= 0) {
      p1 = this.outputPinToPoint(src, wire.srcPin);
    }
    if (dst && wire.dstPin >= 0) {
      p2 = this.inputPinToPoint(dst, wire.dstPin);
    }
    if (p1 && p2) {
      wire.bezier = getEdgeBezier(p1, p2, 24);
    }
  }

  // Make sure a functionchart is big enough to enclose its contents.
  layoutFunctionchart(functionchart: Functionchart) {
    const self = this,
          spacing = this.theme.spacing,
          type = functionchart.type,
          nonWires = functionchart.nonWires;
    if (type.needsLayout) {
      self.layoutType(type);
      self.layoutType(functionchart.flatType);
    }

    let width, height;
    if (nonWires.length === 0) {
      width = self.theme.minFunctionchartWidth;
      height = self.theme.minFunctionchartHeight;
    } else {
      const extents = self.sumBounds(nonWires.asArray()),
            global = functionchart.globalPosition,
            x = global.x,
            y = global.y,
            margin = 2 * spacing;
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
  private drawInputs(type: Type, x: number, y: number, limit: number) {
    const ctx = this.ctx,
          spacing = this.theme.spacing;
    for (let i = 0; i < limit; i++) {
      const pin = type.inputs[i],
            name = pin.name;
      this.drawPin(pin, x, y + pin.y);
      if (name) {
        ctx.textAlign = 'left';
        ctx.fillText(name, x + pin.type.width + spacing, y + pin.baseline);
      }
    }
  }
  private drawOutputs(type: Type, x: number, y: number, limit: number) {
    const ctx = this.ctx,
          spacing = this.theme.spacing,
          right = x + type.width;
    for (let i = 0; i < limit; i++) {
      const pin = type.outputs[i],
            pinLeft = right - pin.type.width,
            name = pin.name;
      this.drawPin(pin, pinLeft, y + pin.y);
      if (name) {
        ctx.textAlign = 'right';
        ctx.fillText(name, pinLeft - spacing, y + pin.baseline);
      }
          }
  }
  drawType(type: Type, x: number, y: number) {
    const ctx = this.ctx, theme = this.theme,
          textSize = theme.fontSize, spacing = theme.spacing,
          name = type.name,
          w = type.width;
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

  drawPin(pin: Pin, x: number, y: number) {
    const ctx = this.ctx,
          theme = this.theme;
    ctx.strokeStyle = theme.strokeColor;
    if (pin.type === Type.valueType) {
      const r = theme.knobbyRadius;
      ctx.beginPath();
      if (pin.type === Type.valueType) {
        const d = 2 * r;
        ctx.rect(x, y, d, d);
      } else {
        // TODO remove
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
      }
      ctx.stroke();
    } else if (pin.type) {
      const type = pin.type,
            width = type.width, height = type.height;

      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.stroke();
      this.drawType(type, x, y);
    }
  }

  drawElement(element: AllElementTypes, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          spacing = theme.spacing,
          r = theme.knobbyRadius,
          d = r * 2,
          rect = this.getBounds(element),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height;

    ctx.beginPath();
    ctx.rect(x, y, w, h);

    switch (mode) {
      case RenderMode.Normal:
      case RenderMode.Palette:
      case RenderMode.Print: {
        ctx.fillStyle = (mode === RenderMode.Palette) ? theme.altBgColor : theme.bgColor;
        ctx.fill();
        ctx.strokeStyle = theme.strokeColor;
        ctx.stroke();
        const type = element.flatType;
        if (element.template === importTemplate) {
          const name = type.name
          if (name) {
            ctx.fillStyle = theme.textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(name, x + w / 2, y + this.theme.fontSize + spacing / 2);
          }
          const lastInput = type.inputs.length - 1;
          this.drawInputs(type, x, y, lastInput);
          this.drawOutputs(type, x, y, type.outputs.length);
          const pin = type.inputs[lastInput];
          this.drawPin(pin, x + w / 2 - r, y + h - d);
        } else {
          this.drawType(element.flatType, x, y);
        }
        break;
      }
      case RenderMode.Highlight:
      case RenderMode.HotTrack:
        ctx.strokeStyle = (mode === RenderMode.Highlight) ? theme.highlightColor : theme.hotTrackColor;
        ctx.strokeStyle = theme.highlightColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
    }
  }

  drawPseudoElement(element: AllElementTypes, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.knobbyRadius,
          d = r * 2,
          rect = this.getBounds(element),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height;

    switch (mode) {
      case RenderMode.Normal:
      case RenderMode.Palette:
      case RenderMode.Print: {
        ctx.fillStyle = mode === RenderMode.Palette ? theme.altBgColor : theme.bgColor;
        ctx.strokeStyle = theme.strokeColor;
        switch (element.template.typeName) {
          case 'input': {
            inFlagPath(x, y, w, h, d, ctx);
            ctx.fill();
            ctx.lineWidth = 0.5;
            ctx.stroke();
            break;
          }
          case 'output': {
            outFlagPath(x, y, w, h, d, ctx);
            ctx.fill();
            ctx.lineWidth = 0.5;
            ctx.stroke();
            break;
          }
        }
        this.drawType(element.flatType, x, y);
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

  drawFunctionchart(functionchart: Functionchart, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = Functionchart.radius,
          rect = this.getBounds(functionchart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          textSize = theme.fontSize;
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
        if (functionchart.template === functionchartTemplate) {
          const type = functionchart.flatType,
          instancerRect = this.instancerBounds(functionchart);
          ctx.beginPath();
          ctx.rect(instancerRect.x, instancerRect.y, instancerRect.width, instancerRect.height);
          ctx.fillStyle = theme.altBgColor;
          ctx.fill();
          ctx.strokeStyle = theme.strokeColor;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          this.drawType(type, instancerRect.x, instancerRect.y);
        } else if (functionchart.template === exportTemplate) {
          const pin = new Pin(Type.valueType),
                r = this.theme.knobbyRadius;
          this.drawPin(pin, x + w - 2 * r, y + h / 2 - r);
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

  hitTestElement(element: AllElementTypes, p: Point, tol: number, mode: RenderMode) :
                 ElementHitResult | undefined {
    const rect = this.getBounds(element),
          x = rect.x, y = rect.y, width = rect.width, height = rect.height,
          hitInfo = hitTestRect(x, y, width, height, p, tol);
    if (hitInfo) {
      const self = this,
            spacing = this.theme.spacing,
            halfSpacing = spacing / 2,
            result = new ElementHitResult(element, hitInfo),
            type = element.flatType;
      for (let i = 0; i < type.inputs.length; i++) {
        const pinPt = self.inputPinToPoint(element, i),
              rect = self.pinToRect(type.inputs[i], pinPt);
        if (hitTestRect(rect.x, rect.y, rect.width, rect.height, p, 0)) {
          result.input = i;
        }
      }
      for (let i = 0; i < type.outputs.length; i++) {
        const pinPt = self.outputPinToPoint(element, i),
              rect = self.pinToRect(type.outputs[i], pinPt);
        if (hitTestRect(rect.x, rect.y, rect.width, rect.height, p, 0)) {
          result.output = i;
        }
      }
      return result;
    }
  }
  hitTestFunctionchart(
    functionchart: Functionchart, p: Point, tol: number, mode: RenderMode) : FunctionchartHitResult | undefined {
    const r = Functionchart.radius,
          rect = this.getBounds(functionchart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol);
    let instancer = false, output = -1;
    if (!inner)
      return;
    if (functionchart.template === functionchartTemplate) {
      const instancerRect = this.instancerBounds(functionchart);
      instancer = hitTestRect(
                instancerRect.x, instancerRect.y, instancerRect.width, instancerRect.height, p, tol) !== undefined;
    } else if (functionchart.template === exportTemplate) {
      const pinPt = this.outputPinToPoint(functionchart, 0),
            rect = this.pinToRect(functionchart.type.outputs[0], pinPt);
      if (hitTestRect(rect.x, rect.y, rect.width, rect.height, p, 0)) {
        output = 0;
      }
    }
    return new FunctionchartHitResult(functionchart, inner, instancer, output);
  }

  drawWire(wire: Wire, mode: RenderMode) {
    const theme = this.theme,
          ctx = this.ctx;
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
      const pin = wire.src!.type.outputs[wire.srcPin],
            pinPos = wire.pDst!,
            pinX = pinPos.x,
            pinY = pinPos.y - pin.type.height / 2;
      ctx.lineWidth = 0.5;
      this.drawPin(pin, pinX, pinY)
    } else if (wire.src === undefined) {
      const pin = wire.dst!.type.inputs[wire.dstPin],
            pinPos = wire.pSrc!,
            pinX = pinPos.x - pin.type.width,
            pinY = pinPos.y - pin.type.height / 2;
      ctx.lineWidth = 0.5;
      this.drawPin(pin, pinX, pinY)
    }
  }

  hitTestWire(wire: Wire, p: Point, tol: number, mode: RenderMode) : WireHitResult | undefined {
    // TODO don't hit test new wire as it's dragged.
    const hitInfo = hitTestBezier(wire.bezier, p, tol);
    if (hitInfo) {
      return new WireHitResult(wire, hitInfo);
    }
  }

  draw(item: AllTypes, mode: RenderMode) {
    if (item instanceof Functionchart) {
      this.drawFunctionchart(item, mode);
    } else if (item instanceof Pseudoelement) {
      this.drawPseudoElement(item, mode);
    } else if (item instanceof NodeBase) {
      this.drawElement(item, mode);
    } else if (item instanceof Wire) {
      this.drawWire(item, mode);
    }
  }

  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) : HitResultTypes | undefined {
    let hitInfo: HitResultTypes | undefined;
    if (item instanceof Functionchart) {
      hitInfo = this.hitTestFunctionchart(item, p, tol, mode);
    } else if (item instanceof NodeBase) {
      hitInfo = this.hitTestElement(item, p, tol, mode);
    } else if (item instanceof Wire) {
      hitInfo = this.hitTestWire(item, p, tol, mode);
    }
    return hitInfo;
  }

  layout(item: AllTypes) {
    if (item instanceof Functionchart) {
      this.layoutFunctionchart(item);
    }else if (item instanceof NodeBase) {
      this.layoutElement(item);
    } else if (item instanceof Wire) {
      this.layoutWire(item);
    }
  }

  drawHoverInfo(info: HitResultTypes, p: Point) {
    const theme = this.theme,
          ctx = this.ctx,
          x = p.x, y = p.y;
    let type = Type.emptyType;  // When no type is available.
    if (info instanceof ElementHitResult) {
      type = info.item.type;
      if (info.input >= 0) {
        type = type.inputs[info.input].type;
      } else if (info.output >= 0) {
        type = type.outputs[info.output].type;
      }
      if (type === Type.valueType) {
        // TODO draw primitive type 'number' or 'string' etc.
      }
    } else if (info instanceof WireHitResult) {
      type = info.item.type;  // Wire type is src or dst pin type.
    } else if (info instanceof FunctionchartHitResult) {
      if (info.instancer || info.output >= 0) {
        type = info.item.type;
      }
    }
    const w = type.width, h = type.height;
    ctx.beginPath();
    ctx.rect(x, y, w, h);

    ctx.fillStyle = theme.hoverColor;
    ctx.fill();
    ctx.strokeStyle = theme.strokeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    this.drawType(type, x, y);
  }
}

// --------------------------------------------------------------------------------------------

function isDropTarget(hitInfo: HitResultTypes) : boolean {
  const item = hitInfo.item,
        selection = item.context.selection;
  // We can't drop onto the selection which is being dragged.
  if (selection.has(item) || ancestorInSet(item, selection))
    return false;
  // We can drop anything onto a functionchart.
  if (hitInfo instanceof FunctionchartHitResult)
    return true;

  const lastSelected = selection.lastSelected;
  if (hitInfo instanceof ElementHitResult && lastSelected instanceof NodeBase) {
    // Drop onto an element requires type compatibility.
    return lastSelected.type.canConnectTo(hitInfo.item.type);
  }
  return false;
}

function isClickable(hitInfo: HitResultTypes) : boolean {
  return true;
}

function isDraggable(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof Wire);
}

function isElementInputPin(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof ElementHitResult && hitInfo.input >= 0;
}

function isElementOutputPin(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof ElementHitResult && hitInfo.output >= 0;
}

function hasProperties(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof Wire);
}

type NonWireDragType = 'copyPalette' | 'moveSelection' | 'moveCopySelection' |
                       'resizeFunctionchart' | 'instantiateFunctionchart';
class NonWireDrag {
  items: NodeTypes[];
  kind: NonWireDragType;
  description: string;
  constructor(items: NodeTypes[], type: NonWireDragType, description: string) {
    this.items = items;
    this.kind = type;
    this.description = description;
  }
}

type WireDragType = 'connectWireSrc' | 'connectWireDst';
class WireDrag {
  wire: Wire;
  kind: WireDragType;
  description: string;
  constructor(wire: Wire, type: WireDragType, description: string) {
    this.wire = wire;
    this.kind = type;
    this.description = description;
  }
}

type DragTypes = NonWireDrag | WireDrag;

interface ItemInfo extends PropertyInfo {
  prop: PropertyTypes;
}

export class FunctionchartEditor implements CanvasLayer {
  private theme: FunctionchartTheme;
  private canvasController: CanvasController;
  private paletteController: CanvasController;
  private propertyGridController: PropertyGridController;
  private fileController: FileController;
  private hitTolerance: number;
  private changedItems: Set<AllTypes>;
  private changedTopLevelFunctioncharts: Set<Functionchart>;
  private renderer: Renderer;
  private palette: Functionchart;  // Functionchart to simplify layout of palette items.
  private context: FunctionchartContext;
  private functionchart: Functionchart;
  private scrap: AllTypes[] = []

  private pointerHitInfo: HitResultTypes | undefined;
  private draggableHitInfo: HitResultTypes | undefined;
  private clickInPalette: boolean = false;
  private dragInfo: DragTypes | undefined;
  private hotTrackInfo: HitResultTypes | undefined;
  private hoverHitInfo: HitResultTypes | undefined;
  private hoverPoint: Point;
  private propertyInfo = new Map<string, ItemInfo[]>();

  constructor(baseTheme: Theme,
              canvasController: CanvasController,
              paletteController: CanvasController,
              propertyGridController: PropertyGridController) {
    const self = this,
          theme = new FunctionchartTheme(baseTheme);
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
    const context = new FunctionchartContext(renderer),
          functionchart = context.newFunctionchart('functionchart'),
          input = context.newPseudoelement('input'),
          output = context.newPseudoelement('output'),
          literal = context.newElement('literal'),
          binop = context.newElement('binop'),
          unop = context.newElement('unop'),
          cond = context.newElement('cond'),
          varBinding = context.newElement('var'),
          newFunctionchart = context.newFunctionchart('functionchart'),
          newExport = context.newFunctionchart('export');

    context.root = functionchart;

    input.x = 8;  input.y = 8;
    output.x = 40; output.y = 8;
    literal.x = 8; literal.y = 32;
    binop.x = 40; binop.y = 32;
    binop.typeString = '[vv,v](+)';  // binary addition
    unop.x = 80; unop.y = 32;
    unop.typeString = '[v,v](-)';    // unary negation
    cond.x = 118; cond.y = 32;     // conditional
    varBinding.x = 156; varBinding.y = 32;

    newFunctionchart.x = 8; newFunctionchart.y = 90;
    newFunctionchart.width = this.theme.minFunctionchartWidth;
    newFunctionchart.height = this.theme.minFunctionchartHeight;
    newExport.x = 72; newExport.y = 90;
    newExport.width = this.theme.minFunctionchartWidth;
    newExport.height = this.theme.minFunctionchartHeight;

    functionchart.nonWires.append(input);
    functionchart.nonWires.append(output);
    functionchart.nonWires.append(varBinding);
    functionchart.nonWires.append(literal);
    functionchart.nonWires.append(binop);
    functionchart.nonWires.append(unop);
    functionchart.nonWires.append(cond);
    functionchart.nonWires.append(newFunctionchart);
    functionchart.nonWires.append(newExport);
    context.root = functionchart;
    this.palette = functionchart;

    // Default Functionchart.
    this.context = new FunctionchartContext(renderer);
    this.initializeContext(this.context);
    this.functionchart = this.context.root;

    // Register property grid layouts.
    function getter(info: ItemInfo, item: AllTypes) {
      return item ? info.prop.get(item) : '';
    }
    function setter(info: ItemInfo, item: AllTypes, value: any) {
      if (item && (info.prop instanceof ScalarProp || info.prop instanceof ReferenceProp)) {
        const description = 'change ' + info.label,
              context = self.context;
        context.beginTransaction(description);
        info.prop.set(item, value);
        context.endTransaction();
        self.canvasController.draw();
      }
    }
    function elementLabelGetter(info: ItemInfo, item: NodeTypes) {
      switch (item.template.typeName) {
        case 'input':       // [,v(label)]
          return item.type.outputs[0].name || '';
        case 'output':      // [v(label),]
          return item.type.inputs[0].name || '';
        case 'literal':     // [,v(label)]
          return item.type.outputs[0].name || '';
        case 'binop':       // [vv,v](label)
        case 'unop':        // [v,v](label)
      }
      return '';
    }
    function elementLabelSetter(info: ItemInfo, item: AllTypes, value: any) {
      const labelPart = value ? '(' + value + ')' : '';
      let newValue;
      switch (item.template.typeName) {
        case 'input':       // [,v(label)]
          newValue = '[,v' + labelPart + ']';
          break;
        case 'output':      // [v(label),]
          newValue = '[v' + labelPart + ',]';
          break;
        case 'literal':     // [,v(label)]
          newValue = '[,v' + labelPart + ']';
          break;
        case 'binop':       // [vv,v](label)
          newValue = '[vv,v]' + labelPart;
          break;
        case 'unop':       // [v,v](label)
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
    const unaryOps = ['!', '~', '-', '√'];
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
  initializeContext(context: FunctionchartContext) {
    const self = this;

    // On attribute changes and item insertions, dynamically layout affected items.
    // This allows us to layout wires as their src or dst elements are dragged.
    context.addHandler('changed', change => self.onChanged(change));

    // On ending transactions and undo/redo, layout the changed top level functioncharts.
    function update() {
      self.updateBounds();
    }
    context.addTransactionHandler('transactionEnding', update);
    context.addTransactionHandler('didUndo', update);
    context.addTransactionHandler('didRedo', update);
  }
  setContext(context: FunctionchartContext) {
    // Make sure any function instances don't get detached from their functioncharts.
    const functioncharts = new Set<Functionchart>();
    this.scrap.forEach(item => {
      context.visitAll(item, item => {
        if (item instanceof FunctionInstance) {
          functioncharts.add(item.functionchart);  // prepend so they precede instances.
        }
      });
    });
    this.scrap.splice(0, 0, ...functioncharts);

    const functionchart = context.root,
          renderer = this.renderer;

    this.context = context;
    this.functionchart = functionchart;

    this.changedItems.clear();
    this.changedTopLevelFunctioncharts.clear();

    // renderer.setModel(model);

    // Layout any items in the functionchart.
    renderer.begin(this.canvasController.getCtx());
    context.reverseVisitNonWires(this.functionchart, item => renderer.layout(item));
    context.visitWires(this.functionchart, item => renderer.layout(item));
    renderer.end();
  }
  initialize(canvasController: CanvasController) {
    if (canvasController === this.canvasController) {
    } else {
      const renderer = this.renderer;
      // Layout the palette items and their parent functionchart.
      renderer.begin(canvasController.getCtx());
      this.context.reverseVisitAll(this.palette, item => renderer.layout(item));
      // Draw the palette items.
      this.palette.nonWires.forEach(item => renderer.draw(item, RenderMode.Print));
      renderer.end();
    }
  }
  private onChanged(change: Change) {
    const functionchart = this.functionchart,
          context = this.context, changedItems = this.changedItems,
          changedTopLevelFunctioncharts = this.changedTopLevelFunctioncharts,
          item: AllTypes = change.item as AllTypes, prop = change.prop;

    // Track all top level functioncharts which contain changes. On ending a transaction,
    // update the layout of functioncharts.
    let ancestor: AllTypes | undefined = item,
        topLevel;
    do {
      topLevel = ancestor;
      ancestor = ancestor.parent;
    } while (ancestor && ancestor !== functionchart);

    if (ancestor === functionchart && topLevel instanceof Functionchart) {
      changedTopLevelFunctioncharts.add(topLevel);
    }

    function addItems(item: AllTypes) {
      if (item instanceof NodeBase) {
        // Layout the item's incoming and outgoing wires.
        context.forInWires(item, addItems);
        context.forOutWires(item, addItems);
      } else if (item instanceof Functionchart) {
        context.forOutWires(item, addItems);
      }
      changedItems.add(item);
    }

    switch (change.type) {
      case 'valueChanged': {
        // For changes to x, y, width, height, or typeString, layout affected wires.
        if (prop === xProp || prop === yProp || prop === widthProp || prop === heightProp ||
            prop === typeStringProp) {
          // Visit item and sub-items to layout all affected wires.
          context.visitAll(item, addItems);
        } else if (item instanceof Wire) {
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
  private updateLayout() {
    const renderer = this.renderer,
          context = this.context,
          changedItems = this.changedItems;
    // This function is called during the draw, hitTest, and updateBounds_ methods,
    // so the renderer is started.
    // First layout containers, and then layout wires which depend on elements'
    // size and location.
    function layout(item: AllTypes, visitor: FunctionchartVisitor) {
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
        if (item instanceof Wire && context.isValidWire(item))  // Wire may be invalid after edit.
          renderer.layout(item);
      });
    });
    changedItems.clear();
  }
  private updateBounds() {
    const ctx = this.canvasController.getCtx(),
          renderer = this.renderer,
          context = this.context,
          functionchart = this.functionchart,
          changedTopLevelFunctioncharts = this.changedTopLevelFunctioncharts;
    renderer.begin(ctx);
    // Update any changed items first.
    this.updateLayout();
    // Then update the bounds of functionchart contents, bottom up.
    changedTopLevelFunctioncharts.forEach(
      functionchart => context.reverseVisitAll(functionchart, item => {
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
    const canvasController = this.canvasController,
          canvasSize = canvasController.getSize();
    let width = functionchart.width, height = functionchart.height;
    if (width > canvasSize.width || height > canvasSize.height) {
      width = Math.max(width, canvasSize.width);
      height = Math.max(height, canvasSize.height);
      canvasController.setSize(width, height);
    }
  }
  draw(canvasController: CanvasController) {
    const renderer = this.renderer,
          functionchart = this.functionchart,
          context = this.context,
          ctx = canvasController.getCtx(),
          size = canvasController.getSize();
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
        renderer.drawHoverInfo(hoverHitInfo, this.hoverPoint);
      }
      renderer.end();
    } else if (canvasController === this.paletteController) {
      // Palette drawing occurs during drag and drop. If the palette has the drag,
      // draw the canvas underneath so the new object will appear on the canvas.
      this.canvasController.draw();
      renderer.begin(ctx);
      canvasController.applyTransform();
      // Render white background, since palette canvas is floating over the main canvas.
      ctx.fillStyle = this.theme.bgColor;
      ctx.fillRect(0, 0, size.width, size.height);

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
    const renderer = this.renderer,
          context = this.context,
          canvasController = this.canvasController;
    let functionchart = this.functionchart,
        renderMode = RenderMode.Print;
    if (true) {
      // Print functionchart.
    } else {
      functionchart = this.palette;
      renderMode = RenderMode.Palette;
      // Print palette.
    }

    // Calculate document bounds. We don't need to consider wires as they should be  mostly
    // in the bounds of the elements.
    const items: AllTypes[] = new Array();
    functionchart.nonWires.forEach(item => items.push(item));

    const bounds = renderer.sumBounds(items);
    // If there is a last selected element, we also render its hover info.
    const last = context.selection.lastSelected;
    let hoverHitResult, p;
    if (last) {
      const hoverBounds = renderer.getBounds(last),
            offset = this.theme.spacing * 2;  // offset from bottom right to avoid pins, hit instancer.
      p = { x: hoverBounds.x + hoverBounds.width - offset,
            y: hoverBounds.y + hoverBounds.height - offset};
      hoverHitResult = renderer.hitTest(last, p, 1, RenderMode.Print);
      if (hoverHitResult) {
        // The biggest hover info is when we render the full type.
        const hoverWidth = p.x + last.type.width - bounds.x,
              hoverHeight = p.y + last.type.height - bounds.y;
        bounds.width = Math.max(bounds.width, hoverWidth);
        bounds.height = Math.max(bounds.width, hoverHeight);
      }
    }

    // Adjust all edges 1 pixel out.
    const ctx = new (window as any).C2S(bounds.width + 2, bounds.height + 2);
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
    if (hoverHitResult && p)
      renderer.drawHoverInfo(hoverHitResult, p);

    renderer.end();

    // Write out the SVG file.
    const serializedSVG = ctx.getSerializedSvg();
    const blob = new Blob([serializedSVG], {
      type: 'text/plain'
    });
    (window as any).saveAs(blob, 'functionchart.svg', true);
  }
  getCanvasPosition(canvasController: CanvasController, p: Point) {
    // When dragging from the palette, convert the position from pointer events
    // into the canvas space to render the drag and drop.
    return this.canvasController.viewToOtherCanvasView(canvasController, p);
  }
  hitTestCanvas(p: Point) {
    const renderer = this.renderer,
          context = this.context,
          tol = this.hitTolerance,
          functionchart = this.functionchart,
          canvasController = this.canvasController,
          cp = this.getCanvasPosition(canvasController, p),
          ctx = canvasController.getCtx(),
          hitList: Array<HitResultTypes> = [];
    function pushInfo(info: HitResultTypes | undefined) {
      if (info)
        hitList.push(info);
    }
    renderer.begin(ctx);
    this.updateLayout();
    // TODO hit test selection first, in highlight, first.
    // Hit test wires first.
    context.reverseVisitWires(functionchart, (wire: Wire) => {
      pushInfo(renderer.hitTestWire(wire, cp, tol, RenderMode.Normal));
    });
    // Skip the root functionchart, as hits there should go to the underlying canvas controller.
    functionchart.nonWires.forEachReverse(item => {
      context.reverseVisitNonWires(item, (item: NodeTypes) => {
        pushInfo(renderer.hitTest(item, cp, tol, RenderMode.Normal));
      });
    });
    renderer.end();
    return hitList;
  }
  hitTestPalette(p: Point) {
    const renderer = this.renderer,
          context = this.context,
          tol = this.hitTolerance,
          ctx = this.paletteController.getCtx(),
          hitList: Array<HitResultTypes> = [];
    function pushInfo(info: HitResultTypes | undefined) {
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
  getFirstHit(
      hitList: Array<HitResultTypes>, filterFn: (hitInfo: HitResultTypes) => boolean):
      HitResultTypes | undefined {
    for (let hitInfo of hitList) {
      if (filterFn(hitInfo))
        return hitInfo;
    }
  }
  getDraggableAncestor(hitList: Array<HitResultTypes>, hitInfo: HitResultTypes | undefined) {
    while (hitInfo && !isDraggable(hitInfo)) {
      const parent = hitInfo.item.parent;
      hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; })
    }
    return hitInfo;
  }
  setPropertyGrid() {
    const context = this.context,
          item = context.selection.lastSelected,
          type = item ? item.template.typeName : undefined;
    this.propertyGridController.show(type, item);
  }
  onClick(canvasController: CanvasController) {
    const context = this.context,
          selection = context.selection,
          shiftKeyDown = this.canvasController.shiftKeyDown,
          cmdKeyDown = this.canvasController.cmdKeyDown,
          p = canvasController.getClickPointerPosition(),
          cp = canvasController.viewToCanvas(p);
    let hitList;
    if (canvasController === this.paletteController) {
      hitList = this.hitTestPalette(cp);
      this.clickInPalette = true;
    } else {
      hitList = this.hitTestCanvas(cp);
      this.clickInPalette = false;
    }
    const pointerHitInfo = this.pointerHitInfo = this.getFirstHit(hitList, isClickable);
    if (pointerHitInfo) {
      this.draggableHitInfo = this.getDraggableAncestor(hitList, pointerHitInfo);
      const item = pointerHitInfo.item;
      if (this.clickInPalette) {
        selection.clear();
      } else if (cmdKeyDown) {
        selection.toggle(item);
      } else if (shiftKeyDown) {
        selection.add(item);
      } else if (!selection.has(item)) {
        selection.set(item);
      } else {
        selection.add(item);
      }
    } else {
      if (!shiftKeyDown) {
        selection.clear();
      }
    }
    this.setPropertyGrid();
    return pointerHitInfo !== undefined;
  }
  onBeginDrag(canvasController: CanvasController) {
    let pointerHitInfo = this.pointerHitInfo;
    if (!pointerHitInfo)
      return false;

    const context = this.context,
          selection = context.selection,
          p0 = canvasController.getClickPointerPosition();
    let dragItem = pointerHitInfo.item;
    let drag: DragTypes | undefined,
        newWire: Wire | undefined;
    // First check for a drag that creates a new wire.
    if ((pointerHitInfo instanceof ElementHitResult &&
        (pointerHitInfo.input >= 0 || pointerHitInfo.output >= 0)) &&
        !this.clickInPalette) {
      const cp0 = this.getCanvasPosition(canvasController, p0);
      if (pointerHitInfo.input >= 0) {
        const dst = dragItem as NodeTypes;
        newWire = context.newWire(undefined, -1, dst, pointerHitInfo.input);
        newWire.pSrc = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
        drag = new WireDrag(newWire, 'connectWireSrc', 'Add new wire');
      } else if (pointerHitInfo.output >= 0) {
        const src = dragItem as NodeTypes;
        newWire = context.newWire(src, pointerHitInfo.output, undefined, -1);
        newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
        drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
      }
    } else if (pointerHitInfo instanceof FunctionchartHitResult &&
              pointerHitInfo.output >= 0 &&
              !this.clickInPalette) {
// TODO input pin support when we need it.
        const cp0 = this.getCanvasPosition(canvasController, p0);
        const src = dragItem as NodeTypes;
        newWire = context.newWire(src, pointerHitInfo.output, undefined, -1);
        newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
        drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
      } else if (pointerHitInfo instanceof WireHitResult) {
      if (pointerHitInfo.inner.t === 0) {
        drag = new WireDrag(dragItem as Wire, 'connectWireSrc', 'Edit wire');
      } else if (pointerHitInfo.inner.t === 1) {
        drag = new WireDrag(dragItem as Wire, 'connectWireDst', 'Edit wire');
      }
    } else if (this.draggableHitInfo) {
      pointerHitInfo = this.pointerHitInfo = this.draggableHitInfo;
      if (!(pointerHitInfo instanceof WireHitResult)) {
        if (this.clickInPalette) {
          drag = new NonWireDrag([pointerHitInfo.item], 'copyPalette', 'Create new element or functionchart');
        } else if (this.canvasController.shiftKeyDown) {
          drag = new NonWireDrag(context.selectedNodes(), 'moveCopySelection', 'Move copy of selection');
        } else {
          if (pointerHitInfo instanceof FunctionchartHitResult) {
            if (pointerHitInfo.inner.border) {
              drag = new NonWireDrag([pointerHitInfo.item], 'resizeFunctionchart', 'Resize functionchart');
            } else if (pointerHitInfo.instancer) {
              drag = new NonWireDrag([pointerHitInfo.item], 'instantiateFunctionchart', 'Create new instance of functionchart');
            } else {
              drag = new NonWireDrag(context.selectedNodes(), 'moveSelection', 'Move selection');
            }
          } else {
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
        const offset = this.paletteController.offsetToOtherCanvas(this.canvasController),
              copies = copyItems(drag.items, context) as NodeTypes[];
        copies.forEach(copy => {
          if (!(copy instanceof Wire)) {
            copy.x -= offset.x;
            copy.y -= offset.y;
          }
        });
        drag.items = copies;
      } else if (drag.kind == 'moveCopySelection') {
        const copies = context.copy() as NodeTypes[];  // TODO fix
        drag.items = copies;
      } else if  (drag.kind === 'instantiateFunctionchart') {
        const functionchart = drag.items[0] as Functionchart,
              newInstance = context.newFunctionInstance(),
              instancerRect = this.renderer.instancerBounds(functionchart);
        newInstance.functionchart = functionchart;
        newInstance.x = instancerRect.x;
        newInstance.y = instancerRect.y;
        drag.items = [newInstance];
      }

      context.beginTransaction(drag.description);
      if (newWire) {
        context.addItem(newWire, this.functionchart);
        selection.set(newWire);
      } else {
        if (drag.kind == 'copyPalette' || drag.kind == 'moveCopySelection' ||
            drag.kind === 'instantiateFunctionchart') {
          context.addItems(drag.items, this.functionchart);
          selection.set(drag.items);
        }
      }
    }
  }
  onDrag(canvasController: CanvasController) {
    const drag = this.dragInfo;
    if (!drag)
      return;
    const context = this.context,
          renderer = this.renderer,
          p0 = canvasController.getClickPointerPosition(),
          cp0 = this.getCanvasPosition(canvasController, p0),
          p = canvasController.getCurrentPointerPosition(),
          cp = this.getCanvasPosition(canvasController, p),
          dx = cp.x - cp0.x,
          dy = cp.y - cp0.y,
          pointerHitInfo = this.pointerHitInfo!,
          hitList = this.hitTestCanvas(cp);
    let hitInfo;
    if (drag instanceof NonWireDrag) {
      switch (drag.kind) {
        case 'copyPalette':
        case 'moveCopySelection':
        case 'moveSelection':
        case 'instantiateFunctionchart': {
          hitInfo = this.getFirstHit(hitList, isDropTarget) as ElementHitResult | FunctionchartHitResult;
          context.selection.forEach(item => {
            if (item instanceof Wire)
              return;
            const oldX = context.getOldValue(item, 'x'),
                  oldY = context.getOldValue(item, 'y');
            item.x = oldX + dx;
            item.y = oldY + dy;
          });
          break;
        }
        case 'resizeFunctionchart': {
          const hitInfo = pointerHitInfo as ElementHitResult,
                item = drag.items[0] as Functionchart,
                oldX = context.getOldValue(item, 'x'),
                oldY = context.getOldValue(item, 'y'),
                oldWidth =  context.getOldValue(item, 'width'),
                oldHeight =  context.getOldValue(item, 'height');
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
    } else if (drag instanceof WireDrag) {
      const wire = drag.wire;
      switch (drag.kind) {
        case 'connectWireSrc': {
          const dst = wire.dst,
                hitInfo = this.getFirstHit(hitList, isElementOutputPin) as ElementHitResult,
                src = hitInfo ? hitInfo.item as AllElementTypes : undefined;
          if (src && dst && src !== dst) {
            wire.src = src;
            wire.srcPin = hitInfo.output;
          } else {
            wire.src = undefined;  // This notifies observers to update the layout.
            wire.pSrc = { x: cp.x, y: cp.y, nx: 1, ny: 0 };
          }
          break;
        }
        case 'connectWireDst': {
          const src = wire.src,
                hitInfo = this.getFirstHit(hitList, isElementInputPin) as ElementHitResult,
                dst = hitInfo ? hitInfo.item as AllElementTypes : undefined;
          if (src && dst && src !== dst) {
            wire.dst = dst;
            wire.dstPin = hitInfo.input;
          } else {
            wire.dst = undefined;  // This notifies observers to update the layout.
            wire.pDst = { x: cp.x, y: cp.y, nx: -1, ny: 0 };
          }
          break;
        }
      }
    }
    this.hotTrackInfo = (hitInfo && hitInfo.item !== this.functionchart) ? hitInfo : undefined;
  }
  onEndDrag(canvasController: CanvasController) {
    const drag = this.dragInfo;
    if (!drag)
      return;
    const context = this.context,
          functionchart = this.functionchart,
          selection = context.selection,
          p = canvasController.getCurrentPointerPosition(),
          cp = this.getCanvasPosition(canvasController, p);
    if (drag instanceof WireDrag) {
      const wire = drag.wire,
            src = wire.src,
            dst = wire.dst;
      // Auto-complete if wire has no src or destination. Inputs of all types and
      // outputs of value type auto-complete to input/output pseudoelements. Outputs
      // of function type auto-complete to an 'import' element of the src pin type.
      if (src === undefined) {
        const p = wire.pSrc!,
              input = context.newInputForWire(wire, p);
        context.select(input)
      } else if (dst === undefined) {
        const p = wire.pDst!,
              pin = src.type.outputs[wire.srcPin];
        let output;
        if (pin.type === Type.valueType) {
          output = context.newOutputForWire(wire, p);
        } else {
          output = context.newImportForWire(wire, p);
        }
        context.select(output);
      }
      wire.pSrc = wire.pDst = undefined;
    } else if (drag instanceof NonWireDrag &&
              (drag.kind == 'copyPalette' || drag.kind === 'moveSelection' ||
               drag.kind === 'moveCopySelection' || drag.kind === 'instantiateFunctionchart')) {
      // Find element or functionchart beneath mouse.
      const hitList = this.hitTestCanvas(cp),
            hitInfo = this.getFirstHit(hitList, isDropTarget),
            lastSelected = selection.lastSelected;
      if (hitInfo instanceof ElementHitResult && lastSelected instanceof NodeBase &&
          lastSelected.type.canConnectTo(hitInfo.item.type)) {
        if (!(lastSelected instanceof Functionchart))  // TODO support Functionchart somehow?
          context.replaceElement(hitInfo.item, lastSelected);
      } else {
        let parent: Functionchart = functionchart;
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
  createContext(text: string) {
    const raw = JSON.parse(text),
          context = new FunctionchartContext(this.renderer);
    const functionchart = Deserialize(raw, context) as Functionchart;
    context.root = functionchart;
    this.initializeContext(context);
    this.setContext(context);
    this.renderer.begin(this.canvasController.getCtx());
    this.updateBounds();
    this.canvasController.draw();
  }

  onKeyDown(e: KeyboardEvent) {
    const self = this,
          context = this.context,
          functionchart = this.functionchart,
          selection = context.selection,
          keyCode = e.keyCode,  // TODO fix me.
          cmdKey = e.ctrlKey || e.metaKey,
          shiftKey = e.shiftKey;

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
        case 71 : { // 'g'
          context.selection.set(context.selectedNodes());
          context.extendSelectionToWires();
          context.reduceSelection();
          context.beginTransaction('group items into functionchart');
          const bounds = this.renderer.sumBounds(context.selectedNodes()),
                contents = context.selectedAllTypes();
          let parent = context.getContainingFunctionchart(contents);
          expandRect(bounds, Functionchart.radius, Functionchart.radius);
          context.group(context.selectedAllTypes(), parent, bounds);
          context.endTransaction();
          return true;
        }
        case 69: { // 'e'
          context.selectConnectedNodes((wire) => true, (wire) => true);  // TODO more nuanced connecting.
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
  onKeyUp(e: KeyboardEvent): boolean {
    return false;
  }
  onBeginHover(canvasController: CanvasController) {
    const context = this.context,
          p = canvasController.getCurrentPointerPosition(),
          hitList = this.hitTestCanvas(p),
          hoverHitInfo = this.hoverHitInfo = this.getFirstHit(hitList, hasProperties);
    if (!hoverHitInfo)
      return false;

    const cp = canvasController.viewToCanvas(p);
    this.hoverPoint = cp;
    this.hoverHitInfo = hoverHitInfo;
    return true;
  }
  onEndHover(canvasController: CanvasController) {
    this.hoverHitInfo = undefined;
  }
}
