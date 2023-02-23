import {describe, expect, test} from '@jest/globals';
import * as Data from '../src/dataModels';
import * as Statecharts from '../examples/statecharts';

// Statechart unit tests

function newStatechart() : Statecharts.Statechart {
  return {
    type: 'statechart',
    items: new Array<Statecharts.StatechartItem>(),
    name: 'test',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

  /*
    readonly type: 'statechart';
  readonly items: StatechartItem[];
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
*/


//------------------------------------------------------------------------------

describe('StatechartModel', () => {
  test('constructor', () => {
    const statechart = newStatechart(),
          dataModel = new Data.DataModel(statechart),
          observableModel = new Data.ObservableModel(),
          referenceModel = new Data.ReferenceModel(dataModel, observableModel),
          hierarchyModel = new Data.HierarchyModel(dataModel, observableModel),
          statechartModel = new Statecharts.StatechartModel(
            statechart, observableModel, hierarchyModel, referenceModel);

    expect(dataModel.root()).toBe(statechart);
  });
  // test('isProperty', () => {
  //   const root: any = {
  //           id: 1,
  //           foo: 'foo',
  //           child: {
  //             id: 2,
  //           }
  //         },
  //         dataModel = new t.DataModel(root);

  //   expect(dataModel.isProperty(root, 'foo')).toBe(true);
  //   expect(dataModel.isProperty(root, 'bar')).toBe(false);
  //   expect(dataModel.isProperty(root, 'id')).toBe(true);
  //   expect(dataModel.isProperty(root, 'child')).toBe(true);
  // });
});

const statechartTests = (function () {
  'use strict';


  let id = 1;
  function newState(x, y) {
    return {
      type: "state",
      id: id++,
      x: x || 0,
      y: y || 0,
    };
  }

  function newPseudoState(type, x, y) {
    return {
      type: type,
      x: x || 0,
      y: y || 0,
    };
  }

  function getId(item) {
    return item.id;
  }

  function newTransition(src, dst) {
    return {
      type: 'transition',
      srcId: getId(src),
      dstId: getId(dst),
    }
  }

  // Always construct the full EditingModel to make creating test data easier.
  function newTest() {
    let statechart = newStatechart();
    let test = statecharts.editingModel.extend(statechart),
        model = test.model;
    statecharts.statechartModel.extend(statechart);
    test.model.dataModel.initialize();

    // Fake context, sufficient for tests.
    const ctx = {
      measureText: () => { return { width: 10, height: 10 }},
      save: () => {},
    };
    model.renderer = new statecharts.Renderer(model);
    model.renderer.begin(ctx);
    return test;
  }
}

  /*

  function newTestEditingModel() {
    return newTest().model.editingModel;
  }

  function newTestStatechartModel() {
    return newTest().model.statechartModel;
  }

  function addItem(test, state, parent) {
      const editingModel = test.model.editingModel,
            newItem = editingModel.newItem(state),
            result = editingModel.addItem(newItem, parent);
      return result;
    }

  QUnit.test("statecharts.statechartModel.extend", function() {
    let test = newTestStatechartModel();
    QUnit.assert.ok(test);
    QUnit.assert.ok(test.model);
    QUnit.assert.ok(test.model.referencingModel);
  });

  QUnit.test("statecharts.statechartModel.extend", function() {
    let test = newTestStatechartModel();
    QUnit.assert.ok(test);
    QUnit.assert.ok(test.model);
    QUnit.assert.ok(test.model.referencingModel);
  });

  QUnit.test("statecharts.statechartModel.getGraphInfo", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          transition1 = addItem(test, newTransition(state1, state2));
    let graph;

    graph = test.getGraphInfo([state1, state2]);
    QUnit.assert.ok(graph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(graph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(graph.statesAndStatecharts.size, 3);
    QUnit.assert.deepEqual(graph.transitions.size, 1);
    QUnit.assert.ok(graph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(graph.interiorTransitions.size, 1);
    QUnit.assert.deepEqual(graph.inTransitions.size, 0);
    QUnit.assert.deepEqual(graph.outTransitions.size, 0);

    const input = addItem(test, newState()),
          output = addItem(test, newState()),
          transition2 = addItem(test, newTransition(input, state1)),
          transition3 = addItem(test, newTransition(state2, output));

    graph = test.getGraphInfo();
    QUnit.assert.ok(graph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(graph.statesAndStatecharts.has(state2));
    QUnit.assert.ok(graph.statesAndStatecharts.has(input));
    QUnit.assert.ok(graph.statesAndStatecharts.has(output));
    QUnit.assert.deepEqual(graph.statesAndStatecharts.size, 5);
    QUnit.assert.ok(graph.interiorTransitions.has(transition1));
    QUnit.assert.ok(graph.interiorTransitions.has(transition2));
    QUnit.assert.ok(graph.interiorTransitions.has(transition3));
    QUnit.assert.deepEqual(graph.transitions.size, 3);
    QUnit.assert.deepEqual(graph.interiorTransitions.size, 3);
    QUnit.assert.deepEqual(graph.inTransitions.size, 0);
    QUnit.assert.deepEqual(graph.outTransitions.size, 0);
  });

  QUnit.test("statecharts.statechartModel.getSubgraphInfo", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          transition1 = addItem(test, newTransition(state1, state2));
    let subgraph;

    subgraph = test.getSubgraphInfo([state1, state2]);
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(subgraph.statesAndStatecharts.size, 2);
    QUnit.assert.ok(subgraph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(subgraph.transitions.size, 1);
    QUnit.assert.deepEqual(subgraph.interiorTransitions.size, 1);
    QUnit.assert.deepEqual(subgraph.inTransitions.size, 0);
    QUnit.assert.deepEqual(subgraph.outTransitions.size, 0);

    const input = addItem(test, newState()),
          output = addItem(test, newState()),
          transition2 = addItem(test, newTransition(input, state1)),
          transition3 = addItem(test, newTransition(state2, output));

    subgraph = test.getSubgraphInfo([state1, state2]);
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state1));
    QUnit.assert.ok(subgraph.statesAndStatecharts.has(state2));
    QUnit.assert.deepEqual(subgraph.statesAndStatecharts.size, 2);
    QUnit.assert.ok(subgraph.interiorTransitions.has(transition1));
    QUnit.assert.deepEqual(subgraph.transitions.size, 3);
    QUnit.assert.deepEqual(subgraph.interiorTransitions.size, 1);
    QUnit.assert.ok(subgraph.inTransitions.has(transition2));
    QUnit.assert.deepEqual(subgraph.inTransitions.size, 1);
    QUnit.assert.ok(subgraph.outTransitions.has(transition3));
    QUnit.assert.deepEqual(subgraph.outTransitions.size, 1);
  });

  function testIterator(fn, element, items) {
    const iterated = [];
    fn(element, (item) => iterated.push(item));
    QUnit.assert.deepEqual(items, iterated);
  }

  QUnit.test("statecharts.statechartModel.iterators", function() {
    const test = newTestStatechartModel(),
          model = test.model,
          items = model.root.items,
          state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          transition1 = addItem(test, newTransition(state1, state2)),
          input = addItem(test, newState()),
          output = addItem(test, newState()),
          transition2 = addItem(test, newTransition(input, state1)),
          transition3 = addItem(test, newTransition(input, state2)),
          transition4 = addItem(test, newTransition(state2, output));

    const inputFn = test.forInTransitions.bind(test),
          outputFn = test.forOutTransitions.bind(test);
    testIterator(inputFn, input, []);
    testIterator(outputFn, input, [transition2, transition3]);
    testIterator(inputFn, state1, [transition2]);
    testIterator(outputFn, state1, [transition1]);
    testIterator(inputFn, state2, [transition1, transition3]);
    testIterator(outputFn, state2, [transition4]);
  });

  QUnit.test("statecharts.editingModel", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    QUnit.assert.ok(test);
    QUnit.assert.ok(model);
    QUnit.assert.ok(model.dataModel);
    QUnit.assert.ok(model.selectionModel);
  });

  function doInitialize(item) {
    item.initalized = true;
  }

  QUnit.test("statecharts.editingModel.newItem", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    model.dataModel.addInitializer(doInitialize);
    const item1 = newState();
    test.newItem(item1);
    QUnit.assert.ok(item1.id);
    QUnit.assert.ok(item1.initalized);
  });

  QUnit.test("statecharts.editingModel.addAndDeleteItems", function() {
    const test = newTestEditingModel(),
          model = test.model,
          statechart = model.root;
    // Add an item.
    const item1 = newState();
    test.newItem(item1);
    test.addItem(item1, model.root);
    QUnit.assert.deepEqual(model.root.items, [item1]);
    QUnit.assert.deepEqual(model.hierarchicalModel.getParent(item1), statechart);
    // Delete the item.
    test.deleteItem(item1);
    QUnit.assert.deepEqual(statechart.items, []);
  });

  QUnit.test("statecharts.editingModel.findChildStatechart", function() {
    let test = newTestEditingModel(),
        items = test.model.root.items,
        superState = addItem(test, newState()),
        state = newState(),
        transition = newTransition(state, state),
        start = newPseudoState('start');
    // Primitive state has no statechart.
    QUnit.assert.ok(test.findChildStatechart(superState, state) === -1);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === -1);
    // Add a child statechart.
    const statechart1 = test.findOrCreateChildStatechart(superState, state);
    // Can add state.
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === 0);
    statechart1.items.push(newState());
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === 0);
    // Add a start state.
    statechart1.items.push(newPseudoState('start'));
    QUnit.assert.ok(test.findChildStatechart(superState, state) === 0);
    QUnit.assert.ok(test.findChildStatechart(superState, start) === -1);
  });

  QUnit.test("statecharts.editingModel.canAddState", function() {
    const test = newTestEditingModel(),
          statechart = test.model.root,
          items = statechart.items,
          state1 = addItem(test, newState()),
          state2 = newState(),
          start = newPseudoState('start'),
          shallowHistory = newPseudoState('history'),
          deepHistory = newPseudoState('history*'),
          stop = newPseudoState('stop');

    QUnit.assert.ok(test.canAddState(state1, statechart));
    QUnit.assert.ok(test.canAddState(state2, statechart));
    QUnit.assert.ok(test.canAddState(start, statechart));
    QUnit.assert.ok(test.canAddState(shallowHistory, statechart));
    QUnit.assert.ok(test.canAddState(deepHistory, statechart));
    QUnit.assert.ok(test.canAddState(stop, statechart));
    // Test that there can be only one starting state.
    addItem(test, start);
    QUnit.assert.notOk(test.canAddState(newPseudoState('start'), statechart));
    QUnit.assert.ok(test.canAddState(shallowHistory, statechart));
    QUnit.assert.ok(test.canAddState(deepHistory, statechart));
    addItem(test, shallowHistory);
    QUnit.assert.ok(test.canAddState(deepHistory, statechart));
    // Test that there can be multiple stop states.
    addItem(test, stop);
    QUnit.assert.ok(test.canAddState(newPseudoState('stop'), statechart));
  });

  QUnit.test("statecharts.editingModel.isValidTransition", function() {
    const test = newTestEditingModel(),
          items = test.model.root.items,
          state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          start = addItem(test, newPseudoState('start')),
          stop = addItem(test, newPseudoState('stop')),
          shallowHistory = addItem(test, newPseudoState('history')),
          deepHistory = addItem(test, newPseudoState('history*'));

    // Test transitions within a statechart.
    QUnit.assert.notOk(test.isValidTransition(undefined, undefined));
    QUnit.assert.notOk(test.isValidTransition(state1, undefined));
    QUnit.assert.notOk(test.isValidTransition(undefined, state1));
    QUnit.assert.ok(test.isValidTransition(state1, state1));
    QUnit.assert.ok(test.isValidTransition(state1, state2));
    QUnit.assert.ok(test.isValidTransition(start, stop));
    QUnit.assert.notOk(test.isValidTransition(start, start));
    QUnit.assert.notOk(test.isValidTransition(stop, stop));
    QUnit.assert.notOk(test.isValidTransition(shallowHistory, shallowHistory));
    QUnit.assert.notOk(test.isValidTransition(deepHistory, deepHistory));
    QUnit.assert.notOk(test.isValidTransition(stop, state1));
    QUnit.assert.notOk(test.isValidTransition(state1, start));
    QUnit.assert.ok(test.isValidTransition(start, shallowHistory));
    QUnit.assert.ok(test.isValidTransition(start, deepHistory));

    // Convert state1 to a superstate with two sub-statecharts.
    const start1 = addItem(test, newPseudoState('start'), state1),
          statechart1 = state1.items[0],
          subState1 = addItem(test, newState(), statechart1),
          start2 = addItem(test, newPseudoState('start'), state1),
          statechart2 = state1.items[1],
          subState2 = addItem(test, newState(), statechart2),
          subHistory = addItem(test, newPseudoState('history'), state1);
    // No transitions between sibling statecharts.
    QUnit.assert.notOk(test.isValidTransition(start2, subState1));
    QUnit.assert.notOk(test.isValidTransition(start1, subState2));
    // No transitions from pseudo-state outside it's parent statechart.
    QUnit.assert.notOk(test.isValidTransition(start1, state2));
    QUnit.assert.notOk(test.isValidTransition(state2, start2));
    // Transitions are allowed from parent state to child state.
    QUnit.assert.ok(test.isValidTransition(state1, subHistory));
    QUnit.assert.ok(test.isValidTransition(state1, subState1));
  });

  QUnit.test("statecharts.editingModel.isValidStatechart", function() {
    const test = newTestEditingModel(),
          rootStatechart = test.model.root,
          items = test.model.root.items;
    // Empty statechart is valid.
    QUnit.assert.ok(test.isValidStatechart(rootStatechart));
    // Two states with a transition is valid.
    const state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          transition1 = addItem(test, newTransition(state1, state2));
    QUnit.assert.ok(test.isValidStatechart(rootStatechart));

    // One start and one stop state is valid.
    addItem(test, newPseudoState('start'));
    addItem(test, newPseudoState('stop'));
    QUnit.assert.ok(test.isValidStatechart(rootStatechart));

    // Multiple history pseudostates can be added.
    addItem(test, newPseudoState('history'));
    addItem(test, newPseudoState('history'));
    QUnit.assert.ok(test.isValidStatechart(rootStatechart));
    addItem(test, newPseudoState('history*'));
    addItem(test, newPseudoState('history*'));
    QUnit.assert.ok(test.isValidStatechart(rootStatechart));

    // Two start states is invalid.
    addItem(test, new newPseudoState('start'));
    QUnit.assert.notOk(test.isValidStatechart(rootStatechart));

    // TODO more tests.
  });

  QUnit.test("statecharts.editingModel.transitionConsistency", function() {
    const test = newTestEditingModel(),
          items = test.model.root.items,
          state1 = addItem(test, newState()),
          state2 = addItem(test, newState()),
          transition = addItem(test, newTransition(state1, state2));

    // Remove element and make sure dependent wire is also deleted.
    test.deleteItem(state1);
    test.makeConsistent();
    QUnit.assert.ok(!items.includes(transition));
  });

})();
*/
