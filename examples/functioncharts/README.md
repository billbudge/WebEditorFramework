# Functioncharts: A Graphical Representation for Functional Programs
Functioncharts are an experimental graphical programming language. They are a "node and wire" representation for programs, with values flowing along wires, into elements that perform computation and pass results out along outgoing wires. This example defines an editor for building functioncharts. There is no support for executing and debugging these programs (yet).

"Node and wire" programming systems are nothing new. The two principal innovations that Functioncharts have are:

1. Wires aren't limited to passing simple data types like numbers and strings, but may also pass functions. This gives the diagrams much greater expressive power, similar to a conventional functional programming language. Other programming paradigms like OOP can be expressed by higher order functional programs.

2. Elements aren't limited to a fixed set of primitives like binary addition and multiplication, but may be defined by the user using sub-functioncharts which allow "live grouping" of subcircuits. The sub-functionchart is an editable representation of the new element, allowing us to use a function inside its own definition. This allows recursion, and when structured appropriately, iteration through tail call recursion. Functioncharts may define complete functions, or just partial functions, allowing us to express things like closures.

Since functions can be created and instantiated, more complex programs can be built. This document shows how some common small programs can be built and discusses the potential of this approach for different languages and larger programs.

For our purposes here, we define a simple unitype language like Javascript. This simplifies our diagrams since there is then only one type of pin and wire for the connections.

[Live Demo](https://billbudge.github.io/WebEditorFramework/examples/functioncharts/)

## Simple expressions
Circuit elements for built-in operations can be provided by the language, and combined to form useful expressions. Elements have input and output pins that can be wired together. Input pins can only accept one wire at a time, while an output pin may fan out to multiple elements.

Pseudoelements are used for various roles, but aren't true functions that calculate anything. For now, we have input and output pseudoelements. These specify and potentially assign a name to the inputs and outputs when defining a new element in a functionchart.

Below is a simple example of an sub-functionchart to compute the signum function, which takes a single number x as input and returns 1 if x > 0, 0 if x === 0, or -1 if x < 0. We use the following built in elements:

1) Pseudoelements for the input, 'a', and the output, 'b'.
3) literal elements (0, 1, -1), which have no inputs and output the literal value.
3) binary operators (<, >), which take two input values and output a boolean value.
4) the conditional operator (?), which takes an input value and two generic inputs and outputs the first if the value is true, and the second if the value is false.

The input value x is represented by a pseudoelement, to feed the same value into several function elements. The literals and binary operations have values as inputs and outputs, while the conditional element is more generic, with a single (boolean) value input, and two generic inputs and an output, so it can operate on values or functions.

<figure>
  <img src="./resources/signum.svg"  alt="" title="Signum function.">
</figure>

This diagram is already a little hard to read. We can simplify by defining new elements using child functioncharts to hold elements. For the above example, we can define some very simple primitives (x<0, x>0, and a cascaded conditional operator) that make our function much easier to read. Then we can use the new elements to represent the final signum function, which is also defined in a functionchart so we can use the new function.

<figure>
  <img src="./resources/signum2.svg"  alt="" title="Signum function.">
</figure>

Similarly we can define useful functions like increment, decrement, maximum, minimum, and absolute value. Note the use of the "< 0" function in the abs functionchart.

<figure>
  <img src="./resources/simpleFns.svg"  alt="" title="Comparisons, maximum, minimum, and absolute value.">
</figure>

Since functioncharts can contain instances of themselves, we can define a recursive Factorial (N!) function. The recursion is equivalent to a simple iteration, and in fact this is how the graphs represent iteration.

<figure>
  <img src="./resources/factorial.svg"  alt="" title="Recursive definition of factorial function N!.">
</figure>

We can abstract this a bit by replacing the multiplication element with an abstract binary op. That makes this functionchart look like the a 'fold' or 'reduce' function.

<figure>
  <img src="./resources/factorial2.svg"  alt="" title="Factorial function defined with fold or reduce function.">
</figure>

Similarly, we can define a Fibonacci function. We define a helper which takes 3 parameters, and then "call" it with n, 1, 1, to start the iteration.

<figure>
  <img src="./resources/fibonacci.svg"  alt="" title="Recursive definition of fibonacci function.">
</figure>

Our palette contains the built in elements and pseudoelements. On the top are the input, output, apply, and pass pseudoelements. input and output allow us to explicitly label inputs and outputs and indicate how an input feeds into the circuit. apply connects to a function output of an element and allows us to instantiate that function in the containing circuit. pass takes its input and passes it on, allowing us to add sequencing ability to our circuits.

<figure>
  <img src="./resources/palette.svg"  alt="" title="Palette (pseudoelements and primitive computational elements)">
</figure>


3. Function types, which take input values and produce output values. The primitive addition element has type [VV,V] for example, since it takes two inputs of scalar type and produces a sum with type V.



On the next are the unary and binary functions, and the only 3-ary function, the conditional operator.

In addition there are Pseudoelements, which are used to add information to the graph, but which do not perform computation.

<figure>
  <img src="/resources/palette2.svg"  alt="" title="Pseudo-elements">
</figure>

We can combine these primitive functions to compute simple expressions. In the diagrams below, we are creating:

1. An increment by 1.
1. A decrement by 1.
1. A binary minimum and maximum using a relational operator and the conditional operator (note how input junctions are used to tie inputs together.)
1. A 3-ary and 4-ary addition operation by cascading binary additions.

