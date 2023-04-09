import { SelectionSet } from './collections.js';

//------------------------------------------------------------------------------

// DataContextObject objects store data as a tree. Objects have properties and
// children, which are described by a template. The template is a list of property
// descriptors, which describe the normalized properties and children of an object,
// and make it possible to clone and serialize objects without custom code.

export interface DataContext {
  valueChanged(owner: DataContextObject, prop: ScalarPropertyTypes, oldValue: any) : void;
  elementInserted(owner: DataContextObject, prop: ArrayPropertyTypes, index: number) : void;
  elementRemoved(owner: DataContextObject, prop: ArrayPropertyTypes, index: number, oldValue: DataContextObject) : void;
  resolveReference(owner: DataContextObject, prop: ReferenceProp) : ReferencedObject | undefined;
  construct(typeName: string) : DataContextObject;
}

export interface DataContextObject {
  readonly template: DataObjectTemplate;
  readonly context: DataContext;
}

export interface DataObjectTemplate {
  readonly typeName: string;
  readonly properties: Array<PropertyTypes>;
  readonly idProp?: IdProp;
}

export interface ReferencedObject extends DataContextObject {
  readonly id: number;
}

//------------------------------------------------------------------------------

export interface List<T = any> {
  length: number;
  at: (index: number) => T;
  append(element: T) : void;
  insert(element: T, index: number) : void;
  indexOf(element: T) : number;
  remove(element: T) : number;
  removeAt(index: number) : T;
  asArray() : T[];
  forEach(visitor: (element: T) => void) : void;
  forEachReverse(visitor: (element: T) => void) : void;
}

// Internal, non-type safe implementation of List<T>.
class DataList implements List {
  private owner: DataContextObject;
  private prop: ChildArrayProp;

  private get array() : any[] | undefined {
    return (this.owner as any)[this.prop.internalName];
  }
  private set array(value: any[] | undefined) {
    (this.owner as any)[this.prop.internalName] = value;
  }

  get length() : number {
    const array = this.array;
    return array ? array.length : 0;
  }
  at(index: number) : any {
    const array = this.array;
    if (!array || array.length <= index)
      throw new RangeError('Index out of range: ' + index);
    return array[index];
  }
  insert(element: any, index: number) {
    let array = this.array;
    if (!array) {
      // Set the internal value to an empty array, which is equivalent to
      // undefined, so don't notify any observers.
      this.array = array = [];
    }
    array.splice(index, 0, element);
    this.owner.context.elementInserted(this.owner, this.prop, index);
  }
  append(element: any) {
    this.insert(element, this.length);
  }
  indexOf(element: any) : number {
    const array = this.array;
    return array ? array.indexOf(element) : -1;
  }
  removeAt(index: number) : any {
    const array = this.array;
    if (!array || array.length <= index)
      throw new RangeError('Index out of range: ' + index);
    const oldValue = array.splice(index, 1);
    this.owner.context.elementRemoved(this.owner, this.prop, index, oldValue[0]);
    return oldValue[0];
  }
  remove(element: any) : number {
    const index = this.indexOf(element);
    if (index >= 0)
      this.removeAt(index);
    return index;
  }
  asArray(): Array<any> {
    return this.array || [];
  }
  forEach(visitor: (element: any) => void) : void {
    const array = this.array;
    if (!array)
      return;
    array.forEach(visitor);
  };
  forEachReverse(visitor: (element: any) => void) : void {
    const array = this.array;
    if (!array)
      return;
    for (let i = array.length - 1; i >= 0; --i) {
      visitor(array[i]);
    }
  }

  constructor(owner: DataContextObject, prop: ChildArrayProp) {
    this.owner = owner;
    this.prop = prop;
  }
}

//------------------------------------------------------------------------------

// Simple property descriptors.

export type ScalarPropertyTypes = ScalarProp | ReferenceProp;
export type ArrayPropertyTypes = ChildArrayProp;
export type PropertyTypes = ScalarPropertyTypes | ArrayPropertyTypes | IdProp;

