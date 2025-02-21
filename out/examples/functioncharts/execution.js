// import * as fc from '../../out/examples/functioncharts/functioncharts.js';
// //------------------------------------------------------------------------------
// export type Value = number | boolean | string | Array<Value> | undefined;
// export type Scope = {
//   fc: fc.Functionchart,
//   inputs: Array<Value>,
//   outputs: Array<Value | boolean>,
// }
// type CodeGen = {
//   code: string;
//   ref: string;
// }
// const undefinedCode: CodeGen = { code: '', ref: 'undefined' };
// export type CodeGenMap = Map<number, CodeGen[]>;
// export function codegenLiteral(literal: fc.Element, map: CodeGenMap, scope: Scope) {
//   const name = 'v' + literal.id;
//   let ref = literal.type.outputs[0].name;
//   const asNumber = parseInt(ref);
//   if (isNaN(asNumber)) {
//     ref = `'${ref}'`;  // string literal
//   } else {
//     ref = asNumber;      // number literal
//   }
//   const code = `const ${name} = ${ref};`;
//   console.log(code);
//   map.set(literal.id, [{ code, ref: ref }]);
// }
// export function getRef(element: fc.Element, pin: number, map: CodeGenMap, scope: Scope) : CodeGen {
//   let code = map.get(element.id);
//   if (!code) {
//     codegenElement(element, map, scope);
//     code = map.get(element.id);
//   }
//   return code![pin];
// }
// export function codegenUnop(op: fc.Element, map: CodeGenMap, scope: Scope) {
//   const name = 'v' + op.id,
//         wire = op.inWires[0];
//   let input = undefinedCode;
//   if (wire) {
//     input = getRef(wire.src, wire.srcPin, map, scope);
//   }
//   const code = `const ${name} = ${op.type.name}(${input.ref});`;
//   console.log(code);
//   map.set(op.id, [{ code, ref: name }]);
// }
// export function codegenBinop(op: fc.Element, map: CodeGenMap, scope: Scope) {
//   const name = 'v' + op.id,
//         wire1 = op.inWires[0],
//         wire2 = op.inWires[1];
//   let input1 = undefinedCode;
//   if (wire1) {
//     input1 = getRef(wire1.src, wire1.srcPin, map, scope);
//   }
//   let input2 = undefinedCode;
//   if (wire2) {
//     input2 = getRef(wire1.src, wire1.srcPin, map, scope);
//   }
//   const code = `const ${name} = ${input1.ref} ${op.type.name} ${input2.ref};`;
//   console.log(code);
//   map.set(op.id, [{ code, ref: name }]);
// }
// export function codegenElement(element: fc.Element, map: CodeGenMap, scope: Scope) {
//   switch (element.template.typeName) {
//     case 'unop': return codegenUnop(element, map, scope);
//     case 'binop': return codegenBinop(element, map, scope);
//     // case 'input': return codegenInput(element, scope);
//     // case 'output': return codegenOutput(element, scope);
//     case 'literal': return codegenLiteral(element, map, scope);
//   }
// }
// export function codegenFunctionchart(fc: fc.Functionchart) {
//   const inputs = fc.typeInfo.inputs,
//         outputs = fc.typeInfo.outputs;
//   const map = new Map<number, CodeGen[]>();
//   for (let i = 0; i < outputs.length; i++) {
//     const output = outputs[i],
//           wire = output.element.inWires[0];
//     const code = getRef(output, 0, map, { fc, inputs: [], outputs: [] });
//     codegenLiteral(inputs[i], map, { fc, inputs: [], outputs: [] });
//   }
//   // for (const element of fc.elements) {
//   //   codegenElement(element, map, scope);
//   // }
// }
// function evaluateElement(fc: fc.Functionchart, scopes: Array<Scope>) {
//   const scope = scopes[scopes.length - 1],
//         inputs = scope.inputs,
//         outputs = scope.outputs;
//   for (let i = 0; i < outputs.length; i++) {
//     if (outputs[i] === true) {
//       const element = fc.typeInfo.outputs[i];
//       outputs[i] = evaluateElement(element, scopes);
//     }
//   }
// }
// function toOutput(output: Output) : Output {
//   let result = output;
//   if (output.element instanceof fc.Pseudoelement) {
//     const pseudo = output.element;
//     switch (pseudo.template.typeName) {
//       case 'input':
//         break;
//     }
//   }
//   return result;
// }
// function interpret(fc: fc.Functionchart, fn_inputs: Array<Value>, fn_outputs: Array<boolean>) : Array<Value> {
//   const typeInfo = fc.typeInfo,
//         inputs = typeInfo.inputs,
//         outputs = typeInfo.outputs;
//   for (let i = 0; i < fn_outputs.length; i++) {
//     if (!fn_outputs[i]) continue;
//     const element = outputs[i];
//   return [];
// }
//# sourceMappingURL=execution.js.map