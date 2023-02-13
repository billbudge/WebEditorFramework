// export type ItemVisitor = (item: object) => void;
// export type AttributeVisitor = (item: object, attr: string | number) => void;

// export interface Model {
//   root: object;
// }

// export class DataModel {
//   nextId: number = 1;
//   root: object;
//   initializers: Array<ItemVisitor> = new Array();

//   // Returns true iff. value is an item in the model.
//   isItem(value: any) : boolean {
//     return value && typeof value === 'object';
//   }

//   // Returns true iff. item[attr] is a model property.
//   isProperty(item: object, attr: string | number) : boolean {
//     return attr !== 'id' &&
//             item.hasOwnProperty(attr);
//   }

//   getId(item: object) : number {
//     return item['id'];
//   }

//   assignId(item: object) : number {
//     // 0 is not a valid id in this model.
//     const id = this.nextId++;
//     item['id'] = id;
//     return id;
//   }

//   // Returns true iff. item[attr] is a property that references an item.
//   isReference(item: object, attr: string | number) {
//     const attrName = attr.toString(),
//           position = attrName.length - 2;
//     return position >= 0 &&
//             attrName.lastIndexOf('Id', position) === position;
//   }

//   configure(model: Model) {
//     const self = this,
//           root = model.root || model;
//     this.root = root;

//     // Find the maximum id in the model and set nextId to 1 greater.
//     this.nextId = 0;
//     this.visitSubtree(root, function(item: object) {
//       const id = self.getId(item);
//       if (id)
//         this.nextId = Math.max(this.nextId, id);
//     });
//     this.nextId++;
//   }

//   // Visits the item's top level properties.
//   visitProperties(item: object, propFn: AttributeVisitor) {
//     if (Array.isArray(item)) {
//       // Array item.
//       const length = item.length;
//       for (let i = 0; i < length; i++)
//         propFn(item, i);
//     } else {
//       // Object.
//       for (let attr in item) {
//         if (this.isProperty(item, attr))
//           propFn(item, attr);
//       }
//     }
//   }

//   // Visits the item's top level reference properties.
//   visitReferences(item: object, refFn: AttributeVisitor) {
//     const self = this;
//     this.visitProperties(item, function(item, attr) {
//       if (self.isReference(item, attr))
//         refFn(item, attr);
//     });
//   }

//   // Visits the item's top level properties that are Arrays or child items.
//   visitChildren(item: object, childFn: ItemVisitor) {
//     const self = this;
//     this.visitProperties(item, function(item, attr) {
//       const value = item[attr];
//       if (!self.isItem(value))
//         return;
//       if (Array.isArray(value))
//         self.visitChildren(value, childFn);
//       else
//         childFn(value);
//     });
//   }

//   // Visits the item and all of its descendant items.
//   visitSubtree(item: object, itemFn: ItemVisitor) {
//     itemFn(item);
//     const self = this;
//     this.visitChildren(item, function(child) {
//       self.visitSubtree(child, itemFn);
//     });
//   }

//   addInitializer(initialize: ItemVisitor) {
//     this.initializers.push(initialize);
//   }

//   initialize(item: object) {
//     const self = this,
//           root = item || this.root;
//     this.visitSubtree(root, function(item) {
//       self.initializers.forEach(function(initializer) {
//         initializer(item);
//       });
//     });
//   }

//   constructor(model: Model) {
//     this.root = model.root;
//     model['dataModel'] = this;
//   }

//   static extend(model: Model) : DataModel {
//     let instance = model['dataModel'];
//     if (!instance)
//       instance = new DataModel(model);
//     return instance;
//   }


//   // function extend(model, impl) {
//   //   if (model.dataModel)
//   //     return model.dataModel;

//   //   const instance = Object.assign(Object.create(proto), impl || defaultImpl);
//   //   instance.model = model;
//   //   instance.configure(model);

//   //   instance.initializers = new Array();

//   //   model.dataModel = instance;
//   //   return instance;
//   // }

//   // return {
//   //   extend: extend,
//   // };
// }
