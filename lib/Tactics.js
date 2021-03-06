/***/
var NULL = null, TRUE = true, FALSE = false;
// [task-strategy] Tactics.js

var Event = {
  
};

var State = {
  Processing: 'processing',
  Resolved: 'resolved'
};

var TacticsProtos;
Object.keys(TacticsProtos = {
  
  name: name,
  alias: alias,
  config: config,
  requires: requires,
  optional: optional,
  response: response,
  responsive: responsive,
  pipe: pipe
  
}).forEach(function(k) {
  Tactics.prototype[k] = TacticsProtos[k];
});

Tactics.Event = Event;
Tactics.State = State;
module.exports = Tactics;
function Tactics(strategy, name, tfn, sfn, config) {

  var tactics = this;
  tactics._strategy = strategy, tactics._name = name;
  tactics._tfn = tfn, tactics._sfn = sfn;
  tactics._config = config || {};
  tactics._state = State.Processing;
  tfn.apply(strategy, strategy.args)

}

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
  var e;
  if(v == NULL) {
    e = new Error('[' + tactics.name() + '] "' + keys.toString() + '" is not given.');
    return strategy.emit('error', e);
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

/**
 * @explain Execute signal function and move next if satisfied (result=true)
 * @returns
 */
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

      console.log(new Date().toGMTString() + ' - !!!!! UNEXPECTED TACTICS END AND MAY THROW ERROR !!!!!');
      console.log('Tactics is already changed with state=' + state);
      console.log('  name:', tactics.name(), ', result:', result, ', error:', er);
      // return strategy.emit('error', new Error('Unexpected tactics end: ' + tactics.name() + ' (' + state + ')'));
      
    }

    if(result === TRUE) {
      tactics._state = State.Resolved;
      strategy.next(TRUE);
    }

  }

}

/**
 * @explain Execute any process which are stacked in <Array>arr.
 * @param arr
 * @param callback
 * @returns
 */
function pipe(arr, callback) {

  var tactics = this, strategy = tactics._strategy;
  var inspector = function(args, prog) {
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
        if(rd.state != Tactics.StrategyState.Processing) {
          
          console.log('Strategy is already changed with state=' + rd.state);
          console.log('  position:', prog, ', next_args:', args);
          console.log(rd);
          // return rej('Unexpected strategy state: ' + rd.state + ', ' + st_id);
          
        }
        rsl(args);

      });
    });
  }

  var when = Promise.resolve();
  var len = arr.length;
  arr.forEach(function(proc, proc_idx) {
    when = when.then(function(args) {
      if( !isArray(args) ) { args = []; }
      return new Promise(function(rsl, rej) {

        var resolve = function() {
          rsl(Array.prototype.slice.call(arguments));
        };
        var reject = function(e) {
          rej(e);
        };
        args.push(resolve, reject);
        return proc.apply(tactics, args);

      }).then(function(next_args) {
        return proc_idx == len - 1 ? next_args: inspector( next_args, [proc_idx + 1, len].join('/') );
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
