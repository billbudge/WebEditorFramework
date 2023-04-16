
import { SelectionSet } from '../../src/collections.js'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, measureNameValuePairs, CanvasController, CanvasLayer,
         PropertyGridController, PropertyInfo, FileController } from '../../src/diagrams.js'

import { PointWithNormal, getExtents, projectPointToCircle, BezierCurve,
         evaluateBezier, CurveHitResult } from '../../src/geometry.js'

import { ScalarProp, ChildArrayProp, ReferenceProp, IdProp, PropertyTypes,
         ReferencedObject, DataContext, DataContextObject, EventBase, Change, ChangeEvents,
         copyItems, Serialize, Deserialize, getLowestCommonAncestor, ancestorInSet,
         reduceToRoots, List, TransactionManager, HistoryManager, ScalarPropertyTypes,
         ArrayPropertyTypes } from '../../src/dataModels.js'

import * as Canvas2SVG from '../../third_party/canvas2svg/canvas2svg.js'

// TODO special context when objects are being constructed, before they are in a context.

//------------------------------------------------------------------------------

// Implement type-safe interfaces as well as a raw data interface for
// cloning, serialization, etc.

const stateTemplate = (function() {
  const typeName: string = 'state',
        id = new IdProp('id'),
        x = new ScalarProp('x'),
        y = new ScalarProp('y'),
        width = new ScalarProp('width'),
        height = new ScalarProp('height'),
        name = new ScalarProp('name'),
        entry = new ScalarProp('entry'),
        exit = new ScalarProp('exit'),
        statecharts = new ChildArrayProp('statecharts'),
        properties = [id, x, y, width, height, name, entry, exit, statecharts];
  return { typeName, id, x, y, width, height, name, entry, exit, statecharts, properties };
})();

export type PseudostateSubtype = 'start' | 'stop' | 'history' | 'history*';
type PseudostateTemplate = {
  readonly typeName: string,
  readonly id: IdProp,
  readonly x: ScalarProp,
  readonly y: ScalarProp,
  readonly properties: PropertyTypes[],
}
const pseudostateTemplate = (function() {
  const id = new IdProp('id'),
        x = new ScalarProp('x'),
        y = new ScalarProp('y'),
        properties = [id, x, y];
  return {
    start: { typeName: 'start', id, x, y, properties },
    stop: { typeName: 'stop', id, x, y, properties },
    history: { typeName: 'history', id, x, y, properties },
    deepHistory: { typeName: 'history*', id, x, y, properties },
  };
})();

const transitionTemplate = (function() {
  const typeName: string = 'transition',
        src = new ReferenceProp('src'),
        tSrc = new ScalarProp('tSrc'),
        dst = new ReferenceProp('dst'),
        tDst = new ScalarProp('tDst'),

        event = new ScalarProp('event'),
        guard = new ScalarProp('guard'),
        action = new ScalarProp('action'),
        tText = new ScalarProp('tText'),
        properties = [src, tSrc, dst, tDst, event, guard, action, tText];

  return { typeName, src, tSrc, dst, tDst, event, guard, action, tText, properties };
})();

const statechartTemplate = (function() {
  const typeName: string = 'statechart',
        x = new ScalarProp('x'),
        y = new ScalarProp('y'),
        width = new ScalarProp('width'),
        height = new ScalarProp('height'),
        name = new ScalarProp('name'),

        states = new ChildArrayProp('states'),
        transitions = new ChildArrayProp('transitions'),
        properties = [x, y, width, height, name, states, transitions];

  return { typeName, x, y, width, height, name, states, transitions, properties };
})();

const defaultPoint = { x: 0, y: 0 },
      defaultPointWithNormal: PointWithNormal = { x: 0, y: 0, nx: 0 , ny: 0 },
      defaultBezierCurve: BezierCurve = [
          defaultPointWithNormal, defaultPoint, defaultPoint, defaultPointWithNormal];

export class State implements DataContextObject, ReferencedObject {
  readonly template = stateTemplate;
  readonly context: StatechartContext;

  readonly id: number;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value: number) { this.template.width.set(this, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value: number) { this.template.height.set(this, value); }
  get name() { return this.template.name.get(this); }
  set name(value: string | undefined) { this.template.name.set(this, value); }
  get entry() { return this.template.entry.get(this); }
  set entry(value: string | undefined) { this.template.entry.set(this, value); }
  get exit() { return this.template.exit.get(this); }
  set exit(value: string | undefined) { this.template.exit.set(this, value); }

  get statecharts() { return this.template.statecharts.get(this) as List<Statechart>; }

  // Derived properties.
  parent: Statechart | undefined;
  globalPosition = defaultPoint;
  inTransitions: Transition[];
  outTransitions: Transition[];
  entryText = '';
  entryY = 0;
  exitText = '';
  exitY = 0;

  constructor(context: StatechartContext, id: number) {
    this.context = context;
    this.id = id;
  }
}

export class Pseudostate implements DataContextObject, ReferencedObject {
  readonly template: PseudostateTemplate;
  readonly context: StatechartContext;

  readonly id: number;

  get subtype() : string { return this.template.typeName };

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }

  // Derived properties.
  parent: Statechart | undefined;
  globalPosition = defaultPoint;
  inTransitions: Transition[];
  outTransitions: Transition[];

  constructor(template: PseudostateTemplate, id: number, context: StatechartContext) {
    this.template = template;
    this.id = id;
    this.context = context;
  }
}

export class Transition implements DataContextObject {
  readonly template = transitionTemplate;
  readonly context: StatechartContext;

  get src() { return this.template.src.get(this) as StateTypes | undefined; }
  set src(value: StateTypes | undefined) { this.template.src.set(this, value); }
  get tSrc() { return this.template.tSrc.get(this) || 0; }
  set tSrc(value: number) { this.template.tSrc.set(this, value); }
  get dst() { return this.template.dst.get(this) as StateTypes | undefined; }
  set dst(value: StateTypes | undefined) { this.template.dst.set(this, value); }
  get tDst() { return this.template.tDst.get(this) || 0; }
  set tDst(value: number) { this.template.tDst.set(this, value); }
  get event() { return this.template.event.get(this); }
  set event(value: string | undefined) { this.template.event.set(this, value); }
  get guard() { return this.template.guard.get(this); }
  set guard(value: string | undefined) { this.template.guard.set(this, value); }
  get action() { return this.template.action.get(this); }
  set action(value: string | undefined) { this.template.action.set(this, value); }
  get tText() { return this.template.tText.get(this) || 0; }
  set tText(value: number) { this.template.tText.set(this, value); }

  // Derived properties.
  parent: Statechart | undefined;
  pSrc: PointWithNormal | undefined;
  pDst: PointWithNormal | undefined;
  bezier = defaultBezierCurve;
  textPoint = defaultPoint;
  text = '';
  textWidth = 0;

  constructor(context: StatechartContext) {
    this.context = context;
  }
}

export class Statechart implements DataContextObject {
  readonly template = statechartTemplate;
  readonly context: StatechartContext;

