# Functioncharts: A Graphical Programming Language
Functioncharts are a graphical programming language, using a "node and wire" graph to represent programs. This repository contains the source code for a Web application that runs in a browser and can create Functionchart graphs. There is no support yet for compiling, executing and debugging these programs (but that will be a fun project!) The emphasis here is on the design of the language. The web application is essentially a fancy diagram editor.

Functioncharts are inspired by [Statecharts](../statecharts/README.md). "Flowcharts" would have been a great name for these, but that name is taken.

Many "node and wire" programming systems have been built. However, most are either domain-specific, or are intended for non-programmers building small, simple programs. Like Statecharts, Functioncharts use hierarchy and abstraction to increase the power and economy of the notation. The ambitious goal is for Functioncharts to be equivalent in expressiveness and power to conventional textual programming languages.

The two principal innovations in Functioncharts are:

1. Functions can accept other functions as inputs, and produce new functions as outputs. This gives the diagrams much greater expressive power.

1. Functions define scopes, and a function can be used inside its own scope. This allows recursion, and as a special case, iteration through the tail call optimization. Function scopes can be nested, and may define complete functions, or partial functions, allowing us to create closures.

Both features help to reduce the visual complexity of the Functionchart diagrams, by making it easy to produce and consume helper functions which can control the routing of wires, and reduce their number.

Here is an example, implementing efficient exponentiation by squaring. It's generic, applying to any type where multiplication can be applied (e.g. numbers, complex numbers, polynomials, matrices).

<figure align="center">
  <img src="./resources/exp_by_squaring2.svg"  alt="" title="Exponentiation by squaring.">
</figure>

This introduction shows how some illustrative programs can be built and discusses the advantages and potential of this approach.

For our purposes here, we implement a simple uni-type language which looks a lot like Javascript. We have primitive values (numbers, strings, etc.) and Functions. This simplifies this diagrams since we only have one kind of value and then functions flowing on our wires. However, we could extend these diagrams to include distinct primtive types with stronger typing to model languages like C, C++, Java, or Go.

## Simple Functions
We start by using the built-in functions provided by the language to create a new function.

Functions have input and output pins that can be wired to other functions. Input pins can only accept one wire at a time, while an output pin may fan out to multiple functions.

We also have pseudofunctions which look like functions in this diagrams, but don't calculate anything. One use of these is to allow us to specify inputs and outputs and name them.

The picture below is a simple example of a Functionchart to compute the signum function, which takes a single number x as input and returns 1 if x > 0, 0 if x = 0, or -1 if x < 0.

We can implement signum using built in functions:

1. pseudofunctions for the input, 'a', and the output, 'b'. The 'a' pseudo-function indicates that the same value is used in two different places and gives the input a name which appears on the new function type.
1. Literal functions (0, 1, -1), which have no inputs and output a literal primitive value.
1. Binary operators (<, >), which take two input values and output a boolean value.
1. The conditional operator (?), which takes an input value and two inputs. Its semantics are:
```ts
  if (input1)
    return input2
  else
    return input3.
```

The Functionchart is drawn with rounded corners to distinguish it from function instances in the diagram. In the top right corner is the function that is defined by the contents of the functionchart. It is shaded to indicate that it can be instanced. Tha means clicking on it and dragging and dropping creates a new instance of the function in the diagram.

The order of the function instance's inputs and outputs is determined by their vertical position in the functionchart. Inputs and outputs are sorted by their y-coordinate, so the topmost input in the functionchart becomes the first input in its function instance.

<figure align="center">
  <img src="./resources/signum.svg"  alt="" title="Signum function.">
  <figcaption align="center">Function to return -1 if a < 0, 1 if a > 0, or 0 otherwise.</figcaption>
</figure>

This diagram is already a little hard to read. We can refactor, defining new helper functions. For the above example, we can define some very simple primitives (x<0, x>0, and a cascaded conditional operator) that make our function easier to read. Then we use the new functions to represent the final signum function as before. By default the sub-functions are drawn with lighter gray links to their defining functioncharts, as in this diagram. Normally we would set the links to be invisible for such simple helpers.

<figure align="center">
  <img src="./resources/signum2.svg"  alt="" title="Signum function using helper functions.">
</figure>

Similarly we can define other useful functions. In this Functionchart, the function instance links are visible. We use the "< 0" function in the abs functionchart.

<figure align="center">
  <img src="./resources/simpleFns.svg"  alt="" title="Comparisons, maximum, minimum, and absolute value.">
  <figcaption align="center">Simple helper functions, and an instance link.</figcaption>
