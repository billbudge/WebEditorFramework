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

// I will refactor the PriorityQueue class in TypeScript with the following improvements:

// Use standard naming conventions: isEmpty instead of empty, size instead of length.
// Make compareFn a readonly property: Since it's provided in the constructor and shouldn't change.
// Use elements instead of array: For better clarity, as array is a common variable name.
// Simplify push and pop return types: push doesn't need to return the queue.
// Remove explicit new Array<T>(): Use [] for array initialization.
// Add JSDoc comments: For better documentation and IDE support.
// Refine siftUp and siftDown: Make them slightly more concise and clear.
// Provide a default compareFn: To allow for a min-heap by default if no custom comparison is provided (assuming T is comparable or has a reasonable default comparison). For a max-heap as in the original, the default compareFn should return a negative value if the first element is "smaller" (has lower priority) than the second. The original compareFn(a, b) < 0 for child = second and compareFn(parent, child) >= 0 for breaking the loop implies a max-heap where larger values have higher priority. I will maintain this behavior.
// Here's the refactored PriorityQueue class:

// TypeScript

/**
 * A function that compares two elements and returns:
 * - A negative number if `a` is considered "less than" `b` (lower priority).
 * - Zero if `a` and `b` are considered "equal".
 * - A positive number if `a` is considered "greater than" `b` (higher priority).
 *
 * For a max-heap (where larger values have higher priority),
 * if `a` should come before `b` (i.g. `a` has higher priority) then `compareFn(a, b)` should be positive.
 * If `a` has lower priority, `compareFn(a, b)` should be negative.
 *
 * Example for a max-heap of numbers: (a, b) => a - b;
 * Example for a min-heap of numbers: (a, b) => b - a;
 */
// export type CompareFunction<T> = (a: T, b: T) => number;

// export class PriorityQueue<T> {
//   private readonly compareFn: CompareFunction<T>;
//   private elements: T[] = [];

//   /**
//    * Creates a new PriorityQueue.
//    * @param compareFn A function that defines the priority order.
//    * For a max-heap (default behavior of this implementation),
//    * `compareFn(a, b)` should return a positive number if `a` has higher priority than `b`,
//    * a negative number if `a` has lower priority than `b`, and zero if they have equal priority.
//    * Defaults to a max-heap for numbers if no function is provided.
//    */
//   constructor(compareFn?: CompareFunction<T>) {
//     // Default to a max-heap for numbers if no custom compare function is provided.
//     // This assumes T can be compared numerically.
//     this.compareFn = compareFn || ((a: T, b: T) => (a as any) - (b as any));
//   }

//   /**
//    * Returns true if the priority queue is empty, false otherwise.
//    */
//   get isEmpty(): boolean {
//     return this.elements.length === 0;
//   }

//   /**
//    * Returns the number of elements in the priority queue.
//    */
//   get size(): number {
//     return this.elements.length;
//   }

//   /**
//    * Returns the element with the highest priority without removing it.
//    * Returns undefined if the priority queue is empty.
//    */
//   front(): T | undefined {
//     if (this.isEmpty) {
//       return undefined;
//     }
//     return this.elements[0];
//   }

//   /**
//    * Adds a new element to the priority queue.
//    * @param value The element to add.
//    */
//   push(value: T): void {
//     this.elements.push(value);
//     this.siftUp();
//   }

//   /**
//    * Removes and returns the element with the highest priority.
//    * Returns undefined if the priority queue is empty.
//    */
//   pop(): T | undefined {
//     const elements = this.elements;
//     if (elements.length === 0) {
//       return undefined;
//     }

//     const result = elements[0];
//     const lastElement: T = elements.pop()!; // Guaranteed to exist if length > 0

//     if (elements.length > 0) {
//       elements[0] = lastElement;
//       this.siftDown(0);
//     }
//     return result;
//   }

//   /**
//    * Replaces the current elements with a new array and rebuilds the heap.
//    * @param newElements The new array of elements.
//    */
//   assign(newElements: T[]): void {
//     this.elements = [...newElements]; // Create a shallow copy to avoid modifying the original array passed in
//     this.heapify();
//   }

//   /**
//    * Builds a heap from the current elements array.
//    */
//   private heapify(): void {
//     const n = this.elements.length;
//     // Start from the last parent node and go up to the root.
//     for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
//       this.siftDown(i);
//     }
//   }

//   /**
//    * Restores the heap property by moving an element down the heap.
//    * @param index The index of the element to sift down.
//    */
//   private siftDown(index: number): void {
//     const n = this.elements.length;
//     const elements = this.elements;
//     let parentIndex = index;

//     while (true) {
//       const leftChildIndex = 2 * parentIndex + 1;
//       const rightChildIndex = 2 * parentIndex + 2;
//       let highestPriorityChildIndex = parentIndex;

//       // Check left child
//       if (leftChildIndex < n && this.compareFn(elements[leftChildIndex], elements[highestPriorityChildIndex]) > 0) {
//         highestPriorityChildIndex = leftChildIndex;
//       }

//       // Check right child
//       if (rightChildIndex < n && this.compareFn(elements[rightChildIndex], elements[highestPriorityChildIndex]) > 0) {
//         highestPriorityChildIndex = rightChildIndex;
//       }

//       if (highestPriorityChildIndex === parentIndex) {
//         // Parent is already greater than or equal to its children (heap property satisfied)
//         break;
//       }

//       // Swap parent with the child that has higher priority
//       [elements[parentIndex], elements[highestPriorityChildIndex]] = [elements[highestPriorityChildIndex], elements[parentIndex]];
//       parentIndex = highestPriorityChildIndex; // Continue sifting down from the child's new position
//     }
//   }

//   /**
//    * Restores the heap property by moving the last element up the heap.
//    */
//   private siftUp(): void {
//     const elements = this.elements;
//     let childIndex = elements.length - 1;

//     while (childIndex > 0) {
//       const parentIndex = Math.floor((childIndex - 1) / 2); // Calculate parent index
//       // If child has higher priority than parent, swap them
//       if (this.compareFn(elements[childIndex], elements[parentIndex]) > 0) {
//         [elements[childIndex], elements[parentIndex]] = [elements[parentIndex], elements[childIndex]];
//         childIndex = parentIndex; // Move up to the parent's old position
//       } else {
//         // Heap property is satisfied, stop sifting up
//         break;
//       }
//     }
//   }
// }

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