export class ScalarProp {
  readonly name: string;
  readonly internalName: string;

  get(owner: DataContextObject) : any {
    return (owner as any)[this.internalName];
  }
  set(owner: DataContextObject, value: any) : any {
    const oldValue = (owner as any)[this.internalName];
    (owner as any)[this.internalName] = value;
    owner.context.valueChanged(owner, this, oldValue);
    return oldValue;
  }
  constructor(name: string) {
    this.name = name;
    this.internalName = '_' + name;
  }
}

export class ChildArrayProp<T extends DataContextObject = DataContextObject> {
  readonly name: string;
  readonly internalName: string;
  readonly cacheKey: symbol;

  get(owner: DataContextObject) : List<T> {
    let list = (owner as any)[this.cacheKey];
    if (!list) {
      list = new DataList(owner, this);
      (owner as any)[this.cacheKey] = list;
    }
    return list;
  }
  constructor(name: string) {
    this.name = name;
    this.internalName = '_' + name;
    this.cacheKey = Symbol.for(name);
  }
}

export class ReferenceProp {
  readonly name: string;
  readonly internalName: string;
  readonly cacheKey: symbol;

  private getRef(owner: DataContextObject) : ReferencedObject | undefined {
    return (owner as any)[this.cacheKey];
  }
  private setRef(owner: DataContextObject, value: ReferencedObject | undefined) {
    (owner as any)[this.cacheKey] = value;
  }

  get(owner: DataContextObject) : ReferencedObject | undefined {
    let value = this.getRef(owner);
    if  (value === undefined) {
      const id = this.getId(owner);
      if (id) {
        value = owner.context.resolveReference(owner, this);
        this.setRef(owner, value);
      }
    }
    return value;
  }
  set(owner: DataContextObject, value: ReferencedObject | undefined) : void {
    this.setRef(owner, value);
    const newId: number = value !== undefined ? value.id : 0;
    const oldValue = this.getId(owner);
    this.setId(owner, newId);
    owner.context.valueChanged(owner, this, oldValue);
  }
  getId(owner: DataContextObject) : number {
    return (owner as any)[this.internalName];
  }
  setId(owner: DataContextObject, id: number) : void {
    this.setRef(owner, undefined);
    (owner as any)[this.internalName] = id;
  }

  constructor(name: string) {
    this.name = name;
    this.internalName = '_' + name;
    this.cacheKey = Symbol.for(name);
  }
}

export class IdProp {
  readonly name: string;

  get(owner: DataContextObject) : number {
    return (owner as any)['id'];
  }
  setMap(owner: DataContextObject, target: DataContextObject, map: Map<number, ReferencedObject>) :
         ReferencedObject {
    const value = target as ReferencedObject;
    map.set(this.get(owner), value);
    return value;
  }
  constructor(name: string) {
    this.name = name;
  }
}

//------------------------------------------------------------------------------

// Cloning.

function copyItem(
    original: DataContextObject, context: DataContext, map: Map<number, ReferencedObject>) :
    DataContextObject {
  const copy = context.construct(original.template.typeName),
        properties = original.template.properties;
  for (let prop of properties) {
    if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
      prop.set(copy, prop.get(original));
    } else if (prop instanceof IdProp) {
      prop.setMap(original, copy, map);
    } else if (prop instanceof ChildArrayProp) {
      const originalList = prop.get(original),
      copyList = prop.get(copy);
      originalList.forEach(original => {
        const copy = copyItem(original, context, map);
        copyList.append(copy);
      });
    }
  }
  return copy;
}

function remapItem(copy: DataContextObject, map: Map<number, ReferencedObject>) {
  const properties = copy.template.properties;
  for (let prop of properties) {
    if (prop instanceof ChildArrayProp) {
      const list = prop.get(copy);
      list.forEach(copy => remapItem(copy, map));
    } else if (prop instanceof ReferenceProp) {
      const reference: ReferencedObject | undefined = prop.get(copy);
      if (reference) {
        const original = map.get(reference.id);
        if (original) {
          prop.set(copy, original);
        }
      }
    }
  }
}

