// Collections tests.
'use strict';

import {describe, expect, test} from '@jest/globals';
import * as Data from '../src/dataModels.js';

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

class TestDataContextObject implements Data.DataContextObject, Data.ReferencedObject {
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
  test('ArrayProp', () => {
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

    item.array.remove(child2);
    expect(context.elementRemove.owner).toBe(item);
    expect(context.elementRemove.prop).toBe(item.template.array);
    expect(context.elementRemove.index).toBe(0);
    expect(context.elementRemove.oldValue).toBe(child2);
  });
  test('ReferenceProp', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context);

    expect(item.reference).toBeUndefined();
    item.reference = child1;
    expect(item.reference).toBe(child1);
    // expect(context.resolvedReference.owner).toBe(item);
    // expect(context.resolvedReference.id).toBe(child1.id);
  });
  test('cloning', () => {
    const context = new TestDataContext(),
          item = new TestDataContextObject(context),
          child1 = new TestDataContextObject(context),
          child2 = new TestDataContextObject(context),
          child3 = new TestDataContextObject(context);

    item.array.append(child1);
    item.array.append(child2);
    child2.array.append(child3);
    child1.reference = child2;
    child2.reference = child3;
    child3.reference = item;  // to parent, outside cloned graph.

    const clone1 = Data.copyItems([child1, child2], context),
          child1Clone = clone1[0] as TestDataContextObject,
          child2Clone = clone1[1] as TestDataContextObject,
          child3Clone = child2Clone.array.at(0) as TestDataContextObject;

    expect(clone1.length).toBe(2);  // 2 top level items.
    expect(child1Clone.reference).toBe(child2Clone);
    expect(child2Clone.reference).toBe(child3Clone);
    expect(child3Clone.reference).toBe(item);  // |item| was not cloned.
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







// //------------------------------------------------------------------------------

// describe('DataModel', () => {
//   test('constructor', () => {
//     const root: any = {},
//           dataModel = new Data.DataModel(root);
//     expect(dataModel.root()).toBe(root);
//   });
//   test('isProperty', () => {
//     const root: any = {
//             id: 1,
//             foo: 'foo',
//             child: {
//               id: 2,
//             }
//           },
//           dataModel = new Data.DataModel(root);

//     expect(dataModel.isProperty(root, 'foo')).toBe(true);
//     expect(dataModel.isProperty(root, 'bar')).toBe(false);
//     expect(dataModel.isProperty(root, 'id')).toBe(true);
//     expect(dataModel.isProperty(root, 'child')).toBe(true);
//   });
//   test('visitProperties', () => {
//     const root: any = {
//             id: 1,
//             childId: 2,
//             foo: 'foo',
//             child: {
//               id: 2,
//               bar: 'baz',
//             },
//             props: new Array(0, 1, 2),
//           },
//           dataModel = new Data.DataModel(root);

//     const rootProps = new Array<string>();
//     dataModel.visitProperties(root, (item, attr) => { rootProps.push(attr)});
//     expect(rootProps.toString()).toBe('id,childId,foo,child,props');
//   });
//   test('visitChildren, visitSubtree', () => {
//     const child: any = { id: 1000 },
//           grandchild: any = {},
//           child0: any = { grandchild: grandchild },
//           child1: any = {},
//           root: any = {
//             child: child,
//             children: new Array(child0, child1),  // two unidentified children and grandchild
//           },
//           dataModel = new Data.DataModel(root);
//     const children = new Array<object>();
//     dataModel.visitChildren(root, (item) => { children.push(item)});
//     expect(children).toEqual(
//         new Array<object>(child, child0, child1));
//     const descendants = new Array<object>();
//     dataModel.visitSubtree(root, (item) => { descendants.push(item)});
//     expect(descendants).toEqual(
//         new Array<object>(root, child, child0, grandchild, child1));
//   });
//   test('initializers', () => {
//     const root: any = {},
//           dataModel = new Data.DataModel(root),
//           initializer = (item: any) => item.initialized = true,
//           item: any = {};
//     dataModel.addInitializer(initializer);
//     dataModel.initialize(item);
//     expect(item.initialized).toBe(true);
//   });
// });

// //------------------------------------------------------------------------------

// describe('ObservableModel', () => {
//   test('events', () => {
//     let changes = 0,
//         valueChanges = 0,
//         elementsInserted = 0,
//         elementsRemoved = 0,
//         received = new Array<Data.Change>();
//     const observableModel = new Data.ObservableModel(),
//           onChange = (arg: Data.Change) => { received.push(arg), changes++; },
//           onValueChange = (arg: Data.Change) =>  { received.push(arg); valueChanges++; },
//           onInsertElement = (arg: Data.Change) => { received.push(arg); elementsInserted++; },
//           onRemoveElement = (arg: Data.Change) => { received.push(arg); elementsRemoved++; };
//     const root: any = {
//             val: 'foo',
//             child: {
//               val: 'bar',
//             },
//             children: [],
//           },
//           child2: any = {};

//     observableModel.addHandler('changed', onChange);
//     observableModel.addHandler('valueChanged', onValueChange);
//     observableModel.changeValue(root.child, 'val', 'baz');
//     expect(changes).toBe(1);
//     expect(valueChanges).toBe(1);

//     observableModel.addHandler('elementInserted', onInsertElement);
//     observableModel.insertElement(root, 'children', 0, child2);
//     expect(changes).toBe(2);
//     expect(valueChanges).toBe(1);
//     expect(elementsInserted).toBe(1);
//     expect(elementsRemoved).toBe(0);

//     observableModel.addHandler('elementRemoved', onRemoveElement);
//     expect(observableModel.removeElement(root, 'children', 0)).toBe(child2);
//     expect(changes).toBe(3);
//     expect(valueChanges).toBe(1);
//     expect(elementsInserted).toBe(1);
//     expect(elementsRemoved).toBe(1);
//   });
// });

// //------------------------------------------------------------------------------

// describe('ReferenceModel', () => {
//   test('constructor', () => {
//     const root: any = {
//             child: {
//               id: 1000,
//             },
//             children: new Array({}, {}),  // two unidentified children
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel);
//     // TODO add more tests for references.
//     expect(referenceModel.getId(root.child)).toBe(1000);  // preserved
//     expect(referenceModel.getId(root)).toBe(1001);
//     expect(referenceModel.getId(root.children[0])).toBe(1002);
//     expect(referenceModel.getId(root.children[1])).toBe(1003);
//   });
//   test('assignId', () => {
//     const root: any = {
//             id: 1000,
//             child: {
//               id: 1020,
//             },
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel),
//           child2: any = {};
//     expect(referenceModel.assignId(child2)).toBe(1021);
//   });
//   test('isReference', () => {
//     const root: any = {
//             id: 1,
//             childId: 2,
//             foo: 'foo',
//             child: {
//               id: 2,
//             }
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel);

