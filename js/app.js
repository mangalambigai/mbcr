'use strict';

angular.module('mbta', [])

.controller('ScheduleController', function($scope) {
    var scheduleList = this;

    $scope.init = function() {
        $scope.schedules=[];
        $scope.maxHours = 2;
    };

    $scope.getSchedule = function() {
        if ($scope.depStation && $scope.destStation)
            $scope.getTripsByStation($scope.depStation, $scope.destStation, $scope.maxHours);
    }

    $scope.getTripsByStation = function(depStation, destStation, maxHours) {
        fetch(
            'http://realtime.mbta.com/developer/api/v2/schedulebystop?api_key=xGeHtAQ3kk2mYyhD4fO8rw&stop=' +
            depStation + '&max_time=' + maxHours*60, {
                method: 'GET'
            }).then(function (response) {
            return response.json();
        }).catch(function (error) {
            console.log(error);
        }).then(function (trips) {

            var tripids=[];
            trips.mode.forEach(function (mode) {
                mode.route.forEach(function (route) {
                    route.direction.forEach(function (direction) {
                        direction.trip.forEach(function (trip) {
                            tripids.push(trip.trip_id);
                        });
                    });
                });
            });

            Promise.all(tripids.map($scope.getScheduleByTrip))
            .then(function(response){
                $scope.displaySchedules(response, depStation, destStation, maxHours);
            })
            .catch(function (error) {
                console.log(error);
            });
        });
    }

    $scope.getScheduleByTrip = function (trip) {
        return fetch('http://realtime.mbta.com/developer/api/v2/schedulebytrip?' +
            'api_key=xGeHtAQ3kk2mYyhD4fO8rw&trip=' + trip, {
                method: 'GET'
        }).then(function (response) {
            return response.json();
        });
    };

    $scope.displaySchedules = function(schedules, depStation, destStation, maxHours) {
        schedules.forEach(function (schedule) {
            var foundStart = false,
                foundStop = false;
            var stops=[];
            angular.forEach(schedule.stop, function (stop) {
                if (stop.stop_name === depStation)
                    foundStart = true;

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
                        sch_dep_dt: depTime.toLocaleTimeString()});
                }
            });

            if (foundStop) {
                $scope.$apply(function () {
                    $scope.schedules.push({route_name: schedule.route_name,
                    trip_name: schedule.trip_name,
                    direction_name: schedule.direction_name,
                    stops: stops});
                });
            }
        });
    }

})

.controller('ServiceController', function($scope) {
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

    $scope.trackInstalling = function(worker) {
        worker.addEventListener('statechange', function() {
            if (worker.state == 'installed') {
              $scope.updateReady(worker);
            }
        });
    };

    $scope.updateReady = function(worker) {
        $scope.$apply(function() {
            $scope.readyWorker = worker;
            $scope.newUpdateReady = true;
        });
    };

    $scope.update = function() {
        $scope.readyWorker.postMessage({action: 'skipWaiting'});
    };

});


