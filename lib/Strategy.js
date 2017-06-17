/***/
var NULL = null, TRUE = true, FALSE = false;
// [task-strategy] Strategy.js

var Emitter = require('events').EventEmitter, util = require('util');
var eventDrive = require('event-drive');

var SDB = require('./strategies-db');
var RDB = require('./results-db'), ODB = require('./oplog-db');
var Tactics = require('./Tactics');

var Default = {

  autostart: TRUE,
  // TODO affective
  autocommit: FALSE,
  // TODO affective
  autorollback: FALSE

};

var Event = {
  Ready: 'ready',
  Progress: 'progress',
  Expect: 'expect',
};

var State = {
  Processing: 'processing',
  Unlink: 'unlink',
  Commit: 'commit',
  Rollback: 'rollback',
  Fatal: 'fatal',
  Done: 'done',
  Fail: 'fail'
};

module.exports = Strategy;
function Strategy(db, tactics, configs, options) {

  var st = this;
  if(options == NULL) {
    options = {};
  }

  st._options = {};
  for( var i in Default) {
    st._options[i] = options[i] || Default[i];
  }

  Emitter.call(st);

  st.args = new Array();
  st._tactics = [].concat(tactics);
  st._configs = [].concat(configs);
  st._inherits = {};

  st._index = -1;
  st._tfns = {}, st._sfns = {};

  st._sdb = new SDB(db, {
    identifier: st._options.identifier
  });

  st._sdb.on('ready', function() {
    st._odb = new ODB(db, st.id());
    st._rdb = new RDB(db, st.id());
    st._ready = TRUE, st.emit(Event.Ready);
    st._options.autostart === TRUE && st.next();
  });

}
util.inherits(Strategy, Emitter);

var StraProtos = {

  bind: bind,
  wrap: wrap,
  next: next,
  swapArgs: swapArgs,
  setTactics: setTactics,
  setSignals: setSignals,

  id: id,
  now: now,
  position: position,
  op: op,
  re: re,
  data: data,
  update: update,
  fatal: fatal,
  inherits: inherits,
  commit: commit,
  rollback: rollback,
  unlink: unlink

};
for( var i in StraProtos)
  Strategy.prototype[i] = _wrap(StraProtos[i]);

function _wrap(fn) {
  var st = this;
  return function() {
    try {
      return fn.apply(this, arguments);
    } catch(e) {

      st.__stopby == 'error' || st.emit(st.__stopby = 'error', e);
      throw e;

    }
  };
}

function bind() {
  var st = this;
  st.args = Array.prototype.slice.call(arguments);
  return st;
}

function wrap(fn) {
  var st = this;
  return function() {
    try {
      fn.apply(this, arguments);
    } catch(e) {
      st.fatal(e);
      // DONNOT throw error not to stop process
    }
  };
}

function next(signalOk) {

  var st = this, playing = st.now();
  if(signalOk !== TRUE && playing && playing.responsive() === TRUE) {
    return playing.response();
  }

  var pos = st.position();
  if(pos >= 0) {
    st.emit(Event.Progress, playing, pos);
  }
  switch(pos) {

  case -1:
    st._sdb.save({
      state: State.Processing
    }).on('end', function() {
      nextTactics();
    });
    return;

  case 0:
  default:
    st._sdb.data(function(er, rd) {

      if(rd == NULL) {
        return; // No strategy data
      }
      if(er) {
        return st.fatal(er);
      }
      if(rd.state == State.Processing) {
        return nextTactics();
      }
      // TODO need some action?

    });
    return;

  }

  function nextTactics() {

    // Goto next index! (pos = +1)
    var tacticsName = st._tactics[pos = (st._index += 1)];
    if(tacticsName == NULL) {
      return st.emit('end');
    }

    // check function state
    var tacticsType;
    var tfn = st._tfns[tacticsName];
    if(!isFunction(tfn)) {
      tacticsType = tacticsName + ' (' + typeof tfn + ')';
      return st.fatal('Not a function tactics: ' + tacticsType);
    }

    // signal function
    var sfn = st._sfns[tacticsName], t_cnf = st._configs[pos];
    st._playing = new Tactics(st, tacticsName, tfn, sfn, t_cnf);
    return;

  }

}

function swapArgs(idx, v) {
  var st = this;
  st.args[idx] = v;
  return st;
}

function setTactics() {
  var st = this;
  Array.prototype.slice.call(arguments).forEach(function(map) {
    for( var i in map)
      st._tfns[i] = map[i];
  });
  return st;
}

function setSignals() {
  var st = this;
  Array.prototype.slice.call(arguments).forEach(function(map) {
    for( var i in map)
      st._sfns[i] = map[i];
  });
  return st;
}

function id() {
  return this._sdb._id;
}

function now() {
  return this._playing;
}

function position() {
  return this._index;
}

function inherits(key, val) {
  var st = this, inherits = st._inherits;
  var k, obj;
  if(key == NULL) {
    return inherits;
  }
  if(val == NULL) {
    if(is('object', key)) {

      obj = key;
      for(k in obj) {
        inherits[k] = obj[k];
      }

    }
  } else {
    if(is('string', key)) {

      k = key;
      if(val != NULL) {
        inherits[k] = val;
      }

    }
  }
  return is('string', key) ? inherits[key]: inherits;
}

function op() {
  var st = this;
  var fnam = arguments[0], args = Array.prototype.slice.call(arguments, 1);
  return st._odb.op(fnam, args);
}

function re() {
  var st = this;
  var fnam = arguments[0], args = Array.prototype.slice.call(arguments, 1);
  return st._rdb.op(fnam, args);
}

function data() {
  var st = this;
  return st._sdb.data.apply(st._sdb, arguments);
}

function update() {
  var st = this;
  return st._sdb.update.apply(st._sdb, arguments);
}

function fatal(e) {

  var st = this;
  var er = is('string', e) ? new Error(e): e;

  st.__stopby = 'fatal';
  st.emit('error', er);

  st._sdb.update({
    state: State.Fatal,
    data: {
      errmsg: er.message,
      estack: er.stack
    }
  });

}

/**
 * 
 * @param callback
 * @returns
 */
function commit(callback) {
  var st = this, ee = NULL, line = [];
  console.log('# ------------ [Strategy] Commit ------------ #');
  line.push(function(next) {
    st._sdb.update({
      state: State.Commit
    }, function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._odb.unlink(function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._sdb.update({
      state: State.Done
    }, function(er) {
      er ? ee.emit('error', er): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}

/**
 * 
 * @param callback
 * @returns
 */
function rollback(callback) {
  var st = this, ee = NULL, line = [];
  console.log('# ------------ [Strategy] Rollback ------------ #');
  line.push(function(next) {
    st._sdb.update({
      state: State.Rollback
    }, function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._odb.revert(function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._odb.unlink(function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._sdb.update({
      state: State.Fail
    }, function(er) {
      er ? ee.emit('error', er): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}

/**
 * 
 * @param callback
 * @returns
 */
function unlink(callback) {
  var st = this, ee = NULL, line = [];
  line.push(function(next) {
    st._sdb.update({
      state: State.Unlink
    }, function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._odb.unlink(function(er) {
      er ? ee.emit('error', er): next();
    });
  });
  line.push(function(next) {
    st._sdb.unlink(function(er) {
      er ? ee.emit('error', er): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}

//--------------------- //
function is(ty, x) {
  return typeof x == ty;
}
function isFunction(x) {
  return is('function', x);
}
function isArray(x) {
  return Array.isArray(x);
}
