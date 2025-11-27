// Collections tests.

import {describe, expect, test} from '@jest/globals';
import { LinkedList, Queue, PriorityQueue, SelectionSet, PairSet, Multimap,
         DisjointSet } from '../src/collections.js';

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
  test('pushBack, popBack', () => {
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
    expect(list.popBack()).toBe(node2);
    expect(list.popBack()).toBe(node1);
    expect(list.popBack()).toBeUndefined();
  });
  test('pushFront, popFront', () => {
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
    expect(list.popFront()).toBe(node2);
    expect(list.popFront()).toBe(node1);
    expect(list.popFront()).toBeUndefined();
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
          expect(list.find('d')).toBeUndefined();
        });
});

describe('Queue', () => {
  test('constructor', () => {
    const queue = new Queue();
    expect(queue.length).toBe(0);
    expect(queue.isEmpty);
    expect(queue.peek()).toBeUndefined();
    expect(queue.dequeue()).toBeUndefined();
  });
  test('enqueue and dequeue', () => {
    const queue = new Queue();
    queue.enqueue(1);
    expect(queue.length).toBe(1);
    expect(queue.isEmpty).toBe(false);
    expect(queue.peek()).toBe(1);
    queue.enqueue(2);
    expect(queue.length).toBe(2);
    expect(queue.peek()).toBe(1);
    expect(queue.dequeue()).toBe(1);
    expect(queue.length).toBe(1);
    expect(queue.peek()).toBe(2);
    expect(queue.dequeue()).toBe(2);
    expect(queue.length).toBe(0);
    expect(queue.isEmpty).toBe(true);
    expect(queue.peek()).toBeUndefined();
    expect(queue.dequeue()).toBeUndefined();
  });
  test('clear', () => {
    const queue = new Queue();
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    queue.clear();
    expect(queue.length).toBe(0);
    expect(queue.isEmpty).toBe(true);
    expect(queue.dequeue()).toBeUndefined();
  });
});

function pqCompareFn(a: number, b: number) {
  return a - b;
}

function pqInOrder(queue: PriorityQueue<number>) : string {
  const result = new Array<number>();
  while (!queue.empty()) {
    const item = queue.pop();
    if (item !== undefined)
      result.push(item);
  }
  return result.toString();
}

describe('PriorityQueue', () => {
  test('constructor', () => {
    const queue = new PriorityQueue(pqCompareFn);
    expect(queue.length()).toBe(0);
    expect(queue.empty());
    expect(queue.pop()).toBeUndefined();
    expect(pqInOrder(queue)).toBe([].toString());
  });
  test('assign', () => {
    const queue = new PriorityQueue(pqCompareFn);
    queue.push(0);
    queue.push(2);
    queue.push(1);
    queue.push(3);
    expect(queue.length()).toBe(4);
    expect(queue.empty()).toBe(false);
    expect(pqInOrder(queue)).toBe([3, 2, 1, 0].toString());
  });
  test('push', () => {
    const queue = new PriorityQueue(pqCompareFn);
    queue.push(1);
    expect(queue.length()).toBe(1);
    expect(queue.empty()).toBe(false);
    expect(queue.front()).toBe(1);
    queue.push(3);
    expect(queue.length()).toBe(2);
    expect(queue.front()).toBe(3);
    queue.push(4);
    expect(queue.length()).toBe(3);
    expect(queue.front()).toBe(4);
    queue.push(2);
    expect(queue.length()).toBe(4);
    expect(queue.front()).toBe(4);
    expect(pqInOrder(queue)).toBe([4, 3, 2, 1].toString());
  });
  test('pop', () => {
    const queue = new PriorityQueue(pqCompareFn);
    queue.assign([1, 4, 3, 1]);
    expect(queue.length()).toBe(4);
    expect(queue.empty()).toBe(false);
    expect(pqInOrder(queue)).toBe([4, 3, 1, 1].toString());
    expect(queue.pop()).toBeUndefined();
    expect(queue.front()).toBeUndefined();
  });
});

