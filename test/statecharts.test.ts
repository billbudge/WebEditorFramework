import {describe, expect, test} from '@jest/globals';
import * as Statecharts from '../examples/statecharts';

function addState(statechart: Statecharts.Statechart) {
  const state = statechart.context.newState();
  statechart.states.append(state);
  return state;
}

function addPseudostate(statechart: Statecharts.Statechart, subtype: Statecharts.PseudostateSubtype) {
  const state = statechart.context.newPseudostate(subtype);
  statechart.states.append(state);
  return state;
}

function addTransition(
    statechart: Statecharts.Statechart, state1: Statecharts.StateTypes, state2: Statecharts.StateTypes) {
  const transition = statechart.context.newTransition(state1, state2);
  statechart.transitions.append(transition);
  return transition;
}

function setEquals(set1: Set<any>, set2: Array<any>) {
  expect(set1.size).toBe(set2.length);
  for (const item of set2) {
    expect(set1.has(item)).toBe(true);
  }
}

//------------------------------------------------------------------------------

describe('StatechartContext', () => {
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
  test('getGraphInfo', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = addState(statechart),
          state2 = addState(statechart),
          transition1 = addTransition(statechart, state1, state2);

    context.setRoot(statechart);

    const graph1 = context.getGraphInfo();

    setEquals(graph1.statecharts, [statechart]);
    setEquals(graph1.states, [state1, state2]);
    setEquals(graph1.transitions, [transition1]);

    const input = addState(statechart),
          output = addState(statechart),
          transition2 = addTransition(statechart, input, state1),
          transition3 = addTransition(statechart, state2, output);

    const graph2 = context.getGraphInfo();

    setEquals(graph2.statecharts, [statechart]);
    setEquals(graph2.states, [state1, state2, input, output]);
    setEquals(graph2.transitions, [transition1, transition2, transition3]);
    setEquals(graph2.interiorTransitions, [transition1, transition2, transition3]);
    setEquals(graph2.inTransitions, []);
    setEquals(graph2.outTransitions, []);
  });
  test('getSubgraphInfo', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = addState(statechart),
          state2 = addState(statechart),
          transition1 = addTransition(statechart, state1, state2);

    context.setRoot(statechart);

    const subgraph1 = context.getSubgraphInfo([state1, state2]);

    setEquals(subgraph1.statecharts, []);
    setEquals(subgraph1.states, [state1, state2]);
    setEquals(subgraph1.transitions, [transition1]);
    setEquals(subgraph1.interiorTransitions, [transition1]);
    setEquals(subgraph1.inTransitions, []);
    setEquals(subgraph1.outTransitions, []);

    const input = addState(statechart),
          output = addState(statechart),
          transition2 = addTransition(statechart, input, state1),
          transition3 = addTransition(statechart, state2, output);

    const subgraph2 = context.getSubgraphInfo([state1, state2]);

    setEquals(subgraph2.statecharts, []);
    setEquals(subgraph2.states, [state1, state2]);
    setEquals(subgraph2.transitions, [transition1, transition2, transition3]);
    setEquals(subgraph2.interiorTransitions, [transition1]);
    setEquals(subgraph2.inTransitions, [transition2]);
    setEquals(subgraph2.outTransitions, [transition3]);
  });
  test('iterators', () => {
    function testIterator(
        fn: (state: Statecharts.StateTypes, visitor: Statecharts.TransitionVisitor) => void,
        state: Statecharts.StateTypes,
        items: Array<Statecharts.Transition>) {
      const iterated = new Array<Statecharts.Transition>();
      fn(state, (t) => iterated.push(t));
      expect(items).toEqual(iterated);
    }
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = addState(statechart, ),
          state2 = addState(statechart, ),
          transition1 = addTransition(statechart, state1, state2),
          input = addState(statechart),
          output = addState(statechart),
          transition2 = addTransition(statechart, input, state1),
          transition3 = addTransition(statechart, input, state2),
          transition4 = addTransition(statechart, state2, output);

    const inputFn = context.forInTransitions.bind(context),
          outputFn = context.forOutTransitions.bind(context);
    testIterator(inputFn, input, []);
    testIterator(outputFn, input, [transition2, transition3]);
    testIterator(inputFn, state1, [transition2]);
    testIterator(outputFn, state1, [transition1]);
    testIterator(inputFn, state2, [transition1, transition3]);
    testIterator(outputFn, state2, [transition4]);
  });
  test('canAddState', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = context.newState(),
          state2 = context.newState(),
          start = context.newPseudostate('start'),
          shallowHistory = context.newPseudostate('history'),
          deepHistory = context.newPseudostate('history*'),
          stop = context.newPseudostate('stop');

    expect(context.canAddState(state1, statechart)).toBe(true);
    expect(context.canAddState(state2, statechart)).toBe(true);
    expect(context.canAddState(start, statechart)).toBe(true);
    expect(context.canAddState(shallowHistory, statechart)).toBe(true);
    expect(context.canAddState(deepHistory, statechart)).toBe(true);
    expect(context.canAddState(stop, statechart)).toBe(true);

    // Test that there can be only one starting state.
    statechart.states.append(start);
    expect(context.canAddState(context.newPseudostate('start'), statechart)).toBe(false);
    expect(context.canAddState(shallowHistory, statechart)).toBe(true);
    expect(context.canAddState(deepHistory, statechart)).toBe(true);
    statechart.states.append(shallowHistory);
    expect(context.canAddState(deepHistory, statechart)).toBe(true);
    // Test that there can be multiple stop states.
    statechart.states.append(stop);
    expect(context.canAddState(context.newPseudostate('stop'), statechart)).toBe(true);
  });
  test('canAddTransition', () => {
    const context = new Statecharts.StatechartContext(),
          statechart = context.newStatechart(),
          state1 = addState(statechart),
          state2 = addState(statechart),
          start = addPseudostate(statechart, 'start'),
          stop = addPseudostate(statechart, 'stop'),
          shallowHistory = addPseudostate(statechart, 'history'),
          deepHistory = addPseudostate(statechart, 'history*');

    context.setRoot(statechart);

    // Test transitions within a statechart.
    expect(context.isValidTransition(state1, state1)).toBe(true);
    expect(context.isValidTransition(state1, state2)).toBe(true);
    expect(context.isValidTransition(start, stop)).toBe(true);
    expect(context.isValidTransition(start, start)).toBe(false);
    expect(context.isValidTransition(stop, stop)).toBe(false);
    expect(context.isValidTransition(shallowHistory, shallowHistory)).toBe(false);
    expect(context.isValidTransition(deepHistory, deepHistory)).toBe(false);
    expect(context.isValidTransition(stop, state1)).toBe(false);
    expect(context.isValidTransition(state1, start)).toBe(false);
    expect(context.isValidTransition(start, shallowHistory)).toBe(true);
    expect(context.isValidTransition(start, deepHistory)).toBe(true);

    // // Convert state1 to a superstate with two sub-statecharts.
    // const start1 = addItem(test, newPseudoState('start'), state1),
    //       statechart1 = state1.items[0],
    //       subState1 = addItem(test, newState(), statechart1),
    //       start2 = addItem(test, newPseudoState('start'), state1),
    //       statechart2 = state1.items[1],
    //       subState2 = addItem(test, newState(), statechart2),
    //       subHistory = addItem(test, newPseudoState('history'), state1);
    // // No transitions between sibling statecharts.
    // QUnit.assert.notOk(test.isValidTransition(start2, subState1));
    // QUnit.assert.notOk(test.isValidTransition(start1, subState2));
    // // No transitions from pseudo-state outside it's parent statechart.
    // QUnit.assert.notOk(test.isValidTransition(start1, state2));
    // QUnit.assert.notOk(test.isValidTransition(state2, start2));
    // // Transitions are allowed from parent state to child state.
    // QUnit.assert.ok(test.isValidTransition(state1, subHistory));
    // QUnit.assert.ok(test.isValidTransition(state1, subState1));
  });
});

/*

  QUnit.test("statecharts.statechartModel.getSubgraphInfo", function() {
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
