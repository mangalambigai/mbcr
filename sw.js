import idb from 'idb';

var staticCacheName = 'mbta-static-v1';

/**
 * Install the database
 */
var dbPromise = idb.open('mbta', 1, function(upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
            var stopTimeStore = upgradeDb.createObjectStore('stoptimes', {
                keyPath: ['tripName', 'stopOrder']
            });
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
self._processStopTimesData = function(gtfsData) {

    dbPromise.then(function(db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('stoptimes', 'readwrite');
        var stopTimeStore = tx.objectStore('stoptimes');

        allTextLines.forEach(function(line) {
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
    }).then(function() {
        console.log('added entries to indexDB stopTimes');
    }).catch(function(error) {
        console.log(error);
    });
};

/**
 * Load the data from trips_cr.txt to indexedDB
 */
self._processTripsData = function(gtfsData) {

    dbPromise.then(function(db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('trips', 'readwrite');
        var tripStore = tx.objectStore('trips');

        allTextLines.forEach(function(line) {
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
    }).then(function() {
        console.log('added entries to indexDB trips store');
    }).catch(function(error) {
        console.log(error);
    });
};

/**
 * Load the data from calendar_cr.txt to indexedDB
 */
self._processCalendarData = function(gtfsData) {

    dbPromise.then(function(db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('calendar', 'readwrite');
        var calendarStore = tx.objectStore('calendar');

        allTextLines.forEach(function(line) {
            if (line.trim().length > 0) {
                var entries = line.split(',');
                var servicename = entries[0].replace(/['"]+/g, '');
                var days = [
                    entries[7], //sunday is 0th day in js, but 7th in gtfs
                    entries[1],
                    entries[2],
                    entries[3],
                    entries[4],
                    entries[5],
                    entries[6],
                    ];

                //add the entry to indexDB calendar store
                calendarStore.put({
                    serviceId: servicename,
                    days: days
                });
            }
        });
        return tx.complete;
    }).then(function() {
        console.log('added entries to indexDB calendar store');
    }).catch(function(error) {
        console.log(error);
    });
};

/**
 * Update the cache on install
 */
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(staticCacheName).then(function(cache) {
            return cache.addAll([
                '/',
                'js/all.js',
                'js/lib/angular.min.js',
                'css/bootstrapcerulean.css',
                'data/stop_times_cr.txt',
                'data/trips_cr.txt',
                'data/calendar_cr.txt'
            ]);
        })
    );

    //get the gtfs -stop_times_cr data, and then store it to indexdb
    event.waitUntil(
        caches.match('data/stop_times_cr.txt')
        .then(function(response) {
            return response.text();
        }).then(function(text) {
            return self._processStopTimesData(text);
        }).catch(function(error) {
            console.log('Error storing stop times data to IndexedDb', error);
        })
    );

    //get the gtfs -trips_cr data, and store it to indexdb
    event.waitUntil(
        caches.match('data/trips_cr.txt')
        .then(function(response) {
            return response.text();
        }).then(function(text) {
            return self._processTripsData(text);
        }).catch(function(error) {
            console.log('Error storing trips data to IndexedDb', error);
        })
    );

    //get the gtfs -calendar_cr data, and store it to indexdb
    event.waitUntil(
        caches.match('data/calendar_cr.txt')
        .then(function(response) {
            return response.text();
        }).then(function(text) {
            return self._processCalendarData(text);
        }).catch(function(error) {
            console.log('Error storing calendar data to IndexedDb', error);
        })
    );
    //TODO: add stop.txt data.

});

/**
 * Cleanup cache on activation
 */
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(cacheName) {
                    return cacheName.startsWith('mbta-') &&
                        cacheName != staticCacheName;
                }).map(function(cacheName) {
                    return caches.delete(cacheName);
                })
            );
        })
    );
});

/**
 * Gets the parameter from the url search string
 */
self._getSearchParam = function(searchString, param) {
    var loc = searchString.indexOf(param + '=') + param.length + 1;
    var nextloc = searchString.indexOf('&', loc);
    if (nextloc > -1) {
        return searchString.substr(loc, nextloc - loc);
    } else
        return searchString.substr(loc);
};

/**
 * Responds with data from cache when the file/data is available
 */