describe('SelectionSet', () => {
  test('constructor', () => {
    const selectionSet = new SelectionSet();
    expect(selectionSet.length).toBe(0);
    expect(selectionSet.empty());
    expect(selectionSet.lastSelected).toBe(undefined);
    expect(stringify(selectionSet)).toBe('')
  });
  test('add', () => {
    const selectionSet = new SelectionSet();
    expect(selectionSet.add('a')).toBe(false);
    expect(selectionSet.has('a')).toBe(true);
    selectionSet.add('b');
    expect(selectionSet.has('a')).toBe(true);
    expect(selectionSet.has('b')).toBe(true);
    expect(selectionSet.length).toBe(2);
    expect(selectionSet.empty()).toBe(false);
    expect(selectionSet.lastSelected).toBe('b');
    expect(stringify(selectionSet)).toBe('ba')
    expect(selectionSet.add('a')).toBe(true);
    expect(selectionSet.length).toBe(2);
    expect(selectionSet.lastSelected).toBe('a');
    expect(stringify(selectionSet)).toBe('ab')
  });
  test('delete', () => {
    const selectionSet = new SelectionSet();
    selectionSet.add('a');
    selectionSet.add('b');
    selectionSet.add('c');
    expect(selectionSet.length).toBe(3);
    expect(selectionSet.lastSelected).toBe('c');
    expect(stringify(selectionSet)).toBe('cba')
    selectionSet.delete('c');
    expect(selectionSet.length).toBe(2);
    expect(selectionSet.lastSelected).toBe('b');
    expect(stringify(selectionSet)).toBe('ba')
    selectionSet.delete('c');
    expect(stringify(selectionSet)).toBe('ba')
    selectionSet.delete('b');
    expect(selectionSet.length).toBe(1);
    expect(selectionSet.lastSelected).toBe('a');
    expect(stringify(selectionSet)).toBe('a')
  });
  test('toggle', () => {
    const selectionSet = new SelectionSet();
    selectionSet.toggle('a');
    expect(selectionSet.length).toBe(1);
    expect(selectionSet.lastSelected).toBe('a');
    expect(stringify(selectionSet)).toBe('a')
    selectionSet.toggle('a');
    expect(selectionSet.length).toBe(0);
    expect(selectionSet.lastSelected).toBe(undefined);
    expect(stringify(selectionSet)).toBe('')
  });
  test('set', () => {
    const selectionSet = new SelectionSet();
    selectionSet.set('a');
    expect(selectionSet.length).toBe(1);
    expect(selectionSet.lastSelected).toBe('a');
    expect(stringify(selectionSet)).toBe('a')
    selectionSet.set(['a', 'b', 'c']);
    expect(selectionSet.length).toBe(3);
    expect(selectionSet.lastSelected).toBe('c');
    expect(stringify(selectionSet)).toBe('cba')
  });
  test('contents', () => {
    const selectionSet = new SelectionSet();
    selectionSet.set(['a', 'b', 'c']);
    expect(selectionSet.contents()).toEqual(['a', 'b', 'c']);
    expect(selectionSet.contents().length).toBe(3);
  });
  test('forEach, forEachReverse', () => {
    const selectionSet = new SelectionSet();
    selectionSet.add('a');
    selectionSet.add('b');
    let forward = '';
    selectionSet.forEach(item => forward += item);
    expect(forward).toBe('ba');
    let reverse = '';
    selectionSet.forEachReverse(item => reverse += item);
    expect(reverse).toBe('ab');
  });
});

describe('PairSet', () => {
  test('constructor', () => {
    const pairSet = new PairSet<string, number>();
    expect(pairSet.size).toBe(0);
    let size = 0;
    pairSet.forEach(() => size++);
    expect(size).toBe(0);
  });
  test('add', () => {
    const pairSet = new PairSet<string, number>();
    pairSet.add('a', 1);
    expect(pairSet.size).toBe(1);
    expect(pairSet.has('a', 1)).toBe(true);
    pairSet.add('a', 1);
    expect(pairSet.size).toBe(1);
    pairSet.add('a', 2);
    expect(pairSet.size).toBe(2);
    pairSet.add('b', 1);
    expect(pairSet.size).toBe(3);
  });
  test('delete', () => {
    const pairSet = new PairSet<string, number>();
    pairSet.add('a', 1);
    pairSet.add('a', 2);
    pairSet.add('b', 1);
    expect(pairSet.size).toBe(3);
    expect(pairSet.delete('a', 1)).toBe(true);
    expect(pairSet.size).toBe(2);
    expect(pairSet.delete('a', 1)).toBe(false);
    expect(pairSet.size).toBe(2);
    expect(pairSet.delete('b', 1)).toBe(true);
    expect(pairSet.size).toBe(1);
    expect(pairSet.delete('a', 2)).toBe(true);
    expect(pairSet.size).toBe(0);
  });
  test('clear', () => {
    const pairSet = new PairSet<string, number>();
    pairSet.add('a', 1);
    pairSet.add('a', 2);
    pairSet.add('b', 1);
    expect(pairSet.size).toBe(3);
    pairSet.clear();
    expect(pairSet.size).toBe(0);
    expect(pairSet.has('a', 1)).toBe(false);
    expect(pairSet.has('a', 2)).toBe(false);
    expect(pairSet.has('b', 1)).toBe(false);
  });
  test('forEach', () => {
    const pairSet = new PairSet<string, number>(),
          testSet = new PairSet<string, number>();
    pairSet.add('a', 1);
    pairSet.add('a', 2);
    pairSet.add('b', 1);
    pairSet.forEach((t, u) => testSet.add(t, u));
    expect(testSet.size).toBe(3);
    expect(testSet.has('a', 1)).toBe(true);
    expect(testSet.has('a', 2)).toBe(true);
    expect(testSet.has('b', 1)).toBe(true);
  });
});

