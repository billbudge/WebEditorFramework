
import { ObservableModel, ReferenceModel, HierarchyModel, Change } from '../src/dataModels'

//------------------------------------------------------------------------------

// Maintains:
// - maps from element to connected transitions.
// - information about graphs and subgraphs.

interface State {
  type: 'state' | 'start' | 'stop' | 'history' | 'history*';
  x: number;
  y: number;
  items?: Statechart[];  // Only for type === 'state'
}

interface Transition {
  type: 'transition';
  src: State;
  dst: State;
}

type StatechartItem = State | Transition;

interface Statechart {
  name?: string;
  type: 'statechart';
  items: StatechartItem[];
  y: number;
}

type AllItems = Statechart | StatechartItem;

interface GraphInfo {
  states: Set<State>;
  statecharts: Set<Statechart>;
  transitions: Set<Transition>;
  interiorTransitions: Set<Transition>;
  inTransitions: Set<Transition>;
  outTransitions: Set<Transition>;
}

type StatechartVisitor = (item: AllItems) => void;

function visit(items: AllItems[], fn: StatechartVisitor) {
  items.forEach(function(item, i) {
    fn(item);
    if ((item.type === 'state' || item.type === 'statechart') && item.items) {
      visit(item.items, fn);
    }
  });
}

type TransitionVisitor = (transition: Transition) => void;

const _inTransitions = Symbol('StatechartModel.inTransitions'),
      _outTransitions = Symbol('StatechartModel.outTransitions');

export class StatechartModel {
  private statechart_: Statechart;
  private states_: Set<State>;
  private statecharts_: Set<Statechart>;
  private transitions_: Set<Transition>;

  private getParent_: (state: any) => any;
  private getTransitionSrc_: (transition: any) => State;
  private getTransitionDst_: (transition: any) => State;

  statechart() : Statechart {
    return this.statechart_;
  }

  getInTransitions(state: State) : Transition[] {
    return state[_inTransitions];
  }

  getOutTransitions(state: State) : Transition[] {
    return state[_outTransitions];
  }

  forInTransitions(state: State, fn: TransitionVisitor) {
    const inputs = this.getInTransitions(state);
    if (!inputs)
      return;
    inputs.forEach((input, i) => fn(input, i));
  }

  forOutTransitions(state: State, fn: TransitionVisitor) {
    const outputs = this.getOutTransitions(state);
    if (!outputs)
      return;
    outputs.forEach((output, i) => fn(output, i));
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
      function addTransition(transition) {
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

  private insertState_(state: State) {
    this.states_.add(state);
    if (state[_inTransitions] === undefined) {
      // assert(state[_outTransitions] === undefined);
      state[_inTransitions] = new Array<Transition>();
      state[_outTransitions] = new Array<Transition>();
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
        const newValue = item[attr][change.index];
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
    this.getTransitionSrc_ = referenceModel.getReferenceFn('srcId');
    this.getTransitionDst_ = referenceModel.getReferenceFn('dstId');

    this.states_ = new Set();
    this.statecharts_ = new Set();
    this.transitions_ = new Set();

    this.insertItem_(statechart);
  }
}


/*

*/