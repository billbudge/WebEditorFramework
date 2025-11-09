import { SelectionSet, Multimap } from '../../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, inFlagPath, outFlagPath, notchedRectPath, measureNameValuePairs,
         CanvasController, CanvasLayer, PropertyGridController, PropertyInfo,
         FileInputElement, writeFile,
         ErrorReporter,
         ConsoleErrorReporter} from '../../src/diagrams.js'

import { Point, Rect, PointWithNormal, getExtents, projectPointToCircle,
         BezierCurve, evaluateBezier, CurveHitResult, expandRect } from '../../src/geometry.js'

import { ScalarProp, ChildListProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, EventHandler,
         Change, ChangeEvents, CompoundOp, copyItems, Serialize, Deserialize,
         getLowestCommonAncestor, ancestorInSet, reduceToRoots,
         List, TransactionManager, TransactionEvent, HistoryManager, ScalarPropertyTypes,
         ChildPropertyTypes,
         ChildSlotProp} from '../../src/dataModels.js'

import { codegen } from './execution.js'

import { types } from '@babel/core';

// import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

// TODO Functionchart imports.
// TODO Root functionchart type display.

//------------------------------------------------------------------------------

// Value and Function type descriptions.

function escapeName(name: string) : string {
  return name.replace(')', '))');
}
function unescapeName(name: string) : string {
  return name.replace('))', ')');
}

export class Pin {
  readonly type: Type;
  readonly name?: string;
  varArgs: number = 0;  // no var args

  y = 0;
  baseline = 0;

  constructor(type: Type, name?: string) {
    this.type = type;
    this.name = name;
  }

  copy() : Pin {
    const result = new Pin(this.type, this.name);
    result.varArgs = this.varArgs;
    result.y = this.y;
    result.baseline = this.baseline;
    return result;
  }

  toString() : string {
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
  static readonly emptyPins = [];
  static readonly valueTypeString = 'v';
  static readonly valueType = new Type(Type.emptyPins, Type.emptyPins);
  static readonly emptyTypeString = '[,]';
  static readonly emptyType = new Type(Type.emptyPins, Type.emptyPins);
  static readonly emptyExporterTypeString = '[,' + this.emptyTypeString + ']';  // export the empty type
  static readonly emptyExporterType = new Type(Type.emptyPins, [new Pin(Type.emptyType)]);

  // Manually atomize the base types.
  private static readonly atomizedTypes = new Map<string, Type>([
    [Type.valueTypeString, Type.valueType.initializeBaseType(Type.valueTypeString)],
    [Type.emptyTypeString, Type.emptyType.initializeBaseType(Type.emptyTypeString)],
    [Type.emptyExporterTypeString, Type.emptyExporterType.initializeBaseType(Type.emptyExporterTypeString)],
  ]);

  readonly inputs: Pin[];
  readonly outputs: Pin[];
  readonly name: string | undefined;
  readonly varArgs: boolean;
  width = 0;
  height = 0;

  private _typeString: string;
  get typeString() : string {
    return this._typeString;
  }
  private initializeBaseType(value: string) : Type {
    this._typeString = value;
    return this;
  }

  get needsLayout() {
    return this.height === 0;
  }

  static fromInfo(inputs: Pin[], outputs: Pin[], name?: string) : Type {
    // Generally, pins can't be shared between types.
    const type = new Type(inputs.map(pin => pin.copy()), outputs.map(pin => pin.copy()), name);
    return type.atomized();
  }

  static fromString(typeString: string) : Type {
    let result = this.atomizedTypes.get(typeString);
    if (!result) {
      result = parseTypeString(typeString).atomized();
    }
    return result;
  }

  static isAtomized(typeString: string) : boolean {
    return this.atomizedTypes.has(typeString);
  }

  rename(name?: string) : Type {
    return Type.fromInfo(this.inputs.map(pin => pin.copy()),
                         this.outputs.map(pin => pin.copy()), name);
  }

  toCondType() : Type {
    const inputs = [new Pin(Type.valueType), new Pin(this), new Pin(this)],
          outputs = [new Pin(this)];
    return Type.fromInfo(inputs, outputs, '?');
  }
  toImportExportType() : Type {
    return Type.fromInfo([], [new Pin(this)]);
  }
  toConstructorType() : Type {
    const inputs = this.inputs.map(pin => new Pin(pin.type, pin.name));
    return Type.fromInfo(inputs, [new Pin(Type.valueType)], 'new ' + this.name);
  }
  private castName() : string {
    return this.name ? ' ' + this.name : '*';
  }
  toUpCastType() : Type {
    const outputs = [new Pin(Type.valueType), new Pin(this)];
    return Type.fromInfo([new Pin(Type.valueType)], outputs, 'to' + this.castName());
  }
  toDownCastType() : Type {
    return Type.fromInfo([new Pin(this)], [new Pin(Type.valueType)], 'from' + this.castName());
  }

  static outputType(pin: Pin) : Type {
    const type = pin.type;
    if (type === Type.valueType)
      return pin.type
    return Type.fromInfo(type.inputs, type.outputs, pin.name);
  }

  private constructor(inputs: Pin[], outputs: Pin[], name?: string) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.name = name;
    this.varArgs = inputs.some(input => (input.varArgs > 0));
  }

