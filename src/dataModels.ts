import { SelectionSet } from './collections.js';

//------------------------------------------------------------------------------

// Raw objects store data as a tree. Objects have properties and children.
// Various data models add data derived from the raw data, such as change events,
//   hierarchy, references.
// Interfaces adapt the raw data for type safe use.

export interface DataContext {
  valueChanged(
      owner: DataContextObject, attr: string, oldValue: any) : void;
  elementInserted(
      owner: DataContextObject, attr: string, index: number, value: DataContextObject) : void;
  elementRemoved(
      owner: DataContextObject, attr: string, index: number, oldValue: DataContextObject) : void;
  resolveReference(
      owner: DataContextObject, cacheKey: symbol, id: number) : ReferencedObject | undefined;
}

export interface DataContextObject {
  readonly template: DataObjectTemplate
  readonly context: DataContext;
}

export interface DataObjectTemplate {
  readonly properties: Array<PropertyTypes>;
}

export interface ReferencedObject {
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

// Internal, non-type safe implementation of List.
class DataList implements List {
  private owner: DataContextObject;
  private name: string;

  private get array() : any[] | undefined {
    return (this.owner as any)[this.name];
  }
  private set array(value: any[] | undefined) {
    (this.owner as any)[this.name] = value;
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
      this.array = array = [];
      this.owner.context.valueChanged(this.owner, this.name, undefined);
    }
    array.splice(index, 0, element);
    this.owner.context.elementInserted(this.owner, this.name, index, element);
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
    this.owner.context.elementRemoved(this.owner, this.name, index, oldValue[0]);
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

  constructor(owner: DataContextObject, name: string) {
    this.owner = owner;
    this.name = name;
  }
}

//------------------------------------------------------------------------------

// Simple property descriptors.

export type PropertyTypes = ScalarProp | ReferenceProp | ArrayProp;

export class ScalarProp {
  readonly name: string;

  get(owner: DataContextObject) : any {
    return (owner as any)[this.name];
  }
  set(owner: DataContextObject, value: any) : any {
    const oldValue = (owner as any)[this.name];
    (owner as any)[this.name] = value;
    owner.context.valueChanged(owner, this.name, oldValue);
    return oldValue;
  }
  constructor(name: string) {
    this.name = '_' + name;  // Rename to avoid name conflicts.
  }
}

export class ArrayProp {
  readonly name: string;

  get(owner: DataContextObject) : List<any> {
    return new DataList(owner, this.name);
  }
  constructor(name: string) {
    this.name = '_' + name;  // Rename to avoid name conflicts.
  }
}

export class ReferenceProp {
  readonly name: string;
  readonly prop: ScalarProp;
  readonly cacheKey: symbol;

