import { Element, Pseudoelement, ModifierElement, FunctionInstance, Functionchart } from './functioncharts.js';
export class ConsoleEmitter {
    constructor() {
        this.lines = [];
        this.indent = 0;
    }
    // private code: string = '';
    emit(code) {
        const line = ' '.repeat(this.indent * 2) + code + '\n';
        this.lines.push(line);
        // console.log(line);
    }
    indentIn() {
        this.indent++;
    }
    indentOut() {
        if (this.indent > 0)
            this.indent--;
    }
    flush() {
        console.log(this.lines.join(''));
        this.lines = [];
    }
}
export function codegen(functionchart) {
    const map = new Map(), emitter = new ConsoleEmitter(), scopes = [];
    function parameterName(element, pin) {
        let name = 'p_' + element.id.toString() + '_' + pin.toString();
        if (element instanceof Pseudoelement) {
            return name;
        }
        // importer or abstract input.
        return name;
    }
    function getRef(node, pin) {
        let ref = map.get(node.id);
        if (ref === undefined) {
            ref = codegenNode(node);
        }
        return ref[pin];
    }
    function getOperand(node, pin) {
        let result = 'undefined';
        const wire = node.inWires[pin];
        if (wire) {
            result = getRef(wire.src, wire.srcPin);
        }
        else {
            const parent = node.parent;
            if (parent instanceof ModifierElement || parent.implicit) {
                result = parameterName(node, pin);
            }
        }
        return result;
    }
    function getResult(node, pin) {
        if (node instanceof Pseudoelement) {
            return getOperand(node, pin);
        }
        let ref = map.get(node.id);
        if (ref === undefined) {
            ref = codegenNode(node);
        }
        return ref[pin];
    }
    function codegenLiteral(literal) {
        const name = 'v_' + literal.id;
        let ref = literal.type.outputs[0].name || 'undefined';
        // undefined, numeric or string literal?
        if (isNaN(parseInt(ref))) {
            ref = `'${ref}'`; // string literal  TODO 'true', 'false', etc.
        }
        const code = `const ${name} = ${ref};`, refs = [ref];
        emitter.emit(code);
        map.set(literal.id, refs);
        return refs;
    }
    function codegenPseudoelement(pseudoelement, map, scopes) {
        const name = 'p_' + pseudoelement.id + '_0'; // TODO better names.
        switch (pseudoelement.template.typeName) {
            case 'input': {
                const refs = [name];
                map.set(pseudoelement.id, refs);
                return refs;
            }
        }
        return [];
    }
    function codegenUnop(op) {
        const name = 'v_' + op.id, input = getOperand(op, 0);
        const code = `const ${name} = ${op.type.name}(${input});`, refs = [name];
        emitter.emit(code);
        map.set(op.id, refs);
        return refs;
    }
    function codegenBinop(op) {
        const name = 'v_' + op.id, input1 = getOperand(op, 0), input2 = getOperand(op, 1);
        const code = `const ${name} = ${input1} ${op.type.name} ${input2};`, refs = [name];
        emitter.emit(code);
        map.set(op.id, refs);
        return refs;
    }
    function codegenCond(op) {
        const name = 'v_' + op.id, cInput = getOperand(op, 0);
        emitter.emit(`let ${name};`);
        emitter.emit(`if (${cInput}) {`);
        emitter.indentIn();
        const input1 = getOperand(op, 1);
        emitter.emit(`${name} = ${input1};`);
        emitter.indentOut();
        emitter.emit(`} else {`);
        emitter.indentIn();
        const input2 = getOperand(op, 2);
        emitter.emit(`${name} = ${input2};`);
        emitter.indentOut();
        emitter.emit(`};`);
        const refs = [name];
        map.set(op.id, refs);
        return refs;
    }
    function elementToTypeInfo(element) {
        const type = element.type;
        const inputs = type.inputs.map((pin, i) => {
            return { element, index: i, type: pin.type, name: undefined, fcIndex: -1 };
        });
        const outputs = type.outputs.map((pin, i) => {
            return { element, index: i, type: pin.type, name: undefined, fcIndex: -1 };
        });
        return {
            instanceType: type,
            closed: true,
            abstract: false,
            sideEffects: false,
            inputs: inputs,
            outputs: outputs,
        };
    }
    function codegenExporter(exporter) {
        const typeInfo = elementToTypeInfo(exporter.innerElement);
        const inner = exporter.innerElement, inputs = [], outputs = [];
        const TypeInfo = {};
        return [];
    }
    function codegenModifier(modifier) {
        if (modifier.innerElement) {
            let name = 'p_' + modifier.id;
            if (modifier.isImporter) {
                name += '_0';
                const refs = [name];
                map.set(modifier.id, refs);
                return refs;
            }
            else if (modifier.isExporter) {
                const typeInfo = elementToTypeInfo(modifier.innerElement);
                return codegenFunction(name, typeInfo);
            }
        }
        return ['undefined']; // TODO
    }
    function functionName(src, pin) {
        if (src instanceof Functionchart) {
            return 'fn_' + src.id.toString();
        }
        // importer or abstract element.
        return 'p_' + src.id.toString() + '_' + pin.toString();
    }
    function codegenFunctionInstance(instance) {
        const src = instance.src, srcPin = instance.srcPin, type = instance.type, inputs = type.inputs, outputs = type.outputs, parameters = [], refs = [];
        for (let i = 0; i < inputs.length; i++) {
            const input = getOperand(instance, i);
            parameters.push(input);
        }
        for (let i = 0; i < outputs.length; i++) {
            refs.push('r_' + instance.id.toString() + '_' + i.toString());
        }
        const fn = functionName(src, srcPin);
        if (refs.length === 1) {
            emitter.emit(`let ${refs[0]} = ${fn}(${parameters.join(', ')});`);
        }
        else if (refs.length > 1) {
            emitter.emit(`let [${refs.join(', ')}] = ${fn}(${parameters.join(', ')});`);
        }
        map.set(instance.id, refs);
        return refs;
    }
    function codegenFunctionchart(functionchart) {
        scopes.push(functionchart);
        const name = functionName(functionchart, 0);
        // First generate any sub-functions.
        functionchart.nodes.forEach(node => {
            if (node instanceof Functionchart && !node.isAbstract) {
                codegenFunctionchart(node);
            }
        });
        const result = codegenFunction(name, functionchart.typeInfo);
        scopes.pop();
        return result;
    }
    function codegenFunction(name, typeInfo) {
        const inputs = typeInfo.inputs, outputs = typeInfo.outputs, fnInputs = [], fnOutputs = [];
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i], name = parameterName(input.element, input.index);
            // map.set(input.element.id, [name]);
            fnInputs.push(name + ': any');
        }
        if (fnInputs.length > 0) {
            let code;
            if (fnInputs.length === 1) {
                code = `function ${name}(${fnInputs[0]}): any {`;
            }
            else {
                code = `function ${name}(${fnInputs.join(', ')}): any {`;
            }
            emitter.emit(code);
            emitter.indentIn();
        }
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i], ref = getResult(output.element, output.index);
            fnOutputs.push(ref);
        }
        if (fnOutputs.length > 0) {
            let code;
            if (fnOutputs.length === 1) {
                code = `return ${fnOutputs[0]};`;
            }
            else {
                code = `return [${fnOutputs.join(', ')}];`;
            }
            emitter.emit(code);
            emitter.indentOut();
            emitter.emit('}');
        }
        const refs = [name];
        map.set(functionchart.id, refs);
        return refs;
    }
    function codegenNode(node) {
        if (node instanceof Pseudoelement) {
            return codegenPseudoelement(node, map, scopes);
        }
        else if (node instanceof FunctionInstance) {
            return codegenFunctionInstance(node);
        }
        else if (node instanceof Element) {
            if (node instanceof ModifierElement) {
                return codegenModifier(node);
            }
            else {
                switch (node.name) {
                    case 'literal': return codegenLiteral(node);
                    case 'unop': return codegenUnop(node);
                    case 'binop': return codegenBinop(node);
                    case 'cond': return codegenCond(node);
                }
            }
        }
        else if (node instanceof Functionchart) {
            return codegenFunctionchart(node);
        }
        return [];
    }
    codegenFunctionchart(functionchart);
    emitter.flush();
}
//# sourceMappingURL=execution.js.map