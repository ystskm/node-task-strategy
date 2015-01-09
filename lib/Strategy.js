/***/
var Emitter = require('events').EventEmitter, util = require('util');
var eventDrive = require('event-drive');

var SDB = require('./strategies-db');
var RDB = require('./results-db'), ODB = require('./oplog-db');
var Tactics = require('./Tactics');

var Default = {
  autostart: true,
  // TODO affective
  autocommit: false,
  //TODO affective
  autorollback: false
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

  var self = this;
  if(options == null)
    options = {};

  this._options = {};
  for( var i in Default)
    this._options[i] = options[i] || Default[i];

  Emitter.call(this);

  this.args = new Array();
  this._tactics = [].concat(tactics);
  this._configs = [].concat(configs);
  this._inherits = {};

  this._index = -1;
  this._tfns = {}, this._sfns = {};

  this._sdb = new SDB(db, {
    identifier: this._options.identifier
  });

  this._sdb.on('ready', function() {
    self._odb = new ODB(db, self.id());
    self._rdb = new RDB(db, self.id());
    self._ready = true, self.emit(Event.Ready);
    self._options.autostart === true && self.next();
  });

}
util.inherits(Strategy, Emitter);

var SProtos = {

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
for( var i in SProtos)
  Strategy.prototype[i] = _wrap(SProtos[i]);

function _wrap(fn) {
  return function() {
    try {
      return fn.apply(this, arguments);
    } catch(e) {
      if(this.__stopby != 'error')
        this.emit(this.__stopby = 'error', e);
      throw e;
    }
  };
}

function bind() {
  this.args = Array.prototype.slice.call(arguments);
  return this;
}

function wrap(fn) {
  var self = this;
  return function() {
    try {
      fn.apply(this, arguments);
    } catch(e) {
      self.fatal(e);
    }
  };
}

function next(signalOk) {

  var self = this, playing = this.now();
  if(signalOk !== true && playing && playing.responsive() === true)
    return playing.response();

  if(this.position() >= 0)
    this.emit(Event.Progress, playing, this.position());

  this.position() == -1 ? this._sdb.save({
    state: State.Processing
  }).on('end', nextTactics): this._sdb.data(function(err, d) {
    if(!d)
      return; // no strategy data
    if(err)
      return strategy.fatal(err);
    d && d.state == State.Processing && nextTactics();
  });

  function nextTactics() {

    var tacticsName = self._tactics[++self._index]
    if(tacticsName == null)
      return self.emit('end')

    var tfn = self._tfns[tacticsName];
    if(typeof tfn != 'function')
      return self.fatal('Not a function tactics: ' + tacticsName + ' ('
        + typeof tfn + ')');

    var sfn = self._sfns[tacticsName], conf = self._configs[self.position()];
    self._playing = new Tactics(self, tacticsName, tfn, sfn, conf);

  }

}

function swapArgs(idx, v) {
  this.args[idx] = v;
}

function setTactics() {
  var self = this;
  Array.prototype.slice.call(arguments).forEach(function(map) {
    for( var i in map)
      self._tfns[i] = map[i];
  });
  return this;
}

function setSignals() {
  var self = this;
  Array.prototype.slice.call(arguments).forEach(function(map) {
    for( var i in map)
      self._sfns[i] = map[i];
  });
  return this;
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

function inherits(k, v) {
  var self = this;
  k && (typeof k == 'object' ? (function() {
    for( var i in k)
      self._inherits[i] = k[i];
  })(): typeof k == 'string' && v != null && (self._inherits[k] = v));
  return typeof k == 'string' ? self._inherits[k]: self._inherits;
}

function op() {
  var fnam = arguments[0], args = Array.prototype.slice.call(arguments, 1);
  return this._odb.op(fnam, args);
}

function re() {
  var fnam = arguments[0], args = Array.prototype.slice.call(arguments, 1);
  return this._rdb.op(fnam, args);
}

function data() {
  return this._sdb.data.apply(this._sdb, arguments);
}

function update() {
  return this._sdb.update.apply(this._sdb, arguments);
}

function fatal(_e) {
  var e = typeof _e == 'string' ? new Error(_e): _e;
  this.__stopby = 'fatal', this.emit('error', e), this._sdb.update({
    state: State.Fatal,
    data: {
      errmsg: e.message,
      estack: e.stack
    }
  });
}

function commit(callback) {
  var self = this, ee = null, line = [];
  line.push(function(next) {
    self._sdb.update({
      state: State.Commit
    }, function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._odb.unlink(function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._sdb.update({
      state: State.Done
    }, function(err) {
      err ? ee.emit('error', err): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}

function rollback(callback) {
  var self = this, ee = null, line = [];
  line.push(function(next) {
    self._sdb.update({
      state: State.Rollback
    }, function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._odb.revert(function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._odb.unlink(function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._sdb.update({
      state: State.Fail
    }, function(err) {
      err ? ee.emit('error', err): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}

function unlink(callback) {
  var self = this, ee = null, line = [];
  line.push(function(next) {
    self._sdb.update({
      state: State.Unlink
    }, function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._odb.unlink(function(err) {
      err ? ee.emit('error', err): next();
    });
  });
  line.push(function(next) {
    self._sdb.unlink(function(err) {
      err ? ee.emit('error', err): ee.emit('end');
    });
  });
  return ee = eventDrive(line, callback);
}
