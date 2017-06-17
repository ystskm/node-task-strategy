/***/
var NULL = null, TRUE = true, FALSE = false;
// [task-strategy] Tactics.js

var State = {
  Processing: 'processing',
  Resolved: 'resolved'
};

module.exports = Tactics;
function Tactics(strategy, name, tfn, sfn, config) {

  var tactics = this;
  tactics._strategy = strategy, tactics._name = name;
  tactics._tfn = tfn, tactics._sfn = sfn;
  tactics._config = config || {};
  tactics._state = State.Processing;
  tfn.apply(strategy, strategy.args)

}

var TProtos = {
  name: name,
  alias: alias,
  config: config,
  requires: requires,
  optional: optional,
  response: response,
  responsive: responsive,
  pipe: pipe
};
for( var i in TProtos)
  Tactics.prototype[i] = TProtos[i];

function name() {
  var tactics = this;
  return tactics._name;
}

function alias(v) {
  var tactics = this;
  if(v != NULL) tactics._alias = v;
  return tactics._alias;
}

function config(converter, inherits) {

  var tactics = this, strategy = tactics._strategy;

  // we can use converter, now!
  if(!isFunction(converter)) {
    inherits = converter, converter = NULL;
  }

  // when inherits === true, 
  // also getting strategy memory
  var c = NULL;
  var v = inherits === TRUE ? strategy.inherits(): {};

  for( var i in tactics._config) {
    c = tactics._config[i];
    v[i] = converter ? converter.call(tactics, strategy.id(), c): c;
  }
  return v;

}

function requires(keys) {
  var tactics = this, strategy = tactics._strategy;
  var v = tactics.optional(keys);
  if(v == NULL) {
    return strategy.emit('error', new Error('[' + tactics.name() + '] "'
      + keys.toString() + '" is not given.'));
  }
  return v;
}

function optional(keys) {
  var tactics = this, strategy = tactics._strategy;
  var v = NULL, key = NULL
  keys = [].concat(keys), key = keys.shift();
  v = tactics._config[key] || strategy.inherits(key);
  while (v != NULL && (key = keys.shift())) {
    v = v[key];
  }
  return v;
}

function responsive() {
  var tactics = this;
  return isFunction(tactics._sfn);
}

function response() {

  var tactics = this, strategy = tactics._strategy;
  if(!isFunction(tactics._sfn)) { // None signal function strategy.
    var errmsg = 'Still incompleted tactics at "' + tactics.name() + '".';
    return console.warn(errmsg);
  }

  var args = Array.prototype.slice.call(arguments)
  args.push(_ending);
  tactics._sfn.apply(strategy, args);

  function _ending(er, result) {

    // after update
    if(er) {
      return strategy.emit('error', er);
    }

    var state = tactics._state;
    if(state != State.Processing) {
      return strategy.emit('error', new Error('Unexpected tactics end: '
        + tactics.name() + ' (' + state + ')'));
    }

    if(result === TRUE) {
      tactics._state = State.Resolved;
      strategy.next(TRUE);
    }

  }

}

function pipe(arr, callback) {

  var tactics = this, strategy = tactics._strategy;
  var inspector = function(args) {
    return new Promise(function(rsl, rej) {
      strategy.data(function(er, rd) {

        // console.log('strategy.data() result:', er, rd);
        if(er) {
          return rej(er);
        }

        var st_id = strategy.id();
        if(!rd) {
          return rej('Strategy data is not found: ' + st_id);
        }
        if(rd.state != 'processing') {
          return rej('Unexpected strategy state: ' + rd.state + ', ' + st_id);
        }
        rsl(args);

      });
    });
  }

  var when = Promise.resolve();
  var len = arr.length;
  arr.forEach(function(fn, i) {
    when = when.then(function(args) {
      if(!isArray(args)) args = [];
      return new Promise(function(rsl, rej) {

        var resolve = function() {
          rsl(Array.prototype.slice.call(arguments));
        };
        var reject = function(e) {
          rej(e);
        };
        args.push(resolve, reject);
        return fn.apply(tactics, args);

      }).then(function(next_args) {
        return i == len - 1 ? next_args: inspector(next_args);
      });
    });
  });
  return when.then(function(fin_args) {
    return isFunction(callback) ? callback.apply(tactics, fin_args): fin_args;
  })['catch'](function(e) {
    // always stop all strategy! and not throw error.
    strategy.fatal(e);
  });

}

// --------------------- //
function is(ty, x) {
  return typeof x == ty;
}
function isFunction(x) {
  return is('function', x);
}
function isArray(x) {
  return Array.isArray(x);
}