//     expect(referenceModel.isReference(root, 'foo')).toBe(false);
//     expect(referenceModel.isReference(root, 'bar')).toBe(false);
//     expect(referenceModel.isReference(root, 'childId')).toBe(true);
//     expect(referenceModel.isReference(root.child, 'id')).toBe(false);
//   });
//   test('visitReferences', () => {
//     const root: any = {
//             id: 1,
//             childId: 2,
//             fooId: 3,
//             child: {
//               id: 2,
//               bar: 'baz',
//             },
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel);

//     const rootRefs = new Array<string>();
//     referenceModel.visitReferences(root, (item, attr) => { rootRefs.push(attr)});
//     expect(rootRefs.toString()).toBe('childId,fooId');
//   });
//   test('reference tracking', () => {
//     // Default data model references end with 'Id'.
//     const child1 = { id: 2, refId: 1 },
//           child2 = { id: 3, refId: 1 },
//           child3 = { id: 4, firstId: 1, secondId: 3 },
//           root = {
//             id: 1,
//             child: null,
//             items: [
//               child1,
//             ],
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel);

//     expect(referenceModel.getReference(child1, 'refId')).toBe(root);
//     expect(referenceModel.getReferenceFn('refId')(child1)).toBe(root);
//     expect(referenceModel.getReference(child1, 'refId')).toBe(
//            referenceModel.resolveId(child1.refId));

//     observableModel.changeValue(root, 'child', child2);
//     expect(referenceModel.getReference(child2, 'refId')).toBe(root);

//     observableModel.changeValue(child2, 'refId', 2);
//     expect(referenceModel.getReference(child2, 'refId')).toBe(child1);

