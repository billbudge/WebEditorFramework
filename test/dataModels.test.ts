// Collections tests.
'use strict';

import {describe, expect, test} from '@jest/globals';
import * as Data from '../src/dataModels.js';
import * as Collections from '../src/collections.js';

//------------------------------------------------------------------------------

class TestDataContext extends Data.EventBase<Data.Change, Data.ChangeEvents>
                      implements Data.DataContext {
  valueChange: any;
  elementInsert: any;
  elementRemove: any;
  resolvedReference: any;

  map = new Map<number, TestDataContextObject>();
  registerObject(obj: TestDataContextObject) {
    this.map.set(obj.id, obj);
  }

  valueChanged(
    owner: TestDataContextObject, prop: Data.ScalarPropertyTypes, oldValue: any) : void {
      this.valueChange = { owner, prop, oldValue };
      this.onValueChanged(owner, prop, oldValue);
    }
  elementInserted(
      owner: TestDataContextObject, prop: Data.ArrayPropertyTypes, index: number) : void {
    const value = prop.get(owner).at(index);
    this.elementInsert = { owner, prop, index, value };
    this.onElementInserted(owner, prop, index);
  }
  elementRemoved(
      owner: TestDataContextObject, prop: Data.ArrayPropertyTypes, index: number, oldValue: TestDataContextObject) : void {
    this.elementRemove = { owner, prop, index, oldValue };
    this.onElementRemoved(owner, prop, index, oldValue);
  }
  resolveReference(
      owner: TestDataContextObject, prop: Data.ReferenceProp) : TestDataContextObject | undefined {
    const id = prop.getId(owner);
    this.resolvedReference = { owner, id };
    return this.map.get(id);
  }

  private onChanged(change: Data.Change) {
    // console.log(change);
    super.onEvent('changed', change);
    return change;
  }
  private onValueChanged(
      item: TestDataContextObject, prop: Data.ScalarPropertyTypes, oldValue: any) {
    const change: Data.Change = {type: 'valueChanged', item, prop, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    return this.onChanged(change);
  }
  private onElementInserted(
      item: TestDataContextObject, prop: Data.ArrayPropertyTypes, index: number) {
    const change: Data.Change =
        { type: 'elementInserted', item: item, prop: prop, index: index, oldValue: undefined };
    item.array.at(index).parent = item;
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(
      item: TestDataContextObject, prop: Data.ArrayPropertyTypes, index: number, oldValue: TestDataContextObject ) :
      Data.Change {
    const change: Data.Change =
        { type: 'elementRemoved', item: item, prop: prop, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    return this.onChanged(change);
  }

  construct(typeName: string) : TestDataContextObject {
    if (typeName !== 'TestDataObjectTemplate')
      throw('Unknown type: ' + typeName);
    const result = new TestDataContextObject(this);
    this.registerObject(result);
    return result;
  }
}

class TestDataObjectTemplate implements Data.DataObjectTemplate {
  typeName: string = 'TestDataObjectTemplate';
  id: Data.IdProp;
  x: Data.ScalarProp;
  array: Data.ChildArrayProp;
  reference: Data.ReferenceProp;
  properties: Data.PropertyTypes[];
  constructor() {
    this.id = new Data.IdProp('id');
    this.x = new Data.ScalarProp('x');
    this.array = new Data.ChildArrayProp('array');
    this.reference = new Data.ReferenceProp('reference');
    this.properties = [this.id, this.x, this.array, this.reference];
  }
}

class TestDataContextObject implements Data.DataContextObject, Data.ReferencedObject,
                                       Data.Parented<TestDataContextObject> {
  context: TestDataContext;
  template: TestDataObjectTemplate;

  id: number;
  static nextId = 1;

  constructor(context: TestDataContext) {
    this.context = context;
    this.template = new TestDataObjectTemplate();
    this.id = TestDataContextObject.nextId++;
    this.context.registerObject(this);
  }
  get x() { return this.template.x.get(this); }
  set x(value: number) { this.template.x.set(this, value); }
  get array() { return this.template.array.get(this) as Data.List<TestDataContextObject>; }
  get reference() { return this.template.reference.get(this) as TestDataContextObject; }
  set reference(value: TestDataContextObject) { this.template.reference.set(this, value); }

  parent: TestDataContextObject | undefined;
}

describe('DataContext', () => {
  test('ScalarProp', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context);

    expect(item.x).toBeUndefined();
    item.x = 1;
    expect(item.x).toBe(1);
    expect(context.valueChange.owner).toBe(item);
    expect(context.valueChange.prop).toBe(item.template.x);
    expect(context.valueChange.oldValue).toBeUndefined();
  });
  // TODO IdProp.
  test('ChildArrayProp', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context);

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
    const forward = new Array<TestDataContextObject>();
    item.array.forEach((child) => forward.push(child));
    expect(forward).toEqual([child2, child1]);
    const reverse = new Array<TestDataContextObject>();
    item.array.forEachReverse((child) => reverse.push(child));
    expect(reverse).toEqual([child1, child2]);

    item.array.remove(child2);
    expect(context.elementRemove.owner).toBe(item);
    expect(context.elementRemove.prop).toBe(item.template.array);
    expect(context.elementRemove.index).toBe(0);
    expect(context.elementRemove.oldValue).toBe(child2);
    expect(() => item.array.removeAt(1)).toThrow(RangeError);
  });
  test('ReferenceProp', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context);

    expect(item.reference).toBeUndefined();
    item.reference = child1;
    expect(item.reference).toBe(child1);
    expect(context.resolvedReference.owner).toBe(item);
    expect(context.resolvedReference.id).toBe(child1.id);
  });
});