  get x() { return this.template.x.get(this) || 0; }
  set x(value: number) { this.template.x.set(this, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value: number) { this.template.y.set(this, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value: number) { this.template.width.set(this, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value: number) { this.template.height.set(this, value); }
  get name() { return this.template.name.get(this) || ''; }
  set name(value: string | undefined) { this.template.name.set(this, value); }

  get states() { return this.template.states.get(this) as List<StateTypes>; }
  get transitions() { return this.template.transitions.get(this) as List<Transition>; }

  // Derived properties.
  parent: State | undefined;
  globalPosition = defaultPoint;

  constructor(context: StatechartContext) {
    this.context = context;
  }
}

//------------------------------------------------------------------------------

// Interface to a statechart context.
// Manages state ids.
// Builds new statechart objects.
// Manages references to states.
// Manages graph structure, s

export type StateTypes = State | Pseudostate;
export type ParentTypes = Statechart | State | undefined;
export type NonTransitionTypes = Statechart | StateTypes
export type AllTypes = StateTypes | Statechart | Transition;

export type StatechartVisitor = (item: AllTypes) => void;
export type NonTransitionVisitor = (item: NonTransitionTypes) => void;
export type TransitionVisitor = (item: Transition) => void;

export interface GraphInfo {
  states: Set<StateTypes>;
  statecharts: Set<Statechart>;
  transitions: Set<Transition>;
  interiorTransitions: Set<Transition>;
  inTransitions: Set<Transition>;
  outTransitions: Set<Transition>;
}

export class StatechartContext extends EventBase<Change, ChangeEvents>
                               implements DataContext {
  private highestId: number = 0;  // 0 stands for no id.
  private stateMap = new Map<number, State | Pseudostate>();

  private statechart: Statechart;  // The root statechart.
  private states = new Set<StateTypes>;
  private statecharts = new Set<Statechart>;
  private transitions = new Set<Transition>;

  selection = new SelectionSet<AllTypes>();

  readonly transactionManager: TransactionManager;
  readonly historyManager: HistoryManager;

  constructor() {
    super();
    const self = this;
    this.transactionManager = new TransactionManager();
    this.addHandler('changed',
        this.transactionManager.onChanged.bind(this.transactionManager));
    this.transactionManager.addHandler('transactionEnding', () => {
      self.makeConsistent();
    });
    this.historyManager = new HistoryManager(this.transactionManager, this.selection);
    this.statechart = new Statechart(this);
    this.insertItem_(this.statechart, undefined);
  }

  root() : Statechart {
    return this.statechart;
  }
  setRoot(root: Statechart) : void {
    if (this.statechart)
      this.removeItem_(this.statechart);
    this.insertItem_(root, undefined);
    this.statechart = root;
  }

  newState() : State {
    const nextId = ++this.highestId,
          result: State = new State(this, nextId);
    this.stateMap.set(nextId, result);
    return result;
  }
  newPseudostate(typeName: string) : Pseudostate {
    const nextId = ++this.highestId;
    let template: PseudostateTemplate;
    switch (typeName) {
      case 'start': template = pseudostateTemplate.start; break;
      case 'stop': template = pseudostateTemplate.stop; break;
      case 'history': template = pseudostateTemplate.history; break;
      case 'history*': template = pseudostateTemplate.deepHistory; break;
      default: throw new Error('Unknown pseudostate type: ' + typeName);
    }
    const result = new Pseudostate(template, nextId, this);
    this.stateMap.set(nextId, result);
    return result;
  }
  newTransition(src: StateTypes | undefined, dst: StateTypes | undefined) : Transition {
    const result: Transition = new Transition(this);
    result.src = src;
    result.dst = dst;
    return result;
  }
  newStatechart() : Statechart {
    const result: Statechart = new Statechart(this);
    return result;
  }

  visitAll(item: AllTypes, visitor: StatechartVisitor) : void {
    const self = this;
    visitor(item);
    if (item instanceof State) {
      item.statecharts.forEach(t => self.visitAll(t, visitor));
    } else if (item instanceof Statechart) {
      item.states.forEach(t => self.visitAll(t, visitor));
      item.transitions.forEach(t => self.visitAll(t, visitor));
    }
  }
  visitAllItems(items: List<AllTypes>, visitor: StatechartVisitor) : void {
    const self = this;
    items.forEach(item => self.visitAll(item, visitor));
  }
  reverseVisitAll(item: AllTypes, visitor: StatechartVisitor) : void {
    const self = this;
    if (item instanceof State) {
      item.statecharts.forEachReverse(t => self.reverseVisitAll(t, visitor));
    } else if (item instanceof Statechart) {
      item.states.forEachReverse(t => self.reverseVisitAll(t, visitor));
      item.transitions.forEachReverse(t => self.reverseVisitAll(t, visitor));
    }
    visitor(item);
  }
  reverseVisitAllItems(items: List<AllTypes>, visitor: StatechartVisitor) : void {
    const self = this;
    items.forEachReverse(item => self.reverseVisitAll(item, visitor));
  }

  visitNonTransitions(item: AllTypes, visitor: NonTransitionVisitor) : void {
    const self = this;
    if (item instanceof State) {
      visitor(item);
      item.statecharts.forEach(item => self.visitNonTransitions(item, visitor));
    } else if (item instanceof Pseudostate) {
      visitor(item);
    } else if (item instanceof Statechart) {
      visitor(item);
      item.states.forEach(item => self.visitNonTransitions(item, visitor));
    }
  }

  updateItem(item: AllTypes) {
    const self = this;
    this.visitNonTransitions(item, item => self.setGlobalPosition(item));
  }

  getGrandParent(item: AllTypes) : AllTypes | undefined {
    let result = item.parent;
    if (result)
      result = result.parent;
    return result;
  }

  forInTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const inputs = state.inTransitions;
    if (!inputs)
      return;
    inputs.forEach((input, i) => visitor(input));
  }

  forOutTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const outputs = state.outTransitions;
    if (!outputs)
      return;
    outputs.forEach((output, i) => visitor(output));
  }

  // Gets the translation to move an item from its current parent to
  // newParent.
  getToParent(item: NonTransitionTypes, newParent: ParentTypes) {
    const oldParent: ParentTypes = item.parent;
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

  private setGlobalPosition(item: NonTransitionTypes) {
    const x = item.x,
          y = item.y,
          parent: ParentTypes = item.parent;

    if (parent) {
      // console.log(item.type, parent.type, parent.globalPosition);
      const global = parent.globalPosition;
      if (global) {
        item.globalPosition = { x: x + global.x, y: y + global.y };
      }
    } else {
      item.globalPosition = { x: x, y: y };
    }
  }

  getGraphInfo() : GraphInfo {
    return {
      states: this.states,
      statecharts: this.statecharts,
      transitions: this.transitions,
      interiorTransitions: this.transitions,
      inTransitions: new Set(),
      outTransitions: new Set(),
    };
  }

  getSubgraphInfo(items: StateTypes[]) : GraphInfo {
    const self = this,
          states = new Set<StateTypes>(),
          statecharts = new Set<Statechart>(),
          transitions = new Set<Transition>(),
          interiorTransitions = new Set<Transition>(),
          inTransitions = new Set<Transition>(),
          outTransitions = new Set<Transition>();
    // First collect states and statecharts.
    items.forEach(item => {
      this.visitAll(item, item => {
        if (item instanceof State || item instanceof Pseudostate)
          states.add(item);
        else if (item instanceof Statechart)
          statecharts.add(item);
      });
      });
    // Now collect and classify transitions that connect to them.
    items.forEach(item => {
      function addTransition(transition: Transition) {
        // Stop if we've already processed this transtion (handle transitions from a state to itself.)
        if (transitions.has(transition)) return;
        transitions.add(transition);
        const src: StateTypes = transition.src!,
              dst: StateTypes = transition.dst!,
              srcInside = states.has(src),
              dstInside = states.has(dst);
        if (srcInside) {
          if (dstInside) {
            interiorTransitions.add(transition);
          } else {
            outTransitions.add(transition);
          }
        }
        if (dstInside) {
          if (!srcInside) {
            inTransitions.add(transition);
          }
        }
      }
      if (item instanceof State || item instanceof Pseudostate) {
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
    }
  }

  getConnectedStates(states: StateTypes[], upstream: boolean, downstream: boolean) : Set<StateTypes> {
    const result = new Set<StateTypes>();
    states = states.slice(0);  // Copy input array
    while (states.length > 0) {
      const state = states.pop();
      if (!state) continue;

      result.add(state);
      if (upstream) {
        this.forInTransitions(state, transition => {
          const src: StateTypes = transition.src!;
          if (!result.has(src))
            states.push(src);
        });
      }
      if (downstream) {
        this.forOutTransitions(state, transition => {
          const dst = transition.dst!;
          if (!result.has(dst))
            states.push(dst);
        });
      }
    }
    return result;
  }

  getTopLevelState(item: StateTypes) : StateTypes {
    const topLevelStatechart = this.statechart;
    while (true) {
      const statechart = item.parent;
      if (!statechart || statechart === topLevelStatechart)
        return item;
      item = statechart.parent!;  // statechart.parent is not null
    }
  }

  // Returns a value indicating if the item can be added to the state
  // without violating statechart constraints.
  canAddState(state: StateTypes, statechart: Statechart) : boolean {
    // The only constraint is that there can't be two start states in a statechart.
    if (!(state instanceof Pseudostate) || state.subtype !== 'start')
      return true;
    for (let child of statechart.states.asArray()) {
      if (child !== state && child instanceof Pseudostate && child.subtype === 'start')
        return false;
    }
    return true;
  }

  isValidTransition(src: StateTypes, dst: StateTypes) : boolean {
    if (!src || !dst) return false;
    // No transition to self for pseudostates.
    if (src === dst) return src instanceof State;
    // No transitions to a start pseudostate.
    if (dst instanceof Pseudostate && dst.subtype === 'start') return false;
    // No transitions from a stop pseudostate.
    if (src instanceof Pseudostate && src.subtype === 'stop') return false;
    // No transitions out of parent state for start or history pseudostates.
    if (src instanceof Pseudostate && (
        src.subtype === 'start' || src.subtype === 'history' || src.subtype === 'history*')) {
      const srcParent = src.parent,
            dstParent = dst.parent;
      return srcParent === dstParent;
    }
    // Transitions can't straddle parallel statecharts. The lowest common ancestor
    // of src and dst must be a statechart, not a state, except for "inside" transitions.
    const lca = getLowestCommonAncestor<AllTypes>(src, dst);
    if (!lca) return false;
    // Allow transitions between a super state and its child states.
    if (lca instanceof State)
      return src === this.getGrandParent(dst);
    return lca instanceof Statechart;
  }

  findChildStatechart(superState: State, child: StateTypes | Transition) : Statechart | undefined {
    for (let statechart of superState.statecharts.asArray()) {
      if (child instanceof Transition || this.canAddState(child, statechart)) {
        return statechart;
      }
    }
    return undefined;
  }

  findOrCreateChildStatechart(state: State, child: StateTypes | Transition) : Statechart {
    let statechart = this.findChildStatechart(state, child);
    if (!statechart) {
      statechart = this.newStatechart();
      state.statecharts.append(statechart);
    }
    return statechart;
  }

  beginTransaction(name: string) {
    this.transactionManager.beginTransaction(name);
  }
  endTransaction(name: string) {
    this.transactionManager.endTransaction();
  }
  cancelTransaction(name: string) {
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

  deleteItem(item: AllTypes) {
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

  deleteItems(items: AllTypes[]) {
    const self = this;
    items.forEach(item => self.deleteItem(item));
  }

  select(item: AllTypes) {
    this.selection.add(item);
  }

  selectionContents() : AllTypes[] {
    return this.selection.contents();
  }

  selectedStates() : Array<StateTypes> {
    const result = new Array<StateTypes>();
    this.selection.forEach(item => {
      if (item instanceof State || item instanceof Pseudostate)
        result.push(item);
    });
    return result;
  }

  reduceSelection() {
    const selection = this.selection;
    // First, replace statecharts by their parent state. We do this by adding parent
    // states to the selection before reducing.
    selection.forEach(function(item: AllTypes) {
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

  selectInteriorTransitions() {
    const self = this,
          graphInfo = this.getSubgraphInfo(this.selectedStates());
    graphInfo.interiorTransitions.forEach(transition => self.selection.add(transition));
  }

  selectConnectedStates(upstream: boolean) {
    const selectedStates = this.selectedStates(),
          connectedStates = this.getConnectedStates(selectedStates, upstream, true);
    this.selection.set(Array.from(connectedStates));
  }

  addItem(item: StateTypes | Transition, parent: State | Statechart) : AllTypes {
    const oldParent = item.parent;

    if (!parent)
      parent = this.statechart;
    if (oldParent === parent)
      return item;
    if (parent instanceof State) {
      parent = this.findOrCreateChildStatechart(parent, item);
    } else if (parent instanceof Statechart) {
      if (!(item instanceof Transition)) {
        // If adding a pseudostate to a non-root statechart, add a new statechart to hold it.
        // We allow the exception for the root statechart so we can drag and drop between
        // child statecharts.
        if (!this.canAddState(item, parent) && parent !== this.statechart) {
          const superState = parent.parent!;
          parent = this.findOrCreateChildStatechart(superState, item);
        }
      }
    }
    // At this point we can add item to parent.
    if (item instanceof State || item instanceof Pseudostate) {
      const translation = this.getToParent(item, parent);
      item.x += translation.x;
      item.y += translation.y;
    }

    if (oldParent)
      this.deleteItem(item);

    if (parent instanceof Statechart) {
      if (item instanceof Transition) {
        parent.transitions.append(item);
      } else if (item instanceof State || item instanceof Pseudostate) {
        parent.states.append(item);
      }
    }
    return item;
  }

  addItems(items: AllTypes[], parent: State | Statechart) {
    // Add states first, then transitions, so the context can track transitions.
    for (let item of items) {
      if (item instanceof State || item instanceof Pseudostate)
        this.addItem(item, parent);
    }
    for (let item of items) {
      if (item instanceof Transition)
        this.addItem(item, parent);
    }
  }

  copy() : AllTypes[] {
    const statechart = this.statechart,
          selection = this.selection;

    selection.set(this.selectedStates());
    this.selectInteriorTransitions();
    this.reduceSelection();

    const selected = selection.contents(),
          map = new Map<number, StateTypes>(),
          copies = copyItems(selected, this, map);

    selected.forEach(item => {
      if (item instanceof State || item instanceof Pseudostate) {
        const copy = map.get(item.id);
        if (copy) {
          const translation = this.getToParent(item, statechart);
          copy.x += translation.x;
          copy.y += translation.y;
        }
      }
    });
    return copies as AllTypes[];
  }

  paste(items: AllTypes[]) : AllTypes[] {
    this.transactionManager.beginTransaction('paste');
    items.forEach(item => {
      // Offset paste so copies don't overlap with the originals.
      if (item instanceof State || item instanceof Pseudostate) {
        item.x += 16;
        item.y += 16;
      }
    });
    const copies = copyItems(items, this) as AllTypes[];  // TODO fix
    this.addItems(copies, this.statechart);
    this.selection.set(copies);
    this.transactionManager.endTransaction();
    return copies;
  }

  cut() : AllTypes[] {
    this.transactionManager.beginTransaction('cut');
    const result = this.copy();
    this.deleteItems(this.selection.contents());
    this.transactionManager.endTransaction();
    return result;
  }

  makeConsistent () {
    const self = this,
          statechart = this.statechart,
          graphInfo = this.getGraphInfo();
    // Eliminate dangling transitions.
    graphInfo.transitions.forEach(transition => {
      const src = transition.src,
            dst = transition.dst;
      if (!src || !graphInfo.states.has(src) ||
          !dst || !graphInfo.states.has(dst)) {
        self.deleteItem(transition);
        return;
      }
      // Make sure transitions belong to lowest common statechart.
      const srcParent = src.parent!,
            dstParent = dst.parent!,
            lca: Statechart = getLowestCommonAncestor<AllTypes>(srcParent, dstParent) as Statechart;
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

  isValidStatechart(statechart: Statechart) : boolean {
    const self = this;
    let startingStates = 0;
    // A statechart is valid if its states and transitions are valid.
    let valid: boolean = true;
    statechart.transitions.forEach(transition => {
        if (!self.isValidTransition(transition.src!, transition.dst!))
          valid = false;
    });
    statechart.states.forEach(state => {
      if (state instanceof State) {
        state.statecharts.forEach(statechart => {
          if (!self.isValidStatechart(statechart))
            valid = false;
        });
      } else {
        // Pseudostate...
      }
    });
    return valid;
  }

  private insertState_(state: StateTypes, parent: Statechart) {
    this.states.add(state);

    if (state.inTransitions === undefined)
      state.inTransitions = new Array<Transition>();
    if (state.outTransitions === undefined)
      state.outTransitions = new Array<Transition>();

    if (state instanceof State && state.statecharts) {
      const self = this;
      state.statecharts.forEach(statechart => self.insertStatechart_(statechart, state));
    }
  }

  private removeState_(state: StateTypes) {
    this.states.delete(state);
  }

  private insertStatechart_(statechart: Statechart, parent: State | undefined) {
    this.statecharts.add(statechart);

    const self = this;
    statechart.states.forEach(state => self.insertState_(state, statechart));
    statechart.transitions.forEach(transition => self.insertTransition_(transition, statechart));
  }

  private removeStatechart_(stateChart: Statechart) {
    this.statecharts.delete(stateChart);
    const self = this;
    stateChart.states.forEach(state => self.removeState_(state));
  }

  private insertTransition_(transition: Transition, parent: Statechart) {
    this.transitions.add(transition);

    const src = transition.src,
          dst = transition.dst;
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

  private removeTransition_(transition: Transition) {
    this.transitions.delete(transition);
    const src = transition.src,
          dst = transition.dst;
    function remove(array: Array<Transition>, transition: Transition) {
      const index = array.indexOf(transition);
      if (index >= 0) {
        array.splice(index, 1);
      }
    }
    if (src) {
      const outputs = src.outTransitions;
      remove(outputs, transition);
    }
    if (dst) {
      const inputs = dst.inTransitions;
      remove(inputs, transition);
    }
  }

  private insertItem_(item: AllTypes, parent: ParentTypes) {
    item.parent = parent;
    this.updateItem(item);

    if (item instanceof Transition) {
      if (parent && parent instanceof Statechart)
        this.insertTransition_(item, parent);
    } else if (item instanceof Statechart) {
      if (!parent || parent instanceof State)
        this.insertStatechart_(item, parent);
    } else {
      if (parent && parent instanceof Statechart) {
        this.insertState_(item, parent);
      }
    }
  }

  private removeItem_(item: AllTypes) {
    if (item instanceof Transition)
      this.removeTransition_(item);
    else if (item instanceof Statechart)
      this.removeStatechart_(item);
    else
      this.removeState_(item);
  }

  // DataContext interface implementation.
  valueChanged(owner: AllTypes, prop: ScalarPropertyTypes, oldValue: any) : void {
    if (owner instanceof Transition) {
      // Remove and reinsert changed transitions.
      const parent = owner.parent;
      if (parent) {
        if (prop === transitionTemplate.src) {
          const oldSrc = oldValue as StateTypes;
          if (oldSrc) {
            const outputs = oldSrc.outTransitions;
            const index = outputs.indexOf(owner);
            if (index >= 0)
              outputs.splice(index, 1);
          }
        } else if (prop === transitionTemplate.dst) {
          const oldDst = oldValue as StateTypes;
          if (oldDst) {
            const inputs = oldDst.inTransitions;
            const index = inputs.indexOf(owner);
            if (index >= 0)
              inputs.splice(index, 1);
          }
        }
        this.insertTransition_(owner, parent);
      }
    }
    this.onValueChanged(owner, prop, oldValue);
    this.updateItem(owner);  // Update any derived properties.
  }
  elementInserted(owner: State | Statechart, prop: ArrayPropertyTypes, index: number) : void {
    const value: AllTypes = prop.get(owner).at(index) as AllTypes;
    this.insertItem_(value, owner);
    this.onElementInserted(owner, prop, index);
  }
  elementRemoved(owner: State | Statechart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes) : void {
    this.removeItem_(oldValue);
    this.onElementRemoved(owner, prop, index, oldValue);
  }
  resolveReference(owner: AllTypes, prop: ReferenceProp) : StateTypes | undefined {
    // Look up state id.
    const id: number = prop.getId(owner);
    if  (!id)
      return undefined;
    return this.stateMap.get(id);
  }
  construct(typeName: string) : AllTypes {
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

  private onChanged(change: Change) : Change {
    // console.log(change);
    super.onEvent('changed', change);
    return change;
  }
  private onValueChanged(
      owner: AllTypes, prop: ScalarPropertyTypes, oldValue: any) :
      Change {
    const change: Change = {type: 'valueChanged', item: owner, prop, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    return this.onChanged(change);
  }
  private onElementInserted(
      owner: State | Statechart, prop: ArrayPropertyTypes, index: number) :
      Change {
    const change: Change =
        { type: 'elementInserted', item: owner, prop: prop, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(
      owner: State | Statechart, prop: ArrayPropertyTypes, index: number, oldValue: AllTypes ) :
      Change {
    const change: Change =
        { type: 'elementRemoved', item: owner, prop: prop, index: index, oldValue: oldValue };
    super.onEvent('elementRemoved', change);
    return this.onChanged(change);
  }
}

//------------------------------------------------------------------------------

class StatechartTheme extends Theme {
  radius: number;
  textIndent: number = 8;
  textLeading: number = 6;
  arrowSize: number = 8;
  knobbyRadius: number = 4;
  padding: number = 8;

  stateMinWidth: number = 75;
  stateMinHeight: number = 40;  // TODO make sure there's room for entry/exit action text

  // Rather than try to render actual text for H and H* into the pseudostate disk,
  // render the glyphs as moveto/lineto pairs.
  HGlyph: Array<number>;
  StarGlyph: Array<number>;

  constructor(theme: Theme, radius: number = 8) {
    super();
    Object.assign(this, theme);

    this.radius = radius;
    const r = radius,
          v = r / 2,
          h = r / 3;
    this.HGlyph = [-h, -v, -h, v, -h, 0, h, 0, h, -v, h, v];
    this.StarGlyph = [-h, -v / 3, h, v / 3, -h, v / 3, h, -v / 3, 0, -v / 1.5, 0, v / 1.5];
  }
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

class StateHitResult {
  item: State;
  inner: RectHitResult;
  arrow: boolean = false;
  constructor(item: State, inner: RectHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

class PseudostateHitResult {
  item: Pseudostate;
  inner: DiskHitResult;
  arrow: boolean = false;
  constructor(item: Pseudostate, inner: DiskHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

class TransitionHitResult {
  item: Transition;
  inner: CurveHitResult;
  constructor(item: Transition, inner: CurveHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

class StatechartHitResult {
  item: Statechart;
  inner: RectHitResult;
  constructor(item: Statechart, inner: RectHitResult) {
    this.item = item;
    this.inner = inner;
  }
}

type HitResultTypes =
  StateHitResult | PseudostateHitResult | TransitionHitResult | StatechartHitResult;

enum RenderMode {
  Normal,
  Highlight,
  HotTrack,
  Print
}

class Renderer {
  private theme: StatechartTheme;
  private ctx: CanvasRenderingContext2D;

  constructor(theme: Theme) {
    this.theme = new StatechartTheme(theme);
  }

  begin(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    ctx.save();
    ctx.font = this.theme.font;
  }
  end() {
    this.ctx.restore();
  }

  getSize(item: StateTypes | Statechart) : { width: number, height: number } {
    let width = 0, height = 0;
    if (item instanceof State || item instanceof Statechart) {
      width = item.width;
      height = item.height;
    } else if (item instanceof Pseudostate) {
      width = height = 2 * this.theme.radius;
    }
    return { width: width, height: height };
  }
  getItemRect(item: AllTypes) : Rect {
    let x, y, width, height;
    if (item instanceof Transition) {
      const extents = getExtents(item.bezier);
      x = extents.xmin;
      y = extents.ymin;
      width = extents.xmax - x;
      height = extents.ymax - y;
    } else {
      const size = this.getSize(item),
            global = item.globalPosition;
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
  getBounds(items: AllTypes[]) : Rect {
    let first = true,
        xmin = 0, ymin = 0, xmax = 0, ymax = 0;
    for (let item of items) {
      const rect = this.getItemRect(item);
      if (first) {
        xmin = rect.x;
        xmax = rect.x + rect.width;
        ymin = rect.y;
        ymax = rect.y + rect.height;
        first = false;
      } else {
        xmin = Math.min(xmin, rect.x);
        ymin = Math.min(ymin, rect.y);
        xmax = Math.max(xmax, rect.x + rect.width);
        ymax = Math.max(ymax, rect.y + rect.height);
      }
    }
    return { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
  }
  statePointToParam(state: StateTypes, p: Point) {
    const r = this.theme.radius,
          rect = this.getItemRect(state);
    if (state instanceof State)
      return rectPointToParam(rect.x, rect.y, rect.width, rect.height, p);

    return circlePointToParam(rect.x + r, rect.y + r, p);
  }
  stateParamToPoint(state: StateTypes, t: number) {
    const r = this.theme.radius,
          rect = this.getItemRect(state);
    if (state instanceof State)
      return roundRectParamToPoint(rect.x, rect.y, rect.width, rect.height, r, t);

    return circleParamToPoint(rect.x + r, rect.y + r, r, t);
  }
  getStateMinSize(state: StateTypes) {
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
  getNextStatechartY(state: State) {
    let y = 0;
    if (state.statecharts.length > 0) {
      const lastStatechart = state.statecharts.at(state.statecharts.length - 1);
      y = lastStatechart.y + lastStatechart.height;
    }
    return y;
  }
  layoutState(state: State) {
    const self = this,
          theme = this.theme,
          textSize = theme.fontSize,
          textLeading = theme.textLeading,
          lineSpacing = textSize + textLeading;

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
  layoutStatechart(statechart: Statechart) {
    const padding = this.theme.padding,
          global = statechart.globalPosition,
          statechartX = global.x,
          statechartY = global.y,
          states = statechart.states,
          transitions = statechart.transitions;
    // TODO bound transitions too.
    if (states.length) {
      // Get extents of child states.
      const r = this.getBounds(states.asArray()),
            x = r.x - statechartX, // Get position in statechart coordinates.
            y = r.y - statechartY;
      let xMin = Math.min(0, x - padding),
          yMin = Math.min(0, y - padding),
          xMax = x + r.width + padding,
          yMax = y + r.height + padding;
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
  layoutTransition(transition: Transition) {
    const self = this,
          src = transition.src,
          dst = transition.dst,
          p1 = src ? this.stateParamToPoint(src, transition.tSrc) : transition.pSrc,
          p2 = dst ? this.stateParamToPoint(dst, transition.tDst) : transition.pDst;
    // If we're in an intermediate state, don't layout.
    if (!p1 || !p2)
      return;
    function getCenter(state: StateTypes) {
      const bbox = self.getItemRect(state);
      return {
        x: bbox.x + bbox.width * 0.5,
        y: bbox.y + bbox.height * 0.5,
      }
    }
    // If it's an "inside" transition, flip the source normal.
    if (src && dst && dst.parent) {
      const dstGrandParent = dst.parent.parent;
      if (src === dstGrandParent) {
        p1.nx = -p1.nx;
        p1.ny = -p1.ny;
      }
    }
    const scaleFactor = src === dst ? 64 : 0,
          bezier = getEdgeBezier(p1, p2, scaleFactor);
    if (src && src instanceof Pseudostate) {
      // Adjust the bezier's p1 and c1 to start on the boundary, towards bezier c2.
      const to = bezier[2],
            center = getCenter(src),
            radius = this.theme.radius,
            projection = projectPointToCircle(to, center, radius);
      bezier[0] = projection;
      bezier[1] = to;
    }
    if (dst && dst instanceof Pseudostate) {
      // Adjust the bezier's c2 and p2 to end on the boundary, towards bezier c1.
      const to = bezier[1],
            center = getCenter(dst),
            radius = this.theme.radius,
            projection = projectPointToCircle(to, center, radius);
      bezier[3] = projection;
      bezier[2] = to;
    }
    transition.bezier = bezier;
    transition.textPoint = evaluateBezier(bezier, transition.tText);
    let text = '', textWidth = 0;

    const ctx = this.ctx,
          padding = this.theme.padding;
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
  layout(item: AllTypes) {
    if  (item instanceof State) {
      this.layoutState(item);
    } else if (item instanceof Statechart) {
      this.layoutStatechart(item);
    } else if (item instanceof Transition) {
      this.layoutTransition(item);
    }
  }
  drawArrow(x: number, y: number) {
    const ctx = this.ctx!;
    ctx.beginPath();
    arrowPath({ x: x, y: y, nx: -1, ny: 0 }, ctx, this.theme.arrowSize);
    ctx.stroke();
  }
  hitTestArrow(x: number, y: number, p:  Point, tol: number) {
    const d = this.theme.arrowSize, r = d * 0.5;
    return hitTestRect(x - r, y - r, d, d, p, tol);
  }
  drawState(state: State, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(state),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          textSize = theme.fontSize,
          lineBase = y + textSize + theme.textLeading;

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
  hitTestState(state: State, p: Point, tol: number, mode: RenderMode) : StateHitResult | undefined {
    const theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(state),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
    if (inner) {
      const lineBase = y + theme.fontSize + theme.textLeading,
            result = new StateHitResult(state, inner);
      if (mode !== RenderMode.Print && this.hitTestArrow(x + w + theme.arrowSize, lineBase, p, tol))
        result.arrow = true;
      return result;
    }
  }
  drawPseudoState(pseudostate: Pseudostate, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(pseudostate),
          x = rect.x, y = rect.y,
          cx = x + r, cy = y + r;

    function drawGlyph(glyph: number[], cx: number, cy: number) {
      for (let i = 0; i < glyph.length; i += 4) {
        ctx!.moveTo(cx + glyph[i], cy + glyph[i + 1]);
        ctx!.lineTo(cx + glyph[i + 2], cy + glyph[i + 3]);
      }
    }
    diskPath(cx, cy, r, ctx);
    switch (mode) {
      case RenderMode.Normal:
      case RenderMode.Print:
        ctx.lineWidth = 0.25;
        switch (pseudostate.subtype) {
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
    if (mode !== RenderMode.Print && pseudostate.subtype !== 'stop') {
      this.drawArrow(x + 2 * r + theme.arrowSize, y + r);
    }
  }
  hitTestPseudoState(
      state: Pseudostate, p: Point, tol: number, mode: RenderMode) : PseudostateHitResult | undefined {
    const theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(state),
          x = rect.x, y = rect.y,
          inner = hitTestDisk(x + r, y + r, r, p, tol);
    if (inner) {
      const result = new PseudostateHitResult(state, inner);
      if (mode !== RenderMode.Print && state.subtype !== 'stop' &&
          this.hitTestArrow(x + 2 * r + theme.arrowSize, y + r, p, tol)) {
        result.arrow = true;
      }
      return result;
    }
  }
  drawStatechart(statechart: Statechart, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.radius,
          textSize = theme.fontSize,
          rect = this.getItemRect(statechart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height;
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
  hitTestStatechart(
      statechart: Statechart, p: Point, tol: number, mode: RenderMode) : StatechartHitResult | undefined {
    const theme = this.theme,
          r = theme.radius,
          rect = this.getItemRect(statechart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol);
    if (inner) {
      return new StatechartHitResult(statechart, inner);
    }
  }
  drawTransition(transition: Transition, mode: RenderMode) {
    const ctx = this.ctx,
          theme = this.theme,
          r = theme.knobbyRadius,
          bezier = transition.bezier;
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
  hitTestTransition(
      transition: Transition, p: Point, tol: number, mode: RenderMode) : TransitionHitResult | undefined {
    const inner = hitTestBezier(transition.bezier, p, tol);
    if (inner) {
      return new TransitionHitResult(transition, inner);
    }
  }
  draw(item: AllTypes, mode: RenderMode) {
    if (item instanceof State) {
      this.drawState(item, mode);
    } else if (item instanceof Pseudostate) {
      this.drawPseudoState(item, mode);
    } else if (item instanceof Transition) {
      this.drawTransition(item, mode);
    } else if (item instanceof Statechart) {
      this.drawStatechart(item, mode);
    }
  }
  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) {
    let hitInfo: HitResultTypes | undefined;
    if (item instanceof State) {
      hitInfo = this.hitTestState(item, p, tol, mode);
    } else if (item instanceof Pseudostate) {
      hitInfo = this.hitTestPseudoState(item, p, tol, mode);
    } else if (item instanceof Transition) {
      hitInfo = this.hitTestTransition(item, p, tol, mode);
    } else if (item instanceof Statechart) {
      hitInfo = this.hitTestStatechart(item, p, tol, mode);
    }
    return hitInfo;
  }
  drawHoverText(item: AllTypes, p: Point, nameValuePairs: { name: string, value: any }[]) {
    const self = this,
          ctx = this.ctx,
          theme = this.theme,
          textSize = theme.fontSize,
          gap = 16,
          border = 4,
          height = textSize * nameValuePairs.length + 2 * border,
          maxWidth = measureNameValuePairs(nameValuePairs, gap, ctx) + 2 * border;
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
// format.

function assignProps(src: any, dst: DataContextObject) {
  dst.template.properties.forEach(function (prop) {
    if (prop instanceof ScalarProp || prop instanceof ReferenceProp) {
      prop.set(dst, src[prop.name]);
    }
  });
}
function readState(
    raw: any, context: StatechartContext, map: Map<number, StateTypes>) : State {
  const state = context.newState();
  assignProps(raw, state);
  map.set(raw.id, state)
  if (raw.items) {
    raw.items.forEach((raw: any) => {
      state.statecharts.append(readStatechart(raw, context, map));
    });
  }
  return state;
}
function readPseudostate(
    raw: any, context: StatechartContext, map: Map<number, StateTypes>) : Pseudostate {
  const pseudostate = context.newPseudostate(raw.type);
  assignProps(raw, pseudostate);
  map.set(raw.id, pseudostate)
  return pseudostate;
}
function readTransition(
    raw: any, context: StatechartContext, map: Map<number, StateTypes>) : Transition {
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
function readStatechart(
    raw: any, context: StatechartContext, map: Map<number, StateTypes>) : Statechart {
  const statechart = context.newStatechart();
  assignProps(raw, statechart);
  // First states and pseudostates.
  raw.items.forEach((raw: any) => {
    if (raw.type === 'state') {
      statechart.states.append(readState(raw, context, map));
    } else if (raw.type !== 'transition') {
      statechart.states.append(readPseudostate(raw, context, map));
    }
  });
  // Now transitions.
  raw.items.forEach((raw: any) => {
    if (raw.type === 'transition') {
      statechart.transitions.append(readTransition(raw, context, map));
    }
  });
  return statechart;
}

function readRaw(raw: any, context: StatechartContext) : void {
  let statechart: Statechart | undefined = undefined;
  if (raw.items === undefined) {
    // new format.
    statechart = Deserialize(raw, context) as Statechart;
  } else {
    // old format.
    const map = new Map<number, StateTypes>();
    statechart = readStatechart(raw, context, map);
  }
  if (statechart) {
    context.setRoot(statechart);
  }
}

//------------------------------------------------------------------------------

function isStateBorder(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof StateHitResult && hitInfo.inner.border;
}

function isDropTarget(hitInfo: HitResultTypes) : boolean {
  const item = hitInfo.item,
        selection = item.context.selection;
  return (hitInfo instanceof StateHitResult || hitInfo instanceof StatechartHitResult) &&
          !selection.has(item) && !ancestorInSet(item, selection);
}

function isClickable(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof StatechartHitResult);
}

function isDraggable(hitInfo: HitResultTypes) : boolean {
  return hitInfo instanceof StateHitResult || hitInfo instanceof PseudostateHitResult;
}

function hasProperties(hitInfo: HitResultTypes) : boolean {
  return !(hitInfo instanceof PseudostateHitResult);
}

type StateDragType = 'copyPalette' | 'moveSelection' | 'moveCopySelection' | 'resizeState';
class StateDrag {
  items: AllTypes[];
  type: StateDragType;
  description: string;
  constructor(items: StateTypes[], type: StateDragType, description: string) {
    this.items = items;
    this.type = type;
    this.description = description;
  }
}

type TransitionDragType =
    'newTransition' | 'connectTransitionSrc' | 'connectTransitionDst' | 'moveTransitionPoint';
class TransitionDrag {
  transition: Transition;
  type: TransitionDragType;
  description: string;
  constructor(transition: Transition, type: TransitionDragType, description: string) {
    this.transition = transition;
    this.type = type;
    this.description = description;
  }
}

type DragTypes = StateDrag | TransitionDrag;

export class StatechartEditor implements CanvasLayer {
  private theme: StatechartTheme;
  private canvasController: CanvasController;
  private paletteController: CanvasController;
  private propertyGridController: PropertyGridController;
  private fileController: FileController;
  private hitTolerance: number;
  private changedItems: Set<AllTypes>;
  private changedTopLevelStates: Set<State>;
  private renderer: Renderer;
  private palette: Statechart;  // Statechart to simplify layout of palette items.
  private context: StatechartContext;
  private statechart: Statechart;
  private scrap: AllTypes[] = []

  private pointerHitInfo: HitResultTypes | undefined;
  private draggableHitInfo: HitResultTypes | undefined;
  private clickInPalette: boolean = false;
  private moveCopy: boolean = false;
  private dragInfo: DragTypes | undefined;
  private hotTrackInfo: HitResultTypes | undefined;
  private hoverHitInfo: HitResultTypes | undefined;
  private hoverPoint: Point;
  private propertyInfo = new Map<string, PropertyInfo[]>();

  constructor(theme: Theme,
              canvasController: CanvasController,
              paletteController: CanvasController,
              propertyGridController: PropertyGridController) {
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
    const context = new StatechartContext(),
          statechart = context.newStatechart(),
          start = context.newPseudostate('start'),
          stop = context.newPseudostate('stop'),
          history = context.newPseudostate('history'),
          historyDeep = context.newPseudostate('history*'),
          newState = context.newState();

    start.x = start.y = 8;
    stop.x = 40; stop.y = 8;
    history.x = 72; history.y = 8;
    historyDeep.x = 104; historyDeep.y = 8;
    newState.x = 8; newState.y = 32;
    newState.width = 100; newState.height = 60;

    statechart.states.append(start);
    statechart.states.append(stop);
    statechart.states.append(history);
    statechart.states.append(historyDeep);
    statechart.states.append(newState);
    context.setRoot(statechart);
    this.palette = statechart;

    // Default statechart.
    this.context = new StatechartContext();
    this.initializeContext(this.context);
    this.statechart = this.context.root();

    // Register property grid layouts.
    function getAttr(info: PropertyInfo) : string | undefined {
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
    function getter(info: PropertyInfo, item: AllTypes) {
      const attr = getAttr(info);
      if (item && attr)
        return (item as any)[attr];
      return '';
    }
    function setter(info: PropertyInfo, item: AllTypes, value: any) {
      const canvasController = self.canvasController;
      if (item) {
        const attr = getAttr(info);
        if (attr) {
          const description = 'change ' + attr,
                transactionManager = self.context.transactionManager;
          transactionManager.beginTransaction(description);
          (item as any)[attr] = value;
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
  initializeContext(context: StatechartContext) {
    const self = this;

    // On attribute changes and item insertions, dynamically layout affected items.
    // This allows us to layout transitions as their src or dst states are dragged.
    context.addHandler('changed', change => self.onChanged_(change));

    // On ending transactions and undo/redo, layout the changed top level states.
    function updateBounds() {
      self.updateBounds_();
    }
    context.transactionManager.addHandler('transactionEnding', updateBounds);
    context.transactionManager.addHandler('didUndo', updateBounds);
    context.transactionManager.addHandler('didRedo', updateBounds);
  }
  setContext(context: StatechartContext) {
    const statechart = context.root(),
          renderer = this.renderer;

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
  initialize(canvasController: CanvasController) {
    if (canvasController === this.canvasController) {
    } else {
      const renderer = this.renderer;
      // assert(canvasController === this.paletteController);
      renderer.begin(canvasController.getCtx());
      // Layout the palette items and their parent statechart.
      renderer.begin(canvasController.getCtx());
      this.context.reverseVisitAll(this.palette, item => renderer.layout(item));
      // Draw the palette items.
      this.context.visitAll(this.palette, item => renderer.draw(item, RenderMode.Normal));
      renderer.end();
    }
  }
  onChanged_(change: Change) {
    const statechart = this.statechart,
          context = this.context, changedItems = this.changedItems,
          changedTopLevelStates = this.changedTopLevelStates,
          item: AllTypes = change.item as AllTypes, prop = change.prop;

    // Track all top level states which contain changes. On ending a transaction,
    // update the layout of states and statecharts.
    let ancestor: AllTypes | undefined = item,
        topLevel;
    do {
      topLevel = ancestor;
      ancestor = ancestor.parent;
    } while (ancestor && ancestor !== statechart);

    if (ancestor === statechart && topLevel instanceof State) {
      changedTopLevelStates.add(topLevel);
    }

    function addItems(item: AllTypes) {
      if (item instanceof State || item instanceof Pseudostate) {
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
        } else if (item instanceof Transition) {
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
  updateLayout_() {
    const renderer = this.renderer,
          context = this.context,
          changedItems = this.changedItems;
    // This function is called during the draw, hitTest, and updateBounds_ methods,
    // so the renderer is started.
    // First layout containers, and then layout transitions which depend on states'
    // size and location.
    function layout(item: AllTypes, visitor: StatechartVisitor) {
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
  updateBounds_() {
    const ctx = this.canvasController.getCtx(),
          renderer = this.renderer,
          context = this.context,
          statechart = this.statechart,
          changedTopLevelStates = this.changedTopLevelStates;
    renderer.begin(ctx);
    // Update any changed items first.
    this.updateLayout_();
    // Then update the bounds of super states, bottom up.
    changedTopLevelStates.forEach(
      state => context.reverseVisitAll(state, item => {
        if (!(item instanceof Transition))
          renderer.layout(item);
    }));
    // Finally update the root statechart's bounds.
    renderer.layoutStatechart(statechart);
    renderer.end();
    changedTopLevelStates.clear();
    // Make sure the canvas is large enough to contain the root statechart.
    const canvasController = this.canvasController,
          canvasSize = canvasController.getSize();
    let width = statechart.width, height = statechart.height;
    if (width > canvasSize.width || height > canvasSize.height) {
      width = Math.max(width, canvasSize.width);
      height = Math.max(height, canvasSize.height);
      canvasController.setSize(width, height);
    }
  }
  draw(canvasController: CanvasController) {
    const renderer = this.renderer,
          statechart = this.statechart,
          context = this.context;
    if (canvasController === this.canvasController) {
      // Draw a dashed border around the canvas.
      const ctx = canvasController.getCtx(),
            size = canvasController.getSize();
      ctx.strokeStyle = this.theme.strokeColor;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(0, 0, size.width, size.height);
      ctx.setLineDash([]);

      // Now draw the statechart.
      renderer.begin(ctx);
      this.updateLayout_();
      canvasController.applyTransform();

      context.visitAll(statechart, item => {
        if (!(item instanceof Transition))
          renderer.draw(item, RenderMode.Normal);
      });
      context.visitAll(statechart, item => {
        if (item instanceof Transition)
          renderer.draw(item, RenderMode.Normal);
      });

      context.selection.forEach(function (item) {
        renderer.draw(item, RenderMode.Highlight);
      });

      if (this.hotTrackInfo)
        renderer.draw(this.hotTrackInfo.item, RenderMode.HotTrack);

      const hoverHitInfo = this.hoverHitInfo;
      if (hoverHitInfo) {
        const item = hoverHitInfo.item,
              propertyInfo = this.propertyInfo.get(item.template.typeName),
              nameValuePairs = [];
        if (propertyInfo) {
          for (let info of propertyInfo) {
            const name = info.label,
                  value = info.getter(info, item);
            if (value !== undefined) {
              nameValuePairs.push({ name, value });
            }
          }
          renderer.drawHoverText(hoverHitInfo.item, this.hoverPoint, nameValuePairs);
        }
      }
      renderer.end();
    } else if (canvasController === this.paletteController) {
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
    const renderer = this.renderer,
          context = this.context,
          statechart = this.statechart,
          canvasController = this.canvasController;

    // Calculate document bounds.
    const items: AllTypes[] = new Array();
    context.visitAll(statechart, function (item) {
      items.push(item);
    });

    const bounds = renderer.getBounds(items);
    // Adjust all edges 1 pixel out.
    const ctx = new (window as any).C2S(bounds.width + 2, bounds.height + 2);
    ctx.translate(-bounds.x + 1, -bounds.y + 1);

    renderer.begin(ctx);
    canvasController.applyTransform();

    context.visitAllItems(statechart.states, state => {
      renderer.draw(state, RenderMode.Print);
    });
    context.visitAllItems(statechart.transitions, transition => {
      renderer.draw(transition, RenderMode.Print);
    });

    renderer.end();

    // Write out the SVG file.
    const serializedSVG = ctx.getSerializedSvg();
    const blob = new Blob([serializedSVG], {
      type: 'text/plain'
    });
    (window as any).saveAs(blob, 'statechart.svg', true);
  }
  getCanvasPosition(canvasController: CanvasController, p: Point) {
    // When dragging from the palette, convert the position from pointer events
    // into the canvas space to render the drag and drop.
    return this.canvasController.viewToOtherCanvasView(canvasController, p);
  }
  hitTestCanvas(p: Point) {
    const renderer = this.renderer,
          context = this.context,
          tol = this.hitTolerance,
          statechart = this.statechart,
          canvasController = this.canvasController,
          cp = this.getCanvasPosition(canvasController, p),
          ctx = canvasController.getCtx(),
          hitList: Array<HitResultTypes> = [];
    function pushInfo(info: HitResultTypes | undefined) {
      if (info)
        hitList.push(info);
    }
    renderer.begin(ctx);
    this.updateLayout_();
    // TODO hit test selection first, in highlight, first.
    // Skip the root statechart, as hits there should go to the underlying canvas controller.
    // Hit test transitions first.
    context.reverseVisitAll(statechart, (item: AllTypes) => {
      if (item instanceof Transition)
        pushInfo(renderer.hitTestTransition(item, cp, tol, RenderMode.Normal));
    });
    context.reverseVisitAll(statechart, (item: AllTypes) => {
      if (!(item instanceof Transition))
        pushInfo(renderer.hitTest(item, cp, tol, RenderMode.Normal));
    });
    renderer.end();
    return hitList;
  }
  hitTestPalette(p: Point) {
    const renderer = this.renderer,
          context = this.context,
          tol = this.hitTolerance,
          ctx = this.paletteController.getCtx(),
          hitList: Array<HitResultTypes> = [];
    function pushInfo(info: HitResultTypes | undefined) {
      if (info)
        hitList.push(info);
    }
    renderer.begin(ctx);
    context.reverseVisitAllItems(this.palette.states, state => {
      pushInfo(renderer.hitTest(state, p, tol, RenderMode.Normal));
    });
    renderer.end();
    return hitList;
  }
  getFirstHit(
      hitList: Array<HitResultTypes>, filterFn: (hitInfo: HitResultTypes) => boolean):
      HitResultTypes | undefined {
    for (let hitInfo of hitList) {
      if (filterFn(hitInfo))
        return hitInfo;
    }
  }
  getDraggableAncestor(hitList: Array<HitResultTypes>, hitInfo: HitResultTypes | undefined) {
    while (hitInfo && !isDraggable(hitInfo)) {
      const parent = hitInfo.item.parent;
      hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; })
    }
    return hitInfo;
  }
  setPropertyGrid() {
    const context = this.context,
          item = context.selection.lastSelected(),
          type = item ? item.template.typeName : undefined;
    this.propertyGridController.show(type, item);
  }
  onClick(canvasController: CanvasController) {
    const context = this.context,
          selection = context.selection,
          shiftKeyDown = this.canvasController.shiftKeyDown,
          cmdKeyDown = this.canvasController.cmdKeyDown,
          p = canvasController.getClickPointerPosition(),
          cp = canvasController.viewToCanvas(p);
    let hitList;
    if (canvasController === this.paletteController) {
      hitList = this.hitTestPalette(cp);
      this.clickInPalette = true;
    } else {
      hitList = this.hitTestCanvas(cp);
      this.clickInPalette = false;
    }
    const pointerHitInfo = this.pointerHitInfo = this.getFirstHit(hitList, isClickable);
    if (pointerHitInfo) {
      this.draggableHitInfo = this.getDraggableAncestor(hitList, pointerHitInfo);
      const item = pointerHitInfo.item;
      if (this.clickInPalette) {
        selection.clear();
      } else if (cmdKeyDown) {
        selection.toggle(item);
      } else if (shiftKeyDown) {
        selection.add(item);
        this.moveCopy = true;
      } else if (!selection.has(item)) {
        selection.set(item);
      } else {
        selection.add(item);
      }
    } else {
      if (!shiftKeyDown) {
        selection.clear();
      }
    }
    this.setPropertyGrid();
    return pointerHitInfo !== undefined;
  }
  onBeginDrag(canvasController: CanvasController) {
    let pointerHitInfo = this.pointerHitInfo;
    if (!pointerHitInfo)
      return false;

    const context = this.context,
          selection = context.selection,
          p0 = canvasController.getClickPointerPosition();
    let dragItem = pointerHitInfo.item;
    let drag: DragTypes | undefined, newTransition: Transition | undefined;
    // First check for a drag that creates a new transition.
    if ((pointerHitInfo instanceof StateHitResult || pointerHitInfo instanceof PseudostateHitResult) &&
         pointerHitInfo.arrow) {
      const state = (dragItem as State | Pseudostate),
            cp0 = this.getCanvasPosition(canvasController, p0);
      // Start the new transition as connecting the src state to itself.
      newTransition = context.newTransition(state, undefined);
      newTransition.pDst = { x: cp0.x, y: cp0.y, nx: 0, ny: 0 };
      newTransition.tText = 0.5; // initial property attachment at midpoint.
      drag = new TransitionDrag(newTransition, 'newTransition', 'Add new transition');
    } else if (pointerHitInfo instanceof TransitionHitResult) {
      if (pointerHitInfo.inner.t === 0)
        drag = new TransitionDrag(dragItem as Transition, 'connectTransitionSrc', 'Edit transition');
      else if (pointerHitInfo.inner.t === 1)
        drag = new TransitionDrag(dragItem as Transition, 'connectTransitionDst', 'Edit transition');
      else {
        drag = new TransitionDrag(dragItem as Transition, 'moveTransitionPoint', 'Drag transition attachment point');
      }
    } else if (this.draggableHitInfo) {
      pointerHitInfo = this.pointerHitInfo = this.draggableHitInfo;
      if (pointerHitInfo instanceof StateHitResult || pointerHitInfo instanceof PseudostateHitResult) {
        if (this.clickInPalette) {
          this.clickInPalette = false;  // TODO fix
          drag = new StateDrag([pointerHitInfo.item], 'copyPalette', 'Create new state or pseudostate');
        } else if (this.moveCopy) {
          this.moveCopy = false;  // TODO fix
          drag = new StateDrag(context.selectedStates(), 'moveCopySelection', 'Move copy of selection');
        } else {
          if (pointerHitInfo.item instanceof State && pointerHitInfo.inner.border) {
            drag = new StateDrag([pointerHitInfo.item], 'resizeState', 'Resize state');
          } else {
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
        const offset = this.paletteController.offsetToOtherCanvas(this.canvasController),
              copies = copyItems(drag.items, context) as AllTypes[];
        copies.forEach(copy => {
          if (copy instanceof State || copy instanceof Pseudostate) {
            copy.x -= offset.x;
            copy.y -= offset.y;
          }
        });
        drag.items = copies;
      } else if (drag.type == 'moveCopySelection') {
        const copies = context.copy();
        drag.items = copies;
      }

      context.transactionManager.beginTransaction(drag.description);
      if (newTransition) {
        context.addItem(newTransition, this.statechart);
        selection.set(newTransition);
      } else {
        if (drag.type == 'copyPalette' || drag.type == 'moveCopySelection') {
          context.addItems(drag.items, this.statechart);
          selection.set(drag.items);
        }
      }
    }
  }
  onDrag(canvasController: CanvasController) {
    const drag = this.dragInfo;
    if (!drag)
      return;
    const context = this.context,
          transactionManager = context.transactionManager,
          renderer = this.renderer,
          p0 = canvasController.getClickPointerPosition(),
          cp0 = this.getCanvasPosition(canvasController, p0),
          p = canvasController.getCurrentPointerPosition(),
          cp = this.getCanvasPosition(canvasController, p),
          dx = cp.x - cp0.x,
          dy = cp.y - cp0.y,
          pointerHitInfo = this.pointerHitInfo!,
          hitList = this.hitTestCanvas(cp);
    let hitInfo;
    if (drag instanceof StateDrag) {
      switch (drag.type) {
        case 'copyPalette':
        case 'moveCopySelection':
        case 'moveSelection': {
          hitInfo = this.getFirstHit(hitList, isDropTarget) as StateHitResult | StatechartHitResult;
          context.selection.forEach(item => {
            if (item instanceof Transition) return;
            const oldX = transactionManager.getOldValue(item, 'x'),
                  oldY = transactionManager.getOldValue(item, 'y');
            item.x = oldX + dx;
            item.y = oldY + dy;
          });
          break;
        }
        case 'resizeState': {
          const hitInfo = pointerHitInfo as StateHitResult,
                item = drag.items[0] as State,
                oldX = transactionManager.getOldValue(item, 'x'),
                oldY = transactionManager.getOldValue(item, 'y'),
                oldWidth =  transactionManager.getOldValue(item, 'width'),
                oldHeight =  transactionManager.getOldValue(item, 'height');
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
    } else if (drag instanceof TransitionDrag) {
      const transition = drag.transition;
      switch (drag.type) {
        case 'connectTransitionSrc': {
          const dst = transition.dst,
                hitInfo = this.getFirstHit(hitList, isStateBorder),
                src = hitInfo ? hitInfo.item as State | Pseudostate : undefined;
          if (src && dst && context.isValidTransition(src, dst)) {
            transition.src = src;
            const t1 = renderer.statePointToParam(src, cp);
            transition.tSrc = t1;
          } else {
            transition.src = undefined;  // This notifies observers to update the layout.
            transition.pSrc = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
          }
          break;
        }
        case 'newTransition':
        case 'connectTransitionDst': {
          const src = transition.src,
                hitInfo = this.getFirstHit(hitList, isStateBorder),
                dst = hitInfo ? hitInfo.item as State | Pseudostate : undefined;
          if (src && drag.type === 'newTransition') {
            transition.tSrc = renderer.statePointToParam(src, cp);
          }
          if (src && dst && context.isValidTransition(src, dst)) {
            transition.dst = dst;
            const t2 = renderer.statePointToParam(dst, cp);
            transition.tDst = t2;
          } else {
            transition.dst = undefined;  // This notifies observers to update the layout.
            transition.pDst = { x: cp.x, y: cp.y, nx: 0, ny: 0 };
          }
          break;
        }
        case 'moveTransitionPoint': {
          const hitInfo = renderer.hitTest(transition, cp, this.hitTolerance, RenderMode.Normal);
          if (hitInfo && hitInfo instanceof TransitionHitResult) {
            transition.tText = hitInfo.inner.t;
          } else {
            const oldTText = transactionManager.getOldValue(transition, 'tText');
            transition.tText = oldTText;
          }
          break;
        }
      }
    }
    this.hotTrackInfo = (hitInfo && hitInfo.item !== this.statechart) ? hitInfo : undefined;
  }
  onEndDrag(canvasController: CanvasController) {
    const drag = this.dragInfo;
    if (!drag)
      return;
    const context = this.context,
          statechart = this.statechart,
          selection = context.selection,
          transactionManager = context.transactionManager,
          p = canvasController.getCurrentPointerPosition(),
          cp = this.getCanvasPosition(canvasController, p);
    if (drag instanceof TransitionDrag) {
      drag.transition.pSrc = drag.transition.pDst = undefined;
    } else if (drag instanceof StateDrag &&
              (drag.type == 'copyPalette' || drag.type === 'moveSelection' ||
               drag.type === 'moveCopySelection')) {
      // Find state beneath mouse.
      const hitList = this.hitTestCanvas(cp),
            hitInfo = this.getFirstHit(hitList, isDropTarget);
      let parent: State | Statechart = statechart;
      if (hitInfo && (hitInfo instanceof StatechartHitResult || hitInfo instanceof StateHitResult)) {
        parent = hitInfo.item;
      }
      // Reparent items.
      selection.contents().forEach(item => {
        if (!(item instanceof Statechart))
          context.addItem(item, parent);
      });
    }

    if (context.isValidStatechart(statechart)) {
      transactionManager.endTransaction();
    } else {
      transactionManager.cancelTransaction();
    }

    this.setPropertyGrid();

    this.dragInfo = undefined;
    this.pointerHitInfo = undefined;
    this.draggableHitInfo = undefined;
    this.hotTrackInfo = undefined;

    this.canvasController.draw();
  }

  onKeyDown(e: KeyboardEvent) {
    const self = this,
          context = this.context,
          statechart = this.statechart,
          selection = context.selection,
          transactionManager = context.transactionManager,
          keyCode = e.keyCode,  // TODO fix
          cmdKey = e.ctrlKey || e.metaKey,
          shiftKey = e.shiftKey;

    if (keyCode === 8) { // 'delete'
      transactionManager.beginTransaction('delete');
      context.reduceSelection();
      context.deleteItems(selection.contents());
      transactionManager.endTransaction();
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
          this.scrap = context.cut()
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
            this.updateBounds_();
            return true;
          }
          return false;
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
          self.updateBounds_();
          self.canvasController.draw();
          return true;
        }
        case 79: { // 'o'
          function parse(text: string) {
            const raw = JSON.parse(text),
                  context = new StatechartContext();
            const statechart = readRaw(raw, context);
            self.initializeContext(context);
            self.setContext(context);
            self.renderer.begin(self.canvasController.getCtx());
            self.updateBounds_();
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
  onKeyUp(e: KeyboardEvent): boolean {
    return false;
  }
  onBeginHover(canvasController: CanvasController) {
    const context = this.context,
          p = canvasController.getCurrentPointerPosition(),
          hitList = this.hitTestCanvas(p),
          hoverHitInfo = this.hoverHitInfo = this.getFirstHit(hitList, hasProperties);
    if (!hoverHitInfo)
      return false;

    const cp = canvasController.viewToCanvas(p);
    this.hoverPoint = cp;
    this.hoverHitInfo = hoverHitInfo;
    return true;
  }
  onEndHover(canvasController: CanvasController) {
    this.hoverHitInfo = undefined;
  }
}

