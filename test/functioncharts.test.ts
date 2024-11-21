import {describe, expect, test} from '@jest/globals';
import * as Collections from '../src/collections.js';
import * as DataModels from '../src/dataModels.js';
import * as FC from '../examples/functioncharts/functioncharts.js';
import { PointWithNormal } from '../src/geometry.js';

// FunctionchartContext should only be mutated inside a transaction. Since that's cumbersome,
// use this function to update the context's internal structures before and after mutation. Both
// are needed since non-mutating methods like iteration need those structures to be up to date.
function mutate(context: FC.FunctionchartContext, callback: () => void) : void {
  context.updateGraphInfo();
  callback();
  context.updateGraphInfo();
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

function addFunctionInstance(
    functionchart: FC.Functionchart, definition: FC.Functionchart) : FC.FunctionInstance {
  const context = functionchart.context,
        functionInstance = context.newFunctionInstance();
  functionInstance.functionchart = definition;
  mutate(context, () => context.addItem(functionInstance, functionchart));
  return functionInstance;
}

function addWire(
    functionchart: FC.Functionchart,
    elem1: FC.AllElementTypes | undefined, outPin: number,
    elem2: FC.AllElementTypes | undefined, inPin: number) {
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
    expect(valuePin.typeString).toBe('v');

    const namedPin = new FC.Pin(valuePin.type, 'pin1');
    expect(namedPin.toString()).toBe('v(pin1)');
    expect(namedPin.typeString).toBe('v(pin1)');

    const valuePin2 = valuePin.copy();
    expect(valuePin2).not.toBe(valuePin);
    expect(valuePin2.type).toBe(valuePin.type);
    expect(valuePin2.name).toBe(valuePin.name);

    const unlabeledValuePin = valuePin.copyUnlabeled();
    expect(unlabeledValuePin).not.toBe(valuePin);
    expect(unlabeledValuePin.type).toBe(valuePin.type);
    expect(unlabeledValuePin.name).toBeUndefined();
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
    expect(type1.toString()).toBe('[v,v]');
    expect(named.toString()).toBe('[v,v](type1)');
    expect(named.toString()).toBe('[v,v](type1)');

    const copy = type1.copy();
    expect(copy).not.toBe(type1);
    expect(copy.inputs[0]).not.toBe(type1.inputs[0]);
    expect(copy.inputs[0].type).toBe(type1.inputs[0].type);

    const copyUnlabeled = type1.copyUnlabeled();
    expect(copyUnlabeled).not.toBe(type1);
    expect(copyUnlabeled.name).toBeUndefined();
    expect(copyUnlabeled.toString()).toBe('[v,v]');
    expect(copyUnlabeled.toString()).toBe('[v,v]');
  });
  test('base Types', () => {
    const valueType = FC.parseTypeString('v'),
          emptyType = FC.parseTypeString('[,]');
    expect(valueType).toBe(FC.Type.valueType);
    expect(emptyType).toBe(FC.Type.emptyType);
  });
  test('atomized', () => {
    const valueType = FC.Type.valueType,
          type1 = new FC.Type([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]),
          type2 = new FC.Type([new FC.Pin(valueType), new FC.Pin(valueType)], [new FC.Pin(valueType)]);
    expect(type1).not.toBe(type2);
    expect(type1.atomized()).toStrictEqual(type1);
    expect(type2.atomized()).toStrictEqual(type1);

  });
  test('canConnect', () => {
    expect(FC.Type.valueType.canConnectTo(FC.Type.valueType)).toBe(true);

    // const type1 = FC.parseTypeString('[v,v]'),
    //       type2 = FC.parseTypeString('[vv,v]');
    // expect (type1.canConnectTo(FC.Type.valueType)).toBe(false);
    // expect(type1.canConnectTo(type2)).toBe(false);
    // expect(type2.canConnectTo(type1)).toBe(true);
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
          element = context.newElement('element');

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

    element.typeString = '[v,v]';
    expect(element.typeString).toBe('[v,v]');
    expect(element.type.inputs.length).toBe(1);
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
        fn: (elem: FC.AllElementTypes, visitor: FC.WireVisitor) => void,
        elem: FC.AllElementTypes,
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
    mutate(context, () => context.replaceElement(elem1, elem2));
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
    expect(context.selectedTrueElements().length).toBe(0);
    expect(context.selectedNodes().length).toBe(0);
    expect(context.selectedNodes().length).toBe(0);
    context.selection.add(elem1);
    context.reduceSelection();
    expect(context.selectedTrueElements().length).toBe(1);
    expect(context.selectedNodes().length).toBe(1);
    expect(context.selectedNodes().length).toBe(1);
    context.selection.add(functionchart1);
    expect(context.selectedTrueElements().length).toBe(1);
    expect(context.selectedNodes().length).toBe(2);
    context.reduceSelection();
    expect(context.selectedTrueElements().length).toBe(0);
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
    expect(typeInfo.typeString).toBe('[,]');
    // expect(typeInfo.passThroughs.length).toBe(0);
    const wire1 = addWire(functionchart, elem1, 0, elem2, 2);
    mutate(context, () => context.completeNode([elem1, elem2]));
    typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.typeString).toBe('[vvvvv,v]');
    expect(typeInfo.abstract).toBe(false);
    // expect(typeInfo.passThroughs.length).toBe(1);
    // arrayEquals(typeInfo.passThroughs[0], [1, 2, 4, 5]);
  });
  test('getAbstractFunctionchartTypeInfo', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = context.root,
          input = addPseudoelement(functionchart, 'input'),
          output = addPseudoelement(functionchart, 'output');
    let typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.typeString).toBe('[v,v]');
    expect(typeInfo.abstract).toBe(true);
    // expect(typeInfo.passThroughs.length).toBe(0);
    const wire1 = addWire(functionchart, input, 0, output, 0);
    typeInfo = context.getFunctionchartTypeInfo(functionchart);
    expect(typeInfo.typeString).toBe('[v,v]');
    expect(typeInfo.abstract).toBe(false);
    // expect(typeInfo.passThroughs.length).toBe(1);
    // arrayEquals(typeInfo.passThroughs[0], [0, 1]);
  });
  const recursiveFuncionchart = {
    "type": "functionchart",
    "id": 2,
    "nonWires": [
      {
        "type": "functionchart",
        "id": 3,
        "nonWires": [
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
            "functionchart": 3
          },
          {
            "type": "instance",
            "id": 11,
            "functionchart": 3
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
          functionchart = DataModels.Deserialize(recursiveFuncionchart, context) as FC.Functionchart;
    context.root = functionchart;
    expect(functionchart.nonWires.length).toBe(1);
    const fc = functionchart.nonWires.at(0) as FC.Functionchart;
    expect(fc).toBeInstanceOf(FC.Functionchart);
    expect(fc.nonWires.length).toBe(8);
    const rfi1 = fc.nonWires.at(6) as FC.FunctionInstance,
          rfi2 = fc.nonWires.at(7) as FC.FunctionInstance;
    expect(rfi1).toBeInstanceOf(FC.FunctionInstance);
    expect(rfi2).toBeInstanceOf(FC.FunctionInstance);
    expect(fc.wires.length).toBe(6);
  });

  const canAddFunctionchart = {
    "type": "functionchart",
    "id": 0,
    "width": 853.3439201116562,
    "height": 479.58752822875977,
    "nonWires": [
      {
        "type": "functionchart",
        "id": 15,
        "x": 257.8312476873398,
        "y": 207.09062957763672,
        "width": 308.9689712524414,
        "height": 256.49689865112305,
        "nonWires": [
          {
            "type": "functionchart",
            "id": 12,
            "x": 49.49687576293945,
            "y": 11.693740844726562,
            "width": 234.31880569458008,
            "height": 228.80315780639648,
            "nonWires": [
              {
                "type": "functionchart",
                "id": 6,
                "x": 24.824970245361328,
                "y": 29.593730926513672,
                "width": 143.38131713867188,
                "height": 71.89064025878906,
                "nonWires": [
                  {
                    "type": "element",
                    "id": 2,
                    "x": 56,
                    "y": 11.1031494140625,
                    "name": "binop",
                    "typeString": "[vv,v](+)"
                  },
                  {
                    "type": "output",
                    "id": 5,
                    "x": 109.58438110351562,
                    "y": 13.128143310546875,
                    "typeString": "[v,]"
                  },
                  {
                    "type": "input",
                    "id": 4,
                    "x": 8,
                    "y": 37.1031494140625,
                    "typeString": "[,v]"
                  },
                  {
                    "type": "input",
                    "id": 3,
                    "x": 8.365631103515625,
                    "y": 8,
                    "typeString": "[,v]"
                  }
                ],
                "wires": [
                  {
                    "type": "wire",
                    "src": 2,
                    "srcPin": 0,
                    "dst": 5,
                    "dstPin": 0
                  },
                  {
                    "type": "wire",
                    "src": 4,
                    "srcPin": 0,
                    "dst": 2,
                    "dstPin": 1
                  },
                  {
                    "type": "wire",
                    "src": 3,
                    "srcPin": 0,
                    "dst": 2,
                    "dstPin": 0
                  }
                ]
              },
              {
                "type": "functionchart",
                "id": 7,
                "x": 44.60011672973633,
                "y": 120.80938339233398,
                "width": 143.20623779296875,
                "height": 91.9937744140625,
                "nonWires": [
                  {
                    "type": "element",
                    "id": 8,
                    "x": 56,
                    "y": 11.1031494140625,
                    "name": "binop",
                    "typeString": "[vv,v](+)"
                  },
                  {
                    "type": "output",
                    "id": 9,
                    "x": 111.20623779296875,
                    "y": 15.55938720703125,
                    "typeString": "[v,]"
                  },
                  {
                    "type": "input",
                    "id": 10,
                    "x": 8,
                    "y": 37.1031494140625,
                    "typeString": "[,v]"
                  }
                ],
                "wires": [
                  {
                    "type": "wire",
                    "src": 8,
                    "srcPin": 0,
                    "dst": 9,
                    "dstPin": 0
                  },
                  {
                    "type": "wire",
                    "src": 10,
                    "srcPin": 0,
                    "dst": 8,
                    "dstPin": 1
                  }
                ]
              },
              {
                "type": "input",
                "id": 11,
                "x": 16.878253936767578,
                "y": 130.32810592651367,
                "typeString": "[,v]"
              }
            ],
            "wires": [
              {
                "type": "wire",
                "src": 11,
                "srcPin": 0,
                "dst": 8,
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
  test('canAddItem', () => {
    const context = new FC.FunctionchartContext(),
          functionchart = DataModels.Deserialize(canAddFunctionchart, context) as FC.Functionchart;
    context.root = functionchart;
    const greatGrandparent = functionchart.nonWires.at(0) as FC.Functionchart,
          grandParent = greatGrandparent.nonWires.at(0) as FC.Functionchart,
          fc1 = grandParent!.nonWires.at(0) as FC.Functionchart,
          fc2 = grandParent!.nonWires.at(1) as FC.Functionchart;
    expect(greatGrandparent).toBeInstanceOf(FC.Functionchart);
    expect(grandParent).toBeInstanceOf(FC.Functionchart);
    expect(fc1).toBeInstanceOf(FC.Functionchart);
    expect(fc2).toBeInstanceOf(FC.Functionchart);

    const inst1 = addFunctionInstance(fc1, fc1);  // closed, recursive instantiation.
    expect(context.isValidFunctionInstance(inst1)).toBe(true);
    const inst2 = addFunctionInstance(grandParent, fc1);  // closed, scope outside definition.
    expect(context.isValidFunctionInstance(inst2)).toBe(true);
    const inst3 = addFunctionInstance(greatGrandparent, fc1);  // closed, next scope out.
    expect(context.isValidFunctionInstance(inst3)).toBe(true);
    const inst4 = addFunctionInstance(functionchart, fc1);  // closed, outermost scope.
    expect(context.isValidFunctionInstance(inst4)).toBe(true);

    const inst5 = addFunctionInstance(fc2, fc2);  // open, recursive instantiation.
    expect(context.isValidFunctionInstance(inst5)).toBe(true);
    const inst6 = addFunctionInstance(grandParent, fc2);  // open, scope outside definition.
    expect(context.isValidFunctionInstance(inst6)).toBe(true);
    const inst7 = addFunctionInstance(greatGrandparent, fc2);  // open, next scope out, invalid.
    expect(context.isValidFunctionInstance(inst7)).toBe(false);
    const inst8 = addFunctionInstance(functionchart, fc2);  // open, outermost scope, invalid.
    expect(context.isValidFunctionInstance(inst8)).toBe(false);
    const inst9 = addFunctionInstance(fc1, fc2);  // open, sibling scope, valid.
    expect(context.isValidFunctionInstance(inst9)).toBe(true);
  });
});
