// Collections tests.

import {describe, expect, test} from '@jest/globals';
import { LinkedList, Queue } from '../src/collections';

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
  test('remove', () => {
    const list = new LinkedList(),
          node1 = list.pushBack('a'),
          node2 = list.pushBack('b'),
          node3 = list.pushBack('c');
    expect(list.length()).toBe(3);
    expect(list.front()).toBe(node1);
    expect(list.back()).toBe(node3);
    expect(stringify(list)).toBe('abc');
    expect(list.remove(node2)).toBe(node2);
    expect(list.length()).toBe(2);
    expect(node1.next).toBe(node3);
    expect(node3.next).toBeUndefined();
    expect(stringify(list)).toBe('ac');
    expect(list.remove(node1)).toBe(node1);
    expect(list.length()).toBe(1);
    expect(list.front()).toBe(node3);
    expect(list.back()).toBe(node3);
    expect(stringify(list)).toBe('c');
    expect(list.remove(node3)).toBe(node3);
    expect(list.length()).toBe(0);
    expect(list.front()).toBeUndefined();
    expect(list.back()).toBeUndefined();
    expect(stringify(list)).toBe('');
  });
  test('clear', () => {
    const list = new LinkedList(),
          node1 = list.pushBack('a'),
          node2 = list.pushBack('b');
    list.clear();
    expect(list.length()).toBe(0);
    expect(stringify(list)).toBe('');
  });
  test('map and mapReverse', () => {
    const list = new LinkedList(),
          node1 = list.pushBack('a'),
          node2 = list.pushBack('b'),
          node3 = list.pushBack('c');
    let forward = '';
    list.forEach(item => { forward += item; });
    expect(forward).toBe('abc');
    let reverse = '';
    list.forEachReverse(item => { reverse += item; });
    expect(reverse).toBe('cba');
  });
  test('find', () => {
    const list = new LinkedList(),
          node1 = list.pushBack('a'),
          node2 = list.pushBack('b');
    expect(list.find('b')).toBe(node2);
  });
});

describe('Queue', () => {
  test('constructor', () => {
    const queue = new Queue();
    expect(queue.length()).toBe(0);
    expect(queue.empty());
    expect(queue.dequeue()).toBeUndefined();
  });
  test('enqueue and dequeue', () => {
    const queue = new Queue();
    expect(queue.enqueue(1)).toBe(queue);
    expect(queue.enqueue(2)).toBe(queue);
    expect(queue.enqueue(3)).toBe(queue);
    expect(queue.length()).toBe(3);
    expect(queue.dequeue()).toBe(1);
    expect(queue.length()).toBe(2);
    expect(queue.enqueue(4)).toBe(queue);
    expect(queue.length()).toBe(3);
    expect(queue.dequeue()).toBe(2);
    expect(queue.length()).toBe(2);
    expect(queue.dequeue()).toBe(3);
    expect(queue.length()).toBe(1);
    expect(queue.dequeue()).toBe(4);
    expect(queue.length()).toBe(0);
  });
  test('clear', () => {
    const queue = new Queue();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    queue.clear();
    expect(queue.length()).toBe(0);
    expect(queue.empty());
    expect(queue.dequeue()).toBeUndefined();
  });
});
/*


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


})();
*/