//------------------------------------------------------------------------------

describe('Cloning', () => {
  test('copyItems', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context),
          child2 = new TestDataContextObject(context),
          child3 = new TestDataContextObject(context);

    item.array.append(child3);
    child3.array.append(child1);
    child1.reference = item;
    child3.array.append(child2);
    child2.reference = child1;

    const copies = Data.copyItems([child3], context);
    expect(copies.length).toBe(1);
    expect(copies[0] instanceof TestDataContextObject).toBe(true);
    const itemCopy = copies[0] as TestDataContextObject;
    expect(itemCopy.array.length).toBe(2);
    expect(itemCopy.array.at(0) instanceof TestDataContextObject).toBe(true);
    expect(itemCopy.array.at(1) instanceof TestDataContextObject).toBe(true);
    const child1Copy = itemCopy.array.at(0) as TestDataContextObject,
          child2Copy = itemCopy.array.at(1) as TestDataContextObject;
    expect(child1Copy).not.toBe(child1);
    expect(child2Copy).not.toBe(child2);
    expect(child1Copy.reference).toBe(item);  // not itemCopy, since item is outside the cloned graph.
    expect(child2Copy.reference).toBe(child1Copy);
  });
});

//------------------------------------------------------------------------------

describe('Serialization, deserialization', () => {
  test('copyItems', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context),
          child2 = new TestDataContextObject(context),
          child3 = new TestDataContextObject(context);

    item.array.append(child3);
    child3.array.append(child1);
    child1.x = 1;
    child1.reference = item;
    child3.array.append(child2);
    child2.x = 2;
    child2.reference = child1;
    child3.x = 3

    const blob = Data.Serialize(item);
    const copy = Data.Deserialize(blob, context);
    expect(copy instanceof TestDataContextObject).toBe(true);
    const itemCopy = copy as TestDataContextObject;
    expect(itemCopy.array.length).toBe(1);
    expect(itemCopy.array.at(0) instanceof TestDataContextObject).toBe(true);
    const child3Copy = itemCopy.array.at(0) as TestDataContextObject;
    expect(child3Copy.array.length).toBe(2);
    expect(child3Copy.x).toBe(3);
    const child1Copy = child3Copy.array.at(0) as TestDataContextObject,
          child2Copy = child3Copy.array.at(1) as TestDataContextObject;
    expect(child1Copy.reference).toBe(itemCopy);
    expect(child1Copy.x).toBe(1);
    expect(child2Copy.x).toBe(2);
    expect(child2Copy.reference).toBe(child1Copy);  // TODO fix.
  });
});

//------------------------------------------------------------------------------

describe('Hierarchy', () => {
  test('getLowestCommonAncestor', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context),
          child2 = new TestDataContextObject(context),
          child3 = new TestDataContextObject(context);

    expect(Data.getLowestCommonAncestor()).toBeUndefined();

    item.array.append(child3);
    child3.array.append(child1);
    child3.array.append(child2);

    expect(Data.getLineage<TestDataContextObject>(item)).toEqual([ item ]);
    expect(Data.getLowestCommonAncestor(item, item)).toBe(item);
    expect(Data.getLineage(child1)).toEqual([ child1, child3, item ]);
    expect(Data.getLowestCommonAncestor(item, child1)).toBe(item);
    expect(Data.getLowestCommonAncestor(child3, child1)).toBe(child3);
    expect(Data.getLowestCommonAncestor(child1, child2)).toBe(child3);
    expect(Data.getLowestCommonAncestor(child3, child1, item)).toBe(item);

    // Ill defined tree.
    const child4 = new TestDataContextObject(context);
    expect(Data.getLowestCommonAncestor(child3, child4)).toBeUndefined();
  });
});

//------------------------------------------------------------------------------

