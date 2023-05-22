export class ScalarProp {
    get(owner) {
        return owner[this.internalName];
    }
    set(owner, value) {
        const oldValue = owner[this.internalName];
        owner[this.internalName] = value;
        owner.context.valueChanged(owner, this, oldValue);
        return oldValue;
    }
    constructor(name) {
        this.name = name;
        this.internalName = '_' + name;
    }
}
// Internal implementation of List<T>.
class DataList {
    get length() {
        return this.array.length;
    }
    at(index) {
        const array = this.array;
        if (array.length <= index)
            throw new RangeError('Index out of range: ' + index);
        return array[index];
    }
    insert(element, index) {
        this.array.splice(index, 0, element);
        this.owner.context.elementInserted(this.owner, this.prop, index);
    }
    append(element) {
        this.insert(element, this.length);
    }
    indexOf(element) {
        return this.array.indexOf(element);
    }
    removeAt(index) {
        if (this.array.length <= index)
            throw new RangeError('Index out of range: ' + index);
        const oldValue = this.array.splice(index, 1);
        this.owner.context.elementRemoved(this.owner, this.prop, index, oldValue[0]);
        return oldValue[0];
    }
    remove(element) {
        const index = this.indexOf(element);
        if (index >= 0)
            this.removeAt(index);
        return index;
    }
    asArray() {
        return this.array;
    }
    forEach(visitor) {
        this.array.forEach(visitor);
    }
    ;
    forEachReverse(visitor) {
        const array = this.array;
        for (let i = array.length - 1; i >= 0; --i) {
            visitor(array[i]);
        }
    }
    constructor(owner, prop) {
        this.array = new Array();
        this.owner = owner;
        this.prop = prop;
    }
}
export class ChildArrayProp {
    get(owner) {
        let list = owner[this.cacheKey];
        if (list === undefined) {
            list = new DataList(owner, this);
            owner[this.cacheKey] = list;
        }
        return list;
    }
    constructor(name) {
        this.name = name;
        this.internalName = '_' + name;
        this.cacheKey = Symbol.for(name);
    }
}
export class ReferenceProp {
    getRef(owner) {
        return owner[this.cacheKey];
    }
    setRef(owner, value) {
        owner[this.cacheKey] = value;
    }
    get(owner) {
        let ref = this.getRef(owner);
        if (ref === undefined) {
            const id = this.getId(owner);
            if (id) {
                ref = owner.context.resolveReference(owner, this);
                this.setRef(owner, ref);
            }
        }
        return ref;
    }
    set(owner, value) {
        const oldRef = this.get(owner);
        this.setRef(owner, value);
        const newId = (value !== undefined) ? value.id : 0;
        this.setId(owner, newId);
        owner.context.valueChanged(owner, this, oldRef);
        return oldRef;
    }
    getId(owner) {
        return owner[this.internalName];
    }
    setId(owner, id) {
        this.setRef(owner, undefined);
        owner[this.internalName] = id;
    }
    constructor(name) {
        this.name = name;
        this.internalName = '_' + name;
        this.cacheKey = Symbol.for(name);
    }
}
export class IdProp {
    get(owner) {
        return owner['id'];
    }
    setMap(owner, target, map) {
        const value = target;
        map.set(this.get(owner), value);
        return value;
    }
    constructor(name) {
        this.name = name;
    }
}
//------------------------------------------------------------------------------
// Cloning.
function copyItem(original, context, map) {
    const copy = context.construct(original.template.typeName), properties = original.template.properties;
    for (let prop of properties) {
        if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
            prop.set(copy, prop.get(original));
        }
        else if (prop instanceof IdProp) {
            prop.setMap(original, copy, map);
        }
        else if (prop instanceof ChildArrayProp) {
            const originalList = prop.get(original), copyList = prop.get(copy);
            originalList.forEach(original => {
                const copy = copyItem(original, context, map);
                copyList.append(copy);
            });
        }
    }
    return copy;
}
function remapItem(copy, map) {
    const properties = copy.template.properties;
    for (let prop of properties) {
        if (prop instanceof ChildArrayProp) {
            const list = prop.get(copy);
            list.forEach(copy => remapItem(copy, map));
        }
        else if (prop instanceof ReferenceProp) {
            const reference = prop.get(copy);
            if (reference) {
                const refCopy = map.get(reference.id);
                if (refCopy) {
                    prop.set(copy, refCopy);
                }
            }
        }
    }
}
export function copyItems(items, context, map = new Map()) {
    const copies = new Array();
    for (let item of items) {
        copies.push(copyItem(item, context, map));
    }
    for (let copy of copies) {
        remapItem(copy, map);
    }
    return copies;
}
//------------------------------------------------------------------------------
// Serialization/Deserialization, via raw objects.
function serializeItem(original) {
    let result = {
        type: original.template.typeName,
    };
    for (let prop of original.template.properties) {
        if (prop instanceof ScalarProp || prop instanceof IdProp) {
            const value = prop.get(original);
            if (value !== undefined)
                result[prop.name] = value;
        }
        else if (prop instanceof ReferenceProp) {
            const value = prop.getId(original);
            result[prop.name] = value;
        }
        else if (prop instanceof ChildArrayProp) {
            const originalList = prop.get(original), copyList = new Array();
            result[prop.name] = copyList;
            originalList.forEach(child => {
                copyList.push(serializeItem(child));
            });
        }
    }
    return result;
}
export function Serialize(item) {
    return serializeItem(item);
}
// First pass, create objects, copy properties, and build the reference fixup map.
function deserializeItem1(raw, map, context) {
    const type = raw.type, item = context.construct(type);
    for (let prop of item.template.properties) {
        if (prop instanceof ScalarProp) {
            const value = raw[prop.name];
            if (value !== undefined)
                prop.set(item, value);
        }
        else if (prop instanceof IdProp) {
            const id = raw[prop.name];
            if (id !== undefined)
                map.set(id, item);
        }
        else if (prop instanceof ReferenceProp) {
            // Copy the old id, to be remapped in the second pass.
            const id = raw[prop.name];
            prop.setId(item, id);
        }
        else if (prop instanceof ChildArrayProp) {
            const rawList = raw[prop.name], list = prop.get(item);
            if (rawList) {
                for (let rawChild of rawList) {
                    const child = deserializeItem1(rawChild, map, context);
                    list.append(child);
                }
            }
        }
    }
    return item;
}
// Second pass; copy and remap references.
function deserializeItem2(item, map, context) {
    for (let prop of item.template.properties) {
        if (prop instanceof ReferenceProp) {
            const id = prop.getId(item);
            prop.set(item, map.get(id));
        }
        else if (prop instanceof ChildArrayProp) {
            const list = prop.get(item);
            list.forEach(child => deserializeItem2(child, map, context));
        }
    }
    return item;
}
export function Deserialize(raw, context) {
    const map = new Map(), root = deserializeItem1(raw, map, context);
    return deserializeItem2(root, map, context);
}
;
export function getLineage(item) {
    const lineage = new Array();
    while (item) {
        lineage.push(item);
        item = item.parent;
    }
    return lineage;
}
export function getHeight(item) {
    let height = 0;
    while (item) {
        height++;
        item = item.parent;
    }
    return height;
}
export function getLowestCommonAncestor(...items) {
    if (items.length == 0)
        return undefined;
    let lca = items[0];
    let heightLCA = getHeight(lca);
    for (let i = 1; i < items.length; i++) {
        let next = arguments[i];
        let nextHeight = getHeight(next);
        if (heightLCA > nextHeight) {
            while (heightLCA > nextHeight) {
                lca = lca.parent;
                heightLCA--;
            }
        }
        else {
            while (nextHeight > heightLCA) {
                next = next.parent;
                nextHeight--;
            }
        }
        while (heightLCA && nextHeight && lca !== next) {
            lca = lca.parent;
            next = next.parent;
            heightLCA--;
            nextHeight--;
        }
        if (heightLCA == 0 || nextHeight == 0)
            return undefined;
    }
    return lca;
}
export function ancestorInSet(item, set) {
    let ancestor = item.parent;
    while (ancestor) {
        if (set.has(ancestor))
            return true;
        ancestor = ancestor.parent;
    }
    return false;
}
export function reduceToRoots(items, set) {
    const roots = new Array();
    items.forEach(function (item) {
        if (!ancestorInSet(item, set)) {
            roots.push(item);
        }
    });
    return roots;
}
export class EventBase {
    constructor() {
        this.events = new Map();
    }
    addHandler(event, handler) {
        let list = this.events.get(event);
        if (!list) {
            list = new Array();
            this.events.set(event, list);
        }
        // No use case for multiple copies of one handler.
        const index = list.indexOf(handler);
        if (index < 0)
            list.push(handler);
    }
    removeHandler(event, handler) {
        let list = this.events.get(event);
        if (list) {
            const index = list.indexOf(handler);
            if (index >= 0)
                list.splice(index, 1);
        }
    }
    onEvent(event, arg) {
        let list = this.events.get(event);
        if (list)
            list.forEach((handler) => handler(arg));
    }
}
class ChangeOp {
    undo() {
        const change = this.change, item = change.item, prop = change.prop;
        switch (change.type) {
            case 'valueChanged': {
                // value change can be its own inverse if we swap current and old values.
                if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
                    change.oldValue = prop.set(item, change.oldValue);
                }
                break;
            }
            case 'elementInserted': {
                if (prop instanceof ChildArrayProp) {
                    const list = prop.get(item), index = change.index;
                    change.oldValue = list.at(index);
                    list.removeAt(index);
                    change.type = 'elementRemoved';
                }
                break;
            }
            case 'elementRemoved': {
                if (prop instanceof ChildArrayProp) {
                    const list = prop.get(item), index = change.index;
                    list.insert(change.oldValue, index);
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
    constructor(change) {
        this.change = change;
    }
}
export class CompoundOp {
    add(op) {
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
    constructor(name) {
        this.name = name;
        this.ops = [];
    }
}
export class TransactionManager extends EventBase {
    constructor() {
        super(...arguments);
        this.snapshots = new Map();
    }
    // Notifies observers that a transaction has started.
    beginTransaction(name) {
        const transaction = new CompoundOp(name);
        this.transaction = transaction;
        this.snapshots = new Map();
        super.onEvent('transactionBegan', transaction);
        return transaction;
    }
    // Notifies observers that a transaction is ending. Observers should now
    // do any adjustments to make data valid, or cancel the transaction if
    // the data is in an invalid state.
    endTransaction() {
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
    undo(transaction) {
        // Roll back operations.
        transaction.undo();
        super.onEvent('didUndo', transaction);
    }
    // Redoes the operations in the transaction.
    redo(transaction) {
        // Roll forward changes.
        transaction.redo();
        super.onEvent('didRedo', transaction);
    }
    getOldValue(item, attr) {
        const snapshot = this.snapshots.get(item) || item;
        return snapshot[attr];
    }
    getSnapshot(item) {
        let snapshot = this.snapshots.get(item);
        if (!snapshot) {
            snapshot = {};
            this.snapshots.set(item, snapshot);
        }
        return snapshot;
    }
    recordChange(change) {
        // Combine value changes, combine nop insert/remove changes.
        const ops = this.transaction.ops;
        for (let i = 0; i < ops.length; ++i) {
            const op = ops[i];
            if (op instanceof ChangeOp) {
                if (op.change.type === 'valueChanged') {
                    if (op.change.item === change.item && op.change.prop === change.prop) {
                        // Delete the old op and replace it with a new one.
                        change.oldValue = op.change.oldValue;
                        ops.splice(i, 1);
                    }
                }
                else if (op.change.type === 'elementInserted') {
                    if (change.type === 'elementRemoved' &&
                        op.change.item === change.item && op.change.prop === change.prop &&
                        op.change.index === change.index) {
                        // Remove after insert cancel out.
                        ops.splice(i, 1);
                        return;
                    }
                }
                else if (op.change.type === 'elementRemoved') {
                    if (change.type === 'elementInserted' &&
                        op.change.item === change.item && op.change.prop === change.prop &&
                        op.change.index === change.index) {
                        // Insert after remove cancel out.
                        ops.splice(i, 1);
                        return;
                    }
                }
            }
        }
        const op = new ChangeOp(change);
        this.transaction.add(op);
    }
    onChanged(change) {
        if (!this.transaction)
            return;
        const item = change.item, prop = change.prop;
        if (change.type === 'valueChanged') {
            // Coalesce value changes. Only record them the first time we observe
            // the (item, prop) change.
            const snapshot = this.getSnapshot(item);
            if (!snapshot.hasOwnProperty(prop.name)) {
                snapshot[prop.name] = change.oldValue;
            }
            this.recordChange(change);
        }
        else {
            if (change.type === 'elementInserted') {
                const snapshot = this.getSnapshot(item);
                item.template.properties.forEach((prop) => {
                    const value = prop.get(item);
                    snapshot[prop.name] = value;
                });
            }
            this.recordChange(change);
        }
    }
}
class SelectionOp {
    undo() {
        this.selectionSet.set(this.startingSelection);
    }
    redo() {
        this.selectionSet.set(this.endingSelection);
    }
    constructor(selectionSet, startingSelection) {
        this.selectionSet = selectionSet;
        this.startingSelection = startingSelection;
        this.endingSelection = selectionSet.contents();
    }
}
export class HistoryManager {
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
            this.done.push(this.undone.pop());
        }
    }
    undo() {
        const transaction = this.getUndo();
        if (transaction) {
            this.transactionManager.undo(transaction);
            this.undone.push(this.done.pop());
        }
    }
    onTransactionBegan(op) {
        const selectionSet = this.selectionSet;
        this.startingSelection = selectionSet.contents();
    }
    onTransactionEnding(op) {
        const selectionSet = this.selectionSet;
        const startingSelection = this.startingSelection || [];
        let endingSelection = selectionSet.contents();
        if (startingSelection.length === endingSelection.length &&
            startingSelection.every(function (element, i) {
                return element === endingSelection[i];
            })) {
            return; // endingSelection and startingSelection are the same.
        }
        const selectionOp = new SelectionOp(selectionSet, startingSelection);
        op.add(selectionOp);
        this.startingSelection = [];
    }
    onTransactionEnded(op) {
        this.startingSelection = [];
        if (this.undone.length)
            this.undone = [];
        this.done.push(op);
    }
    onTransactionCancelled(op) {
        this.selectionSet.set(this.startingSelection);
        this.startingSelection = [];
    }
    constructor(transactionManager, selectionSet) {
        this.done = [];
        this.undone = [];
        this.transactionManager = transactionManager;
        this.selectionSet = selectionSet;
        transactionManager.addHandler('transactionBegan', this.onTransactionBegan.bind(this));
        transactionManager.addHandler('transactionEnding', this.onTransactionEnding.bind(this));
        transactionManager.addHandler('transactionEnded', this.onTransactionEnded.bind(this));
        transactionManager.addHandler('transactionCancelled', this.onTransactionCancelled.bind(this));
    }
}
//# sourceMappingURL=dataModels.js.map