</figure>

## Implicit and Explicit Functioncharts

For very simple functions, we can specify that any open input and output pins will become inputs and outputs on the new function defined by the functionchart. Below, function 'a' is an implicit chained conditional operator, like we used for the signum function. The cond functions are arranged so that the inputs of the topmost one come before (y-order) the inputs of the second. The single disconnected output becomes the composed function's output.

If we set the 'implicit' property of the functionchart to 'false', then our composed function now has no inputs or outputs ('b'). In this case we need to explicitly add pseudofunctions to specify inputs and outputs. In 'c' we add the pseudofunctions, placing them so that they appear in the correct order (y-order). In 'd' we need a pseudo-function to specify that the same input goes to both cond functions. In general, explicit functioncharts give more control over naming, ordering, and routing inputs, but for simple functions they can contribute to clutter. In these cases, implicit is preferable.

In the diagram of simple functions above, all of the functioncharts are implicit, except where input pseudofunctions are needed to route the input to multiple functions.

<figure align="center">
  <img src="./resources/implicit_explicit.svg"  alt="" title="Implicit and explicit functioncharts.">
  <figcaption align="center">Implicit cascaded cond (a), explicit empty function (b), explicit cascaded cond (c), (d) implicit parallel cond (d).</figcaption>
</figure>

## Recursion and Iteration

Since functions can call instances of themselves, we can define a recursive factorial (n!) function. This recursion is equivalent to an iteration, and in fact this is how functioncharts can represent iteration. Reading left to right, we define a helper decrement function, a "step" inner function, and finally an implicit functionchart which makes a single invocation of "step" with a pseudofunction input and 1 passed to the "acc" accumulator input.

<figure align="center">
  <img src="./resources/factorial.svg"  alt="" title="Recursive definition of factorial function N!.">
</figure>

Key diagram features:

1. 'step' is carefully arranged to return the recursive function invocation as the last step to allow the "tail recursion" optimization.
1. The 'step' function can't be implicit because it is recursive. Implicit only works with non-recursive functions.
1. The final 'n!' functionchart is implicit to simplify the diagram.