//     observableModel.insertElement(root, 'items', root.items.length - 1, child3);
//     expect(referenceModel.getReference(child3, 'firstId')).toBe(root);
//     expect(referenceModel.getReferenceFn('firstId')(child3)).toBe(root);
//     expect(referenceModel.getReference(child3, 'secondId')).toBe(child2);
//     expect(referenceModel.getReferenceFn('secondId')(child3)).toBe(child2);

//     // unresolvable id causes ref to be set to 'null'.
//     observableModel.changeValue(child2, 'refId', 88);
//     expect(referenceModel.getReference(child2, 'refId')).toBeUndefined();
//     expect(referenceModel.resolveId(child2.refId)).toBeUndefined();
//   });
//   test('getReferenceFn', () => {
//     // Default data model references end with 'Id'.
//     const root = {},
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           referenceModel = new Data.ReferenceModel(dataModel, observableModel);
//     // Multiple invocations return the same function (cached).
//     const fn = referenceModel.getReferenceFn('objectId');
//     // The result of invoking the function on an object without the attribute is undefined.
//     expect(fn({})).toBeUndefined();
//     const fn2 = referenceModel.getReferenceFn('objectId');
//     expect(fn).toBe(fn2);
//   });
// });

// describe('HierarchyModel', () => {
//   test('constructor', () => {
//     const grandchildren = new Array({}, {}),
//           child = { grandchildren },
//           root = { child },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           hierarchyModel = new Data.HierarchyModel(dataModel, observableModel);
//     // Parents should be set.
//     expect(hierarchyModel.getParent(root)).toBeUndefined();
//     expect(hierarchyModel.getParent(child)).toBe(root);
//     expect(hierarchyModel.getParent(grandchildren[0])).toBe(child);
//     expect(hierarchyModel.getParent(grandchildren[1])).toBe(child);
//   });
//   test('updating', () => {
//     const child: any = {
//             children:[ {}, {} ],
//           },
//           root = {
//             item: {},
//             items: [],
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           hierarchyModel = new Data.HierarchyModel(dataModel, observableModel);

//     expect(hierarchyModel.getParent(child)).toBeUndefined();
//     expect(hierarchyModel.getParent(child.children[0])).toBeUndefined();
//     expect(hierarchyModel.getParent(child.children[1])).toBeUndefined();
//     observableModel.insertElement(root, 'items', 0, child);
//     expect(hierarchyModel.getParent(child)).toBe(root);
//     expect(hierarchyModel.getParent(child.children[0])).toBe(child);
//     expect(hierarchyModel.getParent(child.children[1])).toBe(child);
//   });
//   test('getLineage, getLowestCommonAncestor', () => {
//     const child1 = {},
//           child2 = {},
//           child3 = { items: [ child1, child2 ] },
//           root: any = {
//             items: [ child3 ]
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           hierarchyModel = new Data.HierarchyModel(dataModel, observableModel);

//     expect(hierarchyModel.getLineage(root)).toEqual([ root ]);
//     expect(hierarchyModel.getLowestCommonAncestor(root, root)).toBe(root);
//     expect(hierarchyModel.getLineage(child1)).toEqual([ child1, child3, root ]);
//     expect(hierarchyModel.getLowestCommonAncestor(root, child1)).toBe(root);
//     expect(hierarchyModel.getLowestCommonAncestor(child3, child1)).toBe(child3);
//     expect(hierarchyModel.getLowestCommonAncestor(child1, child2)).toBe(child3);
//     expect(hierarchyModel.getLowestCommonAncestor(child3, child1, root)).toBe(root);
//   });
// });

// describe('SelectionModel', () => {
//   test('constructor', () => {
//     const selectionModel = new Data.SelectionModel();
//     expect(selectionModel.empty()).toBe(true);
//     expect(selectionModel.contents()).toEqual([]);
//     expect(selectionModel.lastSelected()).toBeUndefined();
//   });
//   test('add', () => {
//     const root = {};
//     const selectionModel = new Data.SelectionModel();
//     selectionModel.add('a');
//     expect(selectionModel.empty()).toBe(false);
//     expect(selectionModel.has('a')).toBe(true);
//     expect(selectionModel.contents()).toEqual(['a']);
//     expect(selectionModel.lastSelected()).toBe('a');
//     selectionModel.add('b');
//     selectionModel.add('a');
//     selectionModel.add('c');
//     expect(selectionModel.contents()).toEqual(['b', 'a', 'c']);
//     expect(selectionModel.lastSelected()).toBe('c');
//   });
//   test('delete', () => {
//     const root = {};
//     const selectionModel = new Data.SelectionModel();
//     selectionModel.set(['b', 'a', 'c']);
//     selectionModel.delete('c');
//     expect(selectionModel.contents()).toEqual(['b', 'a']);
//     expect(selectionModel.lastSelected()).toBe('a');
//     selectionModel.delete('d');  // not selected
//     expect(selectionModel.contents()).toEqual(['b', 'a']);
//     expect(selectionModel.lastSelected()).toBe('a');
//   });
//   test('set, has, contents', () => {
//     const child1 = {},
//           child2 = {},
//           child3 = { items: [ child1, child2 ] },
//           root: any = {
//             items: [ child3 ]
//           },
//           selectionModel = new Data.SelectionModel();

