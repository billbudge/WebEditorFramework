export type ItemVisitor = (item: object) => void;

export type DataAttr = string | number;
export type PropertyVisitor = (item: object, attr: DataAttr) => void;

export interface Model {
  root: object;
  dataModel: DataModel;
  observableModel?: ObservableModel;
}

// TODO add ObservableModel
// TODO add ReferencingModel
// TODO remove id and referencing from DataModel
// TODO make models generic

//------------------------------------------------------------------------------

// Base DataModel.

export class DataModel {
  private highestId: number = 0;  // 0 stands for no id.
  private root_: object;
  private initializers: Array<ItemVisitor> = new Array();

  root() : object {
    return this.root_;
  }
  // Returns true iff. item[attr] is a model property.
  isProperty(item: object, attr: DataAttr) : boolean {
    return attr !== 'id' &&
           item.hasOwnProperty(attr);
  }

  getId(item: any) : number {
    return item.id as number;
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

  // Visits the item's top level reference properties.
  visitReferences(item: object, refFn: PropertyVisitor) {
    const self = this;
    this.visitProperties(item, function(item, attr) {
      if (self.isReference(item, attr))
        refFn(item, attr);
    });
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
    const self = this;
    // Find the highest id in the model.
    const unidentifed = new Array();
    this.visitSubtree(root, function(item: object) {
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

// export class ReferencingModel {
//     // Gets the object that is referenced by item[attr]. Default is to return
//     // item[_attr].
//     getReference(item, attr) {
//       return item[Symbol.for(attr)] || this.resolveReference(item, attr);
//     }

//     getReferenceFn(attr) {
//       // this object caches the reference functions, indexed by the symbol.
//       const self = this, symbol = Symbol.for(attr);
//       let fn = this[symbol];
//       if (!fn) {
//         fn = item => { return item[symbol] || self.resolveReference(item, attr); };
//         self[symbol] = fn;
//       }
//       return fn;
//     }

//     // Resolves an id to a target item if possible.
//     resolveId(id) {
//       return this.targets_.get(id);
//     }

//     // Resolves a reference to a target item if possible.
//     resolveReference(item, attr) {
//       const newId = item[attr],
//             newTarget = this.resolveId(newId);
//       item[Symbol.for(attr)] = newTarget;
//       return newTarget;
//     }

//     // Recursively adds item and sub-items as potential reference targets, and
//     // resolves any references they contain.
//     addTargets_(item) {
//       const self = this, dataModel = this.model.dataModel;
//       dataModel.visitSubtree(item, function(item) {
//         const id = dataModel.getId(item);
//         if (id)
//           self.targets_.set(id, item);
//       });
//       dataModel.visitSubtree(item, function(item) {
//         dataModel.visitReferences(item, function(item, attr) {
//           self.resolveReference(item, attr);
//         });
//       });
//     }

//     // Recursively removes item and sub-items as potential reference targets.
//     removeTargets_(item) {
//       const self = this, dataModel = this.model.dataModel;
//       dataModel.visitSubtree(item, function(item) {
//         const id = dataModel.getId(item);
//         if (id)
//           self.targets_.delete(id);
//       });
//     }

//     onChanged_(change) {
//       const dataModel = this.model.dataModel,
//             item = change.item,
//             attr = change.attr;
//       switch (change.type) {
//         case 'valueChanged': {
//           if (dataModel.isReference(item, attr)) {
//             this.resolveReference(item, attr);
//           } else {
//             const oldValue = change.oldValue;
//             if (dataModel.isItem(oldValue))
//               this.removeTargets_(oldValue);
//             const newValue = item[attr];
//             if (dataModel.isItem(newValue))
//               this.addTargets_(newValue);
//           }
//           break;
//         }
//         case 'insert': {
//           const newValue = item[attr][change.index];
//           if (dataModel.isItem(newValue))
//             this.addTargets_(newValue);
//           break;
//         }
//         case 'remove': {
//           const oldValue = change.oldValue;
//           if (dataModel.isItem(oldValue))
//             this.removeTargets_(oldValue);
//           break;
//         }
//       }
//     }

// }

/*
// Referencing model. It tracks reference targets in the data and resolves
// reference properties from ids to actual references.
const referencingModel = (function() {
  const proto = {
    // Gets the object that is referenced by item[attr]. Default is to return
    // item[_attr].
    getReference: function(item, attr) {
      return item[Symbol.for(attr)] || this.resolveReference(item, attr);
    },

    getReferenceFn: function(attr) {
      // this object caches the reference functions, indexed by the symbol.
      const self = this, symbol = Symbol.for(attr);
      let fn = this[symbol];
      if (!fn) {
        fn = item => { return item[symbol] || self.resolveReference(item, attr); };
        self[symbol] = fn;
      }
      return fn;
    },

    // Resolves an id to a target item if possible.
    resolveId: function(id) {
      return this.targets_.get(id);
    },

    // Resolves a reference to a target item if possible.
    resolveReference: function(item, attr) {
      const newId = item[attr],
            newTarget = this.resolveId(newId);
      item[Symbol.for(attr)] = newTarget;
      return newTarget;
    },

    // Recursively adds item and sub-items as potential reference targets, and
    // resolves any references they contain.
    addTargets_: function(item) {
      const self = this, dataModel = this.model.dataModel;
      dataModel.visitSubtree(item, function(item) {
        const id = dataModel.getId(item);
        if (id)
          self.targets_.set(id, item);
      });
      dataModel.visitSubtree(item, function(item) {
        dataModel.visitReferences(item, function(item, attr) {
          self.resolveReference(item, attr);
        });
      });
    },

    // Recursively removes item and sub-items as potential reference targets.
    removeTargets_: function(item) {
      const self = this, dataModel = this.model.dataModel;
      dataModel.visitSubtree(item, function(item) {
        const id = dataModel.getId(item);
        if (id)
          self.targets_.delete(id);
      });
    },

    onChanged_: function(change) {
      const dataModel = this.model.dataModel,
            item = change.item,
            attr = change.attr;
      switch (change.type) {
        case 'change': {
          if (dataModel.isReference(item, attr)) {
            this.resolveReference(item, attr);
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
        case 'insert': {
          const newValue = item[attr][change.index];
          if (dataModel.isItem(newValue))
            this.addTargets_(newValue);
          break;
        }
        case 'remove': {
          const oldValue = change.oldValue;
          if (dataModel.isItem(oldValue))
            this.removeTargets_(oldValue);
          break;
        }
      }
    },
  }

  function extend(model) {
    if (model.referencingModel)
      return model.referencingModel;

    dataModel.extend(model);

    const instance = Object.create(proto);
    instance.model = model;
    if (model.observableModel) {
      model.observableModel.addHandler('changed',
                                       change => instance.onChanged_(change));
    }
    instance.targets_ = new Map();
    instance.addTargets_(model.dataModel.root);

    model.referencingModel = instance;
    return instance;
  }

  return {
    extend: extend,
  };
})();
*/