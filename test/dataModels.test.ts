// Collections tests.

import {describe, expect, test} from '@jest/globals';
import { DataAttr, DataModel, EventBase, Change, ObservableModel,
         ReferenceModel, HierarchyModel, SelectionModel } from '../src/dataModels';

'use strict';

//------------------------------------------------------------------------------

describe('DataModel', () => {
  test('constructor', () => {
    const root: any = {},
          dataModel = new DataModel(root);
    expect(dataModel.root()).toBe(root);
  });
  test('isProperty', () => {
    const root: any = {
            id: 1,
            foo: 'foo',
            child: {
              id: 2,
            }
          },
          dataModel = new DataModel(root);

    expect(dataModel.isProperty(root, 'foo')).toBe(true);
    expect(dataModel.isProperty(root, 'bar')).toBe(false);
    expect(dataModel.isProperty(root, 'id')).toBe(true);
    expect(dataModel.isProperty(root, 'child')).toBe(true);
  });
  test('visitProperties', () => {
    const root: any = {
            id: 1,
            childId: 2,
            foo: 'foo',
            child: {
              id: 2,
              bar: 'baz',
            },
            props: new Array(0, 1, 2),
          },
          dataModel = new DataModel(root);

    const rootProps = new Array<DataAttr>();
    dataModel.visitProperties(root, (item, attr) => { rootProps.push(attr)});
    expect(rootProps.toString()).toBe('id,childId,foo,child,props');
  });
  test('visitChildren, visitSubtree', () => {
    const child: any = { id: 1000 },
          grandchild: any = {},
          child0: any = { grandchild: grandchild },
          child1: any = {},
          root: any = {
            child: child,
            children: new Array(child0, child1),  // two unidentified children and grandchild
          },
          dataModel = new DataModel(root);
    const children = new Array<object>();
    dataModel.visitChildren(root, (item) => { children.push(item)});
    expect(children).toEqual(
        new Array<object>(child, child0, child1));
    const descendants = new Array<object>();
    dataModel.visitSubtree(root, (item) => { descendants.push(item)});
    expect(descendants).toEqual(
        new Array<object>(root, child, child0, grandchild, child1));
  });
  test('initializers', () => {
    const root: any = {},
          dataModel = new DataModel(root),
          initializer = (item: any) => item.initialized = true,
          item: any = {};
    dataModel.addInitializer(initializer);
    dataModel.initialize(item);
    expect(item.initialized).toBe(true);
  });
});

//------------------------------------------------------------------------------

