type VisitorFunction<T> = (value: T) => void;
type CompareFunction<T> = (val1: T, val2: T) => -1 | 0 | 1;

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
    return this.front_ === undefined ? undefined : this.front_;
  }
  back() : LinkedListNode<T> | undefined {
    return this.back_ === undefined ? undefined : this.back_;
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
    const node = (value instanceof LinkedListNode<T>) ? value : new LinkedListNode(value);
    if (typeof prev === 'undefined')
      prev = this.back_;
    const next = prev ? prev.next : undefined;
    this.insert_(node, prev, next);
    return node;
  }

  insertBefore(value: T | LinkedListNode<T>, next?: LinkedListNode<T>) : LinkedListNode<T> {
    const node = (value instanceof LinkedListNode<T>) ? value : new LinkedListNode(value);
    if (typeof next === 'undefined')
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
  constructor() {
    this.clear();
  }
  private array: Array<T>;
  private head: number;

  enqueue(item: T) : Queue<T> {
    this.array.push(item);
    return this;
  }

  dequeue() : T | undefined {
    const headLimit = 1000, // Size limit for unused portion
          sliceMin = 10;    // Minimum size to discard array

    let result: T | undefined = undefined;
    if (!this.empty()) {
      result = this.array[this.head];
      this.head++;
      if (this.head >= headLimit
          || this.head > sliceMin && this.head > this.array.length) {
        this.array = this.array.slice(this.head);
        this.head = 0;
      }
    }
    return result;
  }

  empty() {
    return this.array.length - this.head === 0;
  }
  length() : number {
    return this.array.length;
  }

  clear() {
    this.array = new Array<T>();
    this.head = 0;
  }
}

//------------------------------------------------------------------------------
// Set that orders elements by the order in which they were added. Note that
// adding an element already in the set makes it the most recently added.

export class SelectionSet<T> {
  constructor() {}
  private list: LinkedList<T> = new LinkedList<T>();
  private map: Map<T, LinkedListNode<T>> = new Map<T, LinkedListNode<T>>();
  private length_: number = 0;

  empty() : boolean {
    return this.length_ === 0;
  }
  length() : number {
    return this.length_;
  }

  contains(element: T) : boolean {
    return this.map.has(element);
  }

  lastSelected() : T | undefined {
    const last: LinkedListNode<T> | undefined = this.list.front();
    return last !== undefined ? last.value : undefined;
  }

  add(element: T) : boolean {
    let node = this.map.get(element);
    if (node) {
      this.list.remove(node);
      this.list.pushFront(node);
    } else {
      node = this.list.pushFront(element);
      this.map.set(element, node);
      this.length_ += 1;
    }
    return true;
  }

  remove(element: T) : boolean {
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
    if (this.contains(element))
      this.remove(element);
    else
      this.add(element);
  }

  clear() {
    this.list.clear();
    this.map.clear();
    this.length_ = 0;
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

  front() : T | undefined {
    return this.empty() ? undefined : this.array[0];
  }

  push(value: T) {
    const array = this.array,
          end = array.length;;
    array.push(value);
    [array[0], array[end]] = [array[end], array[0]];
    this.siftDown_(0);
  }

  pop() : T | undefined {
    const array = this.array;
    if (!array.length)
      return undefined;
    const result = array[0];
    const last:T = array.pop() as T;  // take the last element to avoid a hole in the last generation.
    if (array.length) {
      array[0] = last;
      this.siftDown_(0);
    }
    return result;
  }

  assign(array: Array<T>) {
    this.array = array;
    this.heapify_();
  }

  heapify_() {
    const array = this.array;
    let parent = Math.floor((array.length - 1) / 2);  // the last parent in the heap.
    while (parent >= 0) {
      this.siftDown_(parent);
      parent--;
    }
  }

  siftDown_(parent: number) {
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

  siftUp_() {
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
// DisjointSet, a simple Union-Find implementation.

export class DisjointSetSubset<T> {
  constructor(item: T) {
    this.item = item;
    this.parent = this;
    this.rank = 0;
  }
  item: T;
  parent: DisjointSetSubset<T>;
  rank: number;
}

export class DisjointSet<T> {
  constructor() {}
  private sets: Array<DisjointSetSubset<T>> = new Array();

  makeSet(item: T) : DisjointSetSubset<T> {
    const subset = new DisjointSetSubset<T>(item);
    this.sets.push(subset);
    return subset;
  }

  find(set: DisjointSetSubset<T>) {
    // Path splitting rather than path compression for simplicity.
    while (set.parent != set) {
      const next = set.parent;
      set.parent = next.parent;
      set = next;
    }
    return set;
  }

  union(set1: DisjointSetSubset<T>, set2: DisjointSetSubset<T>) {
   let root1 = this.find(set1),
       root2 = this.find(set2);

   if (root1 === root2)
       return;

   if (root1.rank < root2.rank) {
    // swap
    const temp = root1; root1 = root2; root2 = temp;
   }

   root2.parent = root1;
   if (root1.rank === root2.rank)
     root1.rank += 1;
  }
}
