
import { DataModel, ObservableModel, Change, ReferenceModel, HierarchyModel,
         SelectionModel, InstancingModel, TranslationModel } from '../src/dataModels'

//------------------------------------------------------------------------------

// TODO fix (* as any) casts.

// Maintains:
// - maps from element to connected transitions.
// - information about graphs and subgraphs.

export interface State {
  readonly type: 'state' | 'start' | 'stop' | 'history' | 'history*';
  readonly items?: Statechart[];  // Only for type === 'state'
  id: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface Transition {
  readonly type: 'transition';
  srcId: number;
  dstId: number;
}

export type StatechartItem = State | Transition;

export interface Statechart {
  readonly type: 'statechart';
  readonly items: StatechartItem[];
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AllItems = Statechart | StatechartItem;

export type StatechartVisitor = (item: AllItems) => void;

function visit(items: AllItems[], fn: StatechartVisitor) {
  items.forEach(function(item, i) {
    fn(item);
    if ((item.type === 'state' || item.type === 'statechart') && item.items) {
      visit(item.items, fn);
    }
  });
}

export type TransitionVisitor = (transition: Transition) => void;

export interface GraphInfo {
  states: Set<State>;
  statecharts: Set<Statechart>;
  transitions: Set<Transition>;
  interiorTransitions: Set<Transition>;
  inTransitions: Set<Transition>;
  outTransitions: Set<Transition>;
}

const _inTransitions = Symbol('StatechartModel.inTransitions'),
      _outTransitions = Symbol('StatechartModel.outTransitions');

export class StatechartModel {
  private statechart_: Statechart;
  private states_: Set<State>;
  private statecharts_: Set<Statechart>;
  private transitions_: Set<Transition>;

  private getParent_: (state: any) => any;
  private getLowestCommonAncestor: (...items: Array<any>) => any;
  private getTransitionSrc_: (transition: any) => State;
  private getTransitionDst_: (transition: any) => State;

  statechart() : Statechart {
    return this.statechart_;
  }

  getGrandParent(item: AllItems) : AllItems | undefined {
    let result = this.getParent_(item);
    if (result)
      result = this.getParent_(result);
    return result;
  }

  getInTransitions(state: State) : Transition[] {
    return (state as any)[_inTransitions];
  }

  getOutTransitions(state: State) : Transition[] {
    return (state as any)[_outTransitions];
  }

  forInTransitions(state: State, fn: TransitionVisitor) {
    const inputs = this.getInTransitions(state);
    if (!inputs)
      return;
    inputs.forEach((input, i) => fn(input));
  }

