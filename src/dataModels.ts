import { SelectionSet } from './collections';

export type ItemVisitor = (item: object) => void;

export type DataAttr = string | number;
export type PropertyVisitor = (item: object, attr: DataAttr) => void;

// TODO SelectionModel tests.
// TODO make DataObject type?
// TODO more ReferenceModel tests.

//------------------------------------------------------------------------------

// Base DataModel.

export class DataModel {
  private root_: object;
  private initializers: Array<ItemVisitor> = new Array();

  root() : object {
    return this.root_;
  }
  // TODO remove this for proper DataObject, ReferencedObject types.
  isItem(item: any) {
    return item instanceof Object;
  }
  // Returns true iff. item[attr] is a model property.
  isProperty(item: object, attr: DataAttr) : boolean {
    return item.hasOwnProperty(attr);
  }

  getId(item: any) : number {
    return item.id as number;
  }

  // Visits the item's top level properties.
  visitProperties(item: object, propFn: PropertyVisitor) {
    if (Array.isArray(item)) {
      // Array item.
      const length = item.length;
      for (let i = 0; i < length; i++)
        propFn(item, i);
    } else {
      // Object.
      for (let attr in item) {
        if (this.isProperty(item, attr))
          propFn(item, attr);
      }
    }
  }

  // Visits the item's top level properties that are Arrays or child items.
  visitChildren(item: object, childFn: ItemVisitor) {
    const self = this;
    this.visitProperties(item, function(item: object, attr: DataAttr) {
      const value = (item as any)[attr];
      if (Array.isArray(value)) {
        self.visitChildren(value, childFn);
      } else if (value instanceof Object) {
        childFn(value);
      }
    });
  }

  // Visits the item and all of its descendants.
  visitSubtree(item: object, itemFn: ItemVisitor) {
    itemFn(item);
    const self = this;
    this.visitChildren(item, function(child: object) {
      self.visitSubtree(child, itemFn);
    });
  }

  addInitializer(initialize: ItemVisitor) {
    this.initializers.push(initialize);
  }

  initialize(item: object) {
    const self = this;
    this.visitSubtree(item, function(subItem) {
      self.initializers.forEach(function(initializer) {
        initializer(subItem);
      });
    });
  }

