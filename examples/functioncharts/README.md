# Functioncharts: Diagrams of Computation
Functioncharts are a graphical programming language, using a "node and wire" graph to represent programs. This repository contains the source code for a Web Editor that runs in a browser and can create Functionchart graphs. There is no support yet for compiling, executing and debugging these programs (yet!)

Many "node and wire" programming systems have been built. However, most are either domain-specific, or are intended for non-programmers building small, simple programs. Functioncharts are loosely patterned after Harel Statecharts, using hierarchy and abstraction to increase the power of the notation. The ambitious goal is for Functioncharts to be equivalent in expressiveness and power to conventional textual programming languages.

The two innovations in Functioncharts are:

1. Functions can accept other functions as inputs, and produce new functions as outputs. This gives the diagrams much greater expressive power as we can represent abstractions.

2. Functions may be defined by the user using nested Functions. The nested Function can be edited live, so the new function can be used inside its own definition. This allows recursion, and as a special case, iteration through the tail call optimization. Nested Functioncharts may define complete functions, or partial functions, allowing us to express things like closures.

Both features serve to reduce the visual complexity of the Functionchart diagrams, by having scopes, by reducing the number of wires, and by organizing them.

This introduction shows how some illustrative programs can be built and discusses the advantages and potential of this approach.

For our purposes here, we implement a simple mono-type language which looks a lot like Javascript. This simplifies our diagrams since we only have "simple" values (numbers, strings, etc.) and function values flowing along wires.

## Simple Functions
We start by using the built-in functions provided by the language to create a new function.

Functions have input and output pins that can be wired to other functions. Input pins can only accept one wire at a time, while an output pin may fan out to multiple functions.

We also have Pseudofunctions which look like functions in our diagrams, but don't calculate anything. One use of these is to allow us to specify inputs and outputs and name them.

The picture below is a simple example of a Functionchart to compute the signum function, which takes a single number x as input and returns 1 if x > 0, 0 if x = 0, or -1 if x < 0. We use the following built in functions:

1) Pseudofunctions to mark and name the input, 'a', and the output, 'b'. The 'a' input also allows us to indicate that the same value is used in two different places.
3) Literal functions (0, 1, -1), which have no inputs and output a literal value.
3) Binary operators (<, >), which take two input values and output a boolean value.
4) The conditional operator (?), which takes an input value and two inputs. It outputs the second input if the first input is true, or the third input if the first input is false.

The Functionchart defines a function, which is displayed in the top right corner. It is shaded to indicate that it can be instanced in the diagram.

<figure>
  <img src="./resources/signum.svg"  alt="" title="Signum function.">
</figure>

This diagram is already a little hard to read because of the wires. We can simplify by defining new functions using sibling functioncharts to define helper functions. For the above example, we can define some very simple primitives (x<0, x>0, and a cascaded conditional operator) that make our function easier to read. Then we use the new functions to represent the final signum function as before.

<figure>
  <img src="./resources/signum2.svg"  alt="" title="Signum function using helper functions.">
</figure>

Similarly we can define other useful functions. In this Functionchart, the function instance links are visible. Note the use of the "< 0" function in the abs functionchart. We can hide these links when they're obvious in the context. For example, links to simple helpers may be hidden for clarity of the overall diagram.

<figure>
  <img src="./resources/simpleFns.svg"  alt="" title="Comparisons, maximum, minimum, and absolute value.">
</figure>

## Recursion and Iteration

Since functions can call instances of themselves, we can define a recursive factorial (N!) function. The recursion is equivalent to a simple iteration, and in fact this is how the diagram can represent iteration. Reading left to right, we define a helper decrement function, a "facstep" helper function, carefully arranged to return the recursive function invocation as the last step to allow the "tail recursion" optimization, and finally an invocation of "facstep" with an pseudofunction input and 1 passed to the "acc" input.

<figure>
  <img src="./resources/factorial.svg"  alt="" title="Recursive definition of factorial function N!.">
</figure>

