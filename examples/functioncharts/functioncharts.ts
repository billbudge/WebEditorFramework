import { SelectionSet } from '../../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, inFlagPath, outFlagPath, measureNameValuePairs,
         CanvasController, CanvasLayer, PropertyGridController, PropertyInfo,
         FileController } from '../../src/diagrams.js'

import { PointWithNormal, getExtents, projectPointToCircle, BezierCurve,
         evaluateBezier, CurveHitResult } from '../../src/geometry.js'

import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, Change, ChangeEvents,
         copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet,
         reduceToRoots, List, TransactionManager, HistoryManager, ScalarPropertyTypes,
         ArrayPropertyTypes } from '../../src/dataModels.js'

// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

//------------------------------------------------------------------------------

// Parse type strings into type objects.

export class Pin {
  typeString: string;
  name?: string;
  type?: Type;
  y = 0;
  width = 0;
  height = 0;
  baseline = 0;
  constructor(typeString: string, name?: string, type?: Type) {  // TODO type for 'v' and '*'.
    this.typeString = typeString;
    this.name = name;
    this.type = type;
  }
}

export class Type {
  typeString: string;
  inputs: Pin[];
  outputs: Pin[];
  name?: string;
  x = 0;
  y = 0;
  width = 0;
  height = 0;

  get needsLayout() {
    return this.width === 0;
  }
  constructor(typeString: string, inputs: Pin[], outputs: Pin[], name?: string) {
    this.typeString = typeString;
    this.inputs = inputs;
    this.outputs = outputs;
    this.name = name;
  }
}

export class TypeParser {
  private readonly map_ = new Map<string, Type>();

  get(s: string) : Type | undefined {
    return this.map_.get(s);
  }
  has(s: string) {
    return this.map_.has(s);
  }

  private addType(s: string, type: Type) {
    let result = this.map_.get(s);
    if (!result) {
      this.map_.set(s, type);
      result = type;
    }
    return result;
  }

  add(s: string) : Type {
    let type = this.map_.get(s);
    if (type)
      return type;

    const self = this;

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
      if (s[j] === 'v') {
        j++;
        return new Pin('v', parseName());
      }
      // wildcard types
      if (s[j] === '*') {
        j++;
        return new Pin('*', parseName());
      }
      // function types
      let type = parseFunction(),
          typeString = s.substring(i, j);
      // Add the pin type, without label.
      type = self.addType(typeString, type);
      return new Pin(typeString, parseName(), type);
    }
    function parseFunction() : Type {
      let i = j;
      if (s[j] === '[') {
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
        let type = new Type(typeString, inputs, outputs);
        type = self.addType(typeString, type);
        return type;
      }
      throw new Error('Invalid type string: ' + s);
    }

    type = parseFunction();
    if (type) {
      const name = parseName();
      if (name) {
        // The top level function type includes the label, so duplicate
        // type and pins.
        const inputs = type.inputs.map(pin => new Pin(pin.typeString, pin.name, pin.type)),
              outputs = type.outputs.map(pin => new Pin(pin.typeString, pin.name, pin.type));
        type = new Type(s, inputs, outputs, name);
      }
      type = this.addType(s, type);
    }
    return type;
  }

  getLabel(typeString: string) : string {
    if (typeString[typeString.length - 1] === ')') {
      const i = typeString.lastIndexOf('(');
      if (i > 0) {
        return typeString.substring(i + 1, typeString.length - 1);
      }
    }
    return '';
  }
  addLabel(typeString: string, label: string | undefined) : string {
    if (label === undefined || label === '')
      return typeString;
    const i = typeString.lastIndexOf(']');
    return typeString.substring(0, i + 1) + '(' + label + ')';
  }

  // Removes any trailing label.
  trimTypeString(typeString: string) : string {
    if (typeString[typeString.length - 1] === ')')
      typeString = typeString.substring(0, typeString.lastIndexOf('('));
    return typeString;
  }
  // Removes all labels from type string.
  getUnlabeledTypeString(typeString: string) : string {
    let result = '', label = 0;
    while (true) {
      label = typeString.indexOf('(');
      if (label <= 0)
        break;
      result += typeString.substring(0, label);
      label = typeString.indexOf(')', label);
      if (label <= 0)
        break;
      typeString = typeString.substring(label + 1, typeString.length);
    }
    return result + typeString;
  }

  splitTypeString(typeString: string) : number {
    let j = 0, level = 0;
    while (true) {
      if (typeString[j] === '[')
        level++;
      else if (typeString[j] === ']')
        level--;
      else if (typeString[j] === ',')
        if (level === 1) return j;
      j++;
    }
  }
  hasOutput(typeString: string) {
    return !typeString.endsWith(',]');
  }

  addInputToTypeString(typeString: string, inputType: string) : string {
    let i = this.splitTypeString(typeString);
    return typeString.substring(0, i) + inputType + typeString.substring(i);
  }

  addOutputToTypeString(type: string, outputType: string) : string {
    let i = type.lastIndexOf(']');
    return type.substring(0, i) + outputType + type.substring(i);
  }
}

const globalTypeParser_ = new TypeParser(),
      nullFunction = globalTypeParser_.add('[,]');

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
      functionchartProp = new ReferenceProp('functionchart');

class NonWireTemplate {
  readonly id = idProp;
  readonly x = xProp;
  readonly y = yProp;
}

export type ElementType = 'binop' | 'unop' | 'element';

class ElementTemplate extends NonWireTemplate {
  readonly typeName: ElementType;
  readonly name = nameProp;
  readonly typeString = typeStringProp;
  readonly properties = [this.id, this.x, this.y, this.name, this.typeString];
  constructor(typeName: ElementType) {
    super();
    this.typeName = typeName;
  }
}

export type PseudoelementType = 'input' | 'output' | 'literal';

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
  readonly typeString = typeStringProp;
  readonly nonWires = nonWiresProp;
  readonly wires = wiresProp;
  readonly properties = [this.id, this.x, this.y, this.width, this.height, this.name,
                         this.typeString, this.nonWires, this.wires];
}

class FunctionInstanceTemplate extends NonWireTemplate {
  readonly typeName = 'instance';
  readonly functionchart = functionchartProp;
  readonly properties = [this.id, this.x, this.y, this.functionchart];
}

const binopTemplate = new ElementTemplate('binop'),
      unopTemplate = new ElementTemplate('unop'),
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

