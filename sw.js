import idb from 'idb';

var staticCacheName = 'mbta-static-v4';

var dbPromise = idb.open('mbta-db', 1, function(upgradeDb) {
  switch(upgradeDb.oldVersion) {
    case 0:
      var tripStore = upgradeDb.createObjectStore('trips', {keyPath: 'tripName'});
      tripStore.createIndex('stop', 'stopName');
  }
});

self._processGTFSData = function(gtfsData) {

  dbPromise.then(function(db){
    var allTextLines = gtfsData.split(/\r\n|\n/);

    var tx = db.transaction('trips', 'readwrite');
    var tripStore = tx.objectStore('trips');

    allTextLines.forEach(function(line) {
      var entries = line.split(',');
      var tripname = entries[0];
      var arr = entries[1];
      var dep = entries[2];
      var stop = entries[3];

      //add the entry to indexDB trips db
      tripStore.put({tripName: tripname, arrival: arr, departure: dep, stop: stopName});

      //TODO: add the entry to indexDB stops

    });
    return tx.complete;
  }).then(function() {
    console.log('added entries to indexDB trips');
  }).error(function(error) {
    console.log(error);
  });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(staticCacheName).then(function(cache) {
      return cache.addAll([
        '/',
        'js/all.js',
        'css/bootstrapcerulean.css',
        'stop_times_dev.txt'
        ]);
    })
  );

  //TODO: get gtfs data here and store to indexdb
  event.waitUntil(
    caches.match('stop_times_dev.txt')
    .then(function(response) {
      return response.text();
    }).then(function(text) {
      console.log(text);
      return  self._processGTFSData(text);
    }).catch(function(error) {
      console.log(error);
    })
  );

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


self.addEventListener('fetch', function(event) {
  var requestUrl = new URL(event.request.url);
  //console.log(requestUrl);

  if (requestUrl.origin === location.origin) {
    //this is a request for a static resource
    event.respondWith(
      caches.match(event.request).then(function(response) {
        return response || fetch(event.request);
      })
    );
  }
  else
  {
    //this is a schedule request, try to get from indexDB and also realtime

  }

});


