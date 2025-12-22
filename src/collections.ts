type VisitorFunction<T> = (value: T) => void;
type CompareFunction<T> = (val1: T, val2: T) => number;

"use strict";

//------------------------------------------------------------------------------
// Linked list.

export class LinkedListNode<T> {
  constructor(value: T) {
    this.value = value;
  }
  next: LinkedListNode<T> | undefined = undefined;
  prev: LinkedListNode<T> | undefined = undefined;
  value: T;
}

export class LinkedList<T> {
  constructor() {
    this.clear();
  }
  private front_: LinkedListNode<T> | undefined = undefined;
  private back_: LinkedListNode<T> | undefined = undefined;
  private length_: number = 0;

  empty() : boolean {
    return this.length_ === 0;
  }
  length() : number {
    return this.length_;
  }
  front() : LinkedListNode<T> | undefined {
    return this.front_;
  }
  back() : LinkedListNode<T> | undefined {
    return this.back_;
  }

  pushBack(value: T | LinkedListNode<T>) : LinkedListNode<T> {
    return this.insertAfter(value);
  }

  pushFront(value: T | LinkedListNode<T>) : LinkedListNode<T> {
    return this.insertBefore(value);
  }

  popBack() : LinkedListNode<T> | undefined {
    const node = this.back_;
    return node ? this.remove(node) : undefined;
  }

  popFront() : LinkedListNode<T> | undefined {
    const node = this.front_;
    return node ? this.remove(node) : undefined;
  }

  remove(node: LinkedListNode<T>) : LinkedListNode<T> {
    if (node.next)
      node.next.prev = node.prev;
    else
      this.back_ = node.prev;
    if (node.prev)
      node.prev.next = node.next;
    else
      this.front_ = node.next;

    node.next = node.prev = undefined;
    this.length_ -= 1;
    return node;
  }

  insertAfter(value: T | LinkedListNode<T>, prev?: LinkedListNode<T>) : LinkedListNode<T> {
    const node = (value instanceof LinkedListNode) ? value : new LinkedListNode(value);
    if (prev === undefined)
      prev = this.back_;
    const next = prev ? prev.next : undefined;
    this.insert_(node, prev, next);
    return node;
  }

  insertBefore(value: T | LinkedListNode<T>, next?: LinkedListNode<T>) : LinkedListNode<T> {
    const node = (value instanceof LinkedListNode) ? value : new LinkedListNode(value);
    if (next === undefined)
      next = this.front_;
    const prev = next ? next.prev : undefined;
    this.insert_(node, prev, next);
    return node;
  }

  private insert_(node: LinkedListNode<T>,
                  prev: LinkedListNode<T> | undefined,
                  next: LinkedListNode<T> | undefined ) {
    if (prev)
      prev.next = node;
    else
      this.front_ = node;
    if (next)
      next.prev = node;
    else
      this.back_ = node;
    node.prev = prev;
    node.next = next;
    this.length_ += 1;
  }

  clear() {
    this.front_ = this.back_ = undefined;
    this.length_ = 0;
  }

  forEach(fn: VisitorFunction<T>) {
    let node = this.front_;
    while (node) {
      fn(node.value);
      node = node.next;
    }
  }

  forEachReverse(fn: VisitorFunction<T>) {
    let node = this.back_;
    while (node) {
      fn(node.value);
      node = node.prev;
    }
  }

  find(value: T) : LinkedListNode<T> | undefined {
    let node = this.front_;
    while (node) {
      if (value === node.value)
        return node;
      node = node.next;
    }
    return undefined;
  }
}

//------------------------------------------------------------------------------
// Queue, a simple queue implementation.
// The end of the queue is at the end of the backing array.
// The head of the queue is indicated by head_, limited by
// headLimit.

export class Queue<T> {
  private elements: T[] = [];
  private headIndex: number = 0;

  constructor() {
    // No longer need sliceMin as we're simplifying the reallocation strategy.
  }

  /**
   * Returns true if the queue is empty, false otherwise.
   */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  /**
   * Returns the number of elements in the queue.
   */
  get length(): number {
    return this.elements.length - this.headIndex;
  }

