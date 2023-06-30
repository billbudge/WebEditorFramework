import {describe, expect, test} from '@jest/globals';
import * as FC from '../examples/functioncharts/functioncharts.js';

function addElement(functionchart: FC.Functionchart, type: FC.ElementType) {
  const element = functionchart.context.newElement(type);
  functionchart.nonWires.append(element);
  return element;
}

function addPseudoelement(functionchart: FC.Functionchart, type: FC.PseudoelementType) {
  const pseudo = functionchart.context.newPseudoelement(type);
  functionchart.nonWires.append(pseudo);
  return pseudo;
}

function addWire(
    functionchart: FC.Functionchart,
    elem1: FC.ElementTypes, outPin: number,
    elem2: FC.ElementTypes, inPin: number) {
  const wire = functionchart.context.newWire(elem1, outPin, elem2, inPin);
  functionchart.wires.append(wire);
  return wire;
}

function addFunctionchart(parent: FC.Functionchart) : FC.Functionchart {
  const functionchart = parent.context.newFunctionchart();
  functionchart.nonWires.append(functionchart);
  return functionchart;
}

function setEquals(set1: Set<any>, set2: Array<any>) {
  expect(set1.size).toBe(set2.length);
  for (const item of set2) {
    expect(set1.has(item)).toBe(true);
  }
}

//------------------------------------------------------------------------------

// Setup.
beforeEach(() => {
  FC.Type.initialize();
});

describe('Pin' , () => {
  test('Pin', () => {
    const valuePin = new FC.Pin(FC.Type.valueType),
          starPin = new FC.Pin(FC.Type.starType);
    expect(valuePin.type).toBe(FC.Type.valueType);
    expect(valuePin.name).toBeUndefined();
    expect(valuePin.toString()).toBe('v');
    expect(valuePin.typeString).toBe('v');
    expect(starPin.type).toBe(FC.Type.starType);
    expect(starPin.name).toBeUndefined();
    expect(starPin.toString()).toBe('*');
    expect(starPin.typeString).toBe('*');

    const namedPin = new FC.Pin(valuePin.type, 'pin1');
    expect(namedPin.toString()).toBe('v(pin1)');
    expect(namedPin.typeString).toBe('v(pin1)');

    const valuePin2 = valuePin.copy(),
          starPin2 = starPin.copy();
    expect(valuePin2).not.toBe(valuePin);
    expect(valuePin2.type).toBe(valuePin.type);
    expect(valuePin2.name).toBe(valuePin.name);
    expect(starPin2).not.toBe(starPin);
    expect(starPin2.type).toBe(starPin.type);
    expect(starPin2.name).toBe(starPin.name);

    const unlabeledValuePin = valuePin.copyUnlabeled(),
          unlabeledStarPin = starPin.copyUnlabeled();
    expect(unlabeledValuePin).not.toBe(valuePin);
    expect(unlabeledValuePin.type).toBe(valuePin.type);
    expect(unlabeledValuePin.name).toBeUndefined();
    expect(unlabeledStarPin).not.toBe(starPin);
    expect(unlabeledStarPin.type).toBe(starPin.type);
    expect(unlabeledStarPin.name).toBeUndefined();
  });
});

