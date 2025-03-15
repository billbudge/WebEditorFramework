import {describe, expect, test} from '@jest/globals';
import * as Collections from '../src/collections.js';
import * as DataModels from '../src/dataModels.js';
import * as FC from '../examples/functioncharts/functioncharts.js';
import { PointWithNormal } from '../src/geometry.js';

// FunctionchartContext should only be mutated inside a transaction. Since that's cumbersome,
// use this function to update the context's internal structures before and after mutation. Both
// are needed since non-mutating methods like iteration need those structures to be up to date.
function mutate(context: FC.FunctionchartContext, callback: () => void) : void {
  context.updateDerivedInfo();
  callback();
  context.updateDerivedInfo();
}

function addElement(functionchart: FC.Functionchart, typeString: string) {
  const context = functionchart.context,
        element = context.newElement('element');
  element.typeString = typeString;
  mutate(context, () => context.addItem(element, functionchart));
  return element;
}

function addPseudoelement(functionchart: FC.Functionchart, type: FC.PseudoelementType) {
  const context = functionchart.context,
        pseudo = context.newPseudoelement(type);
  mutate(context, () => context.addItem(pseudo, functionchart));
  return pseudo;
}

function addFunctionInstance(parent: FC.Functionchart, instancer: FC.InstancerTypes) : FC.FunctionInstance {
  const context = parent.context,
        functionInstance = context.newElement('instance') as FC.FunctionInstance;
  functionInstance.src = instancer;
  mutate(context, () => context.addItem(functionInstance, parent));
  return functionInstance;
}

function addWire(
    functionchart: FC.Functionchart,
    elem1: FC.ElementTypes | undefined, outPin: number,
    elem2: FC.ElementTypes | undefined, inPin: number) {
  const context = functionchart.context,
        wire = context.newWire(elem1, outPin, elem2, inPin);
  mutate(context, () => context.addItem(wire, functionchart));
  return wire;
}

function addFunctionchart(parent: FC.Functionchart) : FC.Functionchart {
  const context = parent.context,
        functionchart = parent.context.newFunctionchart('functionchart');
  mutate(context, () => context.addItem(functionchart, parent));
  return functionchart;
}

// function addRecursiveFunctionchart(parent: FC.Functionchart) : FC.Functionchart {
//   const context = parent.context,
//         functionchart = parent.context.newFunctionchart(),
//         elem1 = addElement(functionchart, '[vv,v]'),
//         elem2 = addElement(functionchart, '[vv,v]'),
//         wire1 = addWire(functionchart, elem1, 0, elem2, 0);
//   context.completeElements([elem1, elem2], pinPosition, pinPosition);
//   const self1 = addFunctionInstance(functionchart, functionchart),
//         self2 = addFunctionInstance(functionchart, functionchart),
//         wire2 = addWire(functionchart, self1, 0, self2, 0);
//   return functionchart;
// }

// function setEquals(set1: Set<any>, set2: Array<any>) {
//   expect(set1.size).toBe(set2.length);
//   for (const item of set2) {
//     expect(set1.has(item)).toBe(true);
//   }
// }

function arrayEquals(array1: Array<any>, array2: Array<any>) {
  expect(array1.length).toBe(array2.length);
  for (let i = 0; i < array1.length; i++) {
    expect(array1[i]).toBe(array2[i]);
  }
}

//------------------------------------------------------------------------------

// Setup.
beforeEach(() => {
  // FC.Type.initializeForTesting();
});

describe('Pin' , () => {
  test('Pin', () => {
    const valuePin = new FC.Pin(FC.Type.valueType);
    expect(valuePin.type).toBe(FC.Type.valueType);
    expect(valuePin.name).toBeUndefined();
    expect(valuePin.toString()).toBe('v');
    expect(valuePin.toString()).toBe('v');

    const namedPin = new FC.Pin(valuePin.type, 'pin1');
    expect(namedPin.toString()).toBe('v(pin1)');
    expect(namedPin.toString()).toBe('v(pin1)');
  });
});