  /**
   * Adds an element to the back of the queue.
   * @param item The item to add to the queue.
   */
  enqueue(item: T): void {
    this.elements.push(item);
  }

  /**
   * Removes and returns the element at the front of the queue.
   * Returns undefined if the queue is empty.
   */
  dequeue(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }

    const item = this.elements[this.headIndex];
    this.headIndex++;

    // Optional: Reallocate array to free up memory if a significant portion
    // of the beginning is unused. This helps prevent the array from growing
    // indefinitely if many elements are dequeued. The threshold (e.g., half the array)
    // can be adjusted based on expected usage patterns and performance needs.
    // For most common cases, relying on JavaScript engine's optimizations is sufficient.
    const REALLOCATION_THRESHOLD = 1000; // Example threshold
    if (this.headIndex > REALLOCATION_THRESHOLD && this.headIndex > this.elements.length / 2) {
        this.elements = this.elements.slice(this.headIndex);
        this.headIndex = 0;
    }


    return item;
  }

  /**
   * Returns the element at the front of the queue without removing it.
   * Returns undefined if the queue is empty.
   */
  peek(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }
    return this.elements[this.headIndex];
  }

  /**
   * Clears all elements from the queue.
   */
  clear(): void {
    this.elements = [];
    this.headIndex = 0;
  }
}

//------------------------------------------------------------------------------

// Set that orders elements by the order in which they were added. Note that
// adding an element already in the set makes it the most recently added.

export class SelectionSet<T> {
  private list: LinkedList<T> = new LinkedList<T>();
  private map: Map<T, LinkedListNode<T>> = new Map<T, LinkedListNode<T>>();
  private length_: number = 0;

  empty() : boolean {
    return this.length_ === 0;
  }

  get length() : number {
    return this.length_;
  }

  has(element: T) : boolean {
    return this.map.has(element);
  }

  get lastSelected() : T | undefined {
    const last: LinkedListNode<T> | undefined = this.list.front();
    return last !== undefined ? last.value : undefined;
  }

  add(element: T) : boolean {
    let node = this.map.get(element);
    if (node) {
      this.list.remove(node);
      this.list.pushFront(node);
      return true;
    } else {
      node = this.list.pushFront(element);
      this.map.set(element, node);
      this.length_ += 1;
      return false;
    }
  }

  delete(element: T) : boolean {
    const node = this.map.get(element);
    if (node) {
      this.map.delete(element);
      this.list.remove(node);
      this.length_ -= 1;
      return true;
    }
    return false;
  }

  toggle(element: T) {
    if (this.has(element))
      this.delete(element);
    else
      this.add(element);
  }

  set(item: T | Array<T>) {
    this.clear();
    if (Array.isArray(item)) {
      for (let subItem of item)
        this.add(subItem);
    } else {
      this.add(item);
    }
  }

  clear() {
    this.list.clear();
    this.map.clear();
    this.length_ = 0;
  }

  contents() : Array<T> {
    const result = new Array<T>();
    this.forEachReverse(item => result.push(item));
    return result;
  }

  forEach(fn: VisitorFunction<T>) {
    return this.list.forEach(function(item) {
      fn(item);
    });
  }

  forEachReverse(fn: VisitorFunction<T>) {
    return this.list.forEachReverse(function(item) {
      fn(item);
    });
  }
}
//------------------------------------------------------------------------------
// Priority Queue.
export class PriorityQueue<T> {
  constructor(compareFn: CompareFunction<T>) {
    this.compareFn = compareFn;
  }
  private compareFn: CompareFunction<T>;
  private array: Array<T> = new Array<T>();

  empty() : boolean {
    return this.array.length === 0;
  }

  length() : number {
    return this.array.length;
  }

  front() : T | undefined {
    if (this.empty())
      return undefined;

    return this.array[0];
  }

  push(value: T) {
    const array = this.array,
          end = array.length;;
    array.push(value);
    this.siftUp();
  }

