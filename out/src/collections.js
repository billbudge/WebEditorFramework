"use strict";
//------------------------------------------------------------------------------
// Linked list.
export class LinkedListNode {
    constructor(value) {
        this.next = undefined;
        this.prev = undefined;
        this.value = value;
    }
}
export class LinkedList {
    constructor() {
        this.front_ = undefined;
        this.back_ = undefined;
        this.length_ = 0;
        this.clear();
    }
    empty() {
        return this.length_ === 0;
    }
    length() {
        return this.length_;
    }
    front() {
        return this.front_;
    }
    back() {
        return this.back_;
    }
    pushBack(value) {
        return this.insertAfter(value);
    }
    pushFront(value) {
        return this.insertBefore(value);
    }
    popBack() {
        const node = this.back_;
        return node ? this.remove(node) : undefined;
    }
    popFront() {
        const node = this.front_;
        return node ? this.remove(node) : undefined;
    }
    remove(node) {
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
    insertAfter(value, prev) {
        const node = (value instanceof LinkedListNode) ? value : new LinkedListNode(value);
        if (prev === undefined)
            prev = this.back_;
        const next = prev ? prev.next : undefined;
        this.insert_(node, prev, next);
        return node;
    }
    insertBefore(value, next) {
        const node = (value instanceof LinkedListNode) ? value : new LinkedListNode(value);
        if (next === undefined)
            next = this.front_;
        const prev = next ? next.prev : undefined;
        this.insert_(node, prev, next);
        return node;
    }
    insert_(node, prev, next) {
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
    forEach(fn) {
        let node = this.front_;
        while (node) {
            fn(node.value);
            node = node.next;
        }
    }
    forEachReverse(fn) {
        let node = this.back_;
        while (node) {
            fn(node.value);
            node = node.prev;
        }
    }
    find(value) {
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
export class Queue {
    constructor() {
        this.elements = [];
        this.headIndex = 0;
        // No longer need sliceMin as we're simplifying the reallocation strategy.
    }
    /**
     * Returns true if the queue is empty, false otherwise.
     */
    get isEmpty() {
        return this.length === 0;
    }
    /**
     * Returns the number of elements in the queue.
     */
    get length() {
        return this.elements.length - this.headIndex;
    }
    /**
     * Adds an element to the back of the queue.
     * @param item The item to add to the queue.
     */
    enqueue(item) {
        this.elements.push(item);
    }
    /**
     * Removes and returns the element at the front of the queue.
     * Returns undefined if the queue is empty.
     */
    dequeue() {
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
    peek() {
        if (this.isEmpty) {
            return undefined;
        }
        return this.elements[this.headIndex];
    }
    /**
     * Clears all elements from the queue.
     */
    clear() {
        this.elements = [];
        this.headIndex = 0;
    }
}
//------------------------------------------------------------------------------
// Set that orders elements by the order in which they were added. Note that
// adding an element already in the set makes it the most recently added.
export class SelectionSet {
    constructor() {
        this.list = new LinkedList();
        this.map = new Map();
        this.length_ = 0;
    }
    empty() {
        return this.length_ === 0;
    }
    get length() {
        return this.length_;
    }
    has(element) {
        return this.map.has(element);
    }
    get lastSelected() {
        const last = this.list.front();
        return last !== undefined ? last.value : undefined;
    }
    add(element) {
        let node = this.map.get(element);
        if (node) {
            this.list.remove(node);
            this.list.pushFront(node);
            return true;
        }
        else {
            node = this.list.pushFront(element);
            this.map.set(element, node);
            this.length_ += 1;
            return false;
        }
    }
    delete(element) {
        const node = this.map.get(element);
        if (node) {
            this.map.delete(element);
            this.list.remove(node);
            this.length_ -= 1;
            return true;
        }
        return false;
    }
    toggle(element) {
        if (this.has(element))
            this.delete(element);
        else
            this.add(element);
    }
    set(item) {
        this.clear();
        if (Array.isArray(item)) {
            for (let subItem of item)
                this.add(subItem);
        }
        else {
            this.add(item);
        }
    }
    clear() {
        this.list.clear();
        this.map.clear();
        this.length_ = 0;
    }
    contents() {
        const result = new Array();
        this.forEachReverse(item => result.push(item));
        return result;
    }
    forEach(fn) {
        return this.list.forEach(function (item) {
            fn(item);
        });
    }
    forEachReverse(fn) {
        return this.list.forEachReverse(function (item) {
            fn(item);
        });
    }
}
//------------------------------------------------------------------------------
// Priority Queue.
export class PriorityQueue {
    constructor(compareFn) {
        this.array = new Array();
        this.compareFn = compareFn;
    }
    empty() {
        return this.array.length === 0;
    }
    length() {
        return this.array.length;
    }
    front() {
        if (this.empty())
            return undefined;
        return this.array[0];
    }
    push(value) {
        const array = this.array, end = array.length;
        ;
        array.push(value);
        this.siftUp();
    }
    pop() {
        const array = this.array;
        if (!array.length)
            return undefined;
        const result = array[0];
        const last = array.pop(); // take the last element to avoid a hole in the last generation.
        if (array.length) {
            array[0] = last;
            this.siftDown(0);
        }
        return result;
    }
    assign(array) {
        this.array = array;
        this.heapify();
    }
    heapify() {
        const array = this.array;
        let parent = Math.floor((array.length - 1) / 2); // the last parent in the heap.
        while (parent >= 0) {
            this.siftDown(parent);
            parent--;
        }
    }
    siftDown(parent) {
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
    siftUp() {
        const array = this.array;
        let i = array.length - 1;
        while (i > 0) {
            const value = array[i], parentIndex = Math.floor(i / 2), parent = array[parentIndex];
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
export class PairSet {
    constructor() {
        this.map = new Map();
        this.size_ = 0;
    }
    get size() {
        return this.size_;
    }
    has(t, u) {
        const subset = this.map.get(t);
        if (!subset)
            return false;
        return subset.has(u);
    }
    add(t, u) {
        let subset = this.map.get(t);
        if (!subset) {
            subset = new Set();
            this.map.set(t, subset);
        }
        const size = subset.size;
        subset.add(u);
        if (size !== subset.size)
            this.size_++;
    }
    delete(t, u) {
        const subset = this.map.get(t);
        if (!subset)
            return false;
        const result = subset.delete(u);
        if (result)
            this.size_--;
        if (!subset.size)
            this.map.delete(t);
        return result;
    }
    clear() {
        this.map.clear();
        this.size_ = 0;
    }
    *[Symbol.iterator]() {
        function* gen(value) {
            yield value;
        }
        this.forEach((t, u) => gen([t, u]));
    }
    forEach(fn) {
        this.map.forEach((subset, t) => {
            subset.forEach(u => {
                fn(t, u);
            });
        });
    }
}
//------------------------------------------------------------------------------
// PairSet.
export class PairMap {
    constructor() {
        this.map = new Map();
        this.size_ = 0;
    }
    get size() {
        return this.size_;
    }
    has(t, u) {
        const submap = this.map.get(t);
        if (!submap)
            return false;
        return submap.has(u);
    }
    get(t, u) {
        const submap = this.map.get(t);
        if (!submap)
            return undefined;
        return submap.get(u);
    }
    set(t, u, v) {
        let submap = this.map.get(t);
        if (!submap) {
            submap = new Map();
            this.map.set(t, submap);
        }
        const size = submap.size;
        submap.set(u, v);
        if (size !== submap.size)
            this.size_++;
    }
    delete(t, u) {
        const submap = this.map.get(t);
        if (!submap)
            return false;
        const result = submap.delete(u);
        if (result)
            this.size_--;
        if (!submap.size)
            this.map.delete(t);
        return result;
    }
    clear() {
        this.map.clear();
        this.size_ = 0;
    }
    *[Symbol.iterator]() {
        function* gen(value) {
            yield value;
        }
        this.forEach((t, u) => gen([t, u]));
    }
    forEach(fn) {
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
export class Multimap {
    constructor() {
        this.map = new Map();
        this.size_ = 0;
    }
    get size() {
        return this.size_;
    }
    has(t, u) {
        const values = this.map.get(t);
        if (!values)
            return false;
        return values.includes(u);
    }
    add(t, u) {
        let values = this.map.get(t);
        if (!values) {
            values = new Array();
            this.map.set(t, values);
        }
        if (!values.includes(u)) {
            values.push(u);
            this.size_++;
        }
    }
    delete(t, u) {
        const values = this.map.get(t);
        if (!values)
            return false;
        const index = values.indexOf(u);
        if (index < 0)
            return false;
        values.splice(index, 1);
        this.size_--;
        return true;
    }
    clear() {
        this.map.clear();
        this.size_ = 0;
    }
    *[Symbol.iterator]() {
        function* gen(value) {
            yield value;
        }
        this.forAll((t, u) => gen([t, u]));
    }
    forValues(t, fn) {
        const values = this.map.get(t);
        if (!values)
            return;
        values.forEach(fn);
    }
    forAll(fn) {
        this.map.forEach((values, t) => {
            values.forEach(u => {
                fn(t, u);
            });
        });
    }
}
//------------------------------------------------------------------------------
// DisjointSet, a simple Union-Find implementation.
export class DisjointSubset {
    constructor(item) {
        this.item = item;
        this.parent = this;
        this.rank = 0;
    }
}
export class DisjointSet {
    constructor() {
        this._subsets = new Array();
    }
    makeSubset(item) {
        const subset = new DisjointSubset(item);
        this._subsets.push(subset);
        return subset;
    }
    getPartition() {
        const reps = new Map();
        for (let subset of this._subsets) {
            const rep = this.find(subset);
            let partition = reps.get(rep);
            if (!partition) {
                partition = new Array();
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
    find(subset) {
        // Path splitting rather than path compression for simplicity.
        while (subset.parent != subset) {
            const next = subset.parent;
            subset.parent = next.parent;
            subset = next;
        }
        return subset;
    }
    // Union the two given subsets. Returns the new representative subset.
    union(set1, set2) {
        let root1 = this.find(set1), root2 = this.find(set2);
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
//# sourceMappingURL=collections.js.map