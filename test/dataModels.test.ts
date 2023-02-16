// Collections tests.

import {describe, expect, test} from '@jest/globals';
import { Model, DataAttr, DataModel, EventBase, Change, ObservableModel } from '../src/dataModels';

'use strict';

//------------------------------------------------------------------------------
// DataModel tests.

describe('DataModels', () => {
  test('constructor', () => {
    const root: any = {
            child: {
              id: 1000,
            },
            children: new Array({}, {}),  // two unidentified children
          },
          dataModel = new DataModel(root),
          model: Model = {
            root: root,
            dataModel: dataModel,
          };
    expect(dataModel.root()).toBe(model.root);
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
          model: Model = {
            root: root,
            dataModel: dataModel,
          },
          child2: any = {};
    expect(dataModel.assignId(child2)).toBe(1021);
  });
  test('isProperty', () => {
    const root: any = {
            id: 1,
            foo: 'foo',
            child: {
              id: 2,
            }
          },
          dataModel = new DataModel(root),
          model: Model = {
            root: root,
            dataModel: dataModel,
          };

    expect(dataModel.isProperty(root, 'foo')).toBe(true);
    expect(dataModel.isProperty(root, 'bar')).toBe(false);
    expect(dataModel.isProperty(root, 'id')).toBe(false);
    expect(dataModel.isProperty(root, 'child')).toBe(true);
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
          model: Model = {
            root: root,
            dataModel: dataModel,
          };

    expect(dataModel.isReference(root, 'foo')).toBe(false);
    expect(dataModel.isReference(root, 'bar')).toBe(false);
    expect(dataModel.isReference(root, 'childId')).toBe(true);
    expect(dataModel.isReference(root.child, 'id')).toBe(false);
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
          dataModel = new DataModel(root),
          model: Model = {
            root: root,
            dataModel: dataModel,
          };

    const rootProps = new Array<DataAttr>();
    dataModel.visitProperties(root, (item, attr) => { rootProps.push(attr)});
    expect(rootProps.toString()).toBe('childId,foo,child,props');
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
          model: Model = {
            root: root,
            dataModel: dataModel,
          };

    const rootRefs = new Array<DataAttr>();
    dataModel.visitReferences(root, (item, attr) => { rootRefs.push(attr)});
    expect(rootRefs.toString()).toBe('childId,fooId');
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
          dataModel = new DataModel(root),
          model: Model = {
            root: root,
            dataModel: dataModel,
          };
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
          model: Model = {
            root: root,
            dataModel: dataModel,
          },
          initializer = (item: any) => item.initialized = true,
          item: any = {};
    dataModel.addInitializer(initializer);
    dataModel.initialize(item);
    expect(item.initialized).toBe(true);
  });
});

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

  });
});
/*

*/