describe('Type' , () => {
  test('Type', () => {
    const type1 = FC.Type.fromString('[v,v]'),
          type2 = FC.Type.fromString('[vv,v]');
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

    const named = FC.Type.fromInfo(type1.inputs, type1.outputs, 'type1');
    expect(named).not.toBe(type1);
    expect(type1.typeString).toBe('[v,v]');
    expect(named.typeString).toBe('[v,v](type1)');
    expect(named.typeString).toBe('[v,v](type1)');

    const labeled = FC.Type.fromString('[v(1)v(2),v(3)](foo)'),
          copyUnnamed = labeled.rename();
    expect(copyUnnamed).not.toBe(labeled);
    expect(copyUnnamed.name).toBeUndefined();
    expect(copyUnnamed.typeString).toBe('[v(1)v(2),v(3)]');
  });
  test('base Types', () => {
    const valueType = FC.Type.fromString('v'),
          emptyType = FC.Type.fromString('[,]');
    expect(valueType).toBe(FC.Type.valueType);
    expect(emptyType).toBe(FC.Type.emptyType);
  });
  test('atomized', () => {
    const valueType = FC.Type.valueType,
          type1 = FC.Type.fromInfo([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]),
          type2 = FC.Type.fromInfo([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]);
    expect(type1).toBe(type2);
  });
  test('canConnect', () => {
    expect(FC.Type.valueType.canConnectTo(FC.Type.valueType)).toBe(true);

    // const type1 = FC.Type.typeFromString('[v,v]'),
    //       type2 = FC.Type.typeFromString('[vv,v]');
    // expect (type1.canConnectTo(FC.Type.valueType)).toBe(false);
    // expect(type1.canConnectTo(type2)).toBe(false);
    // expect(type2.canConnectTo(type1)).toBe(true);
  });
  test('varArgs', () => {
    let t;
    t = FC.Type.fromString('[v(name),v]');
    expect(t.varArgs).toBe(false);
    expect(t.inputs[0].varArgs).toBe(0);
    expect(() => FC.Type.fromString('[v(name){foo},v]')).toThrow(Error);

    t = FC.Type.fromString('[v(name){1},v]');
    expect(t.varArgs).toBe(true);
    expect(t.inputs.length).toBe(1);
    expect(t.inputs[0].varArgs).toBe(1);
    t = FC.Type.fromString('[v(name){2},v]');
    expect(t.varArgs).toBe(true);
    expect(t.inputs.length).toBe(2);
    expect(t.inputs[0].varArgs).toBe(1);
    expect(t.inputs[1].varArgs).toBe(2);
    t = FC.Type.fromString('[vv(name){2}[v,v]{2},v]');
    expect(t.varArgs).toBe(true);
    expect(t.inputs.length).toBe(5);
    expect(t.inputs[0].varArgs).toBe(0);
    expect(t.inputs[0].type).toBe(FC.Type.valueType);
    expect(t.inputs[1].varArgs).toBe(1);
    expect(t.inputs[2].varArgs).toBe(2);
    expect(t.inputs[3].varArgs).toBe(1);
    expect(t.inputs[3].type.typeString).toBe('[v,v]');
    expect(t.inputs[4].varArgs).toBe(2);
  });
  // TODO new Type methods
});

describe('parseTypeString', () => {
  test('parseTypeString', () => {
    const typeStrings = [
      'v',
      '[vv,v](+)',
      '[v(a)v(b),v(c)]',
      '[,[,v][v,v]](@)',
      '[[v,vv(q)](a)v(b),v(c)](foo)',
      '[v(p(0))),](p(0))=1)',  // labels with ')' in them (escaped).
    ];
    typeStrings.forEach(typeString => expect(FC.Type.fromString(typeString).typeString).toBe(typeString));
    typeStrings.forEach(typeString => expect(FC.Type.isAtomized(typeString)).toBe(true));
    expect(FC.Type.fromString('[v,v]').name).toBeUndefined();
    expect(FC.Type.fromString('[vv,v](+)').name).toBe('+');
    const type1 = FC.Type.fromString('[v(a)v(b),v(c)]');
    expect(type1.name).toBeUndefined();
    expect(type1.inputs[0].name).toBe('a');
    expect(type1.inputs[1].name).toBe('b');
    expect(type1.outputs[0].name).toBe('c');
    const type2 = FC.Type.fromString('[,[,v][v,v]](@)');
    expect(type2.name).toBe('@');
    expect(type2.inputs.length).toBe(0);
    expect(type2.outputs.length).toBe(2);
    expect(type2.outputs[0].toString()).toBe('[,v]');
    expect(type2.outputs[1].toString()).toBe('[v,v]');
    // Make sure some subtypes are atomized.
    const subTypeStrings = ['[v,v]', '[,v]', '[v,vv(q)](a)'];
    subTypeStrings.forEach(typeString => expect(FC.Type.isAtomized(typeString)).toBe(true));
  });
  test('pinAndTypeNames', () => {
    expect(FC.Type.fromString('[v,v]()').name).toBeUndefined();
    const type1 = FC.Type.fromString('[[,](f),[,](g)(x)]'),
          input1 = type1.inputs[0],
          output1 = type1.outputs[0];
    expect(type1.name).toBeUndefined();
    expect(input1.name).toBeUndefined();
    expect(input1.type.name).toBe('f');
    expect(output1.name).toBe('x');
    expect(output1.type.name).toBe('g');
    expect (type1.typeString).toBe('[[,](f),[,](g)(x)]');
    const type2 = FC.Type.fromString('[[,]()(f),[,](g)()]'),
          input2 = type2.inputs[0],
          output2 = type2.outputs[0];
    expect(type2.name).toBeUndefined();
    expect(input2.name).toBe('f');
    expect(input2.type.name).toBeUndefined();
    expect(output2.name).toBeUndefined();
    expect(output2.type.name).toBe('g');
    expect (type2.typeString).toBe('[[,]()(f),[,](g)]');
  });
});

