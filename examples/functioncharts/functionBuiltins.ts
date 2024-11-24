export const functionBuiltins = {
  'namespaces': [
    { 'name': 'Math',
      'functions': [
        // Static functions
        { 'name': 'abs',
          'typeString' : '[v,v](abs)'
        },
        { 'name': 'ceil',
          'typeString' : '[v,v](ceil)'
        },
        { 'name': 'floor',
          'typeString' : '[v,v](floor)'
        },
        { 'name': 'fround',
          'typeString' : '[v,v](abfrounds)'
        },
        { 'name': 'imul',
          'typeString' : '[v,v](imul)'
        },
        { 'name': 'max',
          'typeString' : '[vv,v](max)'  // TODO var args
        },
        { 'name': 'min',
          'typeString' : '[vv,v](min)'
        },
        { 'name': 'random',
          'typeString' : '[,v](random)'
        },
        { 'name': 'round',
          'typeString' : '[v,v](round)'
        },
        { 'name': 'sgn',
          'typeString' : '[v,v](sgn)'
        },
        { 'name': 'sqrt',
          'typeString' : '[v,v](sqrt)'
        },
        { 'name': 'trunc',
          'typeString' : '[v,v](trunc)'
        },
        // Static literals
        { 'name': 'E',
          'typeString' : '[,v](E)'
        },
        { 'name': 'PI',
          'typeString' : '[,v](PI)'
        },
      ]
    },
    { 'name': 'Array',
      'functions': [
        // Static functions
        { 'name': 'from',
          'typeString' : '[vv(mapFn)v(this),v](from)'
        },
        { 'name': 'isArray',
          'typeString' : '[v,v](isArray)'
        },
        // Instance methods
        { 'name': 'at',
          'typeString' : '[v(a)v(i),v](at)'
        },
        { 'name': 'fill',
          'typeString' : '[v(a)vv(start)v(end),v](fill)'
        },
        { 'name': 'find',
          'typeString' : '[v(a)v(fn)v(this),v](find)'
        },
        { 'name': 'findIndex',
          'typeString' : '[v(a)v(fn)v(this),v](findIndex)'
        },
        { 'name': 'forEach',
          'typeString' : '[v(a)v(fn)v(this),v](forEach)'
        },
        { 'name': 'indexOf',
          'typeString' : '[v(a)v(elem)v(fromIndex),v](indexOf)'
        },
        { 'name': 'lastIndexOf',
          'typeString' : '[v(a)v(elem)v(fromIndex),v](lastIndexOf)'
        },
        { 'name': 'pop',
          'typeString' : '[v(a),v](pop)'
        },
        { 'name': 'push',
          'typeString' : '[v(a)v,v](push)'  // TODO output value?
        },
        { 'name': 'slice',
          'typeString' : '[v(a)v(start)v(end),v](slice)'
        },
        { 'name': 'splice',
          'typeString' : '[v(a)v(start)v(deleteCount)v,v](splice)'  // TODO var args
        },
        // Instance properties
        { 'name': 'length',
          'typeString' : '[v(a),v](length)'
        },
      ]
    }
  ]
};