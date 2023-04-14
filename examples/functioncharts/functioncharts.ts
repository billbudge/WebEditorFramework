import { SelectionSet } from '../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, measureNameValuePairs, CanvasController, CanvasLayer,
         PropertyGridController, PropertyInfo, FileController } from '../src/diagrams.js'

import { PointAndNormal, getExtents, projectPointToCircle, BezierCurve,
         evaluateBezier, CurveHitResult } from '../src/geometry.js'

import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, Change, ChangeEvents,
         copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet,
         reduceToRoots, List, TransactionManager, HistoryManager, ScalarPropertyTypes,
         ArrayPropertyTypes } from '../src/dataModels.js'

import * as Canvas2SVG from '../third_party/canvas2svg/canvas2svg.js'

//------------------------------------------------------------------------------

// A map from type strings to type objects. The type objects are "atomized" so
// there will only be one type object for each possible type string.

// Signature format: [inputs,outputs] with optional names, e.g.
// [v(a)v(b),v(sum)](+) for a binary addition element.

export interface Pin {
  name?: string;
  typeString: string;
  type?: Type;
}
export interface Type {
  name?: string;
  typeString: string;
  inputs: Pin[];
  outputs: Pin[];
}

export class TypeParser {
  private readonly map_ = new Map<string, Type>();

  get(s: string) : Type | undefined {
    return this.map_.get(s);
  }
  has(s: string) {
    return this.map_.has(s);
  }
  add(s: string) : Type | undefined {
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
        return { name: parseName(), typeString: 'v' };
      }
      // wildcard types
      if (s[j] === '*') {
        j++;
        return { name: parseName(), typeString: '*' };
      }
      // function types
      let type = parseFunction(),
          typeString = s.substring(i, j);
      // Add the pin type, without label.
      addType(typeString, type!);  // TODO fix
      return {
        name: parseName(),
        typeString: typeString,
        type: type,
      };
    }
    function parseFunction() : Type | undefined {
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
        const type = {
          typeString,
          inputs,
          outputs,
        };
        addType(typeString, type);
        return type;
      }
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
  trimType(type: string) : string {
    if (type[type.length - 1] === ')')
      type = type.substring(0, type.lastIndexOf('('));
    return type;
  }

  // Removes all labels from signature.
  getUnlabeledType(type: string) : string {
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

  splitType(type: string) : number {
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

  addInputToType(type: string, inputType: string) : string {
    let i = this.splitType(type);
    return type.substring(0, i) + inputType + type.substring(i);
  }

  addOutputToType(type: string, outputType: string) : string {
    let i = type.lastIndexOf(']');
    return type.substring(0, i) + outputType + type.substring(i);
  }
}

const globalTypeParser_ = new TypeParser();

// Gets the type object with information about a pin or element.
function getType(item: Element) : Type | undefined {
  let type = item.typeInfo;
  if (!type)
  type = updateType(item);
  return type;
}

function updateType(item: Element) : Type | undefined {
  const type = globalTypeParser_.add(item.type);
  item.typeInfo = type;
  return type;
}

//------------------------------------------------------------------------------

// Implement type-safe interfaces as well as a raw data interface for
// cloning, serialization, etc.

const elementTemplate = (function() {
  const typeName: string = 'element',
        id = new IdProp('id'),
        x = new ScalarProp('x'),
        y = new ScalarProp('y'),
        name = new ScalarProp('name'),
        type = new ScalarProp('type'),
        properties = [id, x, y, name, type];
  return { typeName, id, x, y, name, type, properties };
})();

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
  get type() { return this.template.type.get(this); }
  set type(value: string) { this.template.type.set(this, value); }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition: Point;
  typeInfo: Type | undefined;
  inWires: (Wire | undefined)[];  // one input per pin.
  outWires: Wire[][];             // array of outputs per pin, outputs have fan out.

  constructor(context: FunctionchartContext, id: number) {
    this.context = context;
    this.id = id;
  }
}

export class Wire implements DataContextObject {
  readonly template = wireTemplate;
  readonly context: FunctionchartContext;

  get src() { return this.template.src.get(this) as Element | undefined; }
  set src(value: Element | undefined) { this.template.src.set(this, value); }
  get srcPin() { return this.template.srcPin.get(this) || -1; }
  set srcPin(value: number) { this.template.srcPin.set(this, value); }
  get dst() { return this.template.dst.get(this) as Element | undefined; }
  set dst(value: Element | undefined) { this.template.dst.set(this, value); }
  get dstPin() { return this.template.dstPin.get(this) || -1; }
  set dstPin(value: number) { this.template.dstPin.set(this, value); }

  // Derived properties.
  parent: Functionchart | undefined;
  pSrc: PointAndNormal | undefined;
  pDst: PointAndNormal | undefined;
  bezier: BezierCurve;

