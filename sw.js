import idb from 'idb';

var staticCacheName = 'mbta-static-v1';

/**
 * Install the database
 */
var dbPromise = idb.open('mbta', 4, function(upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
        case 1:
        case 2:
        case 3:
            var stopTimeStore = upgradeDb.createObjectStore('stoptimes', {
                keyPath: ['tripName', 'stopName']
            });
            stopTimeStore.createIndex('stoptime', ['stopName', 'arrival']);

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

                //add the entry to indexDB stoptimes store
                stopTimeStore.put({
                    tripName: tripname,
                    arrival: arr,
                    departure: dep,
                    stopName: stop
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
                var monday = entries[1].replace(/['"]+/g, '');
                var tuesday = entries[2].replace(/['"]+/g, '');
                var wednesday = entries[3].replace(/['"]+/g, '');
                var thursday = entries[4].replace(/['"]+/g, '');
                var friday = entries[5].replace(/['"]+/g, '');
                var saturday = entries[6].replace(/['"]+/g, '');
                var sunday = entries[7].replace(/['"]+/g, '');

                //add the entry to indexDB calendar store
                calendarStore.put({
                    serviceId: servicename,
                    monday: monday,
                    tuesday: tuesday,
                    wednesday: wednesday,
                    thursday: thursday,
                    friday: friday,
                    saturday: saturday,
                    sunday: sunday
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

    //get the gtfs -stop_times_cr data, and store it to indexdb
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
        if (requestUrl.hostname === 'realtime.mbta.com' && requestUrl.pathname === '/developer/api/v2/schedulebystop') {

            // get the stop and max_time (in minutes) from requestUrl
            var stop = self._getSearchParam(requestUrl.search, 'stop');
            var max_time = self._getSearchParam(requestUrl.search, 'max_time');

            var currentDate = new Date();
            var startTime = new Date('January 1, 1970 ' + currentDate.toLocaleTimeString());
            var endTime = new Date(startTime.valueOf() + max_time * 60 * 1000);
            var day = currentDate.getDay();

            dbPromise.then(function(db) {
                var tx = db.transaction(['stoptimes', 'trips', 'calendar']);
                var stopTimeStore = tx.objectStore('stoptimes');
                var tripStore = tx.objectStore('trips');
                var calendarStore = tx.objectStore('calendar');

                var stopIndex = stopTimeStore.index('stoptime');
                var keyRange = IDBKeyRange.bound([stop, startTime], [stop, endTime]);
                stopIndex.openCursor(keyRange)
                    .then(function logStop(cursor) {
                        if (!cursor)
                            return;
                        //fetch the service id, route id, direction from trips datastore,
                        //then fetch the calendar for the service.
                        //make sure the trip runs on that day
                        var data = self._getTripData(tripStore, calendarStore, cursor.value.tripName, day);

                        console.log(cursor.value.tripName);

                        return cursor.continue().then(logStop);
                    }).then(function() {
                        console.log('done cursoring');
                    });
            });
        }
    }

});

/**
 * Gets trip and calendar data and ensures its available for today
 */
self._getTripData = function(tripStore, calendarStore, tripName, day) {
    dbPromise.then(function(db){
        return tripStore.get(tripName);
    }).then(function(tripval) {
        console.log('value from trip db',tripval);
        return calendarStore.get(tripval.serviceName);
    }).then(function(calendarval) {
        console.log(calendarval);
    })

};
/**
 * Responds to skipWaiting messages from controller
 */
self.addEventListener('message', function(event) {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});