export function copyItems(
  items: DataContextObject[], context: DataContext, map: Map<number, ReferencedObject> = new Map()) :
  DataContextObject[] {
  const copies = new Array<DataContextObject>();
  for (let item of items) {
    copies.push(copyItem(item, context, map));
  }
  for (let copy of copies)  {
    remapItem(copy, map);
  }
  return copies;
}

//------------------------------------------------------------------------------

// Serialization/Deserialization, via JSON.

function serializeItem(original: DataContextObject) : object {
  let result: any = {
    type: original.template.typeName,
  };
  for (let prop of original.template.properties) {
    if (prop instanceof ScalarProp) {
      const value = prop.get(original);
      if (value !== undefined)
        result[prop.name] = value;
    } else if (prop instanceof ReferenceProp) {
      const value = prop.getId(original);
      result[prop.name] = value;
    } else if (prop instanceof ChildArrayProp) {
      const originalList = prop.get(original),
            copyList = new Array<object>();
      result[prop.name] = copyList;
      originalList.forEach(child => {
        copyList.push(serializeItem(child));
      });
    }
  }
  return result;
}

export function Serialize(item: DataContextObject) : any {
  return serializeItem(item);
}

function deserializeItem(raw: any, context: DataContext) : DataContextObject {
  const type = raw.type,
        item = context.construct(type);
  for (let prop of item.template.properties) {
    if (prop instanceof ScalarProp) {
      const value = raw[prop.name];
      if (value !== undefined)
        prop.set(item, value);
    } else if (prop instanceof ReferenceProp) {
      const value = raw[prop.name] || 0;
      prop.setId(item, value);
    } else if (prop instanceof ChildArrayProp) {
      const rawList = raw[prop.name],
            list = prop.get(item);
      if (rawList) {
        for (let rawChild of rawList) {
          const child = deserializeItem(rawChild, context);
          list.append(child);
        }
      }
    }
  }
  return item;
}

export function Deserialize(raw: any, context: DataContext) : DataContextObject {
  return deserializeItem(raw, context);
}

//------------------------------------------------------------------------------

// Hierarchical structures.

export interface Parented<T> {
  readonly parent: T | undefined;
};

export function getLineage<T extends Parented<T>>(item: Parented<T> | undefined) {
  const lineage = new Array<Parented<T>>();
  while (item) {
    lineage.push(item);
    item = item.parent;
  }
  return lineage;
}

export function getHeight<T extends Parented<T>>(item: Parented<T> | undefined) {
  let height = 0;
  while (item) {
    height++;
    item = item.parent;
  }
  return height;
}

export function getLowestCommonAncestor<T extends Parented<T>>(
    ...items: Array<T>) : T | undefined {
  let lca = items[0];
  let heightLCA = getHeight(lca);
  for (let i = 1; i < items.length; i++) {
    let next = arguments[i];
    let nextHeight = getHeight(next);
    if (heightLCA > nextHeight) {
      while (heightLCA > nextHeight) {
        lca = lca.parent!;
        heightLCA--;
      }
    } else {
      while (nextHeight > heightLCA) {
        next = next.parent;
        nextHeight--;
      }
    }
    while (heightLCA && nextHeight && lca !== next) {
      lca = lca.parent!;
      next = next.parent;
      heightLCA--;
      nextHeight--;
    }
    if (heightLCA == 0 || nextHeight == 0) return undefined;
  }
  return lca;
}

interface SetLike<T> {
  has(item: T) : boolean;
}

export function ancestorInSet<T extends Parented<T>>(item: T, set: SetLike<T>) {
  let ancestor = item.parent;
  while (ancestor) {
    if (set.has(ancestor))
      return true;
    ancestor = ancestor.parent;
  }
  return false;
}

export function reduceToRoots<T extends Parented<T>>(items: Array<T>, set: SetLike<T>) : Array<T> {
  const roots = new Array();
  items.forEach(function(item: T) {
    if (!ancestorInSet(item, set)) {
      roots.push(item);
    }
  });
  return roots;
}

