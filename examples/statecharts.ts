
import { SelectionSet } from '../src/collections'

import { Theme, rectPointToParam, roundRectParamToPoint, circlePointToParam,
         circleParamToPoint } from '../src/diagrams'

import { getExtents } from '../src/geometry'

import { ScalarProp, ArrayProp, ReferencedObject, RefProp, ParentProp,
         DataContext, EventBase, Change, ChangeEvents,
         getLowestCommonAncestor, reduceToRoots } from '../src/dataModels'

//------------------------------------------------------------------------------

// Interfaces to statechart objects.

// Derived properties, indexed by symbols to distinguish them from actual properties.
const globalPosition: unique symbol = Symbol('globalPosition');
interface Position {
  x: number;
  y: number;
}
const inTransitions: unique symbol = Symbol('inTransitions'),
      outTransitions: unique symbol = Symbol('outTransitions');

const stateTemplate = {
  x: new ScalarProp<number>('x'),
  y: new ScalarProp<number>('y'),
  width: new ScalarProp<number>('width'),
  height: new ScalarProp<number>('height'),
  name: new ScalarProp<string | undefined>('name'),

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

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  get statecharts() { return this.template.statecharts.get(this, this.context); }

  // Derived properties.
  [globalPosition]: Position;
  [inTransitions]: Transition[];
  [outTransitions]: Transition[];

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
  [globalPosition]: Position;
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
  dst: new RefProp<StateTypes>('dst'),

  event: new ScalarProp<string | undefined>('event'),
  guard: new ScalarProp<string | undefined>('guard'),
  action: new ScalarProp<string | undefined>('action'),

  parent: new ParentProp<Statechart>,
}

export type TransitionType = 'transition';

export class Transition {
  private readonly template = transitionTemplate;
  readonly context: StatechartContext;

  readonly type: TransitionType = 'transition';