Note that there is fan-out but no fan-in in our circuit graphs. There are no cycles, so the circuit is a DAG (directed acyclic graph). Each circuit element is conceptually a function and wires connect outputs of one function to inputs of another. Evaluation proceeds left-to-right, since inputs must be evaluated before producing outputs. The evaluation order of the graph is only partially ordered (by topologically sorting) so we have to take extra care when a specific sequential evaluation order is required.

Expressions can be used to build more complex diagrams, but this quickly leads to large, unreadable graphs. A better way is to turn expressions into new functions, which allow us to program at a higher level of abstraction. Grouping is how we create new functions. In this diagram, we take the expressions above and group them to form new functions that we can use just like the primitive ones. Each group is a separate context, denoted by a dotted boundary. New elements an be dragged and dropped into the context. Disconnected inputs or outputs become the new function's inputs and outputs. Input and output junctions can be connected to inputs and outputs in order to assign names to them. They can also be used to identify common inputs, since ordinarily each disconnected input leads to a unique group input. The "min" and "max" functions use input junctions this way.

To begin, let's start with simple types.

1. The scalar value type V, which can represent numbers, strings, arrays, or other pure data types.
2. The wildcard type *, which is used by pseudoelements that can be wired to any type pin.

Having a single kind of wire that can connect elements makes our circuits simpler, since we don't need any color or pattern scheme to give them a type. They acquire their type from their source and destination connections.

We can use these new functions just like the built in ones to create more complex functions. Here's the sgn function, which takes a single number as input and returns 1 if it's > 0, 0 if it's equal to 0, or -1 if it's less than 0. On the right, we build it from primitive functions. However, it's clearer if we create helper functions: "less than 0" and "greater than 0" functions, and a 5 input conditional.

## Function Abstraction
We have to rebuild these graphs every time we want to create a similar function, for example cascading binary multiplication or logical operations. To make the graph representation more powerful, any function can be abstracted. This adds an input value, of the same type as the function, to indicate that the function is merely a "shell" and the function body is imported. This operation is called "opening" the function. This allows us to create functions that takes other functions as inputs. Here, we use have abstracted two binary addition operations and identified both function inputs to create a cascaded 3-ary operation that takes a single binary function as an additional input.

We can nest function definitions to avoid repetition definitions. Before we stated that any disconnected inputs and outputs become group inputs and outputs. One exception to this rule is when we add instances of the new function to its own context. This allows us to create many interesting things. Here, we create a single abstract binary operation, and then cascade it to create 3-ary, 4-ary, 5-ary, and 6-ary functions by grouping these into nested function definitions.

## Function Creation
Now we need a way to create functions that can be imported. The mechanism is function closure. Any function element can be closed, which creates a function output whose type is all disconnected inputs, and all outputs. This is exactly analogous to function closure in regular programming languages. In the diagram below, we can create an incrementing function by grouping as before, or by partially applying addition to a literal 1 value and closing to get a unary incrementing function.

Function closing is a powerful graph simplification mechanism. Imagine we wanted to apply our quadratic polynomial evaluation function to one polynomial at 4 different x values. Using the grouped expression 4 times leads to a complex graph that is becoming unwieldy. Applying the function to the polynomial coefficients and closing gives a simple unary function that we can apply 4 times, which is easier to understand.

<figure>
  <img src="/resources/function_creation2.png"  alt="" title="Function closing is a powerful graph simplification mechanism">
</figure>

## Iteration
Simple iteration over the range [0..n[.
<figure>
  <img src="./resources/iteration.svg"  alt="" title="Simple iteration over the range [0..n[.">
</figure>

Generic iteration with start, end, condition, and step configurable.
<figure>
  <img src="./resources/iteration2.svg"  alt="" title="Generic iteration with start, end, condition, and step configurable.">
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

## State

<figure>
  <img src="./resources/points.svg"  alt="" title="A simple 2d point library.">
</figure>

So far we haven't used the ability to pass functions as parameters very much. However, they make it possible to express many different things besides expressions. Let's introduce three new stateful elements, which allow us to hold state and "open" values as objects or arrays.

In the top left, we apply the array getter, and pass it as the first operand of an addition. We add pins for the inputs that come from the iteration. This can be grouped and closed to create a function import for our iteration. On the bottom we hook it up, set the range to [0..n-1] and pass an initial 'acc' of 0.

## Swap
<figure>
  <img src="./resources/swap.svg"  alt="" title="Swapping in many forms.">
</figure>

## Quicksort

Let's implement Quicksort graphically. Here is the source for a Javascript implementation of Quicksort which does the partition step in place. We'll start by implementing the iterations which advance indices to a pair of out of place elements.

```js
function partition(a, i, j) {
  let p = a[i];
  while (1) {
    while (a[i] < p) i++;
    while (a[j] > p) j--;
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
  <img src="/resources/quicksort.png"  alt="" title="Quicksort partition-in-place loop">
</figure>

<figure>
  <img src="/resources/quicksort2.png"  alt="" title="TODO">
</figure>

<figure>
  <img src="/resources/quicksort3.png"  alt="" title="TODO">
</figure>

<figure>
  <img src="/resources/quicksort4.png"  alt="" title="TODO">
</figure>

<figure>
  <img src="/resources/quicksort5.png"  alt="" title="TODO">
</figure>

<figure>
  <img src="/resources/quicksort6.png"  alt="" title="TODO">
</figure>

## Stateful Iteration Protocols

## Semantic Details

## Inspiration
Functioncharts were inspired by Harel Statecharts, another graphical representation of programs, which employs hierarchy to give state-transition diagrams more expressive power.