  private toString() : string {
    if (this === Type.valueType)
      return Type.valueTypeString;
    let s = '[';
    const inputs = this.inputs,
          length = inputs.length;
    for (let i = 0; i < length; i++) {
      let input = inputs[i];  // TODO improve this code.
      while (input.varArgs) {
        if (i === length - 1) break;  // last pin
        if (input.varArgs > inputs[i + 1].varArgs) break;  // last in this var args range
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

  private atomized() : Type {
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

  private static canConnect(src: Type, dst: Type) : boolean {
    return true;
  }

  canConnectTo(dst: Type) : boolean {
    return Type.canConnect(this, dst);
  }
}

// not exported
function parseTypeString(s: string) : Type {
  let j = 0;
  // Close over j to avoid extra return values.
  function parseName() : string | undefined {
    let name;
    if (s[j] === '(') {
      let i = j + 1,
          k = i;
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
  function parsePin() : Pin {
    let result: Pin;
    if (s[j] === Type.valueTypeString) {
      // value type
      j++;
      result = new Pin(Type.valueType, parseName());
    } else {
      // function types
      const type = parseFunction(),
            name = parseName();
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
  function parseFunction() : Type {
    if (s[j] === Type.valueTypeString) {
      return Type.valueType;
    } else if (s[j] === '[') {
      j++;
      let inputs = new Array<Pin>, outputs = new Array<Pin>;
      while (s[j] !== ',') {
        const pin = parsePin(),
              varArgs = pin.varArgs;
        if (varArgs) {
          for (let i = 1; i < varArgs; i++) {
            const vaPin = new Pin(pin.type, pin.name);
            vaPin.varArgs = i;
            inputs.push(vaPin);
          }
        }
        inputs.push(pin);  // in the var args case, this pin has the count.
      }
      j++;
      while (s[j] !== ']') {
        outputs.push(parsePin());
      }
      j++;
      // Parse the name if present.
      const name = parseName();
      return Type.fromInfo(inputs, outputs, name);
    } else {
      throw new Error('Invalid type string: ' + s);
    }
  }
  return parseFunction();
}

export type TypeVisitor = (type: Type) => void;

export function visitType(type: Type, visitor: TypeVisitor) {
  visitor(type);
  type.inputs.forEach(input => visitType(input.type, visitor));
  type.outputs.forEach(output => visitType(output.type, visitor));
}

//------------------------------------------------------------------------------

// Properties and templates for the raw data interface for cloning, serialization, etc.

const idProp = new IdProp('id'),
      xProp = new ScalarProp('x', 0),
      yProp = new ScalarProp('y', 0),
      nameProp = new ScalarProp('name', ''),
      typeStringProp = new ScalarProp('typeString', Type.emptyTypeString),
      widthProp = new ScalarProp('width', 0),
      heightProp = new ScalarProp('height', 0),
      srcProp = new ReferenceProp('src'),
      srcPinProp = new ScalarProp('srcPin', 0),
      dstProp = new ReferenceProp('dst'),
      dstPinProp = new ScalarProp('dstPin', 0),
      nodesProp = new ChildListProp('nodes'),
      wiresProp = new ChildListProp('wires'),
      instancerProp = new ReferenceProp('instancer'),
      innerElementProp = new ChildSlotProp('inner'),
      implicitProp = new ScalarProp('implicit', false),
      hideLinksProp = new ScalarProp('hideLinks', false),
      commentProp = new ScalarProp('comment');

type NodeType = ElementType | PseudoelementType | FunctionchartType;

abstract class NodeTemplate {
  readonly typeName: NodeType;
  readonly id = idProp;
  readonly typeString = typeStringProp;
  readonly x = xProp;
  readonly y = yProp;
  readonly comment = commentProp;
  readonly properties: PropertyTypes[] = [];
}

export type ModifierElementType = 'cond' | 'importer' | 'exporter' | 'constructor' | 'upCast' | 'downCast';
export type ElementType = 'element' | 'instance' | ModifierElementType;

class ElementTemplate extends NodeTemplate {
  readonly typeName: ElementType;
  readonly name = nameProp;
  readonly hideLinks = hideLinksProp;
  readonly properties: PropertyTypes[] = [this.id, this.typeString, this.x, this.y, this.name, this.hideLinks,
                                          this.comment];
  constructor(typeName: ElementType) {
    super();
    this.typeName = typeName;
  }
}

class ModifierElementTemplate extends ElementTemplate {
  readonly innerElement = innerElementProp;
  readonly properties: PropertyTypes[] = [this.id, this.typeString, this.x, this.y, this.name,
                                          this.hideLinks, this.innerElement, this.comment];
  constructor(typeName: ElementType) {
    super(typeName);
  }
}

class FunctionInstanceTemplate extends ElementTemplate {
  readonly src = instancerProp;
  readonly srcPin = srcPinProp;
  readonly properties = [this.id, this.typeString, this.x, this.y,
                         this.src, this.srcPin];  // no 'name' property
}

export type PseudoelementType = 'input' | 'output' | 'use';

class PseudoelementTemplate extends NodeTemplate {
  readonly typeName: PseudoelementType;
  readonly properties = [this.id, this.typeString, this.x, this.y, this.comment];
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

export type FunctionchartType = 'functionchart';

class FunctionchartTemplate extends NodeTemplate {
  readonly typeName : FunctionchartType;
  readonly width = widthProp;
  readonly height = heightProp;
  readonly name = nameProp;
  readonly implicit = implicitProp;
  readonly hideLinks = hideLinksProp;
  readonly nodes = nodesProp;
  readonly wires = wiresProp;
  readonly properties = [this.id, this.typeString, this.x, this.y, this.width, this.height,
                         this.name, this.implicit, this.hideLinks, this.nodes, this.wires,
                         this.comment];
    constructor(typeName: FunctionchartType) {
      super();
      this.typeName = typeName;
  }
}

const elementTemplate = new ElementTemplate('element'),        // built-in elements
      condTemplate = new ModifierElementTemplate('cond'),      // modifier elements
      importerTemplate = new ModifierElementTemplate('importer'),
      exporterTemplate = new ModifierElementTemplate('exporter'),
      constructorTemplate = new ModifierElementTemplate('constructor'),
      upCastTemplate = new ModifierElementTemplate('upCast'),
      downCastTemplate = new ModifierElementTemplate('downCast'),
      inputTemplate = new PseudoelementTemplate('input'),      // input pseudoelement
      outputTemplate = new PseudoelementTemplate('output'),    // output pseudoelement
      useTemplate = new PseudoelementTemplate('use'),
      wireTemplate = new WireTemplate(),
      functionchartTemplate = new FunctionchartTemplate('functionchart'),
      functionInstanceTemplate = new FunctionInstanceTemplate('instance');

const defaultPoint = { x: 0, y: 0 },
      defaultPointWithNormal: PointWithNormal = { x: 0, y: 0, nx: 0 , ny: 0 },
      defaultBezierCurve: BezierCurve = [
          defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal];

// Type safe interfaces over the raw templated data.

// Base element class to implement type fields, and incoming/outgoing wire arrays.
abstract class NodeBase<T extends NodeTemplate> implements DataContextObject, ReferencedObject {
  readonly template: T;
  readonly context: FunctionchartContext;
  readonly id: number;

  get typeString() { return this.template.typeString.get(this); }
  set typeString(value: string) { this.template.typeString.set(this, value); }

  get x() { return this.template.x.get(this); }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this); }
  set y(value: number) { this.template.y.set(this, value); }

  get comment() { return this.template.comment.get(this); }
  set comment(value: string) { this.template.comment.set(this, value); }

  // Derived properties, managed by the FunctionchartContext.
  parent: ElementParentTypes | undefined;
  globalPosition = defaultPoint;

  private _type: Type;
  get type() {
    if (!this._type) {
      this._type = Type.fromString(this.typeString);
    }
    return this._type;
  }
  set type(type: Type) {
    if (type !== this._type) {
      this._type = type;
    }
  }

  inWires = new Array<Wire | undefined>();   // one input per pin (no fan in).
  outWires = new Array<Array<Wire>>();       // multiple outputs per pin (fan out).
  instances = new Array<Array<FunctionInstance>>();  // each output pin potentially has multiple instances.

  get isAbstract() : boolean { return false; }

  asInstance() : FunctionInstance | undefined {
    if (this instanceof FunctionInstance)
      return this;
    if (this instanceof ModifierElement) {
      const inner = this.innerElement;
      if (inner instanceof FunctionInstance)
        return inner;
    }
  }

  // Get the pin for the node type, given an index in the combined input/output format.
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

export type BuiltinType = 'abstract' | 'external' |
                          'literal' | 'unop' | 'binop' | 'cond' | 'let' | 'this';

// Base class, for Elements that are not user defined.
// 'binop', 'unop', 'cond', 'let', 'const', are the built-in elements.
// 'external' are library elements.
// 'abstract' are abstractions created from other elements.
export class Element<T extends ElementTemplate = ElementTemplate> extends NodeBase<T> {
  get name() { return this.template.name.get(this); }
  set name(value: BuiltinType) { this.template.name.set(this, value); }
  get hideLinks() { return this.template.hideLinks.get(this); }
  set hideLinks(value: string) { this.template.hideLinks.set(this, value); }

  get isLiteral() : boolean {
    return this.name === 'literal';
  }
  get isUnop() : boolean {
    return this.name === 'unop';
  }
  get isBinop() : boolean {
    return this.name === 'binop';
  }
  get isLet() : boolean {
    return this.name === 'let';
  }
  get isThis() : boolean {
    return this.name === 'this';
  }
  get isExternal() : boolean {
    return this.name === 'external';
  }
  get isAbstract() : boolean {
    return this.name === 'abstract';
  }
  get hasSideEffects() : boolean {
    return false;
  }
  get isCond() : boolean {
    return this.template.typeName === 'cond';
  }
  get isImporter() : boolean {
    return this.template.typeName === 'importer';
  }
  get isExporter() : boolean {
    return this.template.typeName === 'exporter';
  }
  get isConstructor() : boolean {
    return this.template.typeName === 'constructor';
  }
  get isUpCast() {
    return this.template.typeName === 'upCast';
  }
  get isDownCast() {
    return this.template.typeName === 'downCast';
  }
  // get isInstanced(): boolean {
  //   return this instanceof FunctionInstance ||
  //          this instanceof ModifierElement && this.innerElement instanceof FunctionInstance;
  // }

  constructor(template: T, context: FunctionchartContext, id: number) {
    super(template, context,  id);
  }
}

export class ModifierElement extends Element<ModifierElementTemplate> {
  get innerElement() { return this.template.innerElement.get(this).get(0) as Element | undefined; }
  set innerElement(value: Element | undefined) { this.template.innerElement.get(this).set(0, value); }

  // Derived properties.
  get innerType() : Type { return this.innerElement?.type || Type.emptyType; }

  get isAbstract() : boolean {
    if (!this.innerElement) return false;
    return this.isExporter && this.innerElement.isAbstract;
  }

  updateTypeInfo() {
    if (this.innerElement) {
      const innerType = this.innerType;
      let modifierType;
      if (this.isCond) {
        modifierType = innerType.toCondType()
      } else if (this.isUpCast) {
        modifierType = innerType.toUpCastType();
      } else if (this.isDownCast) {
        modifierType = innerType.toDownCastType();
      } else if (this.isConstructor) {
        modifierType = innerType.toConstructorType();
      } else {  // isImporter || isExporter
        modifierType = innerType.toImportExportType();
      }
      this.typeString = modifierType.typeString;
    }
  }

  constructor(context: FunctionchartContext, template: ModifierElementTemplate, id: number) {
    super(template, context,  id);
  }
}

export class FunctionInstance extends Element<FunctionInstanceTemplate>  {
  get src() { return this.template.src.get(this) as InstancerTypes; }
  set src(value: InstancerTypes) { this.template.src.set(this, value); }
  get srcPin() { return this.template.srcPin.get(this); }
  set srcPin(value: number) { this.template.srcPin.set(this, value); }

  // Derived Properties
  get isAbstract() : boolean {
    const src = this.src;
    return src instanceof Functionchart && src.isAbstract;
  }
  get hasSideEffects() : boolean {
    const src = this.src;
    if (src instanceof Element) {
      return (src.name === 'let' || src.name === 'this') // must be this/let setter, which has side effects.
    }
    return src instanceof Functionchart && src.hasSideEffects;
  }

  getSrcType() : Type {
    return this.src.type.outputs[this.srcPin].type;
  }

  constructor(context: FunctionchartContext, id: number) {
    super(functionInstanceTemplate, context, id);
  }
}

export class Pseudoelement extends NodeBase<PseudoelementTemplate> {

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
      case 'use':
        this.typeString = '[v{1},v]';
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
  parent: Functionchart | undefined;  // TODO see if we can avoid undefined here.
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

export type PinInfo = {
  element: NodeTypes,
  index: number,
  type: Type,
  name: string | undefined,
};

export type TypeInfo = {
  instanceType: Type;
  closed: boolean;
  abstract: boolean;
  sideEffects: boolean;
  inputs: Array<PinInfo>;
  outputs: Array<PinInfo>;
}

// This TypeInfo instance signals that the functionchart hasn't been initialized yet.
const emptyTypeInfo : TypeInfo = {
  instanceType: Type.emptyExporterType,
  closed: true,
  abstract: false,
  sideEffects: false,
  inputs: [],
  outputs: [],
}

export class Functionchart extends NodeBase<FunctionchartTemplate> {
  // Radius of rounded corners. This isn't themeable, as it's conceptually part of the notation.
  static radius: number = 8;

  get width() { return this.template.width.get(this); }
  set width(value: number) { this.template.width.set(this, value); }
  get height() { return this.template.height.get(this); }
  set height(value: number) { this.template.height.set(this, value); }
  get typeString() : string {
    return this.template.typeString.get(this) ||
            this.typeInfo.instanceType.toImportExportType().typeString;  // TODO remove when files converted
  }
  set typeString(value: string) { this.template.typeString.set(this, value); }
  get name() { return this.template.name.get(this); }
  set name(value: string | undefined) { this.template.name.set(this, value); }
  get implicit() { return this.template.implicit.get(this); }
  set implicit(value: string) { this.template.implicit.set(this, value); }
  get hideLinks() { return this.template.hideLinks.get(this); }
  set hideLinks(value: string) { this.template.hideLinks.set(this, value); }

  get nodes() { return this.template.nodes.get(this) as List<NodeTypes>; }
  get wires() { return this.template.wires.get(this) as List<Wire>; }

  // Derived properties.
  get isAbstract() : boolean { return this.typeInfo.abstract; }
  get hasSideEffects() : boolean { return this.typeInfo.sideEffects; }
  get isClosed() { return this.typeInfo.closed; }

  typeInfo = emptyTypeInfo;
  lastTypeInfo: TypeInfo | undefined;
  pinMap: Array<number> | undefined;
  recursive: boolean = false;

  instanceType: Type = Type.emptyType;

  constructor(context: FunctionchartContext, template: FunctionchartTemplate, id: number) {
    super(template, context, id);
  }
}

export type ElementTypes = Element | Pseudoelement;
export type ElementParentTypes = Functionchart | ModifierElement;
export type NodeTypes = ElementTypes | Functionchart;
export type InstancerTypes = Functionchart | Element;
export type AllTypes = NodeTypes | Wire;

export type FunctionchartVisitor = (item: AllTypes) => void;
export type NodeVisitor = (node: NodeTypes) => void;
export type InstanceVisitor = (instance: FunctionInstance) => void;
export type WireVisitor = (wire: Wire) => void;
export type WirePredicate = (wire: Wire) => boolean;

interface ILayoutEngine {
  // Get bounding box for elements, functioncharts, and wires.
  getBounds(items: AllTypes) : Rect;
  getInnerElementOffset(modifier: ModifierElement) : Point;
  layoutFunctionchart(functionchart: Functionchart) : void;

  // Get wire attachment point for node input/output pins.
  inputPinToPoint(item: NodeTypes, index: number) : PointWithNormal;
  outputPinToPoint(item: NodeTypes, index: number) : PointWithNormal;
}

export type PinRefSet = Multimap<NodeTypes, number>;

// Circuit visitor for type resolution. Index specifies input or output pin,
// depending on range. Returns true if the circuit should be traversed further.
export type PinVisitor = (node: NodeTypes, index: number) => void;

export interface GraphInfo {
  nodes: Set<NodeTypes>;
  wires: Set<Wire>;
  interiorWires: Set<Wire>;
  inWires: Set<Wire>;
  outWires: Set<Wire>;
}

export class FunctionchartContext extends EventBase<Change, ChangeEvents>
                                  implements DataContext {
  private readonly layoutEngine: ILayoutEngine;
  private readonly errorReporter: ErrorReporter;
  private highestId: number = 0;  // 0 stands for no id.
  private readonly referentMap = new Map<number, ReferencedObject>();

  private functionchart: Functionchart;  // The root functionchart.
  private readonly nodes = new Set<NodeTypes>;
  private readonly wires = new Set<Wire>;

  // Graph traversal helper info. These are batch updated after transactions.
  private derivedInfoNeedsUpdate = false;  // If true, we need to update sorted and wire lists.
  // Topologically sorted elements. If a cycle is present, the size is less than the elements set.
  private sorted = new Array<NodeTypes>();
  private invalidWires = new Array<Wire>();  // Wires that violate the fan-in constraint.
  private instancingGraph = new Map<Functionchart, Set<Functionchart>>();

  private readonly transactionManager: TransactionManager;
  private readonly historyManager: HistoryManager;

  selection = new SelectionSet<AllTypes>();

  constructor(layoutEngine: ILayoutEngine = new Renderer(),
              errorReporter: ErrorReporter = new ConsoleErrorReporter()) {
    super();
    const self = this;

    this.layoutEngine = layoutEngine;
    this.errorReporter = errorReporter;
    this.transactionManager = new TransactionManager();
    this.addHandler('changed',
        this.transactionManager.onChanged.bind(this.transactionManager));

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

    this.updateDerivedInfo();     // Make sure wire arrays are present for implicit functioncharts.
    this.updateFunctioncharts();  // Initialize TypeInfo for all functioncharts.
    this.updateDerivedInfo();
  }

  name: string = 'untitled.txt';

  newElement(typeName: ElementType) : Element {
    const nextId = ++this.highestId;
    let result: Element;
    switch (typeName) {
      case 'element':
        result = new Element(elementTemplate, this, nextId);
        break;
      case 'instance':
        result = new FunctionInstance(this, nextId);
        break;
      case 'cond':
        result = new ModifierElement(this, condTemplate, nextId);
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
  newPseudoelement(typeName: PseudoelementType) : Pseudoelement {
    const nextId = ++this.highestId;
    let template: PseudoelementTemplate;
    switch (typeName) {
      case 'input': template = inputTemplate; break;
      case 'output': template = outputTemplate; break;
      case 'use': template = useTemplate; break;
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
      default: throw new Error('Unknown functionchart type: ' + typeName);
    }
    const result: Functionchart = new Functionchart(this, template, nextId);
    this.referentMap.set(nextId, result);
    return result;
  }
  contains(item: AllTypes) : boolean {
    if (item instanceof NodeBase)
      return this.nodes.has(item);
    if (item instanceof Wire)
      return this.wires.has(item);
    return false;
  }

  // TODO make these free standing functions?
  visitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.nodes.forEach(t => self.visitAll(t, visitor));
      item.wires.forEach(t => self.visitAll(t, visitor));
    } else if (item instanceof ModifierElement) {
      if (item.innerElement)
        visitor(item.innerElement);
    }
  }
  reverseVisitAll(item: AllTypes, visitor: FunctionchartVisitor) : void {
    const self = this;
    if (item instanceof Functionchart) {
      item.wires.forEachReverse(t => self.reverseVisitAll(t, visitor));
      item.nodes.forEachReverse(t => self.reverseVisitAll(t, visitor));
    } else if (item instanceof ModifierElement) {
      if (item.innerElement)
        visitor(item.innerElement);
    }
    visitor(item);
  }
  visitNodes(item: NodeTypes, visitor: NodeVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof Functionchart) {
      item.nodes.forEach(item => self.visitNodes(item, visitor));
    } else if (item instanceof ModifierElement) {
      if (item.innerElement) {
        this.visitNodes(item.innerElement, visitor);
      }
    }
  }
  reverseVisitNodes(item: NodeTypes, visitor: NodeVisitor) : void {
    const self = this;
    if (item instanceof Functionchart) {
      item.nodes.forEachReverse(item => self.reverseVisitNodes(item, visitor));
    } else if (item instanceof ModifierElement) {
      if (item.innerElement) {
        this.reverseVisitNodes(item.innerElement, visitor);
      }
    }
    visitor(item);
  }
  visitWires(functionchart: Functionchart, visitor: WireVisitor) : void {
    const self = this;
    functionchart.wires.forEach(t => visitor(t));
    functionchart.nodes.forEach(t => {
      if (t instanceof Functionchart)
        self.visitWires(t, visitor)
    });
  }
  reverseVisitWires(functionchart: Functionchart, visitor: WireVisitor) : void {
    const self = this;
    functionchart.nodes.forEachReverse(t => {
      if (t instanceof Functionchart)
        self.reverseVisitWires(t, visitor)
    });
    functionchart.wires.forEach(t => visitor(t));
  }

  getContainingFunctionchart(items: AllTypes[]) : Functionchart {
    let owner = getLowestCommonAncestor<AllTypes>(...items);
    while (owner && !(owner instanceof Functionchart))
      owner = owner.parent;
    if (owner instanceof Functionchart)
      return owner;

    return this.functionchart;
  }

  getToFunctionchart(node: NodeTypes) : Functionchart | undefined {
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
  getToParent(node: NodeTypes, newParent: ElementParentTypes | undefined) {
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
  private setGlobalPosition(node: NodeTypes) {
    const x = node.x,
          y = node.y,
          parent = node.parent;

    if (parent) {
      const global = parent.globalPosition;
      if (global) {
        node.globalPosition = { x: x + global.x, y: y + global.y };
      }
    } else {
      node.globalPosition = { x: x, y: y };
    }
  }

  getGraphInfo() : GraphInfo {
    return {
      nodes: this.nodes,
      wires: this.wires,
      interiorWires: this.wires,
      inWires: new Set(),
      outWires: new Set(),
    };
  }

  getSubgraphInfo(items: NodeTypes[]) : GraphInfo {
    const self = this,
          nodes = new Set<NodeTypes>(),
          wires = new Set<Wire>(),
          interiorWires = new Set<Wire>(),
          inWires = new Set<Wire>(),
          outWires = new Set<Wire>();
    // First collect nodes.
    items.forEach(item => {
      nodes.add(item);
    });
    // Now collect and classify wires that connect to them.
    items.forEach(item => {
      function addWire(wire: Wire) {
        // Stop if we've already processed this transtion (handle transitions from a element to itself.)
        if (wires.has(wire)) return;
        wires.add(wire);
        const src: NodeTypes = wire.src!,
              dst: NodeTypes = wire.dst!,
              srcInside = nodes.has(src),
              dstInside = nodes.has(dst);
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
      nodes,
      wires,
      interiorWires,
      inWires,
      outWires,
    }
  }

  getConnectedNodes(
      nodes: NodeTypes[], upstream: WirePredicate, downstream: WirePredicate) : Set<NodeTypes> {
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
    this.errorReporter.clear();
  }
  endTransaction() {
    this.makeConsistent();
    const result = this.isValidFunctionchart();
    if (result !== true) {
      this.cancelTransaction(result);
    } else {
      this.transactionManager.endTransaction();
    }
  }
  cancelTransaction(reason: string) {
    this.transactionManager.cancelTransaction(reason);
    this.errorReporter.report(reason);
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

  // Excludes pseudo-elements.
  selectedElements() : Element[] {
    const result = new Array<Element>();
    this.selection.forEach(item => {
      if (item instanceof Element)
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
    if (node instanceof ModifierElement && node.innerElement)
      this.disconnectNode(node.innerElement);

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
    node.instances.forEach(instances => {
      if (instances.length ===  0) return;
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
    const self = this,
          graphInfo = this.getSubgraphInfo(this.selectedNodes());
    graphInfo.interiorWires.forEach(wire => self.selection.add(wire));
  }

  selectConnectedNodes(upstream: WirePredicate, downstream: WirePredicate) {
    const selectedNodes = this.selectedNodes(),
          connectedNodes = this.getConnectedNodes(selectedNodes, upstream, downstream);
    this.selection.set(Array.from(connectedNodes));
  }

  addItem(item: AllTypes, parent: ElementParentTypes | undefined) : AllTypes {
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
      } else {
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
      } else {
        parent.nodes.append(item);
      }
    } else if (parent instanceof ModifierElement && item instanceof Element) {
      const inner = parent.innerElement;
      if (inner) {
        this.deleteItem(inner);
      }
      parent.innerElement = item;
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
        parent.nodes.remove(item);
      }
    }
  }

  deleteItem(item: AllTypes) {
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

  newInputForWire(wire: Wire, parent: Functionchart, p: Point) {
    const input = this.newPseudoelement('input'),
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
    p.x -= 16;  // TODO layout engine?
    const input = this.newInputForWire(wire, parent, p);
    this.addItem(wire, parent);
    return { input, wire };
  }

  newOutputForWire(wire: Wire, parent: Functionchart, p: Point) {
    const src = wire.src!,
          output = this.newPseudoelement('output'),
          offset = this.layoutEngine.inputPinToPoint(output, 0);
    output.x = p.x - offset.x;
    output.y = p.y - offset.y;
    wire.dst = output;
    wire.dstPin = 0;
    this.addItem(output, parent);
    return output;
  }

  newInstanceForWire(wire: Wire, parent: Functionchart, p: Point) {
    const src = wire.src!,
          type = src.type.outputs[wire.srcPin].type,
          element = this.newElement('instance') as FunctionInstance;
    element.src = src as InstancerTypes;
    element.srcPin = wire.srcPin;

    element.typeString = type.typeString;
    element.x = p.x;
    element.y = p.y - type.height / 2;
    this.deleteItem(wire);
    this.addItem(element, parent);
    return element;
  }

  connectOutput(node: NodeTypes, pin: number) {
    const parent = node.parent as Functionchart,
          p = this.layoutEngine.outputPinToPoint(node, pin),
          wire = this.newWire(node, pin, undefined, 0);
    p.x += 16;  // TODO layout engine?
    const output = this.newOutputForWire(wire, parent, p);
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
    if (!lca || lca !== this.getToFunctionchart(src.parent!))  // TODO test
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

  canAddNode(node: NodeTypes, parent: ElementParentTypes) : boolean {
    if (node instanceof FunctionInstance) {
      const definition = node.src,
            definitionScope = definition.parent,
            scope = getLowestCommonAncestor<NodeTypes>(node, definition, parent);
      if (definition instanceof Functionchart) {
        // Closed functioncharts can be instantiated anywhere.
        if (definition.typeInfo.closed)
            return true;

        // Top level functionchart, we can't currently instantiate it. TODO it should be possible.
        if (!definitionScope)
          return true;
        // An open functionchart can only be instantiated in its defining functionchart or the next outer scope.
        return scope === definition ||  // recursive
               scope === definitionScope;  // within scope of definition.
      }
      if (definition.isImporter) {
        return scope === definitionScope;
      }
    } else if (node instanceof ModifierElement) {
      return !(parent instanceof ModifierElement);  // A modifier can't modify another modifier.
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

  isWiredOrInstanced(node: NodeTypes) : boolean {
    const type = node.type,
          nInputs = type.inputs.length,
          nOutputs = type.outputs.length,
          inputs = node.inWires,
          outputs = node.outWires;
    for (let i = 0; i < nInputs; i++) {
      if (inputs[i] !== undefined)
        return false;
    }
    for (let i = 0; i < nOutputs; i++) {
      if (outputs[i].length !== 0)
        return false;
    }
    const instances = node.instances;
    for (let i = 0; i < nOutputs; i++) {
      if (instances[i].length !== 0)
        return false;
    }
  return true;
  }

  isValidFunctionInstance(instance: FunctionInstance) : boolean {
    let parent = instance.parent;
    // To be able to export an instance, the inner element must be valid in the containing functionchart.
    if (parent instanceof ModifierElement)
      parent = parent.parent;
    return parent instanceof Functionchart && this.canAddNode(instance, parent);
  }

  // Update wire lists. Returns true iff wires don't fan-in to any input pins.
  private updateReferenceLists() : Array<Wire> {
    const invalidWires = new Array<Wire>(),
          graphInfo = this.getGraphInfo();
    // Initialize the element inWires, outWires, and instances arrays.
    graphInfo.nodes.forEach(node => {
      const type = node.type;
      node.inWires = new Array<Wire>(type.inputs.length);
      node.outWires = new Array<Array<Wire>>(type.outputs.length);
      for (let i = 0; i < type.outputs.length; i++)
        node.outWires[i] = new Array<Wire>();
      node.instances = new Array<Array<FunctionInstance>>(type.outputs.length);
      for (let i = 0; i < type.outputs.length; i++)
        node.instances[i] = new Array<FunctionInstance>();
    });
    // Push wires onto the corresponding wire arrays on the elements.
    graphInfo.wires.forEach(wire => {
      const src = wire.src, dst = wire.dst,
            srcPin = wire.srcPin, dstPin = wire.dstPin;
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
    function addInstance(instance: FunctionInstance) {
      const src = instance.src,
            srcPin = instance.srcPin;
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
  private buildInstancingGraph() : Map<Functionchart, Set<Functionchart>> {
    const instancingGraph = new Map<Functionchart, Set<Functionchart>>();
    // -Only functioncharts can be recursive.
    // -For each functionchart, make a list of other functioncharts it instantiates, either directly, or
    // indirectly through another functionchart, possibly including itself.
    // -If a functionchart references itself, or another functionchart that references it, it is recursive.
    function visitInstance(instance: FunctionInstance, functioncharts: Set<Functionchart>) {
      const src = instance.src;
      if (src instanceof Functionchart) {
        if (!functioncharts.has(src)) {
          functioncharts.add(src);
          visitFunctionchart(src);
        }
      }
    }
    function visitFunctionchart(functionchart: Functionchart) {
      if (instancingGraph.has(functionchart))
        return;
      const functioncharts = new Set<Functionchart>();
      instancingGraph.set(functionchart, functioncharts);
      functionchart.nodes.forEach(node => {
        if (node instanceof FunctionInstance) {
          visitInstance(node, functioncharts);
        } else if (node instanceof ModifierElement) {
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
    instancingGraph.forEach((srcs, functionchart)=> {
      functionchart.recursive = srcs.has(functionchart);
    });
    return instancingGraph;
  }

  // Topological sort of elements for update and validation. The circuit should form a DAG.
  // All wires should be valid.
  private topologicalSort() : NodeTypes[] {
    const visiting = new Set<NodeTypes>(),
          visited = new Set<NodeTypes>(),
          sorted = new Array<NodeTypes>();

    let cycle = false;
    function visit(node: NodeTypes) {
      if (visited.has(node))
        return;
      if (visiting.has(node)) {
        cycle = true;
        return;
      }
      visiting.add(node);
      node.outWires.forEach(wires => {
        wires.forEach(wire => {
          visit(wire.dst!);
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

  private updateFunctioncharts() {
    const self = this;
    // Update Functionchart types.
    this.reverseVisitNodes(this.functionchart, item => {
      if (item instanceof Functionchart) {
        const typeInfo = self.getFunctionchartTypeInfo(item),
              instanceType = typeInfo.instanceType;
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

  isValidFunctionchart(): true | string {
    if (this.sorted.length !== this.nodes.size) {
      return 'Elements and wires form a cycle';
    }

    const self = this,
          invalidWires = new Array<Wire>(),
          invalidInstances = new Array<FunctionInstance>(),
          invalidFunctioncharts = new Array<Functionchart>();
    // Check wires.
    this.wires.forEach(wire => {
      if (!self.isValidWire(wire)) {  // TODO incorporate in update graph info?
        invalidWires.push(wire);
      }
    });
    if (invalidWires.length !== 0)
      return 'Invalid wire';

    // Check functioncharts and functioninstances.
    this.nodes.forEach(node => {
      if (node instanceof Functionchart) {
        if (node.recursive) {
          // Recursive functioncharts can't be implicit.
          if (node.implicit) {
            invalidFunctioncharts.push(node);
          }
        }
      } else {
        const instance = node.asInstance();
        if (instance) {
          if (!self.isValidFunctionInstance(instance))
            invalidInstances.push(instance);
        }
      }
    });

    if (invalidFunctioncharts.length)
      return 'Invalid functionchart';
    if (invalidInstances.length)
      return 'Invalid instance';
    return true;
  }

  // Makes an array that maps old inputs and outputs to new ones based on the TypeInfo.
  // The input mapping and output mapping are concatenated in the final array. The array
  // has an entry for each input and output in the old TypeInfo. -1 signals that a new
  // pin was added or an old pin was deleted.
  makePinMap(oldTypeInfo: TypeInfo, typeInfo: TypeInfo) : Array<number> {
    const result = new Array<number>();

    function findIndex(pins: Array<PinInfo>, element: NodeTypes, index: number) : number {
      return pins.findIndex(pin => pin.element === element && pin.index === index);
    }
    function makeMap(oldPins: Array<PinInfo>, pins: Array<PinInfo>) {
      for (let i = 0; i < oldPins.length; i++) {
        const oldPin = oldPins[i],
              newPin = findIndex(pins, oldPin.element, oldPin.index);
        if (newPin >= 0) {
          result.push(newPin);
        } else {
          result.push(-1);
        }
      }
    }
    makeMap(oldTypeInfo.inputs, typeInfo.inputs);
    makeMap(oldTypeInfo.outputs, typeInfo.outputs);
    return result;
  }

  remapFunctionInstance(instance: FunctionInstance, functionchart: Functionchart) {
    const typeInfo = functionchart.typeInfo,
          oldTypeInfo = functionchart.lastTypeInfo!,
          pinMap = functionchart.pinMap!;
    // Remap wires, which are based on the old TypeInfo.
    const inWires = instance.inWires,
          newInputsLength = typeInfo.inputs.length;
    for (let i = 0; i < inWires.length; i++) {
      const wire = inWires[i];
      if (!wire)
        continue;
      if (i >= newInputsLength || pinMap[i] === -1) {
        this.deleteItem(wire);  // no pin at this index.
      } else {
        const newIndex = pinMap[i];
        if (wire.dstPin !== newIndex)
          wire.dstPin = newIndex;
      }
    }
    const outWires = instance.outWires,
          newOutputsLength = typeInfo.outputs.length,
          firstOutput = oldTypeInfo.inputs.length;
    for (let i = 0; i < outWires.length; i++) {
      const wires = outWires[i];
      if (wires.length === 0) continue;
      wires.forEach(wire => {
        const newIndex = pinMap[i + firstOutput];
        if (i >= newOutputsLength || newIndex === -1) {
          this.deleteItem(wire);  // no pin at this index.
        } else {
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
        const typeInfo = node.typeInfo,
              instanceType = typeInfo.instanceType,
              type = instanceType.toImportExportType();
        if (node.typeString !== type.typeString) {
          node.typeString = type.typeString;
        }
      } else {
        const instance = node.asInstance();
        if (instance) {
          const type = instance.getSrcType(),
                typeString = type.typeString;
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
        let lastTypeInfo = node.lastTypeInfo!;
        if (lastTypeInfo === emptyTypeInfo)
          lastTypeInfo = typeInfo;
        node.pinMap = self.makePinMap(lastTypeInfo, typeInfo);
      } else if (node.type.varArgs) {
        // Reroute wires to maintain the varArgs invariants:
        // 1) There are no gaps in the varArgs range...
        // 2) Except the last pin, which is unwired.
        const type = node.type,
              inWires = node.inWires,
              length = inWires.length;
        let wired = 0,
            unwired = 0;
        for (let i = 0; i < length; i++) {
          const wire = inWires[i];
          if (wire) {
            if (unwired > 0) {
              wire.dstPin = wire.dstPin - unwired;
            }
            wired++;
          } else {
            unwired++;
          }
        }

        const newLength = wired + 1;
        if (newLength !== length) {
          // The type has to change.
          const inputs = new Array<Pin>(newLength);
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
        const src = node.src,
              srcPin = node.srcPin,
              supported = self.nodes.has(src) && src.instances[srcPin].includes(node);
        if (!supported) {
          self.disconnectNode(node);
          self.deleteItem(node);
        } else {
          const instancer = node.src;
          if (instancer instanceof Functionchart) {
            self.remapFunctionInstance(node, instancer);
          } else {
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

  replaceNode(node: NodeTypes, newNode: NodeTypes) {
    const parent = node.parent as Functionchart,  // TODO replace at the same index (change addItem to take index).
          newType = newNode.type;
    // Add newNode so that both nodes are present as we rewire them.
    this.addItem(newNode, parent);
    newNode.x = node.x;
    newNode.y = node.y;

    // Update all incoming and outgoing wires if possible; otherwise they
    // are deleted.
    const srcChange = new Array<Wire>(),
          dstChange = new Array<Wire>();
    node.inWires.forEach(wire => {
      if (!wire) return;
      const src = wire.src!, srcPin = wire.srcPin, dstPin = wire.dstPin;
      if (dstPin < newType.inputs.length &&
          src.type.outputs[srcPin].type.canConnectTo(newNode.type.inputs[dstPin].type)) {
        dstChange.push(wire);
      } else {
        this.deleteItem(wire);
      }
    });
    node.outWires.forEach(wires => {
      if (wires.length === 0) return;
      // Copy array since we're mutating.
      wires.slice().forEach(wire => {
        if (!wire) return;
        const dst = wire.dst!, srcPin = wire.srcPin, dstPin = wire.dstPin;
        if (srcPin < newType.outputs.length &&
          newNode.type.outputs[srcPin].type.canConnectTo(dst.type.inputs[dstPin].type)) {
          srcChange.push(wire);
        } else {
          this.deleteItem(wire);
        }
      });
    });
    srcChange.forEach(wire => {
      wire.src = newNode;
    });
    dstChange.forEach(function(wire) {
      wire.dst = newNode;
    });

    this.deleteItem(node);
  }

  dropNodeOnElement(node: ElementTypes, target: ElementTypes) {
    const selection = this.selection;
    if (target instanceof ModifierElement && this.canAddNode(node, target)) {
      // We could replaceNode but any errors can't be corrected in the current editor. We
      // have no way to un-import/export.
      if (target.innerElement)
        this.disconnectNode(target.innerElement);
      this.addItem(node, target);
      selection.delete(node);
      selection.add(target);
    } else {
      this.replaceNode(target, node);
      selection.add(node);
    }
  }

  // Create an abstract functionchart to represent the given type.
  typeToFunctionchart(type: Type) : Functionchart {
    const self = this,
          layoutEngine = this.layoutEngine,
          map = new Map<Type, Functionchart | undefined>(),
          functioncharts = new Array<Functionchart>();
    // Recursively build the function chart. Cycles in the type dependency graph are impossible.
    function populate(type: Type) : Functionchart {
      const functionchart = self.newFunctionchart('functionchart');
      functionchart.name = type.name;
      let y : number;
      y = 8;
      type.inputs.forEach(pin => {
        const pinType = pin.type;
        if (pinType === Type.valueType) {
          const input = self.newPseudoelement('input'),
                name = pin.name || '';;
          input.x = 8;
          input.y = y;
          input.typeString = '[,v(' + name + ')]';
          y += layoutEngine.getBounds(input).height + 8;
          functionchart.nodes.append(input);
        } else {
          let subFunctionchart = map.get(pinType);
          if (!subFunctionchart) {
            subFunctionchart = populate(pinType);
            subFunctionchart.name = pinType.name;
          }
          // Create an instance of the abstract sub-functionchart, to generate the input pin.
          const instance = self.newElement('instance') as FunctionInstance;
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
          const output = self.newPseudoelement('output'),
                name = pin.name || '';
          output.x = 40;
          output.y = y;
          output.typeString = '[v(' + name + '),]';
          y += layoutEngine.getBounds(output).height + 8;
          functionchart.nodes.append(output);
        } else {
          let subFunctionchart = map.get(pinType);
          if (!subFunctionchart) {
            subFunctionchart = populate(pinType);
            subFunctionchart.name = pinType.name;
          }
          // Create an output, wired to the sub-functionchart, to generate the output pin.
          const output = self.newPseudoelement('output'),
                name = pin.name || '';
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
      if (functionchart === root) return;
      functionchart.x = 8;
      functionchart.y = y;
      y += layoutEngine.getBounds(functionchart).height + 8;
      root.nodes.append(functionchart);
    });
    layoutEngine.layoutFunctionchart(root);
    return root;
  }

  modifyElement(element: Element, modifierType: ModifierElementType) {
    const modifier = this.newElement(modifierType) as ModifierElement;
    let typeString;
    switch (modifierType) {
      case 'cond':
        typeString = element.type.toCondType().typeString;
        break;
      case 'importer':
      case 'exporter':
        typeString = element.type.toImportExportType().typeString;
        break;
      case 'constructor':
        typeString = element.type.toConstructorType().typeString;
        break;
      case 'upCast':
        typeString = element.type.toUpCastType().typeString;
        break;
      case 'downCast':
        typeString = element.type.toDownCastType().typeString;
        break;
    }
    modifier.typeString = typeString;
    modifier.x = element.globalPosition.x;
    modifier.y = element.globalPosition.y;
    return modifier;
  }

  modifyElements(elements: Element[], modifierType: ModifierElementType) {
    const self = this,
          selection = this.selection;

    elements.forEach(element => {
      if (element instanceof ModifierElement)
        return;
      self.disconnectNode(element);
      selection.delete(element);
      const modifier = self.modifyElement(element, modifierType),
            parent = element.parent as Functionchart;  // element is not modified.
      self.addItem(modifier, parent);
      self.addItem(element, modifier);
      selection.add(modifier);
    });
  }

  abstractElement(element: Element) : Element {
    const type = element.type,
          layoutEngine = this.layoutEngine,
          bounds = layoutEngine.getBounds(element);
    const abstractElement = this.newElement('element');
    abstractElement.name = 'abstract';
    abstractElement.x = bounds.x;
    abstractElement.y = bounds.y;
    abstractElement.typeString = type.typeString;
    return abstractElement;
  }

  abstractElements(elements: Element[], asFunctioncharts: boolean) {
    const self = this,
          selection = this.selection;

    elements.forEach(element => {
      selection.delete(element);
      if (!asFunctioncharts) {
        const abstractElement = self.abstractElement(element);
        self.replaceNode(element, abstractElement);
        selection.add(abstractElement);
      } else {
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

  getExportType(functionchart: Functionchart) : Type {
    const outputs = new Array<Pin>();
    functionchart.nodes.forEach(node => {
      if (node instanceof Functionchart) {
        outputs.push(new Pin(node.instanceType));
      }
    });
    outputs.sort((a, b) => {
      const aType = a.type,
            bType = b.type,
            aName = aType.name || '',
            bName = bType.name || '';
      // Sort by name, then by fewest number of pins.
      let result = aName.localeCompare(bName);
      if (result !== 0)
        return result;
      return (bType.inputs.length + bType.outputs.length) - (aType.inputs.length + aType.outputs.length);
    });
    return Type.fromInfo([], outputs);
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
    selection.add(parent);
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
        const src = wire.src;
        if (src) {
          const srcPin = wire.srcPin,
                index = src.type.inputs.length + srcPin;
          this.visitPin(src, index, visitor, visited);
        }
      }
    } else {
      const wires = node.outWires[index - firstOutput];
      if (wires) {  // |wires| may be undefined if the instance doesn't has its type yet.
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
  inferPinType(element: NodeTypes, index: number,  visited = new Multimap<NodeTypes, number>()) : Type {
    let type: Type = Type.valueType;
    function visit(element: NodeTypes, index: number) : boolean {
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

  getFunctionchartTypeInfo(functionchart: Functionchart) : TypeInfo {
    const self = this,
          inputs = new Array<PinInfo>(),
          outputs = new Array<PinInfo>(),
          name = functionchart.name,
          implicit = functionchart.implicit,
          subgraphInfo = self.getSubgraphInfo(functionchart.nodes.asArray()),
          closed = subgraphInfo.inWires.size == 0;
    // A functionchart is abstract if it has no wires.
    let abstract = subgraphInfo.wires.size === 0 && subgraphInfo.inWires.size === 0;
    let sideEffects = false;
    // Collect the functionchart's input and output pseudoelements.
    subgraphInfo.nodes.forEach(node => {
      if (node instanceof Pseudoelement) {
        if (node.template === inputTemplate) {
          const connected = new Multimap<NodeTypes, number>();  // TODO move this out
          const type = self.inferPinType(node, 0, connected);
          const name = node.type.outputs[0].name;
          const pinInfo = { element: node, index: 0, type, name };
          inputs.push(pinInfo);
        } else if (node.template === outputTemplate) {
          const connected = new Multimap<NodeTypes, number>();
          const type = self.inferPinType(node, 0, connected);
          const name = node.type.inputs[0].name;
          const pinInfo = { element: node, index: 0, type, name };
          outputs.push(pinInfo);
        }
      } else {
        // Special cases of nodes that generate pins.
        if (node instanceof ModifierElement && node.isImporter) {
          // Instancers are inputs.
          const innerType = node.innerType,
                name = innerType.name,
                type = innerType.rename(),
                pinInfo = { element: node, index: 0, type, name };
          inputs.push(pinInfo);
        } else if (node instanceof ModifierElement && node.isExporter && node.isAbstract) {
          // Abstract exporters are outputs.
          const type = node.innerType,
                name = undefined,
                pinInfo = { element: node, index: 0, type, name };
          outputs.push(pinInfo);
        } else if (node instanceof Element && node.isAbstract) {
          // Abstract elements become a single input (and don't implicitly generate other pins).
          const type = node.type,
                name = undefined,
                pinInfo = { element: node, index: 0, type, name };
          inputs.push(pinInfo);
        } else {
          // The general case node...
          abstract = abstract && node.isAbstract;
          sideEffects = sideEffects || node.hasSideEffects;

          if (implicit && (node instanceof Element || node instanceof Functionchart)) {
            // In implicit mode, empty pins of nodes become pins for the functionchart type.
            const type = node.type,
                  inputPins = type.inputs,
                  outputPins = type.outputs;
            for (let i = 0; i < inputPins.length; i++) {
              if (node.inWires[i])
                continue;
              const pin = inputPins[i];
              const type = pin.type,
                    pinInfo = { element: node, index: i, type, name: undefined };
              inputs.push(pinInfo);
            }
            for (let i = 0; i < outputPins.length; i++) {
              // If output is used or instanced from.
              if (node.outWires[i].length !== 0 || node.instances[i].length !== 0)
                continue;
              const pin = outputPins[i];
              const type = pin.type,
                    pinInfo = { element: node, index: i, type, name: undefined };
              outputs.push(pinInfo);
            }
          }
        }
      }
    });

    // Sort pins in increasing y-order. This lets users arrange the pins of the
    // new type in an intuitive way.
    function compareYs(p1: PinInfo, p2: PinInfo) {
      const element1 = p1.element,
            element2 = p2.element,
            pin1 = element1.getPin(p1.index),
            pin2 = element2.getPin(p2.index),
            y1 = element1.globalPosition.y + pin1.y,
            y2 = element2.globalPosition.y + pin2.y;
      return y1 - y2;
    }
    inputs.sort(compareYs);
    outputs.sort(compareYs);

    const inputPins = inputs.map(pinInfo => {
      return new Pin(pinInfo.type, pinInfo.name);
    });
    const outputPins = outputs.map(pinInfo => {
      return new Pin(pinInfo.type, pinInfo.name);
    });
    const type = Type.fromInfo(inputPins, outputPins, name);

    return { instanceType: type, closed, abstract, sideEffects, inputs, outputs };
  }

  private updateGlobalPosition(node: NodeTypes) {
    if (node instanceof NodeBase) {
      this.visitNodes(node, item => this.setGlobalPosition(item));
    }
  }

  private insertElement(element: ElementTypes, parent: ElementParentTypes) {
    this.nodes.add(element);
    element.parent = parent;
    if (element instanceof ModifierElement) {
      if (element.innerElement) {
        this.insertElement(element.innerElement, element);
      }
    } else if (parent instanceof ModifierElement) {
      parent.updateTypeInfo();
    }
    element.type = Type.fromString(element.typeString);
    this.updateGlobalPosition(element);
    this.derivedInfoNeedsUpdate = true;
  }

  private removeElement(element: ElementTypes) {
    this.nodes.delete(element);
    if (element instanceof ModifierElement) {
      if (element.innerElement) {
        this.removeElement(element.innerElement);
      }
    }
    this.derivedInfoNeedsUpdate = true;
  }

  // Parent can be undefined in the case of the root functionchart.
  private insertFunctionchart(functionchart: Functionchart, parent: Functionchart | undefined) {
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

  private removeFunctionchart(functionchart: Functionchart) {
    this.nodes.delete(functionchart);
    const self = this;
    functionchart.wires.forEach(wire => self.removeWire(wire));
    functionchart.nodes.forEach(element => self.removeItem(element));
    this.derivedInfoNeedsUpdate = true;
  }

  private insertWire(wire: Wire, parent: Functionchart) {
    this.wires.add(wire);
    wire.parent = parent;
    this.derivedInfoNeedsUpdate = true;
  }

  private removeWire(wire: Wire) {
    this.wires.delete(wire);
    this.derivedInfoNeedsUpdate = true;  // Removal might break a cycle, making an unsortable graph sortable.
  }

  private insertItem(item: AllTypes, parent: ElementParentTypes) {
    if (!this.nodes.has(parent)) return;  // Ignore changes while object graphs are constructed.
    if (parent instanceof Functionchart) {
      if (item instanceof Wire) {
        this.insertWire(item, parent as Functionchart);
      } else if (item instanceof Functionchart) {
        this.insertFunctionchart(item, parent as Functionchart);
      } else {
        this.insertElement(item, parent);
      }
    } else if (parent instanceof ModifierElement && item instanceof Element) {
      this.insertElement(item, parent);
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
    if (owner instanceof NodeBase) {
      if (prop === typeStringProp) {
        const newType = Type.fromString(owner.typeString)
        owner.type = newType;
        if (owner.parent instanceof ModifierElement) {
          owner.parent.updateTypeInfo();
        }
      } else {
        this.updateGlobalPosition(owner);
      }
    }
    this.onValueChanged(owner, prop, oldValue);
    this.derivedInfoNeedsUpdate = true;
  }
  elementInserted(owner: ElementParentTypes, prop: ChildPropertyTypes, index: number) : void {
    if (this.nodes.has(owner)) {
      const value: AllTypes = prop.get(owner).get(index) as AllTypes;
      this.insertItem(value, owner);
      this.onElementInserted(owner, prop, index);
    }
  }
  elementRemoved(owner: ElementParentTypes, prop: ChildPropertyTypes, index: number, oldValue: AllTypes) : void {
    if (this.nodes.has(owner)) {
      this.removeItem(oldValue);
      this.onElementRemoved(owner, prop, index, oldValue);
    }
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
      case 'element':
      case 'cond':
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
      owner: ElementParentTypes, prop: ChildPropertyTypes, index: number) :
      Change {
    const change: Change =
        { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(
      owner: ElementParentTypes, prop: ChildPropertyTypes, index: number, oldValue: AllTypes ) :
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
  padding = 4;
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

// TODO merge with ElementHitResult, as NodeHitResult.
class FunctionchartHitResult {
  item: Functionchart;
  inner: RectHitResult;
  input: number = -1;
  output: number = -1;
  constructor(item: Functionchart, inner: RectHitResult) {
    this.item = item;
    this.inner = inner;
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
        // All element types.
        const type = item.type;
        width = type.width;
        height = type.height;
      }
    }
    return { x, y, width, height };
  }
  getInnerElementOffset(modifier: ModifierElement): Point {
    const spacing = this.theme.spacing,
          type = modifier.type;
    if (type.needsLayout) {
      this.layoutType(type);
    }
    switch (modifier.template.typeName) {
      case 'upCast': {
        const y = type.outputs[1].y;
        return { x: spacing + spacing, y }
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
  inputPinToPoint(node: NodeTypes, index: number) : PointWithNormal {
    const rect = this.getBounds(node),
          type = node.type,
          pin = type.inputs[index];
    return { x: rect.x, y: rect.y + pin.y + pin.type.height / 2, nx: -1, ny: 0 };
  }
  outputPinToPoint(node: NodeTypes, index: number) : PointWithNormal {
    const rect = this.getBounds(node),
          type = node.type,
          pin = type.outputs[index];
    // Handle special case of functionchart's output.
    if (node instanceof Functionchart) {
      const type = node.instanceType,
            r = Functionchart.radius,
            right = rect.x + rect.width;
      return { x: right, y: rect.y + r + type.height / 2, nx: 1, ny: 0 };
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

  instancerBounds(instancer: InstancerTypes, srcPin: number = 0) : Rect {
    const pinPt = this.outputPinToPoint(instancer, srcPin),
          pinRect = this.pinToRect(instancer.type.outputs[srcPin], pinPt);

    return pinRect;
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
            // pin.y += (textSize - ph) / 2;
            ph = textSize;
          } else {
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

  layoutPin(pin: Pin) {
    const type = pin.type;
    if (type.needsLayout)
      this.layoutType(type);
  }

  layoutElement(element: ElementTypes) {
    const type = element.type;
    if (type.needsLayout) {
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
  layoutFunctionchart(functionchart: Functionchart) {
    const self = this,
          spacing = this.theme.spacing,
          type = functionchart.instanceType,
          nodes = functionchart.nodes;
    if (type.needsLayout) {
      this.layoutType(type);
    }
    let width, height;
    if (nodes.length === 0) {
      width = self.theme.minFunctionchartWidth;
      height = self.theme.minFunctionchartHeight;
    } else {
      const extents = self.sumBounds(nodes.asArray()),
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

  drawPin(pin: Pin, x: number, y: number) {
    const ctx = this.ctx,
          theme = this.theme;
    ctx.strokeStyle = theme.strokeColor;
    ctx.lineWidth = 0.5;
    if (pin.type === Type.valueType) {
      const r = theme.knobbyRadius;
      ctx.beginPath();
      const d = 2 * r;
      ctx.rect(x, y, d, d);
      // ctx.arc(x + r, y + r, r, 0, Math.PI * 2, true);
      ctx.stroke();
    } else {
      const type = pin.type,
            width = type.width, height = type.height;
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.stroke();
      this.drawType(type, x, y);
    }
  }

  drawFunctionInstanceLink(instance: FunctionInstance, color: string) {
    const ctx = this.ctx,
          theme = this.theme,
          offset = theme.spacing / 2,
          rect = this.getBounds(instance),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          p1 = this.outputPinToPoint(instance.src, instance.srcPin),
          p2 = { x, y: y + h - 1, nx : -1, ny: 0 };  // 2 = linewidth
    ctx.strokeStyle = color;
    p1.x += offset;
    p2.x -= offset;

    const bezier = getEdgeBezier(p1, p2, 0);
    ctx.beginPath();
    bezierEdgePath(bezier, ctx, 0);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  abstractStroke(ctx: CanvasRenderingContext2D) {
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawSideEffectsTick(right: number, top: number) {
    const ctx = this.ctx,
          theme = this.theme,
          spacing = theme.spacing;
    ctx.moveTo(right - spacing, top);
    ctx.lineTo(right, top + spacing);
  }

  drawElement(element: Element, mode: RenderMode) {
    if (element.parent instanceof ModifierElement)  // TODO something better
      return;

      const ctx = this.ctx,
          theme = this.theme,
          rect = this.getBounds(element),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height;

    ctx.beginPath();
    // Importers and abstract instances define function inputs, so use the input shape.
    if (element instanceof ModifierElement) {
      const d = theme.knobbyRadius * 2;
      if (element.isImporter) {
        inFlagPath(x - d, y, w + d, h, d, ctx);
      }  else if (element.isExporter) {
        outFlagPath(x, y, w + d, h, d, ctx);
      } else if (element.isConstructor) {
        notchedRectPath(x, y, w, h, theme.spacing / 2, ctx);
      } else {
        ctx.rect(x, y, w, h);
      }
    } else {
      if (element.hasSideEffects) {
        notchedRectPath(x, y, w, h, theme.spacing / 3, ctx);
      } else {
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
        } else {
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
        } else {
          ctx.stroke();
        }
        break;
    }
  }

  drawPseudoElement(element: Pseudoelement, mode: RenderMode) {
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
        if (element.template.typeName !== 'use') {
          switch (element.template.typeName) {
            case 'input': {
              inFlagPath(x, y, w, h, d, ctx);
              break;
            }
            case 'output': {
              outFlagPath(x, y, w, h, d, ctx);
              break;
            }
          }
          ctx.fill();
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          const spacing = theme.spacing,
                cx = x + w / 2,
                cy = y + spacing;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy + h - 2 * spacing);
          element.type.outputs.forEach(pin => {
            const py = y + pin.y + spacing / 2;
            ctx.moveTo(cx, py);
            ctx.lineTo(cx + spacing / 2, py);
          });
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.lineWidth = 0.5;
        }
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

  drawFunctionchart(functionchart: Functionchart, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = Functionchart.radius,
          implicit = functionchart.implicit,
          rect = this.getBounds(functionchart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height;
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
        } else {
          ctx.beginPath();
          ctx.rect(pinRect.x, pinRect.y, pinRect.width, pinRect.height);
        }
        ctx.fillStyle = theme.altBgColor;
        ctx.fill();
        ctx.strokeStyle = theme.strokeColor;
        if (functionchart.isAbstract) {
          this.abstractStroke(ctx);
        } else {
          ctx.stroke();
        }
        const instanceType = functionchart.instanceType;
        this.drawType(instanceType, x + w - instanceType.width, y + r);
        if (implicit) {
          // Draw tick marks indicating the auto-generated pins.
          const self = this,
                spacing = theme.spacing,
                typeInfo = functionchart.typeInfo,
                inputs = typeInfo.inputs,
                outputs = typeInfo.outputs;
          ctx.beginPath();
          ctx.lineWidth = 1;
          inputs.forEach(input => {
            const element = input.element;
            if (element instanceof Pseudoelement || element.isAbstract ||
                element.type.inputs.length === 0) {
              return;
            }
            const p = self.inputPinToPoint(element, input.index);
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - spacing, p.y);
          });
          outputs.forEach(output => {
            const element = output.element;
            if (element instanceof Pseudoelement ||
                element.type.outputs.length === 0) {
              return;
            }
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

  hitTestElement(element: ElementTypes, p: Point, tol: number, mode: RenderMode) :
                 ElementHitResult | undefined {
    if (element.parent instanceof ModifierElement)  // TODO something better
      return;

    const rect = this.getBounds(element),
          x = rect.x, y = rect.y, width = rect.width, height = rect.height,
          hitInfo = hitTestRect(x, y, width, height, p, tol);
    if (!hitInfo)
      return;
    const self = this,
          result = new ElementHitResult(element, hitInfo),
          type = element.type;
    if (mode !== RenderMode.Palette) {
      for (let i = 0; i < type.inputs.length; i++) {
        const pinPt = self.inputPinToPoint(element, i),
              rect = self.pinToRect(type.inputs[i], pinPt);
        // Hit test with tolerance adjustment along top, right, and bottom.
        if (hitTestRect(rect.x, rect.y - tol, rect.width + tol, rect.height + 2 * tol, p, 0)) {
          result.input = i;
        }
      }
      for (let i = 0; i < type.outputs.length; i++) {
        const pinPt = self.outputPinToPoint(element, i),
              rect = self.pinToRect(type.outputs[i], pinPt);
        // Hit test with tolerance adjustment along top, left, and bottom.
        if (hitTestRect(rect.x - tol, rect.y - tol, rect.width + tol, rect.height + 2 * tol, p, 0)) {
          result.output = i;
        }
      }
    }
    return result;
  }
  hitTestFunctionchart(
    functionchart: Functionchart, p: Point, tol: number, mode: RenderMode) : FunctionchartHitResult | undefined {
    const rect = this.getBounds(functionchart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol);
    if (!inner)
      return;
    const result = new FunctionchartHitResult(functionchart, inner);
    const pinRect = this.instancerBounds(functionchart, 0);
    if (hitTestRect(pinRect.x, pinRect.y, pinRect.width, pinRect.height, p, 0)) {
      result.output = 0;
    }
    return result;
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
      this.drawPin(pin, pinX, pinY)
    } else if (wire.src === undefined) {
      const pin = wire.dst!.type.inputs[wire.dstPin],
            pinPos = wire.pSrc!,
            pinX = pinPos.x - pin.type.width,
            pinY = pinPos.y - pin.type.height / 2;
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
    if (item instanceof NodeBase) {
      if (item instanceof Functionchart) {
        this.drawFunctionchart(item, mode);
      } else if (item instanceof Pseudoelement) {
        this.drawPseudoElement(item, mode);
      } else {
        this.drawElement(item, mode);
      }
    } else {
      this.drawWire(item, mode);
    }
  }

  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) : HitResultTypes | undefined {
    let hitInfo: HitResultTypes | undefined;

    if (item instanceof NodeBase) {
      if (item instanceof Functionchart) {
        hitInfo = this.hitTestFunctionchart(item, p, tol, mode);
      } else {
        hitInfo = this.hitTestElement(item, p, tol, mode);
      }
    } else {
      hitInfo = this.hitTestWire(item, p, tol, mode);
    }
    return hitInfo;
  }

  layout(item: AllTypes) {
    if (item instanceof NodeBase) {
      if (item instanceof Functionchart) {
        this.layoutFunctionchart(item);
      } else {
        this.layoutElement(item);
      }
    } else {
      this.layoutWire(item);
    }
  }

  drawHoverInfo(info: HitResultTypes, p: Point) {
    const theme = this.theme,
          strokeColor = theme.hoverColor,
          ctx = this.ctx,
          x = p.x, y = p.y;
    let displayType;
    if (info instanceof ElementHitResult) {
      const element = info.item,
            type = element.type;
      if (info.input >= 0) {
      } else if (info.output >= 0) {
        const pinIndex = info.output,
              pin = type.outputs[pinIndex];
        // Show link to instances.
        if (pin.type !== Type.valueType) {
          element.instances[pinIndex].forEach(instance => this.drawFunctionInstanceLink(instance, strokeColor));
        }
      }
      if (element instanceof FunctionInstance) {
        this.drawFunctionInstanceLink(element, strokeColor);
      }
    } else if (info instanceof FunctionchartHitResult) {
      const functionchart = info.item;
      if (info.output === 0) {
        functionchart.instances[0].forEach(instance => this.drawFunctionInstanceLink(instance, strokeColor));
      }
    } else if (info instanceof WireHitResult) {
      displayType = info.item.type;  // Wire type is src or dst pin type.
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
  if (hitInfo instanceof ElementHitResult) {
    // Drop onto an element requires type compatibility.
    return true;//lastSelected.type.canConnectTo(hitInfo.item.type);
  }
  return false;
}

function isClickable(hitInfo: HitResultTypes) : boolean {
  return true;
}

function isDraggable(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof Wire);
}

function isElement(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof ElementHitResult;
}

// function isElementInputPin(hitInfo: HitResultTypes) : boolean {
//   return hitInfo instanceof ElementHitResult && hitInfo.input >= 0;
// }

// function isElementOutputPin(hitInfo: HitResultTypes) : boolean {
//   return hitInfo instanceof ElementHitResult && hitInfo.output >= 0;
// }

function hasProperties(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof Wire);
}

type NonWireDragType = 'copyPalette' | 'moveSelection' | 'moveCopySelection' |
                       'resizeFunctionchart';
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

export type EditorCommand =
    'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'group' | 'complete' |
    'abstract' | 'abstractFunctionchart' |
    'extend' | 'selectAll' |
    'cond' | 'import' | 'export' | 'constructor' | 'upCast' | 'downCast' |
    'new' | 'open' | 'openImport' | 'save' | 'print';

export class FunctionchartEditor implements CanvasLayer {
  private theme: FunctionchartTheme;
  private canvasController: CanvasController;
  private paletteController: CanvasController;
  private propertyGridController: PropertyGridController;
  private fileInput: FileInputElement;
  private errorReporter: ErrorReporter;
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
              propertyGridController: PropertyGridController,
              fileInput: FileInputElement,
              errorReporter: ErrorReporter) {
    const theme = new FunctionchartTheme(baseTheme);
    this.theme = theme;
    this.canvasController = canvasController;
    this.paletteController = paletteController;
    this.propertyGridController = propertyGridController;
    this.fileInput = fileInput;
    this.errorReporter = errorReporter;

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
    const paletteContext = new FunctionchartContext(renderer),
          functionchart = paletteContext.newFunctionchart('functionchart'),
          input = paletteContext.newPseudoelement('input'),
          output = paletteContext.newPseudoelement('output'),
          use = paletteContext.newPseudoelement('use'),
          literal = paletteContext.newElement('element'),
          binop = paletteContext.newElement('element'),
          unop = paletteContext.newElement('element'),
          cond = paletteContext.newElement('cond'),
          letFn = paletteContext.newElement('element'),
          thisFn = paletteContext.newElement('element'),
          external = paletteContext.newElement('element'),
          newFunctionchart = paletteContext.newFunctionchart('functionchart'),
          importer = paletteContext.newElement('importer'),
          exporter = paletteContext.newElement('exporter'),
          constructor = paletteContext.newElement('constructor');

    const unaryFns = paletteContext.newElement('element');

    const unaryOps = ['!', '~', '-', 'typeof'];
    const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
      '|', '&', '||', '&&'];

    renderer.begin(canvasController.getCtx());
    renderer.layoutElement(unaryFns);
    renderer.end();

    paletteContext.root = functionchart;

    input.x = 8;  input.y = 8;
    output.x = 40; output.y = 8;
    use.x = 72; use.y = 8;
    literal.x = 8; literal.y = 32;
    literal.name = 'literal';
    literal.typeString = '[,v(0)]';
    binop.x = 56; binop.y = 32;
    binop.name = 'binop';
    binop.typeString = '[vv,v](+)';  // binary addition
    unop.x = 96; unop.y = 32;
    unop.name = 'unop';
    unop.typeString = '[v,v](-)';  // unary negation
    cond.x = 134; cond.y = 32;
    cond.name = 'cond';
    cond.typeString = '[vvv,v](?)';  // conditional
    letFn.x = 172; letFn.y = 32;
    letFn.name = 'let';
    letFn.typeString = '[v,v[v,v]](let)';
    thisFn.x = 224; thisFn.y = 32;
    thisFn.name = 'this';
    thisFn.typeString = '[vv,v[v,v]](this)';
    external.x = 278; external.y = 32;
    external.name = 'external';
    external.typeString = '[,](lib)'

    newFunctionchart.x = 8; newFunctionchart.y = 90;
    newFunctionchart.width = this.theme.minFunctionchartWidth;
    newFunctionchart.height = this.theme.minFunctionchartHeight;

    importer.x = 80; importer.y = 96;
    importer.typeString = '[,[,]]';
    exporter.x = 104; exporter.y = 96;
    exporter.typeString = '[,[,]]';
    constructor.x = 136; constructor.y = 96;
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

    paletteContext.root = functionchart;
    this.palette = functionchart;

    // Default Functionchart.
    const context = new FunctionchartContext(renderer, errorReporter);
    this.context = context;
    this.initializeContext(context);
    this.functionchart = context.root;

    // Register property grid layouts.
    function getter(info: ItemInfo, item: AllTypes) {
      if (item)
        return info.prop.get(item);
    }
    function setter(info: ItemInfo, item: AllTypes, value: any) {
      if (item && (info.prop instanceof ScalarProp || info.prop instanceof ReferenceProp)) {
        const description = 'change ' + info;
        context.beginTransaction(description);
        try {
          info.prop.set(item, value);
        } catch (error) {
          errorReporter.report(error.message);
        }
        context.endTransaction();
        canvasController.draw();
      }
    }
    function nodeLabelGetter(info: ItemInfo, item: NodeTypes) {
      let result;
      if (item instanceof Pseudoelement) {
        if (info.prop === typeStringProp) {
          switch (item.template.typeName) {
            case 'input':       // [,v(label)]
              result = item.type.outputs[0].name;
              break;
            case 'output':      // [v(label),]
              result = item.type.inputs[0].name;
              break;
          }
        }
      } else if (item instanceof Element) {
        if (item.name == 'literal') {
          result = item.type.outputs[0].name;
        } else {
          result = item.type.name;
        }
      }
      return result ? result : '';
    }
    function nodeLabelSetter(info: ItemInfo, item: NodeTypes, value: any) {
      if (info.prop === typeStringProp) {
        let newType;
        switch (item.template.typeName) {
          case 'input':
            newType = Type.fromInfo([], [new Pin(Type.valueType, value)]);
            break;
          case 'output':
            newType = Type.fromInfo([new Pin(Type.valueType, value)], []);
            break;
          case 'element': {
            const element = item as Element,
                  type = element.type;
            if (element.name === 'literal') {
              newType = Type.fromInfo([], [new Pin(type.outputs[0].type, value)]);
            } else {
              newType = Type.fromInfo(type.inputs, type.outputs, value);
            }
            break;
          }
        }
        if (newType) {
          const newValue = newType.typeString;
          setter(info, item, newValue);
        }
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
      {
        label: 'hideLinks',
        type: 'boolean',
        getter: getter,
        setter: setter,
        prop: hideLinksProp,
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
  initializeContext(context: FunctionchartContext) {
    const self = this;

    // On attribute changes and item insertions, dynamically layout affected items.
    // This allows us to layout wires as their src or dst elements are dragged.
    context.addHandler('changed', change => self.onChanged(change));

    // On ending transactions and undo/redo, layout the changed top level functioncharts.
    function update() {
      self.updateBounds();
    }
    function advance() {  // TODO we should be able to setPropertyGrid after undo/redo.
      self.updateBounds();
      self.setPropertyGrid();
    }
    context.addTransactionHandler('transactionEnding', advance);
    context.addTransactionHandler('didUndo', update);
    context.addTransactionHandler('didRedo', update);
  }
  setContext(context: FunctionchartContext) {
    // Make sure any function instances don't get detached from their instancers.
    // TODO revisit this.
    const instancers = new Set<InstancerTypes>();
    this.scrap.forEach(item => {
      context.visitAll(item, item => {
        if (item instanceof FunctionInstance) {
          instancers.add(item.src);  // prepend so they precede instances.
        }
      });
    });
    this.scrap.splice(0, 0, ...instancers);

    const functionchart = context.root,
          renderer = this.renderer;

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
  initialize(canvasController: CanvasController) {
    if (canvasController === this.canvasController) {
    } else {
      const renderer = this.renderer;
      // Layout the palette items and their parent functionchart.
      renderer.begin(canvasController.getCtx());
      this.context.reverseVisitAll(this.palette, item => renderer.layout(item));
      // Draw the palette items.
      this.palette.nodes.forEach(item => renderer.draw(item, RenderMode.Print));
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
  private updateLayout() {
    const renderer = this.renderer,
          context = this.context,
          changedItems = this.changedItems;
    // This function is called during the draw, hitTest, and updateBounds_ methods,
    // so the renderer is started.
    // First layout elements, and then layout wires which depend on them.
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
    } else if (canvasController === this.paletteController) {
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
    functionchart.nodes.forEach(item => items.push(item));

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

    // Adjust all edges 8 pixels out.
    const ctx = new (window as any).C2S(bounds.width + 16, bounds.height + 16);
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
    let name = context.name,
        pos = name.lastIndexOf(".");
    name = name.substring(0, pos < 0 ? name.length : pos) + ".svg";
    writeFile(name, serializedSVG);
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
    this.palette.nodes.forEachReverse(item => {
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
      hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; });
    }
    return hitInfo;
  }
  setPropertyGrid() {
    const context = this.context,
          item = context.selection.lastSelected;
    let type = undefined;
    if (item instanceof Element) {
      if (item instanceof ModifierElement) {
        type = item.template.typeName;  // 'importer', 'exporter', ...
      } else {
        type = item.name;  // 'binop', 'unop', 'literal', 'let', 'const'
      }
    } else if (item) {
      type = item.template.typeName;
    }
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
      }

      context.beginTransaction(drag.description);
      if (newWire) {
        context.addItem(newWire, this.functionchart);  // makeConsistent will canonicalize the parent functionchart.
        selection.set(newWire);
      } else {
        if (drag.kind == 'copyPalette' || drag.kind == 'moveCopySelection') {
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
        case 'moveSelection': {
          hitInfo = this.getFirstHit(hitList, isDropTarget) as ElementHitResult | FunctionchartHitResult;
          context.selection.forEach(item => {
            if (item instanceof Wire)
              return;
            const oldX = context.getOldValue(item, 'x') || 0,
                  oldY = context.getOldValue(item, 'y') || 0;
            item.x = oldX + dx;
            item.y = oldY + dy;
          });
          break;
        }
        case 'resizeFunctionchart': {
          const hitInfo = pointerHitInfo as FunctionchartHitResult,
                item = drag.items[0] as Functionchart,
                oldX = context.getOldValue(item, 'x') || 0,
                oldY = context.getOldValue(item, 'y') || 0,
                oldWidth =  context.getOldValue(item, 'width') || 0,
                oldHeight =  context.getOldValue(item, 'height') || 0;
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
          hitInfo = this.getFirstHit(hitList, isElement) as ElementHitResult;
          const dst = wire.dst,
                src = hitInfo ? hitInfo.item as NodeTypes : undefined;
          if (src && dst && src !== dst && hitInfo.output >= 0) {
            wire.src = src;
            wire.srcPin = hitInfo.output;
          } else {
            wire.src = undefined;  // This notifies observers to update the layout.
            wire.pSrc = { x: cp.x, y: cp.y, nx: 1, ny: 0 };
          }
          break;
        }
        case 'connectWireDst': {
          hitInfo = this.getFirstHit(hitList, isElement) as ElementHitResult;
          const src = wire.src,
                dst = hitInfo ? hitInfo.item as NodeTypes : undefined;
          if (src && dst && src !== dst && hitInfo.input >= 0) {
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
    // Find element or functionchart beneath mouse.
    const hitList = this.hitTestCanvas(cp),
          hitInfo = this.getFirstHit(hitList, isDropTarget),
          lastSelected = selection.lastSelected;
    let parent: Functionchart = functionchart;
    if (hitInfo instanceof FunctionchartHitResult) {
      parent = hitInfo.item;
    }
    if (drag instanceof WireDrag) {
      const wire = drag.wire,
            src = wire.src,
            dst = wire.dst;
      // Auto-complete if wire has no src or destination. Inputs of all types and
      // outputs of value type auto-complete to input/output pseudoelements. Outputs
      // of function type auto-complete to an instance of the src pin function type.
      if (src === undefined) {
        const p = wire.pSrc!,
              input = context.newInputForWire(wire, parent, p);
        context.select(input)
      } else if (dst === undefined) {
        const p = wire.pDst!,
              pin = src.type.outputs[wire.srcPin];
        let output: ElementTypes;
        if (pin.type === Type.valueType || (src instanceof Element && src.isExporter)) {
          output = context.newOutputForWire(wire, parent, p);
        } else {
          output = context.newInstanceForWire(wire, parent, p);
          if (hitInfo instanceof ElementHitResult && hitInfo.input < 0) {
            context.dropNodeOnElement(output, hitInfo.item);
          }
        }
        context.select(output);
      } else {
        // The user's new wire takes precedence over any existing wire (fan-in <= 1).
        const current = dst.inWires[wire.dstPin];
        if (current && current !== wire) {
          context.deleteItem(current);
        }
      }
      wire.pSrc = wire.pDst = undefined;
    } else if (drag instanceof NonWireDrag &&
              (drag.kind == 'copyPalette' || drag.kind === 'moveSelection' ||
               drag.kind === 'moveCopySelection')) {
      if (hitInfo instanceof ElementHitResult && lastSelected instanceof NodeBase) {
        const target = hitInfo.item;
        if (!(lastSelected instanceof Functionchart)) {
          context.dropNodeOnElement(lastSelected, target);
        }
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

    this.dragInfo = undefined;
    this.pointerHitInfo = undefined;
    this.draggableHitInfo = undefined;
    this.hotTrackInfo = undefined;

    this.canvasController.draw();
  }

  newContext(text?: string, name?: string) : FunctionchartContext{
    const context = new FunctionchartContext(this.renderer, this.errorReporter);
    let functionchart: Functionchart;
    if (text) {
      const raw = JSON.parse(text);
      functionchart = Deserialize(raw, context) as Functionchart;
    } else {
      functionchart = context.newFunctionchart('functionchart');
    }
    if (name)
      context.name = name;
    context.root = functionchart;
    return context;
  }

  openNewContext(text?: string, name?: string) {
    const context = this.newContext(text, name);
    this.initializeContext(context);
    this.setContext(context);
    this.renderer.begin(this.canvasController.getCtx());
    this.updateBounds();
    this.canvasController.draw();
  }

  openFile(fileName: string, text: string) {
    this.openNewContext(text, fileName)
  }

  importFile(fileName: string, text: string) {
    const context = this.context,
          imported = this.newContext(text),
          type = imported.getExportType(imported.root),
          element = context.newElement('element');
    element.name = 'external';
    element.typeString = type.typeString;
    const center = this.canvasController.getViewCenter();
    element.x = center.x;
    element.y = center.y;
    this.renderer.begin(this.canvasController.getCtx());
    this.renderer.layoutElement(element);
    this.renderer.end();
    context.beginTransaction('import functionchart');
    context.addItem(element, this.functionchart);
    context.select(element);
    context.endTransaction();
    this.canvasController.draw();
  }

  saveFile() {
    const context = this.context,
          text = JSON.stringify(Serialize(context.root), undefined, 2);
    writeFile(context.name, text);
  }

  doCommand(command: EditorCommand) {
    const context = this.context,
          canvasController = this.canvasController;
    switch (command) {
      case 'undo': {
        if (context.getUndo()) {
          context.undo();
          canvasController.draw();
        }
        break;
      }
      case 'redo': {
        if (context.getRedo()) {
          context.redo();
          canvasController.draw();
        }
        break;
      }
      case 'cut' : {
        this.scrap = context.cut();
        canvasController.draw();
        break;
      }
      case 'copy': {
        this.scrap = context.copy();
        break;
      }
      case 'paste': {
        if (this.scrap.length > 0) {
          // TODO paste at canvas controller center.
          context.paste(this.scrap);
          this.updateBounds();
          canvasController.draw();
        }
        break;
      }
      case 'delete': {
        context.deleteSelection();
        canvasController.draw();
        break;
      }
      case 'group': {
        context.selection.set(context.selectedNodes());
        context.extendSelectionToWires();
        context.reduceSelection();
        context.beginTransaction('group items into functionchart');
        const bounds = this.renderer.sumBounds(context.selectedNodes()),
              contents = context.selectedAllTypes();
        let parent = context.getContainingFunctionchart(contents);
        expandRect(bounds, Functionchart.radius, Functionchart.radius);
        context.group(contents, parent, bounds);
        context.endTransaction();
        break;
      }
      case 'complete': {
        const renderer = this.renderer;
        renderer.begin(this.canvasController.getCtx());
        context.beginTransaction('complete elements');
        context.completeNode(context.selectedNodes());
        renderer.end();
        context.endTransaction();
        canvasController.draw();
        break;
      }
      case 'extend': {
        context.selectConnectedNodes(wire => true, wire => true);  // TODO finer grained connecting.
        canvasController.draw();
        break;
      }
      case 'selectAll': {
        this.functionchart.nodes.forEach(node => {
          context.selection.add(node);
        });
        canvasController.draw();
        break;
      }
      case 'cond': {
        context.beginTransaction('import element');
        context.modifyElements(context.selectedElements(), 'cond');
        context.endTransaction();
        break;
      }
      case 'import': {
        context.beginTransaction('import element');
        context.modifyElements(context.selectedElements(), 'importer');
        context.endTransaction();
        break;
      }
      case 'export': {
        context.beginTransaction('export element');
        context.modifyElements(context.selectedElements(), 'exporter');
        context.endTransaction();
        break;
      }
      case 'constructor': {
        context.beginTransaction('constructor element');
        context.modifyElements(context.selectedElements(), 'constructor');
        context.endTransaction();
        break;
      }
      case 'upCast': {
        context.beginTransaction('up-cast element');
        context.modifyElements(context.selectedElements(), 'upCast');
        context.endTransaction();
        break;
      }
      case 'downCast': {
        context.beginTransaction('down-cast element');
        context.modifyElements(context.selectedElements(), 'downCast');
        context.endTransaction();
        break;
      }
      case 'abstract': {
        context.beginTransaction('abstract element');
        context.abstractElements(context.selectedElements(), false);
        context.endTransaction();
        break;
      }
      case 'abstractFunctionchart': {
        context.beginTransaction('abstract functionchart for element');
        context.abstractElements(context.selectedElements(), true);
        context.endTransaction();
        canvasController.draw();
        break;
      }
      case 'new': {
        this.openNewContext();
        break;
      }
      case 'open': {
        this.fileInput.open(this.openFile.bind(this));
        break;
      }
      case 'openImport': {
        this.fileInput.open(this.importFile.bind(this));
        break;
      }
      case 'save': {
        this.saveFile();
        break;
      }
      case 'print': {
        this.print();
        break;
      }
    }
  }

  onKeyDown(e: KeyboardEvent) {
    const keyCode = e.keyCode,  // TODO fix me.
          cmdKey = e.ctrlKey || e.metaKey,
          shiftKey = e.shiftKey;

    if (keyCode === 8) { // 'delete'
      this.doCommand('delete');
      return true;
    }
    if (cmdKey) {
      switch (keyCode) {
        case 65: { // 'a'
          this.doCommand('selectAll');
          return true;
        }
        case 90: { // 'z'
          if (shiftKey) {
            this.doCommand('redo');
          } else {
            this.doCommand('undo');
          }
          return true;
        }
        case 89: { // 'y', code gen experiment.
          codegen(this.functionchart);
          return true;
        }
        case 88: { // 'x'
          this.doCommand('cut');
          return true;
        }
        case 67: { // 'c'
          this.doCommand('copy');
          return true;
        }
        case 86: { // 'v'
          this.doCommand('paste');
          return true;
        }
        case 71 : { // 'g'
          this.doCommand('group');
          return true;
        }
        case 69: { // 'e'
          this.doCommand('extend');
          return true;
        }
        case 72: // 'h'
          this.doCommand('cond');
          return true;
        case 74: { // 'j'
          this.doCommand('complete');
          return true;
        }
        case 75: { // 'k'
          this.doCommand('export');
          return true;
        }
        case 76: // 'l'
          this.doCommand('import');
          return true;
        case 73: // 'i'
          if (!shiftKey) {
            this.doCommand('abstract');
          } else {
            this.doCommand('abstractFunctionchart');
          }
          return true;
        case 85: // 'u'
          if (shiftKey) {
            this.doCommand('upCast');
          } else {
            this.doCommand('downCast');
          }
          return true;
        case 78: { // 'n'
          // ctrl-n
          this.doCommand('new');
          return true;
        }
        case 79: { // 'o'
          if (shiftKey) {
            this.doCommand('openImport');
          } else {
            this.doCommand('open');
          }
          return false;
        }
        case 83: { // 's'
          this.doCommand('save');
          return true;
        }
        case 80: { // 'p'
          this.doCommand('print');
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