  get src() { return this.template.src.get(this, this.context); }
  set src(value) { this.template.src.set(this, this.context, value); }
  get dst() { return this.template.dst.get(this, this.context); }
  set dst(value) { this.template.dst.set(this, this.context, value); }
  get event() { return this.template.event.get(this); }
  set event(value) { this.template.event.set(this, this.context, value); }
  get guard() { return this.template.guard.get(this); }
  set guard(value) { this.template.guard.set(this, this.context, value); }
  get action() { return this.template.action.get(this); }
  set action(value) { this.template.action.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

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
  [globalPosition]: Position;

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

enum RenderMode {
  Normal,
  Highlight,
  HotTrack,
  Print
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

// interface Extents {
//   xmin: number;
//   xmax: number;
//   ymin: number;
//   ymax: number;
// }

// The renderer caches derived state on the object.
const _bezier = Symbol('bezier'),
      _p1 = Symbol('p1'),
      _p2 = Symbol('p2'),
      _text = Symbol('text'),
      _textT = Symbol('textT'),  // transition attachment parameter along curve;
      _textWidth = Symbol('textWidth'),
      _entryText = Symbol('entryText'),
      _entryY = Symbol('entryY'),
      _exitText = Symbol('exitText'),
      _exitY = Symbol('exitY');

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
      const extents = getExtents((item as any)[_bezier]);
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
  getBounds(items: Array<AllTypes>) : Rect {
    if (items.length == 0)
      return { x: 0, y: 0, width: 0, height: 0 };

    const rect = this.getItemRect(items[0]);
    let xMin = rect.x,
        yMin = rect.y,
        xMax = xMin + rect.width,
        yMax = 0;
    for (let i = 1; i < items.length; ++i) {
      const rect = this.getItemRect(items[i]),
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

}

/*
  // Statechart Renderer and helpers.


  class Renderer {
    constructor(theme) {
      this.theme = extendTheme(theme);
    }
    // Layout a state.
    layoutState(state) {
      const self = this,
            theme = this.theme,
            textSize = theme.fontSize,
            textLeading = theme.textLeading,
            lineSpacing = textSize + textLeading,
            observableModel = this.model.observableModel;

      let width = 0, height = lineSpacing;

      const statecharts = state.items;
      let stateOffsetY = lineSpacing; // start at the bottom of the state label area.
      if (statecharts && statecharts.length > 0) {
        // Layout the child statecharts vertically within the parent state.
        // TODO handle horizontal flow.
        statecharts.forEach(function (statechart) {
          const size = self.getSize(statechart);
          width = Math.max(width, size.width);
        });
        statecharts.forEach(function (statechart) {
          observableModel.changeValue(statechart, 'y', stateOffsetY);
          observableModel.changeValue(statechart, 'width', width);
          stateOffsetY += statechart.height;
        });

        height = Math.max(height, stateOffsetY);
      }
      if (state.entry) {
        state[_entryText] = 'entry/ ' + state.entry;
        state[_entryY] = height;
        height += lineSpacing;
        width = Math.max(width, this.ctx.measureText(state[_entryText]).width + 2 * this.theme.padding);
      }
      if (state.exit) {
        state[_exitText] = 'exit/ ' + state.exit;
        state[_exitY] = height;
        height += lineSpacing;
        width = Math.max(width, this.ctx.measureText(state[_exitText]).width + 2 * this.theme.padding);
      }
      width = Math.max(width, theme.stateMinWidth);
      height = Math.max(height, theme.stateMinHeight);
      width = Math.max(width, state.width);
      height = Math.max(height, state.height);
      observableModel.changeValue(state, 'width', width);
      observableModel.changeValue(state, 'height', height);

      if (statecharts && statecharts.length > 0) {
        // Expand the last statechart to fill its parent state.
        const lastStatechart = statecharts[statecharts.length - 1];
        observableModel.changeValue(lastStatechart, 'height',
          lastStatechart.height + height - stateOffsetY);
      }
    }
    // Make sure a statechart is big enough to enclose its contents. Statecharts
    // are always sized automatically to contain their contents and fit tightly in
    // their parent state.
    layoutStatechart(statechart) {
      const padding = this.theme.padding, translatableModel = this.model.translatableModel, statechartX = translatableModel.globalX(statechart), statechartY = translatableModel.globalY(statechart), items = statechart.items;
      if (items && items.length) {
        // Get extents of child states.
        const r = this.getBounds(items), x = r.x - statechartX, // Get position in statechart coordinates.
          y = r.y - statechartY, observableModel = this.model.observableModel;
        let xMin = Math.min(0, x - padding), yMin = Math.min(0, y - padding), xMax = x + r.width + padding, yMax = y + r.height + padding;
        if (xMin < 0) {
          xMax -= xMin;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (isTransition(item))
              continue;
            observableModel.changeValue(item, 'x', item.x - xMin);
          }
        }
        if (yMin < 0) {
          yMax -= yMin;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (isTransition(item))
              continue;
            observableModel.changeValue(item, 'y', item.y - yMin);
          }
        }
        // Statechart position is calculated by the parent state layout.
        observableModel.changeValue(statechart, 'width', xMax - xMin);
        observableModel.changeValue(statechart, 'height', yMax - yMin);
      }
    }
    layoutTransition(transition) {
      const self = this,
            src = this.getTransitionSrc(transition),
            dst = this.getTransitionDst(transition),
            p1 = src ? this.stateParamToPoint(src, transition.t1) : transition[_p1],
            p2 = dst ? this.stateParamToPoint(dst, transition.t2) : transition[_p2];
      // If we're in an intermediate state, don't layout.
      if (!p1 || !p2)
        return;
      function getCenter(state) {
        const bbox = self.getItemRect(state);
        return {
          x: bbox.x + bbox.width * 0.5,
          y: bbox.y + bbox.height * 0.5,
        }
      }
      // If it's an "inside" transition, flip the source normal.
      if (src && dst) {
        const hierarchicalModel = this.model.hierarchicalModel,
              dstGrandParent = hierarchicalModel.getParent(hierarchicalModel.getParent(dst));
        if (src === dstGrandParent) {
          p1.nx = -p1.nx;
          p1.ny = -p1.ny;
        }
      }
      const scaleFactor = src === dst ? 64 : 0,
            bezier = diagrams.getEdgeBezier(p1, p2, scaleFactor);
      if (src && isPseudostate(src)) {
        // Adjust the bezier's p1 and c1 to start on the boundary, towards bezier c2.
        const to = bezier[2],
              center = getCenter(src),
              radius = this.theme.radius,
              projection = geometry.projectPointToCircle(to, center, radius);
        bezier[0] = projection;
        bezier[1] = to;
      }
      if (dst && isPseudostate(dst)) {
        // Adjust the bezier's c2 and p2 to end on the boundary, towards bezier c1.
        const to = bezier[1],
              center = getCenter(dst),
              radius = this.theme.radius,
              projection = geometry.projectPointToCircle(to, center, radius);
        bezier[3] = projection;
        bezier[2] = to;
      }
      transition[_bezier] = bezier;
      transition[_textT] = geometry.evaluateBezier(transition[_bezier], transition.pt);
      let text = '', textWidth = 0;
      if (transition.event) {
        text += transition.event;
        textWidth += this.ctx.measureText(transition.event).width + 2 * this.theme.padding;
      }
      if (transition.guard) {
        text += '[' + transition.guard + ']';
        textWidth += this.ctx.measureText(transition.guard).width + 2 * this.theme.padding;
      }
      if (transition.action) {
        text += '/' + transition.action;
        textWidth += this.ctx.measureText(transition.action).width + 2 * this.theme.padding;
      }
      transition[_text] = text;
      transition[_textWidth] = textWidth;
    }
    // Layout a statechart item.
    layout(item) {
      if (isTrueState(item)) {
        this.layoutState(item);
      } else if (isStatechart(item)) {
        this.layoutStatechart(item);
      } else if (isTransition(item))
        this.layoutTransition(item);
    }
    drawArrow(x, y) {
      const ctx = this.ctx;
      ctx.beginPath();
      diagrams.arrowPath({ x: x, y: y, nx: -1, ny: 0 }, ctx, this.theme.arrowSize);
      ctx.stroke();
    }
    hitTestArrow(x, y, p, tol) {
      const d = this.theme.arrowSize, r = d * 0.5;
      return diagrams.hitTestRect(x - r, y - r, d, d, p, tol);
    }

    drawState(state, mode) {
      const ctx = this.ctx, theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, w = rect.width, h = rect.height, textSize = theme.fontSize, lineBase = y + textSize + theme.textLeading;
      diagrams.roundRectPath(x, y, w, h, r, ctx);
      switch (mode) {
        case normalMode:
        case printMode:
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
          ctx.fillText(state.name, x + r, y + textSize);
          if (state.entry)
            ctx.fillText(state[_entryText], x + r, y + state[_entryY] + textSize);
          if (state.exit)
            ctx.fillText(state[_exitText], x + r, y + state[_exitY] + textSize);

          const items = state.items;
          if (items) {
            let separatorY = lineBase;
            for (var i = 0; i < items.length - 1; i++) {
              const statechart = items[i];
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
        case highlightMode:
          ctx.strokeStyle = theme.highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case hotTrackMode:
          ctx.strokeStyle = theme.hotTrackColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
      }
      if (mode !== printMode) {
        this.drawArrow(x + w + theme.arrowSize, lineBase);
      }
    }
    hitTestState(state, p, tol, mode) {
      const theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, w = rect.width, h = rect.height, result = diagrams.hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
      if (result) {
        const lineBase = y + theme.fontSize + theme.textLeading;
        if (mode !== printMode && this.hitTestArrow(x + w + theme.arrowSize, lineBase, p, tol))
          result.arrow = true;
      }
      return result;
    }
    drawPseudoState(state, mode) {
      const ctx = this.ctx, theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y, cx = x + r, cy = y + r;
      function drawGlyph(glyph, cx, cy) {
        for (let i = 0; i < glyph.length; i += 4) {
          ctx.moveTo(cx + glyph[i], cy + glyph[i + 1]);
          ctx.lineTo(cx + glyph[i + 2], cy + glyph[i + 3]);
        }
      }
      diagrams.diskPath(cx, cy, r, ctx);
      switch (mode) {
        case normalMode:
        case printMode:
          ctx.lineWidth = 0.25;
          switch (state.type) {
            case 'start':
              ctx.fillStyle = theme.strokeColor;
              ctx.fill();
              ctx.stroke();
              break;
            case 'stop':
              ctx.fillStyle = theme.bgColor;
              ctx.fill();
              ctx.stroke();
              diagrams.diskPath(cx, cy, r / 2, ctx);
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
        case highlightMode:
          ctx.strokeStyle = theme.highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case hotTrackMode:
          ctx.strokeStyle = theme.hotTrackColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
      }
      if (mode !== printMode && !isStopState(state)) {
        this.drawArrow(x + 2 * r + theme.arrowSize, y + r);
      }
    }
    hitTestPseudoState(state, p, tol, mode) {
      const theme = this.theme, r = theme.radius, rect = this.getItemRect(state), x = rect.x, y = rect.y;
      if (mode !== printMode && !isStopState(state) && this.hitTestArrow(x + 2 * r + theme.arrowSize, y + r, p, tol))
        return { arrow: true };

      return diagrams.hitTestDisk(x + r, y + r, r, p, tol);
    }
    drawStatechart(statechart, mode) {
      const ctx = this.ctx,
            theme = this.theme,
            r = theme.radius,
            textSize = theme.fontSize,
            rect = this.getItemRect(statechart),
            x = rect.x, y = rect.y, w = rect.width, h = rect.height;
      switch (mode) {
        case normalMode:
        case printMode:
          if (statechart.name) {
            ctx.fillStyle = theme.textColor;
            ctx.fillText(statechart.name, x + r, y + textSize);
          }
          break;
        case highlightMode:
        case hotTrackMode:
          diagrams.roundRectPath(x, y, w, h, r, ctx);
          ctx.strokeStyle = mode === highlightMode ? theme.highlightColor : theme.hotTrackColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
      }
    }
    hitTestStatechart(statechart, p, tol, mode) {
      const theme = this.theme, r = theme.radius, rect = this.getItemRect(statechart), x = rect.x, y = rect.y, w = rect.width, h = rect.height;
      return diagrams.hitTestRect(x, y, w, h, p, tol); // TODO hitTestRoundRect
    }
    drawTransition(transition, mode) {
      const ctx = this.ctx, theme = this.theme, r = theme.knobbyRadius, bezier = transition[_bezier];
      diagrams.bezierEdgePath(bezier, ctx, theme.arrowSize);
      switch (mode) {
        case normalMode:
        case printMode:
          ctx.strokeStyle = theme.strokeColor;
          ctx.lineWidth = 1;
          ctx.stroke();
          const pt = transition[_textT];
          if (mode !== printMode) {
            const r = theme.radius / 2;
            diagrams.roundRectPath(pt.x - r,
              pt.y - r,
              theme.radius, theme.radius, r, ctx);
            ctx.fillStyle = theme.bgColor;
            ctx.fill();
            ctx.lineWidth = 0.25;
            ctx.stroke();
          }
          ctx.fillStyle = theme.textColor;
          ctx.fillText(transition[_text], pt.x + theme.padding, pt.y + theme.fontSize);
          break;
        case highlightMode:
          ctx.strokeStyle = theme.highlightColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        case hotTrackMode:
          ctx.strokeStyle = theme.hotTrackColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
      }
    }
    hitTestTransition(transition, p, tol, mode) {
      return diagrams.hitTestBezier(transition[_bezier], p, tol);
    }
    draw(item, mode) {
      switch (item.type) {
        case 'state':
          this.drawState(item, mode);
          break;
        case 'start':
        case 'stop':
        case 'history':
        case 'history*':
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
    hitTest(item, p, tol, mode) {
      let hitInfo;
      switch (item.type) {
        case 'state':
          hitInfo = this.hitTestState(item, p, tol, mode);
          break;
        case 'start':
        case 'stop':
        case 'history':
        case 'history*':
          hitInfo = this.hitTestPseudoState(item, p, tol, mode);
          break;
        case 'transition':
          hitInfo = this.hitTestTransition(item, p, tol, mode);
          break;
        case 'statechart':
          hitInfo = this.hitTestStatechart(item, p, tol, mode);
          break;
      }
      if (hitInfo)
        hitInfo.item = item;
      return hitInfo;
    }
    drawHoverText(item, p, nameValuePairs) {
      const self = this, theme = this.theme, ctx = this.ctx;
      const textSize = theme.fontSize,
            gap = 16,
            border = 4,
            height = textSize * nameValuePairs.length + 2 * border,
            maxWidth = diagrams.measureNameValuePairs(nameValuePairs, gap, ctx) + 2 * border;
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

export class EditingModel {
  private statechart_: Statechart;
  private dataModel_: DataModel;
  private hierarchyModel_: HierarchyModel;
  private observableModel_: ObservableModel;
  private referenceModel_: ReferenceModel;
  private selectionModel_: SelectionModel;
  private instancingModel_: InstancingModel;
  private translationModel_: TranslationModel;
  private statechartModel_: StatechartModel;



  copyItems(items: Array<AllItems>, map: Map<number, AllItems>) : Array<AllItems> {
    const statechart = this.statechart_,
          referenceModel = this.referenceModel_,
          translationModel_ = this.translationModel_,
          copies = this.instancingModel_.cloneGraph(items, map);

    items.forEach(function(item) {
      const copy = map.get(referenceModel.getId(item));  // TODO get rid of indirection getId
      if (copy && copy.type !== 'transition') {
        const translation = translationModel_.getToParent(item, statechart);
        copy.x += translation.x;
        copy.y += translation.y;
      }
    });
    return copies;
  }

  setAttr(item: AllItems, attr: string, value: any) {
    this.observableModel_.changeValue(item, attr, value);
  }

  newStatechart(y: number = 0) {
    const statechart : Statechart = {
      type: 'statechart',
      x: 0,
      y: y,
      width: 0,
      height: 0,
      items: new Array(),
    };
    return this.newItem(statechart);
  }

  addItem(item: State | Transition, parent: State | Statechart) : StatechartItem {
    const observableModel = this.observableModel_,
          hierarchicalModel = this.hierarchyModel_,
          statechartModel = this.statechartModel_,
          oldParent = hierarchicalModel.getParent(item);

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
      if (!statechartModel.canAddState(item, parent) && parent !== this.statechart_) {
        const superState = hierarchicalModel.getParent(parent);
        parent = this.findOrCreateChildStatechart(superState, item);
      }
      }
    }
    // At this point we can add item to parent.
    if (item.type === 'state') {
      const translatableModel = this.translationModel_,
            translation = translatableModel.getToParent(item, parent);
      this.setAttr(item, 'x', item.x + translation.x);
      this.setAttr(item, 'y', item.y + translation.y);
    }

    if (oldParent)
      this.deleteItem(item);

    if (parent.items) {
      observableModel.insertElement(parent, 'items', parent.items.length, item);
    }
    return item;
  }

  addItems(items: AllItems[], parent: State | Statechart) {
    // Add elements and groups first, then wires, so circuitModel can update.
    for (let item of items) {
      if (item.type === 'state') this.addItem(item, parent);
    }
    for (let item of items) {
      if (item.type === 'transition') this.addItem(item, parent);
    }
  }

  constructor(statechart: Statechart,
              dataModel: DataModel,
              observableModel: ObservableModel,
              hierarchymodel: HierarchyModel,
              referenceModel: ReferenceModel,
              selectionModel: SelectionModel,
              instancingModel: InstancingModel,
              translationModel: TranslationModel,
              statechartModel: StatechartModel) {
    this.statechart_ = statechart;
    this.dataModel_ = dataModel;
    this.observableModel_ = observableModel;
    this.referenceModel_ = referenceModel;
    this.hierarchyModel_ = hierarchymodel;
    this.selectionModel_ = selectionModel;
    this.instancingModel_ = instancingModel;
    this.translationModel_ = translationModel;
    this.statechartModel_ = statechartModel;
  }
}

/*
//------------------------------------------------------------------------------

const editingModel = (function() {
  const proto = {





    getLabel: function (item) {
      if (isTrueState(item)) return item.name;
    },

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

    makeConsistent: function () {
      const self = this, model = this.model,
            statechart = this.statechart,
            dataModel = model.dataModel,
            hierarchicalModel = model.hierarchicalModel,
            selectionModel = model.selectionModel,
            observableModel = model.observableModel,
            graphInfo = model.statechartModel.getGraphInfo();
      // Eliminate dangling transitions.
      graphInfo.transitions.forEach(function(transition) {
        const src = self.getTransitionSrc(transition),
              dst = self.getTransitionDst(transition);
        if (!src || !graphInfo.statesAndStatecharts.has(src) ||
            !dst || !graphInfo.statesAndStatecharts.has(dst)) {
          self.deleteItem(transition);
          return;
        }
        // Make sure transitions belong to lowest common statechart.
        const srcParent = hierarchicalModel.getParent(src),
              dstParent = hierarchicalModel.getParent(dst),
              lca = hierarchicalModel.getLowestCommonAncestor(srcParent, dstParent);
        if (self.getParent(transition) !== lca) {
          self.deleteItem(transition);
          self.addItem(transition, lca);
        }
      });
      // Delete any empty statecharts (except for the root statechart).
      graphInfo.statesAndStatecharts.forEach(function(item) {
        if (isStatechart(item) &&
            !self.isTopLevelStatechart(item) &&
            item.items.length === 0)
          self.deleteItem(item);
      });
    },

    isValidStatechart: function(statechart) {
      const self = this;
      let startingStates = 0;
      // A statechart is valid if its states and transitions are valid.
      let isValid = statechart.items.every(function(item) {
        if (isTransition(item)) {
          return self.isValidTransition(self.getTransitionSrc(item),
                                        self.getTransitionDst(item));
        }
        if (isStartState(item)) {
          startingStates++;
        } else if (isState(item) && item.items) {
          return item.items.every(item => { return self.isValidStatechart(item); });
        }
        // All other items are valid.
        return true;
      });
      // We have to allow no starting state as we build the statechart.
      return isValid && startingStates <= 1;
    },
  }

  function extend(model) {
    dataModels.dataModel.extend(model);
    dataModels.observableModel.extend(model);
    dataModels.selectionModel.extend(model);
    dataModels.referencingModel.extend(model);
    dataModels.hierarchicalModel.extend(model);
    dataModels.translatableModel.extend(model);
    dataModels.transactionModel.extend(model);
    dataModels.transactionHistory.extend(model);
    dataModels.instancingModel.extend(model);
    dataModels.copyPasteModel.extend(model);

    const instance = Object.create(model.copyPasteModel);
    instance.prototype = Object.getPrototypeOf(instance);
    for (let prop in proto)
      instance[prop] = proto[prop];

    instance.model = model;
    instance.statechart = model.root;

    instance.getTransitionSrc = model.referencingModel.getReferenceFn('srcId');
    instance.getTransitionDst = model.referencingModel.getReferenceFn('dstId');

    model.transactionModel.addHandler('transactionEnding',
                                      transaction => instance.makeConsistent());

    model.editingModel = instance;
    return instance;
  }

  return {
    extend: extend,
  }
})();

*/