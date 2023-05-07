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

import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

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
  constructor(typeString: string, name?: string, type?: Type) {
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
  add(s: string) : Type {
    const atomized = this.map_.get(s);
    if (atomized)
      return atomized;

    const self = this;

    function addType(s: string, type: Type) {
      let result = self.map_.get(s);
      if (!result) {
        self.map_.set(s, type);
        result = type;
      }
      return result;
    }

    let j = 0;
    // Close over j to avoid extra return values.
    function parseName() : string {
      let name = '';
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
      addType(typeString, type!);  // TODO fix
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
        const typeString = s.substring(i, j),
              type = new Type(typeString, inputs, outputs);
        addType(typeString, type);
        return type;
      }
      throw new Error('Invalid type string: ' + s);
    }

    const type = parseFunction();
    if (type) {
      // Add the type with label.
      type.name = parseName();
      addType(s, type);
    }
    return type;
  }
  // Removes any trailing label. Type may be ill-formed, e.g. '[v(f)'
  trimTypeString(type: string) : string {
    if (type[type.length - 1] === ')')
      type = type.substring(0, type.lastIndexOf('('));
    return type;
  }

  // Removes all labels from signature.
  getUnlabeledTypeString(type: string) : string {
    let result = '', label = 0;
    while (true) {
      label = type.indexOf('(');
      if (label <= 0)
        break;
      result += type.substring(0, label);
      label = type.indexOf(')', label);
      if (label <= 0)
        break;
      type = type.substring(label + 1, type.length);
    }
    return result + type;
  }

  splitTypeString(type: string) : number {
    let j = 0, level = 0;
    while (true) {
      if (type[j] === '[')
        level++;
      else if (type[j] === ']')
        level--;
      else if (type[j] === ',')
        if (level === 1) return j;
      j++;
    }
  }
  hasOutput(type: string) {
    return !type.endsWith(',]');
  }

  addInputToTypeString(type: string, inputType: string) : string {
    let i = this.splitTypeString(type);
    return type.substring(0, i) + inputType + type.substring(i);
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

class ElementBase {
  readonly id = new IdProp('id');
  readonly x = new ScalarProp('x');
  readonly y = new ScalarProp('y');
}

class ElementTemplate extends ElementBase {
  readonly typeName = 'element';
  readonly name = new ScalarProp('name');
  readonly typeString = new ScalarProp('typeString');
  readonly properties = [this.id, this.x, this.y, this.name, this.typeString];
}

export type PseudoelementSubtype = 'input' | 'output' | 'literal';

class PseudoelementTemplate extends ElementBase {
  readonly typeName: PseudoelementSubtype;
  readonly id = new IdProp('id');
  readonly x = new ScalarProp('x');
  readonly y = new ScalarProp('y');
  readonly properties = [this.id, this.x, this.y];
  constructor(typeName: PseudoelementSubtype) {
    super();
    this.typeName = typeName;
  }
}

const elementTemplate = new ElementTemplate(),
      inputPseudoelementTemplate = new PseudoelementTemplate('input'),
      outputPseudoelementTemplate = new PseudoelementTemplate('output'),
      literalPseudoelementTemplate = new PseudoelementTemplate('literal');

const wireTemplate = (function() {
  const typeName: string = 'wire',
        src = new ReferenceProp('src'),
        srcPin = new ScalarProp('srcPin'),
        dst = new ReferenceProp('dst'),
        dstPin = new ScalarProp('dstPin'),

        properties = [src, srcPin, dst, dstPin];

  return { typeName, src, srcPin, dst, dstPin, properties };
})();

const functionchartTemplate = (function() {
  const typeName: string = 'circuit',
        x = new ScalarProp('x'),
        y = new ScalarProp('y'),
        width = new ScalarProp('width'),
        height = new ScalarProp('height'),
        name = new ScalarProp('name'),

        elements = new ChildArrayProp('elements'),
        wires = new ChildArrayProp('wires'),
        functioncharts = new ChildArrayProp('functioncharts'),
        properties = [x, y, width, height, name, elements, wires, functioncharts];

  return { typeName, x, y, width, height, name, elements, wires, functioncharts, properties };
})();

const defaultPoint = { x: 0, y: 0 },
      defaultPointWithNormal: PointWithNormal = { x: 0, y: 0, nx: 0 , ny: 0 },
      defaultBezierCurve: BezierCurve = [
          defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal];

export class Element implements DataContextObject, ReferencedObject {
  readonly template = elementTemplate;
  readonly context: FunctionchartContext;

  readonly id: number;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get name() { return this.template.name.get(this); }
  set name(value: string | undefined) { this.template.name.set(this, value); }
  get typeString() { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = nullFunction;
  inWires: Array<Wire | undefined>;           // one input per pin.
  outWires: Array<Array<Wire>>;   // array of outputs per pin, outputs have fan out.

  constructor(context: FunctionchartContext, id: number) {
    this.context = context;
    this.id = id;
  }
}

export class Pseudoelement implements DataContextObject, ReferencedObject {
  readonly template: PseudoelementTemplate;
  readonly context: FunctionchartContext;

  readonly id: number;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get typeString() : string {
    switch (this.template.typeName) {
      case 'input': return '[,*]';
      case 'output': return '[*,]';
      case 'literal': return '[,v]';
    }
  }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;
  type: Type = nullFunction;
  inWires: Array<Wire | undefined>;           // one input per pin.
  outWires: Array<Array<Wire>>;   // array of outputs per pin, outputs have fan out.

  constructor(template: PseudoelementTemplate, id: number, context: FunctionchartContext) {
    this.template = template;
    this.type = globalTypeParser_.add(this.typeString);
    this.id = id;
    this.context = context;
    this.inWires = new Array<Wire | undefined>(this.type.inputs.length);
    this.outWires = new Array<Array<Wire>>(this.type.outputs.length);
    for (let i = 0; i < this.outWires.length; i++)
      this.outWires[i] = new Array<Wire>();
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

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value: number) { this.template.width.set(this, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value: number) { this.template.height.set(this, value); }
  get name() { return this.template.name.get(this) || ''; }
  set name(value: string | undefined) { this.template.name.set(this, value); }

  get elements() { return this.template.elements.get(this) as List<ElementTypes>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }
  get functioncharts() { return this.template.functioncharts.get(this) as List<Functionchart>; }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition = defaultPoint;

  constructor(context: FunctionchartContext) {
    this.context = context;
  }
}

type ElementTypes = Element | Pseudoelement;
type NonWireTypes = ElementTypes | Functionchart;
type AllTypes = ElementTypes | Wire | Functionchart;

export type FunctionchartVisitor = (item: AllTypes) => void;
export type NonWireVisitor = (nonwire: NonWireTypes) => void;
export type WireVisitor = (wire: Wire) => void;

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
    });
    this.historyManager = new HistoryManager(this.transactionManager, this.selection);
    this.functionchart = new Functionchart(this);
    this.insertItem_(this.functionchart, undefined);
  }

  root() : Functionchart {
    return this.functionchart;
  }
  setRoot(root: Functionchart) : void {
    if (this.functionchart)
      this.removeItem_(this.functionchart);
    this.insertItem_(root, undefined);
    this.functionchart = root;
  }

  newElement() : Element {
    const nextId = ++this.highestId,
          result: Element = new Element(this, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  newPseudoelement(typeName: PseudoelementSubtype) : Pseudoelement {
    const nextId = ++this.highestId;
    let template: PseudoelementTemplate;
    switch (typeName) {
      case 'input': template = inputPseudoelementTemplate; break;
      case 'output': template = outputPseudoelementTemplate; break;
      case 'literal': template = literalPseudoelementTemplate; break;
      default: throw new Error('Unknown pseudoelement type: ' + typeName);
    }
    const result: Pseudoelement = new Pseudoelement(template, nextId, this);
    this.referentMap.set(nextId, result);
    return result;
  }
  newWire(src: Element | undefined, srcPin: number, dst: Element | undefined, dstPin: number) : Wire {
    const result = new Wire(this);
    result.src = src;
    result.srcPin = srcPin;
    result.dst = dst;
    result.dstPin = dstPin;
    return result;
  }
  newFunctionchart() : Functionchart {
    return new Functionchart(this);
  }

  visitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.elements.forEach(t => self.visitAll(t, visitor));
      item.wires.forEach(t => self.visitAll(t, visitor));
    }
  }
  visitAllItems(items: List<AllTypes>, visitor: FunctionchartVisitor) : void {
    const self = this;
    items.forEach(item => self.visitAll(item, visitor));
  }
  reverseVisitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    if (item instanceof Functionchart) {
      item.elements.forEachReverse(t => self.reverseVisitAll(t, visitor));
      item.wires.forEachReverse(t => self.reverseVisitAll(t, visitor));
    }
    visitor(item);
  }
  reverseVisitAllItems(items: List<AllTypes>, visitor: FunctionchartVisitor) : void {
    const self = this;
    items.forEachReverse(item => self.reverseVisitAll(item, visitor));
  }

  visitNonWires(item: AllTypes, visitor: NonWireVisitor) : void {
    const self = this;
    if (item instanceof Element || item instanceof Pseudoelement) {
      visitor(item);
    } else if (item instanceof Functionchart) {
      visitor(item);
      item.elements.forEach(item => self.visitNonWires(item, visitor));
    }
  }

  updateItem(item: AllTypes) {
    const self = this;
    this.visitNonWires(item, item => self.setGlobalPosition(item));
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

  getSubgraphInfo(items: ElementTypes[]) : GraphInfo {
    const self = this,
          elements = new Set<ElementTypes>(),
          functioncharts = new Set<Functionchart>(),
          wires = new Set<Wire>(),
          interiorWires = new Set<Wire>(),
          inWires = new Set<Wire>(),
          outWires = new Set<Wire>();
    // First collect elements and Functioncharts.
    items.forEach(item => {
      this.visitAll(item, item => {
        if (item instanceof Element || item instanceof Pseudoelement)
          elements.add(item);
        else if (item instanceof Functionchart)
          functioncharts.add(item);
      });
      });
    // Now collect and classify transitions that connect to them.
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
      if (item instanceof Element || item instanceof Pseudoelement) {
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

  getConnectedElements(elements: ElementTypes[], upstream: boolean, downstream: boolean) : Set<ElementTypes> {
    const result = new Set<ElementTypes>();
    elements = elements.slice(0);  // Copy input array
    while (elements.length > 0) {
      const element = elements.pop();
      if (!element) continue;

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

  beginTransaction(name: string) {
    this.transactionManager.beginTransaction(name);
  }
  endTransaction(name: string) {
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
      if (item instanceof Wire)
        item.parent.wires.remove(item);
      else if (item instanceof Functionchart)
        item.parent.functioncharts.remove(item);
      else
        item.parent.elements.remove(item);
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

  selectedElements() : ElementTypes[] {
    const result = new Array<ElementTypes>();
    this.selection.forEach(item => {
      if (item instanceof Element || item instanceof Pseudoelement)
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
          graphInfo = this.getSubgraphInfo(this.selectedElements());
    graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
  }

  selectConnectedElements(upstream: boolean) {
    const selectedElements = this.selectedElements(),
          connectedElements = this.getConnectedElements(selectedElements, upstream, false);
    this.selection.set(Array.from(connectedElements));
  }

  addItem(item: AllTypes, parent: Functionchart) : AllTypes {
    const oldParent = item.parent;

    if (!parent)
      parent = this.functionchart;
    if (oldParent === parent)
      return item;
    // At this point we can add item to parent.
    if (item instanceof Element || item instanceof Functionchart) {
      const translation = this.getToParent(item, parent);
      item.x += translation.x;
      item.y += translation.y;
    }

    if (oldParent)
      this.deleteItem(item);

    if (item instanceof Wire) {
      parent.wires.append(item);
    } else if (item instanceof Element || item instanceof Pseudoelement) {
      parent.elements.append(item);
    }
    return item;
  }

  addItems(items: AllTypes[], parent: Functionchart) {
    // Add elements first, then transitions, so the context can track transitions.
    for (let item of items) {
      if (item instanceof Element || item instanceof Pseudoelement)
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

    selection.set(this.selectedElements());
    this.selectInteriorWires();
    this.reduceSelection();

    const selected = selection.contents(),
          map = new Map<number, Element>(),
          copies = copyItems(selected, this, map);

    selected.forEach(item => {
      if (item instanceof Element || item instanceof Pseudoelement) {
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
      if (item instanceof Element || item instanceof Pseudoelement || item instanceof Functionchart) {
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

  makeConsistent () {
    const self = this,
          Functionchart = this.functionchart,
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
      // Make sure transitions wires to lowest common functionchart.
      const srcParent = src.parent!,
            dstParent = dst.parent!,
            lca: Functionchart = getLowestCommonAncestor<AllTypes>(srcParent, dstParent) as Functionchart;
      if (wire.parent !== lca) {
        self.deleteItem(wire);
        self.addItem(wire, lca);
      }
    });
    // Delete any empty functioncharts (except for the root functionchart).
    graphInfo.functioncharts.forEach(functionchart => {
      if (functionchart.parent &&
          functionchart.elements.length === 0)
        self.deleteItem(functionchart);
    });
  }

  replaceElement(element: Element, newElement: Element) {
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

  private insertElement_(element: ElementTypes, parent: Functionchart) {
    this.elements.add(element);
    element.parent = parent;
    this.updateItem(element);

    if (element.inWires === undefined)
      element.inWires = new Array<Wire>(element.type.inputs.length);
    if (element.outWires === undefined)
      element.outWires = new Array<Wire[]>(element.type.outputs.length);
  }

  private removeElement_(element: ElementTypes) {
    this.elements.delete(element);
  }

  private insertFunctionchart_(functionchart: Functionchart, parent: Functionchart | undefined) {
    this.functioncharts.add(functionchart);
    functionchart.parent = parent;
    this.updateItem(functionchart);

    const self = this;
    functionchart.elements.forEach(element => self.insertElement_(element, functionchart));
    functionchart.wires.forEach(wire => self.insertWire_(wire, functionchart));
  }

  private removeFunctionchart_(functionchart: Functionchart) {
    this.functioncharts.delete(functionchart);
    const self = this;
    functionchart.elements.forEach(element => self.removeElement_(element));
  }

  private insertWire_(wire: Wire, parent: Functionchart) {
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

  private removeWire_(wire: Wire) {
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

  private insertItem_(item: AllTypes, parent: Functionchart | undefined) {
    if (item instanceof Wire) {
      if (parent)
        this.insertWire_(item, parent);
    } else if (item instanceof Functionchart) {
      this.insertFunctionchart_(item, parent);
    } else {
      if (parent) {
        this.insertElement_(item, parent);
      }
    }
  }

  private removeItem_(item: AllTypes) {
    if (item instanceof Wire)
      this.removeWire_(item);
    else if (item instanceof Functionchart)
      this.removeFunctionchart_(item);
    else
      this.removeElement_(item);
  }

  // DataContext interface implementation.
  valueChanged(owner: AllTypes, prop: ScalarPropertyTypes, oldValue: any) : void {
    if (owner instanceof Wire) {
      // Remove and reinsert changed wires.
      const parent = owner.parent;
      if (parent) {
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
        this.insertWire_(owner, parent);
      }
    } else if (owner instanceof Element || owner instanceof Pseudoelement) {
      if (prop === elementTemplate.typeString) {
        owner.type = globalTypeParser_.add(owner.typeString);
        owner.inWires = new Array<Wire | undefined>(owner.type.inputs.length);
        owner.outWires = new Array<Array<Wire>>(owner.type.outputs.length);
        for (let i = 0; i < owner.outWires.length; i++)
          owner.outWires[i] = new Array<Wire>();
      }
    }
    this.onValueChanged(owner, prop, oldValue);
    this.updateItem(owner);  // Update any derived properties.
  }
  elementInserted(owner: Functionchart, prop: ArrayPropertyTypes, index: number) : void {
    const value: AllTypes = prop.get(owner).at(index) as AllTypes;
    this.insertItem_(value, owner);
    this.onElementInserted(owner, prop, index);
  }
  elementRemoved(owner: Functionchart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes) : void {
    this.removeItem_(oldValue);
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
      case 'element': return this.newElement();
      case 'input': return this.newPseudoelement('input');
      case 'output': return this.newPseudoelement('output');
      case 'literal': return this.newPseudoelement('literal');
      case 'Functionchart': return this.newFunctionchart();
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
  constructor(item: Functionchart, inner: RectHitResult) {
    this.item = item;
    this.inner = inner;
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

  getItemRect(item: NonWireTypes) : Rect {
    const global = item.globalPosition;
    const x = global.x,
          y = global.y;
    if (item instanceof Element || item instanceof Pseudoelement) {
      const type = item.type;
      return { x: x, y: y, width: type.width, height: type.height };
    } else {
      return { x: x, y: y, width: item.width, height: item.height };
    }
  }

  getBounds(items: NonWireTypes[]) : Rect {
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
    if (type.width === 0 || type.height === 0) {
      this.layoutType(type);
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
      p1 = this.pinToPoint(src, wire.srcPin, false);
    }
    if (dst && wire.dstPin >= 0) {
      p2 = this.pinToPoint(dst, wire.dstPin, true);
    }
    if (p1 && p2) {
      wire.bezier = getEdgeBezier(p1, p2, 64);
    }
  }

  // Make sure a group is big enough to enclose its contents.  // TODO Functionchart concept
  layoutFunctionchart(functionchart: Functionchart) {
    const self = this,
          spacing = this.theme.spacing;
    function layout(functionChart: Functionchart) {
      const extents = self.getBounds(functionChart.elements.asArray()),
            global = functionChart.globalPosition,
            groupX = global.x,
            groupY = global.y,
            margin = 2 * spacing;
      let width = extents.x + extents.width - groupX + margin,
          height = extents.y + extents.height - groupY + margin;
      // width += type.width;  // TODO Functionchart type and export
      // height = Math.max(height, type.height + margin);
      functionChart.width = width;
      functionChart.height = height;
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

  // // Gets the bounding rect for the group instancing element.
  // getGroupInstanceBounds(type, groupRight, groupBottom) {
  //   const theme = this.theme, spacing = theme.spacing,
  //         width = type.width, height = type.height,
  //         x = groupRight - width - spacing, y = groupBottom - height - spacing;
  //   return { x: x, y: y, w: width, h: height };
  // }

  // drawGroup(group, mode) {
  //   if (!group[_hasLayout])
  //     this.layoutGroup(group);
  //   const ctx = this.ctx,
  //         theme = this.theme,
  //         rect = this.getItemRect(group),
  //         x = rect.x, y = rect.y, w = rect.w , h = rect.h,
  //         right = x + w, bottom = y + h;
  //   diagrams.roundRectPath(x, y, w, h, theme.spacing, ctx);
  //   switch (mode) {
  //     case normalMode:
  //       ctx.fillStyle = theme.bgColor;
  //       ctx.fill();
  //       ctx.strokeStyle = theme.strokeColor;
  //       ctx.lineWidth = 0.5;
  //       ctx.setLineDash([6,3]);
  //       ctx.stroke();
  //       ctx.setLineDash([]);

  //       const type = getType(group),
  //             instanceRect = this.getGroupInstanceBounds(type, right, bottom);
  //       ctx.beginPath();
  //       ctx.rect(instanceRect.x, instanceRect.y, instanceRect.w, instanceRect.h);
  //       ctx.fillStyle = theme.altBgColor;
  //       ctx.fill();
  //       ctx.strokeStyle = theme.strokeColor;
  //       ctx.lineWidth = 0.5;
  //       ctx.stroke();
  //       this.drawType(type, instanceRect.x, instanceRect.y, 0);
  //       break;
  //     case highlightMode:
  //       ctx.strokeStyle = theme.highlightColor;
  //       ctx.lineWidth = 2;
  //       ctx.stroke();
  //       break;
  //     case hotTrackMode:
  //       ctx.strokeStyle = theme.hotTrackColor;
  //       ctx.lineWidth = 2;
  //       ctx.stroke();
  //       break;
  //   }
  // }

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

  // hitTestGroup(group, p, tol, mode) {
  //   const rect = this.getItemRect(group),
  //         x = rect.x, y = rect.y, w = rect.w , h = rect.h,
  //         hitInfo = diagrams.hitTestRect(x, y, w, h, p, tol);
  //   if (hitInfo) {
  //     assert(group[_hasLayout]);
  //     const type = getType(group),
  //           instanceRect = this.getGroupInstanceBounds(type, x + w, y + h);
  //     if (diagrams.hitTestRect(instanceRect.x, instanceRect.y,
  //                              instanceRect.w, instanceRect.h, p, tol)) {
  //       hitInfo.newGroupInstanceInfo = {
  //         x: instanceRect.x,
  //         y: instanceRect.y,
  //       };
  //     }
  //   }
  //   return hitInfo;
  // }

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
    if (item instanceof Element || item instanceof Pseudoelement) {
      this.drawElement(item, mode);
    } else if (item instanceof Wire) {
      this.drawWire(item, mode);
    }
  }

  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) : HitResultTypes | undefined {
    let hitInfo: HitResultTypes | undefined;
    if (item instanceof Element || item instanceof Pseudoelement) {
      hitInfo = this.hitTestElement(item, p, tol, mode);
    } else if (item instanceof Wire) {
      hitInfo = this.hitTestWire(item, p, tol, mode);
    }
      // case 'group':
      //   hitInfo = this.hitTestGroup(item, p, tol, mode);
      //   break;
    return hitInfo;
  }

  layout(item: AllTypes) {
    if (item instanceof Element || item instanceof Pseudoelement) {
      this.layoutElement(item);
    } else if (item instanceof Wire) {
      this.layoutWire(item);
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
  return (hitInfo instanceof ElementHitResult || hitInfo instanceof FunctionchartHitResult) &&
          !selection.has(item) && !ancestorInSet(item, selection);
}

function isClickable(hitInfo: HitResultTypes) : boolean {
  return true;
}

function isDraggable(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof ElementHitResult;
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

type NonWireDragType = 'copyPalette' | 'moveSelection' | 'moveCopySelection' | 'resizeFunctionchart';
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
  private propertyInfo = new Map<string, PropertyInfo[]>();

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
          newElement = context.newElement();

    context.setRoot(functionchart);

    input.x = input.y = 8;
    output.x = 40; output.y = 8;
    literal.x = 72; literal.y = 8;
    newElement.x = 8; newElement.y = 32;
    newElement.typeString = '[vv,v]';
    // newElement.width = 100; newElement.height = 60;

    functionchart.elements.append(input);
    functionchart.elements.append(output);
    functionchart.elements.append(literal);
    functionchart.elements.append(newElement);
    context.setRoot(functionchart);
    this.palette = functionchart;

    // Default Functionchart.
    this.context = new FunctionchartContext();
    this.initializeContext(this.context);
    this.functionchart = this.context.root();

    // Register property grid layouts.
    function getAttr(info: PropertyInfo) : string | undefined {
      switch (info.label) {
        case 'name':
          return 'name';
        case 'entry':
          return 'entry';
        case 'exit':
          return 'exit';
        case 'event':
          return 'event';
        case 'guard':
          return 'guard';
        case 'action':
          return 'action';
      }
    }
    function getter(info: PropertyInfo, item: AllTypes) {
      const attr = getAttr(info);
      if (item && attr)
        return (item as any)[attr];
      return '';
    }
    function setter(info: PropertyInfo, item: AllTypes, value: any) {
      const canvasController = self.canvasController;
      if (item) {
        const attr = getAttr(info);
        if (attr) {
          const description = 'change ' + attr,
                transactionManager = self.context.transactionManager;
          transactionManager.beginTransaction(description);
          (item as any)[attr] = value;
          transactionManager.endTransaction();
          canvasController.draw();
       }
      }
    }
    this.propertyInfo.set('state', [
      {
        label: 'name',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'entry',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'exit',
        type: 'text',
        getter: getter,
        setter: setter,
      },
    ]);
    this.propertyInfo.set('transition', [
      {
        label: 'event',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'guard',
        type: 'text',
        getter: getter,
        setter: setter,
      },
      {
        label: 'action',
        type: 'text',
        getter: getter,
        setter: setter,
      },
    ]);
    this.propertyInfo.set('Functionchart', [
      {
        label: 'name',
        type: 'text',
        getter: getter,
        setter: setter,
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
    context.addHandler('changed', change => self.onChanged_(change));

    // On ending transactions and undo/redo, layout the changed top level functioncharts.
    function updateBounds() {
      self.updateBounds_();
    }
    context.transactionManager.addHandler('transactionEnding', updateBounds);
    context.transactionManager.addHandler('didUndo', updateBounds);
    context.transactionManager.addHandler('didRedo', updateBounds);
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
      this.context.visitAll(this.palette, item => renderer.draw(item, RenderMode.Print));
      renderer.end();
    }
  }
  onChanged_(change: Change) {
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
      if (item instanceof Element || item instanceof Pseudoelement) {  // TODO class hierarchy for Elements?
        // Layout the state's incoming and outgoing transitions.
        context.forInWires(item, addItems);
        context.forOutWires(item, addItems);
      }
      changedItems.add(item);
    }

    switch (change.type) {
      case 'valueChanged': {
        const attr = prop.name;
        // For changes to x, y, width, or height, layout affected transitions.
        if (attr == 'x' || attr == 'y' || attr == 'width' || attr == 'height') {
          // Visit item and sub-items to layout all affected transitions.
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
  updateLayout_() {
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
    changedItems.forEach(item => {
      layout(item, item => {
        if (!(item instanceof Wire))
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
  updateBounds_() {
    const ctx = this.canvasController.getCtx(),
          renderer = this.renderer,
          context = this.context,
          functionchart = this.functionchart,
          changedTopLevelStates = this.changedTopLevelFunctioncharts;
    renderer.begin(ctx);
    // Update any changed items first.
    this.updateLayout_();
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
      this.updateLayout_();
      canvasController.applyTransform();

      context.visitAll(functionchart, item => {
        if (!(item instanceof Wire))
          renderer.draw(item, RenderMode.Normal);
      });
      context.visitAll(functionchart, item => {
        if (item instanceof Wire)
          renderer.draw(item, RenderMode.Normal);
      });

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
      context.visitAll(this.palette, item => {
        renderer.draw(item, RenderMode.Print);
      });
      // Draw the new object in the palette. Translate object to palette coordinates.
      const offset = canvasController.offsetToOtherCanvas(this.canvasController);
      ctx.translate(offset.x, offset.y);
      context.selection.forEach(item => {
        renderer.draw(item, RenderMode.Normal);
        renderer.draw(item, RenderMode.Highlight);
      });
      renderer.end();
    }
  }
  // print() {
  //   const renderer = this.renderer,
  //         context = this.context,
  //         statechart = this.statechart,
  //         canvasController = this.canvasController;

  //   // Calculate document bounds.
  //   const items: AllTypes[] = new Array();
  //   context.visitAll(statechart, function (item) {
  //     items.push(item);
  //   });

  //   const bounds = renderer.getBounds(items);
  //   // Adjust all edges 1 pixel out.
  //   const ctx = new (window as any).C2S(bounds.width + 2, bounds.height + 2);
  //   ctx.translate(-bounds.x + 1, -bounds.y + 1);

  //   renderer.begin(ctx);
  //   canvasController.applyTransform();

  //   context.visitAllItems(statechart.states, state => {
  //     renderer.draw(state, RenderMode.Print);
  //   });
  //   context.visitAllItems(statechart.transitions, transition => {
  //     renderer.draw(transition, RenderMode.Print);
  //   });

  //   renderer.end();

  //   // Write out the SVG file.
  //   const serializedSVG = ctx.getSerializedSvg();
  //   const blob = new Blob([serializedSVG], {
  //     type: 'text/plain'
  //   });
  //   (window as any).saveAs(blob, 'statechart.svg', true);
  // }
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
    this.updateLayout_();
    // TODO hit test selection first, in highlight, first.
    // Skip the root statechart, as hits there should go to the underlying canvas controller.
    // Hit test transitions first.
    context.reverseVisitAll(functionchart, (item: AllTypes) => {
      if (item instanceof Wire)
        pushInfo(renderer.hitTestWire(item, cp, tol, RenderMode.Normal));
    });
    context.reverseVisitAll(functionchart, (item: AllTypes) => {
      if (!(item instanceof Wire))
        pushInfo(renderer.hitTest(item, cp, tol, RenderMode.Normal));
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
    context.reverseVisitAllItems(this.palette.elements, state => {
      pushInfo(renderer.hitTest(state, p, tol, RenderMode.Normal));
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
    let drag: DragTypes | undefined, newWire: Wire | undefined;
    // First check for a drag that creates a new transition.
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
      if (pointerHitInfo instanceof ElementHitResult) {
        if (this.clickInPalette) {
          this.clickInPalette = false;  // TODO fix
          drag = new NonWireDrag([pointerHitInfo.item], 'copyPalette', 'Create new state or pseudostate');
        } else if (this.moveCopy) {
          this.moveCopy = false;  // TODO fix
          drag = new NonWireDrag(context.selectedElements(), 'moveCopySelection', 'Move copy of selection');
        } else {
          // TODO use code for resizing functionchart.
          // if (pointerHitInfo.item instanceof Element && pointerHitInfo.inner.border) {
          //   drag = new ElementDrag([pointerHitInfo.item], 'resizeFunctionchart', 'Resize functionchart');
          // } else {
            drag = new NonWireDrag(context.selectedElements(), 'moveSelection', 'Move selection');
          // }
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
          if (copy instanceof Element || copy instanceof Pseudoelement ||
              copy instanceof Functionchart) {
            copy.x -= offset.x;
            copy.y -= offset.y;
          }
        });
        drag.items = copies;
      } else if (drag.type == 'moveCopySelection') {
        const copies = context.copy() as NonWireTypes[];  // TODO fix
        drag.items = copies;
      }

      context.transactionManager.beginTransaction(drag.description);
      if (newWire) {
        context.addItem(newWire, this.functionchart);
        selection.set(newWire);
      } else {
        if (drag.type == 'copyPalette' || drag.type == 'moveCopySelection') {
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
        case 'moveSelection': {
          hitInfo = this.getFirstHit(hitList, isDropTarget) as ElementHitResult | FunctionchartHitResult;
          context.selection.forEach(item => {
            if (item instanceof Wire) return;
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
               drag.type === 'moveCopySelection')) {
      // Find state beneath mouse.
      const hitList = this.hitTestCanvas(cp),
            hitInfo = this.getFirstHit(hitList, isDropTarget);
      let parent: Functionchart = functionchart;
      if (hitInfo && (hitInfo instanceof FunctionchartHitResult)) {
        parent = hitInfo.item;
      }
      // Reparent items.
      selection.contents().forEach(item => {
        // if (!(item instanceof Functionchart))
          context.addItem(item, parent);
      });
    }

    // if (context.isValidStatechart(functionchart)) {
      transactionManager.endTransaction();
    // } else {
    //   transactionManager.cancelTransaction();
    // }

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
          keyCode = e.keyCode,  // TODO fix
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
          functionchart.elements.forEach(function (v) {  // TODO select functioncharts too
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
            this.updateBounds_();
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
        case 78: { // ctrl 'n'   // Can't intercept cmd n.
          const context = new FunctionchartContext();
          self.initializeContext(context);
          self.setContext(context);
          self.renderer.begin(self.canvasController.getCtx());
          self.updateBounds_();
          self.canvasController.draw();
          return true;
        }
        case 79: { // 'o'
        //   function parse(text: string) {
        //     const raw = JSON.parse(text),
        //           context = new FunctionchartContext();
        //     const statechart = readRaw(raw, context);
        //     self.initializeContext(context);
        //     self.setContext(context);
        //     self.renderer.begin(self.canvasController.getCtx());
        //     self.updateBounds_();
        //     self.canvasController.draw();
        // }
        //   this.fileController.openFile().then(result => parse(result));
        //   return true;
        }
        case 83: { // 's'
          let text = JSON.stringify(Serialize(functionchart), undefined, 2);
          this.fileController.saveUnnamedFile(text, 'functionchart.txt').then();
          // console.log(text);
          return true;
        }
        case 80: { // 'p'
          // this.print();
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



    connectInput: function(element, pin, p) {
      const renderer = this.model.renderer,
            parent = this.getParent(element);  // same parent as element

      p = p || renderer.pinToPoint(element, pin, true);
      const junction = this.newElement(inputElementType, p.x - 32, p.y, 'input');
      this.addItem(junction, parent);
      const wire = this.newWire(junction.id, 0, element.id, pin);
      this.addItem(wire, parent);
      return { junction: junction, wire: wire };
    },

    connectOutput: function(element, pin, p) {
      const renderer = this.model.renderer,
            parent = this.getParent(element);

      p = p || renderer.pinToPoint(element, pin, false);
      const junction = this.newElement(outputElementType, p.x + 32, p.y, 'output');
      this.addItem(junction, parent);  // same parent as element
      const wire = this.newWire(element.id, pin, junction.id, 0);
      this.addItem(wire, parent);  // same parent as element
      return { junction: junction, wire: wire };
    },

    completeGroup: function(elements) {
      const self = this,
            model = this.model,
            functionChartModel = model.functionChartModel;

      // Add junctions for disconnected pins on elements.
      elements.forEach(function(element) {
        const inputs = functionChartModel.getInputs(element),
              outputs = functionChartModel.getOutputs(element);
        inputs.forEach(function(wire, pin) {
          if (!wire)
            self.connectInput(element, pin);
        });
        outputs.forEach(function(wires, pin) {
          if (wires.length === 0)
            self.connectOutput(element, pin);
        });
      });
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

    changeType: function (item, newType) {
      const type = getType(item);
      let result;
      if (isJunction(item)) {
        if (isInput(item)) {
          let label = type.outputs[0].name;
          label = label ? '(' + label + ')' : '';
          result = '[,' + newType + label + ']';
        } else if (isOutput(item)) {
          let label = type.inputs[0].name;
          label = label ? '(' + label + ')' : '';
          result = '[' + newType + label + ',]';
        }
      }
      return result;
    },

    exportElement: function(element) {
      const model = this.model,
            dataModel = model.dataModel,
            observableModel = model.observableModel,
            type = element.type,
            newType = '[,' + type + ']';

      const result = this.newElement(newType, element.x, element.y, 'element');
      return result;
    },

    exportElements: function(elements) {
      const self = this,
            selectionModel = this.model.selectionModel;

      // Open each non-input/output element.
      elements.forEach(function(element) {
        selectionModel.remove(element);
        if (isInput(element) || isOutput(element) ||
            isLiteral(element) || isGroup(element) || isWire(element))
          return;
        const newElement = self.exportElement(element);
        self.replaceElement(element, newElement);
        selectionModel.add(newElement);
      });
    },

    openElement: function(element) {
      const model = this.model,
            dataModel = model.dataModel,
            observableModel = model.observableModel,
            type = getType(element),
            trimmedType = globalTypeParser_.trimType(element.type),
            innerType = globalTypeParser_.getUnlabeledType(trimmedType),
            newType = globalTypeParser_.addInputToType(trimmedType, innerType);

      const result = this.newElement(newType, element.x, element.y, 'abstract');
      return result;
    },

    openElements: function(elements) {
      const self = this,
            selectionModel = this.model.selectionModel;

      // Open each non-input/output element.
      elements.forEach(function(element) {
        selectionModel.remove(element);
        if (isInput(element) || isOutput(element) ||
            isLiteral(element) || isGroup(element) || isWire(element))
          return;
        const newElement = self.openElement(element);
        self.replaceElement(element, newElement);
        selectionModel.add(newElement);
      });
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

    doCopy: function() {
      const selectionModel = this.model.selectionModel;
      selectionModel.contents().forEach(function(item) {
        if (!isElementOrGroup(item))
          selectionModel.remove(item);
      });
      this.selectInteriorWires();
      this.reduceSelection();
      this.model.copyPasteModel.doCopy(this.copyItems.bind(this));
    },

    doCut: function() {
      this.doCopy();
      this.doDelete();
    },

    doPaste: function(dx, dy) {
      const copyPasteModel = this.model.copyPasteModel;
      copyPasteModel.getScrap().forEach(function(item) {
        // Offset pastes so the user can see them.
        if (isElementOrGroup(item)) {
          item.x += dx;
          item.y += dy;
        }
      });
      copyPasteModel.doPaste(this.copyItems.bind(this),
                             this.addItems.bind(this));
    },

    doComplete: function() {
      let model = this.model;
      this.reduceSelection();
      model.transactionModel.beginTransaction('complete');
      this.completeGroup(model.selectionModel.contents());
      model.transactionModel.endTransaction();
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

    doSelectConnectedElements: function(upstream) {
      let selectionModel = this.model.selectionModel,
          selection = selectionModel.contents(),
          functionChartModel = this.model.functionChartModel,
          newSelection = functionChartModel.getConnectedElements(selection, upstream, true);
      selectionModel.set(newSelection);
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
    initializeModel(model) {
      const self = this;

      functionChartModel.extend(model);
      editingModel.extend(model);
      dataModels.translatableModel.extend(model);

      this.renderer.extend(model);

      model.dataModel.initialize();
    }
    setModel(model) {
      const functionChart = model.root,
            renderer = this.renderer;

      this.model = model;
      this.diagram = model.root;
      this.functionChart = functionChart;

      renderer.setModel(model);

      // Layout any items in the functionChart.
      renderer.begin(this.canvasController.getCtx());
      reverseVisitItem(functionChart, item => renderer.layout(item));
      renderer.end();
    }
    initialize(canvasController) {
      if (canvasController === this.canvasController) {
      } else {
        assert(canvasController === this.paletteController);
        const renderer = this.renderer;
        renderer.begin(canvasController.getCtx());

        // Position every junction and literal.
        let x = 16, y = 16, h = 0;
        const spacing = 8;
        this.junctions.forEach(function (junction) {
          junction.x = x;
          junction.y = y;
          let r = renderer.getItemRect(junction);
          x += r.w + spacing;
          h = Math.max(h, r.h);
        });
        y += h + spacing;

        // Position every primitive.
        x = 16, h = 0;
        this.primitives.forEach(function (primitive) {
          primitive.x = x;
          primitive.y = y;
          let r = renderer.getItemRect(primitive);
          x += r.w + spacing;
          h = Math.max(h, r.h);
          if (x > 208) {
            x = 16, y += h + spacing, h = 0;
          }
        });
        // Layout the palette items.
        renderer.begin(this.paletteController.getCtx());
        reverseVisitItems(this.palette, item => renderer.layout(item));
        // Draw the palette items.
        visitItems(this.palette, item => renderer.draw(item));
        renderer.end();
      }
    }
    draw(canvasController) {
      const model = this.model,
            diagram = this.diagram,
            renderer = this.renderer;

      if (canvasController === this.canvasController) {
        const ctx = this.canvasController.getCtx(),
              diagram = this.diagram;
        renderer.begin(ctx);
        canvasController.applyTransform();
        model.functionChartModel.updateLayout();
        // // Draw registration frame for generating screen shots.
        // ctx.strokeStyle = renderer.theme.dimColor;
        // ctx.lineWidth = 0.5;
        // ctx.strokeRect(300, 10, 700, 300);
        visitItems(diagram.items,
          function (item) {
            renderer.draw(item, normalMode);
          }, isElementOrGroup);
        visitItems(diagram.items,
          function (wire) {
            renderer.draw(wire, normalMode);
          }, isWire);

        model.selectionModel.forEach(function (item) {
          renderer.draw(item, highlightMode);
        });

        if (this.hotTrackInfo) {
          let hitInfo = this.hotTrackInfo, item = hitInfo.item, input = hitInfo.input, output = hitInfo.output;
          if (input !== undefined || output !== undefined) {
            renderer.drawElementPin(item, input, output, hotTrackMode);
          } else {
            renderer.draw(item, hotTrackMode);
          }
        }
        let hoverHitInfo = this.hoverHitInfo;
        if (hoverHitInfo) {
          renderer.drawHoverInfo(hoverHitInfo.item, hoverHitInfo.p);
        }
        renderer.end();
      } else if (canvasController === this.paletteController) {
        // Palette drawing occurs during drag and drop. If the palette has the drag,
        // draw the canvas underneath so the new object will appear on the canvas.
        this.canvasController.draw();
        const ctx = this.paletteController.getCtx();
        renderer.begin(ctx);
        canvasController.applyTransform();
        visitItems(this.palette, function (item) {
          renderer.draw(item, printMode);
        });
        // Draw the new object in the palette. Translate object to palette coordinates.
        const offset = canvasController.offsetToOtherCanvas(this.canvasController);
        ctx.translate(offset.x, offset.y);
        model.selectionModel.forEach(function (item) {
          renderer.draw(item, normalMode);
          renderer.draw(item, highlightMode);
        });
        renderer.end();
      }
    }
    print() {
      let diagram = this.diagram,
          canvasController = this.canvasController,
          model = this.model,
          renderer = this.renderer;

      // Calculate document bounds.
      const elements = new Array();
      visitItems(diagram.items, function (item) {
        elements.push(item);
      }, isElementOrGroup);

      const bounds = renderer.getItemRect(elements);
      // Adjust all edges 1 pixel out.
      const ctx = new C2S(bounds.width * 2 + 4, bounds.height * 2 + 4);
      ctx.scale(1.5, 1.5);
      ctx.translate(-bounds.x + 2, -bounds.y + 2);

      renderer.begin(ctx);
      canvasController.applyTransform();

      visitItems(diagram.items,
        function (item) {
          renderer.draw(item, printMode);
        }, isSelectedElementOrGroup);
      visitItems(diagram.items,
        function (wire) {
          renderer.draw(wire, printMode);
        }, isSelectedWire);

      renderer.end();

      // Write out the SVG file.
      const serializedSVG = ctx.getSerializedSvg();
      const blob = new Blob([serializedSVG], {
        type: 'text/plain'
      });
      saveAs(blob, 'functionChart.svg', true);
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
    onBeginHover(canvasController) {
      // TODO hover over palette items?
      const p = canvasController.getCurrentPointerPosition(),
            hitList = this.hitTestCanvas(p),
            hoverHitInfo = this.getFirstHit(hitList, isDraggable);
      if (!hoverHitInfo)
        return false;
      hoverHitInfo.p = p;
      this.hoverHitInfo = hoverHitInfo;
      return true;
    }
    onEndHover(canvasController) {
      if (this.hoverHitInfo)
        this.hoverHitInfo = null;
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