import { describe, expect, test } from '@jest/globals';
import * as FC from '../examples/functioncharts/functioncharts.js';
function addElement(functionchart, type) {
    const element = functionchart.context.newElement(type);
    functionchart.nonWires.append(element);
    return element;
}
function addPseudoelement(functionchart, type) {
    const pseudo = functionchart.context.newPseudoelement(type);
    functionchart.nonWires.append(pseudo);
    return pseudo;
}
function addWire(functionchart, elem1, outPin, elem2, inPin) {
    const wire = functionchart.context.newWire(elem1, outPin, elem2, inPin);
    functionchart.wires.append(wire);
    return wire;
}
function addFunctionchart(parent) {
    const functionchart = parent.context.newFunctionchart();
    functionchart.nonWires.append(functionchart);
    return functionchart;
}
// function setEquals(set1: Set<any>, set2: Array<any>) {
//   expect(set1.size).toBe(set2.length);
//   for (const item of set2) {
//     expect(set1.has(item)).toBe(true);
//   }
// }
//------------------------------------------------------------------------------
describe('Type', () => {
    test('canConnect', () => {
        const parser = new FC.TypeParser(), starType = parser.add('*'), valueType = parser.add('v');
        expect(starType.canConnectTo(valueType)).toBe(true);
        expect(valueType.canConnectTo(starType)).toBe(true);
        expect(starType.canConnectTo(starType)).toBe(true);
        expect(valueType.canConnectTo(valueType)).toBe(true);
        const type1 = parser.add('[v,v]'), type2 = parser.add('[vv,v]');
        expect(type1.canConnectTo(valueType)).toBe(false);
        expect(type1.canConnectTo(starType)).toBe(true);
        expect(type1.canConnectTo(type2)).toBe(false);
        expect(type2.canConnectTo(type1)).toBe(true);
        // TODO more tests.
    });
});
describe('Typeparser', () => {
    test('add', () => {
        const parser = new FC.TypeParser();
        const typeStrings = [
            'v',
            '*',
            '[vv,v](+)',
            '[v(a)v(b),v(c)]',
            '[,[,v][v,v]](@)',
            '[[v,vv(q)](a)v(b),v(c)](foo)',
        ];
        typeStrings.forEach(typeString => expect(FC.stringifyType(parser.add(typeString))).toBe(typeString));
        typeStrings.forEach(typeString => expect(parser.has(typeString)).toBe(true));
        expect(parser.add('[v,v]').name).toBeUndefined();
        expect(parser.add('[vv,v](+)').name).toBe('+');
        const type1 = parser.add('[v(a)v(b),v(c)]');
        expect(type1.name).toBeUndefined();
        expect(type1.inputs[0].name).toBe('a');
        expect(type1.inputs[1].name).toBe('b');
        expect(type1.outputs[0].name).toBe('c');
        const type2 = parser.add('[,[,v][v,v]](@)');
        expect(type2.name).toBe('@');
        expect(type2.inputs.length).toBe(0);
        expect(type2.outputs.length).toBe(2);
        expect(type2.outputs[0].typeString).toBe('[,v]');
        expect(type2.outputs[1].typeString).toBe('[v,v]');
        // Make sure subtypes are present.
        const subTypeStrings = ['[v,v]', '[,v]', '[v,vv(q)]'];
        subTypeStrings.forEach(typeString => expect(parser.has(typeString)).toBe(true));
    });
    test('addLabel', () => {
        const parser = new FC.TypeParser();
        expect(parser.addLabel('[vv,v]', '+')).toBe('[vv,v](+)');
        expect(parser.addLabel('[vv,v](+)', '-')).toBe('[vv,v](-)');
        expect(parser.addLabel('[v(a)v(b),v(c)]', 'foo')).toBe('[v(a)v(b),v(c)](foo)');
    });
    test('addInputLabel', () => {
        const parser = new FC.TypeParser();
        expect(parser.addInputLabel('[v,v]', 'a')).toBe('[v(a),v]');
        expect(parser.addInputLabel('[v(a),v]', 'b')).toBe('[v(b),v]');
        expect(parser.addInputLabel('[v(a),v]', undefined)).toBe('[v,v]');
    });
    test('addOutputLabel', () => {
        const parser = new FC.TypeParser();
        expect(parser.addOutputLabel('[v,v]', 'a')).toBe('[v,v(a)]');
        expect(parser.addOutputLabel('[v,v(a)]', 'b')).toBe('[v,v(b)]');
        expect(parser.addOutputLabel('[v,v(a)]', undefined)).toBe('[v,v]');
    });
});
describe('FunctionchartContext', () => {
    test('element interface', () => {
        const context = new FC.FunctionchartContext(), element = context.newElement('binop');
        expect(element instanceof FC.Element).toBe(true);
        expect(element.id).toBe(2);
        expect(element.x).toBe(0);
        element.x = 10;
        expect(element.x).toBe(10);
    });
    test('element typeString', () => {
        const context = new FC.FunctionchartContext(), element = context.newElement('element');
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
        expect(element.outWires[0].length).toBe(0); // Empty wire array.
    });
    test('cond element', () => {
        const context = new FC.FunctionchartContext(), element = context.newElement('cond');
        expect(element.typeString).toBe('[v**,*](?)');
        expect(element.type.inputs.length).toBe(3);
        expect(element.type.outputs.length).toBe(1);
    });
    test('pseudoelement interface', () => {
        const context = new FC.FunctionchartContext(), pseudostate = context.newPseudoelement('input');
        expect(pseudostate instanceof FC.Pseudoelement).toBe(true);
        expect(pseudostate.id).toBe(2);
        expect(pseudostate.template.typeName).toBe('input');
        expect(pseudostate.x).toBe(0);
        pseudostate.x = 10;
        expect(pseudostate.x).toBe(10);
    });
    test('pseudoelement typeString', () => {
        const context = new FC.FunctionchartContext(), pseudoelement = context.newPseudoelement('input');
        expect(pseudoelement.typeString).toBe('[,*]');
        expect(pseudoelement.type.inputs.length).toBe(0);
        expect(pseudoelement.type.outputs.length).toBe(1);
        expect(pseudoelement.inWires.length).toBe(0);
        expect(pseudoelement.outWires.length).toBe(1);
        expect(pseudoelement.outWires[0].length).toBe(0); // Empty wire array.
        pseudoelement.typeString = '[,v(foo)]';
        expect(pseudoelement.typeString).toBe('[,v(foo)]');
        expect(pseudoelement.type.inputs.length).toBe(0);
        expect(pseudoelement.type.outputs.length).toBe(1);
        expect(pseudoelement.inWires.length).toBe(0);
        expect(pseudoelement.outWires.length).toBe(1);
        expect(pseudoelement.outWires[0].length).toBe(0); // Empty wire array.
    });
    test('wire interface', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.root, elem1 = addElement(functionchart, 'binop'), elem2 = addElement(functionchart, 'binop'), wire = addWire(functionchart, elem1, 0, elem2, 0);
        expect(wire instanceof FC.Wire).toBe(true);
        expect(wire.src).toBe(elem1);
        expect(wire.src).toBe(elem1); // twice to exercise reference caching.
        expect(wire.dst).toBe(elem2);
        wire.dst = elem1;
        expect(wire.dst).toBe(elem1);
        wire.dst = undefined;
        expect(wire.dst).toBeUndefined();
    });
    test('functionchart interface', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.newFunctionchart();
        expect(functionchart instanceof FC.Functionchart).toBe(true);
        expect(functionchart.x).toBe(0);
        functionchart.x = 10;
        expect(functionchart.x).toBe(10);
    });
    test('iterators', () => {
        function testIterator(fn, elem, items) {
            const iterated = new Array();
            fn(elem, t => iterated.push(t));
            expect(items.length).toBe(iterated.length);
            for (const item of items) {
                expect(iterated).toContain(item);
            }
        }
        const context = new FC.FunctionchartContext(), functionchart = context.newFunctionchart(), elem1 = addElement(functionchart, 'binop'), elem2 = addElement(functionchart, 'binop'), wire1 = addWire(functionchart, elem1, 0, elem2, 0), input = addPseudoelement(functionchart, 'input'), output1 = addPseudoelement(functionchart, 'output'), output2 = addPseudoelement(functionchart, 'output'), wire2 = addWire(functionchart, input, 0, elem1, 1), wire3 = addWire(functionchart, input, 0, elem2, 1), wire4 = addWire(functionchart, elem2, 0, output1, 0), wire5 = addWire(functionchart, elem2, 0, output2, 0);
        context.root = functionchart;
        const inputFn = context.forInWires.bind(context), outputFn = context.forOutWires.bind(context);
        testIterator(inputFn, input, []);
        testIterator(outputFn, input, [wire2, wire3]);
        testIterator(inputFn, elem1, [wire2]);
        testIterator(outputFn, elem1, [wire1]);
        testIterator(inputFn, elem2, [wire1, wire3]);
        testIterator(outputFn, elem2, [wire4, wire5]);
    });
    test('isValidWire', () => {
        const context = new FC.FunctionchartContext(), wire = context.newWire(undefined, 0, undefined, 0), functionchart = context.newFunctionchart(), elem1 = addElement(functionchart, 'element'), elem2 = addElement(functionchart, 'element'), input = addPseudoelement(functionchart, 'input'), output = addPseudoelement(functionchart, 'output');
        elem1.typeString = '[v,v]';
        elem2.typeString = '[v[v,v],v[v,v]]';
        expect(context.isValidWire(wire)).toBe(false); // src, dst undefined
        wire.src = elem1;
        wire.srcPin = 0;
        expect(context.isValidWire(wire)).toBe(false); // dst undefined
        wire.dst = elem1;
        wire.dstPin = 0;
        expect(context.isValidWire(wire)).toBe(false); // src, dst same
        wire.dst = elem2;
        wire.dstPin = 0;
        expect(context.isValidWire(wire)).toBe(true); // src, dst valid, types match
        wire.srcPin = -1;
        expect(context.isValidWire(wire)).toBe(false); // srcPin out of range
        wire.srcPin = 2;
        expect(context.isValidWire(wire)).toBe(false); // srcPin out of range
        wire.srcPin = 0;
        wire.dstPin = -1;
        expect(context.isValidWire(wire)).toBe(false); // dstPin out of range
        wire.dstPin = 2;
        expect(context.isValidWire(wire)).toBe(false); // dstPin out of range
        wire.dstPin = 1;
        expect(context.isValidWire(wire)).toBe(false); // type mismatch
        wire.src = input;
        wire.srcPin = 0;
        expect(context.isValidWire(wire)).toBe(true); // wildcard match
        wire.src = elem2;
        wire.dst = output;
        wire.dstPin = 0;
        expect(context.isValidWire(wire)).toBe(true); // wildcard match
    });
    test('isValidFunctionchart', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.root, elem1 = addElement(functionchart, 'binop'), elem2 = addElement(functionchart, 'binop');
        expect(context.isValidFunctionchart()).toBe(true);
        expect(context.isValidFunctionchart()).toBe(true);
        const wire = addWire(functionchart, elem1, 0, elem2, 0);
        expect(context.isValidFunctionchart()).toBe(true);
        const cycleWire = addWire(functionchart, elem2, 0, elem1, 0);
        expect(context.isValidFunctionchart()).toBe(false);
        functionchart.wires.remove(cycleWire);
        expect(context.isValidFunctionchart()).toBe(true);
    });
    test('resolveOutputType', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.root, elem = addElement(functionchart, 'binop'), input = addPseudoelement(functionchart, 'input');
        let result = context.resolveOutputType(input, 0);
        expect(result).toBeUndefined();
        const wire = addWire(functionchart, input, 0, elem, 0);
        result = context.resolveOutputType(input, 0);
        expect(result).toBeDefined();
        expect(result.typeString).toBe('v');
        const elem2 = addElement(functionchart, 'element');
        elem2.typeString = '[[vv,v],v]';
        wire.dst = elem2;
        result = context.resolveOutputType(input, 0);
        expect(result).toBeDefined();
        expect(result.typeString).toBe('[vv,v]');
    });
    test('resolveInputType', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.root, elem = addElement(functionchart, 'binop'), output = addPseudoelement(functionchart, 'output');
        let result = context.resolveInputType(output, 0);
        expect(result).toBeUndefined();
        const wire = addWire(functionchart, elem, 0, output, 0);
        result = context.resolveInputType(output, 0);
        expect(result).toBeDefined();
        expect(result.typeString).toBe('v');
        const elem2 = addElement(functionchart, 'element');
        elem2.typeString = '[v,[vv,v]]';
        wire.src = elem2;
        result = context.resolveInputType(output, 0);
        expect(result).toBeDefined();
        expect(result.typeString).toBe('[vv,v]');
    });
});
//# sourceMappingURL=functioncharts.test.js.map