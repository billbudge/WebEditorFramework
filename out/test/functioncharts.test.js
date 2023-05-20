import { describe, expect, test } from '@jest/globals';
import * as FC from '../examples/functioncharts/functioncharts.js';
function stringifyType(type) {
    let s = '[';
    function stringifyName(item) {
        if (item.name)
            s += '(' + item.name + ')';
    }
    function stringifyPin(pin) {
        s += pin.type ? stringifyType(pin.type) : pin.typeString;
        stringifyName(pin);
    }
    if (type.inputs)
        type.inputs.forEach(input => stringifyPin(input));
    s += ',';
    if (type.outputs)
        type.outputs.forEach(output => stringifyPin(output));
    s += ']';
    stringifyName(type);
    return s;
}
function addElement(functionchart) {
    const element = functionchart.context.newElement('binop');
    functionchart.nonWires.append(element);
    return element;
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
describe('Typeparser', () => {
    test('add', () => {
        const parser = new FC.TypeParser();
        const types = [
            '[vv,v](+)',
            '[v(a)v(b),v(c)]',
            '[,[,v][v,v]](@)',
            '[[v,vv(q)](a)v(b),v(c)](foo)',
        ];
        types.forEach(type => expect(stringifyType(parser.add(type))).toBe(type));
        types.forEach(type => expect(parser.has(type)).toBe(true));
        // Make sure subtypes are present.
        expect(parser.has('[,v]')).toBe(true);
        expect(parser.has('[v,v]')).toBe(true);
        ;
        expect(parser.has('[v,vv(q)]')).toBe(true);
        ;
    });
});
describe('FunctionchartContext', () => {
    test('element interface', () => {
        const context = new FC.FunctionchartContext(), element = context.newElement('binop');
        expect(element instanceof FC.Element).toBe(true);
        expect(element.name).toBeUndefined();
        element.name = 'Test Element';
        expect(element.name).toBe('Test Element');
        element.name = undefined;
        expect(element.name).toBeUndefined();
        expect(element.id).toBe(2);
        expect(element.x).toBe(0);
        element.x = 10;
        expect(element.x).toBe(10);
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
    test('wire interface', () => {
        const context = new FC.FunctionchartContext(), elem1 = context.newElement('binop'), elem2 = context.newElement('binop'), wire = context.newWire(elem1, 0, elem2, 0);
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
        expect(functionchart.name).toBe('');
        functionchart.name = 'Test Functionchart';
        expect(functionchart.name).toBe('Test Functionchart');
        expect(functionchart.x).toBe(0);
        functionchart.x = 10;
        expect(functionchart.x).toBe(10);
    });
    test('isValidWire', () => {
        const context = new FC.FunctionchartContext(), wire = context.newWire(undefined, 0, undefined, 0), functionchart = context.newFunctionchart(), elem1 = addElement(functionchart), elem2 = addElement(functionchart);
        expect(context.isValidWire(wire)).toBe(false);
        wire.src = elem1;
        expect(context.isValidWire(wire)).toBe(false);
        wire.dst = elem1;
        expect(context.isValidWire(wire)).toBe(false);
        wire.dst = elem2;
        expect(context.isValidWire(wire)).toBe(true);
    });
    test('isValidFunctionchart', () => {
        const context = new FC.FunctionchartContext(), functionchart = context.root(), // TODO use getter/setter for property.
        elem1 = addElement(functionchart), elem2 = addElement(functionchart);
        expect(context.isValidFunctionchart(functionchart)).toBe(true);
        expect(context.isValidFunctionchart(functionchart)).toBe(true);
        const wire = addWire(functionchart, elem1, 0, elem2, 0);
        expect(context.isValidFunctionchart(functionchart)).toBe(true);
        const cycleWire = addWire(functionchart, elem2, 0, elem1, 0);
        expect(context.isValidFunctionchart(functionchart)).toBe(false);
        functionchart.wires.remove(cycleWire);
        expect(context.isValidFunctionchart(functionchart)).toBe(true);
    });
});
//# sourceMappingURL=functioncharts.test.js.map