//------------------------------------------------------------------------------

// EventBase class.

type EventHandler<T> = (event: T) => void;
type EventHandlers<T> = Array<EventHandler<T>>;

export class EventBase<TArg, TEvents> {
  private events = new Map<TEvents, EventHandlers<TArg>>();

  addHandler(event: TEvents, handler: EventHandler<TArg>) {
    let list = this.events.get(event);
    if (!list) {
      list = new Array<EventHandler<TArg>>();
      this.events.set(event, list);
    }
    // No use case for multiple copies of one handler.
    const index = list.indexOf(handler);
    if (index < 0)
      list.push(handler);
  }
  removeHandler(event: TEvents, handler: EventHandler<TArg>) {
    let list = this.events.get(event);
    if (list) {
      const index = list.indexOf(handler);
      if (index >= 0)
        list.splice(index, 1);
    }
  }
  onEvent(event: TEvents, arg: TArg) {
    let list = this.events.get(event);
    if (list)
      list.forEach((handler) => handler(arg));
  }
}

//------------------------------------------------------------------------------

// Change events.

// export interface ValueChange {
//   item: DataContextObject;
//   prop: ScalarPropertyTypes;
//   index: number;
//   oldValue: any;
// }

// export class ValueChangeOp implements Operation {
//   private change: ValueChange;
//   undo() {
//     const change = this.change,
//           item = change.item,
//           prop = change.prop;
//     // value change can be its own inverse by swapping current and old values.
//     const oldValue = prop.get(item);
//     if (prop instanceof ScalarProp) {
//       prop.set(item, change.oldValue);
//       change.oldValue = oldValue;
//       item.context.valueChanged(item, prop, oldValue);
//     } else if (prop instanceof ReferenceProp) {
//       prop.set(item, change.oldValue);
//       change.oldValue = oldValue;
//       item.context.valueChanged(item, prop, oldValue);
//     }
//   }
//   redo() {
//     this.undo();
//   }
//   constructor(change: ValueChange) {
//     this.change = change;
//   }
// }

// export interface ChildElementChange {
//   type: 'elementInserted' | 'elementRemoved';
//   item: DataContextObject;
//   prop: ChildArrayProp;
//   index: number;
//   oldValue: DataContextObject | undefined;
// }

// export class ChildElementChangeOp implements Operation {
//   private change: ChildElementChange;
//   undo() {
//     const change = this.change,
//           item = change.item,
//           prop = change.prop;
//     if (change.type == 'elementInserted') {
//       const list = prop.get(item), index = change.index;
//       change.oldValue = list.at(index);
//       list.removeAt(index);
//       item.context.elementRemoved(item, prop, index, change.oldValue);
//       change.type = 'elementRemoved';
//     } else if (change.type == 'elementRemoved') {  // TODO something?
//       const list = prop.get(item), index = change.index;
//       list.insert(change.oldValue!, index);
//       item.context.elementInserted(item, prop, index);
//       change.type = 'elementInserted';
//     }
//   }
//   redo() {
//   }
// }

export type ChangeType = 'valueChanged' | 'elementInserted' | 'elementRemoved';
// Generic 'change' event.
export type ChangeEvents = 'changed' | ChangeType;

// Standard formats:
// 'valueChanged': item, attr, oldValue.
// 'elementInserted': item, attr, index.
// 'elementRemoved': item, attr, index, oldValue.
// TODO split into value and child array changes.
export interface Change<TOwner extends object = object, TValue = any> {
  type: ChangeType;
  item: TOwner;
  prop: PropertyTypes;
  index: number;
  oldValue: TValue;
}

//------------------------------------------------------------------------------

// Command pattern, transactions, and undo/redo.

export interface Operation {
  undo() : void;
  redo() : void;
}

class ChangeOp<TOwner extends DataContextObject> implements Operation {
  private change: Change<TOwner>;

