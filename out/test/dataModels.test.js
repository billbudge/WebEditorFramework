// Collections tests.
'use strict';
import { describe, expect, test } from '@jest/globals';
import * as Data from '../src/dataModels.js';
//------------------------------------------------------------------------------
class TestDataContext extends Data.EventBase {
    constructor() {
        super(...arguments);
        this.map = new Map();
    }
    registerObject(obj) {
        this.map.set(obj.id, obj);
    }
    valueChanged(owner, prop, oldValue) {
        this.valueChange = { owner, prop, oldValue };
        this.onValueChanged(owner, prop, oldValue);
    }
    elementInserted(owner, prop, index) {
        const value = prop.get(owner).at(index);
        this.elementInsert = { owner, prop, index, value };
        this.onElementInserted(owner, prop, index);
    }
    elementRemoved(owner, prop, index, oldValue) {
        this.elementRemove = { owner, prop, index, oldValue };
        this.onElementRemoved(owner, prop, index, oldValue);
    }
    resolveReference(owner, prop) {
        const id = prop.getId(owner);
        this.resolvedReference = { owner, id };
        return this.map.get(id);
    }
    onChanged(change) {
        // console.log(change);
        super.onEvent('changed', change);
        return change;
    }
    onValueChanged(item, prop, oldValue) {
        const change = { type: 'valueChanged', item, prop, index: 0, oldValue };
        super.onEvent('valueChanged', change);
        return this.onChanged(change);
    }
    onElementInserted(item, prop, index) {
        const change = { type: 'elementInserted', item: item, prop: prop, index: index, oldValue: undefined };
        item.array.at(index).parent = item;
        super.onEvent('elementInserted', change);
        return this.onChanged(change);
    }
    onElementRemoved(item, prop, index, oldValue) {
        const change = { type: 'elementRemoved', item: item, prop: prop, index: index, oldValue: oldValue };
        super.onEvent('elementRemoved', change);
        return this.onChanged(change);
    }
    construct(typeName) {
        if (typeName !== 'TestDataObjectTemplate')
            throw ('Unknown type: ' + typeName);
        const result = new TestDataContextObject(this);
        this.registerObject(result);
        return result;
    }
}
class TestDataObjectTemplate {
    constructor() {
        this.typeName = 'TestDataObjectTemplate';
        this.id = new Data.IdProp('id');
        this.x = new Data.ScalarProp('x');
        this.array = new Data.ChildArrayProp('array');
        this.reference = new Data.ReferenceProp('reference');
        this.properties = [this.id, this.x, this.array, this.reference];
    }
}
class TestDataContextObject {
    constructor(context) {
        this.context = context;
        this.template = new TestDataObjectTemplate();
        this.id = TestDataContextObject.nextId++;
        this.context.registerObject(this);
    }
    get x() { return this.template.x.get(this); }
    set x(value) { this.template.x.set(this, value); }
    get array() { return this.template.array.get(this); }
    get reference() { return this.template.reference.get(this); }
    set reference(value) { this.template.reference.set(this, value); }
}
TestDataContextObject.nextId = 1;
describe('DataContext', () => {
    test('ScalarProp', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context);
        expect(item.x).toBeUndefined();
        item.x = 1;
        expect(item.x).toBe(1);
        expect(context.valueChange.owner).toBe(item);
        expect(context.valueChange.prop).toBe(item.template.x);
        expect(context.valueChange.oldValue).toBeUndefined();
    });
    test('ArrayProp', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context);
        expect(item.array.length).toBe(0);
        const child1 = new TestDataContextObject(context);
        item.array.append(child1);
        expect(item.array.length).toBe(1);
        expect(item.array.at(0)).toBe(child1);
        expect(() => item.array.at(1)).toThrow(RangeError);
        expect(context.elementInsert.owner).toBe(item);
        expect(context.elementInsert.prop).toBe(item.template.array);
        expect(context.elementInsert.index).toBe(0);
        expect(context.elementInsert.value).toBe(child1);
        const child2 = new TestDataContextObject(context);
        item.array.insert(child2, 0);
        expect(item.array.length).toBe(2);
        expect(item.array.at(0)).toBe(child2);
        expect(item.array.at(1)).toBe(child1);
        expect(item.array.indexOf(child1)).toBe(1);
        expect(item.array.indexOf(child2)).toBe(0);
        item.array.remove(child2);
        expect(context.elementRemove.owner).toBe(item);
        expect(context.elementRemove.prop).toBe(item.template.array);
        expect(context.elementRemove.index).toBe(0);
        expect(context.elementRemove.oldValue).toBe(child2);
    });
    test('ReferenceProp', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), child1 = new TestDataContextObject(context);
        expect(item.reference).toBeUndefined();
        item.reference = child1;
        expect(item.reference).toBe(child1);
        // expect(context.resolvedReference.owner).toBe(item);
        // expect(context.resolvedReference.id).toBe(child1.id);
    });
    test('cloning', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), child1 = new TestDataContextObject(context), child2 = new TestDataContextObject(context), child3 = new TestDataContextObject(context);
        item.array.append(child1);
        item.array.append(child2);
        child2.array.append(child3);
        child1.reference = child2;
        child2.reference = child3;
        child3.reference = item; // to parent, outside cloned graph.
        const clone1 = Data.copyItems([child1, child2], context), child1Clone = clone1[0], child2Clone = clone1[1], child3Clone = child2Clone.array.at(0);
        expect(clone1.length).toBe(2); // 2 top level items.
        expect(child1Clone.reference).toBe(child2Clone);
        expect(child2Clone.reference).toBe(child3Clone);
        expect(child3Clone.reference).toBe(item); // |item| was not cloned.
    });
});
//------------------------------------------------------------------------------
describe('Hierarchy', () => {
    test('getLowestCommonAncestor', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), child1 = new TestDataContextObject(context), child2 = new TestDataContextObject(context), child3 = new TestDataContextObject(context);
        expect(Data.getLowestCommonAncestor()).toBeUndefined();
        item.array.append(child3);
        child3.array.append(child1);
        child3.array.append(child2);
        expect(Data.getLineage(item)).toEqual([item]);
        expect(Data.getLowestCommonAncestor(item, item)).toBe(item);
        expect(Data.getLineage(child1)).toEqual([child1, child3, item]);
        expect(Data.getLowestCommonAncestor(item, child1)).toBe(item);
        expect(Data.getLowestCommonAncestor(child3, child1)).toBe(child3);
        expect(Data.getLowestCommonAncestor(child1, child2)).toBe(child3);
        expect(Data.getLowestCommonAncestor(child3, child1, item)).toBe(item);
    });
});
//------------------------------------------------------------------------------
describe('EventBase', () => {
    test('addHandler, removeHandler, onEvent', () => {
        let count = 0;
        const eventBase = new Data.EventBase(), handler = () => { count++; };
        eventBase.onEvent('test', handler);
        expect(count).toBe(0);
        eventBase.addHandler('test', handler);
        expect(count).toBe(0);
        eventBase.onEvent('test', handler);
        expect(count).toBe(1);
        eventBase.removeHandler('test', handler);
        expect(count).toBe(1);
        eventBase.onEvent('test', handler);
        expect(count).toBe(1);
    });
});
//------------------------------------------------------------------------------
describe('TransactionManager', () => {
    test('recording', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
        // No transaction, so no recording.
        item.x = 1;
        const transaction = transactionManager.beginTransaction('test');
        expect(transaction.ops.length).toBe(0);
        // Transaction, so record the operation, even though it doesn't change the value.
        item.x = 1;
        expect(transaction.ops.length).toBe(1);
    });
    test('end or cancel only in transaction', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        expect(() => transactionManager.endTransaction()).toThrow(Error);
        expect(() => transactionManager.cancelTransaction()).toThrow(Error);
    });
    test('cancel transaction', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
        const transaction = transactionManager.beginTransaction('test');
        item.x = 1;
        transactionManager.cancelTransaction();
        expect(item.x).toBe(undefined);
    });
    test('ChangeOp', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), child = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
        item.array.append(child); // outside transaction.
        const transaction1 = transactionManager.beginTransaction('test');
        item.array.remove(child);
        transactionManager.endTransaction();
        expect(item.array.length).toBe(0);
        transaction1.undo();
        expect(item.array.at(0)).toBe(child);
        transaction1.redo();
        expect(item.array.length).toBe(0);
        const transaction2 = transactionManager.beginTransaction('test');
        item.array.append(child); // inside transaction.
        transactionManager.endTransaction();
        expect(item.array.at(0)).toBe(child);
        transaction2.undo();
        expect(item.array.length).toBe(0);
        transaction2.redo();
        expect(item.array.at(0)).toBe(child);
    });
    test('value change coalescing', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), reference = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
        const transaction = transactionManager.beginTransaction('test');
        expect(transaction.ops.length).toBe(0);
        expect(transactionManager.getOldValue(item, 'x')).toBeUndefined();
        expect(transactionManager.getOldValue(item, 'reference')).toBeUndefined();
        item.x = 1;
        expect(transaction.ops.length).toBe(1);
        expect(transactionManager.getOldValue(item, 'x')).toBeUndefined();
        item.x = 2;
        expect(transaction.ops.length).toBe(1);
        expect(transactionManager.getOldValue(item, 'x')).toBeUndefined();
        const newReference = new TestDataContextObject(context);
        item.reference = newReference;
        expect(transaction.ops.length).toBe(2);
        expect(transactionManager.getOldValue(item, 'reference')).toBeUndefined();
        item.x = 3;
        expect(transaction.ops.length).toBe(2);
        expect(transactionManager.getOldValue(item, 'x')).toBeUndefined();
        transactionManager.endTransaction();
        transactionManager.undo(transaction);
        expect(item.x).toBeUndefined();
        expect(item.reference).toBeUndefined();
        transactionManager.redo(transaction);
        expect(item.x).toBe(3);
        expect(item.reference).toBe(newReference);
    });
    test('array op coalescing', () => {
        const context = new TestDataContext(), item = new TestDataContextObject(context), child = new TestDataContextObject(context), transactionManager = new Data.TransactionManager();
        context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
        let transaction = transactionManager.beginTransaction('test');
        expect(transaction.ops.length).toBe(0);
        // insert then remove should cancel.
        item.array.append(child);
        expect(transaction.ops.length).toBe(1);
        item.array.remove(child);
        expect(transaction.ops.length).toBe(0);
        item.array.append(child);
        expect(transaction.ops.length).toBe(1);
        transactionManager.endTransaction();
        // remove then insert should cancel.
        transaction = transactionManager.beginTransaction('test');
        item.array.remove(child);
        expect(transaction.ops.length).toBe(1);
        item.array.append(child);
        expect(transaction.ops.length).toBe(0);
    });
});
//# sourceMappingURL=dataModels.test.js.map