describe('Type' , () => {
  test('Type', () => {
    const type1 = FC.parseTypeString('[v,v]'),
          type2 = FC.parseTypeString('[vv,v]');
    expect(type1).not.toBe(type2);
    expect(type1.inputs.length).toBe(1);
    expect(type1.inputs[0].type).toBe(FC.Type.valueType);
    expect(type1.outputs.length).toBe(1);
    expect(type1.outputs[0].type).toBe(FC.Type.valueType);
    expect(type2.inputs.length).toBe(2);
    expect(type2.inputs[0].type).toBe(FC.Type.valueType);
    expect(type2.inputs[1].type).toBe(FC.Type.valueType);
    expect(type2.outputs.length).toBe(1);
    expect(type2.outputs[0].type).toBe(FC.Type.valueType);

    const named = new FC.Type(type1.inputs, type1.outputs, 'type1');
    expect(named).not.toBe(type1);
    expect(type1.typeString).toBe('[v,v]');
    expect(named.toString()).toBe('[v,v](type1)');
    expect(named.typeString).toBe('[v,v](type1)');

    const copy = type1.copy();
    expect(copy).not.toBe(type1);
    expect(copy.inputs[0]).not.toBe(type1.inputs[0]);
    expect(copy.inputs[0].type).toBe(type1.inputs[0].type);

    const copyUnlabeled = type1.copyUnlabeled();
    expect(copyUnlabeled).not.toBe(type1);
    expect(copyUnlabeled.name).toBeUndefined();
    expect(copyUnlabeled.toString()).toBe('[v,v]');
    expect(copyUnlabeled.typeString).toBe('[v,v]');
  });
  test('base Types', () => {
    const starType = FC.parseTypeString('*'),
          valueType = FC.parseTypeString('v'),
          emptyType = FC.parseTypeString('[,]');
    expect(starType).toBe(FC.Type.starType);
    expect(valueType).toBe(FC.Type.valueType);
    expect(emptyType).toBe(FC.Type.emptyType);
  });
  test('atomized', () => {
    const valueType = FC.Type.valueType,
          type1 = new FC.Type([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]),
          type2 = new FC.Type([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]);
    expect(type1).not.toBe(type2);
    expect(type1.atomized()).toBe(type1);
    expect(type2.atomized()).toBe(type1);

  });
  test('canConnect', () => {
    expect(FC.Type.starType.canConnectTo(FC.Type.valueType)).toBe(true);
    expect(FC.Type.valueType.canConnectTo(FC.Type.starType)).toBe(true);
    expect(FC.Type.starType.canConnectTo(FC.Type.starType)).toBe(true);
    expect(FC.Type.valueType.canConnectTo(FC.Type.valueType)).toBe(true);

    const type1 = FC.parseTypeString('[v,v]'),
          type2 = FC.parseTypeString('[vv,v]');
    expect (type1.canConnectTo(FC.Type.valueType)).toBe(false);
    expect (type1.canConnectTo(FC.Type.starType)).toBe(true);
    expect(type1.canConnectTo(type2)).toBe(false);
    expect(type2.canConnectTo(type1)).toBe(true);
  });
});

describe('parseTypeString', () => {
  test('parseTypeString', () => {
    const typeStrings = [
      'v',
      '*',
      '[vv,v](+)',
      '[v(a)v(b),v(c)]',
      '[,[,v][v,v]](@)',
      '[[v,vv(q)](a)v(b),v(c)](foo)',
    ];
    typeStrings.forEach(typeString => expect(FC.parseTypeString(typeString)!.toString()).toBe(typeString));
    typeStrings.forEach(typeString => expect(FC.Type.atomizedTypes.has(typeString)).toBe(true));
    expect(FC.parseTypeString('[v,v]').name).toBeUndefined();
    expect(FC.parseTypeString('[vv,v](+)').name).toBe('+');
    const type1 = FC.parseTypeString('[v(a)v(b),v(c)]');
    expect(type1.name).toBeUndefined();
    expect(type1.inputs[0].name).toBe('a');
    expect(type1.inputs[1].name).toBe('b');
    expect(type1.outputs[0].name).toBe('c');
    const type2 = FC.parseTypeString('[,[,v][v,v]](@)');
    expect(type2.name).toBe('@');
    expect(type2.inputs.length).toBe(0);
    expect(type2.outputs.length).toBe(2);
    expect(type2.outputs[0].typeString).toBe('[,v]');
    expect(type2.outputs[1].typeString).toBe('[v,v]');
    // Make sure subtypes are present.
    const subTypeStrings = ['[v,v]', '[,v]', '[v,vv(q)]'];
    subTypeStrings.forEach(typeString => expect(FC.Type.atomizedTypes.has(typeString)).toBe(true));
  });
});