Similarly, we can define a [Fibonacci](#Fibonacci) functionchart.

We can abstract this a bit by replacing the multiplication function with an abstract binary operation, represented by a function import. This is a stand-in for a function to be provided by the caller, and just defines the shape of the function. That makes this function look just like the "reduce" function. We can use this function to compute factorial by using an export function to pass the multiplication operator, and again passing 1 as the initial "acc" value.

We can re-use our "Reduce" to implement Factorial.

<figure>
  <img src="./resources/factorial2.svg"  alt="" title="Factorial function defined with reduce function.">
</figure>

## Iteration over a Numeric Range
We can make iteration more generic. First we define an abstract "body" function, with 1 input and 1 output. The first input is the iteration index, the typical "i" in a for-loop. The output is the result of the body, and is used by the iteration function to break. We choose "undefined" as the sentinel value to break. Then we iterate over the range [0..n[, passing the index to the body function and continuing as long as the body returns a defined value.

We can use the iteration to implement our factorial function. However, since we don't have an accumulator passed as a parameter to our body function, we must instead encapsulate that in the body function as a bit of state. We do this now by using a 'var' element, which has two outputs - the first returns the current value, and the second returns a function which changes the value, and returns the previous value. Then our body function multiplies the current value by the iteration index, then sets the var to the result. We also return the value, so we continue rather than breaking from the iteration.
<figure>
  <img src="./resources/iteration.svg"  alt="" title="Simple iteration over the range [0..n[.">
</figure>

## More General Iteration over a Range
Generic iteration with start, end, condition, and step configurable.
TODO up/down, step 1, n, exotic step (binary search)
<figure>
  <img src="./resources/iteration2.svg"  alt="" title="Generic iteration with start, end, condition, and step configurable.">
</figure>

## Counters
Minimal iteration abstraction
<figure>
  <img src="./resources/counters.svg"  alt="" title="Counters for iterating integer ranges.">
</figure>

## Quicksort
Let's implement Quicksort using these iteration primitives. Here is the source for a Javascript implementation of the classic Quicksort which does the partition step in place.

We'll start by implementing the iterations which advance indices to a pair of out of place functions.

```js
function partition(a, i, j) {
  let p = a[i];
  while (1) {
    while (i < j && a[i] <= p) i++;
    while (j > i && a[j] >= p) j--;
    if (i >= j) return j;
    [a[i], a[j]] = [a[j], a[i]];
    i++; j--;
  }
}
function qsort(a, i, j) {
  if (i >= j) return;
  let k = partition(a, i, j);
  qsort(a, i, k);
  qsort(a, k + 1, j);
}
```

<figure>
  <img src="./resources/quicksort.svg"  alt="" title="Quicksort, partition in place.">
</figure>

## State
While it might seem that Functioncharts are a purely higher-order functional language, we can define functions with side effects, which allow us to support programming paradigms like regular imperative programming and Object Oriented Programming.

<figure>
  <img src="./resources/points.svg"  alt="" title="A simple 2d point library.">
</figure>

## Swap
<figure>
  <img src="./resources/swap.svg"  alt="" title="Swapping in many forms.">
</figure>

## Covariance (fewer inputs), Contravariance (more outputs)
TODO

## Stateful Iteration Protocols

## Semantic Details

# More Examples

## Fibonacci

Similarly to the recursion example, we can define a Fibonacci function. We define a helper which takes 3 parameters, and then "call" it with n, 1, 1, to start the iteration.

<figure>
  <img src="./resources/fibonacci.svg"  alt="" title="Recursive definition of fibonacci function.">
</figure>

## Exponentiation by Squaring

We can define an efficient exponentiation function.

<figure>
  <img src="./resources/exp_by_squaring.svg"  alt="" title="Recursive implemention of exponentiation by squaring.">
</figure>

## Live Demo Editor with Examples
Our palette contains the built in functions and Pseudofunctions. On the top are the input, output, apply, and pass Pseudofunctions. input and output allow us to explicitly label inputs and outputs and indicate how an input feeds into the circuit. apply connects to a function output of an function and allows us to instantiate that function in the containing circuit. pass takes its input and passes it on, allowing us to add sequencing ability to our circuits.

<figure>
  <img src="./resources/palette.svg"  alt="" title="Palette (Pseudofunctions and primitive computational functions)">
</figure>

[Live Demo](https://billbudge.github.io/WebEditorFramework/examples/functioncharts/)

## Inspiration
Functioncharts were inspired by Harel Statecharts, another graphical representation of programs, which employs hierarchy to give state-transition diagrams more expressive power.

TODO default value adapter.

<figure>
  <img src="/resources/palette2.svg"  alt="" title="Pseudo-functions">
</figure>

So far we haven't used the ability to pass functions as parameters very much. However, they make it possible to express many different things besides expressions. Let's introduce three new stateful functions, which allow us to hold state and "open" values as objects or arrays.

In the top left, we apply the array getter, and pass it as the first operand of an addition. We add pins for the inputs that come from the iteration. This can be grouped and closed to create a function import for our iteration. On the bottom we hook it up, set the range to [0..n-1] and pass an initial 'acc' of 0.

We can combine these primitive functions to compute simple expressions. In the diagrams below, we are creating:

1. An increment by 1.
1. A decrement by 1.
1. A binary minimum and maximum using a relational operator and the conditional operator (note how input junctions are used to tie inputs together.)
1. A 3-ary and 4-ary addition operation by cascading binary additions.

Note that there is fan-out but no fan-in in our circuit graphs. There are no cycles, so the circuit is a DAG (directed acyclic graph). Each circuit function is conceptually a function and wires connect outputs of one function to inputs of another. Evaluation proceeds left-to-right, since inputs must be evaluated before producing outputs. The evaluation order of the graph is only partially ordered (by topologically sorting) so we have to take extra care when a specific sequential evaluation order is required.

Expressions can be used to build more complex diagrams, but this quickly leads to large, unreadable graphs. A better way is to turn expressions into new functions, which allow us to program at a higher level of abstraction. Grouping is how we create new functions. In this diagram, we take the expressions above and group them to form new functions that we can use just like the primitive ones. Each group is a separate context, denoted by a dotted boundary. New functions an be dragged and dropped into the context. Disconnected inputs or outputs become the new function's inputs and outputs. Input and output junctions can be connected to inputs and outputs in order to assign names to them. They can also be used to identify common inputs, since ordinarily each disconnected input leads to a unique group input. The "min" and "max" functions use input junctions this way.

To begin, let's start with simple types.

1. The scalar value type V, which can represent numbers, strings, arrays, or other pure data types.
2. The wildcard type *, which is used by Pseudofunctions that can be wired to any type pin.

Having a single kind of wire that can connect functions makes our circuits simpler, since we don't need any color or pattern scheme to give them a type. They acquire their type from their source and destination connections.

We can use these new functions just like the built in ones to create more complex functions. Here's the sgn function, which takes a single number as input and returns 1 if it's > 0, 0 if it's equal to 0, or -1 if it's less than 0. On the right, we build it from primitive functions. However, it's clearer if we create helper functions: "less than 0" and "greater than 0" functions, and a 5 input conditional.

## Function Abstraction
We have to rebuild these graphs every time we want to create a similar function, for example cascading binary multiplication or logical operations. To make the graph representation more powerful, any function can be abstracted. This adds an input value, of the same type as the function, to indicate that the function is merely a "shell" and the function body is imported. This operation is called "opening" the function. This allows us to create functions that takes other functions as inputs. Here, we use have abstracted two binary addition operations and identified both function inputs to create a cascaded 3-ary operation that takes a single binary function as an additional input.

We can nest function definitions to avoid repetition definitions. Before we stated that any disconnected inputs and outputs become group inputs and outputs. One exception to this rule is when we add instances of the new function to its own context. This allows us to create many interesting things. Here, we create a single abstract binary operation, and then cascade it to create 3-ary, 4-ary, 5-ary, and 6-ary functions by grouping these into nested function definitions.

## Function Creation
Now we need a way to create functions that can be imported. The mechanism is function closure. Any function function can be closed, which creates a function output whose type is all disconnected inputs, and all outputs. This is exactly analogous to function closure in regular programming languages. In the diagram below, we can create an incrementing function by grouping as before, or by partially applying addition to a literal 1 value and closing to get a unary incrementing function.

Function closing is a powerful graph simplification mechanism. Imagine we wanted to apply our quadratic polynomial evaluation function to one polynomial at 4 different x values. Using the grouped expression 4 times leads to a complex graph that is becoming unwieldy. Applying the function to the polynomial coefficients and closing gives a simple unary function that we can apply 4 times, which is easier to understand.

<figure>
  <img src="/resources/function_creation2.png"  alt="" title="Function closing is a powerful graph simplification mechanism">
</figure>

### Generic iteration

Let's try a more typical iteration, equivalent to the following for loop in Javascript. Let's try to add the numbers in the range [0..n].

```js
let acc = 0;
for (let i = 0; i < n; i++) {
	acc += i;
}
return acc;
```

<figure>
  <img src="/resources/iteration.png"  alt="" title="Iteration to add numbers from i to n">
</figure>

Summing an integer range isn't really useful, and it would be cumbersome to have to create these graphs every time we wanted to iterate over a range of integers. But we can abstract the binary operation at the heart of this to create a generic iteration over an integer range that is more useful.

<figure>
  <img src="/resources/iteration2.png"  alt="" title="Iteration to apply binary op to range">
</figure>

Using this more generic function, we can easily create a factorial function.

<figure>
  <img src="/resources/iteration3.png"  alt="" title="Iteration adapted to compute factorial">
</figure>
