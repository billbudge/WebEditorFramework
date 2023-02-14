export type ItemVisitor = (item: object) => void;

export type DataAttr = string | number;
export type PropertyVisitor = (item: object, attr: DataAttr) => void;

export interface Model {
  root: object;
  dataModel: DataModel;
}

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