describe('Multimap', () => {
  test('constructor', () => {
    const multimap = new Multimap<string, number>();
    expect(multimap.size).toBe(0);
    let size = 0;
    multimap.forAll(() => size++);
    expect(size).toBe(0);
  });
  test('add', () => {
    const multimap = new Multimap<string, number>();
    multimap.add('a', 1);
    expect(multimap.size).toBe(1);
    expect(multimap.has('a', 1)).toBe(true);
    multimap.add('a', 1);
    expect(multimap.size).toBe(1);
    multimap.add('a', 2);
    expect(multimap.size).toBe(2);
    multimap.add('b', 1);
    expect(multimap.size).toBe(3);
  });
  test('delete', () => {
    const multimap = new Multimap<string, number>();
    multimap.add('a', 1);
    multimap.add('a', 2);
    multimap.add('b', 1);
    expect(multimap.size).toBe(3);
    expect(multimap.delete('a', 1)).toBe(true);
    expect(multimap.size).toBe(2);
    expect(multimap.delete('a', 1)).toBe(false);
    expect(multimap.size).toBe(2);
    expect(multimap.delete('b', 1)).toBe(true);
    expect(multimap.size).toBe(1);
    expect(multimap.delete('a', 2)).toBe(true);
    expect(multimap.size).toBe(0);
  });
  test('clear', () => {
    const multimap = new Multimap<string, number>();
    multimap.add('a', 1);
    multimap.add('a', 2);
    multimap.add('b', 1);
    expect(multimap.size).toBe(3);
    multimap.clear();
    expect(multimap.size).toBe(0);
    expect(multimap.has('a', 1)).toBe(false);
    expect(multimap.has('a', 2)).toBe(false);
    expect(multimap.has('b', 1)).toBe(false);
  });
  test('forEach', () => {
    const multimap = new Multimap<string, number>(),
          testSet = new Multimap<string, number>();
    multimap.add('a', 1);
    multimap.add('a', 2);
    multimap.add('b', 1);
    multimap.forAll((t, u) => testSet.add(t, u));
    expect(testSet.size).toBe(3);
    expect(testSet.has('a', 1)).toBe(true);
    expect(testSet.has('a', 2)).toBe(true);
    expect(testSet.has('b', 1)).toBe(true);
  });
});

describe('DisjointSet', () => {
  test('constructor', () => {
    const disjointSet = new DisjointSet();
    const a = disjointSet.makeSubset('a'),
          b = disjointSet.makeSubset('b'),
          c = disjointSet.makeSubset('c'),
          d = disjointSet.makeSubset('d');
    expect(disjointSet.find(a)).toBe(a);
    expect(disjointSet.find(a)).not.toBe(b);
    disjointSet.union(a, a);
    expect(disjointSet.find(a)).toBe(a);
    disjointSet.union(a, b);
    expect(disjointSet.find(b)).toBe(a);
    disjointSet.union(c, a);
    expect(disjointSet.find(a)).toBe(a);
    expect(disjointSet.find(b)).toBe(a);
    expect(disjointSet.find(c)).toBe(a);
    expect(disjointSet.find(d)).not.toBe(a);
    expect(disjointSet.find(d)).not.toBe(b);
    expect(disjointSet.find(d)).not.toBe(c);
  });
  test('union-find', () => {
    const disjointSet = new DisjointSet();
    const a = disjointSet.makeSubset('a'),
          b = disjointSet.makeSubset('b'),
          c = disjointSet.makeSubset('c'),
          d = disjointSet.makeSubset('d');
    disjointSet.union(a, b);
    expect(disjointSet.find(a)).toBe(disjointSet.find(b));
    disjointSet.union(c, d);
    expect(disjointSet.find(c)).toBe(disjointSet.find(d));
    // expect(stringify(disjointSet.getPartition()) == (stringify([[a, b], [c, d]])));  // TODO fix tostring or rework test.
    disjointSet.union(b, c);
    expect(disjointSet.find(a)).toBe(disjointSet.find(b));
    expect(disjointSet.find(a)).toBe(disjointSet.find(c));
    expect(disjointSet.find(a)).toBe(disjointSet.find(d));
    // expect(stringify(disjointSet.getPartition()) == (stringify([[a, b, c, d]])));
  });
  // test('makeSets', () => {
  //   const disjointSet = new DisjointSet();
  //   const abcd = disjointSet.makeSets(['a', 'b', 'c', 'd']);
  //   expect(disjointSet.find(abcd[0])).toBe(abcd[0]);
  // });
});