describe('FunctionchartContext', () => {
  test('element interface', () => {
    const context = new FC.FunctionchartContext(),
          element = context.newElement('binop');

    expect(element instanceof FC.Element).toBe(true);
    expect(element.id).toBe(2);
    expect(element.x).toBe(0);
    element.x = 10;
    expect(element.x).toBe(10);
  });
  test('element typeString', () => {
    const context = new FC.FunctionchartContext(),
          element = context.newElement('element');

    expect(element.typeString).toBe('[,]');
    expect(element.type.inputs.length).toBe(0);
    expect(element.type.outputs.length).toBe(0);
    expect(element.inWires.length).toBe(0);
    expect(element.outWires.length).toBe(0);

    element.typeString = '[v,v]';
    expect(element.typeString).toBe('[v,v]');
    expect(element.type.inputs.length).toBe(1);
    expect(element.type.outputs.length).toBe(1);
    expect(element.inWires.length).toBe(1);
    expect(element.outWires.length).toBe(1);
    expect(element.outWires[0].length).toBe(0);  // Empty wire array.
  });
  test('cond element', () => {
    const context = new FC.FunctionchartContext(),
          element = context.newElement('cond');

    expect(element.typeString).toBe('[v**,*](?)');
    expect(element.type.inputs.length).toBe(3);
    expect(element.type.outputs.length).toBe(1);
  });
  test('pseudoelement interface', () => {
    const context = new FC.FunctionchartContext(),
          pseudostate = context.newPseudoelement('input');

    expect(pseudostate instanceof FC.Pseudoelement).toBe(true);
    expect(pseudostate.id).toBe(2);
    expect(pseudostate.template.typeName).toBe('input');
    expect(pseudostate.x).toBe(0);
    pseudostate.x = 10;
    expect(pseudostate.x).toBe(10);
  });
  test('pseudoelement typeString', () => {
    const context = new FC.FunctionchartContext(),
          pseudoelement = context.newPseudoelement('input');

    expect(pseudoelement.typeString).toBe('[,*]');
    expect(pseudoelement.type.inputs.length).toBe(0);
    expect(pseudoelement.type.outputs.length).toBe(1);
    expect(pseudoelement.inWires.length).toBe(0);
    expect(pseudoelement.outWires.length).toBe(1);
    expect(pseudoelement.outWires[0].length).toBe(0);  // Empty wire array.

    pseudoelement.typeString = '[,v(foo)]';
    expect(pseudoelement.typeString).toBe('[,v(foo)]');
    expect(pseudoelement.type.inputs.length).toBe(0);
    expect(pseudoelement.type.outputs.length).toBe(1);
    expect(pseudoelement.inWires.length).toBe(0);
    expect(pseudoelement.outWires.length).toBe(1);
    expect(pseudoelement.outWires[0].length).toBe(0);  // Empty wire array.
  });
  test('wire interface', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, 'binop'),
          elem2 = addElement(functionchart, 'binop'),
          wire = addWire(functionchart, elem1, 0, elem2, 0);

    expect(wire instanceof FC.Wire).toBe(true);
    expect(wire.src).toBe(elem1);
    expect(wire.src).toBe(elem1);  // twice to exercise reference caching.
    expect(wire.dst).toBe(elem2);
    wire.dst = elem1;
    expect(wire.dst).toBe(elem1);
    wire.dst = undefined;
    expect(wire.dst).toBeUndefined();
  });
  test('functionchart interface', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.newFunctionchart();

    expect(functionchart instanceof FC.Functionchart).toBe(true);
    expect(functionchart.x).toBe(0);
    functionchart.x = 10;
    expect(functionchart.x).toBe(10);
  });
  test('iterators', () => {
    function testIterator(
        fn: (elem: FC.ElementTypes, visitor: FC.WireVisitor) => void,
        elem: FC.ElementTypes,
        items: Array<FC.Wire>) {
      const iterated = new Array<FC.Wire>();
      fn(elem, t => iterated.push(t));
      expect(items.length).toBe(iterated.length);
      for (const item of items) {
        expect(iterated).toContain(item);
      }
    }
    const context = new FC.FunctionchartContext(),
          functionchart = context.newFunctionchart(),
          elem1 = addElement(functionchart, 'binop'),
          elem2 = addElement(functionchart, 'binop'),
          wire1 = addWire(functionchart, elem1, 0, elem2, 0),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire2 = addWire(functionchart, input, 0, elem1, 1),
          wire3 = addWire(functionchart, input, 0, elem2, 1),
          wire4 = addWire(functionchart, elem2, 0, output1, 0),
          wire5 = addWire(functionchart, elem2, 0, output2, 0);

    context.root = functionchart;

    const inputFn = context.forInWires.bind(context),
          outputFn = context.forOutWires.bind(context);
    testIterator(inputFn, input, []);
    testIterator(outputFn, input, [wire2, wire3]);
    testIterator(inputFn, elem1, [wire2]);
    testIterator(outputFn, elem1, [wire1]);
    testIterator(inputFn, elem2, [wire1, wire3]);
    testIterator(outputFn, elem2, [wire4, wire5]);
  });
  test('isValidWire', () => {
    const context = new FC.FunctionchartContext(),
          wire = context.newWire(undefined, 0, undefined, 0),
          functionchart = context.newFunctionchart(),
          elem1 = addElement(functionchart, 'element'),
          elem2 = addElement(functionchart, 'element'),
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output');
    elem1.typeString = '[v,v]';
    elem2.typeString = '[v[v,v],v[v,v]]';
    expect(context.isValidWire(wire)).toBe(false);  // src, dst undefined
    wire.src = elem1;
    wire.srcPin = 0;
    expect(context.isValidWire(wire)).toBe(false);  // dst undefined
    wire.dst = elem1;
    wire.dstPin = 0;
    expect(context.isValidWire(wire)).toBe(false);  // src, dst same
    wire.dst = elem2;
    wire.dstPin = 0
    expect(context.isValidWire(wire)).toBe(true);   // src, dst valid, types match
    wire.srcPin = -1;
    expect(context.isValidWire(wire)).toBe(false);   // srcPin out of range
    wire.srcPin = 2;
    expect(context.isValidWire(wire)).toBe(false);   // srcPin out of range
    wire.srcPin = 0;
    wire.dstPin = -1;
    expect(context.isValidWire(wire)).toBe(false);   // dstPin out of range
    wire.dstPin = 2;
    expect(context.isValidWire(wire)).toBe(false);   // dstPin out of range
    wire.dstPin = 1;
    expect(context.isValidWire(wire)).toBe(false);   // type mismatch
    wire.src = input;
    wire.srcPin = 0;
    expect(context.isValidWire(wire)).toBe(true);    // wildcard match
    wire.src = elem2;
    wire.dst = output;
    wire.dstPin = 0;
    expect(context.isValidWire(wire)).toBe(true);    // wildcard match
  });
  test('isValidFunctionchart', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, 'binop'),
          elem2 = addElement(functionchart, 'binop');
    expect(context.isValidFunctionchart()).toBe(true);
    expect(context.isValidFunctionchart()).toBe(true);
    const wire = addWire(functionchart, elem1, 0, elem2, 0);
    expect(context.isValidFunctionchart()).toBe(true);
    const cycleWire = addWire(functionchart, elem2, 0, elem1, 0);
    expect(context.isValidFunctionchart()).toBe(false);
    functionchart.wires.remove(cycleWire);
    expect(context.isValidFunctionchart()).toBe(true);
  });
  test('replaceElement', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, 'binop'),
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output, 0);
    // Replace concrete element with 'cond' element that has pass-throughs.
    const elem2 = addElement(functionchart, 'cond');
    context.replaceElement(elem1, elem2);
    expect(wire1.dst).toBe(elem2);
    expect(wire2.src).toBe(elem2);
  });

  test('resolveOutputType', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, 'element'),
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output'),
          ios = new Set<FC.ElementTypes>();  // TODO test contents
    elem1.typeString = '[v[vv,v],v]';
    let result = context.resolveOutputType(input, 0, ios);
    expect(result).toBeUndefined();
    expect(ios.size).toBe(0);
    const wire1 = addWire(functionchart, input, 0, elem1, 1);
    result = context.resolveOutputType(input, 0, ios);
    expect(result).toBeDefined();
    expect(result!.typeString).toBe('[vv,v]');
    expect(ios.size).toBe(0);
    // Replace concrete element with 'cond' element that has pass-throughs.
    const elem2 = addElement(functionchart, 'cond');
    context.replaceElement(elem1, elem2);
    expect(context.resolveOutputType(input, 0, ios)).toBeUndefined();
    expect(ios.size).toBe(2);
    expect(ios.has(elem2)).toBe(true);
    expect(ios.has(input)).toBe(true);  // from back edge of cond passthrough.
    ios.clear();
    const wire2 = addWire(functionchart, elem2, 0, output, 0);
    expect(context.resolveOutputType(input, 0, ios)).toBeUndefined();
    expect(ios.size).toBe(3);
    expect(ios.has(elem2)).toBe(true);
    expect(ios.has(input)).toBe(true);
    expect(ios.has(output)).toBe(true);
  });
  test('resolveInputType', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, 'element'),
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output'),
          ios = new Set<FC.ElementTypes>();
    elem1.typeString = '[v[vv,v],[vv,v]]]';
    let result = context.resolveInputType(output, 0, ios);
    expect(result).toBeUndefined();
    expect(ios.size).toBe(0);
    const wire1 = addWire(functionchart, elem1, 0, output, 0);
    result = context.resolveInputType(output, 0, ios);
    expect(result).toBeDefined();
    expect(result!.typeString).toBe('[vv,v]');
    expect(ios.size).toBe(0);
    // Replace concrete element with 'cond' element that has pass-throughs.
    const elem2 = addElement(functionchart, 'cond');
    context.replaceElement(elem1, elem2);
    expect(context.resolveInputType(output, 0, ios)).toBeUndefined();
    expect(ios.size).toBe(2);
    expect(ios.has(elem2)).toBe(true);
    expect(ios.has(output)).toBe(true);  // from front edge of cond passthrough.
    ios.clear();
    const wire2 = addWire(functionchart, input, 0, elem2, 1);
    expect(context.resolveInputType(output, 0, ios)).toBeUndefined();
    expect(ios.size).toBe(3);
    expect(ios.has(elem2)).toBe(true);
    expect(ios.has(input)).toBe(true);
    expect(ios.has(output)).toBe(true);
  });
});

