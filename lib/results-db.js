/***/
var Emitter = require('events').EventEmitter, util = require('util'), inherits = util.inherits;
var eventDrive = require('event-drive');

var processor = 'function' == typeof setImmediate ? setImmediate: function(fn) {
  process.nextTick(fn);
};

var Default = {
  Ns: 'strategy.results'
};

var Event = {
  Ready: 'ready'
};

module.exports = ResultsDb;
function ResultsDb(db, _id, options) {
  !options && (options = {});
  this.db = db, this._id = _id, this.ns = options.ns || Default.Ns;
}

var RDBProtos = {
  op: op,
  data: data,
  save: save
};
for( var i in RDBProtos)
  ResultsDb.prototype[i] = RDBProtos[i];

function op(fnam, args) {
  return this[fnam].apply(this, args);
}

function data(index_in_strategy, task_id, callback) {
  return this.db.findOne(this.ns, {
    strategy_id: this._id,
    index_in_strategy: index_in_strategy,
    task_id: task_id
  }, function(e, r) {
    e ? callback(e): callback(null, r.task_data);
  });
}

function save(index_in_strategy, task_id, result, callback) {
  var data = {};
  data.strategy_id = this._id, data.index_in_strategy = index_in_strategy;
  data.task_id = task_id, data.result = result, data.stamp = new Date();
  return this.db.save(this.ns, data, callback)
}
