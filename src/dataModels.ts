import { SelectionSet } from './collections.js';

//------------------------------------------------------------------------------

// DataContextObject objects store data as a tree. Objects have properties and
// children, which are described by a template. The template is a list of property
// descriptors, which describe the normalized properties and children of an object,
// and make it possible to clone and serialize objects without custom code.

export interface DataContext {
  valueChanged(owner: DataContextObject, prop: ScalarPropertyTypes, oldValue: any) : void;
  elementInserted(owner: DataContextObject, prop: ChildPropertyTypes, index: number) : void;
  elementRemoved(owner: DataContextObject, prop: ChildPropertyTypes, index: number, oldValue: DataContextObject) : void;
  resolveReference(owner: DataContextObject, prop: ReferenceProp) : ReferencedObject | undefined;
  construct(typeName: string) : DataContextObject;
}

export interface DataContextObject<T = any> {
  readonly template: DataObjectTemplate;
  readonly context: DataContext;
}

export interface DataObjectTemplate {
  readonly typeName: string;
  readonly properties: PropertyTypes[];
  readonly idProp?: IdProp;
}

export interface ReferencedObject extends DataContextObject {
  readonly id: number;
}

//------------------------------------------------------------------------------

// Simple property descriptors.

export type ScalarPropertyTypes = ScalarProp | ReferenceProp;
export type ChildPropertyTypes = ChildListProp | ChildSlotProp;
export type PropertyTypes = ScalarPropertyTypes | ChildPropertyTypes | IdProp;

export class ScalarProp {
  readonly name: string;
  readonly internalName: string;
  readonly defaultValue: any;

  get(owner: DataContextObject) : any {
    const value = (owner as any)[this.internalName];
    if (value === undefined)
      return this.defaultValue;
    return value;
  }
  set(owner: DataContextObject, value: any) : any {
    const oldValue = (owner as any)[this.internalName];
    (owner as any)[this.internalName] = value;  // TODO don't notify if the value isn't changed.
    owner.context.valueChanged(owner, this, oldValue);
    return oldValue;
  }
  constructor(name: string, defaultValue: any = undefined) {
    this.name = name;
    this.internalName = '_' + name;
    this.defaultValue = defaultValue;
  }
}

export interface List<T = any> {
  length: number;
  get: (index: number) => T;
  append(element: T) : void;
  insert(element: T, index: number) : void;
  indexOf(element: T) : number;
  includes(element: T) : boolean;
  remove(element: T) : number;
  removeAt(index: number) : T;
  asArray() : T[];
  forEach(visitor: (element: T) => void) : void;
  forEachReverse(visitor: (element: T) => void) : void;
}

// Internal implementation of List<T>.
class DataList implements List {
  private owner: DataContextObject;
  private prop: ChildListProp;
  private array = new Array<any>();

  get length() : number {
    return this.array.length;
  }
  get(index: number) : any {
    const array = this.array;
    if (array.length <= index)
      throw new RangeError('Index out of range: ' + index);
    return array[index];
  }
  insert(element: any, index: number) {
    this.array.splice(index, 0, element);
    this.owner.context.elementInserted(this.owner, this.prop, index);
  }
  append(element: any) {
    this.insert(element, this.length);
  }
  indexOf(element: any) : number {
    return this.array.indexOf(element);
  }
  includes(element: any) : boolean {
    return this.indexOf(element) >= 0;
  }
  removeAt(index: number) : any {
    if (this.array.length <= index)
      throw new RangeError('Index out of range: ' + index);
    const oldValue = this.array.splice(index, 1);
    this.owner.context.elementRemoved(this.owner, this.prop, index, oldValue[0]);
    return oldValue[0];
  }
  remove(element: any) : number {
    const index = this.indexOf(element);
    if (index >= 0)
      this.removeAt(index);
    return index;
  }
  asArray(): DataContextObject[] {
    return this.array;
  }
  forEach(visitor: (element: any) => void) : void {
    this.array.forEach(visitor);
  };
  forEachReverse(visitor: (element: any) => void) : void {
    const array = this.array;
    for (let i = array.length - 1; i >= 0; --i) {
      visitor(array[i]);
    }
  }

  constructor(owner: DataContextObject, prop: ChildListProp) {
    this.owner = owner;
    this.prop = prop;
  }
}

