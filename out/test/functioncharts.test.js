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
    const element = functionchart.context.newElement();
    functionchart.nonWires.append(element);
    return element;
}
function addWire(functionchart, elem1, elem2) {
    const wire = functionchart.context.newWire(elem1, 0, elem2, 0);
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
//# sourceMappingURL=functioncharts.test.js.map