  undo() {
    const change = this.change,
          item: TOwner = change.item,
          prop: PropertyTypes = change.prop;
    switch (change.type) {
      case 'valueChanged': {
        // value change can be its own inverse by swapping current and old values.
        const oldValue = prop.get(item);
        if (prop instanceof ScalarProp) {
          prop.set(item, change.oldValue);
          change.oldValue = oldValue;
          item.context.valueChanged(item, prop, oldValue);
        } else if (prop instanceof ReferenceProp) {
          prop.set(item, change.oldValue);
          change.oldValue = oldValue;
          item.context.valueChanged(item, prop, oldValue);
        }
        break;
      }
      case 'elementInserted': {
        if (prop instanceof ChildArrayProp) {
          const list = prop.get(item), index = change.index;
          change.oldValue = list.at(index);
          list.removeAt(index);
          item.context.elementRemoved(item, prop, index, change.oldValue);
          change.type = 'elementRemoved';
          }
        break;
      }
      case 'elementRemoved': {
        if (prop instanceof ChildArrayProp) {
          const list = prop.get(item), index = change.index;
          list.insert(change.oldValue, index);
          item.context.elementInserted(item, prop, index);
          change.type = 'elementInserted';
        }
        break;
      }
    }
  }
  redo() {
    // 'valueChanged' is a toggle, and we swap 'elementInserted' and
    // 'elementRemoved', so redo is the same as applying undo again.
    this.undo();
  }
  constructor(change: Change<TOwner>) {
    this.change = change;
  }
}

class SelectionOp implements Operation {
  private selectionSet: SelectionSet<DataContextObject>;
  private startingSelection: Array<DataContextObject>;
  private endingSelection: Array<DataContextObject>;

  undo() {
    this.selectionSet.set(this.startingSelection);
  }
  redo() {
    this.selectionSet.set(this.endingSelection);
  }
  constructor(selectionSet: SelectionSet<DataContextObject>,
              startingSelection: Array<any>,
              endingSelection: Array<any>) {
    this.selectionSet = selectionSet;
    this.startingSelection = startingSelection;
    this.endingSelection = endingSelection;
  }
}

export class CompoundOp implements Operation {
  readonly name: string;
  readonly ops: Array<Operation>;

  add(op: Operation) {
    this.ops.push(op);
  }
  undo() {
    for (let i = this.ops.length - 1; i >= 0; --i)
      this.ops[i].undo();
  }
  redo() {
    for (let op of this.ops)
      op.redo();
  }

  constructor(name: string) {
    this.name = name;
    this.ops = [];
  }
}

type TransactionEvent = 'transactionBegan' | 'transactionEnding' | 'transactionEnded' |
                        'transactionCancelled' | 'didUndo' | 'didRedo';

export class TransactionManager extends EventBase<CompoundOp, TransactionEvent> {
  private transaction?: CompoundOp;
  private snapshots = new Map<DataContextObject, object>();

  // Notifies observers that a transaction has started.
  beginTransaction(name: string) : CompoundOp {
    const transaction = new CompoundOp(name);
    this.transaction = transaction;
    this.snapshots = new Map<DataContextObject, object>();
    super.onEvent('transactionBegan', transaction);
    return transaction;
  }

  // Notifies observers that a transaction is ending. Observers should now
  // do any adjustments to make data valid, or cancel the transaction if
  // the data is in an invalid state.
  endTransaction() : CompoundOp {
    const transaction = this.transaction;
    if (!transaction)
      throw new Error('No transaction in progress.');
    super.onEvent('transactionEnding', transaction);
    this.snapshots.clear();
    this.transaction = undefined;
    super.onEvent('transactionEnded', transaction);
    return transaction;
  }

  // Notifies observers that a transaction was canceled and its operations
  // rolled back.
  cancelTransaction() {
    const transaction = this.transaction;
    if (!transaction)
      throw new Error('No transaction in progress.');
    this.undo(transaction);
    this.snapshots.clear();
    this.transaction = undefined;
    super.onEvent('transactionCancelled', transaction);
  }

  // Undoes the operations in the transaction.
  undo(transaction: CompoundOp) {
    // Roll back operations.
    transaction.undo();
    // TODO consider raising transaction ended event instead.
    super.onEvent('didUndo', transaction);
  }

