/***/
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

  var self = this;
  Emitter.call(this);

  this.opts = options || (options = {});
  this.db = db, this.ns = options.ns || Default.Ns;

  processor(function() {
    _init(self, 3);
  });

}
inherits(StrategyDb, Emitter);

var SDBProtos = {
  data: data,
  save: save,
  update: update,
  unlink: unlink
};
for( var i in SDBProtos)
  StrategyDb.prototype[i] = SDBProtos[i];

function data(callback) {
  return this.db.findOne(this.ns, {
    _id: this._id
  }, callback);
}

function save(data, callback) {
  data._id = this._id, data.stamp = new Date();
  return this.db.save(this.ns, data, callback)
}

function update(data, callback) {
  data.stamp = new Date();
  return this.db.update(this.ns, {
    _id: this._id
  }, {
    $set: data
  }, callback);
}

function unlink(callback) {
  var self = this, db = this.db, ee = null, line = [];
  line.push(function(next) {
    db.remove({
      strategy: self._id
    }, next)
  });
  line.push(function(err) {
    err ? ee.emit('error', err): ee.emit('end');
  });
  return ee = eventDrive(line, callback);
}

function _init(self, num, e) {

  if(num-- <= 0)
    return processor(function() {
      util.error('[strategy-db]' + (e && e.message));
      self._ready = false, self.emit('error', e);
    });

  self._id = getId(self.opts.identifier), self.save({
    state: 'reservation'
  }).on('error', function(e) {

    setTimeout(function() {
      _init(self, num, e);
    }, Math.max(1000 * Math.Random(), 100))

  }).on('end', function() {

    self.save({
      state: 'ready'
    }).on('error', function(e) {
      _init(self, 0, e);
    }).on('end', function() {
      self._ready = true, self.emit(Event.Ready);
    });

  });

}

getId.cnt = null, getId.now = null;
function getId(prefix) {
  var _now = Date.now();
  if(getId.now != _now)
    getId.now = _now, getId.cnt = 0;
  return [prefix || '', getId.now, getId.cnt++].join('');
}
