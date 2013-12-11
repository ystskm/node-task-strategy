#grunt-q
  
[![Version](https://badge.fury.io/js/task-strategy.png)](https://npmjs.org/package/task-strategy)
[![Build status](https://travis-ci.org/ystskm/node-task-strategy.png)](https://travis-ci.org/ystskm/node-task-strategy)
  
Database rollback supported task strategy.  
A *strategy* is made by one or more *tactics*, and a *tactics* is made by one or more *tasks*.  
You can write *tasks* without care about the others.

## Install

Install with [npm](http://npmjs.org/):

    npm install task-strategy

## Example code
An example for executing a strategy.
```js
var Strategy = require('task-strategy').Strategy

// create new strategy
var strategy = new Strategy(db, tactics, configs);

// it's very simple execute
strategy.on('progress', function() {
  strategy.position() === 0
    && console.log('End of the first tactics.')
  strategy.next();
}).on('error', function(){
  // rollback acts for backup datas and remove strategy session.
  strategy.rollback().on('error', function(e){
    console.log('fatal error occurs. rollback failed.', e);
  }).on('end', function(){
    console.log('strategy: ' + strategy._id + ' is rollback ended.');
  });
}).on('end', function(){
  // commit acts for remove strategy session and backup datas
  strategy.commit().on('error', function(e) {
    console.log('fatal error occurs. commit failed.', e);
  }).on('end', function(){
    console.log('strategy: ' + strategy._id + ' completed.');
  });
});
```
And you can check the task condition easily
```js
strategy.get(function(tactics){
  console.log('Now executing tactics: ' + tactics.name());
});
```
## API - creating queues
###Query
```js
q = gruntQ([options])
```

###Arguments  
**options** ( Number | Array | Object ) `{q:1}` optional  
Options for creating queues.  
_If a Number or an Array is given, it treats as value of **q**_  
- __q__ (Number|Object|Array): statuses of queue(s) creating  
    `4`	Create four queues with from rank 0 (lowest) to rank 3 (high)  
    `{ maxQueue: 8 }`	Create a queue  with rank 0, max queue count 8.  
    `[{}, { maxQueue: 4 }]`	A queue with rank 0, unlimited queue count and a queue with rank 1, max queue count 4 will be created.  
  
- __maxWorker__ (Number|Boolean): max worker count for execute tasks. it is limited by the number of cpus.
    `2`	two workers will be created if the number of cpus >= 2.  
    `true`, `null` or `undefined`	`require('os').cpus()` workers will be created.  
    `false`	not using child_process to execute task.  

###Events  
A grunt-q is an instance of EventEmitter.  
  
type `ready`  
  Emits when queue(s) are ready.  
  ```
  q.on('ready', function(){ ... } );
  ```
  
type `progress`  
  Emits when progress to next task.  
  ```
  q.on('progress', function(task_id, task){ ... } );
  ```
type `error`  
  Emits when some error occurs.  
  ```
  q.on('error', function(err, [task]){ ... } );
  ```
  
Other events are bridged from __grunt-runner__ as type `data`.  
type `data`
  Emits when some error occurs.  
  ```
  q.on('data', function(type, args){ ... } );
  ```
  
See [readme](https://github.com/ystskm/node-grunt-runner/blob/master/README.md) for more information about other events.

## API - enqueue a task
###Query
```js
q.enqueue([pkg_file_path,] task_configuration [, options][, callback]);
```
_Note that you can `.enqueue()` without waiting event `ready`._  
_Before ready, tasks are waiting ready automatically._  
  
###Arguments
**pkg_file_path** ( String ) `package.json` _optional_  
Specify the task package file. It's _optional_ because it's not required that you
 take a time for writing `package.json`.  
```js
q.enqueue('package-for-task1.json', {(some configuration)});
/* contents of package-for-task1.json:
  { "name": "task1", "taskList": ["subtask1", "subtask2"] }
*/
```
or, you can write this alternatively
```js
q.enqueue({
    pkg: {name: 'task1', taskList: ['subtask1', 'subtask2']}
  , (some configuration)
});
```
  
