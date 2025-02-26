import { NodeTypes, Element, Pseudoelement, ModifierElement, FunctionInstance, Functionchart,
         InstancerTypes
} from './functioncharts.js'

export interface Emitter {
  emit(code: string): void;
  indentIn(): void;
  indentOut(): void;
}

export class ConsoleEmitter implements Emitter {
  private indent: number = 0;
  // private code: string = '';
  emit(code: string) {
    const line = ' '.repeat(this.indent * 2) + code + '\n';
    console.log(line);
  }
  indentIn() {
    this.indent++;
  }
  indentOut() {
    this.indent--;
  }
}

export type RefMap = Map<number, string[]>;

export function codegen(functionchart: Functionchart) {
  const map = new Map<number, string[]>(),
        emitter = new ConsoleEmitter(),
        scopes = [functionchart];
        function parameterName(element: NodeTypes, pin: number) : string {
          let name = 'p_' + element.id.toString();
          if (element instanceof Pseudoelement) {
            return name;
          }
          // importer or abstract input.
          return name;
        }

        function getRef(node: NodeTypes, pin: number) : string {
          let ref = map.get(node.id);
          if (ref === undefined) {
            ref = codegenNode(node);
          }
          return ref[pin];
        }

        function getOperand(node: NodeTypes, pin: number) : string {
          let result = 'undefined';
          const wire = node.inWires[pin];
          if (wire) {
            result = getRef(wire.src!, wire.srcPin);
          } else {
            const functionchart = node.parent as Functionchart;
            if (functionchart.implicit) {
              result = parameterName(node as Element, pin);
            }
          }
          return result;
        }

        function getResult(node: NodeTypes, pin: number) : string {
          if (node instanceof Pseudoelement) {
            return getOperand(node, pin);
          }
          let ref = map.get(node.id);
          if (ref === undefined) {
            ref = codegenNode(node);
          }
          return ref[pin];
        }

        function codegenLiteral(literal: Element) : string[] {
          const name = 'p_' + literal.id;
          let ref = literal.type.outputs[0].name || 'undefined';
          // undefined, numeric or string literal?
          if (isNaN(parseInt(ref))) {
            ref = `'${ref}'`;  // string literal  TODO 'true', 'false', etc.
          }
          const code = `const ${name} = ${ref};`,
                refs = [ref];
          emitter.emit(code);
          map.set(literal.id, refs);
          return refs;
        }

        function codegenPseudoelement(pseudoelement: Pseudoelement, map: RefMap, scopes: Functionchart[]) : string[] {
          const name = 'p_' + pseudoelement.id;
          switch (pseudoelement.template.typeName) {
            case 'input': {
              const refs = [name];
              map.set(pseudoelement.id, refs);
              return refs;
            }
          }
          return [];
        }

        function codegenUnop(op: Element) : string[] {
          const name = 'p_' + op.id,
                input = getOperand(op, 0);
          const code = `const ${name} = ${op.type.name}(${input});`,
                refs = [name];
          emitter.emit(code);
          map.set(op.id, refs);
          return refs;
        }

        function codegenBinop(op: Element) : string[] {
          const name = 'p_' + op.id,
                input1 = getOperand(op, 0),
                input2 = getOperand(op, 1);
          const code = `const ${name} = ${input1} ${op.type.name} ${input2};`,
                refs = [name];
          emitter.emit(code);
          map.set(op.id, refs);
          return refs;
        }

        function codegenCond(op: Element) : string[] {
          const name = 'p_' + op.id,
                cInput = getOperand(op, 0);
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

        function codegenModifier(modifier: ModifierElement) : string[] {
          const name = 'p_' + modifier.id;
          if (modifier.isImporter) {
            // TODO default value.
            const refs = [name];
            map.set(modifier.id, refs);
            return refs;
          } else if (modifier.isExporter) {
            const refs = [name];
            map.set(modifier.id, refs);
            return refs;
          }
          return ['undefined'];  // TODO
        }

        function functionName(src: InstancerTypes, pin: number) : string {
          if (src instanceof Functionchart) {
            return 'fn_' + src.id.toString();
          }
          // importer or abstract element.
          return 'p_' + src.id.toString();
        }

        function codegenFunctionInstance(instance: FunctionInstance) : string[] {
          const src = instance.src,
                srcPin = instance.srcPin,
                type = instance.type,
                inputs = type.inputs,
                outputs = type.outputs,
                parameters: string[] = [],
                refs: string[] = [];
          if (src instanceof ModifierElement && src.isImporter) {
          } else if (src instanceof Functionchart) {
            for (let i = 0; i < inputs.length; i++) {
              const input = getOperand(instance, i);
              parameters.push(input);
            }
            for (let i = 0; i < outputs.length; i++) {
              refs.push('r_' + instance.id.toString() + '_' + i.toString());
            }
            const fn = functionName(instance.src, instance.srcPin);
            if (refs.length === 1) {
              emitter.emit(`let ${refs[0]} = ${fn}(${parameters.join(', ')});`);
            } else if (refs.length > 1) {
              emitter.emit(`let [${refs.join(', ')}] = ${fn}(${parameters.join(', ')});`);
            }
            map.set(instance.id, refs);
            return refs;
          }
          return [];
        }

        function codegenFunctionchart(functionchart: Functionchart) : string[] {
          const name = functionName(functionchart, 0),
                inputs = functionchart.typeInfo.inputs,
                outputs = functionchart.typeInfo.outputs,
                fnInputs: string[] = [],
                fnOutputs: string[] = [];
          // First generate any sub-functions.
          functionchart.nodes.forEach(node => {
            if (node instanceof Functionchart) {
              codegenFunctionchart(node);
            }
          })
          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i],
                  name = parameterName(input.element, input.index);
            // map.set(input.element.id, [name]);
            fnInputs.push(name);
          }
          if (fnInputs.length > 0) {
            let code;
            if (fnInputs.length === 1) {
              code = `function ${name}(${fnInputs[0]}) {`;
            } else {
              code = `function ${name}(${fnInputs.join(', ')}) {`;
            }
            emitter.emit(code);
            emitter.indentIn();
          }

          for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i],
                  ref = getResult(output.element, output.index);
            fnOutputs.push(ref);
          }

          if (fnOutputs.length > 0) {
            let code;
            if (fnOutputs.length === 1) {
              code = `return ${fnOutputs[0]};`;
            } else {
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

        function codegenNode(node: NodeTypes) : string[] {
          if (node instanceof Pseudoelement) {
            return codegenPseudoelement(node, map, scopes);
          } else if (node instanceof FunctionInstance) {
            return codegenFunctionInstance(node);
          } else if (node instanceof Element) {
            if (node instanceof ModifierElement) {
              return codegenModifier(node);
            } else {
              switch (node.name) {
                case 'literal': return codegenLiteral(node);
                case 'unop': return codegenUnop(node);
                case 'binop': return codegenBinop(node);
                case 'cond': return codegenCond(node);
              }
            }
          } else if (node instanceof Functionchart) {
            return codegenFunctionchart(node);
          }
          return [];
        }
        codegenFunctionchart(functionchart);
      }
