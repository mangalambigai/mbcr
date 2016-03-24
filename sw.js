(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }
  
  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var request = (this._store || this._index)[funcName].apply(this._store, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      request.onupgradeneeded = function(event) {
        if (upgradeCallback) {
          upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
        }
      };

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
  }
  else {
    self.idb = exp;
  }
}());
},{}],2:[function(require,module,exports){
'use strict';

var _idb = require('idb');

var _idb2 = _interopRequireDefault(_idb);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var staticCacheName = 'mbta-static-v1';

/**
 * Install the database
 */
var dbPromise = _idb2.default.open('mbta', 1, function (upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
            var stopTimeStore = upgradeDb.createObjectStore('stoptimes', {
                keyPath: ['tripName', 'stopOrder']
            });
            //this will help get the trip names for the stop.
            stopTimeStore.createIndex('stoptime', ['stopName', 'arrival']);
            //this will help get the stoptimes by tripname
            stopTimeStore.createIndex('tripName', 'tripName');

            var tripStore = upgradeDb.createObjectStore('trips', {
                keyPath: 'tripName'
            });
            var calendarStore = upgradeDb.createObjectStore('calendar', {
                keyPath: 'serviceId'
            });
    }
});

/**
 * Load the data from stop_times_cr.txt to indexedDB
 */
self._processStopTimesData = function (gtfsData) {

    dbPromise.then(function (db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('stoptimes', 'readwrite');
        var stopTimeStore = tx.objectStore('stoptimes');

        allTextLines.forEach(function (line) {
            if (line.trim().length > 0) {
                var entries = line.split(',');
                var tripname = entries[0].replace(/['"]+/g, '');
                //convert to date so we can compare
                var arr = new Date('January 1, 1970 ' + entries[1].replace(/['"]+/g, ''));
                var dep = new Date('January 1, 1970 ' + entries[2].replace(/['"]+/g, ''));
                var stop = entries[3].replace(/['"]+/g, '');
                var stoporder = entries[4].replace(/['"]+/g, '');

                //add the entry to indexDB stoptimes store
                stopTimeStore.put({
                    tripName: tripname,
                    arrival: arr,
                    departure: dep,
                    stopName: stop,
                    stopOrder: stoporder
                });
            }
        });
        return tx.complete;
    }).then(function () {
        console.log('added entries to indexDB stopTimes');
    }).catch(function (error) {
        console.log(error);
    });
};

/**
 * Load the data from trips_cr.txt to indexedDB
 */
self._processTripsData = function (gtfsData) {

    dbPromise.then(function (db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('trips', 'readwrite');
        var tripStore = tx.objectStore('trips');

        allTextLines.forEach(function (line) {
            if (line.trim().length > 0) {
                var entries = line.split(',');
                var routename = entries[0].replace(/['"]+/g, '');
                var servicename = entries[1].replace(/['"]+/g, '');
                var tripname = entries[2].replace(/['"]+/g, '');
                var direction = entries[5].replace(/['"]+/g, '');

                //add the entry to indexDB trips store
                tripStore.put({
                    tripName: tripname,
                    routeName: routename,
                    serviceName: servicename,
                    direction: direction
                });
            }
        });
        return tx.complete;
    }).then(function () {
        console.log('added entries to indexDB trips store');
    }).catch(function (error) {
        console.log(error);
    });
};

/**
 * Load the data from calendar_cr.txt to indexedDB
 */
self._processCalendarData = function (gtfsData) {

    dbPromise.then(function (db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('calendar', 'readwrite');
        var calendarStore = tx.objectStore('calendar');

        allTextLines.forEach(function (line) {
            if (line.trim().length > 0) {
                var entries = line.split(',');
                var servicename = entries[0].replace(/['"]+/g, '');
                var days = [entries[7], //sunday is 0th day in js, but 7th in gtfs
                entries[1], entries[2], entries[3], entries[4], entries[5], entries[6]];

                //add the entry to indexDB calendar store
                calendarStore.put({
                    serviceId: servicename,
                    days: days
                });
            }
        });
        return tx.complete;
    }).then(function () {
        console.log('added entries to indexDB calendar store');
    }).catch(function (error) {
        console.log(error);
    });
};

/**
 * Update the cache on install
 */
self.addEventListener('install', function (event) {
    event.waitUntil(caches.open(staticCacheName).then(function (cache) {
        console.log('Adding cache');
        return cache.addAll(['js/all.js', 'js/lib/angular.min.js', 'css/bootstrapcerulean.css', 'data/stop_times_cr.txt', 'data/trips_cr.txt', 'data/calendar_cr.txt']);
    }).then(function () {
        return Promise.all([
        //get the gtfs -stop_times_cr data, and then store it to indexdb
        caches.match('data/stop_times_cr.txt').then(function (response) {
            return response.text();
        }).then(function (text) {
            return self._processStopTimesData(text);
        }).catch(function (error) {
            console.log('Error storing stop times data to IndexedDb', error);
        }),

        //get the gtfs -trips_cr data, and store it to indexdb
        caches.match('data/trips_cr.txt').then(function (response) {
            return response.text();
        }).then(function (text) {
            return self._processTripsData(text);
        }).catch(function (error) {
            console.log('Error storing trips data to IndexedDb', error);
        }),

        //get the gtfs -calendar_cr data, and store it to indexdb
        caches.match('data/calendar_cr.txt').then(function (response) {
            return response.text();
        }).then(function (text) {
            return self._processCalendarData(text);
        }).catch(function (error) {
            console.log('Error storing calendar data to IndexedDb', error);
        })]);
    }));

    //TODO: add stop.txt data.
});

/**
 * Cleanup cache on activation
 */
self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (cacheNames) {
        return Promise.all(cacheNames.filter(function (cacheName) {
            return cacheName.startsWith('mbta-') && cacheName != staticCacheName;
        }).map(function (cacheName) {
            return caches.delete(cacheName);
        }));
    }));
});

/**
 * Gets the parameter from the url search string
 */
self._getSearchParam = function (searchString, param) {
    var loc = searchString.indexOf(param + '=') + param.length + 1;
    var nextloc = searchString.indexOf('&', loc);
    if (nextloc > -1) {
        return decodeURIComponent(searchString.substr(loc, nextloc - loc));
    } else return decodeURIComponent(searchString.substr(loc));
};

/**
 * Responds with data from cache when the file/data is available
 */
self.addEventListener('fetch', function (event) {
    var requestUrl = new URL(event.request.url);

    if (requestUrl.origin === location.origin) {
        //this is a request for a static resource
        event.respondWith(caches.match(event.request).then(function (response) {
            return response || fetch(event.request);
        }));
    } else {
        //this is a schedule request, try to get from indexDB and also realtime
        if (requestUrl.hostname === 'realtime.mbta.com') {
            if (requestUrl.pathname === '/developer/api/v2/schedulebystop') {

                event.respondWith(
                //We can't fetch as MBTA API doesnt support https
                /*                    fetch(event.request).then( function(response){
                                        return response;
                                    }).catch(function(error) {
                                        return self._getTripIds(requestUrl)
                                        */
                self._getTripIds(requestUrl).then(self._filterTripByDay).then(function (response) {
                    console.log('in _getTripIds response', response);
                    return new Response(JSON.stringify({
                        fromIDB: true,
                        tripIds: response
                    }), { 'Content-Type': 'application/json' });
                }).catch(function (error) {
                    console.log('in _getTripIds error', error);
                    return new Response(JSON.stringify({
                        fromIDB: true,
                        error: error
                    }));
                })

                //})
                );
            } else if (requestUrl.pathname === '/developer/api/v2/schedulebytrip') {
                    event.respondWith(
                    //We can't fetch as MBTA API doesnt support https
                    /*
                    fetch(event.request).then( function(response){
                        return response;
                    }).catch(function(error) {
                        return
                        */
                    self._getScheduleByTrip(requestUrl).then(function (response) {
                        console.log('from sw.js', response);
                        return new Response(JSON.stringify(response), { 'Content-Type': 'application/json' });
                    })
                    //})
                    );
                }
        }
    }
});

/**
 * Returns a promise for the trip ids for the stop for the next max_time hours.
 * stoptimes.txt has the trips - station - arrival and departure times data.
 */
self._getTripIds = function (requestUrl) {
    //console.log('in _getTripIds' , requestUrl);
    return new Promise(function (resolve, reject) {
        // get the stop and max_time (in minutes) from requestUrl
        var stop = self._getSearchParam(requestUrl.search, 'stop');
        var max_time = self._getSearchParam(requestUrl.search, 'max_time');

        var currentDate = new Date();
        var startTime = new Date('January 1, 1970 ' + currentDate.toLocaleTimeString());
        var endTime = new Date(startTime.valueOf() + max_time * 60 * 1000);
        var day = currentDate.getDay();

        //this array will hold the trip ids to be returned
        var tripIds = [];
        dbPromise.then(function (db) {
            var tx = db.transaction(['stoptimes']);
            var stopTimeStore = tx.objectStore('stoptimes');

            var stopIndex = stopTimeStore.index('stoptime');
            var keyRange = IDBKeyRange.bound([stop, startTime], [stop, endTime]);
            stopIndex.openCursor(keyRange).then(function logStop(cursor) {
                if (!cursor) return;
                tripIds.push(cursor.value.tripName);

                return cursor.continue().then(logStop);
            }).then(function () {
                //console.log('_getTripIds resolving with ...', tripIds);
                resolve(tripIds);
            });
        });
    });
};

/**
 * Returns a promise for the list of trips filtered by current day
 * Trips run on the week days specified in calendar.txt
 */
self._filterTripByDay = function (tripIds) {
    return new Promise(function (resolve, reject) {
        //fetch the service id, route id, direction from trips datastore,
        //then fetch the calendar for the service.
        Promise.all(tripIds.map(self._getTripData)).then(function (tripCalendarDatas) {
            //make sure the trip runs on that day
            var currentDate = new Date();
            var day = currentDate.getDay();
            var arrayToReturn = [];

            tripCalendarDatas.forEach(function (tripCalendarData) {
                if (tripCalendarData[1].days[day] === "1") {
                    arrayToReturn.push(tripCalendarData[0]);
                }
            });
            resolve(arrayToReturn);
        });
    });
};

/**
 * Gets trip and calendar data for the trip and returns them
 */
self._getTripData = function (tripName) {
    var tripPromise = dbPromise.then(function (db) {
        var tx = db.transaction(['trips']);
        var tripStore = tx.objectStore('trips');
        return tripStore.get(tripName);
    });
    var calendarPromise = Promise.all([dbPromise, tripPromise]).then(function (param) {
        var db = param[0];
        var tripval = param[1];
        //console.log('value from trip db',tripval);
        var tx = db.transaction(['calendar']);
        var calendarStore = tx.objectStore('calendar');
        return calendarStore.get(tripval.serviceName);
    });
    return Promise.all([tripPromise, calendarPromise]);
};

/**
 * Returns a promise for the trip's schedule
 * stoptimes.txt has the trips - station - arrival and departure times data.
 */
self._getScheduleByTrip = function (requestUrl) {
    return new Promise(function (resolve, reject) {
        var tripId = self._getSearchParam(requestUrl.search, 'trip');
        dbPromise.then(function (db) {
            //console.log('in _getScheduleByTrip', tripId);
            var tx = db.transaction(['stoptimes', 'trips']);
            var tripStore = tx.objectStore('trips');
            var stopTimeStore = tx.objectStore('stoptimes');
            var tripIndex = stopTimeStore.index('tripName');
            Promise.all([tripStore.get(tripId), tripIndex.getAll(tripId)]).then(function (values) {
                var ret = {
                    route_name: values[0].routeName,
                    trip_name: values[0].tripName,
                    direction_name: values[0].direction
                };

                //UI expects the time to be in epoch time (number of seconds)
                var stops = [];
                values[1].forEach(function (stopval) {
                    stops.push({
                        stop_order: stopval.stopOrder,
                        stop_name: stopval.stopName,
                        sch_arr_dt: stopval.arrival.valueOf() / 1000,
                        sch_dep_dt: stopval.departure.valueOf() / 1000
                    });
                });
                //important: sort by stop order! UI depends on it
                stops.sort(function (a, b) {
                    return a.stop_order - b.stop_order;
                });
                ret.stop = stops;
                console.log('values in _getScheduleByTrip', ret);
                resolve(ret);
            });
        });
    });
};
/**
 * Responds to skipWaiting messages from controller
 */
self.addEventListener('message', function (event) {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

},{"idb":1}]},{},[2])


//# sourceMappingURL=sw.js.map
