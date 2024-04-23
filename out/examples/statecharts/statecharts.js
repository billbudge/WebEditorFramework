import { SelectionSet } from '../../src/collections.js';
import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam, circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, diskPath, hitTestDisk, roundRectPath, bezierEdgePath, hitTestBezier, measureNameValuePairs, FileController } from '../../src/diagrams.js';
import { getExtents, projectPointToCircle, evaluateBezier, expandRect } from '../../src/geometry.js';
import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, EventBase, copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet, reduceToRoots, TransactionManager, HistoryManager } from '../../src/dataModels.js';
//------------------------------------------------------------------------------
const idProp = new IdProp('id'), xProp = new ScalarProp('x'), yProp = new ScalarProp('y'), nameProp = new ScalarProp('name'), widthProp = new ScalarProp('width'), heightProp = new ScalarProp('height'), entryProp = new ScalarProp('entry'), exitProp = new ScalarProp('exit'), srcProp = new ReferenceProp('src'), tSrcProp = new ScalarProp('tSrc'), dstProp = new ReferenceProp('dst'), tDstProp = new ScalarProp('tDst'), eventProp = new ScalarProp('event'), guardProp = new ScalarProp('guard'), actionProp = new ScalarProp('action'), tTextProp = new ScalarProp('tText'), statesProp = new ChildArrayProp('states'), transitionsProp = new ChildArrayProp('transitions'), statechartsProp = new ChildArrayProp('statecharts');
// Implement type-safe interfaces as well as a raw data interface for
// cloning, serialization, etc.
class StateBaseTemplate {
    constructor() {
        this.id = idProp;
        this.x = xProp;
        this.y = yProp;
    }
}
class StateTemplate extends StateBaseTemplate {
    constructor() {
        super(...arguments);
        this.typeName = 'state';
        this.width = widthProp;
        this.height = heightProp;
        this.name = nameProp;
        this.entry = entryProp;
        this.exit = exitProp;
        this.statecharts = statechartsProp;
        this.properties = [this.id, this.x, this.y, this.width, this.height,
            this.name, this.entry, this.exit, this.statecharts];
    }
}
class PseudostateTemplate extends StateBaseTemplate {
    constructor(typeName) {
        super();
        this.properties = [this.id, this.x, this.y];
        this.typeName = typeName;
    }
}
class TransitionTemplate {
    constructor() {
        this.typeName = 'transition';
        this.src = srcProp;
        this.tSrc = tSrcProp;
        this.dst = dstProp;
        this.tDst = tDstProp;
        this.event = eventProp;
        this.guard = guardProp;
        this.action = actionProp;
        this.tText = tTextProp;
        this.properties = [this.src, this.tSrc, this.dst, this.tDst, this.event,
            this.guard, this.action, this.tText];
    }
}
class StatechartTemplate {
    constructor() {
        this.typeName = 'statechart';
        this.x = xProp;
        this.y = yProp;
        this.width = widthProp;
        this.height = heightProp;
        this.name = nameProp;
        this.states = statesProp;
        this.transitions = transitionsProp;
        this.properties = [this.x, this.y, this.width, this.height, this.name,
            this.states, this.transitions];
    }
}
const stateTemplate = new StateTemplate(), startPseudostateTemplate = new PseudostateTemplate('start'), stopPseudostateTemplate = new PseudostateTemplate('stop'), historyPseudostateTemplate = new PseudostateTemplate('history'), deepHistoryPseudostateTemplate = new PseudostateTemplate('history*'), transitionTemplate = new TransitionTemplate(), statechartTemplate = new StatechartTemplate();
const defaultPoint = { x: 0, y: 0 }, defaultPointWithNormal = { x: 0, y: 0, nx: 0, ny: 0 }, defaultBezierCurve = [
    defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal
];
class StateBase {
    constructor(id) {
        this.globalPosition = defaultPoint;
        this.inTransitions = new Array();
        this.outTransitions = new Array();
        this.id = id;
    }
}
export class State extends StateBase {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get width() { return this.template.width.get(this) || 0; }
    set width(value) { this.template.width.set(this, value); }
    get height() { return this.template.height.get(this) || 0; }
    set height(value) { this.template.height.set(this, value); }
    get name() { return this.template.name.get(this); }
    set name(value) { this.template.name.set(this, value); }
    get entry() { return this.template.entry.get(this); }
    set entry(value) { this.template.entry.set(this, value); }
    get exit() { return this.template.exit.get(this); }
    set exit(value) { this.template.exit.set(this, value); }
    get statecharts() { return this.template.statecharts.get(this); }
    constructor(context, id) {
        super(id);
        this.template = stateTemplate;
        // Derived properties.
        this.entryText = '';
        this.entryY = 0;
        this.exitText = '';
        this.exitY = 0;
        this.context = context;
    }
}
export class Pseudostate extends StateBase {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    constructor(template, id, context) {
        super(id);
        this.template = template;
        this.context = context;
    }
}
export class Transition {
    get src() { return this.template.src.get(this); }
    set src(value) { this.template.src.set(this, value); }
    get tSrc() { return this.template.tSrc.get(this) || 0; }
    set tSrc(value) { this.template.tSrc.set(this, value); }
    get dst() { return this.template.dst.get(this); }
    set dst(value) { this.template.dst.set(this, value); }
    get tDst() { return this.template.tDst.get(this) || 0; }
    set tDst(value) { this.template.tDst.set(this, value); }
    get event() { return this.template.event.get(this); }
    set event(value) { this.template.event.set(this, value); }
    get guard() { return this.template.guard.get(this); }
    set guard(value) { this.template.guard.set(this, value); }
    get action() { return this.template.action.get(this); }
    set action(value) { this.template.action.set(this, value); }
    get tText() { return this.template.tText.get(this) || 0; }
    set tText(value) { this.template.tText.set(this, value); }
    constructor(context) {
        this.template = transitionTemplate;
        this.bezier = defaultBezierCurve;
        this.textPoint = defaultPoint;
        this.text = '';
        this.textWidth = 0;
        this.context = context;
    }
}
export class Statechart {
    get x() { return this.template.x.get(this) || 0; }
    set x(value) { this.template.x.set(this, value); }
    get y() { return this.template.y.get(this) || 0; }
    set y(value) { this.template.y.set(this, value); }
    get width() { return this.template.width.get(this) || 0; }
    set width(value) { this.template.width.set(this, value); }
    get height() { return this.template.height.get(this) || 0; }
    set height(value) { this.template.height.set(this, value); }
    get name() { return this.template.name.get(this) || ''; }
    set name(value) { this.template.name.set(this, value); }
    get states() { return this.template.states.get(this); }
    get transitions() { return this.template.transitions.get(this); }
    constructor(context) {
        this.template = statechartTemplate;
        this.globalPosition = defaultPoint;
        this.context = context;
    }
}
export class StatechartContext extends EventBase {
    constructor() {
        super();
        this.highestId = 0; // 0 stands for no id.
        this.stateMap = new Map();
        this.states = new Set;
        this.statecharts = new Set;
        this.transitions = new Set;
        this.selection = new SelectionSet();
        const self = this;
        this.transactionManager = new TransactionManager();
        this.addHandler('changed', this.transactionManager.onChanged.bind(this.transactionManager));
        this.transactionManager.addHandler('transactionEnding', () => {
            self.makeConsistent();
            if (!self.isValidStatechart(self.statechart)) {
                self.transactionManager.cancelTransaction();
            }
        });
        this.historyManager = new HistoryManager(this.transactionManager, this.selection);
        this.statechart = new Statechart(this);
        this.insertStatechart(this.statechart, undefined);
    }
    get root() {
        return this.statechart;
    }
    set root(root) {
        if (this.statechart)
            this.removeItem(this.statechart);
        this.insertStatechart(root, undefined);
        this.statechart = root;
    }
    newState() {
        const nextId = ++this.highestId, result = new State(this, nextId);
        this.stateMap.set(nextId, result);
        return result;
    }
    newPseudostate(typeName) {
        const nextId = ++this.highestId;
        let template;
        switch (typeName) {
            case 'start':
                template = startPseudostateTemplate;
                break;
            case 'stop':
                template = stopPseudostateTemplate;
                break;
            case 'history':
                template = historyPseudostateTemplate;
                break;
            case 'history*':
                template = deepHistoryPseudostateTemplate;
                break;
            default: throw new Error('Unknown pseudostate type: ' + typeName);
        }
        const result = new Pseudostate(template, nextId, this);
        this.stateMap.set(nextId, result);
        return result;
    }
    newTransition(src, dst) {
        const result = new Transition(this);
        result.src = src;
        result.dst = dst;
        return result;
    }
    newStatechart() {
        const result = new Statechart(this);
        return result;
    }
    // TODO rework visit functions to match functioncharts.
    visitAll(item, visitor) {
        const self = this;
        visitor(item);
        if (item instanceof State) {
            item.statecharts.forEach(t => self.visitAll(t, visitor));
        }
        else if (item instanceof Statechart) {
            item.states.forEach(t => self.visitAll(t, visitor));
            item.transitions.forEach(t => self.visitAll(t, visitor));
        }
    }
    reverseVisitAll(item, visitor) {
        const self = this;
        if (item instanceof State) {
            item.statecharts.forEachReverse(t => self.reverseVisitAll(t, visitor));
        }
        else if (item instanceof Statechart) {
            item.states.forEachReverse(t => self.reverseVisitAll(t, visitor));
            item.transitions.forEachReverse(t => self.reverseVisitAll(t, visitor));
        }
        visitor(item);
    }
    visitNonTransitions(item, visitor) {
        const self = this;
        if (item instanceof State) {
            visitor(item);
            item.statecharts.forEach(item => self.visitNonTransitions(item, visitor));
        }
        else if (item instanceof Pseudostate) {
            visitor(item);
        }
        else if (item instanceof Statechart) {
            visitor(item);
            item.states.forEach(item => self.visitNonTransitions(item, visitor));
        }
    }
    reverseVisitNonTransitions(item, visitor) {
        const self = this;
        if (item instanceof State) {
            item.statecharts.forEachReverse(item => self.reverseVisitNonTransitions(item, visitor));
            visitor(item);
        }
        else if (item instanceof Pseudostate) {
            visitor(item);
        }
        else if (item instanceof Statechart) {
            item.states.forEachReverse(item => self.reverseVisitNonTransitions(item, visitor));
            visitor(item);
        }
    }
    visitTransitions(item, visitor) {
        const self = this;
        if (item instanceof State) {
            item.statecharts.forEach(item => self.visitTransitions(item, visitor));
        }
        else if (item instanceof Statechart) {
            item.transitions.forEach(item => visitor(item));
            item.states.forEach(item => self.visitTransitions(item, visitor));
        }
    }
    reverseVisitTransitions(item, visitor) {
        const self = this;
        if (item instanceof State) {
            item.statecharts.forEachReverse(item => self.reverseVisitTransitions(item, visitor));
        }
        else if (item instanceof Statechart) {
            item.states.forEachReverse(item => self.reverseVisitTransitions(item, visitor));
            item.transitions.forEachReverse(item => visitor(item));
        }
    }
    updateItem(item) {
        const self = this;
        this.visitNonTransitions(item, item => self.setGlobalPosition(item));
    }
    getGrandParent(item) {
        let result = item.parent;
        if (result)
            result = result.parent;
        return result;
    }
    forInTransitions(state, visitor) {
        const inputs = state.inTransitions;
        inputs.forEach((input, i) => visitor(input));
    }
    forOutTransitions(state, visitor) {
        const outputs = state.outTransitions;
        outputs.forEach((output, i) => visitor(output));
    }
    // Gets the translation to move an item from its current parent to
    // newParent.
    getToParent(item, newParent) {
        const oldParent = item.parent;
        let dx = 0, dy = 0;
        if (oldParent) {
            const global = oldParent.globalPosition;
            dx += global.x;
            dy += global.y;
        }
        if (newParent) {
            const global = newParent.globalPosition;
            dx -= global.x;
            dy -= global.y;
        }
        return { x: dx, y: dy };
    }
    setGlobalPosition(item) {
        const x = item.x, y = item.y, parent = item.parent;
        if (parent) {
            // console.log(item.type, parent.type, parent.globalPosition);
            const global = parent.globalPosition;
            if (global) {
                item.globalPosition = { x: x + global.x, y: y + global.y };
            }
        }
        else {
            item.globalPosition = { x: x, y: y };
        }
    }
    getGraphInfo() {
        return {
            states: this.states,
            statecharts: this.statecharts,
            transitions: this.transitions,
            interiorTransitions: this.transitions,
            inTransitions: new Set(),
            outTransitions: new Set(),
        };
    }
    getSubgraphInfo(items) {
        const self = this, states = new Set(), statecharts = new Set(), transitions = new Set(), interiorTransitions = new Set(), inTransitions = new Set(), outTransitions = new Set();
        // First collect states and statecharts.
        items.forEach(item => {
            this.visitAll(item, item => {
                if (item instanceof StateBase)
                    states.add(item);
                else if (item instanceof Statechart)
                    statecharts.add(item);
            });
        });
        // Now collect and classify transitions that connect to them.
        items.forEach(item => {
            function addTransition(transition) {
                // Stop if we've already processed this transtion (handle transitions from a state to itself.)
                if (transitions.has(transition))
                    return;
                transitions.add(transition);
                const src = transition.src, dst = transition.dst, srcInside = states.has(src), dstInside = states.has(dst);
                if (srcInside) {
                    if (dstInside) {
                        interiorTransitions.add(transition);
                    }
                    else {
                        outTransitions.add(transition);
                    }
                }
                if (dstInside) {
                    if (!srcInside) {
                        inTransitions.add(transition);
                    }
                }
            }
            if (item instanceof StateBase) {
                self.forInTransitions(item, addTransition);
                self.forOutTransitions(item, addTransition);
            }
        });
        return {
            states: states,
            statecharts: statecharts,
            transitions: transitions,
            interiorTransitions: interiorTransitions,
            inTransitions: inTransitions,
            outTransitions: outTransitions,
        };
    }
    getConnectedStates(states, upstream, downstream) {
        const result = new Set();
        states = states.slice(0); // Copy input array
        while (states.length > 0) {
            const state = states.pop();
            if (!state)
                continue;
            result.add(state);
            if (upstream) {
                this.forInTransitions(state, transition => {
                    const src = transition.src;
                    if (!result.has(src))
                        states.push(src);
                });
            }
            if (downstream) {
                this.forOutTransitions(state, transition => {
                    const dst = transition.dst;
                    if (!result.has(dst))
                        states.push(dst);
                });
            }
        }
        return result;
    }
    getTopLevelState(item) {
        const topLevelStatechart = this.statechart;
        while (true) {
            const statechart = item.parent;
            if (!statechart || statechart === topLevelStatechart)
                return item;
            item = statechart.parent; // statechart.parent is not null
        }
    }
    // Returns a value indicating if the item can be added to the state
    // without violating statechart constraints.
    canAddItem(item, statechart) {
        // The only constraint is that there can't be two start states in a statechart.
        if (!(item instanceof Pseudostate) || item.template.typeName !== 'start')
            return true;
        for (let child of statechart.states.asArray()) {
            if (child !== item && child instanceof Pseudostate && child.template.typeName === 'start')
                return false;
        }
        return true;
    }
    isValidTransition(src, dst) {
        if (!src || !dst)
            return false;
        // No transition to self for pseudostates.
        if (src === dst)
            return src instanceof State;
        // No transitions to a start pseudostate.
        if (dst instanceof Pseudostate && dst.template.typeName === 'start')
            return false;
        // No transitions from a stop pseudostate.
        if (src instanceof Pseudostate && src.template.typeName === 'stop')
            return false;
        // No transitions out of parent state for start or history pseudostates.
        if (src instanceof Pseudostate && (src.template.typeName === 'start' || src.template.typeName === 'history' ||
            src.template.typeName === 'history*')) {
            const srcParent = src.parent, dstParent = dst.parent;
            return srcParent === dstParent;
        }
        // Transitions can't straddle parallel statecharts. The lowest common ancestor
        // of src and dst must be a statechart, not a state, except for "inside" transitions.
        const lca = getLowestCommonAncestor(src, dst);
        if (!lca)
            return false;
        // Allow transitions between a super state and its child states.
        if (lca instanceof State)
            return src === this.getGrandParent(dst);
        return lca instanceof Statechart;
    }
    findOrCreateTargetForDrop(items, originalTarget) {
        const self = this;
        let target;
        if (originalTarget instanceof Statechart) {
            target = originalTarget;
            // Check that the items can be added. The root statechart is an exception that we don't check.
            // For non-root statecharts, we must add another statechart to the parent superstate.
            if (target.parent) {
                const canDrop = items.every((item) => { return !(item instanceof StateBase) || self.canAddItem(item, target); });
                if (!canDrop) {
                    // Call this function on the parent state. This has the effect of adding a new empty statechart.
                    target = this.findOrCreateTargetForDrop(items, target.parent);
                }
            }
        }
        else {
            // Add the first statechart to a new superstate. The items can be added.
            target = this.newStatechart();
            originalTarget.statecharts.append(target);
        }
        return target;
    }
    beginTransaction(name) {
        this.transactionManager.beginTransaction(name);
    }
    endTransaction() {
        this.transactionManager.endTransaction();
    }
    cancelTransaction() {
        this.transactionManager.cancelTransaction();
    }
    getUndo() {
        return this.historyManager.getUndo();
    }
    undo() {
        this.historyManager.undo();
    }
    getRedo() {
        return this.historyManager.getRedo();
    }
    redo() {
        this.historyManager.redo();
    }
    select(item) {
        this.selection.add(item);
    }
    selectionContents() {
        return this.selection.contents();
    }
    selectedStates() {
        const result = new Array();
        this.selection.forEach(item => {
            if (item instanceof StateBase)
                result.push(item);
        });
        return result;
    }
    reduceSelection() {
        const selection = this.selection;
        // First, replace statecharts by their parent state. We do this by adding parent
        // states to the selection before reducing.
        selection.forEach(function (item) {
            if (item instanceof Statechart) {
                selection.delete(item);
                if (item.parent)
                    selection.add(item.parent);
            }
        });
        const roots = reduceToRoots(selection.contents(), selection);
        // Reverse, to preserve the previous order of selection.
        selection.set(roots.reverse());
    }
    disconnectSelection() {
        const self = this;
        this.selectedStates().forEach(state => {
            self.forInTransitions(state, transition => this.deleteItem(transition));
            self.forOutTransitions(state, transition => this.deleteItem(transition));
        });
    }
    selectInteriorTransitions() {
        const self = this, graphInfo = this.getSubgraphInfo(this.selectedStates());
        graphInfo.interiorTransitions.forEach(transition => self.selection.add(transition));
    }
    selectConnectedStates(upstream) {
        const selectedStates = this.selectedStates(), connectedStates = this.getConnectedStates(selectedStates, upstream, true);
        this.selection.set(Array.from(connectedStates));
    }
    addItem(item, parent) {
        const oldParent = item.parent;
        if (!parent)
            parent = this.statechart;
        if (oldParent === parent)
            return item;
        // At this point we can add item to parent.
        if (item instanceof StateBase) {
            const translation = this.getToParent(item, parent);
            item.x += translation.x;
            item.y += translation.y;
        }
        if (oldParent)
            this.deleteItem(item);
        if (parent instanceof Statechart) {
            if (item instanceof Transition) {
                parent.transitions.append(item);
            }
            else if (item instanceof StateBase) {
                parent.states.append(item);
            }
        }
        return item;
    }
    addItems(items, parent) {
        // Add states first, then transitions, so the context can track transitions.
        for (let item of items) {
            if (item instanceof StateBase)
                this.addItem(item, parent);
        }
        for (let item of items) {
            if (item instanceof Transition)
                this.addItem(item, parent);
        }
    }
    deleteItem(item) {
        if (item.parent) {
            if (item instanceof Transition)
                item.parent.transitions.remove(item);
            else if (item instanceof Statechart)
                item.parent.statecharts.remove(item);
            else
                item.parent.states.remove(item);
        }
        this.selection.delete(item);
    }
    deleteItems(items) {
        const self = this;
        items.forEach(item => self.deleteItem(item));
    }
    copy() {
        const statechart = this.statechart, selection = this.selection;
        selection.set(this.selectedStates());
        this.selectInteriorTransitions();
        this.reduceSelection();
        const selected = selection.contents(), map = new Map(), copies = copyItems(selected, this, map);
        selected.forEach(item => {
            if (item instanceof StateBase) {
                const copy = map.get(item.id);
                if (copy) {
                    const translation = this.getToParent(item, statechart);
                    copy.x += translation.x;
                    copy.y += translation.y;
                }
            }
        });
        return copies;
    }
    paste(items) {
        this.transactionManager.beginTransaction('paste');
        items.forEach(item => {
            // Offset paste so copies don't overlap with the originals.
            if (item instanceof StateBase) {
                item.x += 16;
                item.y += 16;
            }
        });
        const copies = copyItems(items, this); // TODO fix
        this.addItems(copies, this.statechart);
        this.selection.set(copies);
        this.transactionManager.endTransaction();
        return copies;
    }
    deleteSelectionHelper() {
        this.reduceSelection();
        this.disconnectSelection();
        this.deleteItems(this.selection.contents());
    }
    cut() {
        this.transactionManager.beginTransaction('cut');
        const result = this.copy();
        this.deleteSelectionHelper();
        this.transactionManager.endTransaction();
        return result;
    }
    deleteSelection() {
        this.transactionManager.beginTransaction('delete');
        this.deleteSelectionHelper();
        this.transactionManager.endTransaction();
    }
    group(items, grandparent, bounds) {
        const parent = this.newState();
        parent.x = bounds.x;
        parent.y = bounds.y;
        // parent.width = bounds.width;
        // parent.height = bounds.height;
        this.addItem(parent, grandparent);
        const statechart = this.newStatechart();
        parent.statecharts.append(statechart);
        this.addItems(items, statechart);
    }
    makeConsistent() {
        const self = this, statechart = this.statechart, graphInfo = this.getGraphInfo();
        // Eliminate dangling transitions.
        graphInfo.transitions.forEach(transition => {
            const src = transition.src, dst = transition.dst;
            if (!src || !graphInfo.states.has(src) ||
                !dst || !graphInfo.states.has(dst)) {
                self.deleteItem(transition);
                return;
            }
            // Make sure transitions belong to lowest common statechart.
            const lca = getLowestCommonAncestor(src, dst);
            if (transition.parent !== lca) {
                self.deleteItem(transition);
                self.addItem(transition, lca);
            }
        });
        // Delete any empty statecharts (except for the root statechart).
        graphInfo.statecharts.forEach(statechart => {
            if (statechart.parent &&
                statechart.states.length === 0)
                self.deleteItem(statechart);
        });
    }
    isValidStatechart(statechart) {
        const self = this;
        let startingStates = 0;
        // A statechart is valid if its states and transitions are valid.
        let valid = true;
        statechart.transitions.forEach(transition => {
            if (!self.isValidTransition(transition.src, transition.dst))
                valid = false;
        });
        statechart.states.forEach(state => {
            if (state instanceof State) {
                state.statecharts.forEach(statechart => {
                    if (!self.isValidStatechart(statechart))
                        valid = false;
                });
            }
            else {
                // Pseudostate...
            }
        });
        return valid;
    }
    insertState(state, parent) {
        state.parent = parent;
        this.updateItem(state);
        this.states.add(state);
        if (state instanceof State && state.statecharts) {
            const self = this;
            state.statecharts.forEach(statechart => self.insertStatechart(statechart, state));
        }
    }
    removeState(state) {
        this.states.delete(state);
        if (state instanceof State && state.statecharts) {
            const self = this;
            state.statecharts.forEach(statechart => self.removeStatechart(statechart));
        }
    }
    // Allow parent to be undefined for the root statechart.
    insertStatechart(statechart, parent) {
        statechart.parent = parent;
        this.updateItem(statechart);
        this.statecharts.add(statechart);
        const self = this;
        statechart.states.forEach(state => self.insertState(state, statechart));
        statechart.transitions.forEach(transition => self.insertTransition(transition, statechart));
    }
    removeStatechart(stateChart) {
        this.statecharts.delete(stateChart);
        const self = this;
        stateChart.states.forEach(state => self.removeState(state));
    }
    insertTransition(transition, parent) {
        transition.parent = parent;
        this.updateItem(transition);
        this.transitions.add(transition);
        const src = transition.src, dst = transition.dst;
        if (src) {
            const outputs = src.outTransitions;
            if (!outputs.includes(transition))
                outputs.push(transition);
        }
        if (dst) {
            const inputs = dst.inTransitions;
            if (!inputs.includes(transition))
                inputs.push(transition);
        }
    }
    static removeTransitionHelper(array, transition) {
        const index = array.indexOf(transition);
        if (index >= 0) {
            array.splice(index, 1);
        }
    }
    removeTransition(transition) {
        this.transitions.delete(transition);
        const src = transition.src, dst = transition.dst;
        if (src) {
            const outputs = src.outTransitions;
            StatechartContext.removeTransitionHelper(outputs, transition);
        }
        if (dst) {
            const inputs = dst.inTransitions;
            StatechartContext.removeTransitionHelper(inputs, transition);
        }
    }
    insertItem(item, parent) {
        this.updateItem(item);
        if (item instanceof Transition) {
            if (parent instanceof Statechart && this.statecharts.has(parent))
                this.insertTransition(item, parent);
        }
        else if (item instanceof Statechart) {
            if (parent instanceof State && this.states.has(parent))
                this.insertStatechart(item, parent);
        }
        else {
            if (parent instanceof Statechart) {
                if (this.statecharts.has(parent))
                    this.insertState(item, parent);
            }
        }
    }
    removeItem(item) {
        if (item instanceof Transition)
            this.removeTransition(item);
        else if (item instanceof Statechart)
            this.removeStatechart(item);
        else
            this.removeState(item);
    }
    // DataContext interface implementation.
    valueChanged(owner, prop, oldValue) {
        if (owner instanceof Transition) {
            if (this.transitions.has(owner)) {
                // Remove and reinsert changed transitions.
                if (prop === transitionTemplate.src) {
                    const oldSrc = oldValue;
                    if (oldSrc)
                        StatechartContext.removeTransitionHelper(oldSrc.outTransitions, owner);
                }
                else if (prop === transitionTemplate.dst) {
                    const oldDst = oldValue;
                    if (oldDst)
                        StatechartContext.removeTransitionHelper(oldDst.inTransitions, owner);
                }
                this.insertTransition(owner, owner.parent);
            }
        }
        this.onValueChanged(owner, prop, oldValue);
        this.updateItem(owner); // Update any derived properties.
    }
    elementInserted(owner, prop, index) {
        const value = prop.get(owner).at(index);
        this.insertItem(value, owner);
        this.onElementInserted(owner, prop, index);
    }
    elementRemoved(owner, prop, index, oldValue) {
        this.removeItem(oldValue);
        this.onElementRemoved(owner, prop, index, oldValue);
    }
    resolveReference(owner, prop) {
        // Look up state id.
        const id = prop.getId(owner);
        if (!id)
            return undefined;
        return this.stateMap.get(id);
    }
    construct(typeName) {
        switch (typeName) {
            case 'state': return this.newState();
            case 'start':
            case 'stop':
            case 'history':
            case 'history*': return this.newPseudostate(typeName);
            case 'transition': return this.newTransition(undefined, undefined);
            case 'statechart': return this.newStatechart();
        }
        throw new Error('Unknown type');
    }
    onChanged(change) {
        // console.log(change);
        super.onEvent('changed', change);
        return change;
    }
    onValueChanged(owner, prop, oldValue) {
        const change = { type: 'valueChanged', item: owner, prop, index: 0, oldValue };
        super.onEvent('valueChanged', change);
        return this.onChanged(change);
    }
    onElementInserted(owner, prop, index) {
        const change = { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
        super.onEvent('elementInserted', change);
        return this.onChanged(change);
    }
    onElementRemoved(owner, prop, index, oldValue) {
        const change = { type: 'elementRemoved', item: owner, prop: prop, index: index, oldValue: oldValue };
        super.onEvent('elementRemoved', change);
        return this.onChanged(change);
    }
}
//------------------------------------------------------------------------------
class StatechartTheme extends Theme {
    constructor(theme, radius = 8) {
        super();
        this.textIndent = 8;
        this.textLeading = 6;
        this.arrowSize = 8;
        this.knobbyRadius = 4;
        this.padding = 8;
        this.stateMinWidth = 75;
        this.stateMinHeight = 40; // TODO make sure there's room for entry/exit action text
        Object.assign(this, theme);
        this.radius = radius;
        const r = radius, v = r / 2, h = r / 3;
        this.HGlyph = [-h, -v, -h, v, -h, 0, h, 0, h, -v, h, v];
        this.StarGlyph = [-h, -v / 3, h, v / 3, -h, v / 3, h, -v / 3, 0, -v / 1.5, 0, v / 1.5];
    }
}
class StateHitResult {
    constructor(item, inner) {
        this.arrow = false;
        this.item = item;
        this.inner = inner;
    }
}
class PseudostateHitResult {
    constructor(item, inner) {
        this.arrow = false;
        this.item = item;
        this.inner = inner;
    }
}
class TransitionHitResult {
    constructor(item, inner) {
        this.item = item;
        this.inner = inner;
    }
}
class StatechartHitResult {
    constructor(item, inner) {
        this.item = item;
        this.inner = inner;
    }
}
var RenderMode;
(function (RenderMode) {
    RenderMode[RenderMode["Normal"] = 0] = "Normal";
    RenderMode[RenderMode["Highlight"] = 1] = "Highlight";
    RenderMode[RenderMode["HotTrack"] = 2] = "HotTrack";
    RenderMode[RenderMode["Print"] = 3] = "Print";
})(RenderMode || (RenderMode = {}));
class Renderer {
    constructor(theme) {
        this.theme = new StatechartTheme(theme);
    }
    begin(ctx) {
        this.ctx = ctx;
        ctx.save();
        ctx.font = this.theme.font;
    }
    end() {
        this.ctx.restore();
    }
    getSize(item) {
        let width = 0, height = 0;
        if (item instanceof State || item instanceof Statechart) {
            width = item.width;
            height = item.height;
        }
        else if (item instanceof Pseudostate) {
            width = height = 2 * this.theme.radius;
        }
        return { width: width, height: height };
    }
    getItemRect(item) {
        let x, y, width, height;
        if (item instanceof Transition) {
            const extents = getExtents(item.bezier);
            x = extents.xmin;
            y = extents.ymin;
            width = extents.xmax - x;
            height = extents.ymax - y;
        }
        else {
            const size = this.getSize(item), global = item.globalPosition;
            x = global.x;
            y = global.y;
            width = size.width;
            height = size.height;
            if (item instanceof Statechart) {
                const parent = item.parent;
                if (parent) {
                    // Statechart width comes from containing state.
                    size.width = this.getSize(parent).width;
                }
                width = size.width;
                height = size.height;
            }
        }
        return { x, y, width, height };
    }
    getBounds(items) {
        let first = true, xmin = 0, ymin = 0, xmax = 0, ymax = 0;
        for (let item of items) {
            const rect = this.getItemRect(item);
            if (first) {
                xmin = rect.x;
                xmax = rect.x + rect.width;
                ymin = rect.y;
                ymax = rect.y + rect.height;
                first = false;
            }
            else {
                xmin = Math.min(xmin, rect.x);
                ymin = Math.min(ymin, rect.y);
                xmax = Math.max(xmax, rect.x + rect.width);
                ymax = Math.max(ymax, rect.y + rect.height);
            }
        }
        return { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
    }
    statePointToParam(state, p) {
        const r = this.theme.radius, rect = this.getItemRect(state);
        if (state instanceof State)
            return rectPointToParam(rect.x, rect.y, rect.width, rect.height, p);
        return circlePointToParam(rect.x + r, rect.y + r, p);
    }
    stateParamToPoint(state, t) {
        const r = this.theme.radius, rect = this.getItemRect(state);
        if (state instanceof State)
            return roundRectParamToPoint(rect.x, rect.y, rect.width, rect.height, r, t);
        return circleParamToPoint(rect.x + r, rect.y + r, r, t);
    }
    getStateMinSize(state) {
        const ctx = this.ctx, theme = this.theme, r = theme.radius;
        let width = theme.stateMinWidth, height = theme.stateMinHeight;
        if (state instanceof Pseudostate)
            return;
        if (ctx && state.name) {
            width = Math.max(width, ctx.measureText(state.name).width + 2 * r);
        }
        height = Math.max(height, theme.fontSize + theme.textLeading);
        return { width: width, height: height };
    }
    getNextStatechartY(state) {
        let y = 0;
        if (state.statecharts.length > 0) {
            const lastStatechart = state.statecharts.at(state.statecharts.length - 1);
            y = lastStatechart.y + lastStatechart.height;
        }
        return y;
    }
    layoutState(state) {
        const self = this, theme = this.theme, textSize = theme.fontSize, textLeading = theme.textLeading, lineSpacing = textSize + textLeading;
        let width = 0, height = lineSpacing;
        const statecharts = state.statecharts;
        let stateOffsetY = lineSpacing; // start at the bottom of the state label area.
        if (statecharts.length > 0) {
            // Layout the child statecharts vertically within the parent state.
            // TODO handle horizontal flow.
            statecharts.forEach(statechart => {
                const size = self.getSize(statechart);
                width = Math.max(width, size.width);
            });
            statecharts.forEach(statechart => {
                statechart.y = stateOffsetY;
                statechart.width = width;
                stateOffsetY += statechart.height;
            });
            height = Math.max(height, stateOffsetY);
        }
        if (state.entry) {
            state.entryText = 'entry/ ' + state.entry;
            state.entryY = height;
            height += lineSpacing;
            width = Math.max(width, this.ctx.measureText(state.entryText).width + 2 * theme.padding);
        }
        if (state.exit) {
            state.exitText = 'exit/ ' + state.exit;
            state.exitY = height;
            height += lineSpacing;
            width = Math.max(width, this.ctx.measureText(state.exitText).width + 2 * theme.padding);
        }
        width = Math.max(width, theme.stateMinWidth);
        height = Math.max(height, theme.stateMinHeight);
        width = Math.max(width, state.width);
        height = Math.max(height, state.height);
        state.width = width;
        state.height = height;
        if (statecharts.length > 0) {
            // Expand the last statechart to fill its parent state.
            const lastStatechart = statecharts.at(statecharts.length - 1);
            lastStatechart.height = lastStatechart.height + height - stateOffsetY;
        }
    }
    // Make sure a statechart is big enough to enclose its contents. Statecharts
    // are always sized automatically to contain their contents and fit tightly in
    // their parent state.
    layoutStatechart(statechart) {
        const padding = this.theme.padding, global = statechart.globalPosition, statechartX = global.x, statechartY = global.y, states = statechart.states, transitions = statechart.transitions;
        // TODO bound transitions too.
        if (states.length) {
            // Get extents of child states.
            const r = this.getBounds(states.asArray()), x = r.x - statechartX, // Get position in statechart coordinates.
            y = r.y - statechartY;
            let xMin = Math.min(0, x - padding), yMin = Math.min(0, y - padding), xMax = x + r.width + padding, yMax = y + r.height + padding;
            if (xMin < 0) {
                xMax -= xMin;
                states.forEach(state => { state.x -= xMin; });
            }
            if (yMin < 0) {
                yMax -= yMin;
                states.forEach(state => { state.y -= yMin; });
            }
            // Statechart position is calculated by the parent state layout.
            statechart.width = xMax - xMin;
            statechart.height = yMax - yMin;
        }
    }
    layoutTransition(transition) {
        const self = this, src = transition.src, dst = transition.dst, p1 = src ? this.stateParamToPoint(src, transition.tSrc) : transition.pSrc, p2 = dst ? this.stateParamToPoint(dst, transition.tDst) : transition.pDst;
        // If we're in an intermediate state, don't layout.
        if (!p1 || !p2)
            return;
        function getCenter(state) {
            const bbox = self.getItemRect(state);
            return {
                x: bbox.x + bbox.width * 0.5,
                y: bbox.y + bbox.height * 0.5,
            };
        }
        // If it's an "inside" transition, flip the source normal.
        if (src && dst && dst.parent) {
            const dstGrandParent = dst.parent.parent;
            if (src === dstGrandParent) {
                p1.nx = -p1.nx;
                p1.ny = -p1.ny;
            }
        }
        const scaleFactor = src === dst ? 64 : 0, bezier = getEdgeBezier(p1, p2, scaleFactor);
        if (src && src instanceof Pseudostate) {
            // Adjust the bezier's p1 and c1 to start on the boundary, towards bezier c2.
            const to = bezier[2], center = getCenter(src), radius = this.theme.radius, projection = projectPointToCircle(to, center, radius);
            bezier[0] = projection;
            bezier[1] = to;
        }
        if (dst && dst instanceof Pseudostate) {
            // Adjust the bezier's c2 and p2 to end on the boundary, towards bezier c1.
            const to = bezier[1], center = getCenter(dst), radius = this.theme.radius, projection = projectPointToCircle(to, center, radius);
            bezier[3] = projection;
            bezier[2] = to;
        }
        transition.bezier = bezier;
        transition.textPoint = evaluateBezier(bezier, transition.tText);
        let text = '', textWidth = 0;
        const ctx = this.ctx, padding = this.theme.padding;
        if (transition.event) {
            text += transition.event;
            textWidth += ctx.measureText(transition.event).width + 2 * padding;
        }
        if (transition.guard) {
            text += '[' + transition.guard + ']';
            textWidth += ctx.measureText(transition.guard).width + 2 * padding;
        }
        if (transition.action) {
            text += '/' + transition.action;
            textWidth += ctx.measureText(transition.action).width + 2 * padding;
        }
        transition.text = text;
        transition.textWidth = textWidth;
    }
    // Layout a statechart item.
    layout(item) {
        if (item instanceof State) {
            this.layoutState(item);
        }
        else if (item instanceof Statechart) {
            this.layoutStatechart(item);
        }
        else if (item instanceof Transition) {
            this.layoutTransition(item);
        }
    }
    drawArrow(x, y) {
        const ctx = this.ctx;
        ctx.beginPath();
        arrowPath({ x: x, y: y, nx: -1, ny: 0 }, ctx, this.theme.arrowSize);
        ctx.stroke();
    }
    hitTestArrow(x, y, p, tol) {
        const d = this.theme.arrowSize, r = d * 0.5;
        return hitTestRect(x - r, y - r, d, d, p, tol);
    }
    drawState(state, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, w = rect.width, h = rect.height, textSize = theme.fontSize, lineBase = y + textSize + theme.textLeading;
        roundRectPath(x, y, w, h, r, ctx);
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Print:
                ctx.fillStyle = theme.bgColor;
                ctx.fill();
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 0.5;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, lineBase);
                ctx.lineTo(x + w, lineBase);
                ctx.stroke();
                ctx.fillStyle = theme.textColor;
                if (state.name) {
                    ctx.fillText(state.name, x + r, y + textSize);
                }
                if (state.entry) {
                    ctx.fillText(state.entryText, x + r, y + state.entryY + textSize);
                }
                if (state.exit) {
                    ctx.fillText(state.exitText, x + r, y + state.exitY + textSize);
                }
                const statecharts = state.statecharts;
                if (statecharts) {
                    let separatorY = lineBase;
                    for (var i = 0; i < statecharts.length - 1; i++) {
                        const statechart = statecharts.at(i);
                        separatorY += statechart.height;
                        ctx.setLineDash([5]);
                        ctx.beginPath();
                        ctx.moveTo(x, separatorY);
                        ctx.lineTo(x + w, separatorY);
                        ctx.stroke();
                        ctx.setLineDash([0]);
                    }
                }
                // Render knobbies, faintly.
                ctx.lineWidth = 0.25;
                break;
            case RenderMode.Highlight:
                ctx.strokeStyle = theme.highlightColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            case RenderMode.HotTrack:
                ctx.strokeStyle = theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
        if (mode !== RenderMode.Print) {
            this.drawArrow(x + w + theme.arrowSize, lineBase);
        }
    }
    hitTestState(state, p, tol, mode) {
        const theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, w = rect.width, h = rect.height, inner = hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
        if (inner) {
            const lineBase = y + theme.fontSize + theme.textLeading, result = new StateHitResult(state, inner);
            if (mode !== RenderMode.Print && this.hitTestArrow(x + w + theme.arrowSize, lineBase, p, tol))
                result.arrow = true;
            return result;
        }
    }
    drawPseudoState(pseudostate, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.radius, rect = this.getItemRect(pseudostate), x = rect.x, y = rect.y, cx = x + r, cy = y + r;
        function drawGlyph(glyph, cx, cy) {
            for (let i = 0; i < glyph.length; i += 4) {
                ctx.moveTo(cx + glyph[i], cy + glyph[i + 1]);
                ctx.lineTo(cx + glyph[i + 2], cy + glyph[i + 3]);
            }
        }
        diskPath(cx, cy, r, ctx);
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Print:
                ctx.lineWidth = 0.25;
                switch (pseudostate.template.typeName) {
                    case 'start':
                        ctx.fillStyle = theme.strokeColor;
                        ctx.fill();
                        ctx.stroke();
                        break;
                    case 'stop':
                        ctx.fillStyle = theme.bgColor;
                        ctx.fill();
                        ctx.stroke();
                        diskPath(cx, cy, r / 2, ctx);
                        ctx.fillStyle = theme.strokeColor;
                        ctx.fill();
                        break;
                    case 'history':
                        ctx.fillStyle = theme.bgColor;
                        ctx.fill();
                        ctx.stroke();
                        ctx.beginPath();
                        drawGlyph(theme.HGlyph, cx, cy);
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.lineWidth = 0.25;
                        break;
                    case 'history*':
                        ctx.fillStyle = theme.bgColor;
                        ctx.fill();
                        ctx.stroke();
                        ctx.beginPath();
                        drawGlyph(theme.HGlyph, cx - r / 3, cy);
                        drawGlyph(theme.StarGlyph, cx + r / 2, cy);
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.lineWidth = 0.25;
                        break;
                }
                break;
            case RenderMode.Highlight:
                ctx.strokeStyle = theme.highlightColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            case RenderMode.HotTrack:
                ctx.strokeStyle = theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
        if (mode !== RenderMode.Print && pseudostate.template.typeName !== 'stop') {
            this.drawArrow(x + 2 * r + theme.arrowSize, y + r);
        }
    }
    hitTestPseudoState(state, p, tol, mode) {
        const theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, inner = hitTestDisk(x + r, y + r, r, p, tol);
        if (inner) {
            const result = new PseudostateHitResult(state, inner);
            if (mode !== RenderMode.Print && state.template.typeName !== 'stop' &&
                this.hitTestArrow(x + 2 * r + theme.arrowSize, y + r, p, tol)) {
                result.arrow = true;
            }
            return result;
        }
    }
    drawStatechart(statechart, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.radius, textSize = theme.fontSize, rect = this.getItemRect(statechart), x = rect.x, y = rect.y, w = rect.width, h = rect.height;
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Print:
                if (statechart.name) {
                    ctx.fillStyle = theme.textColor;
                    ctx.fillText(statechart.name, x + r, y + textSize);
                }
                break;
            case RenderMode.Highlight:
            case RenderMode.HotTrack:
                roundRectPath(x, y, w, h, r, ctx);
                ctx.strokeStyle = mode === RenderMode.Highlight ? theme.highlightColor : theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
    }
    hitTestStatechart(statechart, p, tol, mode) {
        const theme = this.theme, r = theme.radius, rect = this.getItemRect(statechart), x = rect.x, y = rect.y, w = rect.width, h = rect.height, inner = hitTestRect(x, y, w, h, p, tol);
        if (inner) {
            return new StatechartHitResult(statechart, inner);
        }
    }
    drawTransition(transition, mode) {
        const ctx = this.ctx, theme = this.theme, r = theme.knobbyRadius, bezier = transition.bezier;
        bezierEdgePath(bezier, ctx, theme.arrowSize);
        switch (mode) {
            case RenderMode.Normal:
            case RenderMode.Print:
                ctx.strokeStyle = theme.strokeColor;
                ctx.lineWidth = 1;
                ctx.stroke();
                const pt = transition.textPoint;
                if (mode !== RenderMode.Print) {
                    const r = theme.radius / 2;
                    roundRectPath(pt.x - r, pt.y - r, theme.radius, theme.radius, r, ctx);
                    ctx.fillStyle = theme.bgColor;
                    ctx.fill();
                    ctx.lineWidth = 0.25;
                    ctx.stroke();
                }
                ctx.fillStyle = theme.textColor;
                ctx.fillText(transition.text, pt.x + theme.padding, pt.y + theme.fontSize);
                break;
            case RenderMode.Highlight:
                ctx.strokeStyle = theme.highlightColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            case RenderMode.HotTrack:
                ctx.strokeStyle = theme.hotTrackColor;
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
        }
    }
    hitTestTransition(transition, p, tol, mode) {
        const inner = hitTestBezier(transition.bezier, p, tol);
        if (inner) {
            return new TransitionHitResult(transition, inner);
        }
    }
    draw(item, mode) {
        if (item instanceof State) {
            this.drawState(item, mode);
        }
        else if (item instanceof Pseudostate) {
            this.drawPseudoState(item, mode);
        }
        else if (item instanceof Transition) {
            this.drawTransition(item, mode);
        }
        else if (item instanceof Statechart) {
            this.drawStatechart(item, mode);
        }
    }
    hitTest(item, p, tol, mode) {
        let hitInfo;
        if (item instanceof State) {
            hitInfo = this.hitTestState(item, p, tol, mode);
        }
        else if (item instanceof Pseudostate) {
            hitInfo = this.hitTestPseudoState(item, p, tol, mode);
        }
        else if (item instanceof Transition) {
            hitInfo = this.hitTestTransition(item, p, tol, mode);
        }
        else if (item instanceof Statechart) {
            hitInfo = this.hitTestStatechart(item, p, tol, mode);
        }
        return hitInfo;
    }
    drawHoverText(item, p, nameValuePairs) {
        const self = this, ctx = this.ctx, theme = this.theme, textSize = theme.fontSize, gap = 16, border = 4, height = textSize * nameValuePairs.length + 2 * border, maxWidth = measureNameValuePairs(nameValuePairs, gap, ctx) + 2 * border;
        let x = p.x, y = p.y;
        ctx.fillStyle = theme.hoverColor;
        ctx.fillRect(x, y, maxWidth, height);
        ctx.fillStyle = theme.hoverTextColor;
        nameValuePairs.forEach(function (pair) {
            ctx.textAlign = 'left';
            ctx.fillText(pair.name, x + border, y + textSize);
            ctx.textAlign = 'right';
            ctx.fillText(pair.value, x + maxWidth - border, y + textSize);
            y += textSize;
        });
    }
}
//------------------------------------------------------------------------------
// Serialization to raw objects, deserialization from raw objects. Import of old
// format.  TODO use dataModels serialization.
function assignProps(src, dst) {
    dst.template.properties.forEach(function (prop) {
        if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
            prop.set(dst, src[prop.name]);
        }
    });
}
function readState(raw, context, map) {
    const state = context.newState();
    assignProps(raw, state);
    map.set(raw.id, state);
    if (raw.items) {
        raw.items.forEach((raw) => {
            state.statecharts.append(readStatechart(raw, context, map));
        });
    }
    return state;
}
function readPseudostate(raw, context, map) {
    const pseudostate = context.newPseudostate(raw.type);
    assignProps(raw, pseudostate);
    map.set(raw.id, pseudostate);
    return pseudostate;
}
function readTransition(raw, context, map) {
    // Property names changed so do it manually.
    const transition = context.newTransition(map.get(raw.srcId), map.get(raw.dstId));
    transition.tSrc = raw.t1;
    transition.tDst = raw.t2;
    transition.event = raw.event;
    transition.guard = raw.guard;
    transition.action = raw.action;
    transition.tText = raw.pt;
    return transition;
}
function readStatechart(raw, context, map) {
    const statechart = context.newStatechart();
    assignProps(raw, statechart);
    // First states and pseudostates.
    raw.items.forEach((raw) => {
        if (raw.type === 'state') {
            statechart.states.append(readState(raw, context, map));
        }
        else if (raw.type !== 'transition') {
            statechart.states.append(readPseudostate(raw, context, map));
        }
    });
    // Now transitions.
    raw.items.forEach((raw) => {
        if (raw.type === 'transition') {
            statechart.transitions.append(readTransition(raw, context, map));
        }
    });
    return statechart;
}
function readRaw(raw, context) {
    let statechart = undefined;
    if (raw.items === undefined) {
        // new format.
        statechart = Deserialize(raw, context);
    }
    else {
        // old format.
        const map = new Map();
        statechart = readStatechart(raw, context, map);
    }
    if (statechart) {
        context.root = statechart;
    }
}
//------------------------------------------------------------------------------
function isStateBorder(hitInfo) {
    return (hitInfo instanceof StateHitResult || hitInfo instanceof PseudostateHitResult)
        && hitInfo.inner.border;
}
function isDropTarget(hitInfo) {
    const item = hitInfo.item, selection = item.context.selection;
    return (hitInfo instanceof StateHitResult || hitInfo instanceof StatechartHitResult) &&
        !selection.has(item) && !ancestorInSet(item, selection);
}
function isClickable(hitInfo) {
    return !(hitInfo instanceof StatechartHitResult);
}
function isDraggable(hitInfo) {
    return hitInfo instanceof StateHitResult || hitInfo instanceof PseudostateHitResult;
}
function hasProperties(hitInfo) {
    return !(hitInfo instanceof PseudostateHitResult);
}
class StateDrag {
    constructor(items, type, description) {
        this.items = items;
        this.type = type;
        this.description = description;
    }
}
class TransitionDrag {
    constructor(transition, type, description) {
        this.transition = transition;
        this.type = type;
        this.description = description;
    }
}
export class StatechartEditor {
    constructor(theme, canvasController, paletteController, propertyGridController) {
        this.scrap = [];
        this.clickInPalette = false;
        this.moveCopy = false;
        this.propertyInfo = new Map();
        const self = this;
        this.theme = new StatechartTheme(theme);
        this.canvasController = canvasController;
        this.paletteController = paletteController;
        this.propertyGridController = propertyGridController;
        this.fileController = new FileController();
        this.hitTolerance = 8;
        // Change tracking for layout.
        // Changed items that must be updated before drawing and hit testing.
        this.changedItems = new Set();
        // Changed top level states that must be laid out after transactions and undo/redo.
        this.changedTopLevelStates = new Set();
        const renderer = new Renderer(theme);
        this.renderer = renderer;
        // Embed the palette items in a statechart so the renderer can do layout and drawing.
        const context = new StatechartContext(), statechart = context.newStatechart(), start = context.newPseudostate('start'), stop = context.newPseudostate('stop'), history = context.newPseudostate('history'), historyDeep = context.newPseudostate('history*'), newState = context.newState();
        start.x = start.y = 8;
        stop.x = 40;
        stop.y = 8;
        history.x = 72;
        history.y = 8;
        historyDeep.x = 104;
        historyDeep.y = 8;
        newState.x = 8;
        newState.y = 32;
        newState.width = 100;
        newState.height = 60;
        statechart.states.append(start);
        statechart.states.append(stop);
        statechart.states.append(history);
        statechart.states.append(historyDeep);
        statechart.states.append(newState);
        context.root = statechart;
        this.palette = statechart;
        // Default statechart.
        this.context = new StatechartContext();
        this.initializeContext(this.context);
        this.statechart = this.context.root;
        // Register property grid layouts.
        function getAttr(info) {
            switch (info.label) {
                case 'name':
                    return 'name';
                case 'entry':
                    return 'entry';
                case 'exit':
                    return 'exit';
                case 'event':
                    return 'event';
                case 'guard':
                    return 'guard';
                case 'action':
                    return 'action';
            }
        }
        function getter(info, item) {
            const attr = getAttr(info);
            if (item && attr)
                return item[attr];
            return '';
        }
        function setter(info, item, value) {
            const canvasController = self.canvasController;
            if (item) {
                const attr = getAttr(info);
                if (attr) {
                    const description = 'change ' + attr, transactionManager = self.context.transactionManager;
                    transactionManager.beginTransaction(description);
                    item[attr] = value;
                    transactionManager.endTransaction();
                    canvasController.draw();
                }
            }
        }
        this.propertyInfo.set('state', [
            {
                label: 'name',
                type: 'text',
                getter: getter,
                setter: setter,
            },
            {
                label: 'entry',
                type: 'text',
                getter: getter,
                setter: setter,
            },
            {
                label: 'exit',
                type: 'text',
                getter: getter,
                setter: setter,
            },
        ]);
        this.propertyInfo.set('transition', [
            {
                label: 'event',
                type: 'text',
                getter: getter,
                setter: setter,
            },
            {
                label: 'guard',
                type: 'text',
                getter: getter,
                setter: setter,
            },
            {
                label: 'action',
                type: 'text',
                getter: getter,
                setter: setter,
            },
        ]);
        this.propertyInfo.set('statechart', [
            {
                label: 'name',
                type: 'text',
                getter: getter,
                setter: setter,
            },
        ]);
        this.propertyInfo.forEach((info, key) => {
            propertyGridController.register(key, info);
        });
    }
    initializeContext(context) {
        const self = this;
        // On attribute changes and item insertions, dynamically layout affected items.
        // This allows us to layout transitions as their src or dst states are dragged.
        context.addHandler('changed', change => self.onChanged(change));
        // On ending transactions and undo/redo, layout the changed top level states.
        function update() {
            self.updateBounds();
        }
        context.transactionManager.addHandler('transactionEnding', update);
        context.transactionManager.addHandler('didUndo', update);
        context.transactionManager.addHandler('didRedo', update);
    }
    setContext(context) {
        const statechart = context.root, renderer = this.renderer;
        this.context = context;
        this.statechart = statechart;
        this.changedItems.clear();
        this.changedTopLevelStates.clear();
        // renderer.setModel(model);
        // Layout any items in the statechart.
        renderer.begin(this.canvasController.getCtx());
        context.reverseVisitAll(this.statechart, item => renderer.layout(item));
        renderer.end();
    }
    initialize(canvasController) {
        if (canvasController === this.canvasController) {
        }
        else {
            const renderer = this.renderer;
            renderer.begin(canvasController.getCtx());
            // Layout the palette items and their parent statechart.
            renderer.begin(canvasController.getCtx());
            this.context.reverseVisitAll(this.palette, item => renderer.layout(item));
            // Draw the palette items.
            this.context.visitAll(this.palette, item => renderer.draw(item, RenderMode.Normal));
            renderer.end();
        }
    }
    onChanged(change) {
        const statechart = this.statechart, context = this.context, changedItems = this.changedItems, changedTopLevelStates = this.changedTopLevelStates, item = change.item, prop = change.prop;
        // Track all top level states which contain changes. On ending a transaction,
        // update the layout of states and statecharts.
        let ancestor = item, topLevel;
        do {
            topLevel = ancestor;
            ancestor = ancestor.parent;
        } while (ancestor && ancestor !== statechart);
        if (ancestor === statechart && topLevel instanceof State) {
            changedTopLevelStates.add(topLevel);
        }
        function addItems(item) {
            if (item instanceof StateBase) {
                // Layout the state's incoming and outgoing transitions.
                context.forInTransitions(item, addItems);
                context.forOutTransitions(item, addItems);
            }
            changedItems.add(item);
        }
        switch (change.type) {
            case 'valueChanged': {
                const attr = prop.name;
                // For changes to x, y, width, or height, layout affected transitions.
                if (attr == 'x' || attr == 'y' || attr == 'width' || attr == 'height') {
                    // Visit item and sub-items to layout all affected transitions.
                    context.visitAll(item, addItems);
                }
                else if (item instanceof Transition) {
                    addItems(item);
                }
                break;
            }
            case 'elementInserted': {
                // Update item subtrees as they are inserted.
                context.reverseVisitAll(prop.get(item).at(change.index), addItems);
                break;
            }
        }
    }
    updateLayout() {
        const renderer = this.renderer, context = this.context, changedItems = this.changedItems;
        // This function is called during the draw, hitTest, and updateBounds_ methods,
        // so the renderer is started.
        // First layout containers, and then layout transitions which depend on states'
        // size and location.
        function layout(item, visitor) {
            context.reverseVisitAll(item, visitor);
        }
        changedItems.forEach(item => {
            layout(item, item => {
                if (!(item instanceof Transition))
                    renderer.layout(item);
            });
        });
        changedItems.forEach(item => {
            layout(item, item => {
                if (item instanceof Transition)
                    renderer.layout(item);
            });
        });
        changedItems.clear();
    }
    updateBounds() {
        const ctx = this.canvasController.getCtx(), renderer = this.renderer, context = this.context, statechart = this.statechart, changedTopLevelStates = this.changedTopLevelStates;
        renderer.begin(ctx);
        // Update any changed items first.
        this.updateLayout();
        // Then update the bounds of super states, bottom up.
        changedTopLevelStates.forEach(state => context.reverseVisitAll(state, item => {
            if (!(item instanceof Transition))
                renderer.layout(item);
        }));
        // Finally update the root statechart's bounds.
        renderer.layoutStatechart(statechart);
        renderer.end();
        changedTopLevelStates.clear();
        // Make sure the canvas is large enough to contain the root statechart.
        const canvasController = this.canvasController, canvasSize = canvasController.getSize();
        let width = statechart.width, height = statechart.height;
        if (width > canvasSize.width || height > canvasSize.height) {
            width = Math.max(width, canvasSize.width);
            height = Math.max(height, canvasSize.height);
            canvasController.setSize(width, height);
        }
    }
    draw(canvasController) {
        const renderer = this.renderer, statechart = this.statechart, context = this.context;
        if (canvasController === this.canvasController) {
            // Draw a dashed border around the canvas.
            const ctx = canvasController.getCtx(), size = canvasController.getSize();
            ctx.strokeStyle = this.theme.strokeColor;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(0, 0, size.width, size.height);
            ctx.setLineDash([]);
            // Now draw the statechart.
            renderer.begin(ctx);
            this.updateLayout();
            canvasController.applyTransform();
            statechart.states.forEach(function (state) {
                context.visitNonTransitions(state, item => { renderer.draw(item, RenderMode.Normal); });
            });
            context.visitTransitions(statechart, transition => {
                renderer.drawTransition(transition, RenderMode.Normal);
            });
            context.selection.forEach(function (item) {
                renderer.draw(item, RenderMode.Highlight);
            });
            if (this.hotTrackInfo)
                renderer.draw(this.hotTrackInfo.item, RenderMode.HotTrack);
            const hoverHitInfo = this.hoverHitInfo;
            if (hoverHitInfo) {
                const item = hoverHitInfo.item, propertyInfo = this.propertyInfo.get(item.template.typeName), nameValuePairs = [];
                if (propertyInfo) {
                    for (let info of propertyInfo) {
                        const name = info.label, value = info.getter(info, item);
                        if (value !== undefined) {
                            nameValuePairs.push({ name, value });
                        }
                    }
                    renderer.drawHoverText(hoverHitInfo.item, this.hoverPoint, nameValuePairs);
                }
            }
            renderer.end();
        }
        else if (canvasController === this.paletteController) {
            // Palette drawing occurs during drag and drop. If the palette has the drag,
            // draw the canvas underneath so the new object will appear on the canvas.
            this.canvasController.draw();
            const ctx = this.paletteController.getCtx();
            renderer.begin(ctx);
            canvasController.applyTransform();
            context.visitAll(this.palette, item => {
                renderer.draw(item, RenderMode.Print);
            });
            // Draw the new object in the palette. Translate object to palette coordinates.
            const offset = canvasController.offsetToOtherCanvas(this.canvasController);
            ctx.translate(offset.x, offset.y);
            context.selection.forEach(item => {
                renderer.draw(item, RenderMode.Normal);
                renderer.draw(item, RenderMode.Highlight);
            });
            renderer.end();
        }
    }
    print() {
        const renderer = this.renderer, context = this.context, statechart = this.statechart, canvasController = this.canvasController;
        // Calculate document bounds.
        const items = new Array();
        context.visitAll(statechart, function (item) {
            items.push(item);
        });
        const bounds = renderer.getBounds(items);
        // Adjust all edges 1 pixel out.
        const ctx = new window.C2S(bounds.width + 2, bounds.height + 2);
        ctx.translate(-bounds.x + 1, -bounds.y + 1);
        renderer.begin(ctx);
        canvasController.applyTransform();
        statechart.states.forEach(state => {
            context.visitNonTransitions(state, item => { renderer.draw(state, RenderMode.Print); });
        });
        context.visitTransitions(statechart, transition => {
            renderer.drawTransition(transition, RenderMode.Print);
        });
        renderer.end();
        // Write out the SVG file.
        const serializedSVG = ctx.getSerializedSvg();
        const blob = new Blob([serializedSVG], {
            type: 'text/plain'
        });
        window.saveAs(blob, 'statechart.svg', true);
    }
    getCanvasPosition(canvasController, p) {
        // When dragging from the palette, convert the position from pointer events
        // into the canvas space to render the drag and drop.
        return this.canvasController.viewToOtherCanvasView(canvasController, p);
    }
    hitTestCanvas(p) {
        const renderer = this.renderer, context = this.context, tol = this.hitTolerance, statechart = this.statechart, canvasController = this.canvasController, cp = this.getCanvasPosition(canvasController, p), ctx = canvasController.getCtx(), hitList = [];
        function pushInfo(info) {
            if (info)
                hitList.push(info);
        }
        renderer.begin(ctx);
        this.updateLayout();
        // TODO hit test selection first, in highlight, first.
        // Skip the root statechart, as hits there should go to the underlying canvas controller.
        // Hit test transitions first.
        context.reverseVisitTransitions(statechart, (transition) => {
            pushInfo(renderer.hitTestTransition(transition, cp, tol, RenderMode.Normal));
        });
        statechart.states.forEachReverse(state => {
            context.reverseVisitNonTransitions(state, item => {
                pushInfo(renderer.hitTest(item, cp, tol, RenderMode.Normal));
            });
        });
        renderer.end();
        return hitList;
    }
    hitTestPalette(p) {
        const renderer = this.renderer, context = this.context, tol = this.hitTolerance, ctx = this.paletteController.getCtx(), hitList = [];
        function pushInfo(info) {
            if (info)
                hitList.push(info);
        }
        renderer.begin(ctx);
        this.palette.states.forEach(state => {
            pushInfo(renderer.hitTest(state, p, tol, RenderMode.Normal));
        });
        renderer.end();
        return hitList;
    }
    getFirstHit(hitList, filterFn) {
        for (let hitInfo of hitList) {
            if (filterFn(hitInfo))
                return hitInfo;
        }
    }
    getDraggableAncestor(hitList, hitInfo) {
        while (hitInfo && !isDraggable(hitInfo)) {
            const parent = hitInfo.item.parent;
            hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; });
        }
        return hitInfo;
    }
    setPropertyGrid() {
        const context = this.context, item = context.selection.lastSelected, type = item ? item.template.typeName : undefined;
        this.propertyGridController.show(type, item);
    }
    onClick(canvasController) {
        const context = this.context, selection = context.selection, shiftKeyDown = this.canvasController.shiftKeyDown, cmdKeyDown = this.canvasController.cmdKeyDown, p = canvasController.getClickPointerPosition(), cp = canvasController.viewToCanvas(p);
        let hitList;
        if (canvasController === this.paletteController) {
            hitList = this.hitTestPalette(cp);
            this.clickInPalette = true;
        }
        else {
            hitList = this.hitTestCanvas(cp);
            this.clickInPalette = false;
        }
        const pointerHitInfo = this.pointerHitInfo = this.getFirstHit(hitList, isClickable);
        if (pointerHitInfo) {
            this.draggableHitInfo = this.getDraggableAncestor(hitList, pointerHitInfo);
            const item = pointerHitInfo.item;
            if (this.clickInPalette) {
                selection.clear();
            }
            else if (cmdKeyDown) {
                selection.toggle(item);
            }
            else if (shiftKeyDown) {
                selection.add(item);
                this.moveCopy = true;
            }
            else if (!selection.has(item)) {
                selection.set(item);
            }
            else {
                selection.add(item);
            }
        }
        else {
            if (!shiftKeyDown) {
                selection.clear();
            }
        }
        this.setPropertyGrid();
        return pointerHitInfo !== undefined;
    }
    onBeginDrag(canvasController) {
        let pointerHitInfo = this.pointerHitInfo;
        if (!pointerHitInfo)
            return false;
        const context = this.context, selection = context.selection, p0 = canvasController.getClickPointerPosition();
        let dragItem = pointerHitInfo.item;
        let drag, newTransition;
        // First check for a drag that creates a new transition.
        if ((pointerHitInfo instanceof StateHitResult || pointerHitInfo instanceof PseudostateHitResult) &&
            pointerHitInfo.arrow) {
            const state = dragItem, cp0 = this.getCanvasPosition(canvasController, p0);
            // Start the new transition as connecting the src state to itself.
            newTransition = context.newTransition(state, undefined);
            newTransition.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
            newTransition.tText = 0.5; // initial property attachment at midpoint.
            drag = new TransitionDrag(newTransition, 'newTransition', 'Add new transition');
        }
        else if (pointerHitInfo instanceof TransitionHitResult) {
            if (pointerHitInfo.inner.t === 0) {
                drag = new TransitionDrag(dragItem, 'connectTransitionSrc', 'Edit transition');
            }
            else if (pointerHitInfo.inner.t === 1) {
                drag = new TransitionDrag(dragItem, 'connectTransitionDst', 'Edit transition');
            }
            else {
                drag = new TransitionDrag(dragItem, 'moveTransitionPoint', 'Drag transition attachment point');
            }
        }
        else if (this.draggableHitInfo) {
            pointerHitInfo = this.pointerHitInfo = this.draggableHitInfo;
            if (pointerHitInfo instanceof StateHitResult || pointerHitInfo instanceof PseudostateHitResult) {
                if (this.clickInPalette) {
                    this.clickInPalette = false; // TODO fix
                    drag = new StateDrag([pointerHitInfo.item], 'copyPalette', 'Create new state or pseudostate');
                }
                else if (this.moveCopy) {
                    this.moveCopy = false; // TODO fix
                    drag = new StateDrag(context.selectedStates(), 'moveCopySelection', 'Move copy of selection');
                }
                else {
                    if (pointerHitInfo.item instanceof State && pointerHitInfo.inner.border) {
                        drag = new StateDrag([pointerHitInfo.item], 'resizeState', 'Resize state');
                    }
                    else {
                        drag = new StateDrag(context.selectedStates(), 'moveSelection', 'Move selection');
                    }
                }
            }
        }
        this.dragInfo = drag;
        if (drag) {
            if (drag.type === 'moveSelection' || drag.type === 'moveCopySelection') {
                context.reduceSelection();
            }
            if (drag.type == 'copyPalette') {
                // Transform palette items into the canvas coordinate system.
                const offset = this.paletteController.offsetToOtherCanvas(this.canvasController), copies = copyItems(drag.items, context);
                copies.forEach(copy => {
                    if (copy instanceof StateBase) {
                        copy.x -= offset.x;
                        copy.y -= offset.y;
                    }
                });
                drag.items = copies;
            }
            else if (drag.type == 'moveCopySelection') {
                const copies = context.copy();
                drag.items = copies;
            }
            context.transactionManager.beginTransaction(drag.description);
            if (newTransition) {
                context.addItem(newTransition, this.statechart);
                selection.set(newTransition);
            }
            else {
                if (drag.type == 'copyPalette' || drag.type == 'moveCopySelection') {
                    context.addItems(drag.items, this.statechart);
                    selection.set(drag.items);
                }
            }
        }
    }
    onDrag(canvasController) {
        const drag = this.dragInfo;
        if (!drag)
            return;
        const context = this.context, transactionManager = context.transactionManager, renderer = this.renderer, p0 = canvasController.getClickPointerPosition(), cp0 = this.getCanvasPosition(canvasController, p0), p = canvasController.getCurrentPointerPosition(), cp = this.getCanvasPosition(canvasController, p), dx = cp.x - cp0.x, dy = cp.y - cp0.y, pointerHitInfo = this.pointerHitInfo, hitList = this.hitTestCanvas(cp);
        let hitInfo;
        if (drag instanceof StateDrag) {
            switch (drag.type) {
                case 'copyPalette':
                case 'moveCopySelection':
                case 'moveSelection': {
                    hitInfo = this.getFirstHit(hitList, isDropTarget);
                    context.selection.forEach(item => {
                        if (item instanceof Transition)
                            return;
                        const oldX = transactionManager.getOldValue(item, 'x'), oldY = transactionManager.getOldValue(item, 'y');
                        item.x = oldX + dx;
                        item.y = oldY + dy;
                    });
                    break;
                }
                case 'resizeState': {
                    const hitInfo = pointerHitInfo, item = drag.items[0], oldX = transactionManager.getOldValue(item, 'x'), oldY = transactionManager.getOldValue(item, 'y'), oldWidth = transactionManager.getOldValue(item, 'width'), oldHeight = transactionManager.getOldValue(item, 'height');
                    if (hitInfo.inner.left) {
                        item.x = oldX + dx;
                        item.width = oldWidth - dx;
                    }
                    if (hitInfo.inner.top) {
                        item.y = oldY + dy;
                        item.height = oldHeight - dy;
                    }
                    if (hitInfo.inner.right)
                        item.width = oldWidth + dx;
                    if (hitInfo.inner.bottom)
                        item.height = oldHeight + dy;
                    break;
                }
            }
        }
        else if (drag instanceof TransitionDrag) {
            const transition = drag.transition;
            switch (drag.type) {
                case 'connectTransitionSrc': {
                    const dst = transition.dst, hitInfo = this.getFirstHit(hitList, isStateBorder), src = hitInfo ? hitInfo.item : undefined;
                    if (src && dst && context.isValidTransition(src, dst)) {
                        transition.src = src;
                        const t1 = renderer.statePointToParam(src, cp);
                        transition.tSrc = t1;
                    }
                    else {
                        transition.src = undefined; // This notifies observers to update the layout.
                        transition.pSrc = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
                    }
                    break;
                }
                case 'newTransition':
                case 'connectTransitionDst': {
                    const src = transition.src, hitInfo = this.getFirstHit(hitList, isStateBorder), dst = hitInfo ? hitInfo.item : undefined;
                    if (src && drag.type === 'newTransition') {
                        transition.tSrc = renderer.statePointToParam(src, cp);
                    }
                    if (src && dst && context.isValidTransition(src, dst)) {
                        transition.dst = dst;
                        const t2 = renderer.statePointToParam(dst, cp);
                        transition.tDst = t2;
                    }
                    else {
                        transition.dst = undefined; // This notifies observers to update the layout.
                        transition.pDst = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
                    }
                    break;
                }
                case 'moveTransitionPoint': {
                    const hitInfo = renderer.hitTest(transition, cp, this.hitTolerance, RenderMode.Normal);
                    if (hitInfo && hitInfo instanceof TransitionHitResult) {
                        transition.tText = hitInfo.inner.t;
                    }
                    else {
                        const oldTText = transactionManager.getOldValue(transition, 'tText');
                        transition.tText = oldTText;
                    }
                    break;
                }
            }
        }
        this.hotTrackInfo = (hitInfo && hitInfo.item !== this.statechart) ? hitInfo : undefined;
    }
    onEndDrag(canvasController) {
        const drag = this.dragInfo;
        if (!drag)
            return;
        const context = this.context, statechart = this.statechart, selection = context.selection, transactionManager = context.transactionManager, p = canvasController.getCurrentPointerPosition(), cp = this.getCanvasPosition(canvasController, p);
        if (drag instanceof TransitionDrag) {
            drag.transition.pSrc = drag.transition.pDst = undefined;
        }
        else if (drag instanceof StateDrag &&
            (drag.type == 'copyPalette' || drag.type === 'moveSelection' ||
                drag.type === 'moveCopySelection')) {
            // Find state beneath mouse.
            const hitList = this.hitTestCanvas(cp), hitInfo = this.getFirstHit(hitList, isDropTarget);
            let parent = statechart;
            if (hitInfo instanceof StatechartHitResult || hitInfo instanceof StateHitResult) {
                parent = hitInfo.item;
            }
            const items = selection.contents(), target = context.findOrCreateTargetForDrop(items, parent);
            context.addItems(items, target);
        }
        transactionManager.endTransaction();
        this.setPropertyGrid();
        this.dragInfo = undefined;
        this.pointerHitInfo = undefined;
        this.draggableHitInfo = undefined;
        this.hotTrackInfo = undefined;
        this.canvasController.draw();
    }
    onKeyDown(e) {
        const self = this, context = this.context, statechart = this.statechart, selection = context.selection, transactionManager = context.transactionManager, keyCode = e.keyCode, // TODO fix
        cmdKey = e.ctrlKey || e.metaKey, shiftKey = e.shiftKey;
        if (keyCode === 8) { // 'delete'
            context.deleteSelection();
            return true;
        }
        if (cmdKey) {
            switch (keyCode) {
                case 65: { // 'a'
                    statechart.states.forEach(function (v) {
                        context.selection.add(v);
                    });
                    self.canvasController.draw();
                    return true;
                }
                case 90: { // 'z'
                    if (context.getUndo()) {
                        context.undo();
                        self.canvasController.draw();
                    }
                    return true;
                }
                case 89: { // 'y'
                    if (context.getRedo()) {
                        context.redo();
                        self.canvasController.draw();
                    }
                    return true;
                }
                case 88: { // 'x'
                    this.scrap = context.cut();
                    self.canvasController.draw();
                    return true;
                }
                case 67: { // 'c'
                    this.scrap = context.copy();
                    return true;
                }
                case 86: { // 'v'
                    if (this.scrap.length > 0) {
                        context.paste(this.scrap);
                        this.updateBounds();
                        return true;
                    }
                    return false;
                }
                case 71: { // 'g'
                    context.reduceSelection();
                    context.selection.set(context.selectedStates());
                    context.selectInteriorTransitions();
                    context.beginTransaction('group items into super state');
                    const theme = this.theme, bounds = this.renderer.getBounds(context.selectedStates()), contents = context.selectionContents(), parent = getLowestCommonAncestor(...contents);
                    expandRect(bounds, theme.radius, theme.radius);
                    context.group(contents, parent, bounds);
                    context.endTransaction();
                }
                case 69: { // 'e'
                    context.selectConnectedStates(true);
                    self.canvasController.draw();
                    return true;
                }
                case 72: // 'h'
                    // editingModel.doTogglePalette();
                    // return true;
                    return false;
                case 78: { // ctrl 'n'   // Can't intercept cmd n.
                    const context = new StatechartContext();
                    self.initializeContext(context);
                    self.setContext(context);
                    self.renderer.begin(self.canvasController.getCtx());
                    self.updateBounds();
                    self.canvasController.draw();
                    return true;
                }
                case 79: { // 'o'
                    function parse(text) {
                        const raw = JSON.parse(text), context = new StatechartContext();
                        const statechart = readRaw(raw, context);
                        self.initializeContext(context);
                        self.setContext(context);
                        self.renderer.begin(self.canvasController.getCtx());
                        self.updateBounds();
                        self.canvasController.draw();
                    }
                    this.fileController.openFile().then(result => parse(result));
                    return true;
                }
                case 83: { // 's'
                    let text = JSON.stringify(Serialize(statechart), undefined, 2);
                    this.fileController.saveUnnamedFile(text, 'statechart.txt').then();
                    // console.log(text);
                    return true;
                }
                case 80: { // 'p'
                    this.print();
                    return true;
                }
            }
        }
        return false;
    }
    onKeyUp(e) {
        return false;
    }
    onBeginHover(canvasController) {
        const context = this.context, p = canvasController.getCurrentPointerPosition(), hitList = this.hitTestCanvas(p), hoverHitInfo = this.hoverHitInfo = this.getFirstHit(hitList, hasProperties);
        if (!hoverHitInfo)
            return false;
        const cp = canvasController.viewToCanvas(p);
        this.hoverPoint = cp;
        this.hoverHitInfo = hoverHitInfo;
        return true;
    }
    onEndHover(canvasController) {
        this.hoverHitInfo = undefined;
    }
}
//# sourceMappingURL=statecharts.js.map