// Collections tests.

import {describe, expect, test} from '@jest/globals';
import { LinkedListNode, LinkedList } from '../src/collections';

'use strict';

function stringify(iterable: any) {
  let result = '';
  iterable.forEach(function(item: any) {
    result += item;
  });
  return result;
}

//------------------------------------------------------------------------------
// LinkedList tests.

describe('LinkedList', () => {
  test('constructor', () => {
    const list = new LinkedList();
    expect(list.length()).toBe(0);
    expect(list.empty());
    expect(stringify(list)).toBe('');
  });
  test('pushBack', () => {
    const list = new LinkedList(),
          node1 = list.pushBack('a');
    expect(list.empty()).not.toBe(true);
    expect(list.length()).toBe(1);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node1);
    const node2 = list.pushBack('b');
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node2);
    expect(list.length()).toBe(2);
    expect(stringify(list)).toBe('ab');
  });
  test('pushFront', () => {
    const list = new LinkedList(),
          node1 = list.pushFront('a');
    expect(list.empty()).not.toBe(true);
    expect(list.length()).toBe(1);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node1);
    const node2 = list.pushFront('b');
    expect(list.front()).toBe(node2);
    expect(list.back()).toBe(node1);
    expect(list.length()).toBe(2);
    expect(stringify(list)).toBe('ba');
  });
  test('insertAfter', () => {
    const list = new LinkedList(),
          node1 = list.insertAfter('a');
    expect(list.empty()).not.toBe(true);
    expect(list.length()).toBe(1);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node1);
    const node2 = list.insertAfter('b', node1);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node2);
    expect(list.length()).toBe(2);
    expect(stringify(list)).toBe('ab');
  });
  test('insertBefore', () => {
    const list = new LinkedList(),
          node1 = list.insertBefore('a');
    expect(list.empty()).not.toBe(true);
    expect(list.length()).toBe(1);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node1);
    const node2 = list.insertBefore('b', node1);
    expect(list.front()).toBe(node2);
    expect(list.back()).toBe(node1);
    expect(list.length()).toBe(2);
    expect(stringify(list)).toBe('ba');
  });
});
/*

QUnit.test("LinkedList remove", function() {
  const test = new diagrammar.collections.LinkedList(),
        node1 = test.pushBack('a'),
        node2 = test.pushBack('b'),
        node3 = test.pushBack('c');
  QUnit.assert.deepEqual(test.length, 3);
  QUnit.assert.deepEqual(stringify(test), 'abc');
  QUnit.assert.deepEqual(test.remove(node2), node2);
  QUnit.assert.deepEqual(test.length, 2);
  QUnit.assert.deepEqual(stringify(test), 'ac');
  QUnit.assert.deepEqual(test.front, node1);
  QUnit.assert.deepEqual(node1.next, node3);
  QUnit.assert.deepEqual(node3.prev, node1);
  QUnit.assert.deepEqual(test.back, node3);
  QUnit.assert.deepEqual(test.remove(node1), node1);
  QUnit.assert.deepEqual(test.front, node3);
  QUnit.assert.deepEqual(test.back, node3);
  QUnit.assert.deepEqual(test.length, 1);
  QUnit.assert.deepEqual(stringify(test), 'c');
  QUnit.assert.deepEqual(test.remove(node3), node3);
  QUnit.assert.deepEqual(test.front, null);
  QUnit.assert.deepEqual(test.back, null);
  QUnit.assert.deepEqual(test.length, 0);
  QUnit.assert.deepEqual(stringify(test), '');
});

QUnit.test("LinkedList clear", function() {
  const test = new diagrammar.collections.LinkedList(),
        node1 = test.pushBack(),
        node2 = test.pushBack();
  test.clear();
  QUnit.assert.deepEqual(test.length, 0);
  QUnit.assert.deepEqual(stringify(test), '');
});

QUnit.test("LinkedList map and mapReverse", function() {
  const test = new diagrammar.collections.LinkedList(),
        node1 = test.pushBack('a'),
        node2 = test.pushBack('b'),
        node3 = test.pushBack('c');

  let forward = '';
  test.forEach(function(item) {
    forward += item;
  });
  QUnit.assert.deepEqual(forward, 'abc');
  let reverse = '';
  test.forEachReverse(function(item) {
    reverse += item;
  });
  QUnit.assert.deepEqual(reverse, 'cba');
});

QUnit.test("LinkedList find", function() {
  const test = new diagrammar.collections.LinkedList(),
        node1 = test.pushBack('a'),
        node2 = test.pushBack('b');

  QUnit.assert.deepEqual(test.find('b'), node2);
});

//------------------------------------------------------------------------------
// Queue tests, for both SimpleQueue and Queue.

QUnit.test("Queue basic operation", function() {
  const test = new diagrammar.collections.Queue();
  QUnit.assert.ok(test.empty());
  test.enqueue(1);
  test.enqueue(2);
  test.enqueue(3);
  QUnit.assert.strictEqual(test.dequeue(), 1);
  QUnit.assert.strictEqual(test.empty(), false);
  test.enqueue(4);
  QUnit.assert.strictEqual(test.dequeue(), 2);
  test.clear();
  QUnit.assert.strictEqual(test.empty(), true);
});

QUnit.test("Queue error operations", function() {
  const test = new diagrammar.collections.Queue();
  QUnit.assert.strictEqual(test.dequeue(), undefined);
});

QUnit.test("Queue enqueue dequeue", function() {
  const test = new diagrammar.collections.Queue();
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      test.enqueue(j);
    }
    for (let j = 0; j < 10; j++) {
      QUnit.assert.strictEqual(test.dequeue(), j);
    }
  }
});

//------------------------------------------------------------------------------
// PriorityQueue tests.

function pqCompareFn(a, b) {
  return a - b;
}

// Destroys queue.
function pqContents(queue) {
  const length = arguments.length - 1;
  for (let i = 0; i < length; i++) {
    if (queue.empty())
      return false;
    if (queue.pop() != arguments[i + 1])
      return false;
  }
  return true;
}

QUnit.test("PriorityQueue constructor", function() {
  const test1 = new diagrammar.collections.PriorityQueue(pqCompareFn);
  QUnit.assert.ok(test1.empty());

  const test2 = new diagrammar.collections.PriorityQueue(pqCompareFn, [1, 0, 2, 3]);
  QUnit.assert.ok(!test2.empty());
  QUnit.assert.ok(pqContents(test2, 3, 2, 1, 0));
});

QUnit.test("PriorityQueue push", function() {
  const test1 = new diagrammar.collections.PriorityQueue(pqCompareFn);
  test1.push(0);
  test1.push(2);
  test1.push(1);
  test1.push(3);
  QUnit.assert.ok(pqContents(test1, 3, 2, 1, 0));
});

QUnit.test("PriorityQueue pop", function() {
  const test1 = new diagrammar.collections.PriorityQueue(pqCompareFn);
  test1.push(0);
  test1.push(2);
  test1.push(1);
  test1.push(3);
  let value = test1.pop();
  QUnit.assert.strictEqual(value, 3);
  value = test1.pop();
  QUnit.assert.strictEqual(value, 2);
  value = test1.pop();
  QUnit.assert.strictEqual(value, 1);
  value = test1.pop();
  QUnit.assert.strictEqual(value, 0);
  QUnit.assert.ok(test1.empty());
});

//------------------------------------------------------------------------------
// SelectionSet tests.

QUnit.test("SelectionSet constructor", function() {
  const test = new diagrammar.collections.SelectionSet();
  QUnit.assert.deepEqual(test.length, 0);
  QUnit.assert.ok(test.empty());
  QUnit.assert.deepEqual(test.lastSelected(), undefined);
  QUnit.assert.deepEqual(stringify(test), '');
});

QUnit.test("SelectionSet add", function() {
  const test = new diagrammar.collections.SelectionSet();
  test.add('a');
  test.add('b');
  QUnit.assert.deepEqual(test.length, 2);
  QUnit.assert.deepEqual(test.lastSelected(), 'b');
  QUnit.assert.deepEqual(stringify(test), 'ba');
  test.add('a');
  QUnit.assert.deepEqual(test.length, 2);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
  QUnit.assert.deepEqual(stringify(test), 'ab');
});

QUnit.test("SelectionSet remove", function() {
  const test = new diagrammar.collections.SelectionSet();
  test.add('a');
  test.add('b');
  test.add('c');
  QUnit.assert.deepEqual(test.length, 3);
  QUnit.assert.deepEqual(test.lastSelected(), 'c');
  QUnit.assert.deepEqual(stringify(test), 'cba');
  test.remove('c');
  QUnit.assert.deepEqual(test.length, 2);
  QUnit.assert.deepEqual(test.lastSelected(), 'b');
  QUnit.assert.deepEqual(stringify(test), 'ba');
  test.remove('a');
  QUnit.assert.deepEqual(test.length, 1);
  QUnit.assert.deepEqual(test.lastSelected(), 'b');
  QUnit.assert.deepEqual(stringify(test), 'b');
});

QUnit.test("SelectionSet toggle", function() {
  const test = new diagrammar.collections.SelectionSet();
  test.toggle('a');
  QUnit.assert.deepEqual(test.length, 1);
  QUnit.assert.deepEqual(test.lastSelected(), 'a');
  test.toggle('a');
  QUnit.assert.deepEqual(test.length, 0);
  QUnit.assert.deepEqual(test.lastSelected(), undefined);
});

QUnit.test("SelectionSet map", function() {
  const test = new diagrammar.collections.SelectionSet();
  test.add('a');
  test.add('b');

  let forward = '';
  test.forEach(function(item) {
    forward += item;
  });
  QUnit.assert.deepEqual(forward, 'ba');
  let reverse = '';
  test.forEachReverse(function(item) {
    reverse += item;
  });
  QUnit.assert.deepEqual(reverse, 'ab');
});

QUnit.test("DisjointSet union find", function() {
  const test = new diagrammar.collections.DisjointSet();
  const a = test.makeSet('a'),
        b = test.makeSet('b'),
        c = test.makeSet('c'),
        d = test.makeSet('d');
  QUnit.assert.strictEqual(test.find(a), a);
  test.union(a, b);
  QUnit.assert.strictEqual(test.find(a), test.find(b));
  test.union(a, c);
  QUnit.assert.strictEqual(test.find(a), test.find(b));
  QUnit.assert.strictEqual(test.find(a), test.find(c));

  QUnit.assert.notStrictEqual(test.find(a), test.find(d));

  test.union(d, a);
  QUnit.assert.strictEqual(test.find(d), test.find(a));
});

QUnit.test("EmptyArray", function() {
  const test = diagrammar.collections.EmptyArray();
  QUnit.assert.strictEqual(test.length, 0);
  test.push('foo');
  QUnit.assert.strictEqual(test.length, 0);
  test.pop();
  QUnit.assert.strictEqual(test.length, 0);
});

QUnit.test("EmptySet", function() {
  const test = diagrammar.collections.EmptySet();
  QUnit.assert.strictEqual(test.size, 0);
  test.add('foo');
  QUnit.assert.strictEqual(test.size, 0);
});

})();
*/