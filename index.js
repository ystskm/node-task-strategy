/***/
// [node-strategy] index.js
if(typeof Promise == 'undefined') {
  global.Promise = require('es6-promise').Promise; // require es6-promise
}
exports.Strategy = require('./lib/Strategy');
