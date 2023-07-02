import { SelectionSet } from '../../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, inFlagPath, outFlagPath, measureNameValuePairs,
         CanvasController, CanvasLayer, PropertyGridController, PropertyInfo,
         FileController } from '../../src/diagrams.js'

import { Point, Rect, PointWithNormal, getExtents, projectPointToCircle,
         BezierCurve, evaluateBezier, CurveHitResult, expandRect } from '../../src/geometry.js'

import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, Change, ChangeEvents,
         copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet,
         reduceToRoots, List, TransactionManager, HistoryManager, ScalarPropertyTypes,
         ArrayPropertyTypes } from '../../src/dataModels.js'
import { types } from '@babel/core';

// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

//------------------------------------------------------------------------------

// Value and Function type descriptions.

export class Pin {
  readonly type: Type;
  readonly name?: string;
  get typeString() { return this.toString(); }
  y = 0;
  width = 0;
  height = 0;
  baseline = 0;

  constructor(type: Type, name?: string) {
    this.type = type;
    this.name = name;
  }

  copy() : Pin {
    if (this.type === Type.valueType)
      return new Pin(Type.valueType, this.name);
    else if (this.type === Type.starType)
      return new Pin(Type.starType, this.name);
    return new Pin(this.type.copy(), this.name);
  }
  copyUnlabeled() : Pin {
    if (this.type === Type.valueType)
      return new Pin(Type.valueType);
    else if (this.type === Type.starType)
      return new Pin(Type.starType);
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
  static readonly valueTypeString = 'v';
  static readonly valueType = new Type([], []);
  static readonly starTypeString = '*';
  static readonly starType = new Type([], []);
  static readonly emptyTypeString = '[,]';
  static readonly emptyType = new Type([], []);

  static readonly atomizedTypes = new Map<string, Type>();

  static initialize() {
    Type.atomizedTypes.clear();
    Type.atomizedTypes.set(Type.valueTypeString, Type.valueType);
    Type.atomizedTypes.set(Type.starTypeString, Type.starType);
    Type.atomizedTypes.set(Type.emptyTypeString, Type.emptyType);
  }

  get typeString() : string { return this.toString(); }

  readonly inputs: Pin[];
  readonly outputs: Pin[];
  readonly name?: string;
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  get needsLayout() {
    return this.width === 0;
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
    if (this === Type.starType)
      return Type.starTypeString;
    let s = '[';
    this.inputs.forEach(input => s += input.toString());
    s += ',';
    this.outputs.forEach(output => s += output.toString());
    s += ']';
    if (this.name)
      s += '(' + this.name + ')';
    return s;
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
    if (src === dst)
      return true;
    if (src === Type.starType || dst === Type.starType)
      return true;
    if (dst === Type.valueType)
      return src === Type.valueType;

    return src.inputs.length >= dst.inputs.length &&
           src.outputs.length >= dst.outputs.length &&
           dst.inputs.every((input, i) => {
              return Type.canConnect(src.inputs[i].type, input.type );
           }) &&
           dst.outputs.every((output, i) => {
             return Type.canConnect(src.outputs[i].type, output.type);
           });
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
    // value types
    if (s[j] === Type.valueTypeString) {
      j++;
      return new Pin(Type.valueType, parseName());
    }
    // wildcard types
    if (s[j] === Type.starTypeString) {
      j++;
      return new Pin(Type.starType, parseName());
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
    if (s[j] === Type.valueTypeString) {
      return Type.valueType;
    } else if(s[j] === Type.starTypeString) {
      return Type.starType;
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

// Implement type-safe interfaces as well as a raw data interface for
// cloning, serialization, etc.

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
      functionchartProp = new ReferenceProp('functionchart'),
      elementsProp = new ChildArrayProp('element');

abstract class NonWireTemplate {
  readonly id = idProp;
  readonly x = xProp;
  readonly y = yProp;
}

export type ElementType = 'binop' | 'unop' | 'cond' | 'element';

class ElementTemplate extends NonWireTemplate {
  readonly typeName: ElementType;
  readonly name = nameProp;
  readonly typeString = typeStringProp;
  readonly elements = elementsProp;
  readonly properties = [this.id, this.x, this.y, this.name, this.typeString, this.elements];
  constructor(typeName: ElementType) {
    super();
    this.typeName = typeName;
  }
}

export type PseudoelementType = 'input' | 'output' | 'literal' | 'use';

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

class FunctionchartTemplate extends NonWireTemplate {
  readonly typeName = 'functionchart';
  readonly width = widthProp;
  readonly height = heightProp;
  readonly name = nameProp;
  readonly nonWires = nonWiresProp;
  readonly wires = wiresProp;
  readonly properties = [this.id, this.x, this.y, this.width, this.height, this.name,
                         this.nonWires, this.wires];
}

class FunctionInstanceTemplate extends NonWireTemplate {
  readonly typeName = 'instance';
  readonly functionchart = functionchartProp;
  readonly properties = [this.id, this.x, this.y, this.functionchart];
}

const binopTemplate = new ElementTemplate('binop'),
      unopTemplate = new ElementTemplate('unop'),
      condTemplate = new ElementTemplate('cond'),
      elementTemplate = new ElementTemplate('element'),
      inputPseudoelementTemplate = new PseudoelementTemplate('input'),
      outputPseudoelementTemplate = new PseudoelementTemplate('output'),
      literalPseudoelementTemplate = new PseudoelementTemplate('literal'),
      wireTemplate = new WireTemplate(),
      functionchartTemplate = new FunctionchartTemplate(),
      functionInstanceTemplate = new FunctionInstanceTemplate();

const defaultPoint = { x: 0, y: 0 },
      defaultPointWithNormal: PointWithNormal = { x: 0, y: 0, nx: 0 , ny: 0 },
      defaultBezierCurve: BezierCurve = [
          defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal];

abstract class ElementBase {
  readonly id: number;

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = Type.emptyType;
  inWires = new Array<Wire | undefined>();   // one input per pin (no fan in).
  outWires = new Array<Array<Wire>>();       // multiple outputs per pin (fan out).

  get passThroughs() : Array<Array<number>> | undefined {
    if (this instanceof FunctionInstance)
      return this.functionchart.passThroughs;
    if (this instanceof Element) {
      switch (this.template.typeName) {
        case 'cond':
          return [[1, 2, 3]];
      }
    }
  }

  constructor(id: number) {
    this.id = id;
  }
}

export class Element extends ElementBase implements DataContextObject, ReferencedObject {
  readonly template: ElementTemplate;
  readonly context: FunctionchartContext;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get typeString() { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }
  get elements() { return this.template.elements.get(this) as List<ElementTypes>; }

  constructor(context: FunctionchartContext, template: ElementTemplate, id: number) {
    super(id);
    this.context = context;
    this.template = template;
  }
}

export class Pseudoelement extends ElementBase implements DataContextObject, ReferencedObject {
  readonly template: PseudoelementTemplate;
  readonly context: FunctionchartContext;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get typeString() : string { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  // Derived properties.
  index: number = -1;
  resolvedType: Type = Type.emptyType;

  constructor(context: FunctionchartContext, template: PseudoelementTemplate, id: number) {
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
      case 'literal':
        this.typeString = '[,v]';
        break;
    }
  }
}

export class Wire implements DataContextObject {
  readonly template = wireTemplate;
  readonly context: FunctionchartContext;

  get src() { return this.template.src.get(this) as ElementTypes | undefined; }
  set src(value: ElementTypes | undefined) { this.template.src.set(this, value); }
  get srcPin() { return this.template.srcPin.get(this); }
  set srcPin(value: number) { this.template.srcPin.set(this, value); }
  get dst() { return this.template.dst.get(this) as ElementTypes | undefined; }
  set dst(value: ElementTypes | undefined) { this.template.dst.set(this, value); }
  get dstPin() { return this.template.dstPin.get(this); }
  set dstPin(value: number) { this.template.dstPin.set(this, value); }

  // Derived properties.
  parent: Functionchart | undefined;
  pSrc: PointWithNormal | undefined;
  pDst: PointWithNormal | undefined;
  bezier: BezierCurve = defaultBezierCurve;

  constructor(context: FunctionchartContext) {
    this.context = context;
    this.srcPin = -1;
    this.dstPin = -1;
  }
}

export class Functionchart implements DataContextObject {
  readonly template = functionchartTemplate;
  readonly context: FunctionchartContext;

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

  get nonWires() { return this.template.nonWires.get(this) as List<NonWireTypes>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = Type.emptyType;
  passThroughs: Array<Array<number>> | undefined;

  constructor(context: FunctionchartContext, id: number) {
    this.context = context;
    this.id = id;
  }
}

export class FunctionInstance extends ElementBase implements DataContextObject, ReferencedObject {
  readonly template = functionInstanceTemplate;
  readonly context: FunctionchartContext;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get functionchart() { return this.template.functionchart.get(this) as Functionchart; }
  set functionchart(value: Functionchart) { this.template.functionchart.set(this, value); }

  constructor(context: FunctionchartContext, id: number) {
    super(id);
    this.context = context;
  }
}

export type ElementTypes = Element | Pseudoelement | FunctionInstance;
export type NonWireTypes = ElementTypes | Functionchart;
export type AllTypes = NonWireTypes | Wire;

export type FunctionchartVisitor = (item: AllTypes) => void;
export type NonWireVisitor = (nonwire: NonWireTypes) => void;
export type WireVisitor = (wire: Wire) => void;
export type WireFilter = (wire: Wire) => boolean;

export type PinPositionFunction = (element: ElementTypes, pin: number) => PointWithNormal;

export interface GraphInfo {
  elements: Set<ElementTypes>;
  functioncharts: Set<Functionchart>;
  wires: Set<Wire>;
  interiorWires: Set<Wire>;
  inWires: Set<Wire>;
  outWires: Set<Wire>;
}

export class FunctionchartContext extends EventBase<Change, ChangeEvents>
                                  implements DataContext {
  private highestId: number = 0;  // 0 stands for no id.
  private readonly referentMap = new Map<number, ElementTypes | Functionchart>();

  private functionchart: Functionchart;  // The root functionchart.
  private elements = new Set<ElementTypes>;
  private functioncharts = new Set<Functionchart>;
  private wires = new Set<Wire>;
  private sorted? = new Array<ElementTypes>();  // Topologically sorted elements.

  readonly transactionManager: TransactionManager;
  readonly historyManager: HistoryManager;

  selection = new SelectionSet<AllTypes>();

  constructor() {
    super();
    const self = this;
    this.transactionManager = new TransactionManager();
    this.addHandler('changed',
        this.transactionManager.onChanged.bind(this.transactionManager));

    function update() {
      if (!self.sorted)
        self.sorted = self.topologicalSort();
      self.makeConsistent();
    }
    function validateAndUpdate() {
      if (!self.isValidFunctionchart()) {
        self.transactionManager.cancelTransaction();
      }
      update();
    }
    this.transactionManager.addHandler('transactionEnding', validateAndUpdate);
    this.transactionManager.addHandler('didUndo', update);
    this.transactionManager.addHandler('didRedo', update);

    this.historyManager = new HistoryManager(this.transactionManager, this.selection);
    const root = new Functionchart(this, this.highestId++);
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
      case 'element':
        template = elementTemplate;
        typeString = Type.emptyTypeString;
        break;
      default: throw new Error('Unknown element type: ' + typeName);
    }

    const result: Element = new Element(this, template, nextId);
    result.typeString = typeString;
    this.referentMap.set(nextId, result);
    return result;
  }
  newPseudoelement(typeName: PseudoelementType) : Pseudoelement {
    const nextId = ++this.highestId;
    let template: PseudoelementTemplate;
    switch (typeName) {
      case 'input': template = inputPseudoelementTemplate; break;
      case 'output': template = outputPseudoelementTemplate; break;
      case 'literal': template = literalPseudoelementTemplate; break;
      default: throw new Error('Unknown pseudoelement type: ' + typeName);
    }
    const result: Pseudoelement = new Pseudoelement(this, template, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  newWire(src: ElementTypes | undefined, srcPin: number,
          dst: ElementTypes | undefined, dstPin: number) : Wire {
    const result = new Wire(this);
    result.src = src;
    result.srcPin = srcPin;
    result.dst = dst;
    result.dstPin = dstPin;
    return result;
  }
  newFunctionchart() : Functionchart {
    const nextId = ++this.highestId;
    const result = new Functionchart(this, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  newFunctionInstance() : FunctionInstance {
    const nextId = ++this.highestId;
    const result = new FunctionInstance(this, nextId);
    this.referentMap.set(nextId, result);
    return result;
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
  visitNonWires(item: NonWireTypes, visitor: NonWireVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.nonWires.forEach(item => self.visitNonWires(item, visitor));
    }
  }
  reverseVisitNonWires(item: NonWireTypes, visitor: NonWireVisitor) : void {
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
    let parent = getLowestCommonAncestor<AllTypes>(...items);
    if (!parent)
      return this.functionchart;  // |items| empty.
    if (!(parent instanceof Functionchart)) {  // |items| is a single element.
      parent = parent.parent;
    }
    if (!parent)
      return this.functionchart;  // |items| not in the functionchart yet.
    return parent;
  }

  forInWires(element: ElementTypes, visitor: WireVisitor) {
    element.inWires.forEach(wire => {
      if (wire)
      visitor(wire);
    });
  }

  forOutWires(element: ElementTypes, visitor: WireVisitor) {
    element.outWires.forEach((wires: Wire[]) => {
      wires.forEach(wire => visitor(wire))
    });
  }

  // Gets the translation to move an item from its current parent to
  // newParent.
  getToParent(item: NonWireTypes, newParent: Functionchart | undefined) {
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

  private setGlobalPosition(item: NonWireTypes) {
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

  getSubgraphInfo(items: NonWireTypes[]) : GraphInfo {
    const self = this,
          elements = new Set<ElementTypes>(),
          functioncharts = new Set<Functionchart>(),
          wires = new Set<Wire>(),
          interiorWires = new Set<Wire>(),
          inWires = new Set<Wire>(),
          outWires = new Set<Wire>();
    // First collect Elements and Functioncharts.
    items.forEach(item => {
      this.visitNonWires(item, (item: NonWireTypes) => {
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
        const src: ElementTypes = wire.src!,
              dst: ElementTypes = wire.dst!,
              srcInside = elements.has(src),
              dstInside = elements.has(dst);
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
    }
  }

  getConnectedElements(
      elements: ElementTypes[], upstream: WireFilter, downstream: WireFilter) : Set<ElementTypes> {
    const result = new Set<ElementTypes>();
    elements = elements.slice(0);  // Copy input array
    while (elements.length > 0) {
      const element = elements.pop()!;
      result.add(element);

      this.forInWires(element, wire => {
        if (!upstream(wire)) return;
        const src = wire.src!;
        if (!result.has(src))
          elements.push(src);
      });
      this.forOutWires(element, wire => {
        if (!downstream(wire)) return;
        const dst = wire.dst!;
        if (!result.has(dst))
          elements.push(dst);
      });
    }
    return result;
  }

  // TODO make transaction manager private?
  beginTransaction(name: string) {
    this.transactionManager.beginTransaction(name);
  }
  endTransaction() {
    this.transactionManager.endTransaction();
  }
  cancelTransaction(name: string) {
    this.transactionManager.cancelTransaction();
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

  select(item: AllTypes) {
    this.selection.add(item);
  }

  selectionContents() : AllTypes[] {
    return this.selection.contents();
  }

  selectedElements() : (Element | FunctionInstance)[] {
    const result = new Array<Element | FunctionInstance>();
    this.selection.forEach(item => {
      if (item instanceof Element || item instanceof FunctionInstance)
        result.push(item);
    });
    return result;
  }

  selectedAllElements() : ElementTypes[] {
    const result = new Array<ElementTypes>();
    this.selection.forEach(item => {
      if (item instanceof ElementBase)
        result.push(item);
    });
    return result;
  }

  selectedNonWires() : NonWireTypes[] {
    const result = new Array<NonWireTypes>();
    this.selection.forEach(item => {
      if (!(item instanceof Wire))
        result.push(item);
    });
    return result;
  }

  reduceSelection() {
    const selection = this.selection;
    const roots = reduceToRoots(selection.contents(), selection);
    // Reverse, to preserve the previous order of selection.
    selection.set(roots.reverse());
  }

  disconnectSelection() {
    const self = this;
    this.selectedAllElements().forEach(element => {
      self.forInWires(element, wire => this.deleteItem(wire));
      self.forOutWires(element, wire => this.deleteItem(wire));
    });
  }

  selectInteriorWires() {
    const self = this,
          graphInfo = this.getSubgraphInfo(this.selectedAllElements());
    graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
  }

  selectConnectedElements(upstream: WireFilter, downstream: WireFilter) {
    const selectedElements = this.selectedAllElements(),
          connectedElements = this.getConnectedElements(selectedElements, upstream, downstream);
    this.selection.set(Array.from(connectedElements));
  }

  addItem(item: AllTypes, parent: Functionchart) : AllTypes {
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
    } else {
      parent.nonWires.append(item);
    }
    return item;
  }

  addItems(items: AllTypes[], parent: Functionchart) {
    // Add elements first, then transitions, so the context can track transitions.
    for (let item of items) {
      if (!(item instanceof Wire))
        this.addItem(item, parent);
    }
    for (let item of items) {
      if (item instanceof Wire)
        this.addItem(item, parent);
    }
  }

  private deleteItem(item: AllTypes) {
    if (item.parent) {
      if (item instanceof Wire) {
        item.parent.wires.remove(item);
      } else {
        item.parent.nonWires.remove(item);
      }
    }
    this.selection.delete(item);
  }

  private deleteItems(items: AllTypes[]) {
    const self = this;
    items.forEach(item => self.deleteItem(item));
  }

  copy() : AllTypes[] {
    const Functionchart = this.functionchart,
          selection = this.selection;

    selection.set(this.selectedNonWires());
    this.selectInteriorWires();
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
    this.transactionManager.endTransaction();
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
    this.transactionManager.endTransaction();
    return result;
  }

  deleteSelection() {
    this.transactionManager.beginTransaction('delete');
    this.deleteSelectionHelper();
    this.transactionManager.endTransaction();
  }

  connectInput(element: ElementTypes, pin: number, pinToPoint: PinPositionFunction) {
    const elementParent = element.parent!,
          p = pinToPoint(element, pin),
          junction = this.newPseudoelement('input');
    junction.x = p.x - 32;
    junction.y = p.y;
    this.addItem(junction, elementParent);
    const wire = this.newWire(junction, 0, element, pin);
    this.addItem(wire, elementParent);
    return { junction, wire };
  }

  connectOutput(element: ElementTypes, pin: number, pinToPoint: PinPositionFunction) {
    const elementParent = element.parent!,
          p = pinToPoint(element, pin),
          junction = this.newPseudoelement('output');
    junction.x = p.x + 32;
    junction.y = p.y;
    this.addItem(junction, elementParent);
    const wire = this.newWire(element, pin, junction, 0);
    this.addItem(wire, elementParent);
    return { junction, wire };
  }

  completeElements(
      elements: ElementTypes[], inputToPoint: PinPositionFunction, outputToPoint: PinPositionFunction) {
    const self = this,
          selection = this.selection;
    // Add junctions for disconnected pins on elements.
    elements.forEach(element => {
      const inputs = element.inWires,
            outputs = element.outWires;
      for (let pin = 0; pin < inputs.length; pin++) {
        if (inputs[pin] === undefined) {
          const { junction, wire } = self.connectInput(element, pin, inputToPoint);
          selection.add(junction);
          selection.add(wire);
        }
      }
      for (let pin = 0; pin < outputs.length; pin++) {
        if (outputs[pin].length === 0) {
          const { junction, wire } = self.connectOutput(element, pin, outputToPoint);
          selection.add(junction);
          selection.add(wire);
        }
      }
    });
  }

  disconnectElement(element: ElementTypes, pin: number) {
    element.inWires.forEach((wire, i) => {
      if (wire)
        this.deleteItem(wire);
    });
    element.outWires.forEach((wires, i) => {
      wires.forEach(wire => this.deleteItem(wire));
    });
  }

  isValidWire(wire: Wire) {
    const src = wire.src,
          dst = wire.dst;
    if (!src || !dst)
      return false;
    if (src === dst)
      return false;
    // Wires must be within the functionchart or to/from an enclosing functionchart.
    const lca = getLowestCommonAncestor<AllTypes>(src, dst);
    if (!lca || !(lca === src.parent || lca === dst.parent))
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

  // Topological sort of DAG for update and validation. All wires should be valid.
  topologicalSort() : ElementTypes[] {
    const visiting = new Set<ElementTypes>(),
          visited = new Set<ElementTypes>(),
          sorted = new Array<ElementTypes>();

    let cycle = false;
    function visit(element: ElementTypes) {
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
  isValidFunctionchart() {
    const self = this,
          invalidWires = new Array<Wire>(),
          graphInfo = this.getGraphInfo();
    // Check wires.
    graphInfo.wires.forEach(wire => {
      if (!self.isValidWire(wire))
        invalidWires.push(wire);
    });
    if (invalidWires.length !== 0)
      return false;

    if (!this.sorted)
      this.sorted = this.topologicalSort();
    return this.sorted.length === this.elements.size;
  }

  makeConsistent() {
    const self = this;

    // TODO use topological sort to traverse graph and make types consistent.
    if (!this.sorted)
      this.sorted = this.topologicalSort();

    // Update functioncharts, and functioninstances.
    this.reverseVisitNonWires(this.functionchart, item => {
      if (item instanceof Functionchart) {
        const typeInfo = self.getFunctionchartTypeInfo(item);
        if (typeInfo.typeString !== item.type.typeString) {
          item.type = parseTypeString(typeInfo.typeString);
          item.passThroughs = typeInfo.passThroughs;
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
        if (item.type !== functionchart.type) {
          item.type = functionchart.type;
        }
      }
    });

    // Delete dangling wires.
    const invalidWires = new Array<Wire>();
    this.wires.forEach(wire => {
      if (!wire.src || !wire.dst || !self.elements.has(wire.src) || !self.elements.has(wire.dst))
        invalidWires.push(wire);
    });
    invalidWires.forEach(wire => self.deleteItem(wire));

    // Make sure wires between elements are in lowest common parent functionchart.
    this.wires.forEach(wire => {
      if (!self.isValidWire(wire))
        invalidWires.push(wire);
      const src = wire.src!,
            dst = wire.dst!,
            srcParent = src.parent!,
            dstParent = dst.parent!,
            lca = getLowestCommonAncestor<AllTypes>(srcParent, dstParent) as Functionchart;
      if (wire.parent !== lca) {
        self.deleteItem(wire);
        self.addItem(wire, lca);
      }
    });
  }

  replaceElement(element: ElementTypes, newElement: ElementTypes) {
    const type = element.type,
          newType = newElement.type;
    // Add newElement right after element. Both should be present as we
    // rewire them.
    if (element.parent !== newElement.parent) {
      this.deleteItem(newElement);
    }
    if (element.parent) {
      this.addItem(newElement, element.parent!);
    }
    newElement.x = element.x;
    newElement.y = element.y;

    // Update all incoming and outgoing wires if possible; otherwise they
    // are deleted.
    const srcChange = new Array<Wire>(),
          dstChange = new Array<Wire>();
    this.forInWires(element, wire => {
      const src = wire.src!, srcPin = wire.srcPin, dstPin = wire.dstPin;
      if (dstPin < newType.inputs.length &&
          src.type.outputs[srcPin].type.canConnectTo(newElement.type.inputs[dstPin].type)) {
        dstChange.push(wire);
      } else {
        this.deleteItem(wire);
      }
    });
    this.forOutWires(element, wire => {
      const dst = wire.dst!, srcPin = wire.srcPin, dstPin = wire.dstPin;
      if (srcPin < newType.outputs.length &&
        newElement.type.outputs[srcPin].type.canConnectTo(dst.type.inputs[dstPin].type)) {
        srcChange.push(wire);
      } else {
        this.deleteItem(wire);
      }
    });
    srcChange.forEach(wire => {
      wire.src = newElement;
    });
    dstChange.forEach(function(wire) {
      wire.dst = newElement;
    });

    this.deleteItem(element);
  }

  updateType(instance: FunctionInstance) {
    const newInstance = this.newFunctionInstance();
    newInstance.functionchart = instance.functionchart;
    this.replaceElement(instance, newInstance);
  }

  exportElement(element: Element | FunctionInstance) : Element {
    const result = this.newElement('element'),
          newType = new Type([], [new Pin(element.type)]);
    result.typeString = newType.toString();
    result.elements.append(element);
    return result;
  }

  exportElements(elements: (Element | FunctionInstance)[]) {
    const self = this,
          selection = this.selection;

    // Open each non-input/output element.
    elements.forEach(element => {
      selection.delete(element);
      const newElement = self.exportElement(element);
      self.replaceElement(element, newElement);
      selection.add(newElement);
    });
  }

  openElement(element: Element | FunctionInstance) : Element {
    const result = this.newElement('element'),
          type = element.type,
          newType = type.copyUnlabeled();
    newType.inputs.push(new Pin(type));
    result.typeString = newType.toString();
    return result;
  }

  openElements(elements: (Element | FunctionInstance)[]) {
    const self = this,
          selection = this.selection;

    // Open each non-input/output element.
    elements.forEach(element => {
      selection.delete(element);
      const newElement = self.openElement(element);
      self.replaceElement(element, newElement);
      newElement.elements.append(element);  // Element owns the base element.
      selection.add(newElement);
    });
  }

  group(items: AllTypes[], grandparent: Functionchart, bounds: Rect) {
    const self = this,
          selection = this.selection,
          parent = this.newFunctionchart();
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

  resolveIOType(
      element: ElementBase, passThroughs: number[][], ios: Set<ElementBase>) : Type | undefined {
    const firstOutput = element.type.inputs.length;
    for (let passThrough of passThroughs) {
      for (let pin of passThrough) {
        if (pin < firstOutput) {
          const type = this.resolveInputType(element, pin, ios);
          if (type)
            return type;
        } else {
          const type = this.resolveOutputType(element, pin - firstOutput, ios);
          if (type)
            return type;
        }
      }
    }
  }

  // Search for the first non-star Type wired to the element.
  resolveInputType(element: ElementBase, pin: number, ios: Set<ElementBase>) : Type | undefined {
    const type = element.type.inputs[pin].type;
    if (type !== Type.starType)
      return type;

    const wire = element.inWires[pin];
    if (wire && wire.src) {
      const src = wire.src,
            type = src.type.outputs[wire.srcPin].type;
      if (type !== Type.starType)
        return type;

      if (ios.has(src))
        return;
      ios.add(src);

      // Follow pass-throughs until we get a type.
      const passThroughs = src.passThroughs;
      if (passThroughs) {
        return this.resolveIOType(src, passThroughs, ios);
      }
    }
  }

  resolveOutputType(element: ElementBase, pin: number, ios: Set<ElementBase>) : Type | undefined {
    const type = element.type.outputs[pin].type;
    if (type !== Type.starType)
      return type;

    const wires = element.outWires[pin];
    for (let i = 0; i < wires.length; i++) {
      const wire = wires[i];
      if (wire && wire.dst) {
        const dst = wire.dst;
        let type: Type | undefined = dst.type.inputs[wire.dstPin].type;
        if (type !== Type.starType)
          return type;

        if (ios.has(dst))
          continue;
        ios.add(dst);

        // Follow pass-throughs until we get a type.
        const passThroughs = dst.passThroughs;
        if (passThroughs) {
          type = this.resolveIOType(dst, passThroughs, ios);
          if (type)
            return type;
        }
      }
    }
  }

  getFunctionchartTypeInfo(functionChart: Functionchart) {
    const self = this,
          nonWires = functionChart.nonWires.asArray(),
          inputs = new Array<Pseudoelement>(),
          outputs = new Array<Pseudoelement>(),
          name = functionChart.name;

    // Add pins for inputs, outputs, and disconnected pins on elements.
    nonWires.forEach(item => {
      if (item instanceof Pseudoelement) {
        if (item.template.typeName === 'input') {
          inputs.push(item);
        } else if(item.template.typeName === 'output') {
          outputs.push(item);
        }
      }
    });

    // Sort pins so we encounter them in increasing y-order. This lets us arrange
    // the pins of the group type in an intuitive way.
    function compareYs(p1: Pseudoelement, p2: Pseudoelement) {
      return p1.y - p2.y;
    }
    function compareIndices(p1: Pseudoelement, p2: Pseudoelement) {
      return p1.index - p2.index;
    }
    function isInputOrOutput(p: ElementTypes) {
      return p.template.typeName === 'input' || p.template.typeName === 'output';
    }

    inputs.sort(compareYs);
    inputs.forEach((input, i) => { input.index = i; });
    const firstOutput = inputs.length;
    outputs.sort(compareYs);
    outputs.forEach((output, i) => { output.index = i + firstOutput; });

    function getPinName(type: Type, pin: Pin) : string {
      let typeString = type.typeString;
      if (pin.name)
        typeString += '(' + pin.name + ')';
      return typeString;
    }

    // TODO clean up by separating typeString and passThrough computation.
    const passThroughs = new Array<number[]>(),
          visited = new Set<Pseudoelement>();
    let typeString = '[';
    inputs.forEach(input => {
      const ios = new Set<ElementBase>();
      ios.add(input);
      let type = self.resolveOutputType(input, 0, ios);
      if (type) {
        input.resolvedType = type;
      } else {
        type = Type.starType;
        if (!visited.has(input)) {
          const inputsOutputs = Array.from(ios).filter(isInputOrOutput) as Pseudoelement[];
          if (inputsOutputs.length > 1) {
            inputsOutputs.sort(compareIndices);
            inputsOutputs.forEach(p => { visited.add(p); });
            passThroughs.push(inputsOutputs.map(input => input.index));
          }
        }
      }
      typeString += getPinName(type, input.type.outputs[0]);
    });
    typeString += ',';
    outputs.forEach(output => {
      const ios = new Set<Pseudoelement>();  // Ignore these; it suffices to track for inputs.
      let type = self.resolveInputType(output, 0, ios);
      if (type) {
        output.resolvedType = type;
      } else {
        type = Type.starType;
      }
      typeString += getPinName(type, output.type.inputs[0]);
    });
    typeString += ']';
    if (name)
      typeString += '(' + name + ')';

    return { typeString, passThroughs };
  }

  private updateItem(item: AllTypes) {
    const self = this;
    if (item instanceof Wire)
      return;

    // Update 'type' property.
    let typeString;
    if (item instanceof FunctionInstance) {
      const functionChart = item.functionchart;
      if (functionChart) {
        typeString = functionChart.type.toString();
      }
    } else if (item instanceof ElementBase) {
      typeString = item.typeString;
    } else if (item instanceof Functionchart) {
      const typeInfo = this.getFunctionchartTypeInfo(item);
      typeString = typeInfo.typeString;
      item.passThroughs = typeInfo.passThroughs.length > 0 ? typeInfo.passThroughs : undefined;
    }
    if (typeString && typeString !== item.type.typeString) {
      item.type = parseTypeString(typeString);
    }
    // Update 'inWires' and 'outWires' properties.
    if (item instanceof ElementBase) {
      const type = item.type,
            inputs = type.inputs.length,
            outputs = type.outputs.length,
            inWires = item.inWires,
            outWires = item.outWires;
      inWires.length = inputs;
      outWires.length = outputs;
      for (let i = 0; i < outputs; i++) {
        if (outWires[i] === undefined)
          outWires[i] = new Array<Wire>();
      }
    }

    this.visitNonWires(item, item => self.setGlobalPosition(item));
  }

  private insertElement(element: ElementTypes, parent: Functionchart) {
    this.elements.add(element);
    element.parent = parent;
    this.updateItem(element);
    this.sorted = undefined;
  }

  private removeElement(element: ElementTypes) {
    this.elements.delete(element);
    this.sorted = undefined;
  }

  // Allow parent to be undefined for the root functionchart.
  private insertFunctionchart(functionchart: Functionchart, parent: Functionchart | undefined) {
    this.functioncharts.add(functionchart);
    functionchart.parent = parent;
    this.updateItem(functionchart);

    const self = this;
    functionchart.nonWires.forEach(item => self.insertItem(item, functionchart));
    functionchart.wires.forEach(wire => self.insertWire(wire, functionchart));
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
    this.sorted = undefined;

    const src = wire.src,
          srcPin = wire.srcPin,
          dst = wire.dst,
          dstPin = wire.dstPin;
    if (src && srcPin >= 0 && srcPin < src.type.outputs.length) {  // TODO how to deal with temporarily invalid wire?
      const outputs = src.outWires[srcPin];
      if (!outputs.includes(wire))
        outputs.push(wire);
    }
    if (dst && dstPin >= 0 && dstPin < dst.type.inputs.length) {
      dst.inWires[dstPin] = wire;
    }
  }

  private static removeWireHelper(array: Array<Wire>, wire: Wire) {
    const index = array.indexOf(wire);
    if (index >= 0) {
      array.splice(index, 1);
    }
  }

  private removeWire(wire: Wire) {
    this.wires.delete(wire);
    this.sorted = undefined;  // Removal might make an invalid graph valid.
    const src = wire.src,
          dst = wire.dst;
    if (src) {
      const outputs = src.outWires[wire.srcPin];
      FunctionchartContext.removeWireHelper(outputs, wire);
    }
    if (dst) {
      const inputs = dst.inWires!;
      inputs[wire.dstPin] = undefined;
    }
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
        // Remove and reinsert changed wires.
        if (prop === wireTemplate.src) {
          const oldSrc = oldValue as Element,
                srcPin = owner.srcPin;
          if (oldSrc && srcPin >= 0)  // TODO systematize the valid wire check.
            FunctionchartContext.removeWireHelper(oldSrc.outWires[srcPin], owner);
        } else if (prop === wireTemplate.dst) {
          const oldDst = oldValue as Element,
                dstPin = owner.dstPin;
          if (oldDst && dstPin >= 0)
            oldDst.inWires[dstPin] = undefined;
        } else if (prop === wireTemplate.srcPin) {
          const src = owner.src,
                oldPin = oldValue as number;
          if (src && oldPin >= 0) {
            const oldOutputs = src.outWires[oldPin];
            if (oldOutputs)  // oldPin might be invalid.
              FunctionchartContext.removeWireHelper(oldOutputs, owner);
          }
        } else if (prop === wireTemplate.dstPin) {
          const dst = owner.dst,
                oldPin = oldValue as number;
          if (dst && oldPin >= 0)
            dst.inWires[oldPin] = undefined;
        }
        this.insertWire(owner, owner.parent!);
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
  resolveReference(owner: AllTypes, prop: ReferenceProp) : ElementTypes | Functionchart | undefined {
    // Look up element id.
    const id: number = prop.getId(owner);
    if  (!id)
      return undefined;
    return this.referentMap.get(id);
  }
  construct(typeName: string) : AllTypes {
    switch (typeName) {
      case 'binop': return this.newElement('binop');
      case 'unop': return this.newElement('unop');
      case 'cond': return this.newElement('cond');
      case 'element': return this.newElement('element');
      case 'input': return this.newPseudoelement('input');
      case 'output': return this.newPseudoelement('output');
      case 'literal': return this.newPseudoelement('literal');
      case 'wire': return this.newWire(undefined, -1, undefined, -1);
      case 'functionchart': return this.newFunctionchart();
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
      owner: Element | Functionchart, prop: ArrayPropertyTypes, index: number) :
      Change {
    const change: Change =
        { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(
      owner: Element | Functionchart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes ) :
      Change {
    const change: Change =
        { type: 'elementRemoved', item: owner, prop: prop, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    return this.onChanged(change);
  }
}

//------------------------------------------------------------------------------

class FunctionchartTheme extends Theme {
  radius: number;
  textIndent = 8;
  textLeading = 6;
  knobbyRadius = 4;
  padding = 8;
  spacing = 8;
  minTypeWidth = 8;
  minTypeHeight = 8;
  minFunctionchartWidth = 64;
  minFunctionchartHeight = 32;

  constructor(theme: Theme, radius = 8) {
    super();
    Object.assign(this, theme);

    this.radius = radius;

    // Layout the base types.
    Type.valueType.width = Type.starType.width = radius;
    Type.valueType.height = Type.starType.height = radius;
  }
}

class ElementHitResult {
  item: ElementTypes;
  inner: RectHitResult;
  input: number = -1;
  output: number = -1;
  constructor(item: ElementTypes, inner: RectHitResult) {
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
  constructor(item: Functionchart, inner: RectHitResult, instancer: boolean) {
    this.item = item;
    this.inner = inner;
    this.instancer = instancer;
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

class Renderer {
  private theme: FunctionchartTheme;
  private ctx: CanvasRenderingContext2D;

  constructor(theme: Theme) {
    this.theme = new FunctionchartTheme(theme);
  }

  begin(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    ctx.save();
    ctx.font = this.theme.font;
  }
  end() {
    this.ctx.restore();
  }

  getItemRect(item: AllTypes) : Rect {
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
        const type = item.type;
        width = type.width;
        height = type.height;
      }
    }
    return { x, y, width, height };
  }

  getBounds(items: AllTypes[]) : Rect {
    let xMin = Number.POSITIVE_INFINITY, yMin = Number.POSITIVE_INFINITY,
        xMax = -Number.POSITIVE_INFINITY, yMax = -Number.POSITIVE_INFINITY;
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
  getFunctionchartInstanceBounds(type: Type, bounds: Rect) : Rect {
    const theme = this.theme, spacing = theme.spacing,
          width = type.width, height = type.height,
          x = bounds.x + bounds.width - width - spacing,
          y = bounds.y + bounds.height - height - spacing;
    return { x, y, width, height };
  }

  pinToPoint(element: ElementTypes, index: number, isInput: boolean) : PointWithNormal {
    const rect: Rect = this.getItemRect(element),
          w = rect.width, h = rect.height,
          type = element.type;
    let x = rect.x, y = rect.y,
        pin, nx;
    if (isInput) {
      pin = type.inputs[index];
      nx = -1;
    } else {
      pin = type.outputs[index];
      nx = 1;
      x += w;
    }
    y += pin.y + pin.height / 2;
    return { x: x, y: y, nx: nx, ny: 0 }
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
      width = 2 * spacing + ctx.measureText(name).width;
      height += textSize + spacing / 2;
    } else {
      height += spacing / 2;
    }

    function layoutPins(pins: Pin[]) {
      let y = height, w = 0;
      for (let i = 0; i < pins.length; i++) {
        let pin = pins[i];
        self.layoutPin(pin);
        pin.y = y + spacing / 2;
        let name = pin.name, pw = pin.width, ph = pin.height! + spacing / 2;
        if (name) {
          pin.baseline = y + textSize;
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
    const [yIn, wIn] = layoutPins(inputs);
    const [yOut, wOut] = layoutPins(outputs);

    type.width = Math.round(Math.max(width, wIn + 2 * spacing + wOut, theme.minTypeWidth));
    type.height = Math.round(Math.max(yIn, yOut, theme.minTypeHeight) + spacing / 2);
  }

  layoutPin(pin: Pin) {
    const type = pin.type;
    if (type.needsLayout)
      this.layoutType(type);
    pin.width = type.width;
    pin.height = type.height;
  }

  layoutElement(element: ElementTypes) {
    const type = element.type;
    if (type.needsLayout)
      this.layoutType(type);
  }

  layoutWire(wire: Wire) {
    let src = wire.src,
        dst = wire.dst,
        p1 = wire.pSrc,
        p2 = wire.pDst;
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
  layoutFunctionchart(functionchart: Functionchart) {
    const self = this,
          spacing = this.theme.spacing;
    function layout(functionChart: Functionchart) {
      const type = functionchart.type,
            nonWires = functionChart.nonWires;
      if (type.needsLayout)
        self.layoutType(type);

      let width, height;
      if (nonWires.length === 0) {
        width = self.theme.minFunctionchartWidth;
        height = self.theme.minFunctionchartHeight;
      } else {
        const extents = self.getBounds(nonWires.asArray()),
              global = functionChart.globalPosition,
              x = global.x,
              y = global.y,
              margin = 2 * spacing;
        width = extents.x + extents.width - x + margin;
        height = extents.y + extents.height - y + margin;
        width += type.width;
        height = Math.max(height, type.height + margin);
      }
      functionchart.width = Math.max(width, functionchart.width);
      functionchart.height = Math.max(height, functionchart.height);
    }
    // Visit in reverse order to correctly include sub-functionchart bounds.
    functionchart.context.reverseVisitAll(functionchart, item => {
      if (item instanceof Functionchart)
        layout(item);
    });
  }

  drawType(type: Type, x: number, y: number, fillOutputs: boolean) {
    const self = this, ctx = this.ctx, theme = this.theme,
          textSize = theme.fontSize, spacing = theme.spacing,
          name = type.name,
          w = type.width, h = type.height,
          right = x + w;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = theme.textColor;
    ctx.textBaseline = 'bottom';
    if (name) {
      ctx.textAlign = 'center';
      ctx.fillText(name, x + w / 2, y + textSize + spacing / 2);
    }
    type.inputs.forEach(function(pin: Pin, i: number) {
      const name = pin.name;
      self.drawPin(pin, x, y + pin.y, false);
      if (name) {
        ctx.textAlign = 'left';
        ctx.fillText(name, x + pin.width + spacing, y + pin.baseline);
      }
    });
    type.outputs.forEach(function(pin) {
      const name = pin.name,
            pinLeft = right - pin.width;
      self.drawPin(pin, pinLeft, y + pin.y, fillOutputs);
      if (name) {
        ctx.textAlign = 'right';
        ctx.fillText(name, pinLeft - spacing, y + pin.baseline);
      }
    });
  }

  drawPin(pin: Pin, x: number, y: number, fill: boolean) {
    const ctx = this.ctx,
          theme = this.theme;
    ctx.strokeStyle = theme.strokeColor;
    if (pin.typeString === Type.valueTypeString || pin.typeString === Type.starTypeString) {
      const r = theme.knobbyRadius;
      ctx.beginPath();
      if (pin.typeString === Type.valueTypeString) {
        const d = 2 * r;
        ctx.rect(x, y, d, d);
      } else {
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
      }
      ctx.stroke();
    } else if (pin.type) {
      const type = pin.type,
            width = type.width, height = type.height;
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

  drawElement(element: ElementTypes, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          spacing = theme.spacing,
          rect = this.getItemRect(element),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          right = x + w, bottom = y + h;

    if (element instanceof Pseudoelement) {
      switch (element.template.typeName) {
        case 'input':
          inFlagPath(x, y, w, h, spacing, ctx);
          break;
        case 'output':
          outFlagPath(x, y, w, h, spacing, ctx);
          break;
        case 'literal':
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          break;
      }
    } else {
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

  drawFunctionchart(functionchart: Functionchart, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(functionchart),
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
        const type = functionchart.type,
              instanceRect = this.getFunctionchartInstanceBounds(type, rect);
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

  hitTestElement(element: ElementTypes, p: Point, tol: number, mode: RenderMode) :
                 ElementHitResult | undefined {
    const rect = this.getItemRect(element),
          x = rect.x, y = rect.y, width = rect.width, height = rect.height,
          hitInfo = hitTestRect(x, y, width, height, p, tol);
    if (hitInfo) {
      const result = new ElementHitResult(element, hitInfo),
            type = element.type;
      type.inputs.forEach(function(input, i) {
        if (hitTestRect(x, y + input.y, input.width, input.height, p, 0)) {
          result.input = i;
        }
      });
      type.outputs.forEach(function(output, i) {
        if (hitTestRect(x + width - output.width, y + output.y,
                        output.width, output.height, p, 0)) {
          result.output = i;
        }
      });
      return result;
    }
  }
  hitTestFunctionchart(
    functionchart: Functionchart, p: Point, tol: number, mode: RenderMode) : FunctionchartHitResult | undefined {
  const theme = this.theme,
        r = theme.radius,
        rect = this.getItemRect(functionchart),
        x = rect.x, y = rect.y, w = rect.width, h = rect.height,
        inner = hitTestRect(x, y, w, h, p, tol);
  if (inner) {
    const instanceRect = this.getFunctionchartInstanceBounds(functionchart.type, rect),
          instancer = hitTestRect(
              instanceRect.x, instanceRect.y, instanceRect.width, instanceRect.height, p, tol) !== undefined;
    return new FunctionchartHitResult(functionchart, inner, instancer);
  }
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
  }

  hitTestWire(wire: Wire, p: Point, tol: number, mode: RenderMode) : WireHitResult | undefined {
    // TODO don't hit test new wire as it's dragged!
    const hitInfo = hitTestBezier(wire.bezier, p, tol);
    if (hitInfo) {
      return new WireHitResult(wire, hitInfo);
    }
  }

  draw(item: AllTypes, mode: RenderMode) {
    if (item instanceof ElementBase) {
      this.drawElement(item, mode);
    } else if (item instanceof Wire) {
      this.drawWire(item, mode);
    } else if (item instanceof Functionchart) {
      this.drawFunctionchart(item, mode);
    }
  }

  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) : HitResultTypes | undefined {
    let hitInfo: HitResultTypes | undefined;
    if (item instanceof ElementBase) {
      hitInfo = this.hitTestElement(item, p, tol, mode);
    } else if (item instanceof Wire) {
      hitInfo = this.hitTestWire(item, p, tol, mode);
    } else if (item instanceof Functionchart) {
      hitInfo = this.hitTestFunctionchart(item, p, tol, mode);
    }
    return hitInfo;
  }

  layout(item: AllTypes) {
    if (item instanceof ElementBase) {
      this.layoutElement(item);
    } else if (item instanceof Wire) {
      this.layoutWire(item);
    } else if (item instanceof Functionchart) {
      this.layoutFunctionchart(item);
    }
  }

  drawHoverText(item: AllTypes, p: Point, nameValuePairs: { name: string, value: any }[]) {
    const self = this,
          ctx = this.ctx,
          theme = this.theme,
          textSize = theme.fontSize,
          gap = 16,
          border = 4,
          height = textSize * nameValuePairs.length + 2 * border,
          maxWidth = measureNameValuePairs(nameValuePairs, gap, ctx) + 2 * border;
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

  // drawHoverInfo(item, p) {
  //   const self = this, theme = this.theme, ctx = this.ctx,
  //         x = p.x, y = p.y;
  //   ctx.fillStyle = theme.hoverColor;
  //   if (isGroupInstance(item)) {
  //     const groupItems = getDefinition(item);
  //     let r = this.getBounds(groupItems);
  //     ctx.translate(x - r.x, y - r.y);
  //     let border = 4;
  //     ctx.fillRect(r.x - border, r.y - border, r.w + 2 * border, r.h + 2 * border);
  //     ctx.fillStyle = theme.hoverTextColor;
  //     visitItems(groupItems, item => self.draw(item, normalMode), isElementOrGroup);
  //     visitItems(groupItems, wire => self.draw(wire, normalMode), isWire);
  //   } else {
  //   }
  // }
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
  if (hitInfo instanceof ElementHitResult && lastSelected instanceof ElementBase) {
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
  items: NonWireTypes[];
  kind: NonWireDragType;
  description: string;
  constructor(items: NonWireTypes[], type: NonWireDragType, description: string) {
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
  constructor(transition: Wire, type: WireDragType, description: string) {
    this.wire = transition;
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

  constructor(theme: Theme,
              canvasController: CanvasController,
              paletteController: CanvasController,
              propertyGridController: PropertyGridController) {
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
    const context = new FunctionchartContext(),
          functionchart = context.newFunctionchart(),
          input = context.newPseudoelement('input'),
          output = context.newPseudoelement('output'),
          literal = context.newPseudoelement('literal'),
          newBinop = context.newElement('binop'),
          newUnop = context.newElement('unop'),
          newCond = context.newElement('cond'),
          newFunctionchart = context.newFunctionchart();

    context.root = functionchart;

    literal.x = 8; literal.y = 8;
    input.x = 40;  input.y = 8;
    output.x = 72; output.y = 8;
    newBinop.x = 8; newBinop.y = 32;
    newBinop.typeString = '[vv,v](+)';  // binary addition
    newUnop.x = 48; newUnop.y = 32;
    newUnop.typeString = '[v,v](-)';    // unary negation
    newCond.x = 86; newCond.y = 32;     // conditional

    newFunctionchart.x = 8; newFunctionchart.y = 82;
    newFunctionchart.width = this.theme.minFunctionchartWidth;
    newFunctionchart.height = this.theme.minFunctionchartHeight;

    functionchart.nonWires.append(literal);
    functionchart.nonWires.append(input);
    functionchart.nonWires.append(output);
    functionchart.nonWires.append(newBinop);
    functionchart.nonWires.append(newUnop);
    functionchart.nonWires.append(newCond);
    functionchart.nonWires.append(newFunctionchart);
    context.root = functionchart;
    this.palette = functionchart;

    // Default Functionchart.
    this.context = new FunctionchartContext();
    this.initializeContext(this.context);
    this.functionchart = this.context.root;

    // Register property grid layouts.
    function getter(info: ItemInfo, item: AllTypes) {
      return item ? info.prop.get(item) : '';
    }
    function setter(info: ItemInfo, item: AllTypes, value: any) {
      if (item && (info.prop instanceof ScalarProp || info.prop instanceof ReferenceProp)) {
        const description = 'change ' + info.label,
              transactionManager = self.context.transactionManager;
        transactionManager.beginTransaction(description);
        info.prop.set(item, value);
        transactionManager.endTransaction();
        self.canvasController.draw();
      }
    }
    function elementLabelGetter(info: ItemInfo, item: NonWireTypes) {
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
      const typeString = getter(info, item);
      const labelPart = value ? '(' + value + ')' : '';
      let newValue;
      switch (item.template.typeName) {
        case 'input':       // [,v(label)]
          newValue = '[,*' + labelPart + ']';
          break;
        case 'output':      // [v(label),]
          newValue = '[*' + labelPart + ',]';
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
    ]);

    this.propertyInfo.forEach((info, key) => {
      propertyGridController.register(key, info);
    });
  }
  initializeContext(context: FunctionchartContext) {
    const self = this;

    // On attribute changes and item insertions, dynamically layout affected items.
    // This allows us to layout transitions as their src or dst elements are dragged.
    context.addHandler('changed', change => self.onChanged(change));

    // On ending transactions and undo/redo, layout the changed top level functioncharts.
    function update() {
      self.updateBounds();
    }
    context.transactionManager.addHandler('transactionEnding', update);
    context.transactionManager.addHandler('didUndo', update);
    context.transactionManager.addHandler('didRedo', update);
  }
  setContext(context: FunctionchartContext) {
    const functionchart = context.root,
          renderer = this.renderer;

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
  initialize(canvasController: CanvasController) {
    if (canvasController === this.canvasController) {
    } else {
      const renderer = this.renderer;
      renderer.begin(canvasController.getCtx());
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
          changedTopLevelStates = this.changedTopLevelFunctioncharts,
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
      changedTopLevelStates.add(topLevel);
    }

    function addItems(item: AllTypes) {
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
        if (item instanceof ElementBase)
          renderer.layout(item);
      });
    });
    changedItems.forEach(item => {
      layout(item, item => {
        if (item instanceof Wire)
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
          changedTopLevelStates = this.changedTopLevelFunctioncharts;
    renderer.begin(ctx);
    // Update any changed items first.
    this.updateLayout();
    // Then update the bounds of super states, bottom up.
    changedTopLevelStates.forEach(
      state => context.reverseVisitAll(state, item => {
        if (!(item instanceof Wire))
          renderer.layout(item);
    }));
    // Finally update the root functionchart's bounds.
    renderer.layoutFunctionchart(functionchart);
    renderer.end();
    changedTopLevelStates.clear();
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
          context = this.context;
    if (canvasController === this.canvasController) {
      // Draw a dashed border around the canvas.
      const ctx = canvasController.getCtx(),
            size = canvasController.getSize();
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
        const item = hoverHitInfo.item,
              propertyInfo = this.propertyInfo.get(item.template.typeName),
              nameValuePairs = [];
        if (propertyInfo) {
          for (let info of propertyInfo) {
            const name = info.label,
                  value = info.getter(info, item);
            if (value !== undefined) {
              nameValuePairs.push({ name, value });
            }
          }
          renderer.drawHoverText(hoverHitInfo.item, this.hoverPoint, nameValuePairs);
        }
      }
      renderer.end();
    } else if (canvasController === this.paletteController) {
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
    const renderer = this.renderer,
          context = this.context,
          functionchart = this.functionchart,
          canvasController = this.canvasController;

    // Calculate document bounds.
    const items: AllTypes[] = new Array();
    context.visitAll(functionchart, function (item) {
      items.push(item);
    });

    const bounds = renderer.getBounds(items);
    // Adjust all edges 1 pixel out.
    const ctx = new (window as any).C2S(bounds.width + 2, bounds.height + 2);
    ctx.translate(-bounds.x + 1, -bounds.y + 1);

    renderer.begin(ctx);
    canvasController.applyTransform();

    // Don't draw the root functionchart.
    functionchart.nonWires.forEach(item => {
      context.visitNonWires(item, item => { renderer.draw(item, RenderMode.Print); });
    });
    // Draw wires after elements.
    context.visitWires(functionchart, wire => {
      renderer.drawWire(wire, RenderMode.Print);
    });

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
    // Hit test transitions first.
    context.reverseVisitWires(functionchart, (wire: Wire) => {
      pushInfo(renderer.hitTestWire(wire, cp, tol, RenderMode.Normal));
    });
    // Skip the root functionchart, as hits there should go to the underlying canvas controller.
    functionchart.nonWires.forEachReverse(item => {
      context.reverseVisitNonWires(item, (item: NonWireTypes) => {
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
        (pointerHitInfo.input >= 0 || pointerHitInfo.output >= 0))) {
      const element = (dragItem as Element),
            cp0 = this.getCanvasPosition(canvasController, p0);
      if (pointerHitInfo.input >= 0) {
        newWire = context.newWire(undefined, -1, element, pointerHitInfo.input);
        newWire.pSrc = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
        drag = new WireDrag(newWire, 'connectWireSrc', 'Add new wire');
      } else if (pointerHitInfo.output >= 0) {
        newWire = context.newWire(element, pointerHitInfo.output, undefined, -1);
        newWire.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
        drag = new WireDrag(newWire, 'connectWireDst', 'Add new wire');
      }
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
          drag = new NonWireDrag(context.selectedAllElements(), 'moveCopySelection', 'Move copy of selection');
        } else {
          if (pointerHitInfo instanceof FunctionchartHitResult) {
            if (pointerHitInfo.inner.border) {
              drag = new NonWireDrag([pointerHitInfo.item], 'resizeFunctionchart', 'Resize functionchart');
            } else if (pointerHitInfo.instancer) {
              drag = new NonWireDrag([pointerHitInfo.item], 'instantiateFunctionchart', 'Create new instance of functionchart');
            } else {
              drag = new NonWireDrag(context.selectedAllElements(), 'moveSelection', 'Move selection');
            }
          } else {
            drag = new NonWireDrag(context.selectedAllElements(), 'moveSelection', 'Move selection');
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
              copies = copyItems(drag.items, context) as NonWireTypes[];
        copies.forEach(copy => {
          if (!(copy instanceof Wire)) {
            copy.x -= offset.x;
            copy.y -= offset.y;
          }
        });
        drag.items = copies;
      } else if (drag.kind == 'moveCopySelection') {
        const copies = context.copy() as NonWireTypes[];  // TODO fix
        drag.items = copies;
      } else if  (drag.kind === 'instantiateFunctionchart') {
        const functionchart = drag.items[0] as Functionchart,
              newInstance = context.newFunctionInstance(),
              renderer = this.renderer,
              bounds = renderer.getItemRect(functionchart),
              instancerBounds = this.renderer.getFunctionchartInstanceBounds(functionchart.type,
                bounds);  // TODO simplify this
        newInstance.functionchart = functionchart;
        newInstance.x = instancerBounds.x;
        newInstance.y = instancerBounds.y;
        drag.items = [newInstance];
      }

      context.transactionManager.beginTransaction(drag.description);
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
          transactionManager = context.transactionManager,
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
            const oldX = transactionManager.getOldValue(item, 'x'),
                  oldY = transactionManager.getOldValue(item, 'y');
            item.x = oldX + dx;
            item.y = oldY + dy;
          });
          break;
        }
        case 'resizeFunctionchart': {
          const hitInfo = pointerHitInfo as ElementHitResult,
                item = drag.items[0] as Functionchart,
                oldX = transactionManager.getOldValue(item, 'x'),
                oldY = transactionManager.getOldValue(item, 'y'),
                oldWidth =  transactionManager.getOldValue(item, 'width'),
                oldHeight =  transactionManager.getOldValue(item, 'height');
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
                dstPin = wire.dstPin,
                hitInfo = this.getFirstHit(hitList, isElementOutputPin) as ElementHitResult,
                src = hitInfo ? hitInfo.item as ElementTypes : undefined;
          if (src && dst && src !== dst) {
            wire.src = src;
            wire.srcPin = hitInfo.output;
          } else {
            wire.src = undefined;  // This notifies observers to update the layout.
            wire.pSrc = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
          }
          break;
        }
        case 'connectWireDst': {
          const src = wire.src,
                hitInfo = this.getFirstHit(hitList, isElementInputPin) as ElementHitResult,
                dst = hitInfo ? hitInfo.item as ElementTypes : undefined;
          if (src && dst && src !== dst) {
            wire.dst = dst;
            wire.dstPin = hitInfo.input;
          } else {
            wire.dst = undefined;  // This notifies observers to update the layout.
            wire.pDst = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
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
          transactionManager = context.transactionManager,
          p = canvasController.getCurrentPointerPosition(),
          cp = this.getCanvasPosition(canvasController, p);
    if (drag instanceof WireDrag) {
      drag.wire.pSrc = drag.wire.pDst = undefined;
    } else if (drag instanceof NonWireDrag &&
              (drag.kind == 'copyPalette' || drag.kind === 'moveSelection' ||
               drag.kind === 'moveCopySelection' || drag.kind === 'instantiateFunctionchart')) {
      // Find element or functionchart beneath mouse.
      const hitList = this.hitTestCanvas(cp),
            hitInfo = this.getFirstHit(hitList, isDropTarget),
            lastSelected = selection.lastSelected;
      if (hitInfo instanceof ElementHitResult && lastSelected instanceof ElementBase &&
          lastSelected.type.canConnectTo(hitInfo.item.type)) {
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

    transactionManager.endTransaction();

    this.setPropertyGrid();

    this.dragInfo = undefined;
    this.pointerHitInfo = undefined;
    this.draggableHitInfo = undefined;
    this.hotTrackInfo = undefined;

    this.canvasController.draw();
  }
  onKeyDown(e: KeyboardEvent) {
    const self = this,
          context = this.context,
          functionchart = this.functionchart,
          selection = context.selection,
          transactionManager = context.transactionManager,
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
          this.scrap = context.cut()
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
          context.selection.set(context.selectedNonWires());
          context.selectInteriorWires();
          context.reduceSelection();
          context.beginTransaction('group items into functionchart');
          const theme = this.theme,
                bounds = this.renderer.getBounds(context.selectedNonWires()),
                contents = context.selectionContents();
          let parent = context.getContainingFunctionchart(contents);
          expandRect(bounds, theme.radius, theme.radius);
          context.group(context.selectionContents(), parent, bounds);
          context.endTransaction();
        }
        case 69: { // 'e'
          context.selectConnectedElements((wire) => true, (wire) => true);  // TODO more nuanced connecting.
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
          function inputToPoint(element: Element, pin: number) {
            return renderer.pinToPoint(element, pin, true);
          };
          function outputToPoint(element: Element, pin: number) {
            return renderer.pinToPoint(element, pin, false);
          };
          context.beginTransaction('complete elements');
          context.completeElements(context.selectedElements(), inputToPoint, outputToPoint);
          renderer.end();
          context.endTransaction();
          return true;
        }
        case 75: { // 'k'
          context.beginTransaction('export elements');
          context.exportElements(context.selectedElements());
          context.endTransaction();
          return true;
        }
        case 76: // 'l'
          context.beginTransaction('open elements');
          context.openElements(context.selectedElements());
          context.endTransaction();
          return true;
        case 78: { // ctrl 'n'   // Can't intercept cmd n.
          const context = new FunctionchartContext();
          self.initializeContext(context);
          self.setContext(context);
          self.renderer.begin(self.canvasController.getCtx());
          self.updateBounds();
          self.canvasController.draw();
          return true;
        }
        case 79: { // 'o'
          function parse(text: string) {
            const raw = JSON.parse(text),
                  context = new FunctionchartContext();
            const functionchart = Deserialize(raw, context) as Functionchart;
            context.root = functionchart;
            self.initializeContext(context);
            self.setContext(context);
            self.renderer.begin(self.canvasController.getCtx());
            self.updateBounds();
            self.canvasController.draw();
          }
          this.fileController.openFile().then(result => parse(result));
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