  pop() : T | undefined {
    const array = this.array;
    if (!array.length)
      return undefined;
    const result = array[0];
    const last:T = array.pop() as T;  // take the last element to avoid a hole in the last generation.
    if (array.length) {
      array[0] = last;
      this.siftDown(0);
    }
    return result;
  }

  assign(array: Array<T>) {
    this.array = array;
    this.heapify();
  }

  private heapify() {
    const array = this.array;
    let parent = Math.floor((array.length - 1) / 2);  // the last parent in the heap.
    while (parent >= 0) {
      this.siftDown(parent);
      parent--;
    }
  }

  private siftDown(parent: number) {
    const array = this.array;
    while (true) {
      const first = parent * 2 + 1;
      if (first >= array.length)
        break;
      const second = first + 1;
      let child = first;
      if (second < array.length && this.compareFn(array[first], array[second]) < 0) {
        child = second;
      }
      if (this.compareFn(array[parent], array[child]) >= 0)
        break;
      // swap parent and child and continue.
      [array[parent], array[child]] = [array[child], array[parent]];
      parent = child;
    }
  }

  private siftUp() {
    const array = this.array;
    let i = array.length - 1;
    while (i > 0) {
      const value = array[i],
            parentIndex = Math.floor(i / 2),
            parent = array[parentIndex];
      if (this.compareFn(parent, value) >= 0)
        break;
      array[i] = parent;
      array[parentIndex] = value;
      i = parentIndex;
    }
  }
}

//------------------------------------------------------------------------------
// PairSet.

export class PairSet<T, U> implements Iterable<[T, U]> {
  private map: Map<T, Set<U>> = new Map();
  private size_: number = 0;

  get size() : number {
    return this.size_;
  }
  has(t: T, u: U) : boolean {
    const subset = this.map.get(t);
    if (!subset) return false;
    return subset.has(u);
  }
  add(t: T, u: U) : void {
    let subset = this.map.get(t);
    if (!subset) {
      subset = new Set<U>();
      this.map.set(t, subset);
    }
    const size = subset.size;
    subset.add(u);
    if (size !== subset.size)
      this.size_++;
  }
  delete(t: T, u: U) : boolean {
    const subset = this.map.get(t);
    if (!subset) return false;
    const result = subset.delete(u);
    if (result)
      this.size_--;
    if (!subset.size)
      this.map.delete(t);
    return result;
  }
  clear() : void {
    this.map.clear();
    this.size_ = 0;
  }
  *[Symbol.iterator]() : Iterator<[T, U]> {
    function* gen(value: [T, U]) {
      yield value;
    }
    this.forEach((t: T, u: U) => gen([t, u]));
  }
  forEach(fn: (t: T, u: U) => void) : void {
    this.map.forEach((subset, t) => {
      subset.forEach(u => {
        fn(t, u);
      });
    });
  }
}

//------------------------------------------------------------------------------
// PairSet.

export class PairMap<T, U, V> implements Iterable<[[T, U], V]> {
  private map: Map<T, Map<U, V>> = new Map();
  private size_: number = 0;

  get size() : number {
    return this.size_;
  }
  has(t: T, u: U) : boolean {
    const submap = this.map.get(t);
    if (!submap) return false;
    return submap.has(u);
  }
  get(t: T, u: U) : V | undefined {
    const submap = this.map.get(t);
    if (!submap) return undefined;
    return submap.get(u);
  }
  set(t: T, u: U, v: V) : void {
    let submap = this.map.get(t);
    if (!submap) {
      submap = new Map<U, V>();
      this.map.set(t, submap);
    }
    const size = submap.size;
    submap.set(u, v);
    if (size !== submap.size)
      this.size_++;
  }
  delete(t: T, u: U) : boolean {
    const submap = this.map.get(t);
    if (!submap) return false;
    const result = submap.delete(u);
    if (result)
      this.size_--;
    if (!submap.size)
      this.map.delete(t);
    return result;
  }
  clear() : void {
    this.map.clear();
    this.size_ = 0;
  }
  *[Symbol.iterator]() : Iterator<[[T, U], V]> {
    function* gen(value: [T, U]) {
      yield value;
    }
    this.forEach((t: T, u: U) => gen([t, u]));
  }
  forEach(fn: (t: T, u: U, v: V) => void) : void {
    this.map.forEach((submap, t) => {
      submap.forEach((v, u) => {
        fn(t, u, v);
      });
    });
  }
}