  get(owner: DataContextObject) : ReferencedObject | undefined {
    const id = this.prop.get(owner);
    if (!id)
      return undefined;
    return owner.context.resolveReference(owner, this.cacheKey, id) as ReferencedObject | undefined;
  }
  set(owner: DataContextObject, value: ReferencedObject | undefined) : ReferencedObject | undefined {
    const oldId = this.prop.get(owner),
          newId: number = value ? value.id : 0;
    this.prop.set(owner, newId);
    return owner.context.resolveReference(owner, this.cacheKey, newId) as ReferencedObject | undefined;
  }
  constructor(name: string) {
    this.name = '_' + name;  // Rename to avoid name conflicts.
    this.prop = new ScalarProp(name);
    this.cacheKey = Symbol.for(name);
  }
}

//------------------------------------------------------------------------------

// Cloning.

// TODO roll this into DataContext.
export interface FactoryContext {
  construct: (obj: DataContextObject, map: Map<number, ReferencedObject>) => DataContextObject;
}

function copyItem(
    original: DataContextObject,
    context: FactoryContext,
    map: Map<number, ReferencedObject>) : DataContextObject {
  const copy = context.construct(original, map),
        properties = original.template.properties;
  for (let prop of properties) {
    if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
      prop.set(copy, prop.get(original));
    } else if (prop instanceof ArrayProp) {
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
    if (prop instanceof ArrayProp) {
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
    items: DataContextObject[], context: FactoryContext) :
    DataContextObject[] {
  const map = new Map<number, ReferencedObject>(),
        copies = new Array<DataContextObject>();
  for (let item of items) {
    copies.push(copyItem(item, context, map));
  }
  for (let copy of copies)  {
    remapItem(copy, map);
  }
  return copies;
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
    item = this.getParent(item);
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

export function reduceToRoots<T extends Parented<T>>(items: Array<T>, set: SetLike<T>) : Array<T> {
  function ancestorInSet(item: T) {
    let ancestor = item.parent;
    while (ancestor) {
      if (set.has(ancestor))
        return true;
      ancestor = ancestor.parent;
    }
    return false;
  }

  const roots = new Array();
  items.forEach(function(item: T) {
    if (!ancestorInSet(item)) {
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

export type ChangeType = 'valueChanged' | 'elementInserted' | 'elementRemoved';
// Generic 'change' event.
export type ChangeEvents = 'changed' | ChangeType;

// Standard formats:
// 'valueChanged': item, attr, oldValue.
// 'elementInserted': item, attr, index.
// 'elementRemoved': item, attr, index, oldValue.
export class Change<TOwner extends object = object, TValue = any> {
  type: ChangeType;
  item: TOwner;
  attr: string;
  index: number;
  oldValue: TValue;
}

//------------------------------------------------------------------------------

// Command pattern, transactions, and undo/redo.

interface Operation {
  undo() : void;
  redo() : void;
}

class ChangeOp<TOwner extends DataContextObject> implements Operation {
  private change: Change<TOwner>;
  private dataContext: DataContext;

  undo() {
    const change = this.change,
          item: TOwner = change.item,
          attr: string = change.attr;
    switch (change.type) {
      case 'valueChanged': {
        const oldValue = (item as any)[attr];
        (item as any)[attr] = change.oldValue;
        change.oldValue = oldValue;
        item.context.valueChanged(item, attr, oldValue);  // this change is its own inverse.
        break;
      }
      case 'elementInserted': {
        const array = (item as any)[attr], index = change.index;
        change.oldValue = array[index];
        array.splice(index, 1);
        item.context.elementRemoved(item, attr, index, change.oldValue);
        change.type = 'elementRemoved';
        break;
      }
      case 'elementRemoved': {
        const array = (item as any)[attr], index = change.index;
        array.splice(index, 0, change.oldValue);
        item.context.elementInserted(item, attr, index, change.oldValue);
        change.type = 'elementInserted';
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

class SelectionOp<TOwner extends DataContextObject> implements Operation {
  private selectionSet: SelectionSet<TOwner>;
  private startingSelection: Array<TOwner>;
  private endingSelection: Array<TOwner>;

  undo() {
    this.selectionSet.set(this.startingSelection);
  }
  redo() {
    this.selectionSet.set(this.endingSelection);
  }
  constructor(selectionSet: SelectionSet<TOwner>,
              startingSelection: Array<any>,
              endingSelection: Array<any>) {
    this.selectionSet = selectionSet;
    this.startingSelection = startingSelection;
    this.endingSelection = endingSelection;
  }
}

export class CompoundOp implements Operation {
  readonly name: string;
  private ops: Array<Operation>;

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

export class TransactionManager<TOwner extends DataContextObject>
    extends EventBase<CompoundOp, TransactionEvent> {
  private transaction?: CompoundOp;
  private snapshots = new Map<TOwner, object>();

  // Notifies observers that a transaction has started.
  beginTransaction(name: string) {
    const transaction = new CompoundOp(name);

    this.transaction = transaction;
    this.snapshots = new Map<TOwner, object>();
    super.onEvent('transactionBegan', transaction);
  }

  // Notifies observers that a transaction is ending. Observers should now
  // do any adjustments to make data valid, or cancel the transaction if
  // the data is in an invalid state.
  endTransaction() {
    const transaction = this.transaction;
    if (!transaction) return;
    super.onEvent('transactionEnding', transaction);
    this.snapshots.clear();
    this.transaction = undefined;
    super.onEvent('transactionEnded', transaction);
  }

  // Notifies observers that a transaction was canceled and its operations
  // rolled back.
  cancelTransaction() {
    const transaction = this.transaction;
    if (!transaction) return;
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

  getSnapshot(item: TOwner) : object | undefined {
    const snapshots = this.snapshots;
    if (!snapshots)
      return;
    const changedItem = snapshots.get(item);
    return changedItem ? changedItem : item;
  }

  private recordChange(change: Change<TOwner>) {
    if (!this.transaction)
      return;
    const op = new ChangeOp<TOwner>(change);
    this.transaction.add(op);
  }

  onChanged(change: Change<TOwner>) {
    if (!this.transaction)
      return;

    const item: TOwner = change.item, attr = change.attr;

    if (change.type !== 'valueChanged') {
      // Record insert and remove element changes.
      this.recordChange(change);
    } else {
      // Coalesce value changes. Only record them the first time we observe
      // the (item, attr) change.
      const snapshots = this.snapshots;
      let snapshot = snapshots.get(item);
      if (snapshot === undefined) {
        // The snapshot collects the attribute changes for its corresponding item.
        snapshot = Object.create(item);
        if (snapshot)
          snapshots.set(item, snapshot);
      }
      // Capture the old value on the snapshot only if it hasn't already been set.
      if (snapshot && !snapshot.hasOwnProperty(attr)) {
        (snapshot as any)[attr] = change.oldValue;
        this.recordChange(change);
      }
    }
  }
}

export class HistoryManager<TOwner extends DataContextObject> {
  private done: Array<CompoundOp> = [];
  private undone: Array<CompoundOp> = [];
  private transactionManager: TransactionManager<TOwner>;
  private selectionSet: SelectionSet<TOwner>;
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

  constructor(transactionManager: TransactionManager<TOwner>, selectionSet: SelectionSet<TOwner>) {
    this.transactionManager = transactionManager;
    this.selectionSet = selectionSet;
    transactionManager.addHandler('transactionBegan', this.onTransactionBegan_.bind(this));
    transactionManager.addHandler('transactionEnding', this.onTransactionEnding_.bind(this));
    transactionManager.addHandler('transactionEnded', this.onTransactionEnded_.bind(this));
    transactionManager.addHandler('transactionCancelled', this.onTransactionCancelled_.bind(this));
  }
}



//------------------------------------------------------------------------------

export type ItemVisitor = (item: any) => void;

export type PropertyVisitor = (item: any, attr: string) => void;

//------------------------------------------------------------------------------

// Base DataModel.

export class DataModel {
  private root_: any;
  private initializers: Array<ItemVisitor> = new Array();

  root() : any {
    return this.root_;
  }

  isItem(item: any) {
    return typeof item === 'object' && item !== null;
  }

  // Returns true iff. item[attr] is a model property.
  isProperty(item: any, attr: string) : boolean {
    return item.hasOwnProperty(attr);
  }

  // Visits the item's top level properties.
  visitProperties(item: any, propFn: PropertyVisitor) {
    for (let attr in item) {
      if (this.isProperty(item, attr))
        propFn(item, attr);
    }
}

  // Visits the item's top level properties that are Arrays or child items.
  visitChildren(item: any, childFn: ItemVisitor) {
    const self = this;
    this.visitProperties(item, function(item: object, attr: string) {
      const value = (item as any)[attr];
      if (Array.isArray(value)) {
        value.forEach(item => {
            if (self.isItem(item))
              childFn(item);
        });
      } else if (self.isItem(value)) {
        childFn(value);
      }
    });
  }

  // Visits the item and all of its descendants.
  visitSubtree(item: any, itemFn: ItemVisitor) {
    itemFn(item);
    const self = this;
    this.visitChildren(item, function(child) {
      self.visitSubtree(child, itemFn);
    });
  }

  addInitializer(initialize: ItemVisitor) {
    this.initializers.push(initialize);
  }

  initialize(item: any) {
    const self = this;
    this.visitSubtree(item, function(subItem) {
      self.initializers.forEach(function(initializer) {
        initializer(subItem);
      });
    });
  }

  constructor(root: any) {
    this.root_ = root;
  }
}

//------------------------------------------------------------------------------

// Observable Model.

export class ObservableModel extends EventBase<Change, ChangeEvents> {
  private onChanged(change: Change) : Change {
    // console.log(change);
    super.onEvent('changed', change);
    return change
  }
  changeValue(item: any, attr: string, newValue: any) : any {
    const oldValue = item[attr];
    if (newValue !== oldValue) {
      item[attr] = newValue;
      this.onValueChanged(item, attr, oldValue);
    }
    return oldValue;
  }
  onValueChanged(item: any, attr: string, oldValue: any) : Change {
    const change: Change = {type: 'valueChanged', item, attr, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    return this.onChanged(change);

  }
  insertElement(item: any, attr: string, index: number, newValue: any) {
    const array = item[attr];
    array.splice(index, 0, newValue);
    this.onElementInserted(item, attr, index);
  }
  onElementInserted(item: any, attr: string, index: number) : Change {
    const change: Change = { type: 'elementInserted', item: item, attr: attr, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  removeElement(item: any, attr: string, index: number) {
    const array = item[attr], oldValue = array[index];
    array.splice(index, 1);
    this.onElementRemoved(item, attr, index, oldValue);
    return oldValue;
  }
  onElementRemoved(item: any, attr: string, index: number, oldValue: any ) : Change {
    const change: Change = { type: 'elementRemoved', item: item, attr: attr, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    return this.onChanged(change);
  }
}

//------------------------------------------------------------------------------

// ReferenceModel

type ReferenceFn = (item: any) => any;

export class ReferenceModel {
  private highestId: number = 0;  // 0 stands for no id.
  private targets_ = new Map<number, object>();
  private functions_ = new Map<string, ReferenceFn>();
  private dataModel_: DataModel;

  // Returns the unique id of the item.
  getId(item: any) : number {
    return item.id as number;  // TODO ReferenceObject
  }

  assignId(item: any) : number {
    // 0 is not a valid id in this model.
    const id = ++this.highestId;
    item.id = id;
    return id;
  }

  // Gets the object that is referenced by item[attr]. Default is to return
  // item[Symbol(attr)].
  getReference(item: any, attr: string) {
    return item[Symbol.for(attr)] || this.resolveReference(item, attr);
  }

  getReferenceFn(attr: string) : ReferenceFn  {
    // this object caches the reference functions, indexed by the symbol.
    let fn = this.functions_.get(attr);
    if (!fn) {
      const self = this,
            symbol = Symbol.for(attr);
      fn = (item: any) => { return item[symbol] || self.resolveReference(item, attr); };
      self.functions_.set(attr, fn);
    }
    return fn;
  }

  // Returns true iff. item[attr] is a property that references an item.
  isReference(item: object, attr: string) {
    const attrName = attr.toString(),
          position = attrName.lastIndexOf('Id');
    return position === attrName.length - 2;
  }

  // Visits the item's top level reference properties.
  visitReferences(item: object, refFn: PropertyVisitor) {
    const self = this;
    this.dataModel_.visitProperties(item, function(item, attr) {
      if (self.isReference(item, attr))
        refFn(item, attr);
    });
  }
  // Resolves an id to a target item if possible.
  resolveId(id: number) {
    return this.targets_.get(id);
  }

  // Resolves a reference to a target item if possible.
  resolveReference(item: any, attr: string) {
    const newId = item[attr],
          newTarget = this.resolveId(newId);
    item[Symbol.for(attr)] = newTarget;
    return newTarget;
  }

  // Recursively adds item and sub-items as potential reference targets, and
  // resolves any references they contain.
  addTargets_(item: any) {
    const self = this,
          dataModel = this.dataModel_;
    dataModel.visitSubtree(item, function(item) {
      const id = self.getId(item);
      if (id)
        self.targets_.set(id, item);
    });
    dataModel.visitSubtree(item, function(item) {
      self.visitReferences(item, function(item, attr) {
        self.resolveReference(item, attr as string);  // TODO fix when id's managed here.
      });
    });
  }

  // Recursively removes item and sub-items as potential reference targets.
  removeTargets_(item: any) {
    const self = this,
          dataModel = this.dataModel_;
    dataModel.visitSubtree(item, function(item: any) {
      const id = self.getId(item);
      if (id)
        self.targets_.delete(id);
    });
  }

  onChanged_(change: Change) {
    const dataModel = this.dataModel_,
          item: any = change.item,
          attr: string = change.attr;
    switch (change.type) {
      case 'valueChanged': {
        if (this.isReference(item, attr)) {
          this.resolveReference(item, attr as string);  // TODO fix when id's managed here.
        } else {
          const oldValue = change.oldValue;
          if (dataModel.isItem(oldValue))
            this.removeTargets_(oldValue);
          const newValue = item[attr];
          if (dataModel.isItem(newValue))
            this.addTargets_(newValue);
        }
        break;
      }
      case 'elementInserted': {
        const newValue = item[attr][change.index];
        if (dataModel.isItem(newValue))
          this.addTargets_(newValue);
        break;
      }
      case 'elementRemoved': {
        const oldValue = change.oldValue;
        if (dataModel.isItem(oldValue))
          this.removeTargets_(oldValue);
        break;
      }
    }
  }
  constructor(dataModel: DataModel, observableModel: ObservableModel) {
    this.dataModel_ = dataModel;
    this.addTargets_(dataModel.root());

    observableModel.addHandler('changed', this.onChanged_.bind(this));

    // Track ids and assign unique ids to any unidentified items.
    const self = this;
    const unidentifed = new Array();
    dataModel.visitSubtree(dataModel.root(), function(item: object) {
      const id = self.getId(item);
      if (!id)
        unidentifed.push(item);
      else
        self.highestId = Math.max(self.highestId, id);
    });
    unidentifed.forEach(item => self.assignId(item));
  }
}

//------------------------------------------------------------------------------

// HierarchyModel
const parent_ = Symbol('HierarchyModel.parent');

export class HierarchyModel<T extends object = object> {
  private dataModel_: DataModel;

  getParent(item: T) : any {
    return (item as any)[parent_];
  }

  private setParent(child: T, parent: T | undefined) {
    (child as any)[parent_] = parent;
  }

  getLineage(item: T) {
    const lineage = new Array<T>();
    while (item) {
      lineage.push(item);
      item = this.getParent(item);
    }
    return lineage;
  }

  getHeight(item: T) {
    let height = 0;
    while (item) {
      height++;
      item = this.getParent(item);
    }
    return height;
  }

  getLowestCommonAncestor(...items: Array<T>) {
    let lca = items[0];
    let heightLCA = this.getHeight(lca);
    for (let i = 1; i < items.length; i++) {
      let next = arguments[i];
      let nextHeight = this.getHeight(next);
      if (heightLCA > nextHeight) {
        while (heightLCA > nextHeight) {
          lca = this.getParent(lca);
          heightLCA--;
        }
      } else {
        while (nextHeight > heightLCA) {
          next = this.getParent(next);
          nextHeight--;
        }
      }
      while (heightLCA && nextHeight && lca !== next) {
        lca = this.getParent(lca);
        next = this.getParent(next);
        heightLCA--;
        nextHeight--;
      }
      if (heightLCA == 0 || nextHeight == 0) return undefined;
    }
    return lca;
  }

  // Sets the parent for each item in the subtree at |parent|.
  private setChildren(parent: T) {
    const self = this;
    this.dataModel_.visitChildren(parent, function(child: any) {
      self.setParent(child, parent);
      self.setChildren(child);
    });
  }

  onChanged_(change: Change) {
    const dataModel = this.dataModel_,
          item: any = change.item,
          attr: string = change.attr;
    switch (change.type) {
      case 'valueChanged': {
        const newValue = item[attr];
        if (dataModel.isItem(newValue)){
          this.setParent(newValue, item);
          this.setChildren(newValue);
        }
        break;
      }
      case 'elementInserted': {
        const newValue = item[attr][change.index];
        if (dataModel.isItem(newValue)) {
          this.setParent(newValue, item);
          this.setChildren(newValue);
        }
        break;
      }
      case 'elementRemoved': {
        // Do nothing, as old value is no longer in the model.
        break;
      }
    }
  }

  constructor(dataModel: DataModel, observableModel: ObservableModel) {
    this.dataModel_ = dataModel;
    observableModel.addHandler('changed', this.onChanged_.bind(this));

    this.setParent(dataModel.root(), undefined)
    this.setChildren(dataModel.root());
  }
}

//------------------------------------------------------------------------------

// SelectionModel

export class SelectionModel extends SelectionSet<any> {
  private hierarchyModel_: HierarchyModel;

  set(item: any | Array<any>) {
    this.clear();
    if (Array.isArray(item)) {
      for (let subItem of item)
        this.add(subItem);
    } else {
      this.add(item);
    }
  }

  select(item: any, extend: boolean) {
    if (!this.has(item)) {
      if (!extend)
        this.clear();
      this.add(item);
    } else {
      if (extend)
        this.delete(item);
      else
        this.add(item);  // make this last selected.
    }
  }

  contents() : Array<any> {
    const result = new Array<any>();
    this.forEachReverse(item => result.push(item));
    return result;
  }

  hasAncestor(item: any, hierarchyModel: HierarchyModel) {
    let ancestor: any = hierarchyModel.getParent(item);
    while (ancestor) {
      if (this.has(ancestor))
        return true;
      ancestor = hierarchyModel.getParent(ancestor);
    }
    return false;
  }

  // Reduces the selection to the roots of the current selection. Thus, if a
  // child and ancestor are selected, remove the child.
  reduceSelection(hierarchyModel: HierarchyModel) {
    const self = this,
          roots = new Array();
    this.forEach(function(item: any) {
      if (!self.hasAncestor(item, hierarchyModel)) {
        roots.push(item);
      }
    });
    // Reverse, to preserve the previous order of selection.
    this.set(roots.reverse());
  }
}

//------------------------------------------------------------------------------

// TransactionModel
interface Operation {
  undo() : void;
  redo() : void;
}

class ChangeOperation implements Operation {
  private change: Change;
  private observableModel: ObservableModel;

  undo() {
    const change: Change = this.change,
          item: any = change.item,
          attr: string = change.attr,
          observableModel = this.observableModel;
    switch (change.type) {
      case 'valueChanged': {
        const oldValue = item[attr];
        item[attr] = change.oldValue;
        change.oldValue = oldValue;
        observableModel.onValueChanged(item, attr, oldValue);  // this change is its own inverse.
        break;
      }
      case 'elementInserted': {
        const array = item[attr], index = change.index;
        change.oldValue = array[index];
        array.splice(index, 1);
        observableModel.onElementRemoved(item, attr, index, change.oldValue);
        change.type = 'elementRemoved';
        break;
      }
      case 'elementRemoved': {
        const array = item[attr], index = change.index;
        array.splice(index, 0, change.oldValue);
        observableModel.onElementInserted(item, attr, index);
        change.type = 'elementInserted';
        break;
      }
    }
  }
  redo() {
    // 'valueChanged' is a toggle, and we swap 'elementInserted' and
    // 'elementRemoved', so redo is the same as applying undo again.
    this.undo();
  }
  constructor(change: Change, observableModel: ObservableModel) {
    this.change = change;
    this.observableModel = observableModel;
  }
}

class SelectionOperation implements Operation {
  undo() {
    this.selectionModel.set(this.startingSelection);
  }
  redo() {
    this.selectionModel.set(this.endingSelection);
  }
  constructor(private selectionModel: SelectionModel,
              private startingSelection: Array<any>,
              private endingSelection: Array<any>) {
  }
}

export class Transaction {
  name: string;
  ops: Array<Operation>;

  constructor(name: string) {
    this.name = name;
    this.ops = [];
  }
}

export class TransactionModel extends EventBase<Transaction, TransactionEvent> {
  private transaction_?: Transaction;
  private snapshots: Map<any, object> = new Map();
  private observableModel: ObservableModel;

  // Notifies observers that a transaction has started.
  beginTransaction(name: string) {
    const transaction = new Transaction(name);

    this.transaction_ = transaction;
    this.snapshots = new Map();
    this.onBeginTransaction(transaction);
    super.onEvent('transactionBegan', transaction);
  }

  // Returns the current transaction, or undefined if not in a transaction.
  transaction() : Transaction | undefined { return this.transaction_; }

  // Notifies observers that a transaction is ending. Observers should now
  // do any adjustments to make data valid, or cancel the transaction if
  // the data is in an invalid state.
  endTransaction() {
    const transaction = this.transaction_;
    if (!transaction) return;
    super.onEvent('transactionEnding', transaction);
    this.onEndTransaction(transaction);
    this.snapshots.clear();
    super.onEvent('transactionEnded', transaction);
    this.transaction_ = undefined;
  }

  // Notifies observers that a transaction was canceled and its operations
  // rolled back.
  cancelTransaction() {
    const transaction = this.transaction_;
    if (!transaction) return;
    this.undo(transaction);
    this.onCancelTransaction(transaction);
    super.onEvent('transactionCancelled', transaction);
    this.transaction_ = undefined;
  }

  // Undoes the operations in the transaction.
  undo(transaction: Transaction) {
    // Roll back operations.
    const ops = transaction.ops, length = ops.length;
    for (let i = length - 1; i >= 0; i--) {
      ops[i].undo();
    }
    // TODO consider raising transaction ended event instead.
    super.onEvent('didUndo', transaction);
  }

  // Redoes the operations in the transaction.
  redo(transaction: Transaction) {
    // Roll forward changes.
    const ops = transaction.ops, length = ops.length;
    for (let i = 0; i < length; i++) {
      ops[i].redo();
    }
    // TODO consider raising transaction ended event instead.
    super.onEvent('didRedo', transaction);
  }

  getSnapshot(item: object) : any {
    const snapshots = this.snapshots;
    if (!snapshots)
      return;
    const changedItem = snapshots.get(item);
    return changedItem;
  }

  private onBeginTransaction(transaction: Transaction) {
  }

  private onEndTransaction(transaction: Transaction) {
    this.snapshots.clear();
    this.transaction_ = undefined;
  }

  private onCancelTransaction(transaction: Transaction) {
    this.snapshots.clear();
    this.transaction_ = undefined;
  }

  recordChange_(change: Change) {
    const op = new ChangeOperation(change, this.observableModel);
    this.transaction_!.ops.push(op);
  }

  onChanged_(change: Change) {
    if (!this.transaction_)
      return;

    const item = change.item, attr = change.attr;

    if (change.type !== 'valueChanged') {
      // Record insert and remove element changes.
      this.recordChange_(change);
    } else {
      // Coalesce value changes. Only record them the first time we observe
      // the (item, attr) change.
      const snapshots = this.snapshots;
      let snapshot: any = snapshots.get(item);
      if (snapshot === undefined) {
        // The snapshot collects the attribute changes for its corresponding item.
        snapshot = Object.create(item);
        snapshots.set(item, snapshot);
      }
      // Capture the old value on the snapshot only if it hasn't already been set.
      if (!snapshot.hasOwnProperty(attr)) {
        snapshot[attr] = change.oldValue;
        this.recordChange_(change);
      }
    }
  }

  constructor(observableModel: ObservableModel) {
    super();
    this.observableModel = observableModel;
    observableModel.addHandler('changed', this.onChanged_.bind(this));
  }
}

//------------------------------------------------------------------------------

export class UndoRedoModel {
  private done: Array<Transaction> = [];
  private undone: Array<Transaction> = [];
  private transactionModel: TransactionModel;
  private selectionModel?: SelectionModel;
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
      this.transactionModel.redo(transaction);
      this.done.push(this.undone.pop()!);
    }
  }

  undo() {
    const transaction = this.getUndo();
    if (transaction) {
      this.transactionModel.undo(transaction);
      this.undone.push(this.done.pop()!);
    }
  }

  onTransactionBegan_(transaction: Transaction) {
    const selectionModel = this.selectionModel;
    if (!selectionModel)
      return;
    this.startingSelection = selectionModel.contents();
  }

  onTransactionEnding_(transaction: Transaction) {
    const selectionModel = this.selectionModel;
    if (!selectionModel)
      return;
    const startingSelection = this.startingSelection || [];
    let endingSelection = selectionModel.contents();
    if (startingSelection.length === endingSelection.length &&
        startingSelection.every(function(element, i) {
          return element === endingSelection[i];
        })) {
      endingSelection = startingSelection;
    }
    const op = new SelectionOperation(selectionModel, startingSelection, endingSelection);
    transaction.ops.push(op);
    this.startingSelection = [];
  }

  onTransactionEnded_(transaction: Transaction) {
    this.startingSelection = [];
    if (this.undone.length)
      this.undone = [];
    this.done.push(transaction);
  }

  onTransactionCancelled_(transaction: Transaction) {
    this.startingSelection = [];
  }

  constructor(transactionModel: TransactionModel, selectionModel?: SelectionModel) {
    this.transactionModel = transactionModel;
    this.selectionModel = selectionModel;
    transactionModel.addHandler('transactionBegan', this.onTransactionBegan_.bind(this));
    transactionModel.addHandler('transactionEnding', this.onTransactionEnding_.bind(this));
    transactionModel.addHandler('transactionEnded', this.onTransactionEnded_.bind(this));
    transactionModel.addHandler('transactionCancelled', this.onTransactionCancelled_.bind(this));
  }
}

//------------------------------------------------------------------------------

export class InstancingModel {
  private dataModel: DataModel;
  private referenceModel: ReferenceModel;

  clone(item: any, map: Map<number, any>) {
    const self = this,
          dataModel = this.dataModel;
    // Return any primitive values without cloning.
    if (!dataModel.isItem(item))
      return item;

    // Use constructor() to properly clone arrays, sets, maps, etc.
    const copy = item.constructor();
    dataModel.visitProperties(item, function(item: any, attr: string) {
      copy[attr] = self.clone(item[attr], map);
    });
    // Assign unique id after cloning all properties.
    if (!Array.isArray(copy)) {
      const referenceModel = this.referenceModel;
      referenceModel.assignId(copy);
      dataModel.initialize(copy);
      if (map) {
        const id = referenceModel.getId(item);
        map.set(id, copy);
      }
    }
    return copy;
  }

  cloneGraph(items: Array<any>, map: Map<number, any>) {
    const dataModel = this.dataModel,
          referenceModel = this.referenceModel,
          copies: any[] = [];
    items.forEach(function(item) {
      copies.push(this.clone(item, map));
    }, this);
    copies.forEach(function(copy: any) {
      dataModel.visitSubtree(copy, function(copy: any) {
        if (Array.isArray(copy))
          return;
        for (let attr in copy) {
          if (referenceModel.isReference(copy, attr)) {
            const originalId: number = copy[attr],
                  newCopy = map.get(originalId);
            if (newCopy) {
              const newId = referenceModel.getId(newCopy);
              copy[attr] = newId;
            }
          }
        }
      });
    }, this);
    return copies;
  }

  // Strict deep equality (no working up prototype chain.)
  isomorphic(item1: any, item2: any, map: Map<number, number>) {
    const dataModel = this.dataModel,
          referenceModel = this.referenceModel;

    // The first pass matches all items and properties except references. It
    // builds the id mapping for the second pass.
    function firstPass(item1: any, item2: any) {
      if (!dataModel.isItem(item1) || !dataModel.isItem(item2))
        return item1 === item2;

      const keys1 = Object.keys(item1),
            keys2 = Object.keys(item2);
      if (keys1.length !== keys2.length)
        return false;
      for (let k of keys1) {
        if (!item2.hasOwnProperty(k))
          return false;
        // Skip id's.
        if (k === 'id')
          continue;
        // Skip reference properties.
        if (referenceModel.isReference(item1, k) &&
            referenceModel.isReference(item2, k)) {
          continue;
        }
        if (!firstPass(item1[k], item2[k])) {
          return false;
        }
      }

      // Add item1 -> item2 id mapping.
      const id1 = referenceModel.getId(item1),
            id2 = referenceModel.getId(item2);
      if (id1 && id2)
        map.set(id1, id2);

      return true;
    }

    // The second pass makes sure all reference properties of items are
    // to the same item, or isomorphic items.
    function secondPass(item1: any, item2: any) {
      if (dataModel.isItem(item1) && dataModel.isItem(item2)) {
        const keys1 = Object.keys(item1),
              keys2 = Object.keys(item2);
        for (let k of keys1) {
          // Check reference properties.
          if (referenceModel.isReference(item1, k) &&
              referenceModel.isReference(item2, k)) {
            // Check for the same external reference, or to an isomorphic
            // internal reference.
            if (item1[k] !== item2[k] &&
                map.get(item1[k]) !== item2[k]) {
              return false;
            }
          }
        }
      }
      return true;
    }

    return firstPass(item1, item2) &&
           secondPass(item1, item2);
  }

  constructor(dataModel: DataModel, referenceModel: ReferenceModel) {
    this.dataModel = dataModel;
    this.referenceModel = referenceModel;
  }
}

//------------------------------------------------------------------------------

const _x = Symbol('TranslationModel.x');
const _y = Symbol('TranslationModel.y');

export class TranslationModel {
  private dataModel: DataModel;
  private observableModel: ObservableModel;
  private hierarchyModel: HierarchyModel;

    // Getter functions which determine translation parameters. Override to
    // fit the model.
    getX(item: any) {
      return item.x;
    }

    getY(item: any) {
      return item.y;
    }

    hasTranslation(item: any) {
      return (typeof this.getX(item) === 'number') &&
             (typeof this.getY(item) === 'number');
    }

    globalX(item: any) {
      return item[_x];
    }

    globalY(item: any) {
      return item[_y];
    }

    // Gets the translation to move an item from its current parent to
    // newParent. Handles the cases where current parent or newParent are null.
    getToParent(item: any, newParent: any) {
      const oldParent = this.hierarchyModel.getParent(item);
      let dx = 0, dy = 0;
      if (oldParent) {
        dx += this.globalX(oldParent);
        dy += this.globalY(oldParent);
      }
      if (newParent) {
        dx -= this.globalX(newParent);
        dy -= this.globalY(newParent);
      }
      return { x: dx, y: dy };
    }

    updateTranslation(item: any) {
      if (!this.hasTranslation(item))
        return;

      const hierarchyModel = this.hierarchyModel,
            x = this.getX(item), y = this.getY(item);
      let parent = hierarchyModel.getParent(item);
      while (parent && !this.hasTranslation(parent))
        parent = hierarchyModel.getParent(parent);

      if (parent) {
        item[_x] = x + parent[_x];
        item[_y] = y + parent[_y];
      } else {
        item[_x] = x;
        item[_y] = y;
      }
    }

    update(item: any) {
      const self = this;
      this.updateTranslation(item);
      this.dataModel.visitChildren(item, function(child) {
        self.updateTranslation(child);
      });
    }

    onChanged_(change: Change) {
      const dataModel = this.dataModel,
            item: any = change.item, attr: string = change.attr;
      switch (change.type) {
        case 'valueChanged': {
          const newValue = item[attr];
          if (dataModel.isItem(newValue))
            this.update(newValue);
          else
            this.update(item);
          break;
        }
        case 'elementInserted': {
          const newValue = item[attr][change.index];
          if (dataModel.isItem(newValue))
            this.update(newValue);
          break;
        }
        case 'elementRemoved':
          break;
      }
    }

  constructor(
      dataModel: DataModel, observableModel: ObservableModel,hierarchyModel: HierarchyModel) {
    this.dataModel = dataModel;
    this.observableModel = observableModel;
    this.hierarchyModel = hierarchyModel;

    // Track changes to x and y, and initialize new items.
    observableModel.addHandler('changed', change => this.onChanged_.bind(this));

    // Make sure new items have translations.
    dataModel.addInitializer(item => this.updateTranslation.bind(this));
  }
}