  constructor(context: FunctionchartContext) {
    this.context = context;
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

  get elements() { return this.template.elements.get(this) as List<Element>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }
  get functioncharts() { return this.template.functioncharts.get(this) as List<Functionchart>; }

  // Derived properties.
  parent: Functionchart | undefined;
  globalPosition: Point;

  constructor(context: FunctionchartContext) {
    this.context = context;
  }
}

type NonWireTypes = Element | Functionchart;
type AllTypes = Element | Wire | Functionchart;

export type FunctionchartVisitor = (item: AllTypes) => void;
export type NonWireVisitor = (nonwire: NonWireTypes) => void;
export type WireVisitor = (wire: Wire) => void;

export interface GraphInfo {
  elements: Set<Element>;
  functioncharts: Set<Functionchart>;
  wires: Set<Wire>;
  interiorWires: Set<Wire>;
  inWires: Set<Wire>;
  outWires: Set<Wire>;
}

export class FunctionchartContext extends EventBase<Change, ChangeEvents>
                                  implements DataContext {
  private highestId: number = 0;  // 0 stands for no id.
  private readonly referentMap = new Map<number, Element>();

  private functionchart: Functionchart;  // The root functionchart.
  private elements = new Set<Element>;
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
      // self.makeConsistent();
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

  visitNonTransitions(item: NonWireTypes, visitor: NonWireVisitor) : void {
    const self = this;
    if (item instanceof Element) {
      visitor(item);
    } else if (item instanceof Functionchart) {
      visitor(item);
      item.elements.forEach(item => self.visitNonTransitions(item, visitor));
    }
  }

  updateItem(item: AllTypes) {
    if (item instanceof Element || item instanceof Functionchart) {
      const self = this;
      this.visitNonTransitions(item, item => self.setGlobalPosition(item));
    }
  }

  getGrandParent(item: AllTypes) : AllTypes | undefined {
    let result = item.parent;
    if (result)
      result = result.parent;
    return result;
  }

  forInWires(element: Element, visitor: WireVisitor) {
    const inputs = element.inWires;
    if (!inputs)
      return;
    inputs.forEach(wire => {
      if (wire)
      visitor(wire);
    });
  }

  forOutWires(element: Element, visitor: WireVisitor) {
    const outputs = element.outWires;
    if (!outputs)
      return;
    outputs.forEach((wires: Wire[]) => {
      wires.forEach(wire => visitor(wire))
    });
  }

  // Gets the translation to move an item from its current parent to
  // newParent. Handles the cases where current parent or newParent are undefined.
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

  getSubgraphInfo(items: Element[]) : GraphInfo {
    const self = this,
          elements = new Set<Element>(),
          functioncharts = new Set<Functionchart>(),
          wires = new Set<Wire>(),
          interiorWires = new Set<Wire>(),
          inWires = new Set<Wire>(),
          outWires = new Set<Wire>();
    // First collect states and statecharts.
    items.forEach(item => {
      this.visitAll(item, item => {
        if (item instanceof Element)
          elements.add(item);
        else if (item instanceof Functionchart)
          functioncharts.add(item);
      });
      });
    // Now collect and classify transitions that connect to them.
    items.forEach(item => {
      function addWire(wire: Wire) {
        // Stop if we've already processed this transtion (handle transitions from a state to itself.)
        if (wires.has(wire)) return;
        wires.add(wire);
        const src: Element = wire.src!,
              dst: Element = wire.dst!,
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
      if (item instanceof Element) {
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

  getConnectedElements(elements: Element[], upstream: boolean, downstream: boolean) : Set<Element> {
    const result = new Set<Element>();
    elements = elements.slice(0);  // Copy input array
    while (elements.length > 0) {
      const element = elements.pop();
      if (!element) continue;

      result.add(element);
      if (upstream) {
        this.forInWires(element, wire => {
          const src: Element = wire.src!;
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

  selectedElements() : Array<Element> {
    const result = new Array<Element>();
    this.selection.forEach(item => {
      if (item instanceof Element)
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
    } else if (item instanceof Element) {
      parent.elements.append(item);
    }
    return item;
  }

  addItems(items: AllTypes[], parent: Functionchart) {
    // Add states first, then transitions, so the context can track transitions.
    for (let item of items) {
      if (item instanceof Element)
        this.addItem(item, parent);
    }
    for (let item of items) {
      if (item instanceof Wire)
        this.addItem(item, parent);
    }
  }

  copy() : AllTypes[] {
    const statechart = this.functionchart,
          selection = this.selection;

    selection.set(this.selectedElements());
    this.selectInteriorWires();
    this.reduceSelection();

    const selected = selection.contents(),
          map = new Map<number, Element>(),
          copies = copyItems(selected, this, map);

    selected.forEach(item => {
      if (item instanceof Element) {
        const copy = map.get(item.id);
        if (copy) {
          const translation = this.getToParent(item, statechart);
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
      if (item instanceof Element || item instanceof Functionchart) {
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

  private insertElement_(element: Element, parent: Functionchart) {
    this.elements.add(element);
    element.parent = parent;
    // this.updateItem(state);

    if (element.inWires === undefined)
      element.inWires = new Array<Wire>();
    if (element.outWires === undefined)
      element.outWires = new Array<Wire[]>();
  }

  makeConsistent () {
    const self = this,
          statechart = this.functionchart,
          graphInfo = this.getGraphInfo();
    // Eliminate dangling transitions.
    graphInfo.wires.forEach(wire => {
      const src = wire.src,
            dst = wire.dst;
      if (!src || !graphInfo.elements.has(src) ||
          !dst || !graphInfo.elements.has(dst)) {
        self.deleteItem(wire);
        return;
      }
      // Make sure transitions belong to lowest common functionchart.
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

  private removeElement_(element: Element) {
    this.elements.delete(element);
  }

  private insertFunctionchart_(functionchart: Functionchart, parent: Functionchart | undefined) {
    this.functioncharts.add(functionchart);
    functionchart.parent = parent;
    // this.updateItem(statechart);

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
    // this.updateItem(transition);

    const src = wire.src,
          dst = wire.dst;
    if (src) {
      const outputs = src.outWires[wire.srcPin];
      if (!outputs.includes(wire))
        outputs.push(wire);
    }
    if (dst) {
      dst.inWires[wire.srcPin] = wire;
    }
  }

  private removeWire_(wire: Wire) {
    this.wires.delete(wire);
    const src = wire.src,
          dst = wire.dst;
    function remove(array: Array<Wire>, item: Wire) {
      const index = array.indexOf(item);
      if (index >= 0) {
        array.splice(index, 1);
      }
    }
    if (src) {
      const outputs = src.outWires[wire.srcPin];
      remove(outputs, wire);
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
      // Remove and reinsert changed transitions.
      const parent = owner.parent;
      if (parent) {
        this.removeWire_(owner);
        this.insertWire_(owner, parent);
      }
    }
    this.onValueChanged(owner, prop, oldValue);
    // this.updateItem(owner);  // Update any derived properties.
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
  resolveReference(owner: AllTypes, prop: ReferenceProp) : Element | undefined {
    // Look up state id.
    const id: number = prop.getId(owner);
    if  (!id)
      return undefined;
    return this.referentMap.get(id);
  }
  construct(typeName: string) : AllTypes {
    switch (typeName) {
      case 'element': return this.newElement();
      // case 'start':
      // case 'stop':
      // case 'history':
      // case 'history*': return this.newPseudostate(typeName);
      // case 'transition': return this.newTransition(undefined, undefined);
      // case 'statechart': return this.newStatechart();
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
  textIndent: number = 8;
  textLeading: number = 6;
  knobbyRadius: number = 4;
  padding: number = 8;


  constructor(theme: Theme, radius: number = 8) {
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
  item: Element;
  inner: RectHitResult;
  arrow: boolean = false;
  constructor(item: Element, inner: RectHitResult) {
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

  // getBounds(item: NonWireTypes) : Rect {
  //   const global = item.globalPosition;
  //   let x = global.x,
  //       y = global.y);
  //   if (item instanceof Element) {
  //     const type = getType(item);
  //     if (!type[_hasLayout])
  //       this.layoutType(type);
  //     // Palette items aren't part of any model, so have no translatableModel x or y.
  //     if (x === undefined) x = item.x;
  //     if (y === undefined) y = item.y;
  //     return { x: x, y: y, w: type[_width], h: type[_height] };
  //   }
  //   if (isGroup(item)) {
  //     if (!item[_hasLayout])
  //       this.layoutGroup(item);
  //     return { x: x, y: y, w: item[_width], h: item[_height] };
  //   }
  // }

  // setBounds(item, width, height) {
  //   assert(!isWire(item));
  //   item[_width] = width;
  //   item[_height] = height;
  // }

  // getUnionBounds(items) {
  //   let xMin = Number.POSITIVE_INFINITY, yMin = Number.POSITIVE_INFINITY,
  //       xMax = -Number.POSITIVE_INFINITY, yMax = -Number.POSITIVE_INFINITY;
  //   for (let item of items) {
  //     if (isWire(item))
  //       continue;
  //     const rect = this.getBounds(item);
  //     xMin = Math.min(xMin, rect.x);
  //     yMin = Math.min(yMin, rect.y);
  //     xMax = Math.max(xMax, rect.x + rect.w);
  //     yMax = Math.max(yMax, rect.y + rect.h);
  //   }
  //   return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
  // }

  // pinToPoint(element, index, isInput) {
  //   assert(isElement(element));
  //   const rect = this.getBounds(element),
  //       w = rect.w, h = rect.h,
  //       type = getType(element);
  //   let x = rect.x, y = rect.y,
  //       pin, nx;
  //   if (isInput) {
  //     pin = type.inputs[index];
  //     nx = -1;
  //   } else {
  //     pin = type.outputs[index];
  //     nx = 1;
  //     x += w;
  //   }
  //   y += pin[_y] + pin[_height] / 2;
  //   return { x: x, y: y, nx: nx, ny: 0 }
  // }

  // // Compute sizes for an element type.
  // layoutType(type) {
  //   assert(!type[_hasLayout]);
  //   const self = this,
  //         model = this.model,
  //         ctx = this.ctx, theme = this.theme,
  //         textSize = theme.fontSize, spacing = theme.spacing,
  //         name = type.name,
  //         inputs = type.inputs, outputs = type.outputs;
  //   let height = 0, width = 0;
  //   if (name) {
  //     width = 2 * spacing + ctx.measureText(name).width;
  //     height += textSize + spacing / 2;
  //   } else {
  //     height += spacing / 2;
  //   }

  //   function layoutPins(pins) {
  //     let y = height, w = 0;
  //     for (let i = 0; i < pins.length; i++) {
  //       let pin = pins[i];
  //       self.layoutPin(pin);
  //       pin[_y] = y + spacing / 2;
  //       let name = pin.name, pw = pin[_width], ph = pin[_height] + spacing / 2;
  //       if (name) {
  //         pin[_baseline] = y + textSize;
  //         if (textSize > ph) {
  //           pin[_y] += (textSize - ph) / 2;
  //           ph = textSize;
  //         } else {
  //           pin[_baseline] += (ph - textSize) / 2;
  //         }
  //         pw += 2 * spacing + ctx.measureText(name).width;
  //       }
  //       y += ph;
  //       w = Math.max(w, pw);
  //     }
  //     return [y, w];
  //   }
  //   const [yIn, wIn] = layoutPins(inputs);
  //   const [yOut, wOut] = layoutPins(outputs);

  //   this.setBounds(
  //     type,
  //     Math.round(Math.max(width, wIn + 2 * spacing + wOut, theme.minTypeWidth)),
  //     Math.round(Math.max(yIn, yOut, theme.minTypeHeight) + spacing / 2));

  //   type[_hasLayout] = true;
  // }

  // layoutPin(pin) {
  //   const theme = this.theme;
  //   if (pin.type === 'v' || pin.type === '*') {
  //     pin[_width] = pin[_height] = 2 * theme.knobbyRadius;
  //   } else {
  //     const type = getType(pin);
  //     if (!type[_hasLayout])
  //       this.layoutType(type);
  //     pin[_width] = type[_width];
  //     pin[_height] = type[_height];
  //   }
  // }

  // layoutWire(wire) {
  //   assert(!wire[_hasLayout]);
  //   let src = this.getWireSrc(wire),
  //       dst = this.getWireDst(wire),
  //       p1 = wire[_p1],
  //       p2 = wire[_p2];
  //   // Since we intercept change events and not transactions, wires may be in
  //   // an inconsistent state, so check before creating the path.
  //   if (src && wire.srcPin !== undefined) {
  //     p1 = this.pinToPoint(src, wire.srcPin, false);
  //   }
  //   if (dst && wire.dstPin !== undefined) {
  //     p2 = this.pinToPoint(dst, wire.dstPin, true);
  //   }
  //   if (p1 && p2) {
  //     wire[_bezier] = diagrams.getEdgeBezier(p1, p2);
  //   }
  //   wire[_hasLayout] = true;
  // }

  // // Make sure a group is big enough to enclose its contents.
  // layoutGroup(group) {
  //   assert(!group[_hasLayout]);
  //   const self = this, spacing = this.theme.spacing;
  //   function layout(group) {
  //     const extents = self.getUnionBounds(group.items),
  //           translatableModel = self.model.translatableModel,
  //           groupX = translatableModel.globalX(group),
  //           groupY = translatableModel.globalY(group),
  //           margin = 2 * spacing,
  //           type = getType(group);
  //     let width = extents.x + extents.w - groupX + margin,
  //         height = extents.y + extents.h - groupY + margin;
  //     if (!type[_hasLayout])
  //       self.layoutType(type);
  //     width += type[_width];
  //     height = Math.max(height, type[_height] + margin);
  //     self.setBounds(group, width, height);
  //   }
  //   // Visit in reverse order to correctly include sub-group bounds.
  //   reverseVisitItem(group, function(group) {
  //     layout(group);
  //   }, isGroup);

  //   group[_hasLayout] = true;
  // }

  // drawType(type, x, y, fillOutputs) {
  //   if (!type[_hasLayout])
  //     this.layoutType(type);

  //   const self = this, ctx = this.ctx, theme = this.theme,
  //         textSize = theme.fontSize, spacing = theme.spacing,
  //         name = type.name,
  //         w = type[_width], h = type[_height],
  //         right = x + w;
  //   ctx.lineWidth = 0.5;
  //   ctx.fillStyle = theme.textColor;
  //   ctx.textBaseline = 'bottom';
  //   if (name) {
  //     ctx.textAlign = 'center';
  //     ctx.fillText(name, x + w / 2, y + textSize + spacing / 2);
  //   }
  //   type.inputs.forEach(function(pin, i) {
  //     const name = pin.name;
  //     self.drawPin(pin, x, y + pin[_y], false);
  //     if (name) {
  //       ctx.textAlign = 'left';
  //       ctx.fillText(name, x + pin[_width] + spacing, y + pin[_baseline]);
  //     }
  //   });
  //   type.outputs.forEach(function(pin) {
  //     const name = pin.name,
  //           pinLeft = right - pin[_width];
  //     self.drawPin(pin, pinLeft, y + pin[_y], fillOutputs);
  //     if (name) {
  //       ctx.textAlign = 'right';
  //       ctx.fillText(name, pinLeft - spacing, y + pin[_baseline]);
  //     }
  //   });
  // }

  // drawPin(pin, x, y, fill) {
  //   const ctx = this.ctx,
  //         theme = this.theme;
  //   ctx.strokeStyle = theme.strokeColor;
  //   if (pin.type === 'v' || pin.type === '*') {
  //     const r = theme.knobbyRadius;
  //     ctx.beginPath();
  //     if (pin.type === 'v') {
  //       const d = 2 * r;
  //       ctx.rect(x, y, d, d);
  //     } else {
  //       ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
  //     }
  //     ctx.stroke();
  //   } else {
  //     const type = getType(pin),
  //           width = type[_width], height = type[_height];
  //     ctx.beginPath();
  //     ctx.rect(x, y, width, height);
  //     // if (level == 1) {
  //     //   ctx.fillStyle = theme.altBgColor;
  //     //   ctx.fill();
  //     // }
  //     ctx.stroke();
  //     this.drawType(type, x, y);
  //   }
  // }

  // drawElement(element, mode) {
  //   const ctx = this.ctx,
  //         theme = this.theme, spacing = theme.spacing,
  //         rect = this.getBounds(element),
  //         x = rect.x, y = rect.y, w = rect.w, h = rect.h,
  //         right = x + w, bottom = y + h;

  //   switch (element.elementKind) {
  //     case 'input':
  //       diagrams.inFlagPath(x, y, w, h, spacing, ctx);
  //       break;
  //     case 'output':
  //       diagrams.outFlagPath(x, y, w, h, spacing, ctx);
  //       break;
  //     default:
  //       ctx.beginPath();
  //       ctx.rect(x, y, w, h);
  //       break;
  //   }

  //   switch (mode) {
  //     case normalMode:
  //       ctx.fillStyle = element.state === 'palette' ? theme.altBgColor : theme.bgColor;
  //       ctx.fill();
  //       ctx.strokeStyle = theme.strokeColor;
  //       ctx.lineWidth = 0.5;
  //       ctx.stroke();
  //       let type = getType(element);
  //       this.drawType(type, x, y, 0);
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

  // drawElementPin(element, input, output, mode) {
  //   const theme = this.theme,
  //         ctx = this.ctx,
  //         rect = this.getBounds(element),
  //         type = getType(element);
  //   let x = rect.x, y = rect.y, w = rect.w, h = rect.h,
  //       right = x + w,
  //       pin;

  //   if (input !== undefined) {
  //     pin = type.inputs[input];
  //   } else if (output !== undefined) {
  //     pin = type.outputs[output];
  //     x = right - pin[_width];
  //   }
  //   ctx.beginPath();
  //   ctx.rect(x, y + pin[_y], pin[_width], pin[_height]);

  //   switch (mode) {
  //     case normalMode:
  //       ctx.strokeStyle = theme.strokeColor;
  //       ctx.lineWidth = 1;
  //       break;
  //     case highlightMode:
  //       ctx.strokeStyle = theme.highlightColor;
  //       ctx.lineWidth = 2;
  //       break;
  //     case hotTrackMode:
  //       ctx.strokeStyle = theme.hotTrackColor;
  //       ctx.lineWidth = 2;
  //       break;
  //   }
  //   ctx.stroke();
  // }

  // // Gets the bounding rect for the group instancing element.
  // getGroupInstanceBounds(type, groupRight, groupBottom) {
  //   const theme = this.theme, spacing = theme.spacing,
  //         width = type[_width], height = type[_height],
  //         x = groupRight - width - spacing, y = groupBottom - height - spacing;
  //   return { x: x, y: y, w: width, h: height };
  // }

  // drawGroup(group, mode) {
  //   if (!group[_hasLayout])
  //     this.layoutGroup(group);
  //   const ctx = this.ctx,
  //         theme = this.theme,
  //         rect = this.getBounds(group),
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

  // hitTestElement(element, p, tol, mode) {
  //   const rect = this.getBounds(element),
  //         x = rect.x, y = rect.y, width = rect.w, height = rect.h,
  //         hitInfo = diagrams.hitTestRect(x, y, width, height, p, tol);
  //   if (hitInfo) {
  //     const type = getType(element);
  //     assert(type[_hasLayout]);
  //     type.inputs.forEach(function(input, i) {
  //       if (diagrams.hitTestRect(x, y + input[_y],
  //                                input[_width], input[_height], p, 0)) {
  //         hitInfo.input = i;
  //       }
  //     });
  //     type.outputs.forEach(function(output, i) {
  //       if (diagrams.hitTestRect(x + width - output[_width], y + output[_y],
  //                                output[_width], output[_height], p, 0)) {
  //         hitInfo.output = i;
  //       }
  //     });
  //   }
  //   return hitInfo;
  // }

  // hitTestGroup(group, p, tol, mode) {
  //   const rect = this.getBounds(group),
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

  // drawWire(wire, mode) {
  //   if (!wire[_hasLayout])
  //     this.layoutWire(wire);
  //   const theme = this.theme,
  //         ctx = this.ctx;
  //   diagrams.bezierEdgePath(wire[_bezier], ctx, 0);
  //   switch (mode) {
  //     case normalMode:
  //       ctx.strokeStyle = theme.strokeColor;
  //       ctx.lineWidth = 1;
  //       break;
  //     case highlightMode:
  //       ctx.strokeStyle = theme.highlightColor;
  //       ctx.lineWidth = 2;
  //       break;
  //     case hotTrackMode:
  //       ctx.strokeStyle = theme.hotTrackColor;
  //       ctx.lineWidth = 2;
  //       break;
  //   }
  //   ctx.stroke();
  // }

  // hitTestWire(wire, p, tol, mode) {
  //   // TODO don't hit test new wire as it's dragged!
  //   if (!wire[_hasLayout])
  //     return;
  //   return diagrams.hitTestBezier(wire[_bezier], p, tol);
  // }

  // draw(item, mode) {
  //   switch (item.kind) {
  //     case 'element':
  //       this.drawElement(item, mode);
  //       break;
  //     case 'group':
  //       this.drawGroup(item, mode);
  //       break;
  //     case 'wire':
  //       this.drawWire(item, mode);
  //       break;
  //   }
  // }

  // hitTest(item, p, tol, mode) {
  //   let hitInfo;
  //   switch (item.kind) {
  //     case 'element':
  //       hitInfo = this.hitTestElement(item, p, tol, mode);
  //       break;
  //     case 'group':
  //       hitInfo = this.hitTestGroup(item, p, tol, mode);
  //       break;
  //     case 'wire':
  //       hitInfo = this.hitTestWire(item, p, tol, mode);
  //       break;
  //   }
  //   if (hitInfo && !hitInfo.item)
  //     hitInfo.item = item;
  //   return hitInfo;
  // }

  // layout(item) {
  //   switch (item.kind) {
  //     case 'element':
  //       break;
  //     case 'group':
  //       this.layoutGroup(item);
  //       break;
  //     case 'wire':
  //       this.layoutWire(item);
  //       break;
  //   }
  // }

  // drawHoverInfo(item, p) {
  //   const self = this, theme = this.theme, ctx = this.ctx,
  //         x = p.x, y = p.y;
  //   ctx.fillStyle = theme.hoverColor;
  //   if (isGroupInstance(item)) {
  //     const groupItems = getDefinition(item);
  //     let r = this.getUnionBounds(groupItems);
  //     ctx.translate(x - r.x, y - r.y);
  //     let border = 4;
  //     ctx.fillRect(r.x - border, r.y - border, r.w + 2 * border, r.h + 2 * border);
  //     ctx.fillStyle = theme.hoverTextColor;
  //     visitItems(groupItems, item => self.draw(item, normalMode), isElementOrGroup);
  //     visitItems(groupItems, wire => self.draw(wire, normalMode), isWire);
  //   } else {
  //     // // Just list properties as text.
  //     // let props = [];
  //     // this.model.dataModel.visitProperties(item, function(item, attr) {
  //     //   let value = item[attr];
  //     //   if (Array.isArray(value))
  //     //     return;
  //     //   props.push({ name: attr, value: value });
  //     // });
  //     // let textSize = theme.fontSize, gap = 16, border = 4,
  //     //     height = textSize * props.length + 2 * border,
  //     //     maxWidth = diagrams.measureNameValuePairs(props, gap, ctx) + 2 * border;
  //     // ctx.fillRect(x, y, maxWidth, height);
  //     // ctx.fillStyle = theme.hoverTextColor;
  //     // props.forEach(function(prop) {
  //     //   ctx.textAlign = 'left';
  //     //   ctx.fillText(prop.name, x + border, y + textSize);
  //     //   ctx.textAlign = 'right';
  //     //   ctx.fillText(prop.value, x + maxWidth - border, y + textSize);
  //     //   y += textSize;
  //     // });
  //   }
  // }
}

/*
// FunctionCharts module.

const functionCharts = (function() {
'use strict';

function isFunctionChart(item) {
  return item.kind === 'functionChart';
}

function isContainer(item) {
  return item.kind === 'functionChart' || item.kind === 'group';
}

function isElement(item) {
  return item.kind === 'element';
}

function isGroup(item) {
  return item.kind === 'group';
}

function isElementOrGroup(item) {
  return isElement(item) || isGroup(item);
}

function isGroupInstance(item) {
  return isElement(item) && item.definitionId;
}

function isWire(item) {
  return item.kind === 'wire';
}

function isLiteral(item) {
  return item.elementKind === 'literal';
}

function isJunction(item) {
  return item.elementKind === 'input' || item.elementKind === 'output';
}

function isClosed(item) {
  return item.elementKind === 'closed';
}

function isAbstract(item) {
  return item.elementKind === 'abstract';
}

function isInput(item) {
  return item.elementKind === 'input';
}

function isOutput(item) {
  return item.elementKind === 'output';
}

function isInputPinLabeled(item) {
  return isOutput(item) || isAbstract(item);
}

function isOutputPinLabeled(item) {
  return isInput(item) || isLiteral(item) || isClosed(item);
}

function isPaletted(item) {
  return item.state === 'palette';
}

function isFunctionType(type) {
  return type[0] === '[';
}

// Visits in pre-order.
function visitItem(item, fn, filter) {
  if (!filter || filter(item)) {
    fn(item);
  }
  if (isContainer(item) && item.items) {
    visitItems(item.items, fn, filter);
  }
}

function visitItems(items, fn, filter) {
  items.forEach(item => visitItem(item, fn, filter));
}

// Visits in post-order.
function reverseVisitItem(item, fn, filter) {
  if (isContainer(item) && item.items) {
    reverseVisitItems(item.items, fn, filter);
  }
  if (!filter || filter(item)) {
    fn(item);
  }
}

function reverseVisitItems(items, fn, filter) {
  for (let i = items.length - 1; i >= 0; i--) {
    reverseVisitItem(items[i], fn, filter);
  }
}

const inputElementType = '[,*]',
      outputElementType = '[*,]';

const _type = Symbol('type'),
      _contextType = Symbol('contextType');

const _x = Symbol('x'),
      _y = Symbol('y'),
      _baseline = Symbol('baseline'),
      _width = Symbol('width'),
      _height = Symbol('height'),
      _p1 = Symbol('p1'),
      _p2 = Symbol('p2'),
      _bezier = Symbol('bezier'),
      _hasLayout = Symbol('hasLayout');

function extendTheme(theme) {
  const extensions = {
    spacing: 6,
    knobbyRadius: 4,

    minTypeWidth: 8,
    minTypeHeight: 8,
  }
  return Object.assign(diagrams.theme.createDefault(), extensions, theme);
}

//------------------------------------------------------------------------------



//------------------------------------------------------------------------------

const _definition = Symbol('definition'),
      _definitionsAttr = 'definitions';

function getDefinition(item) {
  return item[_definition];
}

//------------------------------------------------------------------------------

// Maintains:
// - maps from element to connected input and output wires.
// - information about graphs and subgraphs.

const _inputs = Symbol('inputs'),
      _outputs = Symbol('outputs');

const functionChartModel = (function() {

  const proto = {
    getInputs: function(element) {
      assert(isElement(element));
      return element[_inputs];
    },

    getOutputs: function(element) {
      assert(isElement(element));
      return element[_outputs];
    },

    forInputWires: function(element, fn) {
      const inputs = this.getInputs(element);
      if (!inputs)
        return;
      inputs.forEach((input, i) => { if (input) fn(input, i); });
    },

    forOutputWires: function(element, fn) {
      const arrays = this.getOutputs(element);
      if (!arrays)
        return;
      arrays.forEach((outputs, i) => outputs.forEach(output => fn(output, i)));
    },

    getGraphInfo: function() {
      return {
        elementsAndGroups: this.elementsAndGroups_,
        wires: this.wires_,
        interiorWires: this.wires_,
        incomingWires: new diagrammar.collections.EmptySet(),
        outgoingWires: new diagrammar.collections.EmptySet(),
      }
    },

    getSubgraphInfo: function(items) {
      const self = this,
            elementsAndGroups = new Set(),
            wires = new Set(),
            interiorWires = new Set(),
            incomingWires = new Set(),
            outgoingWires = new Set();
      // First collect elements and groups.
      visitItems(items, function(item) {
        elementsAndGroups.add(item);
      }, isElementOrGroup);
      // Now collect and classify wires that connect to elements.
      visitItems(items, function(element) {
        function addWire(wire) {
          wires.add(wire);
          const src = self.getWireSrc(wire),
                dst = self.getWireDst(wire),
                srcInside = elementsAndGroups.has(src),
                dstInside = elementsAndGroups.has(dst);
          if (srcInside) {
            if (dstInside) {
              interiorWires.add(wire);
            } else {
              outgoingWires.add(wire);
            }
          }
          if (dstInside) {
            if (!srcInside) {
              incomingWires.add(wire);
            }
          }
        }
        self.forInputWires(element, addWire);
        self.forOutputWires(element, addWire);
      }, isElement);

      return {
        elementsAndGroups: elementsAndGroups,
        wires: wires,
        interiorWires: interiorWires,
        incomingWires: incomingWires,
        outgoingWires: outgoingWires,
      }
    },

    getConnectedElements: function(elements, upstream, downstream) {
      const self = this,
            result = new Set();
      while (elements.length > 0) {
        const element = elements.pop();
        if (!isElement(element))
          continue;

        result.add(element);

        if (upstream) {
          this.forInputWires(element, function(wire) {
            const src = self.getWireSrc(wire);
            if (!result.has(src))
              elements.push(src);
          });
        }
        if (downstream) {
          this.forOutputWires(element, function(wire) {
            const dst = self.getWireDst(wire);
            if (!result.has(dst))
              elements.push(dst);
          });
        }
      }
      return result;
    },

    insertElement_: function(element) {
      this.elementsAndGroups_.add(element);
      const type = getType(element);
      // Initialize maps for new elements.
      if (element[_inputs] === undefined) {
        assert(element[_outputs] === undefined);
        // array of incoming wires.
        element[_inputs] = new Array(type.inputs.length).fill(null);
        // array of arrays of outgoing wires.
        const arrays = [...Array(type.outputs.length)].map(() => new Array());
        element[_outputs] = arrays;
      }
    },

    addWireToInputs_: function(wire, element, pin) {
      if (!element || pin === undefined) return;
      const inputs = this.getInputs(element);
      inputs[pin] = wire;
    },

    addWireToOutputs_: function(wire, element, pin) {
      if (!element || pin === undefined) return;
      const outputs = this.getOutputs(element);
      outputs[pin].push(wire);
    },

    insertWire_: function(wire) {
      this.wires_.add(wire);
      this.addWireToOutputs_(wire, this.getWireSrc(wire), wire.srcPin);
      this.addWireToInputs_(wire, this.getWireDst(wire), wire.dstPin);
    },

    insertItem_: function(item) {
      if (isElement(item)) {
        this.insertElement_(item);
      } else if (isWire(item)) {
        this.insertWire_(item);
      } else if (isGroup(item)) {
        this.elementsAndGroups_.add(item);
        const self = this;
        item.items.forEach(subItem => self.insertItem_(subItem));
      }
    },

    removeElement_: function(element) {
      this.elementsAndGroups_.delete(element);
    },

    removeWireFromInputs_: function(wire, element, pin) {
      if (!element || pin === undefined) return;
      const inputs = this.getInputs(element);
      if (inputs)
        inputs[pin] = null;
    },

    removeWireFromOutputs_: function(wire, element, pin) {
      if (!element || pin === undefined) return;
      const outputArrays = this.getOutputs(element);
      if (outputArrays) {
        const outputs = outputArrays[pin];
        const index = outputs.indexOf(wire);
        if (index >= 0) {
          outputs.splice(index, 1);
        }
      }
    },

    removeWire_: function(wire) {
      this.wires_.delete(wire);
      this.removeWireFromOutputs_(wire, this.getWireSrc(wire), wire.srcPin);
      this.removeWireFromInputs_(wire, this.getWireDst(wire), wire.dstPin);
    },

    removeItem_: function(item) {
      if (isElement(item)) {
        this.removeElement_(item);
      } else if (isWire(item)) {
        this.removeWire_(item);
      } else if (isGroup(item)) {
        this.elementsAndGroups_.delete(item);
        const self = this;
        item.items.forEach(subItem => self.removeItem_(subItem));
      }
    },

    // May be called inside transactions, to update wires during drags.
    updateLayout: function() {
      const self = this,
            functionChartModel = this.model.functionChartModel;
      this.changedElements_.forEach(function(element) {
        function markWire(wire) {
          wire[_hasLayout] = false;
        }
        functionChartModel.forInputWires(element, markWire);
        functionChartModel.forOutputWires(element, markWire);
      });
      this.changedElements_.clear();
    },

    // Called at the end of transactions and undo/redo, to update bounds.
    updateGroupLayout: function() {
      this.changedTopLevelGroups_.forEach(group => group[_hasLayout] = false);
      this.changedTopLevelGroups_.clear();
    },

    addTopLevelGroup_: function(item) {
      let hierarchicalModel = this.model.hierarchicalModel,
          ancestor = item;
      do {
        item = ancestor;
        ancestor = hierarchicalModel.getParent(ancestor);
      } while (ancestor && !isFunctionChart(ancestor));

      if (isGroup(item)) {
        this.changedTopLevelGroups_.add(item);
      }
    },

    updateLayout_: function(item) {
      const self = this;
      if (isWire(item)) {
        item[_hasLayout] = false;
      } else if (isElement(item)) {
        this.changedElements_.add(item);
        this.addTopLevelGroup_(item);
        if (item.items) {
          visitItems(item.items, child => self.updateLayout_(child));
        }
      } else if (isGroup(item)) {
        visitItems(item.items, child => self.updateLayout_(child));
      }
    },

    onChanged_: function (change) {
      const item = change.item,
            attr = change.attr;
      this.updateLayout_(item);
      switch (change.type) {
        case 'change': {
          if (isWire(item)) {
            // Changed wires need layout.
            item[_hasLayout] = false;
            // Wires may pass through invalid states, since each connection
            // requires two edits to change. insertWire_ and removeWire_ should
            // handle non-existent connections.
            if (attr == 'srcId' || attr == 'srcPin' ||
                attr == 'dstId' || attr == 'dstPin') {
              const referencingModel = this.model.referencingModel,
                    oldValue = change.oldValue,
                    newValue = item[attr];
              item[attr] = oldValue;
              referencingModel.resolveReference(item, 'srcId');
              referencingModel.resolveReference(item, 'dstId');
              this.removeWire_(item);

              item[attr] = newValue;
              referencingModel.resolveReference(item, 'srcId');
              referencingModel.resolveReference(item, 'dstId');
              this.insertWire_(item);
            }
          } else if (isElementOrGroup(item) && attr == 'type') {
            // Type changed due to update or relabeling.
            updateType(item);
            item[_hasLayout] = false;
          }
          break;
        }
        case 'insert': {
          const newValue = item[attr][change.index];
          this.updateLayout_(newValue);
          this.insertItem_(newValue);
          break;
        }
        case 'remove': {
          const oldValue = change.oldValue;
          this.removeItem_(oldValue);
        }
      }
    },

    checkConsistency: function() {
      const self = this,
            mappedWires = new Set();
      this.elementsAndGroups_.forEach(function(element) {
        if (!isElement(element)) return;
        self.getInputs(element).forEach(function(wire) {
          if (wire) mappedWires.add(wire);
        });
        self.getOutputs(element).forEach(function(wires) {
          wires.forEach(function(wire) {
            if (wire) mappedWires.add(wire);
          });
        });
      });
      return true;
    },
  }

  function extend(model) {
    if (model.functionChartModel)
      return model.functionChartModel;

    dataModels.observableModel.extend(model);
    dataModels.referencingModel.extend(model);
    dataModels.hierarchicalModel.extend(model);

    let instance = Object.create(proto);
    instance.model = model;
    instance.functionChart = model.root;

    instance.elementsAndGroups_ = new Set();
    instance.wires_ = new Set();

    instance.changedElements_ = new Set();
    instance.changedTopLevelGroups_ = new Set();

    instance.functionChart.items.forEach(item => instance.updateLayout_(item));

    model.observableModel.addHandler('changed',
                                     change => instance.onChanged_(change));

    const transactionModel = model.transactionModel;
    if (transactionModel) {
      function update() {
        instance.updateGroupLayout();
      }
      transactionModel.addHandler('transactionEnded', update);
      transactionModel.addHandler('didUndo', update);
      transactionModel.addHandler('didRedo', update);
    }

    instance.getWireSrc = model.referencingModel.getReferenceFn('srcId');
    instance.getWireDst = model.referencingModel.getReferenceFn('dstId');

    // Initialize elements and wires.
    visitItem(instance.functionChart, function(element) {
      instance.insertElement_(element);
    }, isElement);
    visitItem(instance.functionChart, function(wire) {
      instance.insertWire_(wire);
    }, isWire);

    model.functionChartModel = instance;
    return instance;
  }

  return {
    extend: extend,
  }
})();

//------------------------------------------------------------------------------

const editingModel = (function() {
  const proto = {
    getParent: function(item) {
      return this.model.hierarchicalModel.getParent(item);
    },

    reduceSelection: function () {
      let model = this.model;
      model.selectionModel.set(model.hierarchicalModel.reduceSelection());
    },

    selectInteriorWires: function() {
      const model = this.model,
            selectionModel = model.selectionModel,
            graphInfo = model.functionChartModel.getSubgraphInfo(selectionModel.contents());
      selectionModel.add(graphInfo.interiorWires);
    },

    newItem: function(item) {
      const dataModel = this.model.dataModel;
      dataModel.assignId(item);
      dataModel.initialize(item);
      return item;
    },

    newItems: function(items) {
      const self = this;
      items.forEach(item => self.newItem(item));
    },

    newElement: function(type, x, y, elementKind) {
      const result = {
        kind: 'element',
        type: type,
        state: 'normal',
        x: x,
        y: y,
      }
      if (elementKind)
        result.elementKind = elementKind;

      return this.newItem(result);
    },

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

    newWire: function(srcId, srcPin, dstId, dstPin) {
      const result = {
        kind: 'wire',
        srcId: srcId,
        srcPin: srcPin,
        dstId: dstId,
        dstPin: dstPin,
      }
      return this.newItem(result);
    },

    getItemIndex: function(item) {
      const parent = this.getParent(item);
      assert(parent);
      return parent.items.indexOf(item);
    },

    deleteItem: function(item) {
      const model = this.model,
            parent = this.getParent(item),
            index = this.getItemIndex(item);
      assert(index >= 0);
      model.observableModel.removeElement(parent, 'items', index);
      model.selectionModel.remove(item);
      return index;
    },

    deleteItems: function(items) {
      const self = this;
      items.forEach(item => self.deleteItem(item));
    },

    doDelete: function() {
      this.reduceSelection();
      this.model.copyPasteModel.doDelete(this.deleteItems.bind(this));
    },

    copyItems: function(items, map) {
      const model = this.model,
            diagram = this.diagram,
            dataModel = model.dataModel,
            translatableModel = model.translatableModel,
            copies = this.model.copyPasteModel.cloneItems(items, map);
      items.forEach(function(item) {
        const copy = map.get(dataModel.getId(item));
        if (isElementOrGroup(copy)) {
          // De-palettize clone.
          copy.state = 'normal';
          // Clone coordinates should be in functionChart-space. Get global position
          // from original item.
          const translation = translatableModel.getToParent(item, diagram);
          copy.x += translation.x;
          copy.y += translation.y;
        }
      });
      return copies;
    },

    addItem: function(item, parent, index) {
      const model = this.model,
            translatableModel = model.translatableModel,
            oldParent = this.getParent(item);
      if (!parent)
        parent = this.diagram;
      if (oldParent === parent)
        return;
      if (isFunctionChart(parent) || isGroup(parent)) {
        if (!Array.isArray(parent.items))
          model.observableModel.changeValue(parent, 'items', []);
      }
      if (oldParent !== parent) {
        if (isElementOrGroup(item)) {
          let translation = translatableModel.getToParent(item, parent);
          model.observableModel.changeValue(item, 'x', item.x + translation.x);
          model.observableModel.changeValue(item, 'y', item.y + translation.y);
        }

        if (oldParent)
          this.deleteItem(item);
        if (index === undefined)
          index = parent.items.length;
        model.observableModel.insertElement(parent, 'items', index, item);
      }
      return item;
    },

    addItems: function(items, parent) {
      // Add elements and groups first, then wires, so functionChartModel can update.
      for (let item of items) {
        if (!isWire(item)) this.addItem(item, parent);
      }
      for (let item of items) {
        if (isWire(item)) this.addItem(item, parent);
      }
    },

    replaceElement: function(element, newElement) {
      const self = this, model = this.model,
            observableModel = model.observableModel,
            functionChartModel = model.functionChartModel,
            type = getType(element),
            newId = model.dataModel.getId(newElement),
            newType = getType(newElement),
            parent = this.getParent(newElement),
            newParent = this.getParent(element),
            index = this.getItemIndex(element);
      // Add newElement right after element. Both should be present as we
      // rewire them.
      if (parent) {
        self.deleteItem(newElement);
      }
      self.addItem(newElement, newParent, index + 1);
      observableModel.changeValue(newElement, 'x', element.x);
      observableModel.changeValue(newElement, 'y', element.y);

      // Update all incoming and outgoing wires if possible, otherwise they
      // will be deleted as dangling wires by makeConsistent.
      const srcChange = [], dstChange = [];
      function canRewire(index, pins, newPins) {
        if (index >= newPins.length)
          return false;
        const type = globalTypeParser_.trimType(pins[index].type),
              newType = globalTypeParser_.trimType(newPins[index].type);
        return type === '*' || type === newType;
      }
      functionChartModel.forInputWires(element, function(wire, pin) {
        if (canRewire(wire.dstPin, type.inputs, newType.inputs)) {
          dstChange.push(wire);
        }
      });
      functionChartModel.forOutputWires(element, function(wire, pin) {
        if (canRewire(wire.srcPin, type.outputs, newType.outputs)) {
          srcChange.push(wire);
        }
      });
      srcChange.forEach(function(wire) {
        observableModel.changeValue(wire, 'srcId', newId);
      });
      dstChange.forEach(function(wire) {
        observableModel.changeValue(wire, 'dstId', newId);
      });

      this.deleteItem(element);
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
         // const y = renderer.getBounds(item).y;
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
            extents = model.renderer.getUnionBounds(graphInfo.elementsAndGroups),
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
          let r = renderer.getBounds(junction);
          x += r.w + spacing;
          h = Math.max(h, r.h);
        });
        y += h + spacing;

        // Position every primitive.
        x = 16, h = 0;
        this.primitives.forEach(function (primitive) {
          primitive.x = x;
          primitive.y = y;
          let r = renderer.getBounds(primitive);
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

      const bounds = renderer.getBounds(elements);
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
              // let bounds = renderer.getUnionBounds(selectionModel.contents());
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