//------------------------------------------------------------------------------
// Multimap associates multiple values with a single key. Use it when you want
// to associate a small number of values with each key.

export class Multimap<T, U> implements Iterable<[T, U]> {
  private map: Map<T, Array<U>> = new Map();
  private size_: number = 0;

  get size() : number {
    return this.size_;
  }
  has(t: T, u: U) : boolean {
    const values = this.map.get(t);
    if (!values) return false;
    return values.includes(u);
  }
  add(t: T, u: U) : void {
    let values = this.map.get(t);
    if (!values) {
      values = new Array<U>();
      this.map.set(t, values);
    }
    if (!values.includes(u)) {
      values.push(u);
      this.size_++;
    }
  }
  delete(t: T, u: U) : boolean {
    const values = this.map.get(t);
    if (!values) return false;
    const index = values.indexOf(u);
    if (index < 0) return false;
    values.splice(index, 1);
    this.size_--;
    return true;
  }
  clear() : void {
    this.map.clear();
    this.size_ = 0;
  }
  *[Symbol.iterator]() : Iterator<[T, U]> {
    function* gen(value: [T, U]) {
      yield value;
    }
    this.forAll((t: T, u: U) => gen([t, u]));
  }
  forValues(t: T, fn: (u: U) => void) {
    const values = this.map.get(t);
    if (!values) return;
    values.forEach(fn);
  }
  forAll(fn: (t: T, u: U) => void) : void {
    this.map.forEach((values, t) => {
      values.forEach(u => {
        fn(t, u);
      });
    });
  }
}

//------------------------------------------------------------------------------
// DisjointSet, a simple Union-Find implementation.

export class DisjointSubset<T> {
  constructor(item: T) {
    this.item = item;
    this.parent = this;
    this.rank = 0;
  }
  item: T;
  parent: DisjointSubset<T>;
  rank: number;
}

export class DisjointSet<T> {
  private _subsets: Array<DisjointSubset<T>> = new Array();

  makeSubset(item: T) : DisjointSubset<T> {
    const subset = new DisjointSubset<T>(item);
    this._subsets.push(subset);
    return subset;
  }
  getPartition(): Array<Array<DisjointSubset<T>>> {
    const reps = new Map<DisjointSubset<T>, Array<DisjointSubset<T>>>();
    for (let subset of this._subsets) {
      const rep = this.find(subset);
      let partition = reps.get(rep);
      if (!partition) {
        partition = new Array<DisjointSubset<T>>();
        reps.set(rep, partition);
      }
      partition.push(subset);
    }
    return Array.from(reps.values());
  }
  // makeSets(items: Array<T>) : Array<DisjointSetSubset<T>> {
  //   const subsets = new Array<DisjointSetSubset<T>>();
  //   for (let item of items) {
  //     subsets.push(this.makeSet(item));
  //   }
  //   return subsets;
  // }

  // Find the representative subset for the given item.
  find(subset: DisjointSubset<T>) : DisjointSubset<T> {
    // Path splitting rather than path compression for simplicity.
    while (subset.parent != subset) {
      const next = subset.parent;
      subset.parent = next.parent;
      subset = next;
    }
    return subset;
  }

  // Union the two given subsets. Returns the new representative subset.
  union(set1: DisjointSubset<T>, set2: DisjointSubset<T>) : DisjointSubset<T> {
    let root1 = this.find(set1),
        root2 = this.find(set2);

    if (root1 === root2)
      return root1;

    if (root1.rank < root2.rank) {
      // swap
      [root1, root2] = [root2, root1];
    }

    root2.parent = root1;
    if (root1.rank === root2.rank)
      root1.rank += 1;

    return root1;
  }
}