//     selectionModel.set(root);
//     expect(selectionModel.contents()).toEqual([ root ]);
//     expect(selectionModel.has(root)).toBe(true);
//     expect(selectionModel.has(child3)).toBe(false);
//     expect(selectionModel.lastSelected()).toBe(root);

//     selectionModel.set([ child1, child2, child3 ]);
//     expect(selectionModel.contents()).toEqual([ child1, child2, child3 ]);
//     expect(selectionModel.has(root)).toBe(false);
//     expect(selectionModel.has(child1)).toBe(true);
//     expect(selectionModel.has(child2)).toBe(true);
//     expect(selectionModel.has(child3)).toBe(true);
//     expect(selectionModel.lastSelected()).toBe(child3);
//   });
//   test('hasAncestor', () => {
//     const child1 = {},
//           child2 = {},
//           child3 = { items: [ child1, child2 ] },
//           root: any = {
//             items: [ child3 ]
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           hierarchyModel = new Data.HierarchyModel(dataModel, observableModel),
//           selectionModel = new Data.SelectionModel();

//     selectionModel.set(root);
//     expect(selectionModel.hasAncestor(root, hierarchyModel)).toBe(false);
//     expect(selectionModel.hasAncestor(child1, hierarchyModel)).toBe(true);

//     selectionModel.set(child3);
//     expect(selectionModel.hasAncestor(root, hierarchyModel)).toBe(false);
//     expect(selectionModel.hasAncestor(child1, hierarchyModel)).toBe(true);
//     expect(selectionModel.hasAncestor(child3, hierarchyModel)).toBe(false);
//   });
//   test('reduceSelection', () => {
//     const child1 = {},
//           child2 = {},
//           child3 = { items: [ child1, child2 ] },
//           root: any = {
//             items: [ child3 ]
//           },
//           dataModel = new Data.DataModel(root),
//           observableModel = new Data.ObservableModel(),
//           hierarchyModel = new Data.HierarchyModel(dataModel, observableModel),
//           selectionModel = new Data.SelectionModel();

//     selectionModel.set([ child1, child2, child3 ]);
//     selectionModel.reduceSelection(hierarchyModel)
//     expect(selectionModel.contents()).toEqual([ child3 ]);
//   });
// });

// describe('TransactionModel', () => {
//   test('events', () => {
//     const observableModel = new Data.ObservableModel(),
//           transactionModel = new Data.TransactionModel(observableModel);
//     let started: Data.Transaction | undefined = undefined,
//         ending: Data.Transaction | undefined = undefined,
//         ended: Data.Transaction | undefined = undefined,
//         undo: Data.Transaction | undefined = undefined,
//         redo: Data.Transaction | undefined = undefined;


//     transactionModel.addHandler('transactionBegan', function(transaction) {
//       expect(started).toBeUndefined();
//       expect(transactionModel.transaction()).toBe(transaction);
//       started = transaction;
//     });
//     transactionModel.addHandler('transactionEnding', function(transaction) {
//       expect(ending).toBeUndefined();
//       expect(started).toBe(transaction);
//       ending = transaction;
//     });
//     transactionModel.addHandler('transactionEnded', function(transaction) {
//       expect(ended).toBeUndefined();
//       expect(started).toBe(transaction);
//       expect(ending).toBe(transaction);
//       ended = transaction;
//     });

//     expect(transactionModel.transaction()).toBeUndefined();
//     transactionModel.beginTransaction('test');
//     expect(started).toBe(transactionModel.transaction());
//     expect(started!.name).toBe('test');

//     transactionModel.endTransaction();
//     expect(transactionModel.transaction()).toBeUndefined();
//     expect(started).toBe(ending);
//     expect(started).toBe(ended);

