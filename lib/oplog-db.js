/***/
var async = require('async'), eventDrive = require('event-drive');

var Default = {
  Ns: 'strategy.oplog'
}

var Support = ['save', 'update', 'insert', 'remove'];

module.exports = OplogDb;
function OplogDb(db, _id, options) {
  !options && (options = {});
  this.db = db, this._id = _id, this.ns = options.ns || Default.Ns;
}

var ODProtos = {
  op: op,
  save: save,
  update: update,
  insert: insert,
  remove: remove,
  revert: revert,
  unlink: unlink
};
for( var i in ODProtos)
  OplogDb.prototype[i] = ODProtos[i];

function op(fnam, args) {
  var unsupported = Support.indexOf(fnam) == -1;
  if(unsupported)
    return this.db[fnam].apply(this.db, args);
  return this[fnam].apply(this, args);
}

function save() {

  var args = Array.prototype.slice.call(arguments);
  /* collection, document, options, callback */

  var document = args[1];
  if(document._id == null)
    return this.insert.apply(this, args);

  args = [args[0], {
    _id: document._id
  }].concat(args.slice(1));
  return this.update.apply(this, args);

}

function update(ns, selector, data, options, callback) {

  if(typeof options == 'function')
    callback = options, options = {};
  else if(typeof selector == 'function')
    callback = selector, options = {}, selector = {};

  if(!selector)
    selector = {};

  var self = this, db = this.db, ee = eventDrive(null, callback);
  var line = _modifyDatasBackupProcess(self, ee, ns, selector);

  line.push(function(next) {
    db.update(ns, selector, data, options).on('error', function(e) {
      ee.emit('error', e)
    }).on('end', function() {
      ee.emit('end');
    });
  });

  return ee.emit('trigger', line), ee;

}

function insert(ns, data, options, callback) {

  if(typeof options == 'function')
    callback = options, options = {};

  var self = this, db = this.db, ee = eventDrive(null, callback);
  var line = [];

  line.push(function(next) {
    db.insert(ns, data, options).on('error', function(e) {
      ee.emit('error', e)
    }).on('end', next);
  });

  _newDatasMarkingProcess(self, ee, ns, data).forEach(function(fn) {
    line.push(fn);
  });

  line.push(function() {
    ee.emit('end');
  });

  return ee.emit('trigger', line), ee;

}

function remove(ns, selector, options, callback) {

  if(typeof options == 'function')
    callback = options, options = {};
  else if(typeof selector == 'function')
    callback = selector, options = {}, selector = {};

  if(!selector)
    selector = {};

  var self = this, db = this.db, ee = eventDrive(null, callback);
  var line = _modifyDatasBackupProcess(self, ee, ns, selector);

  line.push(function(next) {
    db.remove(ns, selector, options).on('error', function(e) {
      ee.emit('error', e)
    }).on('end', function() {
      ee.emit('end');
    });
  });

  return ee.emit('trigger', line), ee;

}

function unlink(callback) {
  var self = this, db = this.db, ee = null;
  var line = [];
  line.push(function(next) {
    db.remove(self.ns, {
      strategy: self._id
    }, next)
  });
  line.push(function(err) {
    err ? ee.emit('error', err): ee.emit('end');
  });
  return ee = eventDrive(line, callback);
}

function revert(callback) {
  var self = this, db = this.db, ee = null;
  var line = [];

  line.push(function(next) {
    db.find(self.ns, {
      strategy: self._id
    }, {
      sort: {
        stamp: -1
      }
    }, function(err, docs) {
      console.log('TaskStrategy:revert()', err, docs);
      err ? ee.emit('error', err): next(docs)
    });
  });

  line.push(function(docs, next) {
    var tasks = [];
    docs.forEach(function(doc) {
      tasks.push(doc.type == 'update' ? function(callback) {
        db.save(doc.ns, doc.data, callback)
      }: function(callback) {
        db.remove(doc.ns, {
          _id: doc.data
        }, callback);
      });
    });
    async.parallel(tasks, function(err, results) {
      err ? ee.emit('error', err): ee.emit('end');
    });
  });

  return ee = eventDrive(line, callback);
}

function _modifyDatasBackupProcess(self, ee, ns, selector) {

  var db = self.db;
  var line = [], target = [];

  line.push(function(next) {
    db.find(ns, selector, function(err, docs) {
      err ? ee.emit('error', err): next(docs);
    });
  });

  line.push(function(docs, next) {
    var tasks = [];
    (target = docs).forEach(function(doc) {
      tasks.push(function(callback) {
        db.findOne(self.ns, {
          strategy: self._id,
          'data._id': doc._id,
          ns: ns
        }, callback);
      });
    });
    async.parallel(tasks, function(err, results) {
      err ? ee.emit('error', err): next(results);
    });
  });

  line.push(function(results, next) {
    var tasks = [];
    results.forEach(function(result, i) {
      !result && tasks.push(function(callback) {
        db.save(self.ns, {
          strategy: self._id,
          type: 'update',
          ns: ns,
          data: target[i],
          stamp: new Date()
        }, callback);
      });
    });
    async.parallel(tasks, function(err) {
      err ? ee.emit('error', err): next();
    });
  });

  return line;

}

function _newDatasMarkingProcess(self, ee, ns, data) {

  var db = self.db;
  var line = [];

  line.push(function(next) {
    self.db.findOne(ns, data, function(err, obj) {
      err ? ee.emit('error', err): next(obj._id);
    });
  });

  line.push(function(_id, next) {
    db.save(self.ns, {
      strategy: self._id,
      type: 'insert',
      ns: ns,
      data: _id,
      stamp: new Date()
    }, function(err) {
      err ? ee.emit('error', err): next();
    });
  });

  return line;

}
