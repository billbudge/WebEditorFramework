import {describe, expect, test} from '@jest/globals';
import * as Statecharts from '../examples/statecharts';

//------------------------------------------------------------------------------

describe('StatechartModel', () => {
  test('state interface', () => {
    const context = new Statecharts.StatechartContext(),
          state = context.newState();
    expect(state.type).toBe('state');
    expect(state.name).toBeUndefined();
    state.name = 'Test State';
    expect(state.name).toBe('Test State');
    state.name = undefined;
    expect(state.name).toBeUndefined();
    expect(state.id).toBe(1);
    expect(state.x).toBe(0);
    state.x = 10;
    expect(state.x).toBe(10);
  });
  test('pseudostate interface', () => {
    const context = new Statecharts.StatechartContext(),
          pseudostate = context.newPseudostate('start');

    expect(pseudostate.type).toBe('pseudostate');
    expect(pseudostate.id).toBe(1);
    expect(pseudostate.subtype).toBe('start');
    expect(pseudostate.x).toBe(0);
    pseudostate.x = 10;
    expect(pseudostate.x).toBe(10);
  });
  test('transition interface', () => {
    const context = new Statecharts.StatechartContext(),
          state1 = context.newState(),
          state2 = context.newState(),
          transition = context.newTransition(state1, state2);

    // console.log(transition);

    expect(transition.type).toBe('transition');
    transition.event = 'test event';
    expect(transition.event).toBe('test event');
    transition.event = undefined;
    expect(transition.event).toBeUndefined();
    expect(transition.src).toBe(state1);
    expect(transition.src).toBe(state1);  // twice to exercise reference caching.
    expect(transition.dst).toBe(state2);
    transition.dst = state1;
    expect(transition.dst).toBe(state1);
    transition.dst = undefined;
    expect(transition.dst).toBeUndefined();
  });
  test('statechart interface', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart();

    expect(statechart.type).toBe('statechart');
    expect(statechart.name).toBe('');
    statechart.name = 'Test Statechart';
    expect(statechart.name).toBe('Test Statechart');
    expect(statechart.x).toBe(0);
    statechart.x = 10;
    expect(statechart.x).toBe(10);
  });
  test('parent', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = context.newState(),
          childStatechart1 = context.newStatechart(),
          childState1 = context.newState();

    expect(statechart.parent).toBeUndefined();
    expect(state1.parent).toBeUndefined();
    expect(childState1.parent).toBeUndefined();
    expect(childStatechart1.parent).toBeUndefined();

    state1.statecharts.append(childStatechart1);
    childStatechart1.states.append(childState1);
    statechart.states.append(state1);

    expect(state1.parent).toBe(statechart);
    expect(childStatechart1.parent).toBe(state1);
    expect(childState1.parent).toBe(childStatechart1);
  });
});

// describe('StatechartModel', () => {
//   test('getGraphInfo', () => {
//     const statechart = newStatechart(),
//           model = NewTestModel(statechart),
//           statechartModel = model.statechartModel,
//           state1 = addItem(model, newState(), statechart) as Statecharts.State,
//           state2 = addItem(model, newState(), statechart) as Statecharts.State,
//           transition1 = addItem(model, newTransition(state1, state2), statechart);
//     let graph = statechartModel.getGraphInfo();
//     expect(graph.states.has(state1)).toBe(true);
//     expect(graph.states.has(state2)).toBe(true);
//     expect(graph.states.size).toBe(2);
//     expect(graph.statecharts.has(statechart)).toBe(true);
//     expect(graph.statecharts.size).toBe(1);
//     // QUnit.assert.deepEqual(graph.transitions.size, 1);
//     // expect(graph.interiorTransitions.has(transition1));
//     // QUnit.assert.deepEqual(graph.interiorTransitions.size, 1);
//     // QUnit.assert.deepEqual(graph.inTransitions.size, 0);
//     // QUnit.assert.deepEqual(graph.outTransitions.size, 0);

//     // const input = addItem(test, newState()),
//     //       output = addItem(test, newState()),
//     //       transition2 = addItem(test, newTransition(input, state1)),
//     //       transition3 = addItem(test, newTransition(state2, output));

//     // graph = test.getGraphInfo();
//     // expect(graph.statesAndStatecharts.has(state1));
//     // expect(graph.statesAndStatecharts.has(state2));
//     // expect(graph.statesAndStatecharts.has(input));
//     // expect(graph.statesAndStatecharts.has(output));
//     // QUnit.assert.deepEqual(graph.statesAndStatecharts.size, 5);
//     // expect(graph.interiorTransitions.has(transition1));
//     // expect(graph.interiorTransitions.has(transition2));
//     // expect(graph.interiorTransitions.has(transition3));
//     // QUnit.assert.deepEqual(graph.transitions.size, 3);
//     // QUnit.assert.deepEqual(graph.interiorTransitions.size, 3);
//     // QUnit.assert.deepEqual(graph.inTransitions.size, 0);
//     // QUnit.assert.deepEqual(graph.outTransitions.size, 0);
//   });
// });

// const statechartTests = (function () {
//   'use strict';



//   // Always construct the full EditingModel to make creating test data easier.
//   function newTest() {
//     let statechart = newStatechart();
//     let test = statecharts.editingModel.extend(statechart),
//         model = test.model;
//     statecharts.statechartModel.extend(statechart);
//     test.model.dataModel.initialize();

//     // Fake context, sufficient for tests.
//     const ctx = {
//       measureText: () => { return { width: 10, height: 10 }},
//       save: () => {},
//     };
//     model.renderer = new statecharts.Renderer(model);
//     model.renderer.begin(ctx);
//     return test;
//   }
// }

  /*

  function newTestEditingModel() {
    return newTest().model.editingModel;
  }

  function newTestStatechartModel() {
    return newTest().model.statechartModel;
  }

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
