/***/
var async = require('async'), micropipe = require('micro-pipe');

var State = {
  Processing: 'processing',
  Resolved: 'resolved'
};

module.exports = Tactics;
function Tactics(strategy, name, tfn, sfn, config) {

  this._strategy = strategy, this._name = name;
  this._tfn = tfn, this._sfn = sfn, this._config = config;

  this._state = State.Processing;
  tfn.apply(strategy, strategy.args)

}
var TProtos = {
  name: name,
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
  return this._name;
}

function config(inherits) {
  var v = inherits === true ? this._strategy.inherits(): {};
  for( var i in this._config)
    v[i] = this._config[i];
  return v;
}

function requires(keys) {
  var v = this.optional(keys);
  if(v == null)
    return this._strategy.emit('error', new Error('[' + this.name() + '] "'
      + keys.toString() + '" is not given.'))
  return v;
}

function optional(keys) {
  var v = null, key = null
  keys = [].concat(keys), key = keys.shift();
  v = this._config[key] || this._strategy.inherits(key)
  while(v != null && (key = keys.shift()))
    v = v[key];
  return v;
}

function responsive() {
  return typeof this._sfn == 'function';
}

function response() {

  if(typeof this._sfn != 'function') { // None signal function strategy.
    var errmsg = 'Still incompleted tactics at "' + this.name() + '".';
    return console.warn(errmsg);
  }

  var self = this, args = Array.prototype.slice.call(arguments)
  args.push(_ending), this._sfn.apply(this._strategy, args);

  function _ending(err, result) {

    var strategy = self._strategy;
    if(err)
      return strategy.emit('error', err);

    if(self._state != State.Processing)
      return strategy.emit('error', new Error('Unexpected tactics end: '
        + self.name() + ' (' + self._state + ')'));

    result === true && (function() {
      self._state = State.Resolved, strategy.next(true);
    })();

  }

}

function pipe(arr, callback) {

  var self = this, strategy = this._strategy;
  var inspector = function() {
    var args = Array.prototype.slice.call(arguments), next = args.pop();
    strategy.data(function(err, d) {
      if(err)
        return strategy.fatal(err);
      if(!d)
        return strategy.fatal('Strategy data is not found: ' + strategy.id());
      d.state == 'processing' && next.apply(null, args);
    });
  }

  var line = [];
  arr.forEach(function(fn, i) {
    line.push(strategy.wrap(fn));
    i != arr.length - 1 && line.push(inspector);
  });
  return micropipe(line);

}
