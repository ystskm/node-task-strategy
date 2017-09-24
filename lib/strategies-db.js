/***/
var NULL = null, TRUE = true, FALSE = false;
var Emitter = require('events').EventEmitter, util = require('util'), inherits = util.inherits;
var eventDrive = require('event-drive');

var processor = 'function' == typeof setImmediate ? setImmediate: function(fn) {
  process.nextTick(fn);
};

var Default = {
  Ns: 'strategy.strategies'
};

var Event = {
  Ready: 'ready'
};

module.exports = StrategyDb;
function StrategyDb(db, options) {

  var st = this;
  Emitter.call(st);

  st.opts = options || (options = {});
  st.db = db;
  st.ns = options.ns || Default.Ns;

  processor(function() {
    _init(st, 3);
  });

}
inherits(StrategyDb, Emitter);

var SDBProtos = {
  data: data,
  save: save,
  update: update,
  unlink: unlink
};
for( var i in SDBProtos) {
  StrategyDb.prototype[i] = SDBProtos[i];
}

function data(callback) {
  var st = this;
  return st.db.findOne(st.ns, {
    _id: st._id
  }, callback);
}

function save(data, callback) {
  var st = this;
  data._id = st._id, data.stamp = new Date();
  return st.db.save(st.ns, data, callback)
}

function update(data, callback) {
  var st = this;
  data.stamp = new Date();
  return st.db.update(st.ns, {
    _id: st._id
  }, {
    $set: data
  }, callback);
}

function unlink(callback) {
  var st = this;
  var db = st.db, ee = NULL, line = [];
  line.push(function(next) {
    db.remove({
      strategy: st._id
    }, next)
  });
  line.push(function(err) {
    err ? ee.emit('error', err): ee.emit('end');
  });
  return ee = eventDrive(line, callback);
}

function _init(st, num, e) {

  if(num-- <= 0) {
    return processor(function() {
      util.error('[strategy-db]' + (e && e.message));
      st._ready = FALSE, st.emit('error', e);
    });
  }

  st._id = getId(st.opts.identifier);
  st.save({
    state: 'reservation'
  }).on('error', function(e) {

    setTimeout(function() {
      _init(st, num, e);
    }, Math.max(1000 * Math.Random(), 100))

  }).on('end', function() {

    st.save({
      state: 'ready'
    }).on('error', function(e) {
      _init(st, 0, e);
    }).on('end', function() {
      st._ready = TRUE, st.emit(Event.Ready);
    });

  });

}

getId.cnt = NULL, getId.now = NULL;
function getId(prefix) {
  var _now = Date.now();
  if(getId.now != _now) {
    getId.now = _now, getId.cnt = 0;
  }
  return [(prefix || '') + String(getId.now), getId.cnt++].join('-');
}
