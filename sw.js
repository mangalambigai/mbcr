import idb from 'idb';

var staticCacheName = 'mbta-static-v5';

var dbPromise = idb.open('mbta-db', 5, function(upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
        case 1:
        case 2:
        case 3:
            var tripStore = upgradeDb.createObjectStore('trips', {
                keyPath: ['tripName', 'stopName']
            });
        case 4:
            var tripStore1 = upgradeDb.transaction.objectStore('trips');
            tripStore1.createIndex('stoptime', ['stopName', 'arrival']);
    }
});

self._processGTFSData = function(gtfsData) {

    dbPromise.then(function(db) {
        var allTextLines = gtfsData.split(/\r\n|\n/);

        var tx = db.transaction('trips', 'readwrite');
        var tripStore = tx.objectStore('trips');

        allTextLines.forEach(function(line) {
            var entries = line.split(',');
            var tripname = entries[0].replace(/['"]+/g, '');
            //convert to date so we can compare
            var arr = new Date('January 1, 1970 ' + entries[1].replace(/['"]+/g, ''));
            var dep = new Date('January 1, 1970 ' + entries[2].replace(/['"]+/g, ''));
            var stop = entries[3].replace(/['"]+/g, '');

            //add the entry to indexDB trips db
            tripStore.put({
                tripName: tripname,
                arrival: arr,
                departure: dep,
                stopName: stop
            });
        });
        return tx.complete;
    }).then(function() {
        console.log('added entries to indexDB trips');
    }).catch(function(error) {
        console.log(error);
    });
};

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(staticCacheName).then(function(cache) {
            return cache.addAll([
                '/',
                'js/all.js',
                'css/bootstrapcerulean.css',
                'stop_times_cr.txt'
            ]);
        })
    );

    //get the gtfs -stop_times_cr data1 here, and store all the data to indexdb
    event.waitUntil(
        caches.match('stop_times_cr.txt')
        .then(function(response) {
            return response.text();
        }).then(function(text) {
            return self._processGTFSData(text);
        }).catch(function(error) {
            console.log(error);
        })
    );

    //TODO: addghghg stop.txt, trips.txt, and calendar.txt data.

});

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

self._getSearchParam = function(searchString, param) {
    var loc = searchString.indexOf(param + '=') + param.length + 1;
    var nextloc = searchString.indexOf('&', loc);
    if (nextloc > -1) {
        return searchString.substr(loc, nextloc - loc);
    } else
        return searchString.substr(loc);
};

self.addEventListener('fetch', function(event) {
    var requestUrl = new URL(event.request.url);
    //console.log('in fetch',requestUrl);

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

            dbPromise.then(function(db) {
                var tx = db.transaction('trips');
                var tripStore = tx.objectStore('trips');
                var stopIndex = tripStore.index('stoptime');
                var keyRange = IDBKeyRange.bound([stop, startTime], [stop, endTime]);
                stopIndex.openCursor(keyRange)
                    .then(function logStop(cursor) {
                        if (!cursor)
                            return;

                        console.log(cursor.value.tripName, cursor.value.stopName, cursor.value.arrival);

                        return cursor.continue().then(logStop);
                    }).then(function() {
                        console.log('done cursoring');
                    });
            });
        }
    }

});

self.addEventListener('message', function(event) {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});