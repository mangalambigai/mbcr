'use strict';

/**
 * @ngdoc object
 * @name mbtaApp
 *
 * @description
 * Angular app
 *
 */
 angular.module('mbta', [])

/**
 * @ngdoc controller
 * @name ScheduleController
 *
 * @description
 * Controller for index.html
 *
 */
.controller('ScheduleController', function($scope) {
    var scheduleList = this;

/**
 * Initializes the variables
 */
    $scope.init = function() {
        $scope.scheduleAvailable = false;
        $scope.schedules = [];
        $scope.maxHours = 2;
    };

/**
 * Gets the schedule from departure station to destination station for the next maxHours
 */
    $scope.getSchedule = function() {
        $scope.scheduleAvailable = false;
        $scope.schedules = [];
        $scope.scheduleCount = 0;
        if ($scope.depStation && $scope.destStation)
            $scope.getTripsByStation($scope.depStation, $scope.destStation, $scope.maxHours);
    };

/**
 * Fetches the trips from depStation for next maxHours and then displays them
 */
    $scope.getTripsByStation = function(depStation, destStation, maxHours) {
        //Fetch all the trips from depStation for the next maxHours
        fetch(
            'http://realtime.mbta.com/developer/api/v2/schedulebystop?api_key=xGeHtAQ3kk2mYyhD4fO8rw&stop=' +
            depStation + '&max_time=' + maxHours * 60, {
                method: 'GET'
            }).then(function(response) {
            return response.json();
        }).catch(function(error) {
            console.log(error);
        }).then(function(trips) {
            var tripids = [];
            if (trips.fromIDB)
            {
                //this data is from serviceworker and indexeddb - it is flatter
                trips.tripIds.forEach(function(trip) {
                    tripids.push(trip.tripName);
                });
                console.log('IDB trips in app.js',trips);
            }
            else
            {

                trips.mode.forEach(function(mode) {
                    mode.route.forEach(function(route) {
                        route.direction.forEach(function(direction) {
                            direction.trip.forEach(function(trip) {
                                //store the tripIds
                                tripids.push(trip.trip_id);
                            });
                        });
                    });
                });
            }
            //get the train schedule for the trips,
            //if they go to destination station, display them
            Promise.all(tripids.map($scope.getScheduleByTrip))
            .then(function(response) {
                $scope.displaySchedules(response, depStation, destStation, maxHours);
            })
            .catch(function(error) {
                console.log(error);
            });
        });
    };

    /**
     * Gets the schedule for a particular trip
     */
    $scope.getScheduleByTrip = function(trip) {
        return fetch('http://realtime.mbta.com/developer/api/v2/schedulebytrip?' +
            'api_key=xGeHtAQ3kk2mYyhD4fO8rw&trip=' + trip, {
                method: 'GET'
            }).then(function(response) {
            return response.json();
        });
    };

    /**
     * Displays the stop names, arrival and departure times
     * for the trips that go from departure to destination station
     */
    $scope.displaySchedules = function(schedules, depStation, destStation, maxHours) {

        console.log('from displaySchedules in app.js..',schedules );
        schedules.forEach(function(schedule) {
            var foundStart = false,
                foundStop = false;
            var stops = [];

            angular.forEach(schedule.stop, function(stop) {

                if (stop.stop_name === depStation)
                    foundStart = true;

                //only display the stations between starting and destination
                if (foundStart && !foundStop) {

                    if (stop.stop_name === destStation)
                        foundStop = true;

                    var arrTime = new Date(0);
                    arrTime.setUTCSeconds(stop.sch_arr_dt);

                    var depTime = new Date(0);
                    depTime.setUTCSeconds(stop.sch_dep_dt);

                    stops.push({
                        stop_name: stop.stop_name,
                        sch_arr_dt: arrTime.toLocaleTimeString(),
                        sch_dep_dt: depTime.toLocaleTimeString()
                    });
                }
            });

            //Display the trip only if it goes to the destination station
            if (foundStop) {
                $scope.$apply(function() {
                    $scope.schedules.push({
                        route_name: schedule.route_name,
                        trip_name: schedule.trip_name,
                        direction_name: schedule.direction_name,
                        stops: stops
                    });
                });
            }
        });
        $scope.$apply(function() {
            $scope.scheduleDepStation = $scope.depStation;
            $scope.scheduleDestStation = $scope.destStation;
            $scope.scheduleMaxHours = $scope.maxHours;
            $scope.scheduleCount = $scope.schedules.length;
            $scope.scheduleAvailable = true;
        });
    };

})

/**
 * @ngdoc controller
 * @name ServiceController
 *
 * @description
 * Controller for service worker and its updates
 */
.controller('ServiceController', function($scope) {

    /**
     * Starts the service worker
     */
    $scope.init = function() {
        $scope.newversion = false;
        if (!navigator.serviceWorker) return;

        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            if (!navigator.serviceWorker.controller) {
                return;
            }

            if (reg.waiting) {
                $scope.updateReady(reg.waiting);
                return;
            }

            if (reg.installing) {
                $scope.trackInstalling(reg.installing);
                return;
            }

            reg.addEventListener('updatefound', function() {
                $scope.trackInstalling(reg.installing);
            });
        });
        // Ensure refresh is only called once.
        // This works around a bug in "force update on reload".
        var refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    };

    /**
     * When a worker is installed, display prompt
     */
    $scope.trackInstalling = function(worker) {
        worker.addEventListener('statechange', function() {
            if (worker.state == 'installed') {
                $scope.updateReady(worker);
            }
        });
    };


    /**
     * When a worker is installed, display prompt
     */
    $scope.updateReady = function(worker) {
        $scope.$apply(function() {
            $scope.readyWorker = worker;
            $scope.newUpdateReady = true;
        });
    };

    /**
     * When user wants to upgrade, tell the worker to skip waiting
     */
    $scope.update = function() {
        $scope.readyWorker.postMessage({
            action: 'skipWaiting'
        });
    };

});