export class ChildListProp<T extends DataContextObject = DataContextObject> {
  readonly name: string;
  readonly internalName: string;
  readonly cacheKey: symbol;

  get(owner: DataContextObject) : List<T> {
    let list = (owner as any)[this.cacheKey];
    if (list === undefined) {
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

// TODO consider having multiple slots (making this a fixed size array).
export interface Slot<T = any> {
  get: (index: number) => T | undefined;
  set: (index: number, value: T | undefined) => T | undefined;
}

// Internal implementation of ChildSlot<T>.
// We notify changes using the elementInserted and elementRemoved methods of DataContext,
// so make slot look like a single element array.
class DataSlot<T extends DataContextObject = DataContextObject> implements Slot<T> {
  private owner: DataContextObject;
  private prop: ChildSlotProp;
  private slot: T | undefined;

  get(index: number) : T | undefined {
    if (index !== 0)
      throw new RangeError('Index out of range: ' + index);
    return this.slot;
  }
  set(index: number, value: T | undefined) : T | undefined {
    if (index !== 0)
      throw new RangeError('Index out of range: ' + index);
    const oldValue = this.slot;
    this.slot = value;
    if (value !== oldValue) {
      if (oldValue) {
        this.owner.context.elementRemoved(this.owner, this.prop, 0, oldValue);
      }
      if (value) {
        this.owner.context.elementInserted(this.owner, this.prop, 0);
      }
    }
    return oldValue;
  }

  constructor(owner: DataContextObject, prop: ChildSlotProp) {
    this.owner = owner;
    this.prop = prop;
  }
}

export class ChildSlotProp<T extends DataContextObject = DataContextObject> {
  readonly name: string;
  readonly internalName: string;
  readonly cacheKey: symbol;

  get(owner: DataContextObject) : Slot<T> {
    let slot = (owner as any)[this.cacheKey];
    if (slot === undefined) {
      slot = new DataSlot(owner, this);
      (owner as any)[this.cacheKey] = slot;
    }
    return slot;
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
    let ref = this.getRef(owner);
    if  (ref === undefined) {
      const id = this.getId(owner);
      if (id) {
        ref = owner.context.resolveReference(owner, this);
        this.setRef(owner, ref);
      }
    }
    return ref;
  }
  set(owner: DataContextObject, value: ReferencedObject | undefined) :
      ReferencedObject | undefined {
    const oldRef = this.get(owner);
    this.setRef(owner, value);
    const newId = (value !== undefined) ? value.id : 0;
    this.setId(owner, newId);
    owner.context.valueChanged(owner, this, oldRef);
    return oldRef;
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

// Isomorphism (equivalently, deepEquality).

function isomorphicHelper(item1: any, item2: any, visited: Map<any, any>) : boolean {
  if (item1 === item2)
    return true;
  if (item1 === undefined || item2  === undefined)
    return false;  // only 1 can be undefined.

  // |visited| is used to detect cycles.
  if (visited.get(item1) === item2)
    return true;
  visited.set(item1, item2);
  visited.set(item2, item1);

  if (item1.template !== item2.template)
    return false;
  for (let p of item1.template.properties) {
    if (p instanceof IdProp)
      continue;
    if (p instanceof ScalarProp && p.get(item1) !== p.get(item2)) {  // TODO move this onto the prop classes!
      return false;
    } else if (p instanceof ReferenceProp) {
      const ref1 = p.get(item1),
            ref2 = p.get(item2);
      if (ref1 === undefined)
        return ref2 === undefined;
      if (!isomorphicHelper(ref1, ref2, visited))
        return false;
    } else if (p instanceof ChildListProp) {
      const list1 = p.get(item1),
            list2 = p.get(item2);
      if (list1.length !== list2.length)
        return false;
      for (let i = 0; i < list1.length; ++i) {
        if (!isomorphicHelper(list1.get(i), list2.get(i), visited))
          return false;
      }
    } else if (p instanceof ChildSlotProp) {
      const slot1 = p.get(item1),
            slot2 = p.get(item2);
      if (!isomorphicHelper(slot1.get(0), slot2.get(0), visited))
        return false
    }
  }
  return true;
}

export function isomorphic(item1: any, item2: any) : boolean {
  return isomorphicHelper(item1, item2, new Map<any, any>());
}

//------------------------------------------------------------------------------

// Cloning.

function copyItem(
    original: DataContextObject, context: DataContext, map: Map<number, ReferencedObject>) :
    DataContextObject {
  const copy = context.construct(original.template.typeName),
        properties = original.template.properties;
  for (let prop of properties) {
    if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {  // TODO move this onto the prop classes!
      prop.set(copy, prop.get(original));
    } else if (prop instanceof IdProp) {
      prop.setMap(original, copy, map);
    } else if (prop instanceof ChildListProp) {
      const originalList = prop.get(original),
      copyList = prop.get(copy);
      originalList.forEach(original => {
        const copy = copyItem(original, context, map);
        copyList.append(copy);
      });
    } else if (prop instanceof ChildSlotProp) {
      const originalChild = prop.get(original).get(0),
            copySlot = prop.get(copy);
      if (originalChild) {
        const copyChild = copyItem(originalChild, context, map);
        copySlot.set(0, copyChild);
      }
    }
  }
  return copy;
}

function remapItem(copy: DataContextObject, map: Map<number, ReferencedObject>) {
  const properties = copy.template.properties;
  for (let prop of properties) {
    if (prop instanceof ChildListProp) {  // TODO move this onto the prop classes!
      const list = prop.get(copy);
      list.forEach(copy => remapItem(copy, map));
    } else if (prop instanceof ChildSlotProp) {
      const child = prop.get(copy).get(0);
      if (child) {
        remapItem(child, map);
      }
    } else if (prop instanceof ReferenceProp) {
      const reference: ReferencedObject | undefined = prop.get(copy);
      if (reference) {
        const refCopy = map.get(reference.id);
        if (refCopy) {
          prop.set(copy, refCopy);
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

// Serialization/Deserialization, via raw objects.

function serializeItem(original: DataContextObject) : object {
  let result: any = {
    type: original.template.typeName,
  };
  for (let prop of original.template.properties) {
    if (prop instanceof ScalarProp || prop instanceof IdProp) {  // TODO move this onto the prop classes!
      const value = prop.get(original);
      if (value !== undefined)
        result[prop.name] = value;
    } else if (prop instanceof ReferenceProp) {
      const value = prop.getId(original);
      result[prop.name] = value;
    } else if (prop instanceof ChildListProp) {
      const originalList = prop.get(original),
            copyList = new Array<object>();
      result[prop.name] = copyList;
      originalList.forEach(child => {
        copyList.push(serializeItem(child));
      });
    } else if (prop instanceof ChildSlotProp) {
      const child = prop.get(original).get(0);
      if (child) {
        result[prop.name] = serializeItem(child);
      }
    }
  }
  return result;
}

export function Serialize(item: DataContextObject) : any {
  return serializeItem(item);
}

// First pass, create objects, copy properties, and build the reference fixup map.
function deserializeItem1(
    raw: any, map: Map<number, ReferencedObject>, context: DataContext) :
    DataContextObject {
  const type = raw.type,
        item = context.construct(type);
  for (let prop of item.template.properties) {
    if (prop instanceof ScalarProp) {  // TODO move this onto the prop classes!
      const value = raw[prop.name];
      if (value !== undefined)
        prop.set(item, value);
    } else if (prop instanceof IdProp) {
      const id = raw[prop.name];
      if (id !== undefined)
        map.set(id, item as ReferencedObject);
    } else if (prop instanceof ReferenceProp) {
      // Copy the old id, to be remapped in the second pass.
      const id = raw[prop.name];
      prop.setId(item, id);
    } else if (prop instanceof ChildListProp) {
      const rawArray = raw[prop.name],
            list = prop.get(item);
      if (rawArray) {
        for (let rawChild of rawArray) {
          const child = deserializeItem1(rawChild, map, context);
          list.append(child);
        }
      }
    } else if (prop instanceof ChildSlotProp) {
      const rawObject = raw[prop.name],
            slot = prop.get(item);
      if (rawObject) {
        const child = deserializeItem1(rawObject, map, context);
        slot.set(0, child);
      }
    }
  }
  return item;
}

// Second pass; copy and remap references.
function deserializeItem2(
    item: DataContextObject, map: Map<number, ReferencedObject>, context: DataContext) {
  for (let prop of item.template.properties) {
    if (prop instanceof ReferenceProp) {  // TODO move this onto the prop classes!
      const id = prop.getId(item);
      prop.set(item, map.get(id));
    } else if (prop instanceof ChildListProp) {
      const list = prop.get(item);
      list.forEach(child => deserializeItem2(child, map, context));
    } else if (prop instanceof ChildSlotProp) {
      const child = prop.get(item).get(0);
      if (child) {
        deserializeItem2(child, map, context);
      }
    }
  }
  return item;
}

export function Deserialize(raw: any, context: DataContext) : DataContextObject {
  const map = new Map<number, ReferencedObject>(),
        root = deserializeItem1(raw, map, context);
  return deserializeItem2(root, map, context);
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
  if (items.length == 0)
    return undefined;
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
    if (heightLCA == 0 || nextHeight == 0)
      return undefined;
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

export function reduceToRoots<T extends Parented<T>>(items: T[], set: SetLike<T>) : T[] {
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

export type EventHandler<T> = (event: T) => void;
type EventHandlers<T> = EventHandler<T>[];

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

export type ChangeType = 'valueChanged' | 'elementInserted' | 'elementRemoved';
// Generic 'change' event.
export type ChangeEvents = 'changed' | ChangeType;

// Standard formats:
// 'valueChanged': item, attr, oldValue.
// 'elementInserted': item, attr, index.
// 'elementRemoved': item, attr, index, oldValue.
export interface Change {
  type: ChangeType;
  item: DataContextObject;
  prop: PropertyTypes;
  index: number;
  oldValue: any;
}

//------------------------------------------------------------------------------

// Command pattern, transactions, and undo/redo.

export interface Operation {
  undo() : void;
  redo() : void;
}

class ChangeOp implements Operation {
  change: Change;

  undo() {
    const change = this.change,
          item = change.item,
          prop = change.prop;
    switch (change.type) {
      case 'valueChanged': {
        // value change can be its own inverse if we swap current and old values.
        if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
          change.oldValue = prop.set(item, change.oldValue);
        }
        break;
      }
      case 'elementInserted': {
        if (prop instanceof ChildListProp) {  // TODO move this onto the prop classes!
          const list = prop.get(item), index = change.index;
          change.oldValue = list.get(index);
          list.removeAt(index);
          change.type = 'elementRemoved';
        } else if (prop instanceof ChildSlotProp) {
          const slot = prop.get(item),
                index = change.index;
          change.oldValue = slot.set(index, change.oldValue);
          change.type = 'elementRemoved';
        }
        break;
      }
      case 'elementRemoved': {
        if (prop instanceof ChildListProp) {  // TODO move this onto the prop classes!
          const list = prop.get(item), index = change.index;
          list.insert(change.oldValue, index);
          change.type = 'elementInserted';
        } else if (prop instanceof ChildSlotProp) {
          const slot = prop.get(item),
                index = change.index;
          change.oldValue = slot.set(index, change.oldValue);
          change.type = 'elementRemoved';
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
  constructor(change: Change) {
    this.change = change;
  }
}

export class CompoundOp implements Operation {
  readonly name: string;
  readonly ops: Operation[];
  cancelReason: string | undefined;

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

export type TransactionEvent =
    'transactionBegan' | 'transactionEnding' | 'transactionEnded' | 'transactionCanceled' |
    'didUndo' | 'didRedo';

export class TransactionManager extends EventBase<CompoundOp, TransactionEvent> {
  private transaction: CompoundOp | undefined;
  private endingOrCanceling: boolean = false;
  private snapshots = new Map<DataContextObject, object>();

  // Notifies observers that a transaction has started.
  beginTransaction(name: string) : CompoundOp {
    if (this.transaction)
      throw new Error('Already in transaction');
    if (this.endingOrCanceling)
      throw new Error('Ending or Canceling');
    const transaction = new CompoundOp(name);
    this.transaction = transaction;
    this.snapshots = new Map<DataContextObject, object>();
    super.onEvent('transactionBegan', transaction);
    return transaction;
  }

  // Notifies observers that a transaction is ending. Observers should now
  // do any adjustments to make data valid. At this point the transaction can't
  // be canceled.
  endTransaction() : CompoundOp {
    const transaction = this.transaction;
    if (!transaction)
      throw new Error('Transaction ended or canceled');
    this.endingOrCanceling = true;
    super.onEvent('transactionEnding', transaction);
    this.transaction = undefined;
    this.snapshots.clear();
    super.onEvent('transactionEnded', transaction);
    this.endingOrCanceling = false;
    return transaction;
  }

  // Notifies observers that a transaction was canceled and its operations
  // rolled back. At this point the transaction can't be ended.
  cancelTransaction(reason?: string) {
    const transaction = this.transaction;
    if (!transaction)
      throw new Error('Transaction ended or canceled');
    this.transaction = undefined;
    this.endingOrCanceling = true;
    this.undo(transaction);
    this.snapshots.clear();
    transaction.cancelReason = reason;
    super.onEvent('transactionCanceled', transaction);
    this.endingOrCanceling = false;
  }

  // Undoes the operations in the transaction.
  undo(transaction: CompoundOp) {
    // Roll back operations.
    transaction.undo();
    super.onEvent('didUndo', transaction);
  }

  // Redoes the operations in the transaction.
  redo(transaction: CompoundOp) {
    // Roll forward changes.
    transaction.redo();
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
  private recordChange(change: Change) {
    // Combine value changes, combine nop insert/remove changes.
    const ops = this.transaction!.ops;
    for (let i = 0; i < ops.length; ++i) {
      const op = ops[i];
      if (op instanceof ChangeOp) {
        if (op.change.type === 'valueChanged') {
          if (op.change.item === change.item && op.change.prop === change.prop) {
            // Delete the old op and replace it with a new one, since Change should be immutable.
            change.oldValue = op.change.oldValue;
            ops.splice(i, 1);
          }
        }
      }
    }
    const op = new ChangeOp(change);
    this.transaction!.add(op);
  }

  onChanged(change: Change) {
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
      }
      this.recordChange(change);
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

class SelectionOp implements Operation {
  private selectionSet: SelectionSet<DataContextObject>;
  private startingSelection: DataContextObject[];
  private endingSelection: DataContextObject[];

  undo() {
    this.selectionSet.set(this.startingSelection);
  }
  redo() {
    this.selectionSet.set(this.endingSelection);
  }
  constructor(selectionSet: SelectionSet<DataContextObject>,
              startingSelection: DataContextObject[]) {
    this.selectionSet = selectionSet;
    this.startingSelection = startingSelection;
    this.endingSelection = selectionSet.contents();
  }
}

// TODO handle canceling transactions. Currently, invalid transactions are left on the stack.
export class HistoryManager {
  private done: CompoundOp[] = [];
  private undone: CompoundOp[] = [];
  private transactionManager: TransactionManager;
  private selectionSet: SelectionSet<DataContextObject>;
  private startingSelection: DataContextObject[];

  getRedo() {
    const length = this.undone.length;
    return length > 0 ? this.undone[length - 1] : undefined;
  }

  getUndo() {
    const length = this.done.length;
    return length > 0 ? this.done[length - 1] : undefined;
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

  private onTransactionBegan(op: CompoundOp) {
    const selectionSet = this.selectionSet;
    this.startingSelection = selectionSet.contents();
  }

  private onTransactionEnding(op: CompoundOp) {
    const selectionSet = this.selectionSet;
    const startingSelection = this.startingSelection || [];
    let endingSelection = selectionSet.contents();
    if (startingSelection.length === endingSelection.length &&
        startingSelection.every(function(element, i) {
          return element === endingSelection[i];
        })) {
      return;  // endingSelection and startingSelection are the same.
    }

    const selectionOp = new SelectionOp(selectionSet, startingSelection);
    op.add(selectionOp);
    this.startingSelection = [];
  }

  private onTransactionEnded(op: CompoundOp) {
    this.startingSelection = [];

    if (op.ops.length === 0)  // Empty transaction.
      return;

    if (this.undone.length)
      this.undone = [];
    this.done.push(op);
  }

  private onTransactionCancelled(op: CompoundOp) {
    this.selectionSet.set(this.startingSelection);
    this.startingSelection = [];
  }

  constructor(transactionManager: TransactionManager, selectionSet: SelectionSet<DataContextObject>) {
    this.transactionManager = transactionManager;
    this.selectionSet = selectionSet;
    transactionManager.addHandler('transactionBegan', this.onTransactionBegan.bind(this));
    transactionManager.addHandler('transactionEnding', this.onTransactionEnding.bind(this));
    transactionManager.addHandler('transactionEnded', this.onTransactionEnded.bind(this));
    transactionManager.addHandler('transactionCanceled', this.onTransactionCancelled.bind(this));
  }
}
