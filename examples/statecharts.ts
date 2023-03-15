
import { SelectionSet } from '../src/collections'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint, getEdgeBezier, arrowPath, hitTestRect, RectHitResult,
         diskPath, hitTestDisk, DiskHitResult, roundRectPath, bezierEdgePath,
         hitTestBezier, measureNameValuePairs, CanvasController,
         PropertyGridController, PropertyInfo, FileController } from '../src/diagrams'

import { PointAndNormal, getExtents, projectPointToCircle, BezierCurve,
         evaluateBezier, CurveHitResult } from '../src/geometry'

import { ScalarProp, ArrayProp, ReferencedObject, RefProp, ParentProp,
         DataContext, EventBase, Change, ChangeEvents,
         getLowestCommonAncestor, reduceToRoots, List, DataList } from '../src/dataModels'

//------------------------------------------------------------------------------

// Derived properties, indexed by symbols to distinguish them from actual properties.
const globalPosition: unique symbol = Symbol('globalPosition');

const inTransitions: unique symbol = Symbol('inTransitions'),
      outTransitions: unique symbol = Symbol('outTransitions'),
      entryText: unique symbol = Symbol('entryText'),
      entryY: unique symbol = Symbol('entryY'),
      exitText: unique symbol = Symbol('exitText'),
      exitY: unique symbol = Symbol('exitY'),
      pSrc: unique symbol = Symbol('pSrc'),
      pDst: unique symbol = Symbol('pDst'),
      transitionBezier: unique symbol = Symbol('transitionBezier'),
      transitionTextPoint: unique symbol = Symbol('transitionTextPoint'),
      transitionText: unique symbol = Symbol('transitionText'),
      transitionTextWidth: unique symbol = Symbol('transitionTextWidth');

//------------------------------------------------------------------------------

// Interfaces to statechart objects.

const stateTemplate = {
  x: new ScalarProp<number>('x'),
  y: new ScalarProp<number>('y'),
  width: new ScalarProp<number>('width'),
  height: new ScalarProp<number>('height'),
  name: new ScalarProp<string | undefined>('name'),
  entry: new ScalarProp<string | undefined>('entry'),
  exit: new ScalarProp<string | undefined>('exit'),

  parent: new ParentProp<Statechart>,

  statecharts: new ArrayProp<Statechart>('statecharts'),
}

export type StateType = 'state';

export class State implements ReferencedObject {
  private readonly template = stateTemplate;
  readonly id: number;
  readonly context: StatechartContext;

  readonly type: StateType = 'state';