Similarly, we can define a [Fibonacci](#Fibonacci) functionchart.

## Abstract Functions (Factorial)

Below is a functionchart that defines a more general iteration that can be used to implement factorial again.

Abstraction is an important technique for making software more useful. We can abstract this program a bit by changing the end value "1" with another input "end" and replacing the multiplication function with an abstract binary function 'f' that takes an index and an accumulator and returns some result. 'f' is a stand-in for a function to be provided by the caller, and just defines the shape or signature of the function.

We create a helper functionchart for 'f' which contains pseudofunctions for two inputs and one output. This makes the functionchart abstract, indicated by a dotted outline around its function instances. Abstract functions can be used just like any function inside a functionchart and are interpreted as an implicit input of a function.

In this example, we use it but also pass it to the inner functionchart, so we add it to an importer node. The 'importer' modifier now has the inner function as an output. This allows us to create instances of the wrapped function, which we do here, and also to wire the function to other functions as an input. We do that to pass 'f' to 'reduce'.

We can use 'reduce' to compute factorial. We use an exporter modifier to pass the built-in multiplication function as 'f', and passing 1 as both the 'end' index and the initial 'acc' value.

<figure align="center">
  <img src="./resources/factorial2.svg"  alt="" title="Factorial function defined with reduce function.">
  <figcaption align="center">Somewhat busy abstracted factorial.</figcaption>
</figure>

This diagram is becoming hard to read. We can refactor to improve the diagram. Note that 'end' and 'f' inputs don't change during the iteration. We can move them out of the functionchart, and put them and the original into an enclosing functionchart. The inner functionchart closes over those external inputs, simplifying its signature. Then we can invoke the inner 'step' function in the parent functionchart to get our desired result.

<figure align="center">
  <img src="./resources/factorial3.svg"  alt="" title="Cleaned up reduce function.">
  <figcaption align="center">Refactored abstracted factorial.</figcaption>
</figure>

We can also use the reduce function to sum the elements of an Array, if we are given a function that somehow contains an array and provides its length and an "indexer" function. We use the Array's indexer function in a small functionchart that uses the "i" parameter to get the i-th element of the array, and the "acc" parameter to add to the accumulator. This function is passed into reduce. This time, we set the initial "acc" to 0.

<figure align="center">
  <img src="./resources/factorial4.svg"  alt="" title="Array sum function defined with reduce function.">
  <figcaption align="center">Reusing the 'reduce' function to sum an Array.</figcaption>
</figure>

## Modifier Functions

Modifier functions extend the notation for things that are difficult or impossible to represent without them. Above we saw the 'importer' and 'exporter' modifiers, which convert a function F into a function that outputs 'F'. These are interpreted differently in functioncharts. Importers become explicit inputs in a functionchart. Exporters are implicit outputs.

<figure align="center">
  <img src="./resources/modifiers.svg"  alt="" title="Modifiers and how they interact.">
  <figcaption align="center">Empty import and export modifiers (left), modifying '+' (center), effect in Functionchart (right).</figcaption>
</figure>

## Abstract Functions (Binary Search)

This is a simple binary search implementation. [Wikipedia](https://en.wikipedia.org/wiki/Binary_search)

```ts
function binary_search_leftmost(A: Array<number>, n: number, t: number) {
  let lo = 0;
  let hi = n;
  while (lo < R)  {
    const m = Math.floor((lo + hi) / 2);
    if (A[m] < t) {
      lo = m + 1;
    } else {
      hi = m;
    }
  }
  return lo;
}
```

In the functionchart below, the helper function 'divide' gives a visual explanation of the index calculations, and keeps the wires organized. The inputs for our function will be a search value, and a indexer function '[i]' which maps an index to a value, exactly like in an array. We use an abstract indexer, so we can reuse this search function.

<figure align="center">
  <img src="./resources/binary_search.svg"  alt="" title="Binary search implementation.">
  <figcaption align="center">Binary search given an indexer and '<' function. 't' is the search target.</figcaption>
</figure>

Key diagram features:

1. Helper functions are defined first. The '??' predicate returns two separate values for the true and false cases. This helps organize related wires.

1. The 'divide' helper function divides the range [lo..hi] into two sub-ranges [lo..mid] and [mid + 1, hi]. This helps reduce clutter. It also provides a nice visual explanation of how the range is split, as the outputs are increasing as we read top to bottom.

1. The implementation is very general, taking an abstract indexer function '[i]' and "less than" function '<'.
1. A helper function 'test' is created using the indexer and less than function. This consumes the input parameters in one corner of the chart and replaces some long wires and links with a single instance link.
1. Finally, 'binSearch' calls the 'search' function on the input range.

We can apply our 'binSearch' function to an array-like abstraction. This provides a 'length' and an indexer function '[i]', making it effectively read-only to the 'search' function.

<figure align="center">
  <img src="./resources/binary_search2.svg"  alt="" title="Binary search of an array.">
  <figcaption align="center">Applying our 'binSearch' to an abstracted Array of values.</figcaption>
</figure>

## More General Iteration

We can define two basic iteration primitives, roughly corresponding to a do-while loop and a while-do loop. We begin by defining abstractions for the body of the loop, and the condition for continuing the iteration. We create abstract functioncharts for these. An abstract functionchart is one that contains only pseudofunctions and other abstract functions.

Each function takes a single input and produces a single output. 'do-while' and 'while-do' both take an initial value 'p' and simply pass it to the 'body' and 'cond' functions. This is our loop variable, corresponding to a numeric index or an iterator of some kind. It can be anything since we only forward it in the iteration functions. The result of 'body' is simply passed on to the next invocation of 'body'. 'body' is responsible for updating the loop variable and returning it. The result of 'cond' determines when the loop terminates. A true value continues the loop.

The do-while form runs 'body' before 'cond', by making 'cond' depend on the result of 'body'. The while-do runs 'cond' on the loop variable first, and only invokes 'body' if we iterate (call while-do recursively).

<figure align="center">
  <img src="./resources/do_while.svg"  alt="" title="More general iteration functions.">
  <figcaption align="center">Minimal iteration abstractions, abstract parameter for 'body' and 'test'.</figcaption>
</figure>

If we make the iteration parameter a numeric index which the body and condition can test, then we can define for-loop primitives over a numeric range. Depending on the predicate chosen, we can implement various kinds of loops. Below we choose to implement the most common for-loops.

```ts
for (let i = start; i < end; )   // for [start,end[+

for (let i = start; i >= end; )  // for [start,end]-
```

At the bottom,= we again implement factorial using our for-loops. We choose the "down" iteration which iterates over the range [n..2] (inclusive).

Until now, our functions have all been pure, producing outputs and having no "side-effects". Now, we use a 'let' to hold our product as it's computed. 'let' represents a variable binding. We initialize the 'let' to 1 using the single input, and in our function 'body', multiply its value by the single input, changing the variable and returning the result to the iterator function.
<figure align="center">
  <img src="./resources/do_while2.svg"  alt="" title="Using the general iterator functions to implement factorial.">
  <figcaption align="center">Specialized 'for' iterations, value parameter for 'body' and 'test'. Implementing factorial (bottom)</figcaption>
</figure>

## Representing State (swap)

The let function is a built-in variable binding that can hold a value. 'let' has a single input to initialize the value, and two outputs, one to return the current value, and a 'setter' function to change the value. This function takes a single input, the new value, and just returns that value.

We can create an abstract functionchart to represent a "stateful, mutable" value. We give this the same signature as 'let'.

Now we use a single 'let' as a temporary variable, and create a function that takes two input variables, and performs a swap between them. The function uses 'setter' functions to first set temp to the first input, then first to second, and finally second to temp. Orchestrating all of this is a 'use' pseudo-function, which takes a variable number of inputs. The inputs are evaluated in order, which does two things:

1. 'use' uses the input, which executes the source function - important when there are side-effects.
2. 'use' evaluates its inputs in order, providing a way to sequence functions that have side-effects.

Swap would be simpler to implement if the semantics of the setter were to return the old value. We might be able to avoid the 'use' pseudo-function. However, the old value is less useful in our function graphs than the new value, and this helps route values without long wires crossing the graph.

<figure align="center">
  <img src="./resources/swap.svg"  alt="" title="A swap function.">
  <figcaption align="center">Swap two values, using a temp variable binding.</figcaption>
</figure>

## Abstract Functions (Quicksort)
Here is Typescript source for an implementation of Quicksort which does the partition step in place using Hoare's algorithm. [Wikipedia](https://en.wikipedia.org/wiki/Quicksort)

The code is subtle in places. In particular, it assumes the element used for the pivot is at the 'lo' index. Because of this, the do-while loops in 'partition' don't need to check i, j against lo, hi while iterating.

```ts
function quicksort(A: Array<number>, lo: number, hi: number) {
  if (lo >= 0 && hi >= 0 && lo < hi) {
    let p = partition(A, lo, hi);
    quicksort(A, lo, p);
    quicksort(A, p + 1, hi);
  }
}

// Divides array into two partitions
function partition(A: Array<number>, lo: number, hi: number) {
  let pivot = A[lo];
  let i = lo - 1;
  let j = hi + 1
  while (true) {
    do { i++ } while (A[i] < pivot);
    do { j-- } while (A[j] > pivot);
    if (i >= j) { return j; }
    let temp = A[i];
    A[i] = A[j];
    A[j] = temp;
  }
}
```

<figure align="center">
  <img src="./resources/quicksort.svg"  alt="" title="Quicksort, partition in place.">
  <figcaption align="center">Implementing quicksort and partition, given functions 'setPivot', 'swap', '<' and '>'.</figcaption>
</figure>

Key diagram features:

1. An abstraction for swapping elements at indices (i, j). It has two index inputs. This swaps the elements at i and j, and returns the input parameters for convenience.

1. An abstraction 'setP' for setting the pivot for the range [lo..hi]. Similarly, it takes two indices and simply returns them.

1. Binary predicates for comparing the elements at (i, j). This takes two indices and returns a boolean result.

1. Note that array is accessed only indirectly, through indices.

1. The abstract functions are inputs in the outermost scope, but are used in nested functioncharts such as 'advToSwap', 'partition', and 'quicksort'. The outermost functionchart takes these inputs and returns the functions 'quicksort' and 'partition'.

1. The first, 'quicksort' doesn't return a meaninful result (always 'true' because we return the result of the termination check.) However, the result must be consumed, since it drives the execution. This is important because this mutating quicksort is all side effects.

1. The second, 'partition' finds the point where the pivot element divides the range into two. It returns this 'p', and the input parameters, which is convenient for the 'quicksort' diagram. We return 'partition' as a result function since it is useful on its own.

1. The third, 'advToSwap' uses do-while to advance the pointers. Note that 'lo' is passed to '<' and '>' since these compare to the pivot, which is at 'lo'.

## Calling Quicksort

In order to call 'quicksort', we must create the functions 'swap', 'setP', '<', and '>'. We could do this, given an array. Again we choose to create an abstraction, this time for an Array-like function. The abstraction has a 'length', an indexed getter, and an indexed setter. This looks similar to a 'let', except that the additional index parameter is needed by both get and set.

We create an adapter which adapts the array abstraction to the required 'swap' and predicate functions, then use the adapter to implement two pivot selection algorithms, one a random element in the range, and the other a median-of-3 implementation. Finally, we use our adapter and pivot functions to call quicksort.

<figure align="center">
  <img src="./resources/quicksort2.svg"  alt="" title="Using quicksort to sort an array.">
  <figcaption align="center">Applying quicksort to an Array. (top) Adapt the Array, (middle) Implement pivot functions, (bottom) Sort the Array.</figcaption>
</figure>

Key diagram features:

1. The 'adapter' function uses the array indexed getter to implement the comparison functions.
1. It uses the getter and setter to create an indexed let-like function, which can be passed to the 'swap' we implemented before. The output isn't needed, but we must 'use' it to drive the side effects.
1. We use the adpater to implement two pivot selection algorithms. The adapter is useful since it implements 'swap', and the pivot functions in general swap the selected pivot with the element at 'lo'.
1. Finally, we call 'quicksort' on our abstracted array, using the adapter, and choosing the "median-of-3" pivot function.

Code fragment for Median of the 3 elements at 'lo', 'mid', and 'hi'.
```ts
mid := ⌊(lo + hi) / 2⌋
if A[mid] < A[hi]
    swap A[hi] with A[mid]
if A[lo] < A[hi]
    swap A[hi] with A[lo]
if A[mid] < A[lo]
    swap A[mid] with A[lo]
pivot := A[lo]
```

## Stateful Iteration (Iterators)
The diagram below defines a counter "construction set" by defining some base counters that can be composed. 'counter' is our counter abstraction, returning a value 'c' for the counter's current value, and a function 'n' which advances the counter's state, returning the new value. 'count' is an abstract base counter which contains the variable binding for the counter's value, and defines the next function 'n'. This uses an abstract 'inc' function to modify the counter's value.

This is still abstract, and counter could be a number or a linked list pointer for example. For our purposes, we will only specialize this for numeric counters.

<figure align="center">
  <img src="./resources/counters.svg"  alt="" title="Counters for iterating integer ranges.">
  <figcaption align="center">Counter Construction Set.</figcaption>
</figure>
<!-- <video src="./resources/functioncharts.mp4" width="1280" height="960" controls></video> -->

Key diagram features:

1. The 'counter' adapter defines the counter API.
1. 'count' implements the stateful part of a counter. It's abstract until it gets an 'inc' function.
1. 'countBy' adds the concept of a step. We specialize two functions for the common +1 and -1 cases.
1. 'countTo' adds the concept of a limit, for counting up or down.
1. Finally, we construct a counter that counts up by 1 in the range [lo..hi[.

## Casts
TODO down-casting, up-casting.

## Representing State (Tuples)

<figure align="center">
  <img src="./resources/tuples.svg"  alt="" title="Const and mutable Tuple types.">
</figure>

## Representing State (Point types)
While it might seem that Functioncharts are a purely higher-order functional language, we can define functions with side effects, which allow us to support programming paradigms like regular imperative programming and Object Oriented Programming.

Below, we define a function V representing a vector of numbers in 2 dimensions. Using a special 'this' element, we define properties 'x' and 'y' which the function adds to the 'this' object. 'this' functions have a simple value output for the current value of the property, and a setter function which has the side effect of changing the bound value. We don't define how 'this' is created yet. The V function returns two new functions, one to retrieve both properties and the other to set the two properties.


<figure align="center">
  <img src="./resources/points.svg"  alt="" title="A simple 2d point type.">
</figure>

We create a function VNormal representing a subtype function which represents only normalized (length 1) vectors. This function calls the V function, which initializes the 'x' and 'y' properties. However, VNormal first normalizes the two coordinates before calling the V function so it is initialized properly. It also overrides the V setting function to first normalize the coordinates before calling the base setter function. In other words, it overrides its base type's function.

<figure align="center">
  <img src="./resources/points2.svg"  alt="" title="A simple 2d point library.">
</figure>

## Libraries

<figure align="center">
  <img src="./resources/Library.svg"  alt="" title="An example of a Javascript built-in library.">
</figure>


## Semantics

1. To evaluate a function in a context, determine which outputs are consumed.
1. For each consumed output of the function, trace back to evaluate (cache results, so each function is evaluated only once). If a 'cond' is encountered, evaluate the condition, then evaluate along the branch that will be the result.
1. This "lazy" evaluation is not for efficiency; it is needed when side-effects are desired only under certain conditions.
1. 'use' pseudofunctions can be used to pull in side-effects, and to order function evaluation.

# More Examples

## Fibonacci

Similarly to the recursion example, we can define a Fibonacci function. We define a helper which takes 3 parameters, and then "call" it with n, 1, 1, to start the iteration.

<figure align="center">
  <img src="./resources/fibonacci.svg"  alt="" title="Recursive definition of fibonacci function.">
</figure>

## Exponentiation by Squaring

We can define an efficient exponentiation function. [Wikipedia](https://en.wikipedia.org/wiki/Exponentiation_by_squaring)

```ts
function exp_by_squaring(x: number, n: number) {
  return exp_by_squaring2(1, x, n)
}
function exp_by_squaring2(y: number, x: number, n: number) : number {
  else if (n == 0) return y;
  else if (n & 1 === 0) return exp_by_squaring2(y, x * x, n / 2);
  else return exp_by_squaring2(x * y, x * x, (n - 1) / 2);
}
```

We create some simple helper functions to test for zero and even, and a two condition operator. We also create an expStep helper function to implement the recursion. Again, this function is arranged to call itself recursively as the last step, allowing the tail-recursion optimization.

<figure align="center">
  <img src="./resources/exp_by_squaring.svg"  alt="" title="Tail-recursive implemention of exponentiation by squaring.">
  <figcaption align="center">Naive implementation</figcaption>
</figure>

Messy! This is why node-and-wire gets a bad name. The tangle of wires crossing in the middle makes this difficult to read. Functioncharts can be refactored. Here we do take the core step that computes the new x, y from the inputs and use a functionchart to create a helper function. We also reorder the 'n', 'y', and 'x' inputs to minimize crossings. The use of hierarchy has the effect of removing a part of the circuit and creating an indirection when we instantiate the single instance. The helper function gives a visual explanation of the core multiply step.

<figure align="center">
  <img src="./resources/exp_by_squaring2.svg"  alt="" title="Simplified implemention of exponentiation by squaring.">
  <figcaption align="center">Refactored implementation</figcaption>
</figure>

<figure align="center">
  <img src="./resources/binary_search3.svg"  alt="" title="">
</figure>

<figure align="center">
  <img src="./resources/intervals.svg"  alt="" title="">
</figure>

## Covariance (fewer inputs), Contravariance (more outputs)
TODO

## Stateful Iteration Protocols
TODO

## Iteration over a Numeric Range
We can make iteration more generic. First we define an abstract "body" function, with 1 input and 1 output. The first input is the iteration index, the typical "i" in a for-loop. The output is the result of the body, and is used by the iteration function to break. We choose "undefined" as the sentinel value to break. Then we iterate over the range [0..n[, passing the index to the body function and continuing as long as the body returns a defined value.

We can use the iteration to implement our factorial function. However, since we don't have an accumulator passed as a parameter to our body function, we must instead encapsulate that in the body function as a bit of state. We do this now by using a 'var' element, which has two outputs - the first returns the current value, and the second returns a function which changes the value, and returns the previous value. Then our body function multiplies the current value by the iteration index, then sets the var to the result. We also return the value, so we continue rather than breaking from the iteration.
<!-- <figure align="center">
  <img src="./resources/iteration.svg"  alt="" title="Simple iteration over the range [0..n[.">
</figure> -->

## More General Iteration over a Range
Generic iteration with start, end, condition, and step configurable.
TODO up/down, step 1, n, exotic step (binary search)
<!-- <figure align="center">
  <img src="./resources/iteration2.svg"  alt="" title="Generic iteration with start, end, condition, and step configurable.">
</figure> -->

## Live Demo Editor with Examples
Our palette contains the built in functions and Pseudofunctions. On the top are the input, output, apply, and pass Pseudofunctions. input and output allow us to explicitly label inputs and outputs and indicate how an input feeds into the circuit. apply connects to a function output of an function and allows us to instantiate that function in the containing circuit. pass takes its input and passes it on, allowing us to add sequencing ability to our circuits.

<!-- <figure align="center">
  <img src="./resources/palette.svg"  alt="" title="Palette (Pseudofunctions and primitive computational functions)">
</figure> -->

[Live Demo](https://billbudge.github.io/WebEditorFramework/examples/functioncharts/)

## Inspiration
Functioncharts were inspired by Harel Statecharts, another graphical representation of programs, which employs hierarchy to give state-transition diagrams more expressive power.

<figure align="center">
  <img src="/resources/palette2.svg"  alt="" title="pseudofunctions">
</figure>
