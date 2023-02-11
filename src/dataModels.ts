namespace DataModels {

  type VisitorFunction = (item: any, attr: string | number) => void;

  class DataModel {
    nextId: number = 1;

    // Visits the item's top level properties.
    visitProperties(item: any, propFn: VisitorFunction) {
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
      visitReferences(item: any, refFn: VisitorFunction) {
        const self = this;
        this.visitProperties(item, function(item, attr) {
          if (self.isReference(item, attr))
            refFn(item, attr);
        });
      },

      // Visits the item's top level properties that are Arrays or child items.
      visitChildren(item: any, childFn: VisitorFunction) {
        const self = this;
        this.visitProperties(item, function(item, attr) {
          const value = item[attr];
          if (!self.isItem(value))
            return;
          if (Array.isArray(value))
            self.visitChildren(value, childFn);
          else
            childFn(value);
        });
      },

      // Visits the item and all of its descendant items.
      visitSubtree: function(item, itemFn) {
        itemFn(item);
        const self = this;
        this.visitChildren(item, function(child) {
          self.visitSubtree(child, itemFn);
        });
      },

      addInitializer: function(initialize) {
        this.initializers.push(initialize);
      },

      initialize: function(item) {
        const self = this,
              root = item || this.root;
        this.visitSubtree(root, function(item) {
          self.initializers.forEach(function(initializer) {
            initializer(item);
          });
        });
      },

    let nextId: number;

    const defaultImpl = {
      // Returns true iff. value is an item in the model.
      isItem: function(value: any) {
        return value && typeof value === 'object';
      },

      // Returns true iff. item[attr] is a model property.
      isProperty: function(item, attr) {
        return attr !== 'id' &&
               item.hasOwnProperty(attr);
      },

      getId: function(item) {
        return item.id;
      },

      assignId: function(item) {
        // 0 is not a valid id in this model.
        const id = nextId++;
        item.id = id;
        return id;
      },

      // Returns true iff. item[attr] is a property that references an item.
      isReference: function(item, attr) {
        const attrName = attr.toString(),
              position = attrName.length - 2;
        return position >= 0 &&
               attrName.lastIndexOf('Id', position) === position;
      },

      configure: function(model) {
        const self = this,
              root = model.root || model;
        this.root = root;

        // Find the maximum id in the model and set nextId to 1 greater.
        nextId = 0;
        this.visitSubtree(root, function(item) {
          const id = self.getId(item);
          if (id)
            nextId = Math.max(nextId, id);
        });
        nextId++;
      },
    }

    function extend(model, impl) {
      if (model.dataModel)
        return model.dataModel;

      const instance = Object.assign(Object.create(proto), impl || defaultImpl);
      instance.model = model;
      instance.configure(model);

      instance.initializers = new Array();

      model.dataModel = instance;
      return instance;
    }

    return {
      extend: extend,
    };
  }

}