  get x() { return this.template.x.get(this) || 0; }
  set x(value) { this.template.x.set(this, this.context, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value) { this.template.y.set(this, this.context, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value) { this.template.width.set(this, this.context, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value) { this.template.height.set(this, this.context, value); }
  get name() { return this.template.name.get(this); }
  set name(value) { this.template.name.set(this, this.context, value); }
  get entry() { return this.template.entry.get(this); }
  set entry(value) { this.template.entry.set(this, this.context, value); }
  get exit() { return this.template.exit.get(this); }
  set exit(value) { this.template.exit.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  get statecharts() { return this.template.statecharts.get(this, this.context); }

  // Derived properties.
  [globalPosition]: Point;  // TODO move geometry interfaces to top.
  [inTransitions]: Transition[];
  [outTransitions]: Transition[];
  [entryText]: string | undefined;
  [entryY]: number | undefined;
  [exitText]: string | undefined;
  [exitY]: number | undefined;

  constructor(context: StatechartContext, id: number) {
    this.context = context;
    this.id = id;
  }
}

const pseudostateTemplate = {
  x: new ScalarProp<number>('x'),
  y: new ScalarProp<number>('y'),

  parent: new ParentProp<Statechart>,
}

export type PseudostateType = 'pseudostate';
export type PseudostateSubtype = 'start' | 'stop' | 'history' | 'history*';

export class Pseudostate implements ReferencedObject {
  private readonly template = pseudostateTemplate;
  readonly id: number;
  readonly context: StatechartContext;

  readonly type: PseudostateType = 'pseudostate';
  readonly subtype: PseudostateSubtype;

  get x() { return this.template.x.get(this) || 0; }
  set x(value) { this.template.x.set(this, this.context, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value) { this.template.y.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  // Derived properties.
  [globalPosition]: Point;
  [inTransitions]: Transition[];
  [outTransitions]: Transition[];

  constructor(subtype: PseudostateSubtype, id: number, context: StatechartContext) {
    this.subtype = subtype;
    this.id = id;
    this.context = context;
  }
}

const transitionTemplate = {
  src: new RefProp<StateTypes>('src'),
  tSrc: new ScalarProp<number>('tSrc'),
  dst: new RefProp<StateTypes>('dst'),
  tDst: new ScalarProp<number>('tDst'),

  event: new ScalarProp<string | undefined>('event'),
  guard: new ScalarProp<string | undefined>('guard'),
  action: new ScalarProp<string | undefined>('action'),
  tText: new ScalarProp<number>('tText'),

  parent: new ParentProp<Statechart>,
}

export type TransitionType = 'transition';

export class Transition {
  private readonly template = transitionTemplate;
  readonly context: StatechartContext;

  readonly type: TransitionType = 'transition';

  get src() { return this.template.src.get(this, this.context); }
  set src(value) { this.template.src.set(this, this.context, value); }
  get tSrc() { return this.template.tSrc.get(this) || 0; }
  set tSrc(value) { this.template.tSrc.set(this, this.context, value); }
  get dst() { return this.template.dst.get(this, this.context); }
  set dst(value) { this.template.dst.set(this, this.context, value); }
  get tDst() { return this.template.tDst.get(this) || 0; }
  set tDst(value) { this.template.tDst.set(this, this.context, value); }
  get event() { return this.template.event.get(this); }
  set event(value) { this.template.event.set(this, this.context, value); }
  get guard() { return this.template.guard.get(this); }
  set guard(value) { this.template.guard.set(this, this.context, value); }
  get action() { return this.template.action.get(this); }
  set action(value) { this.template.action.set(this, this.context, value); }
  get tText() { return this.template.tText.get(this) || 0; }
  set tText(value) { this.template.tText.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  // Derived properties.
  [pSrc]: PointAndNormal;
  [pDst]: PointAndNormal;
  [transitionBezier]: BezierCurve;
  [transitionTextPoint]: Point;
  [transitionText]: string;
  [transitionTextWidth]: number;

  constructor(context: StatechartContext) {
    this.context = context;
  }
}

const statechartTemplate = {
  x: new ScalarProp<number>('x'),
  y: new ScalarProp<number>('y'),
  width: new ScalarProp<number>('width'),
  height: new ScalarProp<number>('height'),
  name: new ScalarProp<string | undefined>('name'),

  parent: new ParentProp<State>,

  states: new ArrayProp<StateTypes>('states'),
  transitions: new ArrayProp<Transition>('transitions'),
}

export type StatechartType = 'statechart';

export class Statechart {
  private readonly template = statechartTemplate;
  readonly context: StatechartContext;

  readonly type: StatechartType = 'statechart';

  get x() { return this.template.x.get(this) || 0; }
  set x(value) { this.template.x.set(this, this.context, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value) { this.template.y.set(this, this.context, value); }
  get width() { return this.template.width.get(this) || 0; }
  set width(value) { this.template.width.set(this, this.context, value); }
  get height() { return this.template.height.get(this) || 0; }
  set height(value) { this.template.height.set(this, this.context, value); }
  get name() { return this.template.name.get(this) || ''; }
  set name(value) { this.template.name.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  get states() { return this.template.states.get(this, this.context); }
  get transitions() { return this.template.transitions.get(this, this.context); }

  // Derived properties.
  [globalPosition]: Point;

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

type StatechartChange = Change<AllTypes, AllTypes | undefined>;

export interface GraphInfo {
  states: Set<StateTypes>;
  statecharts: Set<Statechart>;
  transitions: Set<Transition>;
  interiorTransitions: Set<Transition>;
  inTransitions: Set<Transition>;
  outTransitions: Set<Transition>;
}

export class StatechartContext extends EventBase<StatechartChange, ChangeEvents>
                               implements DataContext<AllTypes, StateTypes, AllTypes> {
  private highestId_: number = 0;  // 0 stands for no id.
  private stateMap_ = new Map<number, State | Pseudostate>();

  private statechart_: Statechart;  // The root statechart.
  private states_ = new Set<StateTypes>;
  private statecharts_ = new Set<Statechart>;
  private transitions_ = new Set<Transition>;

  private selection_ = new SelectionSet<AllTypes>();

  root() : Statechart { return this.statechart_; }

  newState() : State {
    const nextId = ++this.highestId_,
          result: State = new State(this, nextId);
    this.stateMap_.set(nextId, result);
    return result;
  }

  newPseudostate(subtype: PseudostateSubtype) : Pseudostate {
    const nextId = ++this.highestId_,
          result: Pseudostate = new Pseudostate(subtype, nextId, this);
    this.stateMap_.set(nextId, result);
    return result;
  }

  newTransition(src: StateTypes, dst: StateTypes) : Transition {
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
    if (item.type === 'state') {
      item.statecharts.forEach(t => self.visitAll(t, visitor));
    } else if  (item.type === 'statechart') {
      item.states.forEach(t => self.visitAll(t, visitor));
      item.transitions.forEach(t => self.visitAll(t, visitor));
    }
  }

  visitNonTransitions(item: NonTransitionTypes, visitor: NonTransitionVisitor) : void {
    const self = this;
    if (item.type === 'state') {
      visitor(item);
      item.statecharts.forEach(item => self.visitNonTransitions(item, visitor));
    } else if (item.type === 'pseudostate') {
      visitor(item);
    } else if (item.type === 'statechart') {
      visitor(item);
      item.states.forEach(item => self.visitNonTransitions(item, visitor));
    }
  }

  private initializeItem(item: AllTypes) {
    switch (item.type) {
      case 'state': {
        this.setGlobalPosition(item);
        break;
      }
      case 'pseudostate': {
        this.setGlobalPosition(item);
        break;
      }
      case 'statechart': {
        this.setGlobalPosition(item);
        break;
      }
      case 'transition': {
        break;
      }
    }
}
  setRoot(root: Statechart) : void {
    this.insertItem_(root, undefined);
    this.statechart_ = root;
  }

  getGrandParent(item: AllTypes) : AllTypes | undefined {

    let result = item.parent;
    if (result)
      result = result.parent;
    return result;
  }

  forInTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const inputs = state[inTransitions];
    if (!inputs)
      return;
    inputs.forEach((input, i) => visitor(input));
  }

  forOutTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const outputs = state[outTransitions];
    if (!outputs)
      return;
    outputs.forEach((output, i) => visitor(output));
  }

  // Gets the translation to move an item from its current parent to
  // newParent. Handles the cases where current parent or newParent are null.
  getToParent(item: NonTransitionTypes, newParent: ParentTypes) {
    const oldParent: ParentTypes = item.parent;
    let dx = 0, dy = 0;
    if (oldParent) {
      const global = oldParent[globalPosition];
      dx += global.x;
      dy += global.y;
    }
    if (newParent) {
      const global = newParent[globalPosition];
      dx += global.x;
      dy += global.y;
    }
    return { x: dx, y: dy };
  }

  private setGlobalPosition(item: NonTransitionTypes) {
    const x = item.x,
          y = item.y,
          parent: ParentTypes = item.parent;

    if (parent) {
      // console.log(item.type, parent.type, parent[globalPosition]);
      const global = parent[globalPosition];
      if (global) {
        item[globalPosition] = { x: x + global.x, y: y + global.y };
      }
    } else {
      item[globalPosition] = { x: x, y: y };
    }
  }

  getGraphInfo() : GraphInfo {
    return {
      states: this.states_,
      statecharts: this.statecharts_,
      transitions: this.transitions_,
      interiorTransitions: this.transitions_,
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
        if (item.type === 'state')
          states.add(item);
        else if (item.type === 'statechart')
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
      if (item.type === 'state' || item.type === 'pseudostate') {
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
    const topLevelStatechart = this.statechart_;
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
    if (state.type !== 'pseudostate' || state.subtype !== 'start')
      return true;
    for (let child of statechart.states) {
      if (child !== state && child.type === 'pseudostate' && child.subtype === 'start')
        return false;
    }
    return true;
  }

  isValidTransition(src: StateTypes, dst: StateTypes) : boolean {
    // No transition to self for pseudostates.
    if (src === dst) return src.type === 'state';
    // No transitions to a start pseudostate.
    if (dst.type === 'pseudostate' && dst.subtype === 'start') return false;
    // No transitions from a stop pseudostate.
    if (src.type === 'pseudostate' && src.subtype === 'stop') return false;
    // No transitions out of parent state for start or history pseudostates.
    if (src.type === 'pseudostate' && (
        src.subtype === 'start' || src.subtype === 'history' || src.subtype === 'history*')) {
      const srcParent = src.parent,
            dstParent = dst.parent;
      return srcParent == dstParent;
    }
    // Transitions can't straddle parallel statecharts. The lowest common ancestor
    // of src and dst must be a statechart, not a state, except for "inside" transitions.
    const lca = getLowestCommonAncestor<AllTypes>(src, dst);
    if (!lca) return false;
    // Allow transitions between a super state and its child states.
    if (lca.type === 'state')
      return src === this.getGrandParent(dst);
    return lca.type === 'statechart';
  }

  findChildStatechart(superState: State, child: StateTypes | Transition) : Statechart | undefined {
    for (let statechart of superState.statecharts) {
      if (child.type === 'transition' || this.canAddState(child, statechart)) {
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

  deleteItem(item: AllTypes) {
    if (item.parent) {
      if (item.type === 'transition')
        item.parent.transitions.remove(item);
      else if (item.type === 'statechart')
        item.parent.statecharts.remove(item);
      else
        item.parent.states.remove(item);
    }
    // TODO update selection.
  }

  deleteItems(items: Array<AllTypes>) {
    const self = this;
    items.forEach(item => self.deleteItem(item));
  }

  select(item: AllTypes) {
    this.selection_.add(item);
  }

  selection() : Array<AllTypes> {
    return this.selection_.contents();
  }

  selectedStates() : Array<StateTypes> {
    const result = new Array<StateTypes>();
    this.selection().forEach(item => {
      if (item.type === 'state' || item.type === 'pseudostate')
        result.push(item);
    });
    return result;
  }

  reduceSelection() {
    const selection = this.selection_;
    // First, replace statecharts by their parent state. We do this by adding parent
    // states to the selection before reducing.
    selection.forEach(function(item: AllTypes) {
      if (item.type === 'statechart') {
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
    graphInfo.interiorTransitions.forEach(transition => self.selection_.add(transition));
  }

  addItem(item: StateTypes | Transition, parent: State | Statechart) : AllTypes {
    const oldParent = item.parent;

    if (!parent)
      parent = this.statechart_;
    if (oldParent === parent)
      return item;
    if (parent.type === 'state') {
      parent = this.findOrCreateChildStatechart(parent, item);
    } else if (parent.type === 'statechart') {
      if (item.type !== 'transition') {
        // If adding a pseudostate to a non-root statechart, add a new statechart to hold it.
        // We allow the exception for the root statechart so we can drag and drop between
        // child statecharts.
        if (!this.canAddState(item, parent) && parent !== this.statechart_) {
          const superState = parent.parent!;
          parent = this.findOrCreateChildStatechart(superState, item);
        }
      }
    }
    // At this point we can add item to parent.
    if (item.type === 'state') {
      const translation = this.getToParent(item, parent);
      item.x += translation.x;
      item.y += translation.y;
    }

    if (oldParent)
      this.deleteItem(item);

    if (parent.type === 'statechart') {
      if (item.type === 'transition') {
        parent.transitions.append(item);
      } else if (item.type === 'state') {
        parent.states.append(item);
      }
    }
    return item;
  }

  addItems(items: AllTypes[], parent: State | Statechart) {
    // Add states first, then transitions, so the context can track transitions.
    for (let item of items) {
      if (item.type === 'state') this.addItem(item, parent);
    }
    for (let item of items) {
      if (item.type === 'transition') this.addItem(item, parent);
    }
  }

  // copyItems(items: Array<AllItems>, map: Map<number, AllItems>) : Array<AllItems> {
  //   const statechart = this.statechart_,
  //         referenceModel = this.referenceModel_,
  //         translationModel_ = this.translationModel_,
  //         copies = this.instancingModel_.cloneGraph(items, map);

  //   items.forEach(function(item) {
  //     const copy = map.get(referenceModel.getId(item));  // TODO get rid of indirection getId
  //     if (copy && copy.type !== 'transition') {
  //       const translation = translationModel_.getToParent(item, statechart);
  //       copy.x += translation.x;
  //       copy.y += translation.y;
  //     }
  //   });
  //   return copies;
  // }

  makeConsistent () {
    const self = this,
          statechart = this.statechart_,
          graphInfo = this.getGraphInfo();
    // Eliminate dangling transitions.
    graphInfo.transitions.forEach(function(transition) {
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
      if (state.type === 'state') {
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
    this.states_.add(state);
    state.parent = parent;
    this.initializeItem(state);

    state[inTransitions] = new Array<Transition>();
    state[outTransitions] = new Array<Transition>();

    if (state.type === 'state' && state.statecharts) {
      const self = this;
      state.statecharts.forEach(statechart => self.insertStatechart_(statechart, state));
    }
  }

  private removeState_(state: StateTypes) {
    this.states_.delete(state);
  }

  private insertStatechart_(statechart: Statechart, parent: State | undefined) {
    this.statecharts_.add(statechart);
    statechart.parent = parent;
    this.initializeItem(statechart);

    const self = this;
    statechart.states.forEach(state => self.insertState_(state, statechart));
    statechart.transitions.forEach(transition => self.insertTransition_(transition, statechart));
  }

  private removeStatechart_(stateChart: Statechart) {
    this.statecharts_.delete(stateChart);
    const self = this;
    stateChart.states.forEach(state => self.removeState_(state));
  }

  private insertTransition_(transition: Transition, parent: Statechart) {
    this.transitions_.add(transition);
    transition.parent = parent;
    this.initializeItem(transition);

    const src = transition.src,
          dst = transition.dst;
    if (src) {
      const outputs = src[outTransitions];
      if (outputs)
        outputs.push(transition);
    }
    if (dst) {
      const inputs = dst[inTransitions];
      if (inputs)
        inputs.push(transition);
    }
  }

  private removeTransition_(transition: Transition) {
    this.transitions_.delete(transition);
    const src = transition.src,
          dst = transition.dst;
    function remove(array: Array<Transition>, item: Transition) {
      const index = array.indexOf(item);
      if (index >= 0) {
        array.splice(index, 1);
      }
    }
    if (src) {
      const outputs = src[outTransitions];
      if (outputs)
        remove(outputs, transition);
    }
    if (dst) {
      const inputs = dst[inTransitions];
      if (inputs)
        remove(inputs, transition);
    }
  }

  private insertItem_(item: AllTypes, parent: ParentTypes) {
    if (item.type ==='transition') {
      if (parent && parent.type === 'statechart')
        this.insertTransition_(item, parent);
    } else if (item.type === 'statechart') {
      if (!parent || parent.type === 'state')
        this.insertStatechart_(item, parent);
    } else {
      if (parent && parent.type === 'statechart')
        this.insertState_(item, parent);
    }
  }

  private removeItem_(item: AllTypes) {
    if (item.type ==='transition')
      this.removeTransition_(item);
    else if (item.type === 'statechart')
      this.removeStatechart_(item);
    else
      this.removeState_(item);
  }

  valueChanged(owner: AllTypes, attr: string, oldValue: any) : void {
    if (owner.type === 'transition') {
      // Remove and reinsert changed transitions.
      const parent = owner.parent;
      if (parent) {
        this.removeTransition_(owner);
        this.insertTransition_(owner, parent);
      }
    } else {
      this.initializeItem(owner);
    }
    this.onValueChanged(owner, attr, oldValue);
  }
  elementInserted(owner: State | Statechart, attr: string, index: number, value: AllTypes) : void {
    this.insertItem_(value, owner);
    this.onElementInserted(owner, attr, index);
  }
  elementRemoved(owner: State | Statechart, attr: string, index: number, oldValue: AllTypes) : void {
    this.removeItem_(oldValue);
    this.onElementRemoved(owner, attr, index, oldValue);
  }

  resolveReference(owner: AllTypes, cacheKey: symbol, id: number) : StateTypes | undefined {
    // Try to get cached referent.
    let target = (owner as any)[cacheKey];
    if (target && target.id === id)
      return target.ref;
    const ref = this.stateMap_.get(id);
    // Cache it on the object.
    if (ref) {
      (owner as any)[cacheKey] = { id: id, ref: ref };
    }
    return ref;
  }

  private onChanged(change: StatechartChange) : StatechartChange {
    // console.log(change);
    super.onEvent('changed', change);
    return change;
  }
  private onValueChanged(item: AllTypes, attr: string, oldValue: any) : StatechartChange {
    const change: StatechartChange = {type: 'valueChanged', item, attr, index: 0, oldValue };
    super.onEvent('valueChanged', change);
    return this.onChanged(change);
  }
  private onElementInserted(item: State | Statechart, attr: string, index: number) : StatechartChange {
    const change: StatechartChange =
        { type: 'elementInserted', item: item, attr: attr, index: index, oldValue: undefined };
    super.onEvent('elementInserted', change);
    return this.onChanged(change);
  }
  private onElementRemoved(item: State | Statechart, attr: string, index: number, oldValue: AllTypes ) : StatechartChange {
    const change: StatechartChange =
        { type: 'elementRemoved', item: item, attr: attr, index: index, oldValue: oldValue };
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

interface StateHitResult {
  type: 'state';
  item: State;
  inner: RectHitResult;
  arrow?: boolean;
}

interface PseudostateHitResult {
  type: 'pseudostate';
  item: Pseudostate;
  inner?: DiskHitResult;
  arrow?: boolean;
}

interface TransitionHitResult {
  type: 'transition';
  item: Transition;
  inner: CurveHitResult;
}

interface StatechartHitResult {
  type: 'statechart';
  item: Statechart;
  inner: RectHitResult;
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
  private theme_: StatechartTheme;
  private ctx: CanvasRenderingContext2D | undefined;

  constructor(theme: Theme) {
    this.theme_ = new StatechartTheme(theme);
  }

  begin(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    ctx.save();
    ctx.font = this.theme_.font;
  }
  end() {
    if (this.ctx) {
      this.ctx.restore();
      this.ctx = undefined;
    }
  }

  getSize(item: StateTypes | Statechart) : { width: number, height: number } {
    let width, height;
    switch (item.type) {
      case 'state':
      case 'statechart':
        width = item.width;
        height = item.height;
        break;
      case 'pseudostate':
        width = height = 2 * this.theme_.radius;
        break;
    }
    return { width: width, height: height };
  }
  getItemRect(item: AllTypes) : Rect {
    let x, y, width, height;
    if (item.type == 'transition') {
      const extents = getExtents(item[transitionBezier]);
      x = extents.xmin;
      y = extents.ymin;
      width = extents.xmax - x;
      height = extents.ymax - y;
    } else {
      const size = this.getSize(item),
            global = item[globalPosition];
      x = global.x;
      y = global.y;
      width = size.width;
      height = size.height;

      if (item.type == 'statechart') {
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
  getBounds(items: List<AllTypes>) : Rect {
    if (items.length == 0)
      return { x: 0, y: 0, width: 0, height: 0 };

    const rect = this.getItemRect(items.at(0));
    let xMin = rect.x,
        yMin = rect.y,
        xMax = xMin + rect.width,
        yMax = 0;
    for (let i = 1; i < items.length; ++i) {
      const rect = this.getItemRect(items.at(i)),
            x0 = rect.x,
            y0 = rect.y,
            x1 = x0 + rect.width,
            y1 = y0 + rect.height;
      xMin = Math.min(xMin, x0);
      yMin = Math.min(yMin, y0);
      xMax = Math.max(xMax, x1);
      yMax = Math.max(yMax, y1);
    }
    return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
  }
  statePointToParam(state: StateTypes, p: Point) {
    const r = this.theme_.radius,
          rect = this.getItemRect(state);
    if (state.type === 'state')
      return rectPointToParam(rect.x, rect.y, rect.width, rect.height, p);

    return circlePointToParam(rect.x + r, rect.y + r, p);
  }
  stateParamToPoint(state: StateTypes, t: number) {
    const r = this.theme_.radius,
          rect = this.getItemRect(state);
    if (state.type === 'state')
      return roundRectParamToPoint(rect.x, rect.y, rect.width, rect.height, r, t);

    return circleParamToPoint(rect.x + r, rect.y + r, r, t);
  }
  getStateMinSize(state: StateTypes) {
    const ctx = this.ctx, theme = this.theme_, r = theme.radius;
    let width = theme.stateMinWidth, height = theme.stateMinHeight;
    if (state.type === 'pseudostate')
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
          theme = this.theme_,
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
    if (state.entry && this.ctx) {
      state[entryText] = 'entry/ ' + state.entry;
      state[entryY] = height;
      height += lineSpacing;
      width = Math.max(width, this.ctx.measureText(state[entryText]).width + 2 * theme.padding);
    }
    if (state.exit && this.ctx) {
      state[exitText] = 'exit/ ' + state.exit;
      state[exitY] = height;
      height += lineSpacing;
      width = Math.max(width, this.ctx.measureText(state[exitText]).width + 2 * theme.padding);
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
    const padding = this.theme_.padding,
          global = statechart[globalPosition],
          statechartX = global.x,
          statechartY = global.y,
          states = statechart.states,
          transitions = statechart.transitions;
    // TODO bound transitions too.
    if (states.length) {
      // Get extents of child states.
      const r = this.getBounds(states),
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
          p1 = src ? this.stateParamToPoint(src, transition.tSrc) : transition[pSrc],
          p2 = dst ? this.stateParamToPoint(dst, transition.tDst) : transition[pDst];
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
    if (src && src.type === 'pseudostate') {
      // Adjust the bezier's p1 and c1 to start on the boundary, towards bezier c2.
      const to = bezier[2],
            center = getCenter(src),
            radius = this.theme_.radius,
            projection = projectPointToCircle(to, center, radius);
      bezier[0] = projection;
      bezier[1] = to;
    }
    if (dst && dst.type === 'pseudostate') {
      // Adjust the bezier's c2 and p2 to end on the boundary, towards bezier c1.
      const to = bezier[1],
            center = getCenter(dst),
            radius = this.theme_.radius,
            projection = projectPointToCircle(to, center, radius);
      bezier[3] = projection;
      bezier[2] = to;
    }
    transition[transitionBezier] = bezier;
    transition[transitionTextPoint] = evaluateBezier(bezier, transition.tText);
    let text = '', textWidth = 0;
    if (this.ctx) {
      const ctx = this.ctx,
            padding = this.theme_.padding;
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
    }
    transition[transitionText] = text;
    transition[transitionTextWidth] = textWidth;
  }
  // Layout a statechart item.
  layout(item: AllTypes) {
    switch (item.type) {
      case 'state':
        this.layoutState(item);
        break;
      case 'statechart':
        this.layoutStatechart(item);
        break;
      case 'transition':
        this.layoutTransition(item);
        break;
    }
  }
  drawArrow(x: number, y: number) {
    const ctx = this.ctx!;
    ctx.beginPath();
    arrowPath({ x: x, y: y, nx: -1, ny: 0 }, ctx, this.theme_.arrowSize);
    ctx.stroke();
  }
  hitTestArrow(x: number, y: number, p:  Point, tol: number) {
    const d = this.theme_.arrowSize, r = d * 0.5;
    return hitTestRect(x - r, y - r, d, d, p, tol);
  }
  drawState(state: State, mode: RenderMode) {
    const ctx = this.ctx;
    if (!ctx)
      return;

    const theme = this.theme_,
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
          ctx.fillText(state[entryText]!, x + r, y + state[entryY]! + textSize);
        }
        if (state.exit) {
          ctx.fillText(state[exitText]!, x + r, y + state[exitY]! + textSize);
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
    const theme = this.theme_,
          r = theme.radius,
          rect = this.getItemRect(state),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
    if (inner) {
      const lineBase = y + theme.fontSize + theme.textLeading,
            result: StateHitResult = { type: 'state', item: state, inner: inner };
      if (mode !== RenderMode.Print && this.hitTestArrow(x + w + theme.arrowSize, lineBase, p, tol))
        result.arrow = true;
      return result;
    }
  }
  drawPseudoState(pseudostate: Pseudostate, mode: RenderMode) {
    const ctx = this.ctx;
    if (!ctx)
      return

    const theme = this.theme_,
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
    const theme = this.theme_,
          r = theme.radius,
          rect = this.getItemRect(state),
          x = rect.x, y = rect.y,
          inner = hitTestDisk(x + r, y + r, r, p, tol);
    if (inner) {
      return { type: 'pseudostate', item: state, inner: inner };
    }
    if (mode !== RenderMode.Print && state.subtype !== 'stop' &&
        this.hitTestArrow(x + 2 * r + theme.arrowSize, y + r, p, tol)) {
      return { type: 'pseudostate', item: state, inner: inner, arrow: true };
    }
  }
  drawStatechart(statechart: Statechart, mode: RenderMode) {
    const ctx = this.ctx;
    if (!ctx)
      return;

    const theme = this.theme_,
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
    const theme = this.theme_,
          r = theme.radius,
          rect = this.getItemRect(statechart),
          x = rect.x, y = rect.y, w = rect.width, h = rect.height,
          inner = hitTestRect(x, y, w, h, p, tol);
    if (inner) {
      return { type: 'statechart', item: statechart, inner: inner };
    }
  }
  drawTransition(transition: Transition, mode: RenderMode) {
    const ctx = this.ctx;
    if (!ctx)
      return;

    const theme = this.theme_,
          r = theme.knobbyRadius,
          bezier = transition[transitionBezier];
    bezierEdgePath(bezier, ctx, theme.arrowSize);
    switch (mode) {
      case RenderMode.Normal:
      case RenderMode.Print:
        ctx.strokeStyle = theme.strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        const pt = transition[transitionTextPoint];
        if (mode !== RenderMode.Print) {
          const r = theme.radius / 2;
          roundRectPath(pt.x - r, pt.y - r, theme.radius, theme.radius, r, ctx);
          ctx.fillStyle = theme.bgColor;
          ctx.fill();
          ctx.lineWidth = 0.25;
          ctx.stroke();
        }
        ctx.fillStyle = theme.textColor;
        ctx.fillText(transition[transitionText], pt.x + theme.padding, pt.y + theme.fontSize);
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
    const inner = hitTestBezier(transition[transitionBezier], p, tol);
    if (inner) {
      return { type: 'transition', item: transition, inner: inner };
    }
  }
  draw(item: AllTypes, mode: RenderMode) {
    switch (item.type) {
      case 'state':
        this.drawState(item, mode);
        break;
      case 'pseudostate':
        this.drawPseudoState(item, mode);
        break;
      case 'transition':
        this.drawTransition(item, mode);
        break;
      case 'statechart':
        this.drawStatechart(item, mode);
        break;
    }
  }
  hitTest(item: AllTypes, p: Point, tol: number, mode: RenderMode) {
    let hitInfo: HitResultTypes | undefined;
    switch (item.type) {
      case 'state':
        hitInfo = this.hitTestState(item, p, tol, mode);
        break;
      case 'pseudostate':
        hitInfo = this.hitTestPseudoState(item, p, tol, mode);
        break;
      case 'transition':
        hitInfo = this.hitTestTransition(item, p, tol, mode);
        break;
      case 'statechart':
        hitInfo = this.hitTestStatechart(item, p, tol, mode);
        break;
    }
    return hitInfo;
  }
  drawHoverText(item: AllTypes, p: Point, nameValuePairs: { name: string, value: any }[]) {
    const ctx = this.ctx;
    if (!ctx)
      return;
    const self = this,
          theme = this.theme_,
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

enum DragTypes {
  connectTransitionSrc,
  connectTransitionDst,
  copyPaletteItem,
  moveSelection,
  moveCopySelection,
  resizeState,
  moveTransitionPoint,
}

class Editor {
  private theme_: StatechartTheme;
  private canvasController: CanvasController;
  private paletteController: CanvasController;
  private propertyGridController: PropertyGridController;
  private fileController: FileController;
  private hitTolerance: number;
  private changedItems_: Set<AllTypes>;
  private changedTopLevelStates_: Set<State>;
  private renderer: Renderer;
  private palette: Statechart;  // Statechart to simplify layout of palette items.

  constructor(
      theme: Theme, canvasController: CanvasController, paletteController: CanvasController,
      propertyGridController: PropertyGridController) {
    const self = this;
    this.theme_ = new StatechartTheme(theme);
    this.canvasController = canvasController;
    this.paletteController = paletteController;
    this.propertyGridController = propertyGridController;
    this.fileController = new FileController();

    this.hitTolerance = 8;

    // TODO extend model with this info to avoid crosstalk between models.
    // Change tracking for layout.
    // Changed items that must be updated before drawing and hit testing.
    this.changedItems_ = new Set();
    // Changed top level states that must be updated during transactions and undo/redo.
    this.changedTopLevelStates_ = new Set();

    const renderer = new Renderer(theme);
    this.renderer = renderer;

    // Embed the palette items in a statechart so the renderer can do layout and drawing.
    const context = new StatechartContext(),
          statechart = context.newStatechart(),
          start = context.newPseudostate('start'),
          stop = context.newPseudostate('stop'),
          history = context.newPseudostate('history'),
          historyDeep = context.newPseudostate('history*');

    start.x = start.y = 8;
    stop.x = 40; stop.y = 8;
    history.x = 72; history.y = 8;
    historyDeep.x = 104; historyDeep.y = 8;

    statechart.states.append(context.newPseudostate('start'));
    statechart.states.append(context.newPseudostate('stop'));
    statechart.states.append(context.newPseudostate('start'));
    statechart.states.append(context.newPseudostate('start'));
    context.setRoot(statechart);
    this.palette = statechart;

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
        const attr = getAttr(info), description = 'change ' + attr;
        // model.transactionModel.beginTransaction(description);
        // model.observableModel.changeValue(item, attr, value);
        // model.transactionModel.endTransaction();
        canvasController.draw();
      }
    }
    const statechartInfo: PropertyInfo[] = [
      {
        label: 'name',
        type: 'text',
        getter: getter,
        setter: setter,
      },
    ],
    stateInfo: PropertyInfo[] = [
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
    ],
    transitionInfo: PropertyInfo[] = [
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
    ];

    propertyGridController.register('statechart', statechartInfo);
    propertyGridController.register('state', stateInfo);
    propertyGridController.register('transition', transitionInfo);
  }
}
/*
//------------------------------------------------------------------------------

  // Statechart Editor and helpers.

  function isStateBorder(hitInfo, model) {
    return isState(hitInfo.item) && hitInfo.border;
  }

  function isStateDropTarget(hitInfo, model) {
    const item = hitInfo.item;
    return isTrueStateOrStatechart(item) &&
          !model.hierarchicalModel.isItemInSelection(item);
  }

  function isClickable(hitInfo, model) {
    return true;
  }

  function isDraggable(hitInfo, model) {
    return isState(hitInfo.item);
  }

  function hasProperties(hitInfo, model) {
    const item = hitInfo.item;
    return isTrueState(item) || isStatechart(item) || isTransition(item);
  }

  const connectTransitionSrc = 1,
        connectTransitionDst = 2,
        copyPaletteItem = 3,
        moveSelection = 4,
        moveCopySelection = 5,
        resizeState = 6,
        moveTransitionPoint = 7;

  class Editor {
    initializeModel(model) {
      const self = this;

      statechartModel.extend(model);
      editingModel.extend(model);

      this.renderer.extend(model);

      model.dataModel.initialize();

      // On attribute changes and item insertions, dynamically layout affected items.
      // This allows us to layout transitions as their src or dst states are dragged.
      model.observableModel.addHandler('changed', change => self.onChanged_(change));

      // On ending transactions and undo/redo, layout the changed top level states.
      function updateBounds() {
        self.updateBounds_();
      }
      model.transactionModel.addHandler('transactionEnding', updateBounds);
      model.transactionModel.addHandler('didUndo', updateBounds);
      model.transactionModel.addHandler('didRedo', updateBounds);
    }
    setModel(model) {
      const statechart = model.root,
            renderer = this.renderer;

      this.model = model;
      this.statechart = statechart;

      this.changedItems_.clear();
      this.changedTopLevelStates_.clear();

      renderer.setModel(model);

      // Layout any items in the statechart.
      renderer.begin(this.canvasController.getCtx());
      reverseVisitItem(statechart, item => renderer.layout(item));
      renderer.end();
    }
    initialize(canvasController) {
      if (canvasController === this.canvasController) {
      } else {
        const renderer = this.renderer;
        assert(canvasController === this.paletteController);
        renderer.begin(canvasController.getCtx());
        // Layout the palette items and their parent statechart.
        renderer.begin(canvasController.getCtx());
        reverseVisitItem(this.palette, item => renderer.layout(item));
        // Draw the palette items.
        visitItems(this.palette.items, item => renderer.draw(item));
        renderer.end();
      }
    }
    updateLayout_() {
      const renderer = this.renderer, changedItems = this.changedItems_;
      // First layout containers, and then layout transitions which depend on states'
      // size and location.
      // This function is called during the draw and updateBounds_ methods, so the renderer
      // is already started.
      function layout(item) {
        reverseVisitItem(item, item => renderer.layout(item));
      }
      changedItems.forEach(
        item => {
          if (!isTransition(item))
            layout(item);
        });
      changedItems.forEach(
        item => {
          if (isTransition(item))
            layout(item);
        });
      changedItems.clear();
    }
    updateBounds_() {
      const ctx = this.canvasController.getCtx(), renderer = this.renderer, statechart = this.statechart, changedTopLevelStates = this.changedTopLevelStates_;
      renderer.begin(ctx);
      // Update any changed items first.
      this.updateLayout_();
      changedTopLevelStates.forEach(
        state => reverseVisitItem(state, item => renderer.layout(item), isStateOrStatechart));
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
    onChanged_(change) {
      const statechart = this.statechart, statechartModel = this.model.statechartModel, hierarchicalModel = this.model.hierarchicalModel, changedItems = this.changedItems_, changedTopLevelStates = this.changedTopLevelStates_, item = change.item, attr = change.attr;

      // Track all top level states which contain changes. On ending a transaction,
      // update the layout of states and statecharts.
      let ancestor = change.item, topLevel = ancestor;
      do {
        topLevel = ancestor;
        ancestor = hierarchicalModel.getParent(ancestor);
      } while (ancestor && ancestor !== statechart);

      if (ancestor === statechart) {
        assert(topLevel);
        changedTopLevelStates.add(topLevel);
      }

      function addItems(item) {
        if (isState(item)) {
          // Layout the state's incoming and outgoing transitions.
          statechartModel.forInTransitions(item, addItems);
          statechartModel.forOutTransitions(item, addItems);
        }
        changedItems.add(item);
      }

      switch (change.type) {
        case 'change': {
          // For changes to x, y, width, or height, layout affected transitions.
          if (attr == 'x' || attr == 'y' || attr == 'width' || attr == 'height') {
            // Visit item and sub-items to layout all affected transitions.
            visitItem(item, addItems);
          } else if (isTransition(item)) {
            addItems(item);
          }
          break;
        }
        case 'insert': {
          // Update item subtrees as they are inserted.
          reverseVisitItem(item[attr][change.index], addItems);
          break;
        }
      }
    }
    draw(canvasController) {
      const renderer = this.renderer, statechart = this.statechart, model = this.model;
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

        visitItem(statechart, function (item) {
          renderer.draw(item, normalMode);
        }, isNonTransition);
        visitItem(statechart, function (transition) {
          renderer.draw(transition, normalMode);
        }, isTransition);

        model.selectionModel.forEach(function (item) {
          renderer.draw(item, highlightMode);
        });
        if (this.hotTrackInfo)
          renderer.draw(this.hotTrackInfo.item, hotTrackMode);

        const hoverHitInfo = this.hoverHitInfo;
        if (hoverHitInfo) {
          const item = hoverHitInfo.item,
                nameValuePairs = [];
          for (let info of hoverHitInfo.propertyInfo) {
            const name = info.label,
                  value = info.getter(info, item);
            if (value !== undefined && value !== undefined) {
              nameValuePairs.push({ name, value });
            }
          }
          renderer.drawHoverText(hoverHitInfo.item, hoverHitInfo.p, nameValuePairs);
        }
        renderer.end();
      } else if (canvasController === this.paletteController) {
        // Palette drawing occurs during drag and drop. If the palette has the drag,
        // draw the canvas underneath so the new object will appear on the canvas.
        this.canvasController.draw();
        const ctx = this.paletteController.getCtx();
        renderer.begin(ctx);
        canvasController.applyTransform();
        visitItems(this.palette.items, function (item) {
          renderer.draw(item, printMode);
        });
        // Draw the new object in the palette. Translate object to palette coordinates.
        const offset = canvasController.offsetToOtherCanvas(this.canvasController);
        ctx.translate(offset.x, offset.y);
        model.selectionModel.forEach(function (item) {
          renderer.draw(item, normalMode);
          renderer.draw(item, highlightMode);
        });
        renderer.end();
      }
    }
    print() {
      const renderer = this.renderer,
            statechart = this.statechart,
            canvasController = this.canvasController;

      // Calculate document bounds.
      const states = new Array();
      visitItems(statechart.items, function (item) {
        states.push(item);
      });

      const bounds = renderer.getBounds(states);
      // Adjust all edges 1 pixel out.
      const ctx = new C2S(bounds.width + 2, bounds.height + 2);
      ctx.translate(-bounds.x + 1, -bounds.y + 1);

      renderer.begin(ctx);
      // We shouldn't need to layout any changed items here.
      assert(!this.changedItems_.size);
      canvasController.applyTransform();

      visitItems(statechart.items, function (item) {
        renderer.draw(item, printMode);
      }, isNonTransition);
      visitItems(statechart.items, function (transition) {
        renderer.draw(transition, printMode);
      }, isTransition);

      renderer.end();

      // Write out the SVG file.
      const serializedSVG = ctx.getSerializedSvg();
      const blob = new Blob([serializedSVG], {
        type: 'text/plain'
      });
      saveAs(blob, 'statechart.svg', true);
    }
    getCanvasPosition(canvasController, p) {
      // When dragging from the palette, convert the position from pointer events
      // into the canvas space to render the drag and drop.
      return this.canvasController.viewToOtherCanvasView(canvasController, p);
    }
    hitTestCanvas(p) {
      const renderer = this.renderer,
            tol = this.hitTolerance,
            statechart = this.statechart,
            canvasController = this.canvasController,
            cp = this.getCanvasPosition(canvasController, p),
            ctx = canvasController.getCtx(),
            hitList = [];
      function pushInfo(info) {
        if (info)
          hitList.push(info);
      }
      renderer.begin(ctx);
      this.updateLayout_();
      // TODO hit test selection first, in highlight, first.
      // Skip the root statechart, as hits there should go to the underlying canvas controller.
      reverseVisitItems(statechart.items, function (transition) {
        pushInfo(renderer.hitTest(transition, cp, tol, normalMode));
      }, isTransition);
      reverseVisitItems(statechart.items, function (item) {
        pushInfo(renderer.hitTest(item, cp, tol, normalMode));
      }, isNonTransition);
      renderer.end();
      return hitList;
    }
    hitTestPalette(p) {
      const renderer = this.renderer,
            tol = this.hitTolerance,
            ctx = this.paletteController.getCtx(),
            hitList = [];
      function pushInfo(info) {
        if (info)
          hitList.push(info);
      }
      renderer.begin(ctx);
      reverseVisitItems(this.palette.items, function (item) {
        pushInfo(renderer.hitTest(item, p, tol, printMode));
      }, isNonTransition);
      renderer.end();
      return hitList;
    }
    getFirstHit(hitList, filterFn) {
      if (hitList) {
        const model = this.model;
        for (let hitInfo of hitList) {
          if (filterFn(hitInfo, model))
            return hitInfo;
        }
      }
      return null;
    }
    getDraggableAncestor(hitList, hitInfo) {
      const model = this.model,
            hierarchicalModel = model.hierarchicalModel;
      while (!isDraggable(hitInfo, model)) {
        const parent = hierarchicalModel.getParent(hitInfo.item);
        hitInfo = this.getFirstHit(hitList, info => { return info.item === parent; })
      }
      return hitInfo;
    }
    setPropertyGrid() {
      const model = this.model,
            item = model.selectionModel.lastSelected(),
            type = item ? item.type : undefined;
      this.propertyGridController.show(type, item);
    }
    onClick(canvasController, alt) {
      const model = this.model,
            selectionModel = model.selectionModel,
            shiftKeyDown = this.canvasController.shiftKeyDown,
            cmdKeyDown = this.canvasController.cmdKeyDown,
            p = canvasController.getInitialPointerPosition(),
            cp = canvasController.viewToCanvas(p);
      let hitList, inPalette;
      if (canvasController === this.paletteController) {
        hitList = this.hitTestPalette(cp);
        inPalette = true;
      } else {
        assert(canvasController === this.canvasController);
        hitList = this.hitTestCanvas(cp);
        inPalette = false;
      }
      const mouseHitInfo = this.mouseHitInfo = this.getFirstHit(hitList, isClickable);
      if (mouseHitInfo) {
        mouseHitInfo.draggableAncestor = this.getDraggableAncestor(hitList, mouseHitInfo);
        const item = mouseHitInfo.item;
        if (inPalette) {
          mouseHitInfo.inPalette = true;
          selectionModel.clear();
        } else if (cmdKeyDown) {
          mouseHitInfo.moveCopy = true;
          selectionModel.select(item);
        } else {
          selectionModel.select(item, shiftKeyDown);
        }
      } else {
        if (!shiftKeyDown) {
          selectionModel.clear();
        }
      }
      this.setPropertyGrid();
      return mouseHitInfo !== null;
    }
    onBeginDrag(canvasController) {
      let mouseHitInfo = this.mouseHitInfo;
      if (!mouseHitInfo)
        return false;
      const model = this.model,
            editingModel = model.editingModel,
            selectionModel = model.selectionModel,
            p0 = canvasController.getInitialPointerPosition();
      let dragItem = mouseHitInfo.item;
      let drag, newTransition;
      if (mouseHitInfo.arrow) {
        const stateId = model.dataModel.getId(dragItem),
              cp0 = this.getCanvasPosition(canvasController, p0);
        // Start the new transition as connecting the src state to itself.
        newTransition = {
          type: 'transition',
          srcId: stateId,
          t1: 0,
          [_p2]: cp0,
          pt: 0.5, // initial property attachment at midpoint.
        };
        drag = {
          type: connectTransitionDst,
          name: 'Add new transition',
          newItem: true,
        };
      } else {
        switch (dragItem.type) {
          case 'statechart':
          case 'state':
          case 'start':
          case 'stop':
          case 'history':
          case 'history*':
            mouseHitInfo = mouseHitInfo.draggableAncestor;
            dragItem = mouseHitInfo.item;
            if (mouseHitInfo.inPalette) {
              drag = {
                type: copyPaletteItem,
                name: 'Add palette item',
                items: [dragItem],
                newItem: true
              };
            } else if (mouseHitInfo.moveCopy) {
              drag = {
                type: moveCopySelection,
                name: 'Move copy of selection',
                items: selectionModel.contents(),
                newItem: true
              };
            } else {
              if (dragItem.type === 'state' && mouseHitInfo.border) {
                drag = {
                  type: resizeState,
                  name: 'Resize state',
                };
              } else {
                drag = {
                  type: moveSelection,
                  name: 'Move selection',
                };
              }
            }
            break;
          case 'transition':
            if (mouseHitInfo.p1)
              drag = {
                type: connectTransitionSrc,
                name: 'Edit transition'
              };
            else if (mouseHitInfo.p2)
              drag = {
                type: connectTransitionDst,
                name: 'Edit transition'
              };
            else {
              drag = {
                type: moveTransitionPoint,
                name: 'Drag transition attachment point'
              };
            }
            break;
        }
        drag.item = dragItem;
      }

      this.drag = drag;
      if (drag) {
        if (drag.type === moveSelection || drag.type === moveCopySelection) {
          editingModel.reduceSelection();
          // let items = selectionModel.contents();
          // drag.isSingleElement = items.length === 1 && isState(items[0]);
        }
        model.transactionModel.beginTransaction(drag.name);
        if (newTransition) {
          drag.item = newTransition;
          editingModel.newItem(newTransition);
          editingModel.addItem(newTransition, this.statechart);
          selectionModel.set(newTransition);
        } else {
          if (drag.type == copyPaletteItem || drag.type == moveCopySelection) {
            const map = new Map(), copies = editingModel.copyItems(drag.items, map);
            // Transform palette items into the canvas coordinate system.
            if (drag.type == copyPaletteItem) {
              const offset = this.paletteController.offsetToOtherCanvas(this.canvasController);
              copies.forEach(function transform(item) {
                item.x -= offset.x; item.y -= offset.y;
              });
            }
            editingModel.addItems(copies);
            selectionModel.set(copies);
          }
        }
      }
    }
    onDrag(canvasController) {
      const drag = this.drag;
      if (!drag)
        return;
      const dragItem = drag.item,
            model = this.model,
            dataModel = model.dataModel,
            observableModel = model.observableModel,
            transactionModel = model.transactionModel,
            referencingModel = model.referencingModel,
            selectionModel = model.selectionModel,
            editingModel = model.editingModel,
            renderer = this.renderer,
            p0 = canvasController.getInitialPointerPosition(),
            cp0 = this.getCanvasPosition(canvasController, p0),
            p = canvasController.getCurrentPointerPosition(),
            cp = this.getCanvasPosition(canvasController, p),
            dx = cp.x - cp0.x,
            dy = cp.y - cp0.y,
            mouseHitInfo = this.mouseHitInfo,
            snapshot = transactionModel.getSnapshot(dragItem),
            hitList = this.hitTestCanvas(cp);
      let hitInfo;
      switch (drag.type) {
        case copyPaletteItem:
        case moveCopySelection:
        case moveSelection:
          hitInfo = this.getFirstHit(hitList, isStateDropTarget);
          selectionModel.forEach(function (item) {
            const snapshot = transactionModel.getSnapshot(item);
            if (snapshot && isNonTransition(item)) {
              observableModel.changeValue(item, 'x', snapshot.x + dx);
              observableModel.changeValue(item, 'y', snapshot.y + dy);
            }
          });
          break;
        case resizeState:
          if (mouseHitInfo.left) {
            observableModel.changeValue(dragItem, 'x', snapshot.x + dx);
            observableModel.changeValue(dragItem, 'width', snapshot.width - dx);
          }
          if (mouseHitInfo.top) {
            observableModel.changeValue(dragItem, 'y', snapshot.y + dy);
            observableModel.changeValue(dragItem, 'height', snapshot.height - dy);
          }
          if (mouseHitInfo.right)
            observableModel.changeValue(dragItem, 'width', snapshot.width + dx);
          if (mouseHitInfo.bottom)
            observableModel.changeValue(dragItem, 'height', snapshot.height + dy);
          break;
        case connectTransitionSrc: {
          const dst = referencingModel.getReference(dragItem, 'dstId');
          hitInfo = this.getFirstHit(hitList, isStateBorder);
          const srcId = hitInfo ? dataModel.getId(hitInfo.item) : 0; // 0 is invalid id
          if (srcId && editingModel.isValidTransition(hitInfo.item, dst)) {
            observableModel.changeValue(dragItem, 'srcId', srcId);
            const src = referencingModel.getReference(dragItem, 'srcId'),
                  t1 = renderer.statePointToParam(src, cp);
            observableModel.changeValue(dragItem, 't1', t1);
          } else {
            observableModel.changeValue(dragItem, 'srcId', 0);
            // Change private property through model to update observers.
            observableModel.changeValue(dragItem, _p1, cp);
          }
          break;
        }
        case connectTransitionDst: {
          const src = referencingModel.getReference(dragItem, 'srcId');
          // Adjust position on src state to track the new transition.
          if (drag.newItem) {
            observableModel.changeValue(dragItem, 't1', renderer.statePointToParam(src, cp));
          }
          hitInfo = this.getFirstHit(hitList, isStateBorder);
          const dstId = hitInfo ? dataModel.getId(hitInfo.item) : 0; // 0 is invalid id
          if (dstId && editingModel.isValidTransition(src, hitInfo.item)) {
            observableModel.changeValue(dragItem, 'dstId', dstId);
            const dst = referencingModel.getReference(dragItem, 'dstId'),
                  t2 = renderer.statePointToParam(dst, cp);
            observableModel.changeValue(dragItem, 't2', t2);
          } else {
            observableModel.changeValue(dragItem, 'dstId', 0);
            // Change private property through model to update observers.
            observableModel.changeValue(dragItem, _p2, cp);
          }
          break;
        }
        case moveTransitionPoint: {
          hitInfo = renderer.hitTest(dragItem, cp, this.hitTolerance, normalMode);
          if (hitInfo)
            observableModel.changeValue(dragItem, 'pt', hitInfo.t);

          else
            observableModel.changeValue(dragItem, 'pt', snapshot.pt);
          break;
        }
      }

      this.hotTrackInfo = (hitInfo && hitInfo.item !== this.statechart) ? hitInfo : null;
    }
    onEndDrag(canvasController) {
      const drag = this.drag;
      if (!drag)
        return;
      const model = this.model,
            statechart = this.statechart,
            selectionModel = model.selectionModel,
            transactionModel = model.transactionModel,
            editingModel = model.editingModel,
            p = canvasController.getCurrentPointerPosition(),
            cp = this.getCanvasPosition(canvasController, p),
            dragItem = drag.item;
      if (isTransition(dragItem)) {
        dragItem[_p1] = dragItem[_p2] = undefined;
      } else if (drag.type == copyPaletteItem || drag.type === moveSelection ||
        drag.type === moveCopySelection) {
        // Find state beneath mouse.
        const hitList = this.hitTestCanvas(cp),
              hitInfo = this.getFirstHit(hitList, isStateDropTarget),
              parent = hitInfo ? hitInfo.item : statechart;
        // Reparent items.
        selectionModel.contents().forEach(function (item) {
          editingModel.addItem(item, parent);
        });
      }

      if (editingModel.isValidStatechart(statechart)) {
        transactionModel.endTransaction();
      } else {
        transactionModel.cancelTransaction();
      }

      this.setPropertyGrid();

      this.drag = null;
      this.mouseHitInfo = null;
      this.hotTrackInfo = null;
      this.mouseHitInfo = null;

      this.canvasController.draw();
    }
    onBeginHover(canvasController) {
      // TODO hover over palette items?
      const model = this.model,
            p = canvasController.getCurrentPointerPosition(),
            hitList = this.hitTestCanvas(p),
            hoverHitInfo = this.hoverHitInfo = this.getFirstHit(hitList, hasProperties);
      if (!hoverHitInfo)
        return false;

      const cp = canvasController.viewToCanvas(p);
      hoverHitInfo.p = cp;
      hoverHitInfo.propertyInfo = this.propertyInfo[hoverHitInfo.item.type];
      this.hoverHitInfo = hoverHitInfo;
      return true;
    }
    onEndHover(canvasController) {
      if (this.hoverHitInfo)
        this.hoverHitInfo = null;
    }
    onKeyDown(e) {
      const self = this,
            model = this.model,
            statechart = this.statechart,
            selectionModel = model.selectionModel,
            editingModel = model.editingModel,
            transactionHistory = model.transactionHistory,
            keyCode = e.keyCode,
            cmdKey = e.ctrlKey || e.metaKey,
            shiftKey = e.shiftKey;

      if (keyCode === 8) { // 'delete'
        editingModel.doDelete();
        return true;
      }
      if (cmdKey) {
        switch (keyCode) {
          case 65: // 'a'
            statechart.items.forEach(function (v) {
              selectionModel.add(v);
            });
            return true;
          case 90: // 'z'
            if (transactionHistory.getUndo()) {
              selectionModel.clear();
              transactionHistory.undo();
            }
            return true;
          case 89: // 'y'
            if (transactionHistory.getRedo()) {
              selectionModel.clear();
              transactionHistory.redo();
            }
            return true;
          case 88: // 'x'
            editingModel.doCut();
            return true;
          case 67: // 'c'
            editingModel.doCopy();
            return true;
          case 86: // 'v'
            if (model.copyPasteModel.getScrap()) {
              editingModel.doPaste();
              this.updateBounds_();
              return true;
            }
            return false;
          case 69: // 'e'
            editingModel.doSelectConnectedStates(!shiftKey);
            return true;
          case 72: // 'h'
            editingModel.doTogglePalette();
            return true;
          case 78: { // 'n'   /// Can't intercept this key combo
            const statechart = {
              'type': 'statechart',
              'id': 1,
              'x': 0,
              'y': 0,
              'width': 0,
              'height': 0,
              'items': [],
            }
            model = { root: statechart };
            self.setModel(model);
            self.updateBounds_();
            self.canvasController.draw();
            return true;
          }
          case 79: { // 'o'
            function parse(text) {
              const statechart = JSON.parse(text),
                    model = { root: statechart };
              self.initializeModel(model);
              self.setModel(model);
              self.updateBounds_();
              self.canvasController.draw();
            }
            this.fileController.openFile().then(result => parse(result));
            return true;
          }
          case 83: { // 's'
            let text = JSON.stringify(
              statechart,
              function (key, value) {
                // Don't serialize generated and hidden fields.
                if (key.toString().charAt(0) === '_')
                  return;
                if (value === undefined || value === null)
                  return;
                return value;
              },
              2);

            // Writes statechart as JSON.
            this.fileController.saveUnnamedFile(text).then();
            // console.log(text);
            return true;
          }
          case 80: { // 'p'
            this.print();
            return true;
          }
        }
      }
    }
  }

return {
  editingModel,
  statechartModel,

  Renderer,
  Editor,
};
})();


const statechart_data = {
  'type': 'statechart',
  'id': 1001,
  'x': 0,
  'y': 0,
  'width': 0,
  'height': 0,
  'items': [],
}

/*
//------------------------------------------------------------------------------

const editingModel = (function() {
  const proto = {

    doDelete: function() {
      this.reduceSelection();
      this.model.copyPasteModel.doDelete(this.deleteItems.bind(this));
    },

    doCopy: function() {
      const selectionModel = this.model.selectionModel;
      selectionModel.contents().forEach(function(item) {
        if (isTransition(item))
          selectionModel.remove(item);
      });
      this.selectInteriorTransitions();
      this.reduceSelection();
      this.model.copyPasteModel.doCopy(this.copyItems.bind(this));
    },

    doCut: function() {
      this.doCopy();
      this.doDelete();
    },

    doPaste: function() {
      const copyPasteModel = this.model.copyPasteModel;
      copyPasteModel.getScrap().forEach(function(item) {
        // Offset pastes so the user can see them.
        if (isState(item)) {
          item.x += 16;
          item.y += 16;
        }
      });
      copyPasteModel.doPaste(this.copyItems.bind(this),
                             this.addItems.bind(this));
    },

    doSelectConnectedStates: function(upstream) {
      const model = this.model,
            selectionModel = model.selectionModel,
            selection = selectionModel.contents(),
            statechartModel = model.statechartModel,
            newSelection =
                statechartModel.getConnectedStates(selection, upstream, true);
      selectionModel.set(newSelection);
    },

    doTogglePalette: function() {
      // const model = this.model;
      // this.reduceSelection();
      // model.transactionModel.beginTransaction('toggle master state');
      // model.selectionModel.contents().forEach(function(item) {
      //   if (!isState(item))
      //     return;
      //   model.observableModel.changeValue(item, 'state',
      //     (item.state === 'palette') ? 'normal' : 'palette');
      // })
      // model.transactionModel.endTransaction();
    },
  }

})();

*/