# Offline first web app for MBTA commuter rail schedule

Uses the following:

1. Bootstrap
2. Angular js
3. ServiceWorker
4. Promises
5. IndexedDB

# To run:

```
npm install
gulp
```

# To test:

1. Launch the app in chrome. This will install the service worker. However, as the service worker did not launch this page, it is not yet ready to cache the routes that user browses.
2. Refresh the page - or navigate to a different site and come back. This will launch the page using service worker.
3. Now, select starting and destination stations and view schedules. Please make sure you see atleast 1 trip's timings. This will cache that particular route's stop times.
4. Turn off the network connection, and visit the page, and search for any stations in the route you already searched. The page will display offline data from indexeddb.

# About GTFS data:

Format of records in stop_times.txt is :

```
"trip_id","arrival_time","departure_time","stop_id","stop_sequence","stop_headsign","pickup_type","drop_off_type"
```
There are 12 stop_times_*.txt files in data folder. They have the extracted data for specific commuter rail routes, so the service worker doesn't have to go back and forth the files to cache the stop times.

Format of records in trips.txt is:

```
"route_id","service_id","trip_id","trip_headsign","trip_short_name","direction_id","block_id","shape_id","wheelchair_accessible"
```

Calendar.txt has the following data:

```
"service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"
```

Not all services run on all days. Service worker looks at trips data to find the service id, and at calendar data to find if the service runs on that particular day.