  forOutTransitions(state: State, fn: TransitionVisitor) {
    const outputs = this.getOutTransitions(state);
    if (!outputs)
      return;
    outputs.forEach((output, i) => fn(output));
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

  getSubgraphInfo(items: State[]) : GraphInfo {
    const self = this,
          states = new Set<State>(),
          statecharts = new Set<Statechart>(),
          transitions = new Set<Transition>(),
          interiorTransitions = new Set<Transition>(),
          inTransitions = new Set<Transition>(),
          outTransitions = new Set<Transition>();
    // First collect states and statecharts.
    visit(items, function(item) {
      if (item.type === 'state')
        states.add(item);
      else if (item.type === 'statechart')
        statecharts.add(item);
    });
    // Now collect and classify transitions that connect to them.
    visit(items, function(item) {
      function addTransition(transition: Transition) {
        // Stop if we've already processed this transtion (handle transitions from a state to itself.)
        if (transitions.has(transition)) return;
        transitions.add(transition);
        const src = self.getTransitionSrc_(transition),
              dst = self.getTransitionDst_(transition),
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
      if (item.type === 'state') {
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

  getConnectedStates(states: State[], upstream: boolean, downstream: boolean) : Set<State> {
    const self = this,
          result = new Set<State>();

    states = states.slice(0);  // Copy input array
    while (states.length > 0) {
      const state = states.pop();
      if (!state) continue;

      result.add(state);
      if (upstream) {
        this.forInTransitions(state, function(transition) {
          const src = self.getTransitionSrc_(transition);
          if (!result.has(src))
            states.push(src);
        });
      }
      if (downstream) {
        this.forOutTransitions(state, function(transition) {
          const dst = self.getTransitionDst_(transition);
          if (!result.has(dst))
            states.push(dst);
        });
      }
    }
    return result;
  }

  getTopLevelState(item: State) : State {
    const topLevelStatechart = this.statechart_;
    while (true) {
      const parent = this.getParent_(item);
      if (!parent || parent === topLevelStatechart)
        return item;
      item = parent;
    }
  }

  // Returns a value indicating if the item can be added to the state
  // without violating statechart constraints.
  canAddState(state: State, statechart: Statechart) : boolean {
    // The only constraint is that there can't be two start states in a statechart.
    if (state.type !== 'start')
      return true;
    for (let item of statechart.items) {
      if (item.type === 'start' && item !== state)
        return false;
    }
    return true;
  }

  isValidTransition(src: State, dst: State) : boolean {
    // No transition to self for pseudostates.
    if (src == dst) return src.type === 'state';
    // No transitions to a start pseudostate.
    if (dst.type === 'start') return false;
    // No transitions from a stop pseudostate.
    if (src.type === 'stop') return false;
    // No transitions out of parent state for start or history pseudostates.
    if (src.type === 'start' || src.type === 'history' || src.type === 'history*') {
      const srcParent = this.getParent_(src),
            dstParent = this.getParent_(dst);
      return srcParent == dstParent;
    }
    // Transitions can't straddle parallel statecharts. The lowest common ancestor
    // of src and dst must be a statechart, not a state, except for "inside" transitions.
    const lca = this.getLowestCommonAncestor(src, dst);
    // Allow transitions between a super state and its child states.
    if (lca.type === 'state')
      return src === this.getGrandParent(dst);
    return lca.type === 'statechart';
  }

  private insertState_(state: State) {
    this.states_.add(state);
    if ((state as any)[_inTransitions] === undefined) {
      // assert(state[_outTransitions] === undefined);
      (state as any)[_inTransitions] = new Array<Transition>();
      (state as any)[_outTransitions] = new Array<Transition>();
    }
    if (state.items) {
      const self = this;
      state.items.forEach(statechart => self.insertItem_(statechart));
    }
  }

  private removeState_(state: State) {
    this.states_.delete(state);
  }

  private insertStatechart_(statechart: Statechart) {
    this.statecharts_.add(statechart);
    const self = this;
    statechart.items.forEach(subItem => self.insertItem_(subItem));
  }

  private removeStatechart_(stateChart: Statechart) {
    this.statecharts_.delete(stateChart);
    const self = this;
    stateChart.items.forEach(subItem => self.removeItem_(subItem));
  }

  private insertTransition_(transition: Transition) {
    this.transitions_.add(transition);
    const src = this.getTransitionSrc_(transition),
          dst = this.getTransitionDst_(transition);
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
    const src = this.getTransitionSrc_(transition),
          dst = this.getTransitionDst_(transition);
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

  private insertItem_(item: AllItems) {
    if (item.type ==='transition')
      this.insertTransition_(item);
    else if (item.type === 'statechart')
      this.insertStatechart_(item);
    else
      this.insertState_(item);
  }

  private removeItem_(item: AllItems) {
    if (item.type ==='transition')
      this.removeTransition_(item);
    else if (item.type === 'statechart')
      this.removeStatechart_(item);
    else
      this.removeState_(item);
  }

  private onChanged_ (change: Change) {
    const item = change.item as AllItems,  // TODO make datamodel generic in AllItems.
          attr = change.attr;
    switch (change.type) {
      case 'valueChanged': {
        if (item.type === 'transition') {
          // Remove and reinsert changed transitions.
          this.removeTransition_(item);
          this.insertTransition_(item);
        }
        break;
      }
      case 'elementInserted': {
        const newValue = (item as any)[attr][change.index];
        this.insertItem_(newValue);
        break;
      }
      case 'elementRemoved': {
        const oldValue = change.oldValue;
        this.removeItem_(oldValue);
      }
    }
  }

  constructor(statechart: Statechart,
              observableModel: ObservableModel,
              hierarchymodel: HierarchyModel,
              referenceModel: ReferenceModel) {

    this.statechart_ = statechart;

    observableModel.addHandler('changed', this.onChanged_.bind(this));

    this.getParent_ = hierarchymodel.getParent.bind(hierarchymodel);
    this.getLowestCommonAncestor = hierarchymodel.getLowestCommonAncestor.bind(hierarchymodel);
    this.getTransitionSrc_ = referenceModel.getReferenceFn('srcId');
    this.getTransitionDst_ = referenceModel.getReferenceFn('dstId');

    this.states_ = new Set();
    this.statecharts_ = new Set();
    this.transitions_ = new Set();

    this.insertItem_(statechart);
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

  reduceSelection() {
    const hierarchyModel = this.hierarchyModel_,
          selectionModel = this.selectionModel_;
    // First, replace statecharts by their parent state. We do this by adding parent
    // states to the selection before reducing. Snapshot the selection since we will
    // be modifying it.
    selectionModel.contents().forEach(function(item: AllItems) {
      if (item.type === 'statechart') {
        selectionModel.delete(item);
        const parent = hierarchyModel.getParent(item);
        if (parent)
          selectionModel.add(parent);
      }
    });
    selectionModel.reduceSelection(hierarchyModel);
  }

  selectInteriorTransitions() {
    const selectionModel = this.selectionModel_,
          graphInfo = this.statechartModel_.getSubgraphInfo(selectionModel.contents());
    selectionModel.add(graphInfo.interiorTransitions);
  }

  newItem(item: AllItems) : AllItems {
    const dataModel = this.dataModel_,
          referenceModel = this.referenceModel_;
    referenceModel.assignId(item);
    dataModel.initialize(item);
    return item;
  }

  newItems(items: Array<AllItems>) : Array<AllItems> {
    const self = this,
          result = new Array<AllItems>();
    items.forEach(item => { result.push(self.newItem(item)); });
    return result;
  }

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

  deleteItem(item: AllItems) {
    const parent = this.hierarchyModel_.getParent(item);
    if (parent) {
      const items = parent.items;
      if (items) {
        const index = items.indexOf(item);
        if (index >= 0) {
          this.observableModel_.removeElement(parent, 'items', index);
          this.selectionModel_.delete(item);
        }
      }
    }
  }

  deleteItems(items: Array<AllItems>) {
    const self = this;
    items.forEach(function(item) {
      self.deleteItem(item);
    }, this);
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

  findChildStatechart(state: State, child: State | Transition) {
    const statechartModel = this.statechartModel_;
    if (state.items) {
      for (let i = 0; i < state.items.length; i++) {
        if (child.type === 'transition' ||
            statechartModel.canAddState(child, state.items[i])) {
            return i;
          }
      }
    }
    return -1;
  }

  findOrCreateChildStatechart(state: State, child: State | Transition) {
    let i = this.findChildStatechart(state, child);
    if (i < 0) {
      if (!state.items)
        this.setAttr(state, 'items', new Array());
      i = state.items!.length;
      const y = 0;// TODO this.model_.renderer.getNextStatechartY(state);
      const statechart = this.newStatechart(y);
      this.observableModel_.insertElement(state, 'items', i, statechart);
    }
    return state.items![i];  // TODO check
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