describe('FunctionchartContext', () => {
  test('element interface', () => {
    const context = new FC.FunctionchartContext(),
          element = context.newElement('element');

    expect(element instanceof FC.Element).toBe(true);
    expect(element.id).toBe(2);
    expect(element.x).toBe(0);
    element.x = 10;
    expect(element.x).toBe(10);
  });
  test('element typeString', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          element = addElement(functionchart, '[,]');

    expect(element.typeString).toBe('[,]');
    expect(element.type.inputs.length).toBe(0);
    expect(element.type.outputs.length).toBe(0);

    element.typeString = '[v,v]';
    expect(element.typeString).toBe('[v,v]');
    expect(element.type.inputs.length).toBe(1);
    expect(element.type.outputs.length).toBe(1);
  });
  test('pseudoelement interface', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          pseudoelement = addPseudoelement(functionchart, 'input');

    expect(pseudoelement instanceof FC.Pseudoelement).toBe(true);
    expect(pseudoelement.id).toBe(2);
    expect(pseudoelement.template.typeName).toBe('input');
    expect(pseudoelement.x).toBe(0);
    pseudoelement.x = 10;
    expect(pseudoelement.x).toBe(10);
  });
  test('pseudoelement typeString', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          pseudoelement = addPseudoelement(functionchart, 'input');

    expect(pseudoelement.typeString).toBe('[,v]');
    expect(pseudoelement.type.inputs.length).toBe(0);
    expect(pseudoelement.type.outputs.length).toBe(1);

    pseudoelement.typeString = '[,v(foo)]';
    expect(pseudoelement.typeString).toBe('[,v(foo)]');
    expect(pseudoelement.type.inputs.length).toBe(0);
    expect(pseudoelement.type.outputs.length).toBe(1);
  });
  test('wire interface', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          elem2 = addElement(functionchart, '[vv,v]'),
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
          functionchart = context.root;

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
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          elem2 = addElement(functionchart, '[vv,v]'),
          wire1 = addWire(functionchart, elem1, 0, elem2, 0),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire2 = addWire(functionchart, input, 0, elem1, 1),
          wire3 = addWire(functionchart, input, 0, elem2, 1),
          wire4 = addWire(functionchart, elem2, 0, output1, 0),
          wire5 = addWire(functionchart, elem2, 0, output2, 0);

    const inputFn = context.forInWires.bind(context),
          outputFn = context.forOutWires.bind(context);
    testIterator(inputFn, input, []);
    testIterator(outputFn, input, [wire2, wire3]);
    testIterator(inputFn, elem1, [wire2]);
    testIterator(outputFn, elem1, [wire1]);
    testIterator(inputFn, elem2, [wire1, wire3]);
    testIterator(outputFn, elem2, [wire4, wire5]);
  });
  test('resolveReference', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          elem2 = addElement(functionchart, '[vv,v]'),
          wire = addWire(functionchart, elem1, 0, elem2, 0);
    expect(context.resolveReference(wire, wire.template.src)).toBe(elem1);
    expect(context.resolveReference(wire, wire.template.dst)).toBe(elem2);
  });
  test('construct', () => {
    const context = new FC.FunctionchartContext();
    let element;
    element = context.construct('element');
    expect(element instanceof FC.Element).toBe(true);
  });
  test('isValidWire', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          wire = addWire(functionchart, undefined, 0, undefined, 0),
          elem1 = addElement(functionchart, '[vv,v]'),
          elem2 = addElement(functionchart, '[vv,v]'),
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
    // expect(context.isValidWire(wire)).toBe(false);   // type mismatch  // FIXME
    wire.src = input;
    wire.srcPin = 0;
    expect(context.isValidWire(wire)).toBe(true);    // wildcard match
    wire.src = elem2;
    wire.dst = output;
    wire.dstPin = 0;
    expect(context.isValidWire(wire)).toBe(true);    // wildcard match

    const fc1 = addFunctionchart(functionchart),
          fc2 = addFunctionchart(functionchart),
          elem3 = addElement(fc1, '[vv,v]'),
          elem4 = addElement(fc2, '[vv,v]'),
          wire2 = addWire(fc1, elem3, 0, elem4, 0);  // straddle sibling functioncharts.
    expect(context.isValidWire(wire2)).toBe(false);
    const wire3 = addWire(functionchart, elem1, 0, elem3, 0);  // from parent fc to child fc.
    expect(context.isValidWire(wire3)).toBe(true);
    const wire4 = addWire(functionchart, elem3, 0, elem1, 0);  // from child fc to parent fc.
    expect(context.isValidWire(wire4)).toBe(false);
  });
  test('isValidFunctionchart', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          elem2 = addElement(functionchart, '[vv,v]');
    expect(context.isValidFunctionchart()).toBe(true);
    expect(context.isValidFunctionchart()).toBe(true);
    const wire = addWire(functionchart, elem1, 0, elem2, 0);
    expect(context.isValidFunctionchart()).toBe(true);
    const cycleWire = addWire(functionchart, elem2, 0, elem1, 0);
    expect(context.isValidFunctionchart()).toBe(false);
    functionchart.wires.remove(cycleWire);
    context.updateDerivedInfo();
    expect(context.isValidFunctionchart()).toBe(true);
  });
  test('replaceElement', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output, 0);
    // Replace concrete element with 'cond' element that has pass-throughs.  TODO passthroughs?
    const elem2 = addElement(functionchart, '[vvv,v]');
    mutate(context, () => context.replaceNode(elem1, elem2));
    expect(wire1.src).toBe(input);
    expect(wire1.dst).toBe(elem2);
    expect(wire2.src).toBe(elem2);
    expect(wire2.dst).toBe(output);
  });
  test('disconnectElement', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output1, 0),
          wire3 = addWire(functionchart, elem1, 0, output2, 0);
    expect(functionchart.wires.length).toBe(3);
    // expect(elem1.inWires[0]).toBeUndefined();
    // expect(elem1.inWires[1]).toBe(wire1);
    // expect(elem1.outWires[0].length).toBe(2);
    mutate(context, () => context.disconnectNode(elem1));
    expect(functionchart.wires.length).toBe(0);
    // expect(elem1.inWires[1]).toBeUndefined();
    // expect(elem1.outWires[0].length).toBe(0);
  });
  test('disconnectSelection', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output1, 0),
          wire3 = addWire(functionchart, elem1, 0, output2, 0);
    expect(functionchart.wires.length).toBe(3);
    expect(elem1.inWires[0]).toBeUndefined();
    expect(elem1.inWires[1]).toBe(wire1);
    expect(elem1.outWires[0].length).toBe(2);
    mutate(context, () => context.disconnectSelection());
    expect(functionchart.wires.length).toBe(3);
    expect(elem1.inWires[0]).toBeUndefined();
    expect(elem1.inWires[1]).toBe(wire1);
    expect(elem1.outWires[0].length).toBe(2);
    context.selection.add(elem1);
    mutate(context, () => context.disconnectSelection());
    expect(functionchart.wires.length).toBe(0);
    expect(elem1.inWires[1]).toBeUndefined();
    expect(elem1.outWires[0].length).toBe(0);
  });
  test('extendSelectionToWires', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output1, 0),
          wire3 = addWire(functionchart, elem1, 0, output2, 0);
    context.selection.add(elem1);
    expect(context.selection.length).toBe(1);
    context.extendSelectionToWires();
    expect(context.selection.length).toBe(1);
    context.selection.add(input);
    context.extendSelectionToWires();
    expect(context.selection.length).toBe(3);
    expect(context.selection.has(wire1)).toBe(true);
  });
  test('getConnectedElements', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vv,v]'),
          input = addPseudoelement(functionchart, 'input'),
          output1 = addPseudoelement(functionchart, 'output'),
          output2 = addPseudoelement(functionchart, 'output'),
          wire1 = addWire(functionchart, input, 0, elem1, 1),
          wire2 = addWire(functionchart, elem1, 0, output1, 0),
          wire3 = addWire(functionchart, elem1, 0, output2, 0);
    let connected = context.getConnectedNodes([elem1], () => true, () => false);
    expect(connected.size).toBe(2);
    expect(connected.has(elem1)).toBe(true);
    expect(connected.has(input)).toBe(true);
    connected = context.getConnectedNodes([elem1], () => false, () => true);
    expect(connected.size).toBe(3);
    expect(connected.has(elem1)).toBe(true);
    expect(connected.has(output1)).toBe(true);
    expect(connected.has(output2)).toBe(true);
    connected = context.getConnectedNodes([elem1], () => true, () => true);
    expect(connected.size).toBe(4);
    expect(connected.has(elem1)).toBe(true);
    expect(connected.has(input)).toBe(true);
    expect(connected.has(output1)).toBe(true);
    expect(connected.has(output2)).toBe(true);
  });
  // test('updateType', () => {
  //   const context = new FC.FunctionchartContext(),
  //         functionchart = context.root,
  //         elem1 = addElement(functionchart, '[vv,v]'),
  //         input = addPseudoelement(functionchart, 'input'),
  //         output = addPseudoelement(functionchart, 'output');
  //   elem1.typeString = '[v,v]';
  //   const wire1 = addWire(functionchart, input, 0, elem1, 0),
  //         wire2 = addWire(functionchart, elem1, 0, output, 0);
  //   let graphInfo = context.getGraphInfo();
  //   expect(graphInfo.elements.has(elem1)).toBe(true);
  //   expect(graphInfo.elements.has(input)).toBe(true);
  //   expect(graphInfo.elements.has(output)).toBe(true);
  //   expect(graphInfo.wires.has(wire1)).toBe(true);
  //   expect(graphInfo.wires.has(wire2)).toBe(true);
  //   context.updateType(elem1, '[vvv,vv]');
  //   // expect(elem1.typeString).toBe('[vvv,vv]');
  //   // expect(graphInfo.wires.has(wire1)).toBe(true);  TODO fixme
  //   // expect(graphInfo.wires.has(wire2)).toBe(true);
  // });
  // TODO changeType
  // TODO resolve output type
  // test('resolveOutputType', () => {
  //   const context = new FC.FunctionchartContext(),
  //         functionchart = context.root,
  //         elem1 = addElement(functionchart, '[vv,v]'),
  //         input = addPseudoelement(functionchart, 'input'),
  //         output = addPseudoelement(functionchart, 'output'),
  //         ios = new Set<FC.ElementTypes>();  // TODO test contents
  //   elem1.typeString = '[v[vv,v],v]';
  //   let result = context.resolveOutputType(input, 0, ios);
  //   expect(result).toBeUndefined();
  //   expect(ios.size).toBe(0);
  //   const wire1 = addWire(functionchart, input, 0, elem1, 1);
  //   result = context.resolveOutputType(input, 0, ios);
  //   expect(result).toBeDefined();
  //   expect(result!.typeString).toBe('[vv,v]');
  //   expect(ios.size).toBe(0);
  //   // Replace concrete element with 'cond' element that has pass-throughs.
  //   const elem2 = addElement(functionchart, 'cond');
  //   context.replaceElement(elem1, elem2);
  //   expect(context.resolveOutputType(input, 0, ios)).toBeUndefined();
  //   expect(ios.size).toBe(2);
  //   expect(ios.has(elem2)).toBe(true);
  //   expect(ios.has(input)).toBe(true);  // from back edge of cond passthrough.
  //   ios.clear();
  //   const wire2 = addWire(functionchart, elem2, 0, output, 0);
  //   expect(context.resolveOutputType(input, 0, ios)).toBeUndefined();
  //   expect(ios.size).toBe(3);
  //   expect(ios.has(elem2)).toBe(true);
  //   expect(ios.has(input)).toBe(true);
  //   expect(ios.has(output)).toBe(true);
  // });
  test('resolvePinType - input type', () => {  // FIXME
    // const context = new FC.FunctionchartContext(),
    //       functionchart = context.root,
    //       elem1 = addElement(functionchart, '[vv,v]'),
    //       input = addPseudoelement(functionchart, 'input'),
    //       output = addPseudoelement(functionchart, 'output'),
    //       pins = new Collections.Multimap<FC.ElementTypes, number>();
    // elem1.typeString = '[v[vv,v],[vv,v]]';
    // let result = context.resolvePinType(output, 0, pins);
    // expect(result).toBeUndefined();  // FIXME
    // expect(pins.size).toBe(1);output.type.inputs
    // expect(pins.has(output, 0)).toBe(true);
    // const wire1 = addWire(functionchart, elem1, 0, output, 0);
    // pins.clear();
    // result = context.resolvePinType(output, 0, pins);
    // expect(result).toBeDefined();
    // expect(result!.toString()).toBe('[vv,v]');
    // expect(pins.size).toBe(2);
    // expect(pins.has(output, 0)).toBe(true);
    // expect(pins.has(elem1, 2)).toBe(true);
    // // Replace concrete element with 'cond' element that has pass-throughs.
    // const elem2 = addElement(functionchart, 'cond');
    // context.replaceElement(elem1, elem2);
    // pins.clear();
    // expect(context.resolvePinType(output, 0, pins)).toBeUndefined();  // FIXME
    // expect(pins.size).toBe(4);
    // expect(pins.has(output, 0)).toBe(true);
    // expect(pins.has(elem2, 3)).toBe(true);
    // expect(pins.has(elem2, 1)).toBe(true);
    // expect(pins.has(elem2, 2)).toBe(true);
    // const wire2 = addWire(functionchart, input, 0, elem2, 1);
    // pins.clear();
    // expect(context.resolvePinType(output, 0, pins)).toBeUndefined();  // FIXME
    // expect(pins.size).toBe(5);
    // expect(pins.has(output, 0)).toBe(true);
    // expect(pins.has(elem2, 3)).toBe(true);
    // expect(pins.has(elem2, 1)).toBe(true);
    // expect(pins.has(elem2, 2)).toBe(true);
    // expect(pins.has(input, 0)).toBe(true);
  });
  test('reduceSelection', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          functionchart1 = addFunctionchart(functionchart),
          elem1 = addElement(functionchart1, '[vv,v]'),
          elem2 = addElement(functionchart1, '[vv,v]'),
          elem3 = addElement(functionchart, '[vv,v]');
    context.reduceSelection();
    expect(context.selectedElements().length).toBe(0);
    expect(context.selectedNodes().length).toBe(0);
    expect(context.selectedNodes().length).toBe(0);
    context.selection.add(elem1);
    context.reduceSelection();
    expect(context.selectedElements().length).toBe(1);
    expect(context.selectedNodes().length).toBe(1);
    expect(context.selectedNodes().length).toBe(1);
    context.selection.add(functionchart1);
    expect(context.selectedElements().length).toBe(1);
    expect(context.selectedNodes().length).toBe(2);
    context.reduceSelection();
    expect(context.selectedElements().length).toBe(0);
    expect(context.selectedNodes().length).toBe(1);
    expect(context.selectedNodes()[0]).toBe(functionchart1);
  });
  test('getFunctionchartTypeInfo', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          elem1 = addElement(functionchart, '[vvv,v]'),
          elem2 = addElement(functionchart, '[vvv,v]');
    let typeInfo = context.getFunctionchartTypeInfo(functionchart);
    // No inputs or outputs.
    expect(typeInfo.instanceType.typeString).toBe('[,]');
    const wire1 = addWire(functionchart, elem1, 0, elem2, 2);
    mutate(context, () => context.completeNode([elem1, elem2]));
    typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.instanceType.typeString).toBe('[vvvvv,v]');
    expect(typeInfo.abstract).toBe(false);
  });
  test('getAbstractFunctionchartTypeInfo', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output');
    let typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.instanceType.typeString).toBe('[v,v]');
    expect(typeInfo.abstract).toBe(true);
    const wire1 = addWire(functionchart, input, 0, output, 0);
    typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.instanceType.typeString).toBe('[v,v]');
    expect(typeInfo.abstract).toBe(false);  // A wire.
  });
  const recursiveFuncionchartTest = {
    "type": "functionchart",
    "id": 2,
    "nodes": [
      {
        "type": "functionchart",
        "id": 3,
        "nodes": [
          {
            "type": "element",
            "id": 4,
            "name": "binop",
            "typeString": "[vv,v](+)",
          },
          {
            "type": "element",
            "id": 5,
            "name": "binop",
            "typeString": "[vv,v](+)",
          },
          {
            "type": "input",
            "id": 6,
            "typeString": "[,v]"
          },
          {
            "type": "input",
            "id": 7,
            "typeString": "[,v]"
          },
          {
            "type": "input",
            "id": 8,
            "typeString": "[,v]"
          },
          {
            "type": "output",
            "id": 9,
            "typeString": "[v,]"
          },
          {
            "type": "instance",
            "id": 10,
            "instancer": 3
          },
          {
            "type": "instance",
            "id": 11,
            "instancer": 3
          }
        ],
        "wires": [
          {
            "type": "wire",
            "src": 4,
            "srcPin": 0,
            "dst": 5,
            "dstPin": 0
          },
          {
            "type": "wire",
            "src": 6,
            "srcPin": 0,
            "dst": 4,
            "dstPin": 0
          },
          {
            "type": "wire",
            "src": 7,
            "srcPin": 0,
            "dst": 4,
            "dstPin": 1
          },
          {
            "type": "wire",
            "src": 8,
            "srcPin": 0,
            "dst": 5,
            "dstPin": 1
          },
          {
            "type": "wire",
            "src": 5,
            "srcPin": 0,
            "dst": 9,
            "dstPin": 0
          },
          {
            "type": "wire",
            "src": 11,
            "srcPin": 0,
            "dst": 10,
            "dstPin": 0
          }
        ]
      }
    ],
    "wires": []
  }

  test('recursiveFunctionchart', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = DataModels.Deserialize(recursiveFuncionchartTest, context) as FC.Functionchart;
    context.root = functionchart;
    expect(functionchart.nodes.length).toBe(1);
    const fc = functionchart.nodes.get(0) as FC.Functionchart;
    expect(fc).toBeInstanceOf(FC.Functionchart);
    expect(fc.nodes.length).toBe(8);
    const rfi1 = fc.nodes.get(6) as FC.FunctionInstance,
          rfi2 = fc.nodes.get(7) as FC.FunctionInstance;
    expect(rfi1).toBeInstanceOf(FC.FunctionInstance);
    expect(rfi2).toBeInstanceOf(FC.FunctionInstance);
    expect(fc.wires.length).toBe(6);
  });

  const isValidFunctionInstanceTest = {
    "type": "functionchart",
    "id": 2,
    "width": 941.9321769475937,
    "height": 479.58752822875977,
    "nodes": [
      {
        "type": "functionchart",
        "id": 3,
        "x": 257.8312476873398,
        "y": 207.09062957763672,
        "width": 668.1009292602539,
        "height": 256.49689865112305,
        "nodes": [
          {
            "type": "functionchart",
            "id": 4,
            "x": 19.175708770751953,
            "y": 11.459365844726562,
            "width": 419.1364936828613,
            "height": 228.80315780639648,
            "nodes": [
              {
                "type": "functionchart",
                "id": 5,
                "x": 24.824970245361328,
                "y": 29.593730926513672,
                "width": 187.6920166015625,
                "height": 84.65069580078125,
                "name": "closed",
                "nodes": [
                  {
                    "type": "element",
                    "id": 6,
                    "typeString": "[vv,v](+)",
                    "x": 56,
                    "y": 11.1031494140625,
                    "name": "binop"
                  },
                  {
                    "type": "output",
                    "id": 7,
                    "typeString": "[v,]",
                    "x": 99.4715576171875,
                    "y": 5.5456390380859375
                  },
                  {
                    "type": "input",
                    "id": 8,
                    "typeString": "[,v]",
                    "x": 8,
                    "y": 37.1031494140625
                  },
                  {
                    "type": "input",
                    "id": 9,
                    "typeString": "[,v]",
                    "x": 8.365631103515625,
                    "y": 8
                  }
                ],
                "wires": [
                  {
                    "type": "wire",
                    "src": 6,
                    "srcPin": 0,
                    "dst": 7,
                    "dstPin": 0
                  },
                  {
                    "type": "wire",
                    "src": 8,
                    "srcPin": 0,
                    "dst": 6,
                    "dstPin": 1
                  },
                  {
                    "type": "wire",
                    "src": 9,
                    "srcPin": 0,
                    "dst": 6,
                    "dstPin": 0
                  }
                ]
              },
              {
                "type": "functionchart",
                "id": 10,
                "x": 44.60011672973633,
                "y": 120.80938339233398,
                "width": 172.61685180664062,
                "height": 91.9937744140625,
                "name": "open",
                "nodes": [
                  {
                    "type": "element",
                    "id": 11,
                    "typeString": "[vv,v](+)",
                    "x": 56,
                    "y": 11.1031494140625,
                    "name": "binop"
                  },
                  {
                    "type": "output",
                    "id": 12,
                    "typeString": "[v,]",
                    "x": 111.20623779296875,
                    "y": 15.55938720703125
                  },
                  {
                    "type": "input",
                    "id": 13,
                    "typeString": "[,v]",
                    "x": 8,
                    "y": 37.1031494140625
                  }
                ],
                "wires": [
                  {
                    "type": "wire",
                    "src": 11,
                    "srcPin": 0,
                    "dst": 12,
                    "dstPin": 0
                  },
                  {
                    "type": "wire",
                    "src": 13,
                    "srcPin": 0,
                    "dst": 11,
                    "dstPin": 1
                  }
                ]
              },
              {
                "type": "input",
                "id": 14,
                "typeString": "[,v]",
                "x": 16.878253936767578,
                "y": 130.32810592651367
              },
              {
                "type": "importer",
                "id": 18,
                "typeString": "[,[v,v](open)]",
                "x": 248.64843893051147,
                "y": 126.78422355651855
              }
            ],
            "wires": [
              {
                "type": "wire",
                "src": 14,
                "srcPin": 0,
                "dst": 11,
                "dstPin": 0
              }
            ]
          }
        ],
        "wires": []
      }
    ],
    "wires": []
  }
  test('canAddNode', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = DataModels.Deserialize(isValidFunctionInstanceTest, context) as FC.Functionchart;
    context.root = functionchart;
    const greatGrandparent = functionchart.nodes.get(0) as FC.Functionchart,
          grandparent = greatGrandparent.nodes.get(0) as FC.Functionchart,
          fc1 = grandparent.nodes.get(0) as FC.Functionchart,
          fc2 = grandparent.nodes.get(1) as FC.Functionchart,
          importer = grandparent.nodes.get(3) as FC.ModifierElement;
    expect(greatGrandparent).toBeInstanceOf(FC.Functionchart);
    expect(grandparent).toBeInstanceOf(FC.Functionchart);
    expect(fc1).toBeInstanceOf(FC.Functionchart);
    expect(fc2).toBeInstanceOf(FC.Functionchart);

    // Closed Functionchart instances.
    const inst1 = addFunctionInstance(fc1, fc1);  // closed, recursive instantiation.
    expect(context.isValidFunctionInstance(inst1)).toBe(true);
    const inst2 = addFunctionInstance(grandparent, fc1);  // closed, scope outside definition.
    expect(context.isValidFunctionInstance(inst2)).toBe(true);
    const inst3 = addFunctionInstance(greatGrandparent, fc1);  // closed, next scope out.
    expect(context.isValidFunctionInstance(inst3)).toBe(true);
    const inst4 = addFunctionInstance(functionchart, fc1);  // closed, outermost scope.
    expect(context.isValidFunctionInstance(inst4)).toBe(true);
    // Open Functionchart instances.
    const inst5 = addFunctionInstance(fc2, fc2);  // open, recursive instantiation.
    expect(context.isValidFunctionInstance(inst5)).toBe(true);
    const inst6 = addFunctionInstance(grandparent, fc2);  // open, scope outside definition.
    expect(context.isValidFunctionInstance(inst6)).toBe(true);
    const inst7 = addFunctionInstance(greatGrandparent, fc2);  // open, next scope out, invalid.
    expect(context.isValidFunctionInstance(inst7)).toBe(false);
    const inst8 = addFunctionInstance(functionchart, fc2);  // open, outermost scope, invalid.
    expect(context.isValidFunctionInstance(inst8)).toBe(false);
    const inst9 = addFunctionInstance(fc1, fc2);  // open, sibling scope, valid.
    expect(context.isValidFunctionInstance(inst9)).toBe(true);
    // ImporterElement instances.
    expect(importer instanceof FC.ModifierElement);
    const inst10 = addFunctionInstance(grandparent, importer);  // instanced to importer scope.
    expect(context.isValidFunctionInstance(inst10)).toBe(true);
    const inst11 = addFunctionInstance(fc1, importer);  // instanced to scope inside scope of importer.
    expect(context.isValidFunctionInstance(inst11)).toBe(true);
    const inst12 = addFunctionInstance(greatGrandparent, importer);  // instanced outside importer scope.
    expect(context.isValidFunctionInstance(inst12)).toBe(false);
  });
});