self.addEventListener('fetch', function(event) {
    var requestUrl = new URL(event.request.url);

    if (requestUrl.origin === location.origin) {
        //this is a request for a static resource
        event.respondWith(
            caches.match(event.request).then(function(response) {
                return response || fetch(event.request);
            })
        );
    } else {
        //this is a schedule request, try to get from indexDB and also realtime
        if (requestUrl.hostname === 'realtime.mbta.com') {
            if( requestUrl.pathname === '/developer/api/v2/schedulebystop') {
                event.respondWith(
                    self._getTripIds(requestUrl)
                    .then(self._filterTripByDay)
                    .then(function(response) {
                        return new Response(JSON.stringify({
                            fromIDB:true,
                            tripIds: response
                        }), {'Content-Type': 'application/json'});
                    })
                );
            } else if (requestUrl.pathname === '/developer/api/v2/schedulebytrip') {
                event.respondWith(
                    self._getScheduleByTrip(requestUrl)
                    .then(function(response) {
                        console.log('from sw.js', response);
                        return new Response(
                            JSON.stringify( response ),
                            {'Content-Type': 'application/json'}
                        );
                    })
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
    return new Promise( function (resolve, reject) {
        // get the stop and max_time (in minutes) from requestUrl
        var stop = self._getSearchParam(requestUrl.search, 'stop');
        var max_time = self._getSearchParam(requestUrl.search, 'max_time');

        var currentDate = new Date();
        var startTime = new Date('January 1, 1970 ' + currentDate.toLocaleTimeString());
        var endTime = new Date(startTime.valueOf() + max_time * 60 * 1000);
        var day = currentDate.getDay();

        //this array will hold the trip ids to be returned
        var tripIds=[];
        dbPromise.then(function(db) {
            var tx = db.transaction(['stoptimes']);
            var stopTimeStore = tx.objectStore('stoptimes');

            var stopIndex = stopTimeStore.index('stoptime');
            var keyRange = IDBKeyRange.bound([stop, startTime], [stop, endTime]);
            stopIndex.openCursor(keyRange)
            .then(function logStop(cursor) {
                if (!cursor)
                    return;
                tripIds.push(cursor.value.tripName);

                return cursor.continue().then(logStop);
            }).then(function() {
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
self._filterTripByDay = function(tripIds) {
    return new Promise(function(resolve, reject) {
        //fetch the service id, route id, direction from trips datastore,
        //then fetch the calendar for the service.
        Promise.all(tripIds.map(self._getTripData))
        .then(function(tripCalendarDatas) {
            //make sure the trip runs on that day
            var currentDate = new Date();
            var day = currentDate.getDay();
            var arrayToReturn = [];

            tripCalendarDatas.forEach(function(tripCalendarData) {
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
self._getTripData = function( tripName ) {
    var tripPromise = dbPromise.then(function(db) {
        var tx = db.transaction(['trips']);
        var tripStore = tx.objectStore('trips');
        return tripStore.get(tripName);
    });
    var calendarPromise = Promise.all([dbPromise, tripPromise]).then(function(param) {
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
self._getScheduleByTrip = function(requestUrl){
    return new Promise( function (resolve, reject) {
        var tripId = self._getSearchParam(requestUrl.search, 'trip');
        dbPromise.then(function(db) {
            //console.log('in _getScheduleByTrip', tripId);
            var tx = db.transaction(['stoptimes', 'trips']);
            var tripStore = tx.objectStore('trips');
            var stopTimeStore = tx.objectStore('stoptimes');
            var tripIndex = stopTimeStore.index('tripName');
            Promise.all( [tripStore.get(tripId), tripIndex.getAll(tripId)])
            .then(function (values) {
                var ret = {
                    route_name: values[0].routeName,
                    trip_name: values[0].tripName,
                    direction_name: values[0].direction,
                };

                //UI expects the time to be in epoch time (number of seconds)
                var stops = [];
                values[1].forEach(function(stopval) {
                    stops.push({
                        stop_order: stopval.stopOrder,
                        stop_name: stopval.stopName,
                        sch_arr_dt: stopval.arrival.valueOf()/1000,
                        sch_dep_dt: stopval.departure.valueOf()/1000
                    });
                });
                //important: sort by stop order! UI depends on it
                stops.sort(function(a,b){
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
self.addEventListener('message', function(event) {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});