  constructor(root: object) {
    this.root_ = root;
  }
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

// Observable Model.

// Generic change event, and more specific variants.
type ChangeType = 'valueChanged' | 'elementInserted' | 'elementRemoved';
type ChangeEvents = 'changed' | ChangeType;

// Standard formats:
// 'valueChanged': item, attr, oldValue.
// 'elementInserted': item, attr, index.
// 'elementRemoved': item, attr, index, oldValue.
export class Change {
  type: ChangeType;
  item: object;
  attr: DataAttr;
  index: number;
  oldValue: any;
}

type ChangeHandler = EventHandler<Change>;
type ChangeHandlers = EventHandlers<Change>;

export class ObservableModel extends EventBase<Change, ChangeEvents> {
  private onChanged(change: Change) {
    // console.log(change);
    super.onEvent('changed', change);
  }
  changeValue(item: any, attr: DataAttr, newValue: any) : any {
    const oldValue = item[attr];
    if (newValue !== oldValue) {
      item[attr] = newValue;
      this.onValueChanged(item, attr, oldValue);
    }
    return oldValue;
  }
  onValueChanged(item: any, attr: DataAttr, oldValue: any) {
    const change: Change = {type: 'valueChanged', item, attr, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    this.onChanged(change);
  }
  insertElement(item: any, attr: DataAttr, index: number, newValue: any) {
    const array = item[attr];
    array.splice(index, 0, newValue);
    this.onElementInserted(item, attr, index);
  }
  onElementInserted(item: any, attr: DataAttr, index: number) {
    const change: Change = { type: 'elementInserted', item: item, attr: attr, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    this.onChanged(change);
  }
  removeElement(item: any, attr: DataAttr, index: number) {
    const array = item[attr], oldValue = array[index];
    array.splice(index, 1);
    this.onElementRemoved(item, attr, index, oldValue);
    return oldValue;
  }
  onElementRemoved(item: any, attr: DataAttr, index: number, oldValue: any ) {
    const change: Change = { type: 'elementRemoved', item: item, attr: attr, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    this.onChanged(change);
  }
}

//------------------------------------------------------------------------------

// ReferenceModel

export class ReferenceModel {
  private highestId: number = 0;  // 0 stands for no id.
  private targets_ = new Map<number, object>();
  private functions_ = new Map<string, Function>();
  private dataModel_: DataModel;

  // Gets the object that is referenced by item[attr]. Default is to return
  // item[_attr].
  getReference(item: any, attr: string) {
    return item[Symbol.for(attr)] || this.resolveReference(item, attr);
  }

  getReferenceFn(attr: string) {
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

  assignId(item: any) : number {
    // 0 is not a valid id in this model.
    const id = ++this.highestId;
    item.id = id;
    return id;
  }

  // Returns true iff. item[attr] is a property that references an item.
  isReference(item: object, attr: DataAttr) {
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
    const self = this, dataModel = this.dataModel_;
    dataModel.visitSubtree(item, function(item) {
      const id = dataModel.getId(item);
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
    const self = this, dataModel = this.dataModel_;
    dataModel.visitSubtree(item, function(item: any) {
      const id = dataModel.getId(item);
      if (id)
        self.targets_.delete(id);
    });
  }

  onChanged_(change: Change) {
    const dataModel = this.dataModel_,
          item: any = change.item,
          attr: DataAttr = change.attr;
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
      const id = dataModel.getId(item);
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

export class HierarchyModel {
  private parent = Symbol('HierarchicalModel.parent');
  private dataModel_: DataModel;

  getParent(item: any) : any {
    return item[this.parent];
  }

  private setParent(child: any, parent: any) {
    child[this.parent] = parent;
  }

  getLineage(item: any) {
    const lineage = new Array();
    while (item) {
      lineage.push(item);
      item = this.getParent(item);
    }
    return lineage;
  }

  getHeight(item: any) {
    let height = 0;
    while (item) {
      height++;
      item = this.getParent(item);
    }
    return height;
  }

  getLowestCommonAncestor(...items: Array<any>) {
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
  private setChildren(parent: any) {
    const self = this;
    this.dataModel_.visitChildren(parent, function(child: any) {
      self.setParent(child, parent);
      self.setChildren(child);
    });
  }

  onChanged_(change: Change) {
    const dataModel = this.dataModel_,
          item: any = change.item,
          attr: DataAttr = change.attr;
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

  isAncestorSelected(item: any) {
    const hierarchyModel_ = this.hierarchyModel_;
    let ancestor: any = item;
    while (ancestor) {
      if (this.has(ancestor))
        return true;
      ancestor = hierarchyModel_.getParent(ancestor);
    }
    return false;
  }

  // Reduces the selection to the roots of the current selection. Thus, if a
  // child and ancestor are selected, remove the child.
  reduceSelection() {
    const self = this,
          hierarchyModel_ = this.hierarchyModel_,
          roots = new Array();
    this.forEach(function(item: any) {
      if (!self.isAncestorSelected(hierarchyModel_.getParent(item)))
        roots.push(item);
    });
    // Reverse, so passing this to selectionModel.set preserves order.
    this.set(roots.reverse());
  }

  constructor(hierarchyModel: HierarchyModel) {
    super();
    this.hierarchyModel_ = hierarchyModel;
  }
}

//------------------------------------------------------------------------------

// TransactionModel
// class Operation {
//   private change: Change;

//   undo() {
//     const change: Change = this.change,
//           item = change.item, attr = change.attr,
//           observableModel = this.observableModel;
//     switch (change.type) {
//       case 'change': {
//         const oldValue = item[attr];
//         item[attr] = change.oldValue;
//         change.oldValue = oldValue;
//         observableModel.onChanged(change);  // this change is its own inverse.
//         break;
//       }
//       case 'insert': {
//         const array = item[attr], index = change.index;
//         change.oldValue = array[index];
//         array.splice(index, 1);
//         observableModel.onElementRemoved(item, attr, index, change.oldValue);
//         change.type = 'remove';
//         break;
//       }
//       case 'remove': {
//         const array = item[attr], index = change.index;
//         array.splice(index, 0, change.oldValue);
//         observableModel.onElementInserted(item, attr, index);
//         change.type = 'insert';
//         break;
//       }
//     }
//   }
//   redo() {
//     // 'change' is a toggle, and we swap 'insert' and 'remove' so redo is
//     // just undo.
//     this.undo();
//   }
// }

// export class Transaction {
//   name: string;
//   ops: Operation[];

//   constructor(name: string) {
//     this.name = name;
//     this.ops = [];
//   }
// }

// type TransactionEvent = 'transactionBegan' | 'transactionEnded' | 'transactionCancelled' |
//                         'didUndo' | 'didRedo';

// export class TransactionModel extends EventBase<Transaction, TransactionEvent> {
//   private transaction?: Transaction;
//   private changedItems: Map<object, Change[]> = new Map();
//   private observableModel: ObservableModel;

//     // Notifies observers that a transaction has started.
//     beginTransaction(name: string) {
//       const transaction = new Transaction(name);

//       this.transaction = transaction;
//       this.changedItems = new Map();
//       this.onBeginTransaction(transaction);
//       super.onEvent('transactionBegan', transaction);
//     }

//     // Notifies observers that a transaction is ending. Observers should now
//     // do any adjustments to make data valid, or cancel the transaction if
//     // the data is in an invalid state.
//     endTransaction() {
//       const transaction = this.transaction;
//       this.onEndTransaction(transaction);
//       super.onEvent('transactionEnded', transaction);

//       this.transaction = undefined;
//       this.changedItems.clear();

//       this.onEvent('transactionEnded', transaction);
//     }

//     // Notifies observers that a transaction was canceled and its changes
//     // rolled back.
//     cancelTransaction() {
//       const transaction = this.transaction;
//       this.undo(transaction);
//       this.transaction = null;
//       this.onCancelTransaction(transaction);
//       super.onEvent('transactionCancelled', transaction);
//     }

//     // Undoes the changes in the transaction.
//     undo(transaction: Transaction) {
//       // Roll back changes.
//       const ops = transaction.ops, length = ops.length;
//       for (let i = length - 1; i >= 0; i--) {
//         ops[i].undo();
//       }
//       // TODO consider raising transaction ended event instead.
//       super.onEvent('didUndo', transaction);
//     }

//     // Redoes the changes in the transaction.
//     redo(transaction: Transaction) {
//       // Roll forward changes.
//       const ops = transaction.ops, length = ops.length;
//       for (let i = 0; i < length; i++) {
//         ops[i].redo();
//       }
//       // TODO consider raising transaction ended event instead.
//       super.onEvent('didRedo', transaction);
//     }

//     getSnapshot(item: object) {
//       const changedItems = this.changedItems;
//       if (!changedItems)
//         return;
//       const changedItem = changedItems.get(item);
//       return changedItem ? changedItem.snapshot : item;
//     }

//     onBeginTransaction(transaction: Transaction) {
//       const selectionModel = this.model.selectionModel;
//       if (!selectionModel)
//         return;
//       this.startingSelection = selectionModel.contents();
//     }

//     onEndTransaction(transaction: Transaction) {
//       const selectionModel = this.model.selectionModel;
//       if (!selectionModel)
//         return;
//       const startingSelection = this.startingSelection;
//       let endingSelection = selectionModel.contents();
//       if (startingSelection.length === endingSelection.length &&
//           startingSelection.every(function(element, i) {
//             return element === endingSelection[i];
//           })) {
//         endingSelection = startingSelection;
//       }
//       const op = Object.create(selectionOpProto);
//       op.startingSelection = startingSelection;
//       op.endingSelection = endingSelection;
//       op.selectionModel = selectionModel;
//       this.transaction.ops.push(op);
//       this.startingSelection = null;
//     }

//     onCancelTransaction(transaction: Transaction) {
//       const selectionModel = this.model.selectionModel;
//       if (!selectionModel)
//         return;
//       this.startingSelection = null;
//     }

//     recordChange_(change) {
//       const op = Object.create(opProto);
//       op.change = change;
//       op.observableModel = this.model.observableModel;
//       this.transaction.ops.push(op);
//     }

//     onChanged_(change) {
//       if (!this.transaction)
//         return;

//       const dataModel = this.model.dataModel,
//             item = change.item, attr = change.attr;

//       if (change.type !== 'change') {
//         // Record insert and remove element changes.
//         this.recordChange_(change);
//       } else {
//         // Coalesce value changes. Only record them the first time we observe
//         // the (item, attr) change.
//         const changedItems = this.changedItems;
//         let changedItem = changedItems.get(item),
//             snapshot, oldValue;
//         if (changedItem) {
//           snapshot = changedItem.snapshot;
//         } else {
//           // The snapshot just extends the item, and gradually overrides it as
//           // we receive attribute changes for it.
//           snapshot = Object.create(item);
//           changedItem = { item: item, snapshot: snapshot };
//           changedItems.set(item, changedItem);
//         }
//         if (!snapshot.hasOwnProperty(attr)) {
//           snapshot[attr] = change.oldValue;
//           this.recordChange_(change);
//         }
//       }
//     }

//     constructor(observableModel: ObservableModel) {
//       super();
//       this.observableModel = observableModel;
//       observableModel.addHandler('changed',
//                                  change => this.onChanged_(change));
//     }
// }
/*
const transactionModel = (function() {
  const opProto = {
  }

  const selectionOpProto = {
    undo: function() {
      this.selectionModel.set(this.startingSelection);
    },
    redo: function() {
      this.selectionModel.set(this.endingSelection);
    }
  }

  const proto = {
  }

  function extend(model) {
    if (model.transactionModel)
      return model.transactionModel;

    dataModel.extend(model);
    observableModel.extend(model);

    const instance = Object.create(proto);
    instance.model = model;
    eventMixin.extend(instance);
    model.observableModel.addHandler('changed',
                                     change => instance.onChanged_(change));

    model.transactionModel = instance;
    return instance;
  }

  return {
    extend: extend,
  };
})();

//------------------------------------------------------------------------------

const transactionHistory = (function() {
  const proto = {
    getRedo: function() {
      const length = this.undone.length;
      return length > 0 ? this.undone[length - 1] : null;
    },

    getUndo: function() {
      const length = this.done.length;
      return length > 0 ? this.done[length - 1] : null;
    },

    redo: function() {
      const transaction = this.getRedo();
      if (transaction) {
        this.model.transactionModel.redo(transaction);
        this.done.push(this.undone.pop());
      }
    },

    undo: function() {
      const transaction = this.getUndo();
      if (transaction) {
        this.model.transactionModel.undo(transaction);
        this.undone.push(this.done.pop());
      }
    },

    onTransactionEnded_: function(transaction) {
      if (this.undone.length)
        this.undone = [];
      this.done.push(transaction);
    },
  }

  function extend(model) {
    if (model.transactionHistory)
      return model.transactionHistory;

    transactionModel.extend(model);

    const instance = Object.create(proto);
    instance.model = model;
    instance.done = [];
    instance.undone = [];
    model.transactionModel.addHandler('transactionEnded',
                                      transaction => instance.onTransactionEnded_(transaction));

    model.transactionHistory = instance;
    return instance;
  }

  return {
    extend: extend,
  };
})();
*/