class ElementBase {
  readonly id: number;

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = nullFunction;
  inWires = new Array<Wire | undefined>(0);   // one input per pin.
  outWires = new Array<Array<Wire>>(0);       // array of outputs per pin, outputs have fan out.

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
  get typeString() : string { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  get nonWires() { return this.template.nonWires.get(this) as List<NonWireTypes>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = nullFunction;

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
  get functionchart() { return this.template.functionchart.get(this) as Functionchart | undefined; }
  set functionchart(value: Functionchart | undefined) { this.template.functionchart.set(this, value); }

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
  private readonly referentMap = new Map<number, ElementTypes>();

  private functionchart: Functionchart;  // The root functionchart.
  private elements = new Set<ElementTypes>;
  private functioncharts = new Set<Functionchart>;
  private wires = new Set<Wire>;

  readonly transactionManager: TransactionManager;
  readonly historyManager: HistoryManager;

  selection = new SelectionSet<AllTypes>();

  constructor() {
    super();
    const self = this;
    this.transactionManager = new TransactionManager();
    this.addHandler('changed',
        this.transactionManager.onChanged.bind(this.transactionManager));
    this.transactionManager.addHandler('transactionEnding', () => {
      self.makeConsistent();
      if (!self.isValidFunctionchart(self.functionchart)) {
        self.transactionManager.cancelTransaction();
      }
    });
    this.historyManager = new HistoryManager(this.transactionManager, this.selection);
    const root = new Functionchart(this, this.highestId++);
    this.functionchart = root;
    this.insertFunctionchart(root, undefined);
  }

  root() : Functionchart {
    return this.functionchart;
  }
  setRoot(root: Functionchart) : void {
    if (this.functionchart) {
      // This removes all elements, functioncharts, and wires.
      this.removeItem(this.functionchart);
    }
    this.functionchart = root;
    this.insertFunctionchart(root, undefined);
  }

  newElement(typeName: ElementType) : Element {
    const nextId = ++this.highestId;
    let template: ElementTemplate,
        typeString: string;
    switch (typeName) {
      case 'binop':
        template = binopTemplate;
        typeString = '[vv,v]'
        break;
      case 'unop':
        template = unopTemplate;
        typeString = '[v,v]'
        break;
      case 'element':
        template = elementTemplate;
        typeString = '[,]'
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
    return new Functionchart(this, nextId);
  }

  newFunctionInstance() : FunctionInstance {
    const nextId = ++this.highestId;
    return new FunctionInstance(this, nextId);
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

  getGrandParent(item: AllTypes) : AllTypes | undefined {
    let result = item.parent;
    if (result)
      result = result.parent;
    return result;
  }

  forInWires(element: ElementTypes, visitor: WireVisitor) {
    const inputs = element.inWires;
    if (!inputs)
      return;
    inputs.forEach(wire => {
      if (wire)
      visitor(wire);
    });
  }

  forOutWires(element: ElementTypes, visitor: WireVisitor) {
    const outputs = element.outWires;
    if (!outputs)
      return;
    outputs.forEach((wires: Wire[]) => {
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
      elements: ElementTypes[], upstream: boolean, downstream: boolean) : Set<ElementTypes> {
    const result = new Set<ElementTypes>();
    elements = elements.slice(0);  // Copy input array
    while (elements.length > 0) {
      const element = elements.pop()!;

      result.add(element);
      if (upstream) {
        this.forInWires(element, wire => {
          const src = wire.src!;
          if (!result.has(src))
            elements.push(src);
        });
      }
      if (downstream) {
        this.forOutWires(element, wire => {
          const dst = wire.dst!;
          if (!result.has(dst))
            elements.push(dst);
        });
      }
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

  deleteItem(item: AllTypes) {
    if (item.parent) {
      if (item instanceof Wire) {
        item.parent.wires.remove(item);
      } else {
        item.parent.nonWires.remove(item);
      }
    }
    this.selection.delete(item);
  }

  deleteItems(items: AllTypes[]) {
    const self = this;
    items.forEach(item => self.deleteItem(item));
  }

  select(item: AllTypes) {
    this.selection.add(item);
  }

  selectionContents() : AllTypes[] {
    return this.selection.contents();
  }

  selectedElements() : Element[] {
    const result = new Array<Element>();
    this.selection.forEach(item => {
      if (item instanceof Element)
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

  selectInteriorWires() {
    const self = this,
          graphInfo = this.getSubgraphInfo(this.selectedAllElements());
    graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
  }

  selectConnectedElements(upstream: boolean) {
    const selectedElements = this.selectedAllElements(),
          connectedElements = this.getConnectedElements(selectedElements, upstream, true);
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
    const copies = copyItems(items, this) as AllTypes[];  // TODO fix
    this.addItems(copies, this.functionchart);
    this.selection.set(copies);
    this.transactionManager.endTransaction();
    return copies;
  }

  cut() : AllTypes[] {
    this.transactionManager.beginTransaction('cut');
    const result = this.copy();
    this.deleteItems(this.selection.contents());
    this.transactionManager.endTransaction();
    return result;
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
    const self = this;
    // Add junctions for disconnected pins on elements.
    elements.forEach(element => {
      const inputs = element.inWires,
            outputs = element.outWires;
      for (let pin = 0; pin < inputs.length; pin++) {
        if (inputs[pin] === undefined)
          self.connectInput(element, pin, inputToPoint);
      }
      for (let pin = 0; pin < outputs.length; pin++) {
        if (outputs[pin].length === 0)
          self.connectOutput(element, pin, outputToPoint);
      }
    });
  }

  isValidWire(wire: Wire) {
    const src = wire.src,
          dst = wire.dst;
    if (!src || !dst)
      return false;
    if (src === dst)
      return false;
    // TODO Cycle detection.
    return true;
  }

  topologicalSort(graphInfo: GraphInfo) {
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
    graphInfo.elements.forEach(element => {
      if (!visited.has(element) && !visiting.has(element))
        visit(element);
    });
    return sorted;
  }
  isValidFunctionchart(functionchart: Functionchart) {
    const self = this,
          invalidWires = new Array<Wire>(),
          graphInfo = this.getSubgraphInfo(functionchart.nonWires.asArray());
    // Check wires.
    graphInfo.wires.forEach(wire => {
      if (!self.isValidWire(wire))
        invalidWires.push(wire);
    });
    if (invalidWires.length > 0)
      return false;
    // Check for cycles using topological sort.
    const sorted = this.topologicalSort(graphInfo);
    return sorted.length === graphInfo.elements.size;
  }

  makeConsistent() {
    const self = this,
          functionchart = this.functionchart,
          graphInfo = this.getGraphInfo();
    // Eliminate dangling wires.
    graphInfo.wires.forEach(wire => {
      const src = wire.src,
            dst = wire.dst;
      if (!src || !graphInfo.elements.has(src) ||
          !dst || !graphInfo.elements.has(dst)) {
        self.deleteItem(wire);
        return;
      }
      // Make sure wires between elements are in lowest common parent functionchart.
      const srcParent = src.parent!,
            dstParent = dst.parent!,
            lca: Functionchart = getLowestCommonAncestor<AllTypes>(srcParent, dstParent) as Functionchart;
      if (wire.parent !== lca) {
        self.deleteItem(wire);
        self.addItem(wire, lca);
      }
    });
    // Update pseudoelement and functionchart types.
    this.reverseVisitNonWires(this.functionchart, item => {
      // Update types of inputs and outputs.
      if (item instanceof Pseudoelement) {
        const label = globalTypeParser_.getLabel(item.typeString);
        if (item.template.typeName === 'input' || item.template.typeName === 'literal') {
          const typeString = self.getInputTypeString(item),
                newTypeString = globalTypeParser_.addLabel('[,' + typeString + ']', label);
          if (typeString !== newTypeString)
            item.typeString = newTypeString;
        } else if(item.template.typeName === 'output') {
          const typeString = self.getOutputTypeString(item);
          item.typeString = globalTypeParser_.addLabel('[' + typeString + ',]', label);
        }
      } else if (item instanceof Functionchart) {
        const typeString = self.getFunctionchartTypeString(item);
        item.typeString = typeString;
      }
    });
    // // Delete any empty functioncharts (except for the root functionchart).
    // graphInfo.functioncharts.forEach(functionchart => {
    //   if (functionchart.parent &&
    //       functionchart.nonWires.length === 0)
    //     self.deleteItem(functionchart);
    // });
  }

  replaceElement(element: ElementTypes, newElement: ElementTypes) {
    const self = this,
          type = element.type,
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

    // Update all incoming and outgoing wires if possible, otherwise they
    // will be deleted as dangling wires by makeConsistent.
    const srcChange = new Array<Wire>(), dstChange = new Array<Wire>();
    function canRewire(index: number, pins: Pin[], newPins: Pin[]) {
      if (index >= newPins.length)
        return false;
      const type = globalTypeParser_.trimTypeString(pins[index].typeString),
            newType = globalTypeParser_.trimTypeString(newPins[index].typeString);
      return type === '*' || type === newType;
    }
    this.forInWires(element, wire => {
      if (canRewire(wire.dstPin, type.inputs, newType.inputs)) {
        dstChange.push(wire);
      }
    });
    this.forOutWires(element, wire => {
      if (canRewire(wire.srcPin, type.outputs, newType.outputs)) {
        srcChange.push(wire);
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

  exportElement(element: Element) {
    const result = this.newElement('element');
    result.typeString = '[,' + element.typeString + ']';
    return result;
  }

  exportElements(elements: Element[]) {
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

  openElement(element: Element) {
    const typeString = element.typeString,
          j = globalTypeParser_.splitTypeString(typeString);
    const result = this.newElement('element');
    result.typeString =
      typeString.substring(0, j - 1) + typeString + typeString.substring(j);
    return result;
  }

  openElements(elements: Element[]) {
    const self = this,
          selection = this.selection;

    // Open each non-input/output element.
    elements.forEach(element => {
      selection.delete(element);
      const newElement = self.openElement(element);
      self.replaceElement(element, newElement);
      selection.add(newElement);
    });
  }

  getInputTypeString(input: Pseudoelement) {
    let result = '*';
    const outWires = input.outWires[0];
    if (outWires.length > 0) {
      const wire = outWires[0];  // Take the first output wire.
      result = wire.dst!.type.inputs[wire.dstPin].typeString;
    }
    return result;
  }

  getOutputTypeString(output: Pseudoelement) {
    let result = '*';
    const wire = output.inWires[0];
    if (wire !== undefined) {
      result = wire.src!.type.outputs[wire.srcPin].typeString;
    }
    return result;
  }

  getFunctionchartTypeString(functionChart: Functionchart) {
    const self = this,
          nonWires = functionChart.nonWires.asArray(),
          // graphInfo = this.getSubgraphInfo(nonWires),
          inputs = new Array<Pseudoelement>(),
          outputs = new Array<Pseudoelement>(),
          typeString = functionChart.typeString,
          label = typeString ? globalTypeParser_.getLabel(typeString) : undefined;

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
    function compareJunctions(p1: Pseudoelement, p2: Pseudoelement) {
      return p1.y - p2.y;
    }

    inputs.sort(compareJunctions);
    outputs.sort(compareJunctions);

    function getPinTypeString(pin: Pin) : string {
      let typeString = pin.typeString;
      if (pin.name)
        typeString += '(' + pin.name + ')';
      return typeString;
    }

    let result = '[';
    inputs.forEach(input => {
      if (input.type)
        result += getPinTypeString(input.type.outputs[0]);
    });
    result += ',';
    outputs.forEach(output => {
      if (output.type)
        result += getPinTypeString(output.type.inputs[0]);
    });
    result += ']';
    result = globalTypeParser_.addLabel(result, label);  // preserve label

    // contextInputs.sort(comparePins);

    // let contextTypeString = '[';
    // contextInputs.forEach(function(input, i) {
    //   contextTypeString += input.type;
    //   input.item.index = i;
    // });
    // contextTypeString += ',]';  // no outputs

    // const info = {
    //   type: typeString,
    //   contextType: contextTypeString,
    // }

    // // Compute group pass throughs.
    // const passThroughs = new Set();
    // graphInfo.interiorWires.forEach(function(wire) {
    //   let src = self.getWireSrc(wire),
    //       srcPin = getType(src).outputs[wire.srcPin];
    //   // Trace wires, starting at input junctions.
    //   if (!isInput(src) || srcPin.type !== '*')
    //     return;
    //   let srcPinIndex = src.index,
    //       activeWires = [wire];
    //   while (activeWires.length) {
    //     wire = activeWires.pop();
    //     let dst = self.getWireDst(wire),
    //         dstPin = getType(dst).inputs[wire.dstPin];
    //     if (isOutput(dst) && dstPin.type === '*') {
    //       passThroughs.add([srcPinIndex, dst.index]);
    //     } else if (dst.passThroughs) {
    //       dst.passThroughs.forEach(function(passThrough) {
    //         if (passThrough[0] === wire.dstPin) {
    //           let outgoingWires = functionChartModel.getOutputs(dst)[passThrough[1]];
    //           outgoingWires.forEach(wire => activeWires.push(wire));
    //         }
    //       });
    //     }
    //   }
    // });

    // if (passThroughs.size) {
    //   // console.log(passThroughs);
    //   info.passThroughs = Array.from(passThroughs);
    // }
    return result;
  }

  private updateItem(item: AllTypes) {
    const self = this;
    if (item instanceof Wire)
      return;

    // Update 'type' property.
    if (!(item instanceof FunctionInstance)) {
      const typeString = item.typeString;
      if (typeString && typeString !== item.type.typeString) {
        const newType = globalTypeParser_.add(item.typeString);
        item.type = newType;
      }
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
  }

  private removeElement(element: ElementTypes) {
    this.elements.delete(element);
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

    const src = wire.src,
          srcPin = wire.srcPin,
          dst = wire.dst,
          dstPin = wire.dstPin;
    if (src && srcPin >= 0) {
      const outputs = src.outWires[srcPin];
      if (!outputs.includes(wire))
        outputs.push(wire);
    }
    if (dst && dstPin >= 0) {
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
  resolveReference(owner: AllTypes, prop: ReferenceProp) : ElementTypes | undefined {
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
      case 'element': return this.newElement('element');
      case 'input': return this.newPseudoelement('input');
      case 'output': return this.newPseudoelement('output');
      case 'literal': return this.newPseudoelement('literal');
      case 'wire': return this.newWire(undefined, -1, undefined, -1);
      case 'functionchart': return this.newFunctionchart();
      case 'functioninstance': return this.newFunctionInstance();
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
  }
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
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
    const theme = this.theme;
    if (pin.typeString === 'v' || pin.typeString === '*') {
      pin.width = pin.height = 2 * theme.knobbyRadius;
    } else if (pin.type) {
      pin.width = pin.type.width;
      pin.height = pin.type.height;
    }
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

  // Make sure a group is big enough to enclose its contents.  // TODO Functionchart concept
  layoutFunctionchart(functionchart: Functionchart) {
    const self = this,
          spacing = this.theme.spacing;
    function layout(functionChart: Functionchart) {
      const nonWires = functionChart.nonWires;
      let width, height;
      if (nonWires.length === 0) {
        width = self.theme.minFunctionchartWidth;
        height = self.theme.minFunctionchartHeight;
      } else {
        const extents = self.getBounds(nonWires.asArray()),
              global = functionChart.globalPosition,
              groupX = global.x,
              groupY = global.y,
              margin = 2 * spacing,
              type = functionChart.type;
        width = extents.x + extents.width - groupX + margin;
        height = extents.y + extents.height - groupY + margin;
        if (type.needsLayout)
          self.layoutType(type);
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
    if (pin.typeString === 'v' || pin.typeString === '*') {
      const r = theme.knobbyRadius;
      ctx.beginPath();
      if (pin.typeString === 'v') {
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
      case RenderMode.Print:
        ctx.fillStyle = /*element.state === 'palette' ? theme.altBgColor :*/ theme.bgColor;
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

  drawElementPin(element: ElementTypes, input: number, output: number, mode: RenderMode) {
    const theme = this.theme,
          ctx = this.ctx,
          rect = this.getItemRect(element),
          type = element.type;
    let x = rect.x, y = rect.y, w = rect.width, h = rect.height,
        right = x + w,
        pin: Pin;

    if (input >= 0) {
      pin = type.inputs[input];
    } else if (output >= 0) {
      pin = type.outputs[output];
      x = right - pin.width;
    }
    ctx.beginPath();
    ctx.rect(x, y + pin!.y, pin!.width, pin!.height);

    switch (mode) {
      case RenderMode.Normal:
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

  drawFunctionchart(functionchart: Functionchart, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(functionchart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          textSize = theme.fontSize,
          lineBase = y + textSize + theme.textLeading;
    roundRectPath(x, y, w, h, r, ctx);
    switch (mode) {
      case RenderMode.Normal:
      case RenderMode.Print:
        ctx.fillStyle = theme.bgColor;
        ctx.fill();
        ctx.strokeStyle = theme.strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, lineBase);
        ctx.lineTo(x + w, lineBase);
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
  return (hitInfo instanceof FunctionchartHitResult || hitInfo instanceof ElementHitResult) &&
          !selection.has(item) && !ancestorInSet(item, selection);
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
  type: NonWireDragType;
  description: string;
  constructor(items: NonWireTypes[], type: NonWireDragType, description: string) {
    this.items = items;
    this.type = type;
    this.description = description;
  }
}

type WireDragType = 'connectWireSrc' | 'connectWireDst';
class WireDrag {
  wire: Wire;
  type: WireDragType;
  description: string;
  constructor(transition: Wire, type: WireDragType, description: string) {
    this.wire = transition;
    this.type = type;
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
  private moveCopy: boolean = false;
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
          newFunctionchart = context.newFunctionchart();

    context.setRoot(functionchart);

    input.x = input.y = 8;
    output.x = 40; output.y = 8;
    literal.x = 72; literal.y = 8;
    newBinop.x = 8; newBinop.y = 32;
    newBinop.typeString = '[vv,v](+)';  // binary addition
    newUnop.x = 72; newUnop.y = 32;
    newUnop.typeString = '[v,v](-)';    // unary negation
    newFunctionchart.x = 8; newFunctionchart.y = 80;
    newFunctionchart.width = this.theme.minFunctionchartWidth;
    newFunctionchart.height = this.theme.minFunctionchartHeight;

    functionchart.nonWires.append(input);
    functionchart.nonWires.append(output);
    functionchart.nonWires.append(literal);
    functionchart.nonWires.append(newBinop);
    functionchart.nonWires.append(newUnop);
    functionchart.nonWires.append(newFunctionchart);
    context.setRoot(functionchart);
    this.palette = functionchart;

    // Default Functionchart.
    this.context = new FunctionchartContext();
    this.initializeContext(this.context);
    this.functionchart = this.context.root();

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
    function elementLabelGetter(info: ItemInfo, item: AllTypes) {
      const typeString = getter(info, item);
      if (typeString)
        return globalTypeParser_.getLabel(typeString);
      return '';
    }
    function elementLabelSetter(info: ItemInfo, item: AllTypes, value: any) {
      const typeString = getter(info, item);
      let newValue;
      if (value === undefined) {
        newValue = globalTypeParser_.getUnlabeledTypeString(typeString);
      } else {
        switch (item.template.typeName) {
          case 'input':       // [,v(label)]
            newValue = '[,*(' + value + ')]';
            break;
          case 'output':      // [v(label),]
            newValue = '[*(' + value + '),]';
            break;
          case 'literal':     // [,v(label)]
            newValue = '[,v(' + value + ')]';
            break;
          case 'binop':       // [vv,v](label)
            newValue = globalTypeParser_.addLabel(typeString, value);
            break;
          case 'unop':       // [v,v](label)
            newValue = globalTypeParser_.addLabel(typeString, value);
            break;
          case 'functionchart':       // [...](label)
            newValue = globalTypeParser_.addLabel(typeString, value);
            break
        }
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
        label: 'label',
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
        label: 'label',
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
        getter: elementLabelGetter,
        setter: elementLabelSetter,
        prop: typeStringProp,
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
    const functionchart = context.root(),
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
      this.palette.nonWires.forEach(item => { renderer.draw(item, RenderMode.Print); });
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
      pushInfo(renderer.hitTest(item, p, tol, RenderMode.Normal));
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
          item = context.selection.lastSelected(),
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
        this.moveCopy = true;
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
          this.clickInPalette = false;  // TODO fix
          drag = new NonWireDrag([pointerHitInfo.item], 'copyPalette', 'Create new element or functionchart');
        } else if (this.moveCopy) {
          this.moveCopy = false;  // TODO fix
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
      if (drag.type === 'moveSelection' || drag.type === 'moveCopySelection') {
        context.reduceSelection();
      }
      if (drag.type == 'copyPalette') {
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
      } else if (drag.type == 'moveCopySelection') {
        const copies = context.copy() as NonWireTypes[];  // TODO fix
        drag.items = copies;
      } else if  (drag.type === 'instantiateFunctionchart') {
        const functionchart = drag.items[0] as Functionchart,
              newInstance = context.newElement('element'),
              renderer = this.renderer,
              bounds = renderer.getItemRect(functionchart),
              instancerBounds = this.renderer.getFunctionchartInstanceBounds(functionchart.type,
                bounds);  // TODO simplify this
        newInstance.typeString = functionchart.typeString;
        newInstance.x = instancerBounds.x;
        newInstance.y = instancerBounds.y;
        drag.items = [newInstance];
      }

      context.transactionManager.beginTransaction(drag.description);
      if (newWire) {
        context.addItem(newWire, this.functionchart);
        selection.set(newWire);
      } else {
        if (drag.type == 'copyPalette' || drag.type == 'moveCopySelection' ||
            drag.type === 'instantiateFunctionchart') {
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
      switch (drag.type) {
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
      switch (drag.type) {
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
              (drag.type == 'copyPalette' || drag.type === 'moveSelection' ||
               drag.type === 'moveCopySelection' || drag.type === 'instantiateFunctionchart')) {
      // Find element or functionchart beneath mouse.
      const hitList = this.hitTestCanvas(cp),
            hitInfo = this.getFirstHit(hitList, isDropTarget);
      let parent: Functionchart = functionchart;
      if (hitInfo) {
        if (hitInfo.item instanceof Functionchart) {
          parent = hitInfo.item;
          // Reparent items
          selection.contents().forEach(item => {
            context.addItem(item, parent);
          });
        } else if (hitInfo instanceof ElementHitResult && drag.items[0] instanceof ElementBase) {
          context.replaceElement(hitInfo.item, drag.items[0] as ElementTypes);
        }
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
      transactionManager.beginTransaction('delete');
      context.reduceSelection();
      context.deleteItems(selection.contents());
      transactionManager.endTransaction();
      return true;
    }
    if (cmdKey) {
      switch (keyCode) {
        case 65: { // 'a'
          functionchart.nonWires.forEach(function (v) {  // TODO select functioncharts too
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
        case 69: { // 'e'
          context.selectConnectedElements(true);
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
            context.setRoot(functionchart);
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
/*


//------------------------------------------------------------------------------

const editingModel = (function() {
  const proto = {

    newGroup: function(x, y) {
      // Create the new group element.
      const result = {
        kind: 'group',
        x: x,
        y: y,
        items: [],
      };
      return this.newItem(result);
    },

    newGroupInstance: function(groupId, definitionId, type, x, y) {
      const result = this.newElement(type, x, y);
      result.groupId = groupId;
      result.definitionId = definitionId;
      return result;
    },




    getPinTypeWithName: function(pin) {
      let type = pin.type;
      if (pin.name)
        type += '(' + pin.name + ')';
      return type;
    },

    getLabel: function (item) {
      const type = getType(item);
      if (isInput(item) || isLiteral(item)) {
        return type.outputs[0].name;
      } else if (isOutput(item)) {
        return type.inputs[0].name;
      }
      return type.name;
    },

    setLabel: function (item, newText) {
      const label = newText ? '(' + newText + ')' : '',
            type = item.type;
      let result;
      if (isInputPinLabeled(item)) {
        const j = globalTypeParser_.splitType(type),
              prefix = type.substring(0, j),
              suffix = type.substring(j);
        result = globalTypeParser_.trimType(prefix) + label + suffix;
      } else if (isOutputPinLabeled(item)) {
        const prefix = type.substring(0, type.length - 1);
        result = globalTypeParser_.trimType(prefix) + label + ']';
      } else {
        result = globalTypeParser_.trimType(type) + label;
      }
      return result;
    },


    isInstanceOfGroup: function(element, group) {
      assert(isElement(element));
      // Recursive group instances aren't included in the signature.
      return isGroupInstance(element) &&
             element.groupId == this.model.dataModel.getId(group);
    },

    getGroupTypeInfo: function(items, group) {
      const self = this, model = this.model,
            dataModel = model.dataModel,
            functionChartModel = model.functionChartModel,
            graphInfo = model.functionChartModel.getSubgraphInfo(items),
            renderer = this.model.renderer,
            inputs = [], outputs = [],
            contextInputs = [];

      function makePin(item, type, y) {
        return { item: item, type: type, y: y }
      }

      function getInputType(input) {
        const srcPin = getType(input).outputs[0],
              srcType = self.getPinTypeWithName(srcPin),
              wires = functionChartModel.getOutputs(input)[0];
        if (!wires.length)
          return srcType;
        const label = srcType.substring(1);
        return self.findDstType(wires[0]) + label;
      }

      function getOutputType(output) {
        const dstPin = getType(output).inputs[0],
              dstType = self.getPinTypeWithName(dstPin),
              wire = functionChartModel.getInputs(output)[0];
        if (!wire)
          return dstType;
        const label = dstType.substring(1);
        return self.findSrcType(wire) + label;
      }

      // Add pins for inputs, outputs, and disconnected pins on elements.
      items.forEach(function(item, index) {
        if (isInput(item)) {
          const y = renderer.pinToPoint(item, 0, false).y,
                type = getInputType(item);
          if (globalTypeParser_.trimType(type) != '*')
            inputs.push(makePin(item, type, y));
        } else if (isOutput(item)) {
          const y = renderer.pinToPoint(item, 0, true).y,
                type = getOutputType(item);
          if (globalTypeParser_.trimType(type) != '*')
            outputs.push(makePin(item, type, y));
        } else if (isElement(item)) {
          // Recursive group instances aren't included in the signature.
          if (group && self.isInstanceOfGroup(item, group))
            return;
          const type = getType(item),
                inputWires = functionChartModel.getInputs(item),
                outputWires = functionChartModel.getOutputs(item);
          type.inputs.forEach(function(pin, i) {
            if (!inputWires[i]) {
              const y = renderer.pinToPoint(item, i, true).y;
              inputs.push(makePin(item, pin.type, y));
            }
          });
          type.outputs.forEach(function(pin, i) {
            if (outputWires[i].length == 0) {
              const y = renderer.pinToPoint(item, i, false).y;
              outputs.push(makePin(item, pin.type, y));
            }
          });
        }// else if (isGroup(item)) {
         // const y = renderer.getItemRect(item).y;
         // outputs.push(makePin(item, item.type, y));
        //}
      });

      // Incoming wires become part of the enclosing context type. Use the
      // output pin's y to order the pins.
      graphInfo.incomingWires.forEach(function(wire) {
        const src = self.getWireSrc(wire),
              srcPin = getType(src).outputs[wire.srcPin],
              y = renderer.pinToPoint(src, wire.srcPin, false).y;
        contextInputs.push(makePin(src, srcPin.type, y));
      });

      // Sort pins so we encounter them in increasing y-order. This lets us lay
      // out the group in an intuitively consistent way.
      function comparePins(pin1, pin2) {
        return pin1.y - pin2.y;
      }

      inputs.sort(comparePins);
      outputs.sort(comparePins);

      let typeString = '[';
      inputs.forEach(function(input, i) {
        typeString += input.type;
        input.item.index = i;
      });
      typeString += ',';
      outputs.forEach(function(output, i) {
        typeString += output.type;
        output.item.index = i;
      });
      typeString += ']';

      contextInputs.sort(comparePins);

      let contextTypeString = '[';
      contextInputs.forEach(function(input, i) {
        contextTypeString += input.type;
        input.item.index = i;
      });
      contextTypeString += ',]';  // no outputs

      const info = {
        type: typeString,
        contextType: contextTypeString,
      }

      // Compute group pass throughs.
      const passThroughs = new Set();
      graphInfo.interiorWires.forEach(function(wire) {
        let src = self.getWireSrc(wire),
            srcPin = getType(src).outputs[wire.srcPin];
        // Trace wires, starting at input junctions.
        if (!isInput(src) || srcPin.type !== '*')
          return;
        let srcPinIndex = src.index,
            activeWires = [wire];
        while (activeWires.length) {
          wire = activeWires.pop();
          let dst = self.getWireDst(wire),
              dstPin = getType(dst).inputs[wire.dstPin];
          if (isOutput(dst) && dstPin.type === '*') {
            passThroughs.add([srcPinIndex, dst.index]);
          } else if (dst.passThroughs) {
            dst.passThroughs.forEach(function(passThrough) {
              if (passThrough[0] === wire.dstPin) {
                let outgoingWires = functionChartModel.getOutputs(dst)[passThrough[1]];
                outgoingWires.forEach(wire => activeWires.push(wire));
              }
            });
          }
        }
      });

      if (passThroughs.size) {
        // console.log(passThroughs);
        info.passThroughs = Array.from(passThroughs);
      }
      // console.log(info.type, info.contextType);
      return info;
    },

    build: function(items, parent) {
      const self = this,
            model = this.model,
            graphInfo = model.functionChartModel.getSubgraphInfo(items),
            extents = model.renderer.getBounds(graphInfo.elementsAndGroups),
            spacing = this.theme.spacing,
            x = extents.x - spacing,
            y = extents.y - spacing;

      // Create the new group element.
      const group = this.newGroup(x, y);
      Object.assign(group, this.getGroupTypeInfo(items));

      // Add the group before reparenting the items.
      this.addItem(group, parent);
      items.forEach(function(item) {
        // Re-parent group items; wires should remain connected.
        self.addItem(item, group);
      });
      return group;
    },

    createGroupInstance: function(group, element) {
      const model = this.model,
            items = model.copyPasteModel.cloneItems(group.items, new Map()),
            newGroupItems = {
              id: 0,  // Temporary id, so deepEqual will match non-identically.
              kind: 'group items',
              items: items,
            };
      const groupItems = model.canonicalInstanceModel.internalize(newGroupItems);
      element.groupId = model.dataModel.getId(group);
      element.definitionId = model.dataModel.getId(groupItems);
    },

    findSrcType: function(wire) {
      const self = this,
            model = this.model,
            functionChartModel = model.functionChartModel,
            activeWires = [wire];
      // TODO eliminate array and while; there can be only one pass through.
      while (activeWires.length) {
        wire = activeWires.pop();
        let src = this.getWireSrc(wire),
            srcPin = getType(src).outputs[wire.srcPin],
            dst = this.getWireDst(wire),
            dstPin = getType(dst).inputs[wire.dstPin];
        if (srcPin.type !== '*')
          return srcPin.type;
        if (isGroupInstance(src)) {
          const group = this.getGroupDefinition_(src);
          if (group.passThroughs) {
            group.passThroughs.forEach(function(passThrough) {
              if (passThrough[1] === wire.srcPin) {
                srcPin = group.inputs[passThrough[0]];
                let incomingWire = functionChartModel.getInputs(src)[passThrough[0]];
                if (incomingWire)
                  activeWires.push(incomingWire);
              }
            });
          }
        }
      }
      return '*';
    },

    findDstType: function(wire) {
      const self = this,
            model = this.model,
            graphInfo = model.functionChartModel.getGraphInfo(),
            activeWires = [wire];
      while (activeWires.length) {
        wire = activeWires.pop();
        let src = this.getWireSrc(wire),
            dst = this.getWireDst(wire),
            srcPin = getType(src).outputs[wire.srcPin],
            dstPin = getType(dst).inputs[wire.dstPin];
        if (dstPin.type !== '*')
          return dstPin.type;
        if (isGroupInstance(dst)) {
          const group = this.getGroupDefinition_(src);
          if (group.passThroughs) {
            group.passThroughs.forEach(function(passThrough) {
              if (passThrough[0] === wire.dstPin) {
                dstPin = group.outputs[passThrough[1]];
                let outgoingWires = functionChartModel.getOutputs(dst)[passThrough[1]];
                outgoingWires.forEach(wire => activeWires.push(wire));
              }
            });
          }
        }
      }
      return '*';
    },


    doExport: function() {
      let transactionModel = this.model.transactionModel;
      this.reduceSelection();
      transactionModel.beginTransaction('export');
      this.exportElements(this.model.selectionModel.contents());
      transactionModel.endTransaction();
    },

    doAbstract: function() {
      let transactionModel = this.model.transactionModel;
      this.reduceSelection();
      transactionModel.beginTransaction('abstract');
      this.openElements(this.model.selectionModel.contents());
      transactionModel.endTransaction();
    },

    doBuild: function() {
      const self = this,
            model = this.model;
      this.reduceSelection();
      model.transactionModel.beginTransaction('build');
      const items = model.selectionModel.contents().filter(isElementOrGroup),
            parent = items.length === 1 ?
                null : model.hierarchicalModel.getLowestCommonAncestor(...items),
            group = this.build(items, parent);

      model.selectionModel.set(group);
      model.transactionModel.endTransaction();
    },

    doGroup: function() {
      // let model = this.model;
      // this.reduceSelection();
      // let groups = model.selectionModel.contents().filter(isGroup);
      // model.transactionModel.beginTransaction('group');
      // groups.forEach(function(group) {
      //   model.observableModel.changeValue(group, 'frozen', true);
      // });
      // model.transactionModel.endTransaction();
    },

    doTogglePalette: function() {
      let model = this.model;
      this.reduceSelection();
      model.transactionModel.beginTransaction('toggle palette state');
      model.selectionModel.contents().forEach(function(element) {
        if (!isElement(element))
          return;
        model.observableModel.changeValue(element, 'state',
          (element.state === 'palette') ? 'normal' : 'palette');
      })
      model.transactionModel.endTransaction();
    },


    makeConsistent: function () {
      const self = this, model = this.model,
            diagram = this.diagram,
            dataModel = model.dataModel,
            hierarchicalModel = model.hierarchicalModel,
            selectionModel = model.selectionModel,
            observableModel = model.observableModel,
            functionChartModel = model.functionChartModel;

// TODO don't mutate while iterating???
      let graphInfo, elementsAndGroups, wires;
      function refreshGraphInfo() {
       graphInfo = model.functionChartModel.getGraphInfo();
       elementsAndGroups = graphInfo.elementsAndGroups;
       wires = graphInfo.wires;
      }
      refreshGraphInfo();

      // Update groups. Reverse visit so nested groups work correctly.
      reverseVisitItems(diagram.items, function(group) {
        if (group.items.length === 0) {
          self.deleteItem(group);
          refreshGraphInfo();
          return;
        }
        const oldType = group.type,
              oldSig = globalTypeParser_.trimType(group.type),
              info = self.getGroupTypeInfo(group.items, group);
        if (oldSig !== info.type) {
          // Maintain the label of the group.
          let label = oldType.substring(oldSig.length);
          info.type += label;
          // Assign info properties.
          for (let attr in info) {
            observableModel.changeValue(group, attr, info[attr]);
          }
          // Replace any 'self' instances with instances of the new type.
          group.items.forEach(function(item) {
            if (isElement(item) && self.isInstanceOfGroup(item, group)) {
              const newInstance = self.newGroupInstance(
                  item.groupId, item.definitionId, info.type, item.x, item.y);
              self.replaceElement(item, newInstance);
              // Recalculate the graph data.
              refreshGraphInfo();
            }
          });
        }
      }, isGroup);

      elementsAndGroups.forEach(function(element) {
        if (isGroup(element)) {
          // Delete empty groups.
          if (element.items.length === 0) {
            self.deleteItem(element);
            // Recalculate the graph data.
            refreshGraphInfo();
          }
        }
      });

      // Eliminate dangling wires.
      wires.forEach(function(wire) {
        const src = self.getWireSrc(wire),
              dst = self.getWireDst(wire);
        if (!src ||
            !dst ||
            !elementsAndGroups.has(src) ||
            !elementsAndGroups.has(dst) ||
            wire.srcPin >= getType(src).outputs.length ||
            wire.dstPin >= getType(dst).inputs.length) {
          self.deleteItem(wire);
          // Recalculate the graph data.
          refreshGraphInfo();
          return;
        }
        // Make sure wires belong to lowest common container (functionChart or group).
        const lca = hierarchicalModel.getLowestCommonAncestor(src, dst);
        if (self.getParent(wire) !== lca) {
          self.deleteItem(wire);
          self.addItem(wire, lca);
          // Reparenting doesn't change the graph structure.
        }
      });

      assert(functionChartModel.checkConsistency());
    },
  }

  function extend(model, theme) {
    dataModels.dataModel.extend(model);
    dataModels.observableModel.extend(model);
    dataModels.selectionModel.extend(model);
    dataModels.referencingModel.extend(model);
    dataModels.hierarchicalModel.extend(model);
    dataModels.transactionModel.extend(model);
    dataModels.transactionHistory.extend(model);
    dataModels.instancingModel.extend(model);
    dataModels.copyPasteModel.extend(model);
    dataModels.translatableModel.extend(model);

    const canonicalImpl = {
      canonicalsAttr: _definitionsAttr,
      canonicalRefAttr: 'definitionId',

      configure: function(model) {
        this.root = model.dataModel.root;
      },

      onInstanceInserted: function(instance, definition) {
        instance[_definition] = definition.items
      },

      onInstanceRemoved: function(instance, definition) {
        instance[_definition] = undefined;
      },
    }
    const canonicalInstanceModel =
        dataModels.canonicalInstanceModel.extend(model, canonicalImpl);

    functionChartModel.extend(model);

    let instance = Object.create(proto);
    instance.model = model;
    instance.diagram = model.root;
    instance.theme = extendTheme(theme);

    instance.getWireSrc = model.referencingModel.getReferenceFn('srcId');
    instance.getWireDst = model.referencingModel.getReferenceFn('dstId');
    instance.getGroupDefinition_ = model.referencingModel.getReferenceFn('definitionId');

    model.transactionModel.addHandler('transactionEnding',
                                      transaction => instance.makeConsistent());

    model.editingModel = instance;
    return instance;
  }

  return {
    extend: extend,
  }
})();


//------------------------------------------------------------------------------

  class Editor {
    constructor(theme, canvasController, paletteController, propertyGridController) {
      const self = this;
      theme = extendTheme(theme);
      this.theme = theme;
      this.canvasController = canvasController;
      this.paletteController = paletteController;
      this.propertyGridController = propertyGridController;
      this.fileController = new diagrams.FileController();

      this.hitTolerance = 8;

      const renderer = new Renderer(theme);
      this.renderer = renderer;

      const junctions = [
        {
          kind: 'element',
          elementKind: 'input',
          type: inputElementType,
        },
        {
          kind: 'element',
          elementKind: 'output',
          type: outputElementType,
        },
        {
          kind: 'element',
          elementKind: 'literal',
          type: '[,v(0)]',
        },
      ];

      const unaryOps = ['!', '~', '-'];
      const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
        '|', '&', '||', '&&'];

      const primitives = [];
      unaryOps.forEach(function (op) {
        primitives.push({
          kind: 'element',
          type: '[v,v](' + op + ')',
        });
      });
      binaryOps.forEach(function (op) {
        primitives.push({
          kind: 'element',
          type: '[vv,v](' + op + ')',
        });
      });
      // Just one ternary op for now, the conditional operator.
      primitives.push({
        kind: 'element',
        type: '[vvv,v](?)',
      });

      // Object definition.
      primitives.push({
        kind: 'element',
        type: '[,v[v,v]](let)',
      });
      // Object adapter.
      primitives.push({
        kind: 'element',
        type: '[v,[v,v[v,v]]]({})',
      });
      // Array adapter.
      primitives.push({
        kind: 'element',
        type: '[v,v(n)[v,v[v,v]]]([])',
      });
      // // Set adapter.
      // primitives.push({
      //     kind: 'element',
      //     type: '[,v(size)[v,v](add)[v,v](has)[v,v](delete)[,v](clear)](set)',
      // });
      // // Map adapter.
      // primitives.push({
      //     kind: 'element',
      //     type: '[,v(size)[v,v](get)[vv,v](set)[v,v](has)[v,v](delete)[,v](clear)](map)',
      // });
      // // String adapter.
      // primitives.push({
      //     kind: 'element',
      //     type: '[v,v(length)[vv,v](indexOf)[vv,v](lastIndexOf)[v,v](charAt)[vv,v](substring)](string)',
      // });
      this.junctions = junctions;
      this.primitives = primitives;
      this.palette = junctions.concat(primitives);
    }
    getCanvasPosition(canvasController, p) {
      // When dragging from the palette, convert the position from pointer events
      // into the canvas space to render the drag and drop.
      return this.canvasController.viewToOtherCanvasView(canvasController, p);
    }
    hitTestCanvas(p) {
      const model = this.model,
            renderer = this.renderer,
            tol = this.hitTolerance,
            diagram = this.diagram,
            canvasController = this.canvasController,
            cp = this.getCanvasPosition(canvasController, p),
            ctx = canvasController.getCtx(),
            hitList = [];
      function pushHit(info) {
        if (info)
          hitList.push(info);
      }
      renderer.begin(ctx);
      model.selectionModel.forEach(function (item) {
        item => pushHit(renderer.hitTest(item, cp, tol, normalMode));
      });
      // Skip the root functionChart, as hits there should go to the underlying canvas controller.
      reverseVisitItems(diagram.items,
        item => pushHit(renderer.hitTest(item, cp, tol, normalMode)), isWire);
      reverseVisitItems(diagram.items,
        item => pushHit(renderer.hitTest(item, cp, tol, normalMode)), isElementOrGroup);
      renderer.end();
      return hitList;

    }
    hitTestPalette(p) {
      const renderer = this.renderer,
            tol = this.hitTolerance,
            ctx = this.canvasController.getCtx(),
            hitList = [];
      function pushInfo(info) {
        if (info)
          hitList.push(info);
      }
      renderer.begin(ctx);
      reverseVisitItems(this.palette, function (item) {
        pushInfo(renderer.hitTest(item, p, tol, printMode));
      }, isElementOrGroup);
      renderer.end();
      return hitList;
    }
    getFirstHit(hitList, filterFn) {
      if (hitList) {
        let model = this.model, length = hitList.length;
        for (let i = 0; i < length; i++) {
          let hitInfo = hitList[i];
          if (filterFn(hitInfo, model))
            return hitInfo;
        }
      }
      return null;
    }
    setPropertyGrid() {
      const model = this.model,
            item = model.selectionModel.lastSelected(),
            type = item ? item.type : undefined;
      this.propertyGridController.show(type, item);
    }
    onClick(canvasController, alt) {
      const model = this.model,
            selectionModel = model.selectionModel,
            editingModel = model.editingModel,
            shiftKeyDown = this.canvasController.shiftKeyDown,
            cmdKeyDown = this.canvasController.cmdKeyDown,
            p = canvasController.getInitialPointerPosition(),
            cp = canvasController.viewToCanvas(p);

      let hitList, inPalette;
      if (canvasController === this.paletteController) {
        hitList = this.hitTestPalette(cp);
        inPalette = true;
      } else {
        assert(canvasController === this.canvasController);
        hitList = this.hitTestCanvas(cp);
        inPalette = false;
      }

      const mouseHitInfo = this.mouseHitInfo = this.getFirstHit(hitList, isDraggable);
      if (mouseHitInfo) {
        let item = mouseHitInfo.item;
        if (mouseHitInfo.newGroupInstanceInfo) {
          // Create a temporary palette element that will create the new instance.
          const group = mouseHitInfo.item, newGroupInstanceInfo = mouseHitInfo.newGroupInstanceInfo;
          mouseHitInfo.group = item;
          item = mouseHitInfo.item = {
            kind: 'element',
            x: newGroupInstanceInfo.x,
            y: newGroupInstanceInfo.y,
            type: group.type,
            [_type]: getType(group),
            state: 'palette',
          };
        }
        if (cmdKeyDown || inPalette) {
          mouseHitInfo.moveCopy = true;
          // No wire dragging in this mode.
          mouseHitInfo.input = mouseHitInfo.output = undefined;
        }
        selectionModel.select(item, shiftKeyDown);
      } else {
        if (!shiftKeyDown)
          selectionModel.clear();
      }
      // TODO prop grid
      // this.setEditableText();
      return mouseHitInfo !== null;
    }
    onBeginDrag(canvasController) {
      const mouseHitInfo = this.mouseHitInfo;
      if (!mouseHitInfo)
        return false;

      const model = this.model,
            selectionModel = model.selectionModel,
            editingModel = model.editingModel,
            p0 = canvasController.getInitialPointerPosition(),
            dragItem = mouseHitInfo.item;
      let newWire, drag;
      if (mouseHitInfo.input !== undefined) {
        // Wire from input pin.
        const elementId = model.dataModel.getId(dragItem), cp0 = canvasController.viewToCanvas(p0);
        // Start the new wire as connecting the dst element to nothing.
        newWire = {
          kind: 'wire',
          dstId: elementId,
          dstPin: mouseHitInfo.input,
          [_p1]: cp0,
        };
        drag = {
          kind: connectWireSrc,
          name: 'Add new wire',
          isNewWire: true,
        };
      } else if (mouseHitInfo.output !== undefined) {
        // Wire from output pin.
        const elementId = model.dataModel.getId(dragItem), cp0 = canvasController.viewToCanvas(p0);
        // Start the new wire as connecting the src element to nothing.
        newWire = {
          kind: 'wire',
          srcId: elementId,
          srcPin: mouseHitInfo.output,
          [_p2]: cp0,
        };
        drag = {
          kind: connectWireDst,
          name: 'Add new wire',
          isNewWire: true,
        };
      } else {
        switch (dragItem.kind) {
          case 'element':
          case 'group':
            if (mouseHitInfo.moveCopy) {
              drag = { kind: moveCopySelection, name: 'Move copy of selection' };
            } else {
              drag = { kind: moveSelection, name: 'Move selection' };
            }
            break;
          case 'wire':
            if (mouseHitInfo.p1)
              drag = { kind: connectWireSrc, name: 'Edit wire' };
            else if (mouseHitInfo.p2)
              drag = { kind: connectWireDst, name: 'Edit wire' };
            break;
        }
      }

      this.drag = drag;
      if (drag) {
        if (drag.kind === moveSelection || drag.kind === moveCopySelection) {
          editingModel.selectInteriorWires();
          editingModel.reduceSelection();
          let items = selectionModel.contents();
          drag.isSingleElement = items.length === 1 && isElement(items[0]);
        }
        model.transactionModel.beginTransaction(drag.name);
        if (newWire) {
          drag.item = newWire;
          editingModel.newItem(newWire);
          editingModel.addItem(newWire);
          selectionModel.set(newWire);
        } else {
          drag.item = dragItem;
          if (mouseHitInfo.moveCopy) {
            const map = new Map(), copies = editingModel.copyItems(selectionModel.contents(), map);
            if (drag.isSingleElement && mouseHitInfo.newGroupInstanceInfo) {
              editingModel.createGroupInstance(mouseHitInfo.group, copies[0]);
            }
            editingModel.addItems(copies);
            selectionModel.set(copies);
          }
        }
      }
    }
    onDrag(canvasController) {
      const drag = this.drag;
      if (!drag)
        return;
      const model = this.model,
            dataModel = model.dataModel,
            observableModel = model.observableModel,
            transactionModel = model.transactionModel,
            selectionModel = model.selectionModel,
            p0 = canvasController.getInitialPointerPosition(),
            cp0 = this.getCanvasPosition(canvasController, p0),
            p = canvasController.getCurrentPointerPosition(),
            cp = this.getCanvasPosition(canvasController, p),
            dragItem = drag.item,
            hitList = this.hitTestCanvas(p);
      let hitInfo;
      switch (drag.kind) {
        case moveSelection:
        case moveCopySelection:
          if (isElementOrGroup(dragItem)) {
            const filter = drag.isSingleElement ?
              isContainerTargetOrElementSlot : isContainerTarget;
            hitInfo = this.getFirstHit(hitList, filter);
            selectionModel.forEach(function (item) {
              if (isElementOrGroup(item)) {
                let snapshot = transactionModel.getSnapshot(item);
                if (snapshot) {
                  let dx = cp.x - cp0.x, dy = cp.y - cp0.y;
                  observableModel.changeValue(item, 'x', snapshot.x + dx);
                  observableModel.changeValue(item, 'y', snapshot.y + dy);
                }
              }
            });
          }
          break;
        case connectWireSrc:
          hitInfo = this.getFirstHit(hitList, isOutputPin);
          const srcId = hitInfo ? dataModel.getId(hitInfo.item) : 0; // 0 is invalid id.
          assert(isWire(dragItem));
          observableModel.changeValue(dragItem, 'srcId', srcId);
          if (srcId) {
            observableModel.changeValue(dragItem, 'srcPin', hitInfo.output);
            dragItem[_p1] = undefined;
          } else {
            // Change private property through model to update observers.
            observableModel.changeValue(dragItem, _p1, cp);
          }
          break;
        case connectWireDst:
          hitInfo = this.getFirstHit(hitList, isInputPin);
          const dstId = hitInfo ? dataModel.getId(hitInfo.item) : 0; // 0 is invalid id.
          assert(isWire(dragItem));
          observableModel.changeValue(dragItem, 'dstId', dstId);
          if (dstId) {
            observableModel.changeValue(dragItem, 'dstPin', hitInfo.input);
            dragItem[_p2] = undefined;
          } else {
            // Change private property through model to update observers.
            observableModel.changeValue(dragItem, _p2, cp);
          }
          break;
      }

      this.hotTrackInfo = (hitInfo && hitInfo.item !== this.diagram) ? hitInfo : null;
    }
    onEndDrag(canvasController) {
      let drag = this.drag;
      if (!drag)
        return;
      const dragItem = drag.item,
            model = this.model,
            diagram = this.diagram,
            selectionModel = model.selectionModel,
            transactionModel = model.transactionModel,
            editingModel = model.editingModel,
            p = canvasController.getCurrentPointerPosition();

      switch (drag.kind) {
        case connectWireSrc:
        case connectWireDst:
          if (drag.isNewWire) {
            // Coalesce the creation and editing of the dragged wire into an
            // insertion of a new wire.
            const src = editingModel.getWireSrc(dragItem), dst = editingModel.getWireDst(dragItem), srcId = dragItem.srcId, srcPin = dragItem.srcPin, dstId = dragItem.dstId, dstPin = dragItem.dstPin;
            selectionModel.clear();
            transactionModel.cancelTransaction();
            transactionModel.beginTransaction('Add new wire');
            if (!src) {
              // Add the appropriate source junction.
              const connection = editingModel.connectInput(dst, dstPin, p);
              selectionModel.set(connection.junction, connection.wire);
            } else if (!dst) {
              const srcType = getType(src), pinIndex = srcPin, pin = srcType.outputs[pinIndex];
              // Add the appropriate destination junction.
              // if (isFunctionType(pin.type)) {
              //   const element = editingModel.newElement(pin.type, p.x, p.y);
              //   editingModel.addItem(element, diagram);
              //   const newElement = editingModel.openElement(element);
              //   editingModel.replaceElement(element, newElement);
              //   const dstPin = getType(newElement).inputs.length - 1,
              //         wire = editingModel.newWire(
              //             src.id, pinIndex, newElement.id, dstPin);
              //   editingModel.addItem(wire, diagram);
              //   selectionModel.set(newElement, wire)
              // } else {
              const connection = editingModel.connectOutput(src, srcPin, p);
              selectionModel.set(connection.junction, connection.wire);
            } else {
              const newWire = editingModel.newWire(srcId, srcPin, dstId, dstPin);
              editingModel.addItem(newWire);
              selectionModel.set(newWire);
            }
          }
          transactionModel.endTransaction();
          break;
        case moveSelection:
        case moveCopySelection:
          // Find element beneath items.
          const hitList = this.hitTestCanvas(p), filter = drag.isSingleElement ?
            isContainerTargetOrElementSlot : isContainerTarget, hitInfo = this.getFirstHit(hitList, filter), parent = hitInfo ? hitInfo.item : diagram, selection = selectionModel.contents();
          if (drag.isSingleElement && !isContainer(parent)) {
            // Replace parent item.
            editingModel.replaceElement(parent, selection[0]);
          } else {
            // Reparent selected items.
            selection.forEach(item => editingModel.addItem(item, parent));
          }
          transactionModel.endTransaction();
          break;
      }

      // TODO prop grid
      // this.setEditableText();

      this.drag = null;
      this.mouseHitInfo = null;
      this.hotTrackInfo = null;
      this.mouseHitInfo = null;

      this.canvasController.draw();
    }
    onKeyDown(e) {
        const diagram = this.diagram,
            model = this.model,
            selectionModel = model.selectionModel,
            editingModel = model.editingModel,
            transactionHistory = model.transactionHistory,
            keyCode = e.keyCode,
            cmdKey = e.ctrlKey || e.metaKey,
            shiftKey = e.shiftKey;

      if (keyCode === 8) { // 'delete'
        editingModel.doDelete();
        return true;
      }
      if (cmdKey) {
        switch (keyCode) {
          case 65: // 'a'
            diagram.items.forEach(function (v) {
              selectionModel.add(v);
            });
            return true;
          case 90: // 'z'
            if (transactionHistory.getUndo()) {
              selectionModel.clear();
              transactionHistory.undo();
              return true;
            }
            return false;
          case 89: // 'y'
            if (transactionHistory.getRedo()) {
              selectionModel.clear();
              transactionHistory.redo();
              return true;
            }
            return false;
          case 88: // 'x'
            editingModel.doCut();
            return true;
          case 67: // 'c'
            editingModel.doCopy();
            return true;
          case 86: // 'v'
            if (model.copyPasteModel.getScrap()) {
              editingModel.doPaste(24, 24);
              return true;
            }
            return false;
          case 69: // 'e'
            editingModel.doSelectConnectedElements(!shiftKey);
            return true;
          case 72: // 'h'
            editingModel.doTogglePalette();
            return true;
          case 74: // 'j'
            editingModel.doComplete();
            return true;
          case 75: // 'k'
            editingModel.doExport();
            return true;
          case 76: // 'l'
            editingModel.doAbstract();
            return true;
          case 66: // 'b'
            editingModel.doBuild();
            return true;
          case 71: // 'g'
            editingModel.doGroup();
            return true;
          case 83: // 's':
            // let text = JSON.stringify(
            //   diagram,
            //   function(key, value) {
            //     if (key.toString().charAt(0) === '_')
            //       return;
            //     if (value === undefined || value === null)
            //       return;
            //     return value;
            //   },
            //   2);
            // // Writes diagram as JSON to console.
            // console.log(text);
            {
              // // Render the selected elements using Canvas2SVG to convert to SVG format.
              // // Clip to the selection bounding box.
              // let bounds = renderer.getBounds(selectionModel.contents());
              // let ctx = new C2S(bounds.w, bounds.h);
              // ctx.translate(-bounds.x, -bounds.y);
              this.print();
              return true;
            }
        }
      }
    }
  }






function isDraggable(hitInfo, model) {
  return !isFunctionChart(hitInfo.item);
}

function isInputPin(hitInfo, model) {
  return hitInfo.input !== undefined;
}

function isOutputPin(hitInfo, model) {
  return hitInfo.output !== undefined;
}

function isContainerTarget(hitInfo, model) {
  let item = hitInfo.item;
  return isContainer(item) &&
         !model.hierarchicalModel.isItemInSelection(item);
}

function isContainerTargetOrElementSlot(hitInfo, model) {
  if (isContainerTarget(hitInfo, model))
    return true;
  // TODO drop element on function inputs.
  let item = hitInfo.item;
  return isElement(item) && !isPaletted(item) &&
         !model.hierarchicalModel.isItemInSelection(item);
}



const connectWireSrc = 1,
      connectWireDst = 2,
      moveSelection = 3,
      moveCopySelection = 4;







return {
  functionChartModel,
  editingModel,
  getType,

  TypeParser,
  Renderer,

  Editor,
};
})();

const function_chart_data =
{
  "kind": "functionChart",
  "id": 1,
  "x": 0,
  "y": 0,
  "width": 853,
  "height": 430,
  "name": "Example",
  "items": [
  ],
  ['definitions']: [
  ]
}

*/