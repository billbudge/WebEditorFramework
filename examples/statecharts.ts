
import { SelectionSet } from '../src/collections'

import { ScalarProp, ArrayProp, ReferencedObject, RefProp, ParentProp,
         DataContext, EventBase, Change, ChangeEvents,
         getLowestCommonAncestor, reduceToRoots } from '../src/dataModels'

//------------------------------------------------------------------------------

// Interfaces to statechart objects.

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
  id: number;
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

  constructor(context: StatechartContext) {
    this.context = context;
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
  id: number;
  readonly context: StatechartContext;

  readonly type: PseudostateType = 'pseudostate';
  readonly subtype: PseudostateSubtype;

  get x() { return this.template.x.get(this) || 0; }
  set x(value) { this.template.x.set(this, this.context, value); }
  get y() { return this.template.y.get(this) || 0; }
  set y(value) { this.template.y.set(this, this.context, value); }

  get parent() { return this.template.parent.get(this); };
  set parent(parent) { this.template.parent.set(this, parent); };

  constructor(subtype: PseudostateSubtype, context: StatechartContext) {
    this.subtype = subtype;
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
export type AllTypes = StateTypes | Statechart | Transition;

export type StateVisitor = (state: StateTypes, parent: ParentTypes) => void;
export type StatechartVisitor = (item: AllTypes) => void;
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

const _inTransitions = Symbol('StatechartModel.inTransitions'),
      _outTransitions = Symbol('StatechartModel.outTransitions');

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
    const result: State = new State(this),
          nextId = ++this.highestId_;
    this.stateMap_.set(nextId, result);
    result.id = nextId;
    return result;
  }

  newPseudostate(subtype: PseudostateSubtype) : Pseudostate {
    const result: Pseudostate = new Pseudostate(subtype, this),
          nextId = ++this.highestId_;
    this.stateMap_.set(nextId, result);
    result.id = nextId;
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

  visitStates(item: State | Pseudostate | Statechart, parent: ParentTypes, visitor: StateVisitor) : void {
    const self = this;
    if (item.type === 'state') {
      visitor(item, parent);
      item.statecharts.forEach(t => self.visitStates(t, item, visitor));
    } else if (item.type === 'pseudostate') {
      visitor(item, parent);
    } else if (item.type === 'statechart') {
      item.states.forEach(t => self.visitStates(t, item, visitor));
    }
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

  private prepareSubtree(item: AllTypes) : void {
    const self = this;
    const unidentified = new Array<StateTypes>();
    this.visitAll(item, item => {
      // Ensure unique ids. TODO - check for duplicates.
      if (item.type === 'state' || item.type === 'pseudostate') {
        if (item.id !== undefined) {
          self.highestId_ = Math.max(self.highestId_, item.id);
          self.stateMap_.set(item.id, item);
        } else {
          unidentified.push(item);
        }
      }
    });
    unidentified.forEach((item: StateTypes) => {
      item.id = ++self.highestId_;
      self.stateMap_.set(item.id, item);
    });
  }

  setRoot(root: Statechart) : void {
    this.prepareSubtree(root);
    this.insertItem_(root, undefined);
    this.statechart_ = root;
  }

  getGrandParent(item: AllTypes) : AllTypes | undefined {

    let result = item.parent;
    if (result)
      result = result.parent;
    return result;
  }

  getInTransitions(state: StateTypes) : Transition[] {
    return (state as any)[_inTransitions];
  }

  getOutTransitions(state: StateTypes) : Transition[] {
    return (state as any)[_outTransitions];
  }

  forInTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const inputs = this.getInTransitions(state);
    if (!inputs)
      return;
    inputs.forEach((input, i) => visitor(input));
  }

  forOutTransitions(state: StateTypes, visitor: TransitionVisitor) {
    const outputs = this.getOutTransitions(state);
    if (!outputs)
      return;
    outputs.forEach((output, i) => visitor(output));
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
    if ((state as any)[_inTransitions] === undefined) {
      // assert(state[_outTransitions] === undefined);
      (state as any)[_inTransitions] = new Array<Transition>();
      (state as any)[_outTransitions] = new Array<Transition>();
    }
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
    const src = transition.src,
          dst = transition.dst;
    if (src) {
      const outputs = this.getOutTransitions(src);
      if (outputs)
        outputs.push(transition);
    }
    if (dst) {
      const inputs = this.getInTransitions(dst);
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
      const outputs = this.getOutTransitions(src);
      if (outputs)
        remove(outputs, transition);
    }
    if (dst) {
      const inputs = this.getInTransitions(dst);
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
    }
    this.onValueChanged(owner, attr, oldValue);
  }
  elementInserted(owner: State | Statechart, attr: string, index: number, value: AllTypes) : void {
    if (value.type !== 'transition')
      this.prepareSubtree(value);

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


/*


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