describe('EventBase', () => {
  test('addHandler, removeHandler, onEvent', () => {
    let count = 0;
    const eventBase = new EventBase<() => void, string>(),
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

describe('ObservableModel', () => {
  test('changeValue', () => {
    let changes = 0,
        valueChanges = 0,
        elementsInserted = 0,
        elementsRemoved = 0,
        received = new Array<Change>();
    const observableModel = new ObservableModel(),
          onChange = (arg: Change) => { received.push(arg), changes++; },
          onValueChange = (arg: Change) =>  { received.push(arg); valueChanges++; },
          onInsertElement = (arg: Change) => { received.push(arg); elementsInserted++; },
          onRemoveElement = (arg: Change) => { received.push(arg); elementsRemoved++; };
    const root: any = {
            val: 'foo',
            child: {
              val: 'bar',
            },
            children: [],
          },
          child2: any = {};

    observableModel.addHandler('changed', onChange);
    observableModel.addHandler('valueChanged', onValueChange);
    observableModel.changeValue(root.child, 'val', 'baz');
    expect(changes).toBe(1);
    expect(valueChanges).toBe(1);

    observableModel.addHandler('elementInserted', onInsertElement);
    observableModel.insertElement(root, 'children', 0, child2);
    expect(changes).toBe(2);
    expect(valueChanges).toBe(1);
    expect(elementsInserted).toBe(1);
    expect(elementsRemoved).toBe(0);

    observableModel.addHandler('elementRemoved', onRemoveElement);
    expect(observableModel.removeElement(root, 'children', 0)).toBe(child2);
    expect(changes).toBe(3);
    expect(valueChanges).toBe(1);
    expect(elementsInserted).toBe(1);
    expect(elementsRemoved).toBe(1);
  });
});

//------------------------------------------------------------------------------

describe('ReferenceModel', () => {
  test('constructor', () => {
    const root: any = {
            child: {
              id: 1000,
            },
            children: new Array({}, {}),  // two unidentified children
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel);
    // TODO add more tests for references.
    expect(dataModel.getId(root.child)).toBe(1000);  // preserved
    expect(dataModel.getId(root)).toBe(1001);
    expect(dataModel.getId(root.children[0])).toBe(1002);
    expect(dataModel.getId(root.children[1])).toBe(1003);
  });
  test('assignId', () => {
    const root: any = {
            id: 1000,
            child: {
              id: 1020,
            },
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel),
          child2: any = {};
    expect(referenceModel.assignId(child2)).toBe(1021);
  });
  test('isReference', () => {
    const root: any = {
            id: 1,
            childId: 2,
            foo: 'foo',
            child: {
              id: 2,
            }
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel);

    expect(referenceModel.isReference(root, 'foo')).toBe(false);
    expect(referenceModel.isReference(root, 'bar')).toBe(false);
    expect(referenceModel.isReference(root, 'childId')).toBe(true);
    expect(referenceModel.isReference(root.child, 'id')).toBe(false);
  });
  test('visitReferences', () => {
    const root: any = {
            id: 1,
            childId: 2,
            fooId: 3,
            child: {
              id: 2,
              bar: 'baz',
            },
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel);

    const rootRefs = new Array<DataAttr>();
    referenceModel.visitReferences(root, (item, attr) => { rootRefs.push(attr)});
    expect(rootRefs.toString()).toBe('childId,fooId');
  });
  test('reference tracking', () => {
    // Default data model references end with 'Id'.
    const child1 = { id: 2, refId: 1 },
          child2 = { id: 3, refId: 1 },
          child3 = { id: 4, firstId: 1, secondId: 3 },
          root = {
            id: 1,
            child: null,
            items: [
              child1,
            ],
          },

          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel);

    expect(referenceModel.getReference(child1, 'refId')).toBe(root);
    expect(referenceModel.getReferenceFn('refId')(child1)).toBe(root);
    expect(referenceModel.getReference(child1, 'refId')).toBe(
           referenceModel.resolveId(child1.refId));

    observableModel.changeValue(root, 'child', child2);
    expect(referenceModel.getReference(child2, 'refId')).toBe(root);

    observableModel.changeValue(child2, 'refId', 2);
    expect(referenceModel.getReference(child2, 'refId')).toBe(child1);

    observableModel.insertElement(root, 'items', root.items.length - 1, child3);
    expect(referenceModel.getReference(child3, 'firstId')).toBe(root);
    expect(referenceModel.getReferenceFn('firstId')(child3)).toBe(root);
    expect(referenceModel.getReference(child3, 'secondId')).toBe(child2);
    expect(referenceModel.getReferenceFn('secondId')(child3)).toBe(child2);

    // unresolvable id causes ref to be set to 'null'.
    observableModel.changeValue(child2, 'refId', 88);
    expect(referenceModel.getReference(child2, 'refId')).toBeUndefined();
    expect(referenceModel.resolveId(child2.refId)).toBeUndefined();
  });
  test('getReferenceFn', () => {
    // Default data model references end with 'Id'.
    const root = {},
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          referenceModel = new ReferenceModel(dataModel, observableModel);
    // Multiple invocations return the same function (cached).
    const fn = referenceModel.getReferenceFn('objectId');
    // The result of invoking the function on an object without the attribute is undefined.
    expect(fn({})).toBeUndefined();
    const fn2 = referenceModel.getReferenceFn('objectId');
    expect(fn).toBe(fn2);
  });
});

describe('HierarchyModel', () => {
  test('constructor', () => {
    const grandchildren = new Array({}, {}),
          child = { grandchildren },
          root = { child },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          hierarchyModel = new HierarchyModel(dataModel, observableModel);
    // Parents should be set.
    expect(hierarchyModel.getParent(root)).toBeUndefined();
    expect(hierarchyModel.getParent(child)).toBe(root);
    expect(hierarchyModel.getParent(grandchildren[0])).toBe(child);
    expect(hierarchyModel.getParent(grandchildren[1])).toBe(child);
  });
  test('updating', () => {
    const child: any = {
            children:[ {}, {} ],
          },
          root = {
            item: {},
            items: [],
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          hierarchyModel = new HierarchyModel(dataModel, observableModel);

    expect(hierarchyModel.getParent(child)).toBeUndefined();
    expect(hierarchyModel.getParent(child.children[0])).toBeUndefined();
    expect(hierarchyModel.getParent(child.children[1])).toBeUndefined();
    observableModel.insertElement(root, 'items', 0, child);
    expect(hierarchyModel.getParent(child)).toBe(root);
    expect(hierarchyModel.getParent(child.children[0])).toBe(child);
    expect(hierarchyModel.getParent(child.children[1])).toBe(child);
  });
  test('getLineage, getLowestCommonAncestor', () => {
    const child1 = {},
          child2 = {},
          child3 = { items: [ child1, child2 ] },
          root: any = {
            items: [ child3 ]
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          hierarchyModel = new HierarchyModel(dataModel, observableModel);

    expect(hierarchyModel.getLineage(root)).toEqual([ root ]);
    expect(hierarchyModel.getLowestCommonAncestor(root, root)).toBe(root);
    expect(hierarchyModel.getLineage(child1)).toEqual([ child1, child3, root ]);
    expect(hierarchyModel.getLowestCommonAncestor(root, child1)).toBe(root);
    expect(hierarchyModel.getLowestCommonAncestor(child3, child1)).toBe(child3);
    expect(hierarchyModel.getLowestCommonAncestor(child1, child2)).toBe(child3);
    expect(hierarchyModel.getLowestCommonAncestor(child3, child1, root)).toBe(root);
  });
});

describe('SelectionModel', () => {
  test('set, has, contents', () => {
    const child1 = {},
          child2 = {},
          child3 = { items: [ child1, child2 ] },
          root: any = {
            items: [ child3 ]
          },
          dataModel = new DataModel(root),
          observableModel = new ObservableModel(),
          hierarchyModel = new HierarchyModel(dataModel, observableModel),
          selectionModel = new SelectionModel(hierarchyModel);

    selectionModel.set(root);
    expect(selectionModel.contents()).toEqual([ root ]);
    expect(selectionModel.has(root)).toBe(true);
    expect(selectionModel.has(child3)).toBe(false);
    expect(selectionModel.lastSelected()).toBe(root);

    selectionModel.set([ child1, child2, child3 ]);
    expect(selectionModel.contents()).toEqual([ child1, child2, child3 ]);
    expect(selectionModel.has(root)).toBe(false);
    expect(selectionModel.has(child1)).toBe(true);
    expect(selectionModel.has(child2)).toBe(true);
    expect(selectionModel.has(child3)).toBe(true);
    expect(selectionModel.lastSelected()).toBe(child3);
  });
});

/*



QUnit.test("selectionModel extend", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  QUnit.assert.deepEqual(test, model.selectionModel);
  QUnit.assert.ok(test.isEmpty());
  QUnit.assert.ok(!test.lastSelected());
});

QUnit.test("selectionModel add", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  test.add('a');
  QUnit.assert.ok(!test.isEmpty());
  QUnit.assert.ok(test.contains('a'));
  QUnit.assert.deepEqual(test.contents(), ['a']);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
  test.add(['b', 'a', 'c']);
  QUnit.assert.deepEqual(test.contents(), ['c', 'a', 'b']);
  QUnit.assert.deepEqual(test.lastSelected(), 'c');
});

QUnit.test("selectionModel remove", function() {
  const model = { root: {} };
  const test = dataModels.selectionModel.extend(model);
  test.add(['b', 'a', 'c']);
  test.remove('c');
  QUnit.assert.deepEqual(test.contents(), ['a', 'b']);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
  test.remove('d');  // not selected
  QUnit.assert.deepEqual(test.contents(), ['a', 'b']);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
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
*/