describe('EventBase', () => {
  test('addHandler, removeHandler, onEvent', () => {
    let count = 0;
    const eventBase = new Data.EventBase<() => void, string>(),
          handler = () => { count++ };

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
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();

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
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();
    expect(() => transactionManager.endTransaction()).toThrow(Error);
    expect(() => transactionManager.cancelTransaction()).toThrow(Error);
  });
  test('cancel transaction', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();
    context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
    const transaction = transactionManager.beginTransaction('test');
    item.x = 1;
    transactionManager.cancelTransaction();
    expect(item.x).toBe(undefined);
  });
  test('ChangeOp', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();
    context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));
    item.array.append(child);  // outside transaction.
    const transaction1 = transactionManager.beginTransaction('test');
    item.array.remove(child);
    transactionManager.endTransaction();
    expect(item.array.length).toBe(0);
    transaction1.undo();
    expect(item.array.at(0)).toBe(child);
    transaction1.redo();
    expect(item.array.length).toBe(0);
    const transaction2 = transactionManager.beginTransaction('test');
    item.array.append(child);  // inside transaction.
    transactionManager.endTransaction();
    expect(item.array.at(0)).toBe(child);
    transaction2.undo();
    expect(item.array.length).toBe(0);
    transaction2.redo();
    expect(item.array.at(0)).toBe(child);
  });
  test('value change coalescing', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          reference = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();

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
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager();

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

describe('HistoryManager', () => {
  test('undo, redo, selection undo/redo', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context),
          child2 = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager(),
          selectionSet = new Collections.SelectionSet<TestDataContextObject>(),
          historyManager = new Data.HistoryManager(transactionManager, selectionSet);

    context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));

    expect(historyManager.getUndo()).toBeUndefined();
    expect(historyManager.getRedo()).toBeUndefined();

    selectionSet.add(item);

    const transaction = transactionManager.beginTransaction('test');
    item.array.append(child1);
    item.array.append(child2);
    selectionSet.set([child1, child2]);
    transactionManager.endTransaction();

    expect(transaction.ops.length).toBe(3);  // Two appends and a SelectionOp.
    expect(selectionSet.length()).toBe(2);
    expect(selectionSet.has(child1)).toBe(true);
    expect(selectionSet.has(child2)).toBe(true);
    expect(selectionSet.lastSelected()).toBe(child2);

    expect(historyManager.getUndo()).toBeDefined();
    expect(historyManager.getRedo()).toBeUndefined();

    historyManager.undo();
    expect(historyManager.getUndo()).toBeUndefined();
    expect(historyManager.getRedo()).toBeDefined();

    expect(selectionSet.length()).toBe(1);
    expect(selectionSet.has(item)).toBe(true);

    historyManager.redo();
    expect(historyManager.getUndo()).toBeDefined();
    expect(historyManager.getRedo()).toBeUndefined();
    expect(selectionSet.length()).toBe(2);
    expect(selectionSet.has(child1)).toBe(true);
    expect(selectionSet.has(child2)).toBe(true);
    expect(selectionSet.lastSelected()).toBe(child2);
  });
  test('no SelectionOp when selection is unchanged', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          transactionManager = new Data.TransactionManager(),
          selectionSet = new Collections.SelectionSet<TestDataContextObject>(),
          historyManager = new Data.HistoryManager(transactionManager, selectionSet);

    context.addHandler('changed', transactionManager.onChanged.bind(transactionManager));

    selectionSet.add(item);

    const transaction = transactionManager.beginTransaction('test');
    item.x = 1;
    transactionManager.endTransaction();
    expect(selectionSet.length()).toBe(1);
    expect(selectionSet.lastSelected()).toBe(item);
  });
});



/*

QUnit.test("instancingModel isomorphic", function() {
  // TODO add some references.
  const test_data = {
    id: 1,
    item: { id: 2, },
    items: [
      {
        id: 3,
        items: [
          { id: 4, x: 0 },
          { id: 5, x: 1 },
        ],
      },
      {
        id: 6,
        items: [
          { id: 7, x: 0 },
          { id: 8, x: 1 },
        ],
      },
      { id: 9, foo: 'bar' },
    ],
  }
  const model = { root: test_data };
  const test = dataModels.instancingModel.extend(model);
  QUnit.assert.ok(test.isomorphic(test_data, test_data, new Map()));
  const test_data_clone = test.cloneGraph([test_data])[0];
  QUnit.assert.ok(test.isomorphic(test_data, test_data_clone, new Map()));
  QUnit.assert.ok(test.isomorphic(test_data.items[0], test_data.items[1], new Map()));
  QUnit.assert.ok(!test.isomorphic(test_data.item, test_data.items[2], new Map()));
});

*/