  // Redoes the operations in the transaction.
  redo(transaction: CompoundOp) {
    // Roll forward changes.
    transaction.redo();
    // TODO consider raising transaction ended event instead.
    super.onEvent('didRedo', transaction);
  }

  getOldValue(item: DataContextObject, attr: string) : any {
    const snapshot = this.snapshots.get(item) || item;
    return (snapshot as any)[attr];
  }

  private getSnapshot(item: DataContextObject) : object {
    let snapshot = this.snapshots.get(item);
    if (!snapshot) {
      snapshot = {};
      this.snapshots.set(item, snapshot);
    }
    return snapshot;
  }
  private recordChange(change: Change<DataContextObject>) {
    if (!this.transaction)
      return;
    const op = new ChangeOp<DataContextObject>(change);
    this.transaction.add(op);
  }

  onChanged(change: Change<DataContextObject>) {
    if (!this.transaction)
      return;

    const item: DataContextObject = change.item,
          prop = change.prop;

    if (change.type === 'valueChanged') {
      // Coalesce value changes. Only record them the first time we observe
      // the (item, prop) change.
      const snapshot = this.getSnapshot(item);
      if (!snapshot.hasOwnProperty(prop.name)) {
        (snapshot as any)[prop.name] = change.oldValue;
        this.recordChange(change);
      }
    } else {
      if (change.type === 'elementInserted') {
        const snapshot = this.getSnapshot(item);
        item.template.properties.forEach((prop) => {
          const value = prop.get(item);
          (snapshot as any)[prop.name] = value;
        });
      }
      this.recordChange(change);
    }
  }
}

export class HistoryManager {
  private done: Array<CompoundOp> = [];
  private undone: Array<CompoundOp> = [];
  private transactionManager: TransactionManager;
  private selectionSet: SelectionSet<DataContextObject>;
  private startingSelection: Array<any> = [];

  getRedo() {
    const length = this.undone.length;
    return length > 0 ? this.undone[length - 1] : null;
  }

  getUndo() {
    const length = this.done.length;
    return length > 0 ? this.done[length - 1] : null;
  }

  redo() {
    const transaction = this.getRedo();
    if (transaction) {
      this.transactionManager.redo(transaction);
      this.done.push(this.undone.pop()!);
    }
  }

  undo() {
    const transaction = this.getUndo();
    if (transaction) {
      this.transactionManager.undo(transaction);
      this.undone.push(this.done.pop()!);
    }
  }

  onTransactionBegan_(op: CompoundOp) {
    const selectionSet = this.selectionSet;
    this.startingSelection = selectionSet.contents();
  }

  onTransactionEnding_(op: CompoundOp) {
    const selectionSet = this.selectionSet;
    const startingSelection = this.startingSelection || [];
    let endingSelection = selectionSet.contents();
    if (startingSelection.length === endingSelection.length &&
        startingSelection.every(function(element, i) {
          return element === endingSelection[i];
        })) {
      return;  // endingSelection and startingSelection are the same.
    }

    const selectionOp = new SelectionOp(selectionSet, startingSelection, endingSelection);
    op.add(selectionOp);
    this.startingSelection = [];
  }

  onTransactionEnded_(op: CompoundOp) {
    this.startingSelection = [];
    if (this.undone.length)
      this.undone = [];
    this.done.push(op);
  }

  onTransactionCancelled_(op: CompoundOp) {
    this.startingSelection = [];
  }

  constructor(transactionManager: TransactionManager, selectionSet: SelectionSet<DataContextObject>) {
    this.transactionManager = transactionManager;
    this.selectionSet = selectionSet;
    transactionManager.addHandler('transactionBegan', this.onTransactionBegan_.bind(this));
    transactionManager.addHandler('transactionEnding', this.onTransactionEnding_.bind(this));
    transactionManager.addHandler('transactionEnded', this.onTransactionEnded_.bind(this));
    transactionManager.addHandler('transactionCancelled', this.onTransactionCancelled_.bind(this));
  }
}
