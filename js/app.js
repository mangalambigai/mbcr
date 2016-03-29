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
        $scope.error = '';
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
        fetch( 'https://mbta-cr.appspot.com/schedulebystop?&stop=' +
            depStation + '&max_time=' + maxHours * 60, {
                method: 'GET'
        }).then(function(response) {
            if (response.status == 200)
                return response.json();
            else
            {
                console.log('received status code '+response.status);
//404 means station not found
                $scope.$apply(function() {
                    if (response.status == 404)
                    {
                        $scope.error = 'Cannot find this station. Please check the spelling.';
                    }
                    else
                    {
                        $scope.error = 'Received error code '+response.status + ' from the server';
                    }
                });
            }
        }).catch(function(error) {
            console.log(error);
        }).then(function(trips) {

            if (!trips)
                return;
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
            }).then(function() {

                //get the realtime prediction for the trips,
                return Promise.all($scope.schedules.map($scope.getPredictionsByTrip))
            }).then(function(response) {
                $scope.$apply(function(){
                    $scope.displayPredictions(response);
                });
            });



        });
    };

    /**
     * Gets the schedule for a particular trip
     */
    $scope.getScheduleByTrip = function(trip) {
        return fetch('https://mbta-cr.appspot.com/schedulebytrip?' +
            'trip=' + trip, {
                method: 'GET'
            }).then(function(response) {
            return response.json();
        });
    };

    /**
     * Gets the prediction for a particular trip
     */
    $scope.getPredictionsByTrip = function(schedule) {
        return fetch('https://mbta-cr.appspot.com/predictionsbytrip?trip='
            + schedule.trip_id, {
                method: 'GET'
        }).then(function(response) {
            if (response.status==200)
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

                if (stop.stop_name.toUpperCase() === depStation.toUpperCase())
                    foundStart = true;

                //only display the stations between starting and destination
                if (foundStart && !foundStop) {

                    if (stop.stop_name.toUpperCase() === destStation.toUpperCase())
                        foundStop = true;

                    //MBTA API responds in seconds since 1970 Jan 1.
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
                        trip_id: schedule.trip_id,
                        route_id: schedule.route_id,
                        direction_name: schedule.direction_name,
                        stops: stops
                    });
                });

                //send a message to service worker to cache the route
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        action: 'cacheRoute',
                        route_id: schedule.route_id
                    });
                }

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

    /**
     * Adds the prediction response to the displayed schedule.
     */
    $scope.displayPredictions = function(response) {
        if (!response)
            return;
        console.log('displayPredictions', response);

        //response has a list of trips' predictions
        response.forEach(function(trip){

            ///We only get predictions for trips in next one hour.
            ///This data is not available for other trips.
            if (trip) {

                //find the trip in schedules
                var scheduleTrip = $scope.schedules.find(function (s_trip) {
                    return s_trip.trip_id === trip.trip_id;
                });

                if (scheduleTrip) {
                    trip.stop.forEach(function(predictionStop) {
                        var schedulestop = scheduleTrip.stops.find(function(s_stop) {
                            return s_stop.stop_name === predictionStop.stop_name;
                        });
                        //schedule only has the stops between the 2 stations.
                        //prediction has stops before departure and beyond destination.
                        if (schedulestop ){
                            var predTime = new Date(0);
                            predTime.setUTCSeconds(predictionStop.pre_dt);
                            schedulestop.prediction = predTime.toLocaleTimeString();
                        }
                    });

                }
            }
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

        var swpath=window.location.pathname+'sw.js';

        console.log('pathname: ' + swpath);

        navigator.serviceWorker.register(swpath).then(function(reg) {
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