//     transactionModel.addHandler('didUndo', function(transaction) {
//       expect(transactionModel.transaction()).toBeUndefined();
//       undo = transaction;
//       expect(undo).toBe(ended);
//     });
//     transactionModel.undo(ended!);

//     transactionModel.addHandler('didRedo', function(transaction) {
//       expect(transactionModel.transaction()).toBeUndefined();
//       redo = transaction;
//       expect(undo).toBe(redo);
//     });
//     transactionModel.redo(ended!);
//   });
//   test('transaction', () => {
//     const root = {
//             prop1: 'foo',
//             array: new Array<string>(),
//           },
//           observableModel = new Data.ObservableModel(),
//           transactionModel = new Data.TransactionModel(observableModel);

//     let ended: Data.Transaction | undefined = undefined;
//     transactionModel.addHandler('transactionEnded', function(transaction) {
//       ended = transaction;
//     });

//     transactionModel.beginTransaction('test');
//     root.prop1 = 'bar';
//     observableModel.onValueChanged(root, 'prop1', 'foo');
//     root.array.push('a');
//     observableModel.onElementInserted(root, 'array', 0);
//     root.array.push('b');
//     observableModel.onElementInserted(root, 'array', 1);
//     root.array.push('c');
//     observableModel.onElementInserted(root, 'array', 2);
//     root.array.splice(1, 1);  // remove middle element.
//     observableModel.onElementRemoved(root, 'array', 1, 'b');
//     expect(ended).toBeUndefined();
//     transactionModel.endTransaction();
//     expect(ended).toBeDefined();
//     transactionModel.undo(ended!);
//     expect(root.prop1).toBe('foo');
//     expect(root.array).toEqual([]);
//     transactionModel.redo(ended!);
//     expect(root.prop1).toBe('bar');
//     expect(root.array).toEqual([ 'a', 'c' ]);
//   });
//   test('cancel', () => {
//     const root = {
//             prop1: 'foo',
//           },
//           observableModel = new Data.ObservableModel(),
//           transactionModel = new Data.TransactionModel(observableModel);

//     let ending: Data.Transaction | undefined = undefined,
//         canceled: Data.Transaction | undefined = undefined;
//     transactionModel.addHandler('transactionEnding', function(transaction) {
//       expect(ending).toBeUndefined();
//       ending = transaction;
//       transactionModel.cancelTransaction();
//     });
//     transactionModel.addHandler('transactionCancelled', function(transaction) {
//       expect(ending).toBeUndefined();
//       canceled = transaction;
//     });

//     transactionModel.beginTransaction('test');
//     root.prop1 = 'bar';
//     observableModel.onValueChanged(root, 'prop1', 'foo');
//     expect(ending).toBeUndefined();
//     expect(canceled).toBeUndefined();
//     transactionModel.cancelTransaction();
//     expect(ending).toBeUndefined();
//     expect(canceled).toBeDefined();
//     expect(root.prop1).toBe('foo');
//   });
// });

/*



QUnit.test("selectionModel remove", function() {
});

QUnit.test("selectionModel toggle", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  test.add(['a', 'b', 'c']);
  test.toggle('c');
  QUnit.assert.deepEqual(test.contents(), ['b', 'a']);
  QUnit.assert.deepEqual(test.lastSelected(), 'b');
  test.toggle('c');
  QUnit.assert.deepEqual(test.contents(), ['c', 'b', 'a']);
  QUnit.assert.deepEqual(test.lastSelected(), 'c');
});

QUnit.test("selectionModel set", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  test.set('a');
  QUnit.assert.deepEqual(test.contents(), ['a']);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
  test.set(['a', 'b', 'c']);
  QUnit.assert.deepEqual(test.contents(), ['c', 'b', 'a']);
  QUnit.assert.deepEqual(test.lastSelected(), 'c');
});

QUnit.test("selectionModel select", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  test.set(['a', 'b', 'c']);
  test.select('d', true);
  QUnit.assert.deepEqual(test.contents(), ['d', 'c', 'b', 'a']);
  test.select('d', true);
  QUnit.assert.deepEqual(test.contents(), ['c', 'b', 'a']);
  test.select('a', false);
  QUnit.assert.deepEqual(test.contents(), ['a', 'c', 'b']);
  test.select('a', true);
  QUnit.assert.deepEqual(test